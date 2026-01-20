/**
 * PUT /api/scenarios/:scenarioId/lines/:lineId testovi (Jest + Supertest)
 */

const path = require("path");
const fs = require("fs");
const request = require("supertest");

let app;
let sequelize;
let Line;
let Delta;

const TEST_DATA_DIR = path.join(__dirname, ".data_put_update_line");
const fixedNowMs = 1735536000000;
const fixedUnixSeconds = Math.floor(fixedNowMs / 1000);

function rmDirSafe(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function mkDirSafe(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function makeWords(n, prefix = "w") {
  return Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`).join(" ");
}

async function createScenario(agent, title = "S") {
  const res = await agent.post("/api/scenarios").send({ title }).expect(200);
  return { scenarioId: res.body.id, firstLineId: res.body.content?.[0]?.lineId ?? 1 };
}

function lockLine(agent, scenarioId, lineId, userId) {
  return agent.post(`/api/scenarios/${scenarioId}/lines/${lineId}/lock`).send({ userId });
}

async function getScenarioContent(scenarioId) {
  const lines = await Line.findAll({
    where: { scenarioId },
    order: [['lineId', 'ASC']],
  });
  return lines.map(l => ({
    lineId: l.lineId,
    nextLineId: l.nextLineId,
    text: l.text,
  }));
}

async function getDeltas(scenarioId) {
  const deltas = await Delta.findAll({
    where: { scenarioId },
    order: [['timestamp', 'ASC']],
  });
  return deltas.map(d => ({
    type: d.type,
    lineId: d.lineId,
    nextLineId: d.nextLineId,
    content: d.content,
    timestamp: d.timestamp,
  }));
}

describe("PUT /api/scenarios/:scenarioId/lines/:lineId", () => {
  beforeEach(async () => {
    jest.spyOn(Date, "now").mockReturnValue(fixedNowMs);

    rmDirSafe(TEST_DATA_DIR);
    mkDirSafe(TEST_DATA_DIR);

    jest.resetModules();
    process.env.NODE_ENV = "test";
    process.env.DATA_DIR = TEST_DATA_DIR;

    app = require("../index");
    const models = require("../models");
    sequelize = models.sequelize;
    Line = models.Line;
    Delta = models.Delta;

    await sequelize.sync({ force: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    rmDirSafe(TEST_DATA_DIR);
    if (sequelize) {
      await sequelize.close();
    }
  });

  test("404 - Scenario ne postoji", async () => {
    const res = await request(app)
      .put("/api/scenarios/999/lines/1")
      .send({ userId: 1, newText: ["Test"] });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Scenario ne postoji!" });
  });

  test("404 - Linija ne postoji", async () => {
    const agent = request(app);
    const { scenarioId } = await createScenario(agent, "S1");

    const res = await agent
      .put(`/api/scenarios/${scenarioId}/lines/999`)
      .send({ userId: 1, newText: ["Test"] });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Linija ne postoji!" });
  });

  test("409 - Linija nije zakljucana", async () => {
    const agent = request(app);
    const { scenarioId, firstLineId } = await createScenario(agent, "S1");

    const res = await agent
      .put(`/api/scenarios/${scenarioId}/lines/${firstLineId}`)
      .send({ userId: 1, newText: ["Test"] });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "Linija nije zakljucana!" });
  });

  test("409 - Linija zakljucana od drugog korisnika", async () => {
    const agent = request(app);
    const { scenarioId, firstLineId } = await createScenario(agent, "S1");

    await lockLine(agent, scenarioId, firstLineId, 1).expect(200);

    const res = await agent
      .put(`/api/scenarios/${scenarioId}/lines/${firstLineId}`)
      .send({ userId: 2, newText: ["Test"] });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "Linija je vec zakljucana!" });
  });

  test("200 - Uspješno ažurira liniju", async () => {
    const agent = request(app);
    const { scenarioId, firstLineId } = await createScenario(agent, "S1");

    await lockLine(agent, scenarioId, firstLineId, 1).expect(200);

    const res = await agent
      .put(`/api/scenarios/${scenarioId}/lines/${firstLineId}`)
      .send({ userId: 1, newText: ["Novi tekst"] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Linija je uspjesno azurirana!" });

    const content = await getScenarioContent(scenarioId);
    expect(content.find(l => l.lineId === firstLineId).text).toBe("Novi tekst");
  });

  test("200 - Wrap: 45 riječi => 3 linije (20,20,5)", async () => {
    const agent = request(app);
    const { scenarioId, firstLineId } = await createScenario(agent, "Wrap");

    // Dodaj drugu liniju da testiramo nextLineId
    await lockLine(agent, scenarioId, firstLineId, 1).expect(200);
    await agent
      .put(`/api/scenarios/${scenarioId}/lines/${firstLineId}`)
      .send({ userId: 1, newText: ["Linija1", "Linija2"] });

    // Dohvati content nakon wrap-a
    let content = await getScenarioContent(scenarioId);
    const secondLineId = content.find(l => l.lineId !== firstLineId)?.lineId;

    // Zaključaj prvu liniju za novi update
    await lockLine(agent, scenarioId, firstLineId, 1).expect(200);

    const longText = makeWords(45);
    const res = await agent
      .put(`/api/scenarios/${scenarioId}/lines/${firstLineId}`)
      .send({ userId: 1, newText: [longText] });

    expect(res.status).toBe(200);

    content = await getScenarioContent(scenarioId);
    expect(content.length).toBeGreaterThanOrEqual(3);
  });

  test("Delta append: uspješan update upisuje line_update i timestamp", async () => {
    const agent = request(app);
    const { scenarioId, firstLineId } = await createScenario(agent, "Delta");

    await lockLine(agent, scenarioId, firstLineId, 1).expect(200);
    await agent
      .put(`/api/scenarios/${scenarioId}/lines/${firstLineId}`)
      .send({ userId: 1, newText: ["Updated"] })
      .expect(200);

    const deltas = await getDeltas(scenarioId);
    expect(deltas.length).toBeGreaterThanOrEqual(1);
    
    const lastDelta = deltas[deltas.length - 1];
    expect(lastDelta.type).toBe("line_update");
    expect(lastDelta.timestamp).toBe(fixedUnixSeconds);
  });

  test("Prazni stringovi u newText su dozvoljeni", async () => {
    const agent = request(app);
    const { scenarioId, firstLineId } = await createScenario(agent, "Empty");

    await lockLine(agent, scenarioId, firstLineId, 1).expect(200);
    const res = await agent
      .put(`/api/scenarios/${scenarioId}/lines/${firstLineId}`)
      .send({ userId: 1, newText: [""] });

    expect(res.status).toBe(200);

    const content = await getScenarioContent(scenarioId);
    expect(content.find(l => l.lineId === firstLineId).text).toBe("");
  });
});
