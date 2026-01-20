/**
 * GET /api/scenarios/:scenarioId testovi (Jest + Supertest)
 */

const path = require("path");
const fs = require("fs");
const request = require("supertest");

let app;
let sequelize;
let Line;

const TEST_DATA_DIR = path.join(__dirname, ".data_get_scenario");

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

async function seedScenarioContent(scenarioId, contentLines) {
  // Obriši postojeće linije
  await Line.destroy({ where: { scenarioId } });
  
  // Kreiraj nove linije
  for (const line of contentLines) {
    await Line.create({
      lineId: line.lineId,
      nextLineId: line.nextLineId,
      text: line.text,
      scenarioId,
    });
  }
}

describe("GET /api/scenarios/:scenarioId", () => {
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
    Line = models.Line;
    
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
    expect(res.body).toHaveProperty("title", "Naslov scenarija");
    expect(res.body).toHaveProperty("content");
    expect(Array.isArray(res.body.content)).toBe(true);
  });

  test("3) 200: Content je poredan po nextLineId lancu", async () => {
    const agent = request(app);
    const scenarioId = await createScenario(agent, "Chain test");

    // Ubaci custom content direktno u bazu
    await seedScenarioContent(scenarioId, [
      { lineId: 3, nextLineId: null, text: "Treća" },
      { lineId: 1, nextLineId: 2, text: "Prva" },
      { lineId: 2, nextLineId: 3, text: "Druga" },
    ]);

    const res = await agent.get(`/api/scenarios/${scenarioId}`).expect(200);

    expect(res.body.content).toHaveLength(3);
    expect(res.body.content[0].text).toBe("Prva");
    expect(res.body.content[1].text).toBe("Druga");
    expect(res.body.content[2].text).toBe("Treća");
  });

  test("4) 200: Prazan scenarij ima jednu praznu liniju", async () => {
    const agent = request(app);
    const scenarioId = await createScenario(agent, "Empty");

    const res = await agent.get(`/api/scenarios/${scenarioId}`).expect(200);

    expect(res.body.content).toHaveLength(1);
    expect(res.body.content[0]).toEqual({
      lineId: 1,
      nextLineId: null,
      text: "",
    });
  });
});
