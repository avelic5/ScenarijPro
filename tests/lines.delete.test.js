/**
 * DELETE /api/scenarios/:scenarioId/lines/:lineId testovi (Jest + Supertest)
 */

const path = require("path");
const fs = require("fs");
const request = require("supertest");

let app;
let sequelize;
let Line;

const TEST_DATA_DIR = path.join(__dirname, ".data_delete_line");

function rmDirSafe(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function mkDirSafe(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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

describe("DELETE /api/scenarios/:scenarioId/lines/:lineId", () => {
  beforeEach(async () => {
    rmDirSafe(TEST_DATA_DIR);
    mkDirSafe(TEST_DATA_DIR);

    jest.resetModules();
    process.env.NODE_ENV = "test";
    process.env.DATA_DIR = TEST_DATA_DIR;

    app = require("../index");
    const models = require("../models");
    sequelize = models.sequelize;
    Line = models.Line;

    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    rmDirSafe(TEST_DATA_DIR);
    if (sequelize) {
      await sequelize.close();
    }
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

    const content = await getScenarioContent(scenarioId);
    const byId = new Map(content.map((l) => [l.lineId, l]));

    expect(byId.has(2)).toBe(false);
    expect(byId.has(1)).toBe(true);

    const l1 = byId.get(1);
    // linija 1 mora sada pokazivati na ono što je bilo iza linije 2
    expect([null, 3]).toContain(l1.nextLineId);
  });

  test("404 - Scenario ne postoji", async () => {
    const agent = request(app);

    const res = await agent
      .delete("/api/scenarios/999/lines/1")
      .send({ userId: 1 });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Scenario ne postoji!" });
  });

  test("404 - Linija ne postoji", async () => {
    const agent = request(app);
    const scenarioId = await createScenario(agent, "S1");

    const res = await agent
      .delete(`/api/scenarios/${scenarioId}/lines/999`)
      .send({ userId: 1 });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Linija ne postoji!" });
  });

  test("409 - Linija nije zakljucana", async () => {
    const agent = request(app);
    const scenarioId = await createScenario(agent, "S1");

    // Dodaj drugu liniju da možemo obrisati
    await agent
      .post(`/api/scenarios/${scenarioId}/lines/1/lock`)
      .send({ userId: 1 })
      .expect(200);

    await agent
      .put(`/api/scenarios/${scenarioId}/lines/1`)
      .send({ userId: 1, newText: ["Linija1", "Linija2"] })
      .expect(200);

    // Pokušaj obrisati bez locka
    const res = await agent
      .delete(`/api/scenarios/${scenarioId}/lines/2`)
      .send({ userId: 1 });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "Linija nije zakljucana!" });
  });
});
