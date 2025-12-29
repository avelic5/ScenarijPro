const path = require("path");
const fs = require("fs");
const request = require("supertest");

// ✅ PROMIJENI putanju do tvog express app-a
let app;

const TEST_DATA_DIR = path.join(__dirname, ".data_lock_tests");

function rmDirSafe(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}
function mkDirSafe(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function createScenario(agent, title = "Test scenario") {
  const res = await agent.post("/api/scenarios").send({ title }).expect(200);
  // očekuje se jedna prazna linija: lineId=1
  return { scenarioId: res.body.id, firstLineId: res.body.content?.[0]?.lineId ?? 1 };
}

function lockLine(agent, scenarioId, lineId, userId) {
  return agent.post(`/api/scenarios/${scenarioId}/lines/${lineId}/lock`).send({ userId });
}

describe("POST /api/scenarios/:scenarioId/lines/:lineId/lock", () => {
  beforeAll(() => {
    process.env.NODE_ENV = "test";
    process.env.DATA_DIR = TEST_DATA_DIR;

    rmDirSafe(TEST_DATA_DIR);
    mkDirSafe(TEST_DATA_DIR);

    app = require("../../index");
  });

  beforeEach(() => {
    rmDirSafe(TEST_DATA_DIR);
    mkDirSafe(TEST_DATA_DIR);

    // ako app kešira podatke u memoriji, ovo pomaže
    jest.resetModules();
    process.env.NODE_ENV = "test";
    process.env.DATA_DIR = TEST_DATA_DIR;
    app = require("../../index");
  });

  afterAll(() => {
    rmDirSafe(TEST_DATA_DIR);
  });

  test("1) 200: Zaključava slobodnu liniju", async () => {
    const agent = request(app);
    const { scenarioId, firstLineId } = await createScenario(agent, "S1");

    const res = await lockLine(agent, scenarioId, firstLineId, 1).expect(200);

    expect(res.headers["content-type"]).toMatch(/application\/json/i);
    expect(res.body).toEqual({ message: "Linija je uspjesno zakljucana!" });
  });

  test("2) 409: Drugi korisnik pokušava zaključati već zaključanu liniju", async () => {
    const agent = request(app);
    const { scenarioId, firstLineId } = await createScenario(agent, "S1");

    await lockLine(agent, scenarioId, firstLineId, 1).expect(200);

    const res = await lockLine(agent, scenarioId, firstLineId, 2).expect(409);

    expect(res.headers["content-type"]).toMatch(/application\/json/i);
    expect(res.body).toEqual({ message: "Linija je vec zakljucana!" });
  });

  test("3) 404: Scenario ne postoji", async () => {
    const agent = request(app);

    const res = await lockLine(agent, 9999, 1, 1).expect(404);

    expect(res.headers["content-type"]).toMatch(/application\/json/i);
    expect(res.body).toEqual({ message: "Scenario ne postoji!" });
  });

  test("4) 404: Linija ne postoji u tom scenariju", async () => {
    const agent = request(app);
    const { scenarioId } = await createScenario(agent, "S1");

    const res = await lockLine(agent, scenarioId, 9999, 1).expect(404);

    expect(res.headers["content-type"]).toMatch(/application\/json/i);
    expect(res.body).toEqual({ message: "Linija ne postoji!" });
  });

  test("5) Global lock: korisnik zaključa liniju u jednom scenariju, pa zaključa liniju u drugom -> prva se otključava", async () => {
    const agent = request(app);

    const s1 = await createScenario(agent, "S1");
    const s2 = await createScenario(agent, "S2");

    // user 1 zaključava S1:L1
    await lockLine(agent, s1.scenarioId, s1.firstLineId, 1).expect(200);

    // user 1 zaključava S2:L1 -> mora otključati S1:L1
    await lockLine(agent, s2.scenarioId, s2.firstLineId, 1).expect(200);

    // sad user 2 treba moći zaključati S1:L1 (jer je user1 prebacio lock)
    const res = await lockLine(agent, s1.scenarioId, s1.firstLineId, 2).expect(200);
    expect(res.body).toEqual({ message: "Linija je uspjesno zakljucana!" });
  });

  test("6) Paralelno zaključavanje različitih linija/scenarija od različitih korisnika je dozvoljeno", async () => {
    const agent = request(app);
    const s1 = await createScenario(agent, "S1");
    const s2 = await createScenario(agent, "S2");

    await lockLine(agent, s1.scenarioId, s1.firstLineId, 1).expect(200);

    // user2 zaključava liniju u drugom scenariju -> treba biti OK
    const res = await lockLine(agent, s2.scenarioId, s2.firstLineId, 2).expect(200);
    expect(res.body).toEqual({ message: "Linija je uspjesno zakljucana!" });
  });

  test("7) (Preporučeno) Idempotent: ako isti user opet zaključa ISTU liniju koju već drži -> 200", async () => {
    const agent = request(app);
    const s1 = await createScenario(agent, "S1");

    await lockLine(agent, s1.scenarioId, s1.firstLineId, 1).expect(200);

    const res = await lockLine(agent, s1.scenarioId, s1.firstLineId, 1);

    // Ako ti implementacija umjesto toga vraća 200 ili 409, ovdje odluči šta želiš.
    // Ja preporučujem 200 (idempotentno).
    expect([200, 409]).toContain(res.status);
    expect(res.headers["content-type"]).toMatch(/application\/json/i);

    if (res.status === 200) {
      expect(res.body).toEqual({ message: "Linija je uspjesno zakljucana!" });
    } else {
      // ako ovo ostane 409, onda je “vec zakljucana” i za istog usera — nije idealno, ali je test tolerantniji
      expect(res.body).toEqual({ message: "Linija je vec zakljucana!" });
    }
  });

  test("8) (Robusnost) Nevalidni parametri scenarioId/lineId (npr. string) -> 400 ili 404, ali mora biti JSON", async () => {
    const agent = request(app);

    const res = await agent
      .post("/api/scenarios/abc/lines/xyz/lock")
      .send({ userId: 1 });

    expect([400, 404]).toContain(res.status);
    expect(res.headers["content-type"]).toMatch(/application\/json/i);
    expect(res.body).toHaveProperty("message");
  });

  test("9) (Robusnost) userId fali ili je nevalidan -> 400/422 (ako radiš validaciju)", async () => {
    const agent = request(app);
    const s1 = await createScenario(agent, "S1");

    // bez userId
    const r1 = await agent
      .post(`/api/scenarios/${s1.scenarioId}/lines/${s1.firstLineId}/lock`)
      .send({});
    // ako ne validiraš, može pasti — pa ovdje ostavljam dopuštene kodove
    expect([200, 400, 422]).toContain(r1.status);
    expect(r1.headers["content-type"]).toMatch(/application\/json/i);

    // userId kao string
    const r2 = await lockLine(agent, s1.scenarioId, s1.firstLineId, "1");
    expect([200, 400, 422]).toContain(r2.status);
    expect(r2.headers["content-type"]).toMatch(/application\/json/i);
  });
});
