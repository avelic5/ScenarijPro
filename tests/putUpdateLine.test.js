const path = require("path");
const fs = require("fs");
const request = require("supertest");

let app;

const TEST_DATA_DIR = path.join(__dirname, ".data_put_update_line");
const fixedNowMs = 1735536000000;
const fixedUnixSeconds = Math.floor(fixedNowMs / 1000);

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

function scenarioPath(scenarioId) {
  return path.join(TEST_DATA_DIR, "scenarios", `scenario-${scenarioId}.json`);
}

function locksPath() {
  return path.join(TEST_DATA_DIR, "locks.json");
}

function deltasPath() {
  return path.join(TEST_DATA_DIR, "deltas.json");
}

function makeWords(n, prefix = "w") {
  return Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`).join(" ");
}

function countWords(text) {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

function followChain(lines, startId, safetyLimit = 200) {
  const byId = new Map(lines.map((l) => [l.lineId, l]));
  const out = [];
  let cur = byId.get(startId);
  let steps = 0;
  while (cur && steps < safetyLimit) {
    out.push(cur);
    steps++;
    if (cur.nextLineId == null) break;
    cur = byId.get(cur.nextLineId);
  }
  return out;
}

async function createScenario(agent, title = "S") {
  const res = await agent.post("/api/scenarios").send({ title }).expect(200);
  return { scenarioId: res.body.id, firstLineId: res.body.content?.[0]?.lineId ?? 1 };
}

function lockLine(agent, scenarioId, lineId, userId) {
  return agent.post(`/api/scenarios/${scenarioId}/lines/${lineId}/lock`).send({ userId });
}

describe("PUT /api/scenarios/:scenarioId/lines/:lineId", () => {
  beforeEach(() => {
    jest.spyOn(Date, "now").mockReturnValue(fixedNowMs);

    jest.resetModules();
    process.env.NODE_ENV = "test";
    process.env.DATA_DIR = TEST_DATA_DIR;

    rmDirSafe(TEST_DATA_DIR);
    mkDirSafe(TEST_DATA_DIR);

    app = require("../index");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    rmDirSafe(TEST_DATA_DIR);
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
      .put(`/api/scenarios/${scenarioId}/lines/9999`)
      .send({ userId: 1, newText: ["Test"] });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Linija ne postoji!" });
  });

  test("400 - newText ne smije biti prazan niz", async () => {
    const res = await request(app)
      .put("/api/scenarios/1/lines/1")
      .send({ userId: 1, newText: [] });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Niz new_text ne smije biti prazan!" });
  });

  test("409 - Linija nije zakljucana", async () => {
    const agent = request(app);
    const { scenarioId, firstLineId } = await createScenario(agent, "S1");

    const res = await agent
      .put(`/api/scenarios/${scenarioId}/lines/${firstLineId}`)
      .send({ userId: 1, newText: ["Novi tekst"] });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "Linija nije zakljucana!" });
  });

  test("409 - Linija je vec zakljucana (zakljucao drugi user)", async () => {
    const agent = request(app);
    const { scenarioId, firstLineId } = await createScenario(agent, "S1");

    await lockLine(agent, scenarioId, firstLineId, 2).expect(200);

    const res = await agent
      .put(`/api/scenarios/${scenarioId}/lines/${firstLineId}`)
      .send({ userId: 1, newText: ["Novi tekst"] });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "Linija je vec zakljucana!" });
  });

  test("200 - Wrap: 45 riječi => 3 linije (20,20,5), last.nextLineId = originalNext", async () => {
    const agent = request(app);
    const { scenarioId, firstLineId } = await createScenario(agent, "S1");

    // Napravi 2-linijski scenario da originalNext bude != null
    await lockLine(agent, scenarioId, firstLineId, 1).expect(200);
    await agent
      .put(`/api/scenarios/${scenarioId}/lines/${firstLineId}`)
      .send({ userId: 1, newText: ["L1", "L2"] })
      .expect(200);

    const scenarioAfterSeed = readJsonSafe(scenarioPath(scenarioId), null);
    const seededLine1 = scenarioAfterSeed.content.find((l) => l.lineId === firstLineId);
    const originalNext = seededLine1.nextLineId;
    expect(originalNext).not.toBeNull();

    // Lock line1 opet pa radi wrap update
    await lockLine(agent, scenarioId, firstLineId, 1).expect(200);

    const text45 = makeWords(45, "w");
    const res = await agent
      .put(`/api/scenarios/${scenarioId}/lines/${firstLineId}`)
      .send({ userId: 1, newText: [text45] })
      .expect(200);

    expect(res.body).toEqual({ message: "Linija je uspjesno azurirana!" });

    const scenario = readJsonSafe(scenarioPath(scenarioId), null);
    expect(scenario).toBeTruthy();

    const chain = followChain(scenario.content, firstLineId);
    expect(chain.length).toBeGreaterThanOrEqual(3);

    expect(countWords(chain[0].text)).toBe(20);
    expect(countWords(chain[1].text)).toBe(20);
    expect(countWords(chain[2].text)).toBe(5);

    expect(chain[2].nextLineId).toBe(originalNext);
  });

  test("Prazni stringovi u newText su dozvoljeni", async () => {
    const agent = request(app);
    const { scenarioId, firstLineId } = await createScenario(agent, "S1");

    await lockLine(agent, scenarioId, firstLineId, 1).expect(200);

    const res = await agent
      .put(`/api/scenarios/${scenarioId}/lines/${firstLineId}`)
      .send({ userId: 1, newText: ["", "a b"] })
      .expect(200);

    expect(res.body).toEqual({ message: "Linija je uspjesno azurirana!" });

    const scenario = readJsonSafe(scenarioPath(scenarioId), null);
    const line1 = scenario.content.find((l) => l.lineId === firstLineId);
    expect(line1.text).toBe("");

    const next = scenario.content.find((l) => l.lineId === line1.nextLineId);
    expect(next).toBeTruthy();
    expect(next.text.trim()).toBe("a b");
  });

  test("Ako se update radi na zadnjoj liniji (nextLineId=null) i dođe wrap, zadnja nova linija mora imati nextLineId=null", async () => {
    const agent = request(app);
    const { scenarioId, firstLineId } = await createScenario(agent, "S1");

    // Napravi 2-linijski scenario
    await lockLine(agent, scenarioId, firstLineId, 1).expect(200);
    await agent
      .put(`/api/scenarios/${scenarioId}/lines/${firstLineId}`)
      .send({ userId: 1, newText: ["L1", "L2"] })
      .expect(200);

    const scenarioSeeded = readJsonSafe(scenarioPath(scenarioId), null);
    const line1 = scenarioSeeded.content.find((l) => l.lineId === firstLineId);
    const line2Id = line1.nextLineId;

    await lockLine(agent, scenarioId, line2Id, 1).expect(200);

    const text21 = makeWords(21, "z");
    await agent
      .put(`/api/scenarios/${scenarioId}/lines/${line2Id}`)
      .send({ userId: 1, newText: [text21] })
      .expect(200);

    const scenario = readJsonSafe(scenarioPath(scenarioId), null);
    const updated2 = scenario.content.find((l) => l.lineId === line2Id);
    expect(countWords(updated2.text)).toBe(20);

    const inserted = scenario.content.find((l) => l.lineId === updated2.nextLineId);
    expect(inserted).toBeTruthy();
    expect(countWords(inserted.text)).toBe(1);
    expect(inserted.nextLineId).toBeNull();
  });

  test("Delta append: uspješan update upisuje line_update i timestamp (Unix seconds)", async () => {
    const agent = request(app);
    const { scenarioId, firstLineId } = await createScenario(agent, "S1");

    await lockLine(agent, scenarioId, firstLineId, 1).expect(200);

    await agent
      .put(`/api/scenarios/${scenarioId}/lines/${firstLineId}`)
      .send({ userId: 1, newText: ["Test delta"] })
      .expect(200);

    const deltas = readJsonSafe(deltasPath(), []);
    expect(Array.isArray(deltas)).toBe(true);

    const updates = deltas.filter((d) => d && d.type === "line_update" && d.scenarioId === scenarioId);
    expect(updates.length).toBeGreaterThanOrEqual(1);
    expect(updates[updates.length - 1].timestamp).toBe(fixedUnixSeconds);
  });

  test("Nakon uspješnog update-a linija se otključava (lock zapis se ukloni)", async () => {
    const agent = request(app);
    const { scenarioId, firstLineId } = await createScenario(agent, "S1");

    await lockLine(agent, scenarioId, firstLineId, 1).expect(200);

    await agent
      .put(`/api/scenarios/${scenarioId}/lines/${firstLineId}`)
      .send({ userId: 1, newText: ["Otključaj"] })
      .expect(200);

    const locks = readJsonSafe(locksPath(), []);
    expect(Array.isArray(locks)).toBe(true);
    expect(locks.find((l) => l.scenarioId === scenarioId && l.lineId === firstLineId)).toBeFalsy();
  });
});
