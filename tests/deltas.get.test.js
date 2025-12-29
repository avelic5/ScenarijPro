const path = require("path");
const fs = require("fs");
const request = require("supertest");

// Express app entrypoint (exports app, does not listen when required)
const APP_PATH = "../index";

const TEST_DATA_DIR = path.join(__dirname, ".data_deltas_tests");
const DELTAS_PATH = path.join(TEST_DATA_DIR, "deltas.json");

function rmDirSafe(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}
function mkDirSafe(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
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

async function createScenario(agent, title = "S") {
  const res = await agent.post("/api/scenarios").send({ title }).expect(200);
  return res.body.id;
}

/**
 * Seed deltas.json u očekivanom formatu.
 * Ovo je “source of truth” za testiranje filter/sort logike.
 */
function seedDeltasFile(entries) {
  // U ovom projektu deltas.json je top-level niz (array)
  writeJson(DELTAS_PATH, entries);
}

describe("GET /api/scenarios/:scenarioId/deltas?since=", () => {
  let app;

  beforeAll(() => {
    process.env.NODE_ENV = "test";
    process.env.DATA_DIR = TEST_DATA_DIR;

    rmDirSafe(TEST_DATA_DIR);
    mkDirSafe(TEST_DATA_DIR);

    app = reloadApp();
  });

  beforeEach(() => {
    rmDirSafe(TEST_DATA_DIR);
    mkDirSafe(TEST_DATA_DIR);

    // napravi prazan deltas.json da rute ne pucaju ako očekuju fajl
    seedDeltasFile([]);

    app = reloadApp();
  });

  afterAll(() => {
    rmDirSafe(TEST_DATA_DIR);
  });

  test("1) 404: Scenario ne postoji", async () => {
    const agent = request(app);

    const res = await agent.get("/api/scenarios/9999/deltas?since=0").expect(404);

    expect(res.headers["content-type"]).toMatch(/application\/json/i);
    expect(res.body).toEqual({ message: "Scenario ne postoji!" });
  });

  test("2) 200: Nema promjena -> vraća praznu listu", async () => {
    const agent = request(app);
    const scenarioId = await createScenario(agent, "Empty deltas");

    const res = await agent
      .get(`/api/scenarios/${scenarioId}/deltas?since=0`)
      .expect(200);

    expect(res.headers["content-type"]).toMatch(/application\/json/i);
    expect(res.body).toHaveProperty("deltas");
    expect(Array.isArray(res.body.deltas)).toBe(true);
    expect(res.body.deltas).toHaveLength(0);
  });

  test("3) 200: Filtrira samo timestamp > since (strogo veće)", async () => {
    const agent = request(app);
    const scenarioId = await createScenario(agent, "Filter test");

    // Seed: NAMJERNO nesortirano + includes equal case
    const entries = [
      { scenarioId, type: "line_update", lineId: 5, nextLineId: 6, content: "A", timestamp: 200 },
      { scenarioId, type: "char_rename", oldName: "ALICE", newName: "ALICIA", timestamp: 150 },
      { scenarioId, type: "line_update", lineId: 1, nextLineId: 2, content: "B", timestamp: 150 }, // jednako since
      { scenarioId, type: "char_rename", oldName: "BOB", newName: "ROB", timestamp: 100 },
      // delta za neki drugi scenario (ne smije se vratiti)
      { scenarioId: scenarioId + 1, type: "char_rename", oldName: "X", newName: "Y", timestamp: 999 }
    ];

    seedDeltasFile(entries);

    // reload da server pokupi seed (ako čita fajl na startu)
    app = reloadApp();
    const agent2 = request(app);

    const since = 150;
    const res = await agent2
      .get(`/api/scenarios/${scenarioId}/deltas?since=${since}`)
      .expect(200);

    expect(res.headers["content-type"]).toMatch(/application\/json/i);

    const out = res.body.deltas;
    expect(Array.isArray(out)).toBe(true);

    // mora vratiti samo timestamp > 150 => samo timestamp 200 (i samo za ovaj scenario)
    expect(out).toHaveLength(1);
    expect(out[0].timestamp).toBe(200);
  });

  test("4) 200: Sortira rastuće po timestamp (i vraća oba tipa)", async () => {
    const agent = request(app);
    const scenarioId = await createScenario(agent, "Sort test");

    const entries = [
      { scenarioId, type: "line_update", lineId: 5, nextLineId: 6, content: "Novi tekst", timestamp: 1715692050 },
      { scenarioId, type: "char_rename", oldName: "ALICE", newName: "ALICIA", timestamp: 1715692100 },
      { scenarioId, type: "line_update", lineId: 2, nextLineId: 3, content: "X", timestamp: 1715691000 }
    ];

    // namjerno shuffle
    seedDeltasFile([entries[1], entries[0], entries[2]]);

    app = reloadApp();
    const agent2 = request(app);

    const res = await agent2
      .get(`/api/scenarios/${scenarioId}/deltas?since=0`)
      .expect(200);

    expect(res.headers["content-type"]).toMatch(/application\/json/i);

    const out = res.body.deltas;
    expect(out).toHaveLength(3);

    const timestamps = out.map((d) => d.timestamp);
    expect(timestamps).toEqual([1715691000, 1715692050, 1715692100]);

    // provjeri da ima oba tipa
    const types = out.map((d) => d.type);
    expect(types).toContain("line_update");
    expect(types).toContain("char_rename");

    // (prema specifikaciji odgovora) objekti ne moraju sadržati scenarioId
    // ali moraju sadržati tip + timestamp i ostala polja po tipu
    const line = out.find((d) => d.type === "line_update");
    expect(line).toHaveProperty("lineId");
    expect(line).toHaveProperty("nextLineId");
    expect(line).toHaveProperty("content");

    const rename = out.find((d) => d.type === "char_rename");
    expect(rename).toHaveProperty("oldName");
    expect(rename).toHaveProperty("newName");
  });

  test("5) 200: since veći od svih timestampova -> prazno", async () => {
    const agent = request(app);
    const scenarioId = await createScenario(agent, "Since too large");

    seedDeltasFile([
      { scenarioId, type: "char_rename", oldName: "A", newName: "B", timestamp: 10 },
      { scenarioId, type: "line_update", lineId: 1, nextLineId: null, content: "Hi", timestamp: 20 },
    ]);

    app = reloadApp();
    const agent2 = request(app);

    const res = await agent2
      .get(`/api/scenarios/${scenarioId}/deltas?since=99999`)
      .expect(200);

    expect(res.headers["content-type"]).toMatch(/application\/json/i);
    expect(res.body).toHaveProperty("deltas");
    expect(res.body.deltas).toEqual([]);
  });

  test("6) (Opciono) since fali ili je nevalidan -> preporuka: tretiraj kao 0 ili vrati 400 (tolerantno)", async () => {
    const agent = request(app);
    const scenarioId = await createScenario(agent, "since optional");

    seedDeltasFile([
      { scenarioId, type: "char_rename", oldName: "A", newName: "B", timestamp: 10 },
    ]);

    app = reloadApp();
    const agent2 = request(app);

    const r1 = await agent2.get(`/api/scenarios/${scenarioId}/deltas`);
    expect([200, 400]).toContain(r1.status);
    expect(r1.headers["content-type"]).toMatch(/application\/json/i);

    const r2 = await agent2.get(`/api/scenarios/${scenarioId}/deltas?since=abc`);
    expect([200, 400]).toContain(r2.status);
    expect(r2.headers["content-type"]).toMatch(/application\/json/i);
  });
});
