/**
 * POST /api/scenarios/:scenarioId/characters/update testovi (Jest + Supertest)
 */

const path = require("path");
const fs = require("fs");
const request = require("supertest");

let app;
let sequelize;
let Line;
let Delta;

const TEST_DATA_DIR = path.join(__dirname, ".data_char_update");

function rmDirSafe(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function mkDirSafe(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function injectScenarioContent(scenarioId, linesText) {
  await Line.destroy({ where: { scenarioId } });
  
  for (let idx = 0; idx < linesText.length; idx++) {
    await Line.create({
      lineId: idx + 1,
      nextLineId: idx === linesText.length - 1 ? null : idx + 2,
      text: linesText[idx],
      scenarioId,
    });
  }
}

async function readScenarioContent(scenarioId) {
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

async function readDeltas(scenarioId) {
  const deltas = await Delta.findAll({
    where: { scenarioId },
    order: [['timestamp', 'ASC']],
  });
  return deltas.map(d => ({
    type: d.type,
    oldName: d.oldName,
    newName: d.newName,
    timestamp: d.timestamp,
  }));
}

function findCharRenameDelta(deltas, { oldName, newName }) {
  return deltas.find(d => 
    d.type === "char_rename" &&
    d.oldName === oldName &&
    d.newName === newName
  );
}

function lockCharacter(agent, scenarioId, userId, characterName) {
  return agent
    .post(`/api/scenarios/${scenarioId}/characters/lock`)
    .send({ userId, characterName });
}

async function createScenario(agent, title = "S") {
  const res = await agent.post("/api/scenarios").send({ title }).expect(200);
  return res.body.id;
}

describe("POST /api/scenarios/:scenarioId/characters/update", () => {
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
    Delta = models.Delta;

    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    rmDirSafe(TEST_DATA_DIR);
    if (sequelize) {
      await sequelize.close();
    }
  });

  test("1) 200: Preimenuje lika svugdje + upiše char_rename u deltas", async () => {
    const agent = request(app);
    const scenarioId = await createScenario(agent, "Rename test");

    // Ubaci content sa likom ALICE
    await injectScenarioContent(scenarioId, [
      "ALICE",
      "Zdravo, ja sam Alice.",
      "BOB",
      "Pozdrav Alice!",
    ]);

    // Zaključaj ime lika
    await lockCharacter(agent, scenarioId, 1, "ALICE").expect(200);

    // Preimenuj
    const res = await agent
      .post(`/api/scenarios/${scenarioId}/characters/update`)
      .send({ userId: 1, oldName: "ALICE", newName: "ALICIA" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Ime lika je uspjesno promijenjeno!" });

    // Provjeri da je ime promijenjeno u bazi
    const content = await readScenarioContent(scenarioId);
    const aliceLines = content.filter(l => l.text === "ALICE");
    const aliciaLines = content.filter(l => l.text === "ALICIA");
    
    expect(aliceLines.length).toBe(0);
    expect(aliciaLines.length).toBe(1);

    // Provjeri delta zapis
    const deltas = await readDeltas(scenarioId);
    const renameDelta = findCharRenameDelta(deltas, { oldName: "ALICE", newName: "ALICIA" });
    expect(renameDelta).toBeTruthy();
  });

  test("2) 404: Scenario ne postoji", async () => {
    const agent = request(app);

    const res = await agent
      .post(`/api/scenarios/9999/characters/update`)
      .send({ userId: 1, oldName: "ALICE", newName: "ALICIA" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Scenario ne postoji!" });
  });

  test("3) 409: Ime lika nije zakljucano", async () => {
    const agent = request(app);
    const scenarioId = await createScenario(agent, "No lock");

    await injectScenarioContent(scenarioId, ["ALICE", "Govor"]);

    const res = await agent
      .post(`/api/scenarios/${scenarioId}/characters/update`)
      .send({ userId: 1, oldName: "ALICE", newName: "ALICIA" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "Ime lika nije zakljucano!" });
  });

  test("4) 400: Neispravno ime lika", async () => {
    const agent = request(app);
    const scenarioId = await createScenario(agent, "Invalid name");

    const res = await agent
      .post(`/api/scenarios/${scenarioId}/characters/update`)
      .send({ userId: 1, oldName: "alice", newName: "ALICIA" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Neispravno ime lika" });
  });

  test("5) 409: Ime lika je zakljucano od drugog korisnika", async () => {
    const agent = request(app);
    const scenarioId = await createScenario(agent, "Other user");

    await injectScenarioContent(scenarioId, ["ALICE", "Govor"]);

    await lockCharacter(agent, scenarioId, 1, "ALICE").expect(200);

    const res = await agent
      .post(`/api/scenarios/${scenarioId}/characters/update`)
      .send({ userId: 2, oldName: "ALICE", newName: "ALICIA" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "Ime lika je vec zakljucano!" });
  });
});
