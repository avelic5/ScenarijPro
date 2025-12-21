const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const app = express();
const PORT = 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serviraj frontend fajlove da browser radi na istoj origin domeni (bez CORS problema)
app.use(express.static(path.join(__dirname, "public")));

const DATA_DIR = path.join(__dirname, "data"); //globalna varijabla do fajla, postoji samo kroz commonJS
const SCENARIOS_DIR = path.join(DATA_DIR, "scenarios");
const DELTAS_FILE = path.join(DATA_DIR, "deltas.json");
const LOCKS_FILE = path.join(DATA_DIR, "locks.json");
const CHAR_LOCKS_FILE = path.join(DATA_DIR, "character-locks.json");


// --HELPERS--
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

    try {
        await fs.access(CHAR_LOCKS_FILE);
    } catch (_) {
        await fs.writeFile(CHAR_LOCKS_FILE, JSON.stringify([], null, 2));
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

//podijeliPoRijecima
function chunkByWords(text) {
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (trimmed.length === 0) return [""];
    // Ukloni HTML tagove i pronađi riječi: slova s opcionalnim '-' ili '\'' unutar.
    const withoutTags = trimmed.replace(/<[^>]*>/g, " ");
    const tokens = withoutTags.match(/[A-Za-zŠĐČĆŽšđčćž]+(?:['-][A-Za-zŠĐČĆŽšđčćž]+)*/g) || []; //vraća ili niz pogodaka ili null
    if (tokens.length === 0) return [""];
    const chunks = [];
    for (let i = 0; i < tokens.length; i += 20) {
        chunks.push(tokens.slice(i, i + 20).join(" "));
    }
    return chunks;//stringovi rasporedjeni
}

function isRoleText(text) {
    const t = typeof text === "string" ? text.trim() : "";
    if (t.length === 0) return false;
    const onlyUpperAndSpace = /^[A-ZŠĐČĆŽ ]+$/;
    const hasLetter = /[A-ZŠĐČĆŽ]/;
    return onlyUpperAndSpace.test(t) && hasLetter.test(t);
}

function getRoleLineIdsOrdered(orderedLines) {
    const ids = new Set();
    for (let i = 0; i < orderedLines.length; i++) {
        const current = orderedLines[i];
        if (!current || !isRoleText(current.text)) continue;

        // "odmah ispod" -> tražimo prvu sljedeću nepraznu liniju
        let j = i + 1;
        while (j < orderedLines.length && String(orderedLines[j]?.text ?? "").trim().length === 0) j++;
        if (j >= orderedLines.length) continue;

        const nextLine = orderedLines[j];
        const nextTrimmed = String(nextLine?.text ?? "").trim();
        const isSpeech = nextTrimmed.length > 0 && !isRoleText(nextTrimmed);
        if (isSpeech) ids.add(current.lineId);
    }
    return ids;
}

// Vrati content poredan po nextLineId lancu; fallback na lineId ako fali veza
function orderContent(lines) {
    if (!Array.isArray(lines) || lines.length === 0) return [];

    const byId = new Map();
    const pointed = new Set();
    for (const l of lines) {
        if (Number.isInteger(l?.lineId)) {
            byId.set(l.lineId, l);
            if (Number.isInteger(l.nextLineId)) {
                pointed.add(l.nextLineId);
            }
        }
    }

    const candidates = [...byId.keys()].filter((id) => !pointed.has(id));
    const headId = candidates.length > 0 ? Math.min(...candidates) : Math.min(...byId.keys());

    const ordered = [];
    const visited = new Set();
    let currentId = headId;
    for (let i = 0; i < byId.size; i++) {
        if (!byId.has(currentId) || visited.has(currentId)) break;
        const node = byId.get(currentId);
        ordered.push(node);
        visited.add(currentId);
        currentId = node.nextLineId;
    }

    // Dodaj sve nepovezane, sortiranjem po lineId radi stabilnosti
    const leftovers = [...byId.values()].filter((l) => !visited.has(l.lineId));
    leftovers.sort((a, b) => a.lineId - b.lineId);
    return [...ordered, ...leftovers];
}

async function appendDelta(delta) {
    const deltas = await readJson(DELTAS_FILE, []);
    deltas.push(delta);
    await writeJson(DELTAS_FILE, deltas);
}

// --API ROUTES--
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

app.put("/api/scenarios/:scenarioId/lines/:lineId", async (req, res) => {
    const userId = Number(req.body.userId);
    const scenarioId = Number(req.params.scenarioId);
    const lineId = Number(req.params.lineId);
    const newText = req.body.newText;

    if (!Number.isInteger(userId) || userId < 1) {
        return res.status(400).json({ message: "Neispravan userId" });
    }

    if (!Array.isArray(newText) || newText.length === 0) {
        return res.status(400).json({ message: "Niz new_text ne smije biti prazan!" });
    }

    try {
        await ensureStorage();
        const scenario = await readScenario(scenarioId);

        if (!scenario) {
            return res.status(404).json({ message: "Scenario ne postoji!" });
        }

        const targetLine = scenario.content.find((l) => l.lineId === lineId);
        if (!targetLine) {
            return res.status(404).json({ message: "Linija ne postoji!" });
        }

        const locks = await readJson(LOCKS_FILE, []);
        const lock = locks.find((l) => l.scenarioId === scenarioId && l.lineId === lineId);

        if (!lock) {
            return res.status(409).json({ message: "Linija nije zakljucana!" });
        }

        if (lock.userId !== userId) {
            return res.status(409).json({ message: "Linija je vec zakljucana!" });//od strane nekog drugog
        }

        const flattened = newText.map(txt => chunkByWords(txt)).flat(); //stavi sve u jedan niz


        // Build new lines to insert
        const maxLineId = scenario.content.reduce((max, l) => Math.max(max, l.lineId), 0);//prva vr trenutno najveca, druga trenutna i rez ce biti sljedeca najveca
        let nextAvailableId = maxLineId + 1;

        const oldNext = targetLine.nextLineId;

        const newLines = flattened.map((text, idx) => {
            const id = idx === 0 ? targetLine.lineId : nextAvailableId++; //prvi dio ide na trazenu poziciju, prelom ide na kraj, na prvo slobodno mjesto
            const nextId = idx === flattened.length - 1 ? oldNext : nextAvailableId;//ovo je za next id da mogu citati kada budem na frontendu povezivao
            return { lineId: id, nextLineId: nextId, text };
        });

        // daj mi sve linije, osim one linije koja se mijenjala
        const remaining = scenario.content.filter((l) => l.lineId !== targetLine.lineId);
        const updatedContent = [...remaining, ...newLines];

        scenario.content = updatedContent;

        await writeScenario(scenarioId, scenario);

        // Unlock the line for this user
        const remainingLocks = locks.filter((l) => !(l.scenarioId === scenarioId && l.lineId === lineId));//sve osim trenutne linije
        await writeJson(LOCKS_FILE, remainingLocks);

        // Append delta for each new line
        const ts = Math.floor(Date.now() / 1000);
        for (const nl of newLines) { //petlja za nizove
            await appendDelta({
                scenarioId,
                type: "line_update",
                lineId: nl.lineId,
                nextLineId: nl.nextLineId,
                content: nl.text,
                timestamp: ts,
            });
        }

        return res.status(200).json({ message: "Linija je uspjesno azurirana!" });
    } catch (err) {
        console.error("Failed to update line", err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

// Zakljucavanje imena uloge u cijelom scenariju
app.post("/api/scenarios/:scenarioId/characters/lock", async (req, res) => {
    const userId = Number(req.body.userId);
    const scenarioId = Number(req.params.scenarioId);
    const characterNameRaw = typeof req.body.characterName === "string" ? req.body.characterName.trim() : "";

    if (!Number.isInteger(userId) || userId < 1) {
        return res.status(400).json({ message: "Neispravan userId" });
    }

    // dozvoljena su samo velika slova i razmaci, mora imati barem jedno slovo
    const onlyUpperAndSpace = /^[A-ZŠĐČĆŽ ]+$/;
    const hasLetter = /[A-ZŠĐČĆŽ]/;
    if (!onlyUpperAndSpace.test(characterNameRaw) || !hasLetter.test(characterNameRaw)) { //ima makar jedno podudaranje
        return res.status(400).json({ message: "Neispravno ime lika" });
    }

    try {
        await ensureStorage();
        const scenario = await readScenario(scenarioId);

        if (!scenario) {
            return res.status(404).json({ message: "Scenario ne postoji!" });
        }

        const locks = await readJson(CHAR_LOCKS_FILE, []);
        const existing = locks.find(
            (lock) => lock.scenarioId === scenarioId && lock.characterName === characterNameRaw
        );

        if (existing && existing.userId !== userId) {
            return res.status(409).json({ message: "Konflikt! Ime lika je vec zakljucano!" });
        }

        // ukloni eventualni stari zapis za isto ime (isti korisnik), pa upisi novi
        const updated = locks.filter(
            (lock) => !(lock.scenarioId === scenarioId && lock.characterName === characterNameRaw)
        );
        updated.push({ scenarioId, characterName: characterNameRaw, userId });

        await writeJson(CHAR_LOCKS_FILE, updated);
        return res.status(200).json({ message: "Ime lika je uspjesno zakljucano!" });
    } catch (err) {
        console.error("Failed to lock character name", err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

// Promjena imena uloge u cijelom scenariju
app.post("/api/scenarios/:scenarioId/characters/update", async (req, res) => {
    const userId = Number(req.body.userId);
    const scenarioId = Number(req.params.scenarioId);
    const oldNameRaw = typeof req.body.oldName === "string" ? req.body.oldName.trim() : "";
    const newNameRaw = typeof req.body.newName === "string" ? req.body.newName.trim() : "";

    if (!Number.isInteger(userId) || userId < 1) {
        return res.status(400).json({ message: "Neispravan userId" });
    }

    const onlyUpperAndSpace = /^[A-ZŠĐČĆŽ ]+$/;
    const hasLetter = /[A-ZŠĐČĆŽ]/;
    const validOld = onlyUpperAndSpace.test(oldNameRaw) && hasLetter.test(oldNameRaw);
    const validNew = onlyUpperAndSpace.test(newNameRaw) && hasLetter.test(newNameRaw);

    if (!validOld || !validNew) {
        return res.status(400).json({ message: "Neispravno ime lika" });
    }

    try {
        await ensureStorage();
        const scenario = await readScenario(scenarioId);

        if (!scenario) {
            return res.status(404).json({ message: "Scenario ne postoji!" });
        }

        const locks = await readJson(CHAR_LOCKS_FILE, []);
        const existing = locks.find(
            (lock) => lock.scenarioId === scenarioId && lock.characterName === oldNameRaw
        );

        if (!existing) {
            return res.status(409).json({ message: "Ime lika nije zakljucano!" });
        }

        if (existing.userId !== userId) {
            return res.status(409).json({ message: "Ime lika je vec zakljucano!" });
        }

        // Zamijeni ime samo na linijama koje su zaista "uloge" po definiciji (ALL CAPS + govor ispod)
        const ordered = orderContent(scenario.content);
        const roleLineIds = getRoleLineIdsOrdered(ordered);
        scenario.content = scenario.content.map((line) => {
            if (roleLineIds.has(line.lineId) && line.text === oldNameRaw) {
                return { ...line, text: newNameRaw }; //override
            }
            return line;
        });

        await writeScenario(scenarioId, scenario);

        // Ukloni lock za to ime, samo njega
        const remainingLocks = locks.filter(
            (lock) => !(lock.scenarioId === scenarioId && lock.characterName === oldNameRaw)
        );
        await writeJson(CHAR_LOCKS_FILE, remainingLocks);

        // Upisi delta zapis
        const ts = Math.floor(Date.now() / 1000);
        await appendDelta({
            scenarioId,
            type: "char_rename",
            oldName: oldNameRaw,
            newName: newNameRaw,
            timestamp: ts,
        });

        return res.status(200).json({ message: "Ime lika je uspjesno promijenjeno!" });
    } catch (err) {
        console.error("Failed to update character name", err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

// Pregled promjena (deltas) nakon zadatog vremena
app.get("/api/scenarios/:scenarioId/deltas", async (req, res) => {
    const scenarioId = Number(req.params.scenarioId);
    const sinceRaw = req.query.since;
    const since = Number.isFinite(Number(sinceRaw)) ? Number(sinceRaw) : 0;

    try {
        await ensureStorage();
        const scenario = await readScenario(scenarioId);

        if (!scenario) {
            return res.status(404).json({ message: "Scenario ne postoji!" });
        }

        const deltas = await readJson(DELTAS_FILE, []);
        const filtered = deltas
            .filter((d) => d.scenarioId === scenarioId && Number(d.timestamp) > since)
            .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));

        // Response format (bez scenarioId u svakom delta objektu)
        const responseDeltas = filtered.map(({ scenarioId: _sid, ...rest }) => rest);
        return res.status(200).json({ deltas: responseDeltas });
    } catch (err) {
        console.error("Failed to fetch deltas", err);
        return res.status(500).json({ message: "Internal server error" });
    }
});
// Dohvati cijeli scenario sa poredanim linijama
app.get("/api/scenarios/:scenarioId", async (req, res) => {
    const scenarioId = Number(req.params.scenarioId);

    try {
        await ensureStorage();
        const scenario = await readScenario(scenarioId);

        if (!scenario) {
            return res.status(404).json({ message: "Scenario ne postoji!" });
        }

        const ordered = orderContent(scenario.content);
        return res.status(200).json({ ...scenario, content: ordered });
    } catch (err) {
        console.error("Failed to fetch scenario", err);
        return res.status(500).json({ message: "Internal server error" });
    }
});
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);

});