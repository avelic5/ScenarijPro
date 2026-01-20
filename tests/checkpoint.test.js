/**
 * Testovi za Checkpoint rute (Zadatak 2 - Verzionisanje)
 * 
 * POST /api/scenarios/:scenarioId/checkpoint
 * GET /api/scenarios/:scenarioId/checkpoints
 * GET /api/scenarios/:scenarioId/restore/:checkpointId
 */

const path = require("path");
const fs = require("fs");
const request = require("supertest");

let app;
let sequelize;

const TEST_DATA_DIR = path.join(__dirname, ".data_checkpoint_tests");

function rmDirSafe(dir) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function mkDirSafe(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

describe("Checkpoint API rute", () => {
    beforeEach(async () => {
        rmDirSafe(TEST_DATA_DIR);
        mkDirSafe(TEST_DATA_DIR);

        jest.resetModules();
        process.env.NODE_ENV = "test";
        process.env.DATA_DIR = TEST_DATA_DIR;

        app = require("../index");
        const models = require("../models");
        sequelize = models.sequelize;

        await sequelize.sync({ force: true });
    });

    afterAll(async () => {
        rmDirSafe(TEST_DATA_DIR);
        if (sequelize) {
            await sequelize.close();
        }
    });

    async function createScenario(agent, title = "Test Scenario") {
        const res = await agent.post("/api/scenarios").send({ title }).expect(200);
        return res.body;
    }

    async function lockLine(agent, scenarioId, lineId, userId) {
        return agent
            .post(`/api/scenarios/${scenarioId}/lines/${lineId}/lock`)
            .send({ userId })
            .expect(200);
    }

    async function updateLine(agent, scenarioId, lineId, userId, newText) {
        return agent
            .put(`/api/scenarios/${scenarioId}/lines/${lineId}`)
            .send({ userId, newText })
            .expect(200);
    }

    describe("POST /api/scenarios/:scenarioId/checkpoint", () => {
        test("200: Kreira checkpoint uspješno", async () => {
            const agent = request(app);
            const scenario = await createScenario(agent, "Checkpoint Test");

            const res = await agent
                .post(`/api/scenarios/${scenario.id}/checkpoint`)
                .send({ userId: 1 })
                .expect(200);

            expect(res.body).toEqual({ message: "Checkpoint je uspjesno kreiran!" });
        });

        test("404: Scenario ne postoji", async () => {
            const agent = request(app);

            const res = await agent
                .post("/api/scenarios/9999/checkpoint")
                .send({ userId: 1 })
                .expect(404);

            expect(res.body).toEqual({ message: "Scenario ne postoji!" });
        });

        test("Kreira više checkpointa za isti scenario", async () => {
            const agent = request(app);
            const scenario = await createScenario(agent, "Multi Checkpoint");

            await agent
                .post(`/api/scenarios/${scenario.id}/checkpoint`)
                .send({ userId: 1 })
                .expect(200);

            // Pričekaj malo da timestamp bude različit
            await new Promise(resolve => setTimeout(resolve, 1100));

            await agent
                .post(`/api/scenarios/${scenario.id}/checkpoint`)
                .send({ userId: 1 })
                .expect(200);

            const checkpointsRes = await agent
                .get(`/api/scenarios/${scenario.id}/checkpoints`)
                .expect(200);

            expect(checkpointsRes.body).toHaveLength(2);
        });
    });

    describe("GET /api/scenarios/:scenarioId/checkpoints", () => {
        test("200: Vraća praznu listu ako nema checkpointa", async () => {
            const agent = request(app);
            const scenario = await createScenario(agent, "Empty Checkpoints");

            const res = await agent
                .get(`/api/scenarios/${scenario.id}/checkpoints`)
                .expect(200);

            expect(res.body).toEqual([]);
        });

        test("200: Vraća listu checkpointa sa id i timestamp", async () => {
            const agent = request(app);
            const scenario = await createScenario(agent, "Checkpoints List");

            await agent
                .post(`/api/scenarios/${scenario.id}/checkpoint`)
                .send({ userId: 1 })
                .expect(200);

            const res = await agent
                .get(`/api/scenarios/${scenario.id}/checkpoints`)
                .expect(200);

            expect(res.body).toHaveLength(1);
            expect(res.body[0]).toHaveProperty("id");
            expect(res.body[0]).toHaveProperty("timestamp");
            expect(typeof res.body[0].id).toBe("number");
            expect(typeof res.body[0].timestamp).toBe("number");
        });

        test("404: Scenario ne postoji", async () => {
            const agent = request(app);

            const res = await agent
                .get("/api/scenarios/9999/checkpoints")
                .expect(404);

            expect(res.body).toEqual({ message: "Scenario ne postoji!" });
        });
    });

    describe("GET /api/scenarios/:scenarioId/restore/:checkpointId", () => {
        test("200: Vraća početno stanje ako nema delti prije checkpointa", async () => {
            const agent = request(app);
            const scenario = await createScenario(agent, "Restore Empty");

            // Kreiraj checkpoint odmah nakon kreiranja scenarija
            await agent
                .post(`/api/scenarios/${scenario.id}/checkpoint`)
                .send({ userId: 1 })
                .expect(200);

            const checkpointsRes = await agent
                .get(`/api/scenarios/${scenario.id}/checkpoints`)
                .expect(200);

            const checkpointId = checkpointsRes.body[0].id;

            const res = await agent
                .get(`/api/scenarios/${scenario.id}/restore/${checkpointId}`)
                .expect(200);

            expect(res.body).toHaveProperty("id", scenario.id);
            expect(res.body).toHaveProperty("title", "Restore Empty");
            expect(res.body).toHaveProperty("status", "U radu");
            expect(res.body).toHaveProperty("content");
            expect(res.body.content).toHaveLength(1);
            expect(res.body.content[0]).toMatchObject({
                lineId: 1,
                nextLineId: null,
                text: "",
            });
        });

        test("200: Vraća stanje scenarija sa primijenjenim deltama", async () => {
            const agent = request(app);
            const scenario = await createScenario(agent, "Restore With Deltas");

            // Zaključaj i ažuriraj liniju
            await lockLine(agent, scenario.id, 1, 1);
            await updateLine(agent, scenario.id, 1, 1, ["Prva linija teksta"]);

            // Kreiraj checkpoint
            await agent
                .post(`/api/scenarios/${scenario.id}/checkpoint`)
                .send({ userId: 1 })
                .expect(200);

            const checkpointsRes = await agent
                .get(`/api/scenarios/${scenario.id}/checkpoints`)
                .expect(200);

            const checkpointId = checkpointsRes.body[0].id;

            const res = await agent
                .get(`/api/scenarios/${scenario.id}/restore/${checkpointId}`)
                .expect(200);

            expect(res.body.content.length).toBeGreaterThanOrEqual(1);
            const hasText = res.body.content.some(l => l.text.includes("Prva linija teksta"));
            expect(hasText).toBe(true);
        });

        test("200: Restore ne uključuje delte nakon checkpointa", async () => {
            const agent = request(app);
            const scenario = await createScenario(agent, "Restore Time Travel");

            // Zaključaj i ažuriraj liniju - PRIJE checkpointa
            await lockLine(agent, scenario.id, 1, 1);
            await updateLine(agent, scenario.id, 1, 1, ["Tekst prije checkpointa"]);

            // Kreiraj checkpoint
            await agent
                .post(`/api/scenarios/${scenario.id}/checkpoint`)
                .send({ userId: 1 })
                .expect(200);

            const checkpointsRes = await agent
                .get(`/api/scenarios/${scenario.id}/checkpoints`)
                .expect(200);

            const checkpointId = checkpointsRes.body[0].id;

            // Pričekaj da prođe neko vrijeme
            await new Promise(resolve => setTimeout(resolve, 1100));

            // Ažuriraj liniju NAKON checkpointa
            await lockLine(agent, scenario.id, 1, 1);
            await updateLine(agent, scenario.id, 1, 1, ["Tekst poslije checkpointa"]);

            // Restore na checkpoint - trebao bi vratiti stanje PRIJE druge izmjene
            const res = await agent
                .get(`/api/scenarios/${scenario.id}/restore/${checkpointId}`)
                .expect(200);

            const hasOldText = res.body.content.some(l => 
                l.text.includes("Tekst prije checkpointa")
            );
            const hasNewText = res.body.content.some(l => 
                l.text.includes("Tekst poslije checkpointa")
            );

            expect(hasOldText).toBe(true);
            expect(hasNewText).toBe(false);
        });

        test("404: Scenario ne postoji", async () => {
            const agent = request(app);

            const res = await agent
                .get("/api/scenarios/9999/restore/1")
                .expect(404);

            expect(res.body).toEqual({ message: "Scenario ne postoji!" });
        });

        test("404: Checkpoint ne postoji", async () => {
            const agent = request(app);
            const scenario = await createScenario(agent, "No Checkpoint");

            const res = await agent
                .get(`/api/scenarios/${scenario.id}/restore/9999`)
                .expect(404);

            expect(res.body).toEqual({ message: "Checkpoint ne postoji!" });
        });

        test("404: Checkpoint pripada drugom scenariju", async () => {
            const agent = request(app);
            const scenario1 = await createScenario(agent, "Scenario 1");
            const scenario2 = await createScenario(agent, "Scenario 2");

            // Kreiraj checkpoint za scenario1
            await agent
                .post(`/api/scenarios/${scenario1.id}/checkpoint`)
                .send({ userId: 1 })
                .expect(200);

            const checkpointsRes = await agent
                .get(`/api/scenarios/${scenario1.id}/checkpoints`)
                .expect(200);

            const checkpointId = checkpointsRes.body[0].id;

            // Pokušaj restore checkpoint scenario1 na scenario2
            const res = await agent
                .get(`/api/scenarios/${scenario2.id}/restore/${checkpointId}`)
                .expect(404);

            expect(res.body).toEqual({ message: "Checkpoint ne postoji!" });
        });
    });

    describe("Restore sa višestrukim promjenama", () => {
        test("200: Restore vraća ispravan scenarij sa svim promjenama do checkpointa", async () => {
            const agent = request(app);
            const scenario = await createScenario(agent, "Complex Restore");

            // Dodaj tekst - prva izmjena
            await lockLine(agent, scenario.id, 1, 1);
            await updateLine(agent, scenario.id, 1, 1, ["Prva verzija teksta"]);

            // Dodaj više teksta - druga izmjena
            await lockLine(agent, scenario.id, 1, 1);
            await updateLine(agent, scenario.id, 1, 1, ["Druga verzija teksta sa više sadržaja"]);

            // Kreiraj checkpoint
            await agent
                .post(`/api/scenarios/${scenario.id}/checkpoint`)
                .send({ userId: 1 })
                .expect(200);

            const checkpointsRes = await agent
                .get(`/api/scenarios/${scenario.id}/checkpoints`)
                .expect(200);

            const checkpointId = checkpointsRes.body[0].id;

            const res = await agent
                .get(`/api/scenarios/${scenario.id}/restore/${checkpointId}`)
                .expect(200);

            // Provjeri da restore vraća scenarij sa drugim tekstom
            expect(res.body).toHaveProperty("id", scenario.id);
            expect(res.body).toHaveProperty("content");
            expect(res.body.content.length).toBeGreaterThanOrEqual(1);
            
            const hasSecondVersion = res.body.content.some(l => 
                l.text.includes("Druga verzija")
            );
            expect(hasSecondVersion).toBe(true);
        });
    });
});
