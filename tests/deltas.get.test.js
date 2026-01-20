/**
 * GET /api/scenarios/:scenarioId/deltas testovi (Jest + Supertest)
 */

const path = require("path");
const fs = require("fs");
const request = require("supertest");

let app;
let sequelize;
let Delta;

const TEST_DATA_DIR = path.join(__dirname, ".data_deltas_tests");

function rmDirSafe(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function mkDirSafe(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function createScenario(agent, title = "S") {
  const res = await agent.post("/api/scenarios").send({ title }).expect(200);
  return res.body.id;
}

async function seedDeltas(entries) {
  for (const entry of entries) {
    await Delta.create({
      scenarioId: entry.scenarioId,
      type: entry.type,
      lineId: entry.lineId || null,
      nextLineId: entry.nextLineId || null,
      content: entry.content || null,
      oldName: entry.oldName || null,
      newName: entry.newName || null,
      timestamp: entry.timestamp,
    });
  }
}

describe("GET /api/scenarios/:scenarioId/deltas?since=", () => {
  beforeAll(() => {
    process.env.NODE_ENV = "test";
    process.env.DATA_DIR = TEST_DATA_DIR;

    rmDirSafe(TEST_DATA_DIR);
    mkDirSafe(TEST_DATA_DIR);
  });

  beforeEach(async () => {
    rmDirSafe(TEST_DATA_DIR);
    mkDirSafe(TEST_DATA_DIR);

    jest.resetModules();
    process.env.NODE_ENV = "test";
    process.env.DATA_DIR = TEST_DATA_DIR;

    app = require("../index");
    const models = require("../models");
    sequelize = models.sequelize;
    Delta = models.Delta;

    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    rmDirSafe(TEST_DATA_DIR);
    if (sequelize) {
      await sequelize.close();
    }
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

    // Seed delta zapise direktno u bazu
    await seedDeltas([
      { scenarioId, type: "line_update", lineId: 1, content: "a", timestamp: 100 },
      { scenarioId, type: "line_update", lineId: 2, content: "b", timestamp: 200 },
      { scenarioId, type: "line_update", lineId: 3, content: "c", timestamp: 300 },
    ]);

    const res = await agent
      .get(`/api/scenarios/${scenarioId}/deltas?since=100`)
      .expect(200);

    expect(res.body.deltas).toHaveLength(2);
    expect(res.body.deltas[0].timestamp).toBe(200);
    expect(res.body.deltas[1].timestamp).toBe(300);
  });

  test("4) 200: Deltas su sortirane po timestamp (ascending)", async () => {
    const agent = request(app);
    const scenarioId = await createScenario(agent, "Sort test");

    await seedDeltas([
      { scenarioId, type: "line_update", lineId: 3, content: "c", timestamp: 300 },
      { scenarioId, type: "line_update", lineId: 1, content: "a", timestamp: 100 },
      { scenarioId, type: "line_update", lineId: 2, content: "b", timestamp: 200 },
    ]);

    const res = await agent
      .get(`/api/scenarios/${scenarioId}/deltas?since=0`)
      .expect(200);

    expect(res.body.deltas).toHaveLength(3);
    expect(res.body.deltas[0].timestamp).toBe(100);
    expect(res.body.deltas[1].timestamp).toBe(200);
    expect(res.body.deltas[2].timestamp).toBe(300);
  });

  test("5) 200: char_rename delta ima oldName i newName", async () => {
    const agent = request(app);
    const scenarioId = await createScenario(agent, "Char rename");

    await seedDeltas([
      { scenarioId, type: "char_rename", oldName: "ALICE", newName: "ALICIA", timestamp: 500 },
    ]);

    const res = await agent
      .get(`/api/scenarios/${scenarioId}/deltas?since=0`)
      .expect(200);

    expect(res.body.deltas).toHaveLength(1);
    expect(res.body.deltas[0].type).toBe("char_rename");
    expect(res.body.deltas[0].oldName).toBe("ALICE");
    expect(res.body.deltas[0].newName).toBe("ALICIA");
  });

  test("6) 200: Samo deltas za traženi scenarioId", async () => {
    const agent = request(app);
    const s1 = await createScenario(agent, "S1");
    const s2 = await createScenario(agent, "S2");

    await seedDeltas([
      { scenarioId: s1, type: "line_update", lineId: 1, content: "s1", timestamp: 100 },
      { scenarioId: s2, type: "line_update", lineId: 1, content: "s2", timestamp: 200 },
    ]);

    const res = await agent
      .get(`/api/scenarios/${s1}/deltas?since=0`)
      .expect(200);

    expect(res.body.deltas).toHaveLength(1);
    expect(res.body.deltas[0].content).toBe("s1");
  });
});
