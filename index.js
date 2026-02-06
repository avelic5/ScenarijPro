const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const { sequelize, Scenario, Line, Delta, Checkpoint, User } = require("./models");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Nevalidan JSON body -> vrati JSON error (umjesto default HTML error stranice)
app.use((err, _req, res, next) => {
  const isJsonParseError =
    err instanceof SyntaxError ||
    err?.type === "entity.parse.failed" ||
    err?.status === 400;

  if (isJsonParseError && err?.body !== undefined) {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  return next(err);
});

// Serviraj frontend fajlove da browser radi na istoj origin domeni (bez CORS problema)
app.use(express.static(path.join(__dirname, "public")));

// Defaultna ruta - preusmjeri na login.html
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "html", "login.html"));
});

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "data"); //globalna varijabla do fajla, postoji samo kroz commonJS
const LOCKS_FILE = path.join(DATA_DIR, "locks.json");
const CHAR_LOCKS_FILE = path.join(DATA_DIR, "character-locks.json");

// Inicijalizacija baze podataka
async function initializeDatabase() {
  try {
    await sequelize.authenticate();
    console.log("Uspješno povezano sa PostgreSQL bazom podataka.");

    const shouldForceSync = process.env.DB_SYNC_FORCE === "true";
    await sequelize.sync({ force: shouldForceSync });
    console.log(
      shouldForceSync
        ? "Tabele su uspješno kreirane (force sync)."
        : "Tabele su uspješno provjerene/sinhronizovane."
    );
    return;
  } catch (error) {
    console.error("Greška prilikom povezivanja sa bazom:", error);
    throw error;
  }
}



// --HELPERS--
async function ensureStorage() {
  await fs.mkdir(DATA_DIR, { recursive: true }); //napravi foldere sve, ne mora postojati parent

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

async function readJson(filePath, fallback) {
  //ako ne uspijemo procitat file, neka se vrati vrijednost koja je poslana kao drugi parametar
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

//vraca id scenarija koje postoje u bazi (za kompatibilnost)
async function listScenarioIds() {
  try {
    const scenarios = await Scenario.findAll({
      attributes: ["id"],
      order: [["id", "ASC"]],
    });
    return scenarios.map((s) => s.id);
  } catch (_) {
    return [];
  }
}

async function readScenario(id) {
  const scenario = await Scenario.findByPk(id);
  if (!scenario) return null;
  const lines = await Line.findAll({
    where: { scenarioId: id },
  });
  const content = lines.map((l) => ({
    lineId: l.lineId,
    nextLineId: l.nextLineId,
    text: l.text,
  }));
  return {
    id: scenario.id,
    title: scenario.title,
    status: "U radu",
    content,
  };
}

//ovo kreira/ažurira scenarij u bazi
async function writeScenario(id, data) {
  const [scenario] = await Scenario.upsert({
    id,
    title: data.title || "Neimenovani scenarij",
  });
  // Obriši stare linije
  await Line.destroy({ where: { scenarioId: id } });
  // Kreiraj nove linije
  if (Array.isArray(data.content)) {
    for (const line of data.content) {
      await Line.create({
        lineId: line.lineId,
        nextLineId: line.nextLineId,
        text: line.text,
        scenarioId: id,
      });
    }
  }
}

//podijeliPoRijecima
function chunkByWords(text) {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (trimmed.length === 0) return [""];
  // Ukloni HTML tagove (oznake HTML elemenata se ne smatraju riječima).
  // Važno: ne smijemo "izgubiti" brojeve i interpunkciju iz teksta pri spremanju,
  // ali po definiciji riječi oni se ne broje kao riječi.
  const withoutTags = trimmed.replace(/<[^>]*>/g, " ");

  // Riječ: slova s opcionalnim '-' ili '\'' unutar riječi.
  // Brojevi i samostalna interpunkcija NE ulaze u broj riječi, ali ostaju u tekstu.
  const wordRegex = /[A-Za-zŠĐČĆŽšđčćž]+(?:['-][A-Za-zŠĐČĆŽšđčćž]+)*/g;

  const parts = withoutTags.split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return [""];

  const chunks = [];
  let currentParts = [];
  let currentWordCount = 0;

  for (const part of parts) {
    const wordsInPart = (part.match(wordRegex) || []).length;

    // Prelomi kad prelazimo 20 riječi, ali nikad ne ostavi prazan chunk.
    if (currentParts.length > 0 && currentWordCount + wordsInPart > 20) {
      chunks.push(currentParts.join(" "));
      currentParts = [];
      currentWordCount = 0;
    }

    currentParts.push(part);
    currentWordCount += wordsInPart;
  }

  if (currentParts.length > 0) chunks.push(currentParts.join(" "));
  return chunks;
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
    while (
      j < orderedLines.length &&
      String(orderedLines[j]?.text ?? "").trim().length === 0
    )
      j++;
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
  const headId =
    candidates.length > 0 ? Math.min(...candidates) : Math.min(...byId.keys());

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

// --AUTH HELPERS--
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function verifyPassword(password, hashedPassword) {
  return hashPassword(password) === hashedPassword;
}

// --AUTH ROUTES--

// Registracija korisnika
app.post("/api/auth/register", async (req, res) => {
  try {
    const firstName = typeof req.body?.firstName === "string" ? req.body.firstName.trim() : "";
    const lastName = typeof req.body?.lastName === "string" ? req.body.lastName.trim() : "";
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    // Validacija
    if (!firstName || !lastName) {
      return res.status(400).json({ message: "Ime i prezime su obavezni." });
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Unesite ispravnu email adresu." });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Lozinka mora imati minimalno 6 znakova." });
    }

    // Provjeri da li korisnik već postoji
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ message: "Korisnik s ovom email adresom već postoji." });
    }

    // Kreiraj korisnika
    const hashedPassword = hashPassword(password);
    const newUser = await User.create({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role: 'user'
    });

    return res.status(201).json({
      message: "Registracija uspješna!",
      user: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role
      }
    });
  } catch (err) {
    console.error("Registration error:", err);
    return res.status(500).json({ message: "Greška pri registraciji." });
  }
});

