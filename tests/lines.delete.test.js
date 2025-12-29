const path = require("path");
const fs = require("fs");
const request = require("supertest");

const APP_PATH = "../index";

const TEST_DATA_DIR = path.join(__dirname, ".data_delete_line");

function rmDirSafe(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}
function mkDirSafe(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function reloadApp() {
  jest.resetModules();
  process.env.NODE_ENV = "test";
  process.env.DATA_DIR = TEST_DATA_DIR;
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require(APP_PATH);
}

function getScenarioFilePath(scenarioId) {
  return path.join(TEST_DATA_DIR, "scenarios", `scenario-${scenarioId}.json`);
}

describe("DELETE /api/scenarios/:scenarioId/lines/:lineId", () => {
  let app;

  beforeEach(() => {
    rmDirSafe(TEST_DATA_DIR);
    mkDirSafe(TEST_DATA_DIR);
    mkDirSafe(path.join(TEST_DATA_DIR, "scenarios"));
    app = reloadApp();
  });

  afterAll(() => {
    rmDirSafe(TEST_DATA_DIR);
  });

  async function createScenario(agent, title = "S") {
    const res = await agent.post("/api/scenarios").send({ title }).expect(200);
    return res.body.id;
  }

  test("ne dozvoljava brisanje zadnje linije", async () => {
    const agent = request(app);
    const scenarioId = await createScenario(agent, "One line");

    await agent
      .post(`/api/scenarios/${scenarioId}/lines/1/lock`)
      .send({ userId: 1 })
      .expect(200);

    const res = await agent
      .delete(`/api/scenarios/${scenarioId}/lines/1`)
      .send({ userId: 1 })
      .expect(400);

    expect(res.body).toHaveProperty("message");
  });

  test("briše liniju i prevezuje nextLineId", async () => {
    const agent = request(app);
    const scenarioId = await createScenario(agent, "Wrap");

    // napravi 3 linije preko updateLine
    await agent
      .post(`/api/scenarios/${scenarioId}/lines/1/lock`)
      .send({ userId: 1 })
      .expect(200);

    await agent
      .put(`/api/scenarios/${scenarioId}/lines/1`)
      .send({ userId: 1, newText: ["w1 w2 w3 w4 w5 w6 w7 w8 w9 w10 w11 w12 w13 w14 w15 w16 w17 w18 w19 w20 w21"] })
      .expect(200);

    // lock line 2 (user može imati samo jedan lock)
    await agent
      .post(`/api/scenarios/${scenarioId}/lines/2/lock`)
      .send({ userId: 1 })
      .expect(200);

    await agent
      .delete(`/api/scenarios/${scenarioId}/lines/2`)
      .send({ userId: 1 })
      .expect(200);

    const scenario = readJson(getScenarioFilePath(scenarioId));
    const byId = new Map(scenario.content.map((l) => [l.lineId, l]));

    expect(byId.has(2)).toBe(false);
    expect(byId.has(1)).toBe(true);

    const l1 = byId.get(1);
    // linija 1 mora sada pokazivati na ono što je bilo iza linije 2
    expect([null, 3]).toContain(l1.nextLineId);
  });
});
