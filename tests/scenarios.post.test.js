/**
 * POST /api/scenarios testovi (Jest + Supertest)
 *
 * Očekivanja iz zadatka:
 * - Kreira novi prazan scenarij sa naslovom i jednom praznom linijom.
 * - Ako title nije poslan ili je prazan -> "Neimenovani scenarij"
 * - Svi ID-evi kreću od 1 i auto-increment (scenario id, lineId)
 * - content: [{ lineId: 1, nextLineId: null, text: "" }]
 * - Odgovori su JSON
 */

const path = require("path");
const fs = require("fs");
const request = require("supertest");

let app;
let sequelize;

const TEST_DATA_DIR = path.join(__dirname, ".data_scenarios_post");

function rmDirSafe(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function mkDirSafe(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

describe("POST /api/scenarios", () => {
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
    
    // Resetuj bazu prije svakog testa
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    rmDirSafe(TEST_DATA_DIR);
    if (sequelize) {
      await sequelize.close();
    }
  });

  const assertScenarioShape = (body) => {
    expect(body).toHaveProperty("id");
    expect(Number.isInteger(body.id)).toBe(true);
    expect(body.id).toBeGreaterThanOrEqual(1);

    expect(body).toHaveProperty("title");
    expect(typeof body.title).toBe("string");

    expect(body).toHaveProperty("content");
    expect(Array.isArray(body.content)).toBe(true);
    expect(body.content).toHaveLength(1);

    const line = body.content[0];
    expect(line).toEqual({
      lineId: 1,
      nextLineId: null,
      text: "",
    });
  };

  test("1) Kreira scenarij sa validnim title", async () => {
    const res = await request(app)
      .post("/api/scenarios")
      .send({ title: "Naslov scenarija" })
      .expect(200);

    expect(res.headers["content-type"]).toMatch(/application\/json/i);

    assertScenarioShape(res.body);
    expect(res.body.id).toBe(1);
    expect(res.body.title).toBe("Naslov scenarija");
  });

  test("2) Ako title nije poslan -> 'Neimenovani scenarij'", async () => {
    const res = await request(app)
      .post("/api/scenarios")
      .send({})
      .expect(200);

    expect(res.headers["content-type"]).toMatch(/application\/json/i);

    assertScenarioShape(res.body);
    expect(res.body.id).toBe(1);
    expect(res.body.title).toBe("Neimenovani scenarij");
  });

  test("3) Ako body nije poslan (prazan request) -> 'Neimenovani scenarij'", async () => {
    const res = await request(app).post("/api/scenarios").expect(200);

    expect(res.headers["content-type"]).toMatch(/application\/json/i);

    assertScenarioShape(res.body);
    expect(res.body.id).toBe(1);
    expect(res.body.title).toBe("Neimenovani scenarij");
  });

  test("4) Ako title = '' (prazan string) -> 'Neimenovani scenarij'", async () => {
    const res = await request(app)
      .post("/api/scenarios")
      .send({ title: "" })
      .expect(200);

    expect(res.headers["content-type"]).toMatch(/application\/json/i);

    assertScenarioShape(res.body);
    expect(res.body.title).toBe("Neimenovani scenarij");
  });

  test("5) Ako title je whitespace (npr. '   ') -> tretiraj kao prazan -> 'Neimenovani scenarij'", async () => {
    const res = await request(app)
      .post("/api/scenarios")
      .send({ title: "   " })
      .expect(200);

    expect(res.headers["content-type"]).toMatch(/application\/json/i);

    assertScenarioShape(res.body);
    expect(res.body.title).toBe("Neimenovani scenarij");
  });

  test("6) Ako title ima leading/trailing razmake -> (preporučeno) trim i sačuvaj bez razmaka", async () => {
    const res = await request(app)
      .post("/api/scenarios")
      .send({ title: "  Moj naslov  " })
      .expect(200);

    expect(res.headers["content-type"]).toMatch(/application\/json/i);

    assertScenarioShape(res.body);
    expect(res.body.title).toBe("Moj naslov");
  });

  test("7) Dodatna polja u body (npr. foo) ne smiju pokvariti kreiranje", async () => {
    const res = await request(app)
      .post("/api/scenarios")
      .send({ title: "X", foo: "bar", id: 999, content: [{ text: "hack" }] })
      .expect(200);

    expect(res.headers["content-type"]).toMatch(/application\/json/i);

    assertScenarioShape(res.body);
    expect(res.body.id).toBe(1);
    expect(res.body.title).toBe("X");
  });

  test("8) Dva scenarija mogu imati isti title (ne smije fail)", async () => {
    const r1 = await request(app)
      .post("/api/scenarios")
      .send({ title: "Isti" })
      .expect(200);

    const r2 = await request(app)
      .post("/api/scenarios")
      .send({ title: "Isti" })
      .expect(200);

    expect(r1.body.title).toBe("Isti");
    expect(r2.body.title).toBe("Isti");

    expect(r1.body.id).toBe(1);
    expect(r2.body.id).toBe(2);

    expect(r2.body.content).toHaveLength(1);
    expect(r2.body.content[0]).toEqual({ lineId: 1, nextLineId: null, text: "" });
  });

  test("9) Auto-increment ID: kreiranje više scenarija daje 1,2,3...", async () => {
    const ids = [];
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post("/api/scenarios")
        .send({ title: `S${i}` })
        .expect(200);
      ids.push(res.body.id);
    }
    expect(ids).toEqual([1, 2, 3, 4, 5]);
  });

  test("10) Content struktura: lineId=1, nextLineId=null, text='' (tipovi tačni)", async () => {
    const res = await request(app)
      .post("/api/scenarios")
      .send({ title: "Provjera content" })
      .expect(200);

    const line = res.body.content[0];
    expect(line.lineId).toBe(1);
    expect(line.nextLineId).toBeNull();
    expect(line.text).toBe("");

    expect(typeof line.lineId).toBe("number");
    expect(line.nextLineId).toBe(null);
    expect(typeof line.text).toBe("string");
  });

  test("11) Server mora vratiti isključivo JSON (content-type application/json)", async () => {
    const res = await request(app)
      .post("/api/scenarios")
      .send({ title: "JSON check" })
      .expect(200);

    expect(res.headers["content-type"]).toMatch(/application\/json/i);
    expect(typeof res.body).toBe("object");
  });

  test("12) Ako title nije string (npr. broj/null/objekat) -> tretiraj kao missing/prazan => 'Neimenovani scenarij'", async () => {
    const cases = [
      { title: 123 },
      { title: null },
      { title: { a: 1 } },
      { title: ["x"] },
      { title: true },
    ];

    for (const payload of cases) {
      // Resetuj bazu za svaki slučaj
      await sequelize.sync({ force: true });
      
      const res = await request(app)
        .post("/api/scenarios")
        .send(payload)
        .expect(200);

      assertScenarioShape(res.body);
      expect(res.body.title).toBe("Neimenovani scenarij");
    }
  });

  test("13) Nevalidan JSON body (ako imaš JSON parser) treba vratiti JSON error (ako si implementirao error handling)", async () => {
    const res = await request(app)
      .post("/api/scenarios")
      .set("Content-Type", "application/json")
      .send("{ invalid json }");

    expect([400, 422]).toContain(res.status);
    expect(res.headers["content-type"]).toMatch(/application\/json/i);
    expect(res.body).toHaveProperty("error");
  });
});