// Prijava korisnika
app.post("/api/auth/login", async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!email || !password) {
      return res.status(400).json({ message: "Email i lozinka su obavezni." });
    }

    // Pronađi korisnika
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ message: "Pogrešan email ili lozinka." });
    }

    // Provjeri lozinku
    if (!verifyPassword(password, user.password)) {
      return res.status(401).json({ message: "Pogrešan email ili lozinka." });
    }

    return res.status(200).json({
      message: "Prijava uspješna!",
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Greška pri prijavi." });
  }
});

// Dohvati trenutnog korisnika (po ID-u)
app.get("/api/auth/user/:userId", async (req, res) => {
  const userId = Number(req.params.userId);

  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ message: "Neispravan ID korisnika." });
  }

  try {
    const user = await User.findByPk(userId, {
      attributes: ['id', 'email', 'firstName', 'lastName', 'role', 'createdAt']
    });

    if (!user) {
      return res.status(404).json({ message: "Korisnik nije pronađen." });
    }

    return res.status(200).json({ user });
  } catch (err) {
    console.error("Get user error:", err);
    return res.status(500).json({ message: "Greška pri dohvaćanju korisnika." });
  }
});

// Ažuriraj korisnika
app.put("/api/auth/user/:userId", async (req, res) => {
  const userId = Number(req.params.userId);

  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ message: "Neispravan ID korisnika." });
  }

  const { email, firstName, lastName, currentPassword, newPassword } = req.body;

  try {
    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({ message: "Korisnik nije pronađen." });
    }

    // Ako se mijenja lozinka, provjeri staru lozinku
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ message: "Morate unijeti trenutnu lozinku." });
      }

      if (!verifyPassword(currentPassword, user.password)) {
        return res.status(400).json({ message: "Trenutna lozinka nije ispravna." });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: "Nova lozinka mora imati najmanje 6 znakova." });
      }

      user.password = hashPassword(newPassword);
    }

    // Ažuriraj ostale podatke
    if (email && email !== user.email) {
      // Provjeri da li email već postoji
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser && existingUser.id !== userId) {
        return res.status(400).json({ message: "Email adresa je već zauzeta." });
      }
      user.email = email;
    }

    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;

    await user.save();

    // Vrati ažuriranog korisnika (bez lozinke)
    const updatedUser = await User.findByPk(userId, {
      attributes: ['id', 'email', 'firstName', 'lastName', 'role', 'createdAt']
    });

    return res.status(200).json({
      message: "Podaci su uspješno ažurirani.",
      user: updatedUser
    });
  } catch (err) {
    console.error("Update user error:", err);
    return res.status(500).json({ message: "Greška pri ažuriranju korisnika." });
  }
});

