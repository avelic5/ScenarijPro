const path = require("path");
const fs = require("fs");
const request = require("supertest");

let app;

const TEST_DATA_DIR = path.join(__dirname, ".data_character_lock");

function rmDirSafe(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function mkDirSafe(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJsonSafe(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function charLocksPath() {
  return path.join(TEST_DATA_DIR, "character-locks.json");
}

async function createScenario(agent, title = "S") {
  const res = await agent.post("/api/scenarios").send({ title }).expect(200);
  return res.body.id;
}

describe("POST /api/scenarios/:scenarioId/characters/lock", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.NODE_ENV = "test";
    process.env.DATA_DIR = TEST_DATA_DIR;

    rmDirSafe(TEST_DATA_DIR);
    mkDirSafe(TEST_DATA_DIR);

    app = require("../index");
  });

  afterAll(() => {
    rmDirSafe(TEST_DATA_DIR);
  });

  test("404 - Scenario ne postoji", async () => {
    const res = await request(app)
      .post("/api/scenarios/999/characters/lock")
      .send({ userId: 1, characterName: "ALICE" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Scenario ne postoji!" });
  });

  test("400 - Neispravno ime lika (mora biti uppercase + razmaci)", async () => {
    const agent = request(app);
    const scenarioId = await createScenario(agent, "S1");

    const res = await agent
      .post(`/api/scenarios/${scenarioId}/characters/lock`)
      .send({ userId: 1, characterName: "Alice" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Neispravno ime lika" });
  });

  test("200 - Zaključava ime lika ako nije zaključano", async () => {
    const agent = request(app);
    const scenarioId = await createScenario(agent, "S1");

    const res = await agent
      .post(`/api/scenarios/${scenarioId}/characters/lock`)
      .send({ userId: 1, characterName: "ALICE" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Ime lika je uspjesno zakljucano!" });

    const locks = readJsonSafe(charLocksPath(), []);
    expect(Array.isArray(locks)).toBe(true);
    expect(locks.find((l) => l && l.scenarioId === scenarioId && l.characterName === "ALICE" && l.userId === 1)).toBeTruthy();
  });

  test("409 - Konflikt ako je ime već zaključano (drugi user)", async () => {
    const agent = request(app);
    const scenarioId = await createScenario(agent, "S1");

    await agent
      .post(`/api/scenarios/${scenarioId}/characters/lock`)
      .send({ userId: 1, characterName: "ALICE" })
      .expect(200);

    const res = await agent
      .post(`/api/scenarios/${scenarioId}/characters/lock`)
      .send({ userId: 2, characterName: "ALICE" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "Konflikt! Ime lika je vec zakljucano!" });
  });

  test("Lock je izolovan po scenariju: isti name u drugom scenariju treba proći", async () => {
    const agent = request(app);
    const s1 = await createScenario(agent, "S1");
    const s2 = await createScenario(agent, "S2");

    await agent
      .post(`/api/scenarios/${s1}/characters/lock`)
      .send({ userId: 1, characterName: "ALICE" })
      .expect(200);

    const res = await agent
      .post(`/api/scenarios/${s2}/characters/lock`)
      .send({ userId: 2, characterName: "ALICE" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Ime lika je uspjesno zakljucano!" });
  });
});
