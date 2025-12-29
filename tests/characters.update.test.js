const path = require("path");
const fs = require("fs");
const request = require("supertest");

// ✅ PROMIJENI putanju do express app-a (mora exportovati app, ne listen)
let app;

const TEST_DATA_DIR = path.join(__dirname, ".data_char_update");

function rmDirSafe(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}
function mkDirSafe(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function scenarioFilePath(dataDir, scenarioId) {
  return path.join(dataDir, "scenarios", `scenario-${scenarioId}.json`);
}

/**
 * Ubaci custom content u scenario na disku (da možeš testirati rename).
 * linesText: array stringova
 * Kreira linked-list nextLineId kao u zadatku.
 */
function injectScenarioContent(dataDir, scenarioId, linesText) {
  const filePath = scenarioFilePath(dataDir, scenarioId);
  const scenario = readJsonSafe(filePath);
  if (!scenario) throw new Error(`Ne mogu naći scenario file: ${filePath}`);

  const content = linesText.map((text, idx) => ({
    lineId: idx + 1,
    nextLineId: idx === linesText.length - 1 ? null : idx + 2,
    text,
  }));

  scenario.content = content;
  writeJson(filePath, scenario);
}

/**
 * Vrati trenutni scenario content sa diska (poslije rename)
 */
function readScenarioContent(dataDir, scenarioId) {
  const filePath = scenarioFilePath(dataDir, scenarioId);
  const scenario = readJsonSafe(filePath);
  if (!scenario) return null;
  return scenario.content;
}

/**
 * Učitaj deltas.json (pretpostavka: nalazi se direktno u DATA_DIR).
 * Ako ga ti držiš pod drugim imenom/lokacijom, promijeni ovdje.
 */
function readDeltas(dataDir) {
  const deltaPath = path.join(dataDir, "deltas.json");
  return readJsonSafe(deltaPath);
}

/**
 * Nađi char_rename delta entry tolerantno (type/changeType/deltaType).
 */
function findCharRenameDelta(deltasRoot, { scenarioId, userId, oldName, newName }) {
  if (!deltasRoot) return null;

  // najčešće: array
  const candidates = Array.isArray(deltasRoot)
    ? deltasRoot
    : Array.isArray(deltasRoot.deltas)
      ? deltasRoot.deltas
      : Array.isArray(deltasRoot.items)
        ? deltasRoot.items
        : null;

  if (!candidates) return null;

  return candidates.find((d) => {
    const t = d.type ?? d.changeType ?? d.deltaType;
    const hasUser = d.userId !== undefined || d.userID !== undefined || d.uid !== undefined;
    return (
      t === "char_rename" &&
      (d.scenarioId ?? d.scenarioID ?? d.sid) === scenarioId &&
      (!hasUser || (d.userId ?? d.userID ?? d.uid) === userId) &&
      (d.oldName ?? d.from ?? d.previousName) === oldName &&
      (d.newName ?? d.to ?? d.nextName) === newName
    );
  });
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

    app = require("../index");
  });

  beforeEach(() => {
    rmDirSafe(TEST_DATA_DIR);
    mkDirSafe(TEST_DATA_DIR);

    jest.resetModules();
    process.env.NODE_ENV = "test";
    process.env.DATA_DIR = TEST_DATA_DIR;
    app = require("../index");
  });

  afterAll(() => {
    rmDirSafe(TEST_DATA_DIR);
  });

  test("1) 200: Preimenuje lika svugdje + upiše char_rename u deltas.json", async () => {
    const agent = request(app);

    const scenarioId = await createScenario(agent, "Rename test");
    // ubaci sadržaj ručno u file storage da ima više linija sa oldName
    injectScenarioContent(TEST_DATA_DIR, scenarioId, [
      "ALICE",
      "Hello there.",
      "(whispers)",
      "ALICE",
      "Some action line",
      "BOB",
      "ALICE",
      "Bye.",
    ]);

    // Po tvojoj implementaciji, rename zahtijeva da je oldName zaključan za tog usera
    await lockCharacter(agent, scenarioId, 1, "ALICE").expect(200);

    const payload = { userId: 1, oldName: "ALICE", newName: "ALICIA" };

    const res = await agent
      .post(`/api/scenarios/${scenarioId}/characters/update`)
      .send(payload)
      .expect(200);

    expect(res.headers["content-type"]).toMatch(/application\/json/i);
    expect(res.body).toEqual({ message: "Ime lika je uspjesno promijenjeno!" });

    // Provjeri da su linije promijenjene na disku
    const updatedContent = readScenarioContent(TEST_DATA_DIR, scenarioId);
    expect(Array.isArray(updatedContent)).toBe(true);

    const texts = updatedContent.map((l) => l.text);
    // sva "ALICE" => "ALICIA"
    expect(texts).toContain("ALICIA");
    expect(texts).not.toContain("ALICE");

    // ostale linije netaknute
    expect(texts).toContain("Hello there.");
    expect(texts).toContain("(whispers)");
    expect(texts).toContain("Some action line");
    expect(texts).toContain("BOB");

    // Provjeri deltas.json (tolerantno)
    const deltasRoot = readDeltas(TEST_DATA_DIR);
    const delta = findCharRenameDelta(deltasRoot, {
      scenarioId,
      userId: 1,
      oldName: "ALICE",
      newName: "ALICIA",
    });

    expect(delta).toBeTruthy();
  });

  test("2) 404: Scenario ne postoji", async () => {
    const agent = request(app);

    const res = await agent
      .post(`/api/scenarios/9999/characters/update`)
      .send({ userId: 1, oldName: "ALICE", newName: "ALICIA" })
      .expect(404);

    expect(res.headers["content-type"]).toMatch(/application\/json/i);
    expect(res.body).toEqual({ message: "Scenario ne postoji!" });

    // Bonus: ne bi trebalo dodati char_rename delta (ako deltas postoji)
    const deltasRoot = readDeltas(TEST_DATA_DIR);
    if (deltasRoot) {
      const delta = findCharRenameDelta(deltasRoot, {
        scenarioId: 9999,
        userId: 1,
        oldName: "ALICE",
        newName: "ALICIA",
      });
      expect(delta).toBeFalsy();
    }
  });

  test("3) (Preporučeno) oldName se ne pojavljuje nigdje -> 200 i delta se može upisati ili ne (tolerantno)", async () => {
    const agent = request(app);

    const scenarioId = await createScenario(agent, "No-op rename");
    injectScenarioContent(TEST_DATA_DIR, scenarioId, [
      "BOB",
      "Hi.",
      "CHARLIE",
      "Hello.",
    ]);

    const res = await agent
      .post(`/api/scenarios/${scenarioId}/characters/update`)
      .send({ userId: 1, oldName: "ALICE", newName: "ALICIA" });

    // U tvojoj implementaciji: bez locka -> 409 "Ime lika nije zakljucano!"
    expect([200, 409]).toContain(res.status);
    expect(res.headers["content-type"]).toMatch(/application\/json/i);

    if (res.status === 200) {
      expect(res.body).toHaveProperty("message");
      const updatedContent = readScenarioContent(TEST_DATA_DIR, scenarioId);
      const texts = updatedContent.map((l) => l.text);
      expect(texts).toContain("BOB");
      expect(texts).not.toContain("ALICIA"); // ništa nije promijenjeno
    }
  });

  test("4) (Robusnost) Nevalidan body (nema userId/oldName/newName) -> 400/422 ako validiraš", async () => {
    const agent = request(app);
    const scenarioId = await createScenario(agent, "Validation test");

    const r1 = await agent
      .post(`/api/scenarios/${scenarioId}/characters/update`)
      .send({ oldName: "ALICE", newName: "ALICIA" });

    const r2 = await agent
      .post(`/api/scenarios/${scenarioId}/characters/update`)
      .send({ userId: 1, newName: "ALICIA" });

    const r3 = await agent
      .post(`/api/scenarios/${scenarioId}/characters/update`)
      .send({ userId: 1, oldName: "ALICE" });

    for (const r of [r1, r2, r3]) {
      expect([400, 422]).toContain(r.status);
      expect(r.headers["content-type"]).toMatch(/application\/json/i);
      expect(r.body).toHaveProperty("message");
    }
  });

  test("5) (Opcionalno) Provjera unlock-a: ako imaš lock fajl, nakon rename lock za tog usera/char treba nestati", async () => {
    const agent = request(app);

    const scenarioId = await createScenario(agent, "Unlock test");
    injectScenarioContent(TEST_DATA_DIR, scenarioId, ["ALICE", "Hello."]);

    await lockCharacter(agent, scenarioId, 1, "ALICE").expect(200);

    // Ako tvoj sistem ima fajl za lockove, dodaj minimalni lock da simulira "zaključan lik".
    // Pošto ne znam format, test je "best-effort": samo ako fajl postoji i prepoznatljiv je.
    const existingLockFile = path.join(TEST_DATA_DIR, "character-locks.json");
    // nastavi svejedno: rename mora proći
    await agent
      .post(`/api/scenarios/${scenarioId}/characters/update`)
      .send({ userId: 1, oldName: "ALICE", newName: "ALICIA" })
      .expect(200);

    if (existingLockFile) {
      const locksRoot = readJsonSafe(existingLockFile);
      const asString = JSON.stringify(locksRoot ?? {});
      // nakon rename ne bi smjelo ostati nešto što referencira staro ime ili user lock (best-effort)
      expect(asString.includes("ALICE")).toBe(false);
      // (ako se userId čuva u locku)
      // expect(asString.includes('"userId":1')).toBe(false);
    }
  });
});