// Obriši korisnika
app.delete("/api/auth/user/:userId", async (req, res) => {
  const userId = Number(req.params.userId);

  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ message: "Neispravan ID korisnika." });
  }

  const { password } = req.body;

  try {
    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({ message: "Korisnik nije pronađen." });
    }

    // Provjeri lozinku za brisanje
    if (!password) {
      return res.status(400).json({ message: "Morate unijeti lozinku za brisanje računa." });
    }

    if (!verifyPassword(password, user.password)) {
      return res.status(400).json({ message: "Lozinka nije ispravna." });
    }

    await user.destroy();

    return res.status(200).json({ message: "Račun je uspješno obrisan." });
  } catch (err) {
    console.error("Delete user error:", err);
    return res.status(500).json({ message: "Greška pri brisanju korisnika." });
  }
});

// --API ROUTES--
app.post("/api/scenarios", async (req, res) => {
  try {
    const providedTitle =
      typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const title =
      providedTitle.length > 0 ? providedTitle : "Neimenovani scenarij";

    // Kreiraj novi scenarij u bazi
    const newScenario = await Scenario.create({ title });

    // Kreiraj početnu liniju za scenarij
    await Line.create({
      lineId: 1,
      nextLineId: null,
      text: "",
      scenarioId: newScenario.id,
    });

    // Dohvati linije za response
    const lines = await Line.findAll({
      where: { scenarioId: newScenario.id },
      attributes: ["lineId", "nextLineId", "text"],
    });

    const content = lines.map((l) => ({
      lineId: l.lineId,
      nextLineId: l.nextLineId,
      text: l.text,
    }));

    return res.status(200).json({
      id: newScenario.id,
      title: newScenario.title,
      status: "U radu",
      content,
    });
  } catch (err) {
    console.error("Failed to create scenario", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// Lista postojećih scenarija (za Projects stranicu)
app.get("/api/scenarios", async (_req, res) => {
  try {
    const allScenarios = await Scenario.findAll({
      order: [["id", "ASC"]],
    });

    const scenarios = allScenarios.map((s) => ({
      id: s.id,
      title: s.title || `Scenarij ${s.id}`,
      status: "U radu",
      lastModified: null,
    }));

    return res.status(200).json({ scenarios });
  } catch (err) {
    console.error("Failed to list scenarios", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// Ažuriraj status scenarija (slobodan tekst)
app.put("/api/scenarios/:scenarioId/status", async (req, res) => {
  const scenarioId = Number(req.params.scenarioId);
  const statusRaw =
    typeof req.body.status === "string" ? req.body.status.trim() : "";

  if (!Number.isInteger(scenarioId) || scenarioId < 1) {
    return res.status(404).json({ message: "Scenario ne postoji!" });
  }

  if (statusRaw.length === 0) {
    return res.status(400).json({ message: "Status ne smije biti prazan!" });
  }

  try {
    const scenario = await Scenario.findByPk(scenarioId);

    if (!scenario) {
      return res.status(404).json({ message: "Scenario ne postoji!" });
    }

    // Status se čuva samo u memoriji za sada jer nije u modelu
    return res
      .status(200)
      .json({ message: "Status je uspješno ažuriran!", status: statusRaw });
  } catch (err) {
    console.error("Failed to update scenario status", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/api/scenarios/:scenarioId/lines/:lineId/lock", async (req, res) => {
  const userId = Number(req.body.userId);
  const scenarioId = Number(req.params.scenarioId);
  const lineId = Number(req.params.lineId);

  if (!Number.isInteger(scenarioId) || scenarioId < 1) {
    return res.status(404).json({ message: "Scenario ne postoji!" });
  }

  if (!Number.isInteger(lineId) || lineId < 1) {
    return res.status(404).json({ message: "Linija ne postoji!" });
  }

  try {
    await ensureStorage();
    const scenario = await Scenario.findByPk(scenarioId);
    if (!scenario) {
      return res.status(404).json({ message: "Scenario ne postoji!" });
    }

    const line = await Line.findOne({
      where: { scenarioId, lineId },
    });
    if (!line) {
      return res.status(404).json({ message: "Linija ne postoji!" });
    }

    const locks = await readJson(LOCKS_FILE, []);

    const existingLockOnLine = locks.find(
      (lock) => lock.scenarioId === scenarioId && lock.lineId === lineId,
    );

    if (existingLockOnLine && existingLockOnLine.userId !== userId) {
      return res.status(409).json({ message: "Linija je vec zakljucana!" });
    }

    const filteredLocks = locks.filter((lock) => lock.userId !== userId);

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

// Otključaj sve linije koje je zaključao dati korisnik (globalno, kroz sve scenarije)
app.post("/api/locks/release", async (req, res) => {
  const userId = Number(req.body.userId);

  try {
    await ensureStorage();
    const locks = await readJson(LOCKS_FILE, []);
    const before = Array.isArray(locks) ? locks.length : 0;
    const remaining = Array.isArray(locks)
      ? locks.filter((l) => Number(l?.userId) !== userId)
      : [];
    const released = before - remaining.length;

    if (released > 0) {
      await writeJson(LOCKS_FILE, remaining);
    }

    return res
      .status(200)
      .json({ message: "Lockovi su otključani.", released });
  } catch (err) {
    console.error("Failed to release locks", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.put("/api/scenarios/:scenarioId/lines/:lineId", async (req, res) => {
  const userId = Number(req.body.userId);
  const scenarioId = Number(req.params.scenarioId);
  const lineId = Number(req.params.lineId);
  const newText = req.body.newText;

  if (!Array.isArray(newText) || newText.length === 0) {
    return res
      .status(400)
      .json({ message: "Niz new_text ne smije biti prazan!" });
  }

  try {
    await ensureStorage();
    const scenario = await Scenario.findByPk(scenarioId);

    if (!scenario) {
      return res.status(404).json({ message: "Scenario ne postoji!" });
    }

    const targetLine = await Line.findOne({
      where: { scenarioId, lineId },
    });
    if (!targetLine) {
      return res.status(404).json({ message: "Linija ne postoji!" });
    }

    const locks = await readJson(LOCKS_FILE, []);
    const lock = locks.find(
      (l) => l.scenarioId === scenarioId && l.lineId === lineId,
    );

    if (!lock) {
      return res.status(409).json({ message: "Linija nije zakljucana!" });
    }

    if (lock.userId !== userId) {
      return res.status(409).json({ message: "Linija je vec zakljucana!" });
    }

    const flattened = newText.map((txt) => chunkByWords(txt)).flat();

    // Dohvati sve linije scenarija
    const allLines = await Line.findAll({
      where: { scenarioId },
    });

    const maxLineId = allLines.reduce((max, l) => Math.max(max, l.lineId), 0);
    let nextAvailableId = maxLineId + 1;

    const oldNext = targetLine.nextLineId;

    const newLines = flattened.map((text, idx) => {
      const id = idx === 0 ? targetLine.lineId : nextAvailableId++;
      const nextId = idx === flattened.length - 1 ? oldNext : nextAvailableId;
      return { lineId: id, nextLineId: nextId, text };
    });

    // Obriši originalnu liniju
    await Line.destroy({
      where: { scenarioId, lineId: targetLine.lineId },
    });

    // Kreiraj nove linije
    for (const nl of newLines) {
      await Line.create({
        lineId: nl.lineId,
        nextLineId: nl.nextLineId,
        text: nl.text,
        scenarioId,
      });
    }

    // Unlock the line for this user
    const remainingLocks = locks.filter(
      (l) => !(l.scenarioId === scenarioId && l.lineId === lineId),
    );
    await writeJson(LOCKS_FILE, remainingLocks);

    // Append delta for each new line
    const ts = Math.floor(Date.now() / 1000);
    for (const nl of newLines) {
      await Delta.create({
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

// Brisanje linije scenarija (zahtijeva lock na toj liniji)
app.delete("/api/scenarios/:scenarioId/lines/:lineId", async (req, res) => {
  const userId = Number(req.body?.userId);
  const scenarioId = Number(req.params.scenarioId);
  const lineId = Number(req.params.lineId);

  if (!Number.isInteger(scenarioId) || scenarioId < 1) {
    return res.status(404).json({ message: "Scenario ne postoji!" });
  }

  if (!Number.isInteger(lineId) || lineId < 1) {
    return res.status(404).json({ message: "Linija ne postoji!" });
  }

  try {
    await ensureStorage();
    const scenario = await Scenario.findByPk(scenarioId);

    if (!scenario) {
      return res.status(404).json({ message: "Scenario ne postoji!" });
    }

    const allLines = await Line.findAll({
      where: { scenarioId },
    });

    const target = allLines.find((l) => l.lineId === lineId);
    if (!target) {
      return res.status(404).json({ message: "Linija ne postoji!" });
    }

    // Ne dozvoli brisanje zadnje preostale linije
    if (allLines.length <= 1) {
      return res
        .status(400)
        .json({ message: "Ne možete obrisati zadnju liniju." });
    }

    const locks = await readJson(LOCKS_FILE, []);
    const lock = Array.isArray(locks)
      ? locks.find((l) => l?.scenarioId === scenarioId && l?.lineId === lineId)
      : null;

    if (!lock) {
      return res.status(409).json({ message: "Linija nije zakljucana!" });
    }

    if (Number(lock.userId) !== userId) {
      return res.status(409).json({ message: "Linija je vec zakljucana!" });
    }

    // Preveži linked-list: prethodna.nextLineId -> target.nextLineId
    const predecessor = allLines.find((l) => l.nextLineId === lineId);
    if (predecessor) {
      await Line.update(
        { nextLineId: target.nextLineId ?? null },
        { where: { scenarioId, lineId: predecessor.lineId } },
      );
    }

    // Obriši liniju
    await Line.destroy({
      where: { scenarioId, lineId },
    });

    // ukloni lock na obrisanoj liniji
    const remainingLocks = Array.isArray(locks)
      ? locks.filter(
          (l) => !(l?.scenarioId === scenarioId && l?.lineId === lineId),
        )
      : [];
    await writeJson(LOCKS_FILE, remainingLocks);

    // delta zapis
    const ts = Math.floor(Date.now() / 1000);
    await Delta.create({
      scenarioId,
      type: "line_delete",
      lineId,
      timestamp: ts,
    });

    return res.status(200).json({ message: "Linija je uspjesno obrisana!" });
  } catch (err) {
    console.error("Failed to delete line", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// Zakljucavanje imena uloge u cijelom scenariju
app.post("/api/scenarios/:scenarioId/characters/lock", async (req, res) => {
  const userId = Number(req.body.userId);
  const scenarioId = Number(req.params.scenarioId);
  const characterNameRaw =
    typeof req.body.characterName === "string"
      ? req.body.characterName.trim()
      : "";

  try {
    await ensureStorage();
    const scenario = await Scenario.findByPk(scenarioId);

    if (!scenario) {
      return res.status(404).json({ message: "Scenario ne postoji!" });
    }

    const locks = await readJson(CHAR_LOCKS_FILE, []);
    const existing = locks.find(
      (lock) =>
        lock.scenarioId === scenarioId &&
        lock.characterName === characterNameRaw,
    );

    if (existing && existing.userId !== userId) {
      return res
        .status(409)
        .json({ message: "Konflikt! Ime lika je vec zakljucano!" });
    }

    // ukloni eventualni stari zapis za isto ime (isti korisnik), pa upisi novi
    const updated = locks.filter(
      (lock) =>
        !(
          lock.scenarioId === scenarioId &&
          lock.characterName === characterNameRaw
        ),
    );
    updated.push({ scenarioId, characterName: characterNameRaw, userId });

    await writeJson(CHAR_LOCKS_FILE, updated);
    return res
      .status(200)
      .json({ message: "Ime lika je uspjesno zakljucano!" });
  } catch (err) {
    console.error("Failed to lock character name", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// Promjena imena uloge u cijelom scenariju
app.post("/api/scenarios/:scenarioId/characters/update", async (req, res) => {
  const userId = Number(req.body.userId);
  const scenarioId = Number(req.params.scenarioId);
  const oldNameRaw =
    typeof req.body.oldName === "string" ? req.body.oldName.trim() : "";
  const newNameRaw =
    typeof req.body.newName === "string" ? req.body.newName.trim() : "";

  try {
    await ensureStorage();
    const scenario = await Scenario.findByPk(scenarioId);

    if (!scenario) {
      return res.status(404).json({ message: "Scenario ne postoji!" });
    }

    const charLocks = await readJson(CHAR_LOCKS_FILE, []);
    const existing = charLocks.find(
      (lock) =>
        lock.scenarioId === scenarioId && lock.characterName === oldNameRaw,
    );

    if (!existing) {
      return res.status(409).json({ message: "Ime lika nije zakljucano!" });
    }

    if (existing.userId !== userId) {
      return res.status(409).json({ message: "Ime lika je vec zakljucano!" });
    }

    // Dohvati sve linije iz baze
    const allLines = await Line.findAll({
      where: { scenarioId },
    });

    const linesArray = allLines.map((l) => ({
      lineId: l.lineId,
      nextLineId: l.nextLineId,
      text: l.text,
    }));

    // Zamijeni ime samo na linijama koje su zaista "uloge" po definiciji (ALL CAPS + govor ispod)
    const ordered = orderContent(linesArray);
    const roleLineIds = getRoleLineIdsOrdered(ordered);

    // Spriječi promjenu imena ako je neka od relevantnih linija zaključana od drugog korisnika
    const lineLocks = await readJson(LOCKS_FILE, []);
    const lockedRoleLine = lineLocks.find(
      (lock) =>
        lock.scenarioId === scenarioId &&
        lock.userId !== userId &&
        linesArray.some(
          (l) => l.lineId === lock.lineId && l.text.includes(oldNameRaw),
        ),
    );

    if (lockedRoleLine) {
      return res
        .status(409)
        .json({ message: "Konflikt! Linija uloge je zakljucana!" });
    }

    // Ažuriraj linije u bazi - zamijeni sve pojave imena u svim linijama
    for (const line of linesArray) {
      if (line.text.includes(oldNameRaw)) {
        const updatedText = line.text.split(oldNameRaw).join(newNameRaw);
        await Line.update(
          { text: updatedText },
          { where: { scenarioId, lineId: line.lineId } },
        );
      }
    }

    // Ukloni lock za to ime, samo njega
    const remainingLocks = charLocks.filter(
      (lock) =>
        !(lock.scenarioId === scenarioId && lock.characterName === oldNameRaw),
    );
    await writeJson(CHAR_LOCKS_FILE, remainingLocks);

    // Upisi delta zapis
    const ts = Math.floor(Date.now() / 1000);
    await Delta.create({
      scenarioId,
      type: "char_rename",
      oldName: oldNameRaw,
      newName: newNameRaw,
      timestamp: ts,
    });

    return res
      .status(200)
      .json({ message: "Ime lika je uspjesno promijenjeno!" });
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
    const scenario = await Scenario.findByPk(scenarioId);

    if (!scenario) {
      return res.status(404).json({ message: "Scenario ne postoji!" });
    }

    const deltas = await Delta.findAll({
      where: {
        scenarioId,
      },
      order: [["timestamp", "ASC"]],
    });

    const filtered = deltas
      .filter((d) => d.timestamp > since)
      .map((d) => {
        const delta = {
          type: d.type,
          timestamp: d.timestamp,
        };
        if (d.type === "line_update" || d.type === "line_delete") {
          delta.lineId = d.lineId;
          if (d.nextLineId !== null) delta.nextLineId = d.nextLineId;
          if (d.content !== null) delta.content = d.content;
        }
        if (d.type === "char_rename") {
          delta.oldName = d.oldName;
          delta.newName = d.newName;
        }
        return delta;
      });

    return res.status(200).json({ deltas: filtered });
  } catch (err) {
    console.error("Failed to fetch deltas", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});
// Dohvati cijeli scenario sa poredanim linijama
app.get("/api/scenarios/:scenarioId", async (req, res) => {
  const scenarioId = Number(req.params.scenarioId);

  try {
    const scenario = await Scenario.findByPk(scenarioId);

    if (!scenario) {
      return res.status(404).json({ message: "Scenario ne postoji!" });
    }

    const lines = await Line.findAll({
      where: { scenarioId },
    });

    const linesArray = lines.map((l) => ({
      lineId: l.lineId,
      nextLineId: l.nextLineId,
      text: l.text,
    }));

    const ordered = orderContent(linesArray);
    return res.status(200).json({
      id: scenario.id,
      title: scenario.title,
      status: "U radu",
      content: ordered,
    });
  } catch (err) {
    console.error("Failed to fetch scenario", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

  


// Brisanje scenarija
app.delete("/api/scenarios/:scenarioId", async (req, res) => {
  const scenarioId = Number(req.params.scenarioId);

  if (!Number.isInteger(scenarioId) || scenarioId < 1) {
    return res.status(404).json({ message: "Scenario ne postoji!" });
  }

  try {
    await ensureStorage();

    const scenario = await Scenario.findByPk(scenarioId);
    if (!scenario) {
      return res.status(404).json({ message: "Scenario ne postoji!" });
    }

    // Obriši sve linije scenarija
    await Line.destroy({
      where: { scenarioId },
    });

    // Obriši sve delta zapise scenarija
    await Delta.destroy({
      where: { scenarioId },
    });

    // Obriši sve checkpointe scenarija
    await Checkpoint.destroy({
      where: { scenarioId },
    });

    // Obriši scenarij
    await Scenario.destroy({
      where: { id: scenarioId },
    });

    // Očisti lockove vezane za ovaj scenario
    const locks = await readJson(LOCKS_FILE, []);
    await writeJson(
      LOCKS_FILE,
      Array.isArray(locks)
        ? locks.filter((l) => Number(l?.scenarioId) !== scenarioId)
        : [],
    );

    const charLocks = await readJson(CHAR_LOCKS_FILE, []);
    await writeJson(
      CHAR_LOCKS_FILE,
      Array.isArray(charLocks)
        ? charLocks.filter((l) => Number(l?.scenarioId) !== scenarioId)
        : [],
    );

    return res.status(200).json({ message: "Scenario je uspješno obrisan!" });
  } catch (err) {
    console.error("Failed to delete scenario", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// CHECKPOINT RUTE (Zadatak 2 - Verzionisanje)

/*
 POST /api/scenarios/:scenarioId/checkpoint
 Kreira novi checkpoint za zadani scenario.
 Tijelo zahtjeva: { "userId": 1 }
 Odgovor: { "message": "Checkpoint je uspjesno kreiran!" }
*/
app.post("/api/scenarios/:scenarioId/checkpoint", async (req, res) => {
  const scenarioId = parseInt(req.params.scenarioId, 10);

  if (!Number.isInteger(scenarioId) || scenarioId < 1) {
    return res.status(404).json({ message: "Scenario ne postoji!" });
  }

  try {
    const scenario = await Scenario.findByPk(scenarioId);
    if (!scenario) {
      return res.status(404).json({ message: "Scenario ne postoji!" });
    }

    // Kreiraj checkpoint sa trenutnim Unix timestampom u sekundama
    const timestamp = Math.floor(Date.now() / 1000);
    await Checkpoint.create({
      scenarioId,
      timestamp,
    });

    return res.status(200).json({ message: "Checkpoint je uspjesno kreiran!" });
  } catch (err) {
    console.error("Failed to create checkpoint", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/*
 GET /api/scenarios/:scenarioId/checkpoints
 Vraća listu svih checkpointa za zadani scenario.
 Odgovor: Niz objekata sa id i timestamp svakog checkpointa.
*/
app.get("/api/scenarios/:scenarioId/checkpoints", async (req, res) => {
  const scenarioId = parseInt(req.params.scenarioId, 10);

  if (!Number.isInteger(scenarioId) || scenarioId < 1) {
    return res.status(404).json({ message: "Scenario ne postoji!" });
  }

  try {
    const scenario = await Scenario.findByPk(scenarioId);
    if (!scenario) {
      return res.status(404).json({ message: "Scenario ne postoji!" });
    }

    const checkpoints = await Checkpoint.findAll({
      where: { scenarioId },
      attributes: ["id", "timestamp"],
      order: [["timestamp", "ASC"]],
    });

    const result = checkpoints.map((cp) => ({
      id: cp.id,
      timestamp: cp.timestamp,
    }));

    return res.status(200).json(result);
  } catch (err) {
    console.error("Failed to get checkpoints", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/*
 GET /api/scenarios/:scenarioId/restore/:checkpointId
 Vraća stanje scenarija kakvo je bilo u trenutku kreiranja tog checkpointa.
 
 Logika:
 1. Dohvati timestamp za zadani checkpointId.
 2. Uzmi početno stanje scenarija (jedna prazna linija sa lineId=1).
 3. Dohvati sve Delta zapise za taj scenario čiji je timestamp <= timestampu checkpointa.
 4. Primijeni te delte hronološki na početno stanje.
*/
app.get(
  "/api/scenarios/:scenarioId/restore/:checkpointId",
  async (req, res) => {
    const scenarioId = parseInt(req.params.scenarioId, 10);
    const checkpointId = parseInt(req.params.checkpointId, 10);

    if (!Number.isInteger(scenarioId) || scenarioId < 1) {
      return res.status(404).json({ message: "Scenario ne postoji!" });
    }

    if (!Number.isInteger(checkpointId) || checkpointId < 1) {
      return res.status(404).json({ message: "Checkpoint ne postoji!" });
    }

    try {
      const scenario = await Scenario.findByPk(scenarioId);
      if (!scenario) {
        return res.status(404).json({ message: "Scenario ne postoji!" });
      }

      const checkpoint = await Checkpoint.findOne({
        where: { id: checkpointId, scenarioId },
      });
      if (!checkpoint) {
        return res.status(404).json({ message: "Checkpoint ne postoji!" });
      }

      // Dohvati sve delte za ovaj scenario sa timestampom <= checkpoint timestamp
      const deltas = await Delta.findAll({
        where: {
          scenarioId,
          timestamp: { [require("sequelize").Op.lte]: checkpoint.timestamp },
        },
        order: [
          ["timestamp", "ASC"],
          ["id", "ASC"],
        ],
      });

      // Početno stanje: jedna prazna linija sa lineId=1
      // content je niz objekata: { lineId, nextLineId, text }
      let content = [{ lineId: 1, nextLineId: null, text: "" }];

      // Primijeni delte hronološki
      for (const delta of deltas) {
        if (delta.type === "line_update") {
          content = applyLineUpdateDelta(content, delta);
        } else if (delta.type === "char_rename") {
          content = applyCharRenameDelta(content, delta);
        }
      }

      // Poredaj content po nextLineId lancu
      const orderedContent = orderContent(content);

      return res.status(200).json({
        id: scenario.id,
        title: scenario.title,
        status: "U radu",
        content: orderedContent,
      });
    } catch (err) {
      console.error("Failed to restore checkpoint", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

/*
 Primjenjuje line_update deltu na content.
 Delta sadrži: lineId, nextLineId, content (novi tekst linije)
 
 Ako linija postoji - ažuriraj joj text i nextLineId.
 Ako linija ne postoji - dodaj novu liniju.
*/
function applyLineUpdateDelta(content, delta) {
  const lineId = delta.lineId;
  const nextLineId = delta.nextLineId;
  const newText = delta.content || "";

  // Prvo podijelimo tekst na linije ako ima više od 20 riječi
  const chunks = chunkByWords(newText);

  // Pronađi postojeću liniju
  const existingIndex = content.findIndex((l) => l.lineId === lineId);

  if (existingIndex === -1) {
    // Linija ne postoji - dodaj novu
    // Ovo se može desiti ako delta referencira liniju koja još nije kreirana
    // U tom slučaju, dodajemo je
    if (chunks.length === 1) {
      content.push({ lineId, nextLineId, text: chunks[0] });
    } else {
      // Više chunkova - kreiramo nove linije
      let maxLineId = Math.max(...content.map((l) => l.lineId), 0);
      for (let i = 0; i < chunks.length; i++) {
        const isLast = i === chunks.length - 1;
        const thisLineId = i === 0 ? lineId : ++maxLineId;
        const thisNextLineId = isLast ? nextLineId : maxLineId + 1;
        content.push({
          lineId: thisLineId,
          nextLineId: thisNextLineId,
          text: chunks[i],
        });
      }
    }
  } else {
    // Linija postoji - ažuriraj
    const existingLine = content[existingIndex];
    if (chunks.length === 1) {
      // Jednostavan slučaj - samo ažuriraj tekst
      existingLine.text = chunks[0];
      existingLine.nextLineId = nextLineId;
    } else {
      // Više chunkova - ažuriraj prvu liniju i dodaj nove za ostatak
      let maxLineId = Math.max(...content.map((l) => l.lineId), 0);
      // Prva linija zadržava originalni lineId
      existingLine.text = chunks[0];
      // Dodaj nove linije za ostale chunkove
      let prevLine = existingLine;
      for (let i = 1; i < chunks.length; i++) {
        const isLast = i === chunks.length - 1;
        const newLineId = ++maxLineId;
        const newNextLineId = isLast ? nextLineId : null;
        prevLine.nextLineId = newLineId;
        content.push({
          lineId: newLineId,
          nextLineId: newNextLineId,
          text: chunks[i],
        });
        prevLine = content[content.length - 1];
      }
      // Zadnja nova linija pokazuje na originalni nextLineId
      prevLine.nextLineId = nextLineId;
    }
  }

  return content;
}

/*
  Primjenjuje char_rename deltu na content.
  Delta sadrži: oldName, newName
 
  Zamjenjuje sve pojave starog imena sa novim u svim linijama.
 */
function applyCharRenameDelta(content, delta) {
  const oldName = delta.oldName;
  const newName = delta.newName;

  if (!oldName || !newName) return content;

  // Regex za zamjenu imena (case-insensitive za običan tekst, exact za role linije)
  const oldUpper = oldName.toUpperCase();
  const newUpper = newName.toUpperCase();

  for (const line of content) {
    if (!line.text) continue;

    // Ako je role linija (samo velika slova), zamijeni exact match
    if (isRoleText(line.text)) {
      // Zamijeni cijelu role liniju ako je to ime lika
      const trimmed = line.text.trim();
      if (trimmed === oldUpper) {
        line.text = newUpper;
      }
    } else {
      // Za običan tekst, zamijeni sve pojave (word boundary)
      const regex = new RegExp(`\\b${escapeRegex(oldName)}\\b`, "gi");
      line.text = line.text.replace(regex, newName);
    }
  }

  return content;
}

/*
  Escape special regex characters
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

if (require.main === module) {
  initializeDatabase()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
      });
    })
    .catch((err) => {
      console.error("Greška prilikom inicijalizacije baze:", err);
      process.exit(1);
    });
}

module.exports = app;
module.exports.sequelize = sequelize;
module.exports.initializeDatabase = initializeDatabase;
