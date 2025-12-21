const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const app = express();
const PORT = 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const DATA_DIR = path.join(__dirname, "data"); //globalna varijabla do fajla, postoji samo kroz commonJS
const SCENARIOS_DIR = path.join(DATA_DIR, "scenarios");
const DELTAS_FILE = path.join(DATA_DIR, "deltas.json");
const LOCKS_FILE = path.join(DATA_DIR, "locks.json");


async function ensureStorage() {
    await fs.mkdir(DATA_DIR, { recursive: true });  //napravi foldere sve, ne mora postojati parent
    await fs.mkdir(SCENARIOS_DIR, { recursive: true });

    try {
        await fs.access(DELTAS_FILE);
    } catch (_) { //po konvenciji bilo sta
        await fs.writeFile(DELTAS_FILE, JSON.stringify([], null, 2));
    }

    try {
        await fs.access(LOCKS_FILE);
    } catch (_) {
        await fs.writeFile(LOCKS_FILE, JSON.stringify([], null, 2));
    }
}

async function readJson(filePath, fallback) { //ako ne uspijemo procitat file, neka se vrati vrijednost koja je poslana kao drugi parametar
    try {
        const content = await fs.readFile(filePath, "utf-8"); //utf-8 za enkodiranje, da ne bismo dobili buffer
        return JSON.parse(content);
    } catch (err) {
        return fallback;
    }
}

//propagirat cemo gresku
async function writeJson(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2)); //null neki dodatne stvari koje prilikom enkodiranja mozemo navesti, kako ce se intepretirati neke stvari
}

//vraca id scenarija koje postoje u datotekama
async function listScenarioIds() {
    try {
        const entries = await fs.readdir(SCENARIOS_DIR); //direktno dobijemo niz stringova koji su fajlovi; kod AXIOSA bi bio objekt gdje imamo data
        return entries
            .map((name) => {
                const match = name.match(/^scenario-(\d+)\.json$/); // da li odgovara ovom regexu
                return match ? Number(match[1]) : null; //dobijemo prvu capture grupu
            })
            .filter((id) => Number.isInteger(id));//filtrira null
    } catch (_) {
        return [];
    }
}

async function readScenario(id) {
    const filePath = path.join(SCENARIOS_DIR, `scenario-${id}.json`);
    return readJson(filePath, null);
}

//ovo prepisuje preko cijelog fajla
async function writeScenario(id, data) {
    const filePath = path.join(SCENARIOS_DIR, `scenario-${id}.json`);
    await writeJson(filePath, data);
}

app.post("/api/scenarios", async (req, res) => {
    try {
        await ensureStorage();

        const providedTitle = typeof req.body.title === "string" ? req.body.title.trim() : ""; //typeof uvijek vraca string kao tip pod
        const title = providedTitle.length > 0 ? providedTitle : "Neimenovani scenarij";

        const ids = await listScenarioIds();
        const nextId = ids.length > 0 ? Math.max(...ids) + 1 : 1;

        const newScenario = {
            id: nextId,
            title,
            content: [
                {
                    lineId: 1,
                    nextLineId: null,
                    text: "",
                },
            ],
        };

        await writeScenario(nextId, newScenario);

        return res.status(200).json(newScenario);
    } catch (err) {
        console.error("Failed to create scenario", err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

app.post("/api/scenarios/:scenarioId/lines/:lineId/lock", async (req, res) => {
    const userId = Number(req.body.userId);//Number(null) vraca 0, dok Number(undefined) vraca NaN
    const scenarioId = Number(req.params.scenarioId);
    const lineId = Number(req.params.lineId);

    //moj response
    if (!Number.isInteger(userId) || userId < 1) {//ako je proslijedjen null ili NaN
        return res.status(400).json({ message: "Neispravan userId" });
    }

    if (!Number.isInteger(scenarioId) || scenarioId < 1) {
        return res.status(404).json({ message: "Scenario ne postoji!" });
    }

    if (!Number.isInteger(lineId) || lineId < 1) {
        return res.status(404).json({ message: "Linija ne postoji!" });
    }

    try {
        await ensureStorage();//da napravi potrebnu strukturu ako je nemamo do sada
        const scenario = await readScenario(scenarioId);
        
        if (!scenario) {
            return res.status(404).json({ message: "Scenario ne postoji!" });
        }

        const line = scenario.content.find((l) => l.lineId === lineId);
        if (!line) {
            return res.status(404).json({ message: "Linija ne postoji!" });
        }

        const locks = await readJson(LOCKS_FILE, []);

        const existingLockOnLine = locks.find(
            (lock) => lock.scenarioId === scenarioId && lock.lineId === lineId
        );

        if (existingLockOnLine && existingLockOnLine.userId !== userId) {
            return res.status(409).json({ message: "Linija je vec zakljucana!" });
        }

        const filteredLocks = locks.filter((lock) => lock.userId !== userId); //ovo ce izostaviti eventualno jednu zakljucanu liniju

        // Ako nema locka ili je lock vec nas, upisi/obnovi nas lock (drugi korisnik je vec odbijen gore).
        if (!existingLockOnLine || existingLockOnLine.userId === userId) {
            filteredLocks.push({ scenarioId, lineId, userId });
        }

        await writeJson(LOCKS_FILE, filteredLocks);
        return res.status(200).json({ message: "Linija je uspjesno zakljucana!" });
    } catch (err) {
        console.error("Failed to lock line", err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});