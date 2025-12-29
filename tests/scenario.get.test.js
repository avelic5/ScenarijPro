const path = require("path");
const fs = require("fs");
const request = require("supertest");

// ✅ PROMIJENI putanju do express app-a (mora exportovati app, ne listen)
const APP_PATH = "../index";

const TEST_DATA_DIR = path.join(__dirname, ".data_get_scenario");

function rmDirSafe(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}
function mkDirSafe(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}
function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function reloadApp() {
  jest.resetModules();
  process.env.NODE_ENV = "test";
  process.env.DATA_DIR = TEST_DATA_DIR;
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require(APP_PATH);
}

function getScenarioFilePath(dataDir, scenarioId) {
  return path.join(dataDir, "scenarios", `scenario-${scenarioId}.json`);
}

async function createScenario(agent, title = "S") {
  const res = await agent.post("/api/scenarios").send({ title }).expect(200);
  return res.body.id;
}

/**
 * Seed scenario content na disku: postavi title i content kako ti treba.
 * contentLines: array objekata { lineId, nextLineId, text }
 */
function seedScenarioOnDisk(dataDir, scenarioId, title, contentLines) {
  const filePath = getScenarioFilePath(dataDir, scenarioId);
  const scenario = readJsonSafe(filePath);
  if (!scenario) {
    throw new Error(
      `Ne mogu pročitati scenario file za id=${scenarioId}. Očekujem: ${filePath}`
    );
  }

  scenario.title = title;
  scenario.content = contentLines;
  writeJson(filePath, scenario);
}

describe("GET /api/scenarios/:scenarioId", () => {
  let app;

  beforeAll(() => {
    rmDirSafe(TEST_DATA_DIR);
    mkDirSafe(TEST_DATA_DIR);
    mkDirSafe(path.join(TEST_DATA_DIR, "scenarios"));
    app = reloadApp();
  });

  beforeEach(() => {
    rmDirSafe(TEST_DATA_DIR);
    mkDirSafe(TEST_DATA_DIR);
    mkDirSafe(path.join(TEST_DATA_DIR, "scenarios"));
    app = reloadApp();
  });

  afterAll(() => {
    rmDirSafe(TEST_DATA_DIR);
  });

  test("1) 404: Scenario ne postoji", async () => {
    const agent = request(app);

    const res = await agent.get("/api/scenarios/9999").expect(404);

    expect(res.headers["content-type"]).toMatch(/application\/json/i);
    expect(res.body).toEqual({ message: "Scenario ne postoji!" });
  });

  test("2) 200: Vraća scenario sa title i content", async () => {
    const agent = request(app);
    const scenarioId = await createScenario(agent, "Naslov scenarija");

    const res = await agent.get(`/api/scenarios/${scenarioId}`).expect(200);

    expect(res.headers["content-type"]).toMatch(/application\/json/i);

    expect(res.body).toHaveProperty("id", scenarioId);
    expect(res.body).toHaveProperty("title");
    expect(typeof res.body.title).toBe("string");

    expect(res.body).toHaveProperty("content");
    expect(Array.isArray(res.body.content)).toBe(true);
    expect(res.body.content.length).toBeGreaterThanOrEqual(1);

    // minimalno: prva linija ima lineId/text/nextLineId
    expect(res.body.content[0]).toHaveProperty("lineId");
    expect(res.body.content[0]).toHaveProperty("nextLineId");
    expect(res.body.content[0]).toHaveProperty("text");
  });

  test("3) 200: Content mora biti u ispravnom redoslijedu prema nextLineId (linked-list), čak i ako je u fajlu izmiješan", async () => {
    const agent = request(app);
    const scenarioId = await createScenario(agent, "Linked list order");

    // Namjerno izmiješamo redoslijed u fajlu:
    // 1 -> 3 -> 2 -> null
    const correct = [
      { lineId: 1, nextLineId: 3, text: "Prva linija teksta." },
      { lineId: 3, nextLineId: 2, text: "Treća u lancu." },
      { lineId: 2, nextLineId: null, text: "Zadnja linija." },
    ];
    const shuffled = [correct[2], correct[0], correct[1]];

    seedScenarioOnDisk(TEST_DATA_DIR, scenarioId, "Linked list order", shuffled);

    // reload da server pokupi seed (ako čita na startu / cache-a)
    app = reloadApp();
    const agent2 = request(app);

    const res = await agent2.get(`/api/scenarios/${scenarioId}`).expect(200);

    const out = res.body.content;
    expect(out).toHaveLength(3);

    // očekujemo pravilni redoslijed 1,3,2
    expect(out.map((l) => l.lineId)).toEqual([1, 3, 2]);
    expect(out.map((l) => l.text)).toEqual([
      "Prva linija teksta.",
      "Treća u lancu.",
      "Zadnja linija.",
    ]);

    // i nextLineId odnosi se konzistentno
    expect(out[0].nextLineId).toBe(3);
    expect(out[1].nextLineId).toBe(2);
    expect(out[2].nextLineId).toBeNull();
  });

  test("4) 200: Scenario sa jednom linijom (nextLineId=null) vraća tu jednu liniju", async () => {
    const agent = request(app);
    const scenarioId = await createScenario(agent, "Single line scenario");

    seedScenarioOnDisk(TEST_DATA_DIR, scenarioId, "Single line scenario", [
      { lineId: 1, nextLineId: null, text: "Samo jedna." },
    ]);

    app = reloadApp();
    const agent2 = request(app);

    const res = await agent2.get(`/api/scenarios/${scenarioId}`).expect(200);

    expect(res.body.id).toBe(scenarioId);
    expect(res.body.title).toBe("Single line scenario");
    expect(res.body.content).toEqual([{ lineId: 1, nextLineId: null, text: "Samo jedna." }]);
  });

  test("5) (Opciono) Nevalidan scenarioId param -> 400 ili 404, ali JSON", async () => {
    const agent = request(app);

    const res = await agent.get("/api/scenarios/abc");

    expect([404]).toContain(res.status);
    expect(res.headers["content-type"]).toMatch(/application\/json/i);
    expect(res.body).toHaveProperty("message");
  });
});
