/**
 * Test helper za rad sa Sequelize bazom
 * Koristi se umjesto JSON fajlova u testovima
 */

const path = require("path");
const fs = require("fs");

const TEST_DATA_DIR = path.join(__dirname, ".data_test");

function rmDirSafe(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function mkDirSafe(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Resetuje bazu podataka i učitava app
 */
async function setupTestEnvironment(customDataDir = null) {
  const dataDir = customDataDir || TEST_DATA_DIR;
  
  jest.resetModules();
  process.env.NODE_ENV = "test";
  process.env.DATA_DIR = dataDir;
  
  rmDirSafe(dataDir);
  mkDirSafe(dataDir);
  
  const app = require("../index");
  const { sequelize, Scenario, Line, Delta, Checkpoint } = require("../models");
  
  // Resetuj bazu - kreiraj tabele iznova
  await sequelize.sync({ force: true });
  
  return { app, sequelize, Scenario, Line, Delta, Checkpoint, dataDir };
}

/**
 * Zatvori konekciju sa bazom nakon testova
 */
async function teardownTestEnvironment() {
  const { sequelize } = require("../models");
  await sequelize.close();
}

/**
 * Kreira scenarij putem API-ja
 */
async function createScenarioViaApi(agent, title = "S") {
  const res = await agent.post("/api/scenarios").send({ title }).expect(200);
  return res.body.id;
}

/**
 * Ubaci custom content direktno u bazu
 */
async function injectScenarioContent(scenarioId, linesText) {
  const { Line } = require("../models");
  
  // Obriši postojeće linije
  await Line.destroy({ where: { scenarioId } });
  
  // Kreiraj nove linije
  for (let idx = 0; idx < linesText.length; idx++) {
    await Line.create({
      lineId: idx + 1,
      nextLineId: idx === linesText.length - 1 ? null : idx + 2,
      text: linesText[idx],
      scenarioId,
    });
  }
}

/**
 * Pročitaj scenario content iz baze
 */
async function readScenarioContent(scenarioId) {
  const { Line } = require("../models");
  
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

/**
 * Pročitaj sve delta zapise za scenarij
 */
async function readDeltas(scenarioId = null) {
  const { Delta } = require("../models");
  
  const where = scenarioId ? { scenarioId } : {};
  const deltas = await Delta.findAll({
    where,
    order: [['timestamp', 'ASC']],
  });
  
  return deltas.map(d => ({
    scenarioId: d.scenarioId,
    type: d.type,
    lineId: d.lineId,
    nextLineId: d.nextLineId,
    content: d.content,
    oldName: d.oldName,
    newName: d.newName,
    timestamp: d.timestamp,
  }));
}

/**
 * Ubaci delta zapise direktno u bazu
 */
async function seedDeltas(entries) {
  const { Delta } = require("../models");
  
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

/**
 * Pronađi char_rename delta
 */
function findCharRenameDelta(deltas, { scenarioId, oldName, newName }) {
  return deltas.find(d => 
    d.type === "char_rename" &&
    d.scenarioId === scenarioId &&
    d.oldName === oldName &&
    d.newName === newName
  );
}

module.exports = {
  TEST_DATA_DIR,
  rmDirSafe,
  mkDirSafe,
  setupTestEnvironment,
  teardownTestEnvironment,
  createScenarioViaApi,
  injectScenarioContent,
  readScenarioContent,
  readDeltas,
  seedDeltas,
  findCharRenameDelta,
};
