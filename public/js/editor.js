// editor.js

let editor = null;
let autosaveInterval = null;

// Provjeri da li je korisnik prijavljen
function checkAuth() {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
        window.location.href = '/html/login.html';
        return null;
    }
    try {
        return JSON.parse(userStr);
    } catch {
        localStorage.removeItem('user');
        window.location.href = '/html/login.html';
        return null;
    }
}

// Primijeni postavke iz localStorage na editor
function applyEditorSettings() {
    const settings = JSON.parse(localStorage.getItem('appSettings') || '{}');
    
    // Primijeni temu
    if (settings.theme === 'dark') {
        document.body.classList.add('dark-theme');
    } else if (settings.theme === 'auto') {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.body.classList.add('dark-theme');
        }
    }
    
    // Primijeni font size
    const editorDiv = document.getElementById('editor');
    if (editorDiv) {
        switch (settings.fontSize) {
            case 'small':
                editorDiv.style.fontSize = '0.85rem';
                break;
            case 'large':
                editorDiv.style.fontSize = '1.25rem';
                break;
            default:
                editorDiv.style.fontSize = '1rem';
        }
    }
    
    // Primijeni spellcheck
    if (editorDiv && settings.spellcheck !== undefined) {
        editorDiv.setAttribute('spellcheck', settings.spellcheck ? 'true' : 'false');
    }
    
    // Primijeni kompaktan prikaz
    if (settings.compactView) {
        document.body.classList.add('compact-view');
    }
    
    // Prikaži/sakrij word count
    const wordCountEl = document.getElementById('wordCountDisplay');
    if (wordCountEl) {
        wordCountEl.style.display = settings.wordCount !== false ? 'block' : 'none';
    }
}

// Autosave funkcionalnost
function setupAutosave() {
    const settings = JSON.parse(localStorage.getItem('appSettings') || '{}');
    
    // Ako je autosave isključen, ne radi ništa
    if (settings.autosave === false) {
        if (autosaveInterval) {
            clearInterval(autosaveInterval);
            autosaveInterval = null;
        }
        return;
    }
    
    // Default interval je 60 sekundi
    const intervalSeconds = parseInt(settings.autosaveInterval) || 60;
    
    // Očisti postojeći interval
    if (autosaveInterval) {
        clearInterval(autosaveInterval);
    }
    
    // Postavi novi interval
    autosaveInterval = setInterval(() => {
        const saveBtn = document.querySelector('.save-btn');
        if (saveBtn) {
            saveBtn.click();
        }
    }, intervalSeconds * 1000);
}

// Word count funkcionalnost
function setupWordCount() {
    const settings = JSON.parse(localStorage.getItem('appSettings') || '{}');
    
    // Ako je word count isključen, ne prikazuj
    if (settings.wordCount === false) return;
    
    // Kreiraj word count element ako ne postoji
    let wordCountEl = document.getElementById('wordCountDisplay');
    if (!wordCountEl) {
        wordCountEl = document.createElement('div');
        wordCountEl.id = 'wordCountDisplay';
        wordCountEl.style.cssText = 'position: fixed; bottom: 20px; right: 20px; background: #5B43F0; color: white; padding: 8px 16px; border-radius: 20px; font-size: 0.85rem; font-weight: 500; box-shadow: 0 2px 10px rgba(0,0,0,0.15); z-index: 100;';
        document.body.appendChild(wordCountEl);
    }
    
    // Funkcija za brojanje riječi
    function updateWordCount() {
        const editorDiv = document.getElementById('editor');
        if (!editorDiv) return;
        
        const text = editorDiv.innerText || '';
        const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
        const chars = text.length;
        
        wordCountEl.textContent = `${words} riječi | ${chars} znakova`;
    }
    
    // Ažuriraj odmah
    updateWordCount();
    
    // Ažuriraj prilikom promjena
    const editorDiv = document.getElementById('editor');
    if (editorDiv) {
        editorDiv.addEventListener('input', updateWordCount);
    }
    
    // Ažuriraj periodično (u slučaju da se sadržaj mijenja programski)
    setInterval(updateWordCount, 2000);
}

window.addEventListener("DOMContentLoaded", function () {
    // Provjeri autentifikaciju
    const currentUser = checkAuth();
    if (!currentUser) return;

    // Primijeni spremljene postavke
    applyEditorSettings();

    const editorDiv = document.getElementById("editor");
    const porukeDiv = document.getElementById("poruke");
    const saveBtn = document.querySelector(".save-btn");
    const deleteBtn = document.querySelector(".delete-btn");

    const deleteModal = document.getElementById("deleteScenarioModal");
    const deleteModalCancel = document.getElementById("btnDeleteScenarioCancel");
    const deleteModalConfirm = document.getElementById("btnDeleteScenarioConfirm");
    const deleteModalError = document.getElementById("deleteScenarioError");

    const deltasModal = document.getElementById("deltasModal");
    const deltasListEl = document.getElementById("deltasList");
    const deltasOkBtn = document.getElementById("btnDeltasOk");

    const userIdInput = document.getElementById("api-userId");
    const scenarioIdInput = document.getElementById("api-scenarioId");
    const lineIdInput = document.getElementById("api-lineId");
    const statusInput = document.getElementById("api-status");
    const sinceInput = document.getElementById("api-since");
    const charNameInput = document.getElementById("api-charName");
    const oldNameInput = document.getElementById("api-oldName");
    const newNameInput = document.getElementById("api-newName");

    const btnApiLoadScenario = document.getElementById("btnApiLoadScenario");
    const btnApiUpdateStatus = document.getElementById("btnApiUpdateStatus");
    const btnApiLoadLine = document.getElementById("btnApiLoadLine");
    const btnApiInsertBelow = document.getElementById("btnApiInsertBelow");
    const btnApiAppendEnd = document.getElementById("btnApiAppendEnd");
    const btnApiLockLine = document.getElementById("btnApiLockLine");
    const btnApiUpdateLine = document.getElementById("btnApiUpdateLine");
    const btnApiGetDeltas = document.getElementById("btnApiGetDeltas");
    const btnApiLockChar = document.getElementById("btnApiLockChar");
    const btnApiRenameChar = document.getElementById("btnApiRenameChar");

    const projectTitleEl = document.querySelector(".project-title");

    let activeLineId = null;
    let lockedLineId = null;
    let pendingRelockLineId = null;
    let __lockReqSeq = 0;
    let suppressNextLoadSuccessMessage = false;
    let pendingDeletedLineIds = new Set();
    let pendingDeletedScenarioId = null;

    function setLineEditable(lineEl, editable) {
        if (!lineEl || !lineEl.setAttribute) return;
        lineEl.setAttribute("contenteditable", editable ? "true" : "false");
    }

    function setEditorEditableForLockedLine(baseLineId) {
        if (!editorDiv?.querySelectorAll) return;
        const baseId = Number(baseLineId);

        // Sve linije su readonly dok se ne zaključa neka linija.
        editorDiv.querySelectorAll(".scenario-line").forEach((el) => setLineEditable(el, false));

        const baseEl = editorDiv.querySelector(`[data-line-id="${baseId}"]`);
        if (!baseEl) return;

        // Omogući edit za zaključanu liniju i sve "nove" linije ispod nje
        // (do sljedeće postojeće linije sa data-line-id)
        let current = baseEl;
        while (current) {
            if (current.classList?.contains("scenario-line")) {
                setLineEditable(current, true);
                ensureEditableLine(current);
            }

            const next = current.nextElementSibling;
            if (!next) break;
            if (next.hasAttribute && next.hasAttribute("data-line-id")) break;
            current = next;
        }
    }

    function isElementInsideLockedChunk(el) {
        if (!el || !editorDiv?.contains || !editorDiv.contains(el)) return false;
        const baseId = Number(lockedLineId);
        if (!Number.isInteger(baseId) || baseId < 1) return false;
        const baseEl = getLineElementById(baseId);
        if (!baseEl) return false;
        if (baseEl === el || baseEl.contains(el)) return true;

        let current = baseEl.nextElementSibling;
        while (current) {
            if (current.hasAttribute && current.hasAttribute("data-line-id")) break;
            if (current === el || current.contains?.(el)) return true;
            current = current.nextElementSibling;
        }
        return false;
    }

    function insertNewLineAfterElement(el) {
        if (!el) return null;
        const newRow = document.createElement("div");
        newRow.className = "scenario-line new-line";
        newRow.appendChild(document.createElement("br"));
        el.insertAdjacentElement("afterend", newRow);
        setLineEditable(newRow, true);
        ensureEditableLine(newRow);
        return newRow;
    }

    function attemptLockLine(lineId, { focus, silent } = { focus: true, silent: false }) {
        const USER_ID = getUserId();
        let scenarioIdForLock = getScenarioIdFromUrlOrStorage();
        scenarioIdForLock = getScenarioIdFromInputOrState(scenarioIdForLock);
        const lid = Number(lineId);

            if (!scenarioIdForLock) {
                prikaziPoruku("Scenarij ID nije postavljen.", "error");
            return;
        }
        if (!Number.isInteger(lid) || lid < 1) return;

        if (!PoziviAjaxFetch || typeof PoziviAjaxFetch.lockLine !== "function") {
            prikaziPoruku("PoziviAjaxFetch.lockLine nije dostupan.", "error");
            return;
        }

        __lockReqSeq++;
        const reqSeq = __lockReqSeq;
        PoziviAjaxFetch.lockLine(scenarioIdForLock, lid, USER_ID, (status, data) => {
            if (reqSeq !== __lockReqSeq) return;

            if (status === 200) {
                lockedLineId = lid;
                pendingRelockLineId = null;
                setActiveLine(lid);
                setEditorEditableForLockedLine(lid);
                if (focus) focusLine(lid);
                if (!silent) prikaziPoruku(data?.message || "Linija zaključana.", "success");
                return;
            }

            // 409: zaključana od drugog korisnika
            if (status === 409) {
                const lineEl = getLineElementById(lid);
                if (lineEl) setLineEditable(lineEl, false);
                prikaziPoruku(data?.message || "Linija je već zaključana.", "error");
                return;
            }

            prikaziPoruku(data?.message || "Greška pri zaključavanju linije.", "error");
        });
    }

    function releaseAllLineLocksForUser({ silent } = { silent: true }) {
        const USER_ID = getUserId();
        if (!Number.isInteger(USER_ID) || USER_ID < 1) return;

        if (!PoziviAjaxFetch || typeof PoziviAjaxFetch.releaseLineLocks !== "function") return;
        PoziviAjaxFetch.releaseLineLocks(USER_ID, (_status, _data) => {
            // Namjerno bez poruke (da ne prepiše "Uspješno ažuriran scenarij")
            if (!silent) {
                // no-op for now
            }
        });
    }

    function releaseLocksOnExit() {
        const USER_ID = getUserId();
        if (!Number.isInteger(USER_ID) || USER_ID < 1) return;
        try {
            if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
                const payload = JSON.stringify({ userId: USER_ID });
                const blob = new Blob([payload], { type: "application/json" });
                navigator.sendBeacon("/api/locks/release", blob);
            }
        } catch (_) {
            // ignore
        }
    }

    function setActiveLine(lineId) {
        const lid = Number(lineId);
        if (!Number.isInteger(lid) || lid < 1) return;
        activeLineId = lid;

        if (lineIdInput) lineIdInput.value = String(lid);

        // highlight u editoru
        if (editorDiv?.querySelectorAll) {
            editorDiv.querySelectorAll(".scenario-line.is-active").forEach((el) => el.classList.remove("is-active"));
            const el = editorDiv.querySelector(`[data-line-id="${lid}"]`);
            if (el) el.classList.add("is-active");
        }

    }

    function getUserId() {
        const fromInput = userIdInput ? Number(userIdInput.value) : NaN;
        if (Number.isInteger(fromInput) && fromInput > 0) return fromInput;

        const fromStorage = Number(localStorage.getItem("userId"));
        if (Number.isInteger(fromStorage) && fromStorage > 0) return fromStorage;

        return 1;
    }

    function setUserIdEverywhere(id) {
        const uid = Number(id);
        if (!Number.isInteger(uid) || uid < 1) return;
        localStorage.setItem("userId", String(uid));
        if (userIdInput) userIdInput.value = String(uid);
    }

    function getScenarioIdFromUrlOrStorage() {
        const params = new URLSearchParams(window.location.search);
        const fromUrl = params.get("scenarioId");
        if (fromUrl && Number.isInteger(Number(fromUrl))) return Number(fromUrl);

        const fromStorage = localStorage.getItem("scenarioId");
        if (fromStorage && Number.isInteger(Number(fromStorage))) return Number(fromStorage);
        return null;
    }

    function getScenarioIdFromInputOrState(current) {
        const fromInput = scenarioIdInput ? Number(scenarioIdInput.value) : NaN;
        if (Number.isInteger(fromInput) && fromInput > 0) return fromInput;
        return current;
    }

    function setScenarioIdInput(id) {
        if (!scenarioIdInput) return;
        if (Number.isInteger(Number(id)) && Number(id) > 0) scenarioIdInput.value = String(id);
    }

    function getLineId() {
        const fromInput = lineIdInput ? Number(lineIdInput.value) : NaN;
        if (Number.isInteger(fromInput) && fromInput > 0) return fromInput;
        if (Number.isInteger(Number(activeLineId)) && Number(activeLineId) > 0) return Number(activeLineId);
        return 1;
    }

    function setScenarioIdEverywhere(id) {
        localStorage.setItem("scenarioId", String(id));
        const params = new URLSearchParams(window.location.search);
        params.set("scenarioId", String(id));
        const newUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.replaceState({}, "", newUrl);
    }

    function getLineElementById(lineId) {
        const lid = Number(lineId);
        if (!Number.isInteger(lid) || !editorDiv?.querySelector) return null;
        return editorDiv.querySelector(`[data-line-id="${lid}"]`);
    }

    function ensureEditableLine(div) {
        if (!div) return;
        // Prazan div u contenteditable zna biti "neuhvatljiv" bez <br>
        const txt = String(div.innerText ?? "");
        if (txt.trim().length === 0 && div.childNodes.length === 0) {
            div.appendChild(document.createElement("br"));
        }
    }

    function normalizeLineText(text) {
        // Jedan "scenario-line" predstavlja jednu liniju.
        // Ako korisnik unese/zalijepi nove redove, normalizujemo ih u jedan red.
        return String(text ?? "").replace(/\r\n/g, "\n").replace(/\n+/g, " ");
    }

    // Wrap pravilo (Spirala 2): prelamanje na max 20 riječi.
    // Definicija riječi mora biti ista kao na backend-u:
    // - HTML tagovi se ignorišu za brojanje riječi
    // - riječ: slova (uklj. ŠĐČĆŽ) sa opcionalnim '-' ili '\'' unutar riječi
    // - brojevi i interpunkcija se ne broje kao riječi, ali ostaju u tekstu
    function chunkByWordsClient(text) {
        const trimmed = typeof text === "string" ? text.trim() : "";
        if (trimmed.length === 0) return [""];

        const withoutTags = trimmed.replace(/<[^>]*>/g, " ");
        const wordRegex = /[A-Za-zŠĐČĆŽšđčćž]+(?:['-][A-Za-zŠĐČĆŽšđčćž]+)*/g;

        const parts = withoutTags.split(/\s+/).filter((p) => p.length > 0);
        if (parts.length === 0) return [""];

        const chunks = [];
        let currentParts = [];
        let currentWordCount = 0;

        for (const part of parts) {
            const wordsInPart = (part.match(wordRegex) || []).length;

            if (currentParts.length > 0 && currentWordCount + wordsInPart > 20) {
                chunks.push(currentParts.join(" "));
                currentParts = [];
                currentWordCount = 0;
            }

            currentParts.push(part);
            currentWordCount += wordsInPart;
        }

        if (currentParts.length > 0) chunks.push(currentParts.join(" "));
        return chunks.length > 0 ? chunks : [""];
    }

    function resolveBaseScenarioLineEl(el) {
        if (!el) return null;
        if (el?.classList?.contains?.("scenario-line") && el?.hasAttribute?.("data-line-id")) return el;
        // Ako je klik/paste u new-line, baza je prethodna linija sa data-line-id
        let cur = el;
        while (cur && cur !== editorDiv) {
            if (cur?.classList?.contains?.("scenario-line") && cur?.hasAttribute?.("data-line-id")) return cur;
            cur = cur.previousElementSibling;
        }
        return null;
    }

    function collectEditableChunkEls(baseEl) {
        const els = [];
        if (!baseEl) return els;
        let current = baseEl;
        while (current) {
            if (!current?.classList?.contains?.("scenario-line")) break;
            els.push(current);

            const next = current.nextElementSibling;
            if (!next) break;
            if (next.hasAttribute && next.hasAttribute("data-line-id")) break;
            current = next;
        }
        return els;
    }

    function ensureNewLineAfterElement(el) {
        if (!el || !el.insertAdjacentElement) return null;
        const newRow = document.createElement("div");
        newRow.className = "scenario-line new-line";
        newRow.appendChild(document.createElement("br"));
        el.insertAdjacentElement("afterend", newRow);
        ensureEditableLine(newRow);
        return newRow;
    }

    function applyWrapToChunk(baseEl) {
        if (!baseEl) return;

        const els = collectEditableChunkEls(baseEl);
        if (els.length === 0) return;

        // Spoji sav tekst iz chunk-a u jednu liniju, pa ga prelamaj.
        const joined = els
            .map((el) => normalizeLineText(el.innerText ?? el.textContent ?? ""))
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();

        const chunks = chunkByWordsClient(joined);
        if (!Array.isArray(chunks) || chunks.length === 0) return;

        // Ako nema preloma (<=20 riječi), ostavi samo prvu liniju i obriši višak new-line.
        // Ako ima, rasporedi chunkove po postojećim/new-line elementima.
        const neededCount = Math.max(1, chunks.length);

        // Update postojeće koliko možemo
        for (let i = 0; i < Math.min(els.length, neededCount); i++) {
            els[i].textContent = chunks[i] ?? "";
            ensureEditableLine(els[i]);
        }

        // Dodaj nove linije ako treba
        let lastEl = els[Math.min(els.length, neededCount) - 1] || els[els.length - 1];
        for (let i = els.length; i < neededCount; i++) {
            lastEl = ensureNewLineAfterElement(lastEl);
            if (!lastEl) break;
            lastEl.textContent = chunks[i] ?? "";
            ensureEditableLine(lastEl);
        }

        // Ukloni višak new-line elemenata (nikad ne briši sljedeću "stvarnu" liniju)
        if (els.length > neededCount) {
            for (let i = neededCount; i < els.length; i++) {
                const el = els[i];
                if (el && !el.hasAttribute("data-line-id")) {
                    el.remove();
                }
            }
        }
    }

    function getNewTextForSelectedLine(lineId) {
        const startEl = getLineElementById(lineId);
        if (!startEl) return null;

        const collected = [];
        let current = startEl;

        while (current) {
            const raw = current.innerText ?? current.textContent ?? "";
            collected.push(normalizeLineText(raw));

            const next = current.nextElementSibling;
            if (!next) break;

            // Stani kad dođeš do sljedeće "stvarne" linije scenarija (ima data-line-id)
            if (next.hasAttribute("data-line-id")) break;

            current = next;
        }

        return collected.length > 0 ? collected : [""];
    }

    let loadedScenario = null;

    function renderScenarioToEditor(scenario) {
        if (!editorDiv) return;
        editorDiv.innerHTML = "";

        const content = Array.isArray(scenario?.content) ? scenario.content : [];
        for (const line of content) {
            const lineId = Number(line?.lineId);
            const text = String(line?.text ?? "");

            const row = document.createElement("div");
            row.className = "scenario-line";
            if (Number.isInteger(lineId)) row.setAttribute("data-line-id", String(lineId));
            row.textContent = text;
            ensureEditableLine(row);
            editorDiv.appendChild(row);
        }

        if (content.length === 0) {
            const row = document.createElement("div");
            row.className = "scenario-line";
            row.setAttribute("data-line-id", "1");
            row.appendChild(document.createElement("br"));
            editorDiv.appendChild(row);
        }

        if (activeLineId) setActiveLine(activeLineId);
    }

    function focusLine(lineId) {
        const el = getLineElementById(lineId);
        if (!el) return false;
        el.scrollIntoView({ block: "center" });
        setActiveLine(lineId);
        try {
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        } catch (_) {
            // ignore
        }
        return true;
    }

    function insertNewLineAfter(lineId) {
        const startEl = getLineElementById(lineId);
        if (!startEl) return null;

        const newRow = document.createElement("div");
        newRow.className = "scenario-line new-line";
        newRow.appendChild(document.createElement("br"));
        startEl.insertAdjacentElement("afterend", newRow);
        return newRow;
    }

    // Klik u editoru: postavi aktivnu liniju
    if (editorDiv) {
        function resolveScenarioLineFromEvent(e) {
            // In many browsers `beforeinput`/`paste` targets the root contenteditable (#editor),
            // not the actual line. We resolve the real line via composedPath/selection.
            const path = typeof e?.composedPath === "function" ? e.composedPath() : [];
            for (const node of path) {
                if (node?.classList?.contains?.("scenario-line")) return node;
            }

            const t = e?.target;
            const direct = t?.closest ? t.closest(".scenario-line") : null;
            if (direct) return direct;

            const sel = window.getSelection?.();
            const anchor = sel?.anchorNode || null;
            const el = anchor && anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor;
            return el?.closest ? el.closest(".scenario-line") : null;
        }

        editorDiv.addEventListener("click", (e) => {
            const target = e.target;
            const lineEl = target?.closest ? target.closest("[data-line-id]") : null;
            const lid = Number(lineEl?.getAttribute?.("data-line-id"));
            if (Number.isInteger(lid) && lid > 0) {
                setActiveLine(lid);
                attemptLockLine(lid, { focus: true });
            }
        });

        // Blokiraj bilo kakve izmjene van zaključanog segmenta (typing, paste, delete...).
        editorDiv.addEventListener("beforeinput", (e) => {
            const lineEl = resolveScenarioLineFromEvent(e);

            // Ako uopšte nismo na liniji, ne dozvoli izmjene.
            if (!lineEl) {
                e.preventDefault();
                return;
            }

            // Ne dozvoli izmjene van zaključanog segmenta.
            if (!isElementInsideLockedChunk(lineEl)) {
                e.preventDefault();
                return;
            }

            // Ako postoji selekcija koja prelazi van zaključanog segmenta, blokiraj.
            // Ovo sprječava slučaj gdje Delete obriše cijeli editor.
            try {
                const sel = window.getSelection?.();
                if (sel && sel.rangeCount > 0) {
                    const r = sel.getRangeAt(0);
                    const startNode = r.startContainer;
                    const endNode = r.endContainer;
                    const startEl = startNode?.nodeType === Node.TEXT_NODE ? startNode.parentElement : startNode;
                    const endEl = endNode?.nodeType === Node.TEXT_NODE ? endNode.parentElement : endNode;
                    const startLine = startEl?.closest ? startEl.closest(".scenario-line") : null;
                    const endLine = endEl?.closest ? endEl.closest(".scenario-line") : null;

                    // Ako se selekcija ne može mapirati na linije, tretiraj kao rizično i blokiraj.
                    if (!startLine || !endLine) {
                        e.preventDefault();
                        return;
                    }

                    if (!isElementInsideLockedChunk(startLine) || !isElementInsideLockedChunk(endLine)) {
                        e.preventDefault();
                        return;
                    }
                }
            } catch (_) {
                // ako ne možemo sigurno utvrditi, radije blokiraj nego obriši sve
                e.preventDefault();
            }
        });

        editorDiv.addEventListener("paste", (e) => {
            const lineEl = resolveScenarioLineFromEvent(e);
            if (!lineEl || !isElementInsideLockedChunk(lineEl)) {
                e.preventDefault();
                return;
            }

            // Ne dozvoli paste ako selekcija ide van zaključanog segmenta.
            try {
                const sel = window.getSelection?.();
                if (sel && sel.rangeCount > 0) {
                    const r = sel.getRangeAt(0);
                    const startNode = r.startContainer;
                    const endNode = r.endContainer;
                    const startEl = startNode?.nodeType === Node.TEXT_NODE ? startNode.parentElement : startNode;
                    const endEl = endNode?.nodeType === Node.TEXT_NODE ? endNode.parentElement : endNode;
                    const startLine = startEl?.closest ? startEl.closest(".scenario-line") : null;
                    const endLine = endEl?.closest ? endEl.closest(".scenario-line") : null;

                    if (!startLine || !endLine) {
                        e.preventDefault();
                        return;
                    }

                    if (!isElementInsideLockedChunk(startLine) || !isElementInsideLockedChunk(endLine)) {
                        e.preventDefault();
                        return;
                    }
                }
            } catch (_) {
                e.preventDefault();
            }
        });

        // Enter unutar zaključanog segmenta dodaje novu liniju ispod.
        // Backspace/Delete na praznoj "new-line" liniji briše taj red.
        editorDiv.addEventListener("keydown", (e) => {
            const key = e?.key;
            if (key !== "Enter" && key !== "Backspace" && key !== "Delete") return;

            const lineEl = resolveScenarioLineFromEvent(e);
            if (!lineEl) return;
            if (!isElementInsideLockedChunk(lineEl)) return;

            if (key === "Enter") {
                e.preventDefault();
                const newRow = insertNewLineAfterElement(lineEl);
                if (!newRow) return;
                newRow.scrollIntoView({ block: "center" });
                try { newRow.focus(); } catch (_) {}
                return;
            }

            // Brisanje prazne linije: samo za privremene linije (bez data-line-id).
            const isRealLine = lineEl.hasAttribute && lineEl.hasAttribute("data-line-id");

            const raw = lineEl.innerText ?? lineEl.textContent ?? "";
            const normalized = normalizeLineText(raw).replace(/\s+/g, " ").trim();
            if (normalized.length > 0) return;

            e.preventDefault();

            // Ako je prava linija: označi je za brisanje (primijeni tek na Spasi).
            if (isRealLine) {
                scenarioId = getScenarioIdFromInputOrState(scenarioId) ?? getScenarioIdFromUrlOrStorage();
                const lid = Number(lineEl.getAttribute("data-line-id"));
                if (!scenarioId || !Number.isInteger(lid) || lid < 1) return;

                pendingDeletedScenarioId = scenarioId;
                pendingDeletedLineIds.add(lid);

                const prevReal = lineEl.previousElementSibling?.closest?.("[data-line-id]");
                const nextReal = lineEl.nextElementSibling?.closest?.("[data-line-id]");
                const focusAfter = Number(prevReal?.getAttribute?.("data-line-id")) || Number(nextReal?.getAttribute?.("data-line-id")) || null;

                lineEl.remove();

                if (Number.isInteger(Number(focusAfter)) && Number(focusAfter) > 0) {
                    activeLineId = Number(focusAfter);
                    if (lineIdInput) lineIdInput.value = String(Number(focusAfter));
                    focusLine(Number(focusAfter));
                } else {
                    activeLineId = null;
                }

                // Zaključavanje više nije validno nakon lokalnog brisanja; čekaj Spasi.
                lockedLineId = null;
                setEditorEditableForLockedLine(-1);
                prikaziPoruku("Linija je označena za brisanje. Klikni Spasi da se primijeni.", "success");
                return;
            }

            // Ako je privremena (new-line) linija: ukloni je lokalno.
            const prev = lineEl.previousElementSibling;
            const next = lineEl.nextElementSibling;
            lineEl.remove();

            const candidate =
                (prev && prev.classList?.contains?.("scenario-line") ? prev : null) ||
                (next && next.classList?.contains?.("scenario-line") ? next : null);
            if (candidate && isElementInsideLockedChunk(candidate)) {
                try { candidate.focus(); } catch (_) {}
            }
        });
    }


    // ========== helper za poruke ==========
    function prikaziPoruku(tekst, tip) {
        if (!porukeDiv) return;
        porukeDiv.textContent = tekst;
        porukeDiv.classList.remove("error", "success");
        if (tip === "error") porukeDiv.classList.add("error");
        if (tip === "success") porukeDiv.classList.add("success");
    }

    function setDeleteModalError(message) {
        if (!deleteModalError) return;
        deleteModalError.textContent = message || "";
    }

    function openDeleteModal() {
        if (!deleteModal) return;
        deleteModal.classList.remove("hidden");
        deleteModal.setAttribute("aria-hidden", "false");
        setDeleteModalError("");
        deleteModalConfirm?.focus?.();
    }

    function closeDeleteModal() {
        if (!deleteModal) return;
        deleteModal.classList.add("hidden");
        deleteModal.setAttribute("aria-hidden", "true");
        setDeleteModalError("");
        deleteBtn?.focus?.();
    }

    function closeDeltasModal() {
        if (!deltasModal) return;
        deltasModal.classList.add("hidden");
        deltasModal.setAttribute("aria-hidden", "true");
    }

    function formatDeltaLine(delta, idx) {
        const d = delta || {};
        const ts = Number(d.timestamp);
        const when = Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toLocaleString() : "(bez vremena)";
        const type = typeof d.type === "string" ? d.type : "unknown";

        if (type === "line_update") {
            const lineId = Number.isInteger(Number(d.lineId)) ? Number(d.lineId) : "?";
            const nextLineId = d.nextLineId === null ? "null" : (Number.isInteger(Number(d.nextLineId)) ? Number(d.nextLineId) : "?");
            const content = String(d.content ?? "").replace(/\s+/g, " ").trim();
            const short = content.length > 140 ? content.slice(0, 140) + "…" : content;
            return `${idx + 1}. [${when}] line_update | lineId=${lineId} next=${nextLineId} | ${short}`;
        }

        if (type === "char_rename") {
            const oldName = String(d.oldName ?? "").trim();
            const newName = String(d.newName ?? "").trim();
            return `${idx + 1}. [${when}] char_rename | ${oldName || "?"} → ${newName || "?"}`;
        }

        return `${idx + 1}. [${when}] ${type} | ${JSON.stringify(d)}`;
    }

    function openDeltasModal(deltas, { scenarioId, since } = {}) {
        if (!deltasModal || !deltasListEl) return;
        const list = Array.isArray(deltas) ? deltas : [];

        const header = [];
        if (Number.isInteger(Number(scenarioId))) header.push(`Scenarij: ${scenarioId}`);
        if (Number.isFinite(Number(since))) header.push(`Since: ${Number(since)}`);
        const headerLine = header.length ? header.join(" | ") + "\n\n" : "";

            const lines = list.length === 0 ? ["Nema promjena."] : list.map((d, idx) => formatDeltaLine(d, idx));
        deltasListEl.textContent = headerLine + lines.join("\n");

        deltasModal.classList.remove("hidden");
        deltasModal.setAttribute("aria-hidden", "false");
        deltasOkBtn?.focus?.();
    }

    // ========== helper: modalni input panel za unos uloge ==========
    function otvoriInputPanel(labelTekst, callback) {
        const panel   = document.getElementById("input-panel");
        const input   = document.getElementById("input-tekst");
        const lbl     = panel.querySelector("label");

        // originalni gumbi
        const stariPotvrdi = document.getElementById("input-potvrdi");
        const stariZatvori = document.getElementById("input-zatvori");

        // osvježi labelu
        lbl.textContent = labelTekst;
        panel.classList.remove("hidden");
        input.value = "";
        input.focus();

        // reset event listenera: kloniraj dugmad i zamijeni ih
        const noviPotvrdi = stariPotvrdi.cloneNode(true);
        const noviZatvori = stariZatvori.cloneNode(true);

        stariPotvrdi.parentNode.replaceChild(noviPotvrdi, stariPotvrdi);
        stariZatvori.parentNode.replaceChild(noviZatvori, stariZatvori);

        // klik na Potvrdi
        noviPotvrdi.addEventListener("click", () => {
            const vrijednost = input.value.trim();
            if (vrijednost.length === 0) {
                prikaziPoruku("Unos je prazan.", "error");
                return;
            }
            panel.classList.add("hidden");
            callback(vrijednost);
        });

        // klik na Zatvori
        noviZatvori.addEventListener("click", () => {
            panel.classList.add("hidden");
            prikaziPoruku("Unos otkazan.", "error");
        });

        // Enter = potvrdi, Escape = zatvori
        input.onkeydown = (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                noviPotvrdi.click();
            } else if (e.key === "Escape") {
                e.preventDefault();
                noviZatvori.click();
            }
        };
    }

    // ========== inicijalizacija modula ==========
    try {
        editor = EditorTeksta(editorDiv);   // tvoj modul vraća objekt sa metodama
        prikaziPoruku("Editor je uspješno inicijalizovan.", "success");
    } catch (err) {
        prikaziPoruku("Greška pri inicijalizaciji editora: " + err.message, "error");
        console.error(err);
        return;
    }

    // ========== backend povezivanje (PoziviAjaxFetch) ==========
    let scenarioId = getScenarioIdFromUrlOrStorage();
    let deltasPollTimer = null;
    let deltasPollInFlight = false;
    let deltasSinceTs = Math.floor(Date.now() / 1000);
    let hasPendingRemoteChanges = false;
    let hasShownRemoteChangesMsg = false;

    // inicijalno popuni forme iz storage/url
    if (scenarioId) setScenarioIdInput(scenarioId);
    setUserIdEverywhere(getUserId());

    if (userIdInput) {
        userIdInput.addEventListener("change", () => {
            setUserIdEverywhere(getUserId());
        });
    }

    function loadScenarioIfPossible() {
        if (!PoziviAjaxFetch) return;
        scenarioId = getScenarioIdFromInputOrState(scenarioId);
        if (!scenarioId) return;

        setScenarioIdEverywhere(scenarioId);
        setScenarioIdInput(scenarioId);

        if (typeof PoziviAjaxFetch.getScenario !== "function") return;

        PoziviAjaxFetch.getScenario(scenarioId, (status, data) => {
            if (status === 200) {
                loadedScenario = data;

                // Novi reload poništava sve lokalne (ne-snimljene) brisanja.
                pendingDeletedLineIds = new Set();
                pendingDeletedScenarioId = scenarioId;

                // Nakon uspješnog učitavanja: resetuj polling state.
                // Polling prati samo nove promjene nakon ovog momenta.
                deltasSinceTs = Math.floor(Date.now() / 1000);
                hasPendingRemoteChanges = false;
                hasShownRemoteChangesMsg = false;

                if (suppressNextLoadSuccessMessage) {
                    suppressNextLoadSuccessMessage = false;
                } else {
                    // Ne prepisuj postojeće važne poruke (npr. nakon promjene imena)
                    // osim ako je poruka prazna ili je i sama "Učitano".
                    const trenutnaPoruka = String(porukeDiv?.textContent || "").trim();
                    const jeUcitanoPoruka = /^U\s*čitano\s*:/i.test(trenutnaPoruka) || /^Ucitano\s*:/i.test(trenutnaPoruka);
                    if (trenutnaPoruka.length === 0 || jeUcitanoPoruka) {
                        prikaziPoruku(`Učitano: scenarij ${scenarioId}.`, "success");
                    }
                }
                if (projectTitleEl && typeof data?.title === "string") {
                    const title = data.title;
                    const strong = projectTitleEl.querySelector?.("strong");
                    if (strong) strong.textContent = title;
                    else projectTitleEl.textContent = title;
                    projectTitleEl.setAttribute("title", title);
                }

                if (statusInput) {
                    const s = typeof data?.status === "string" && data.status.trim().length > 0 ? data.status.trim() : "U radu";
                    statusInput.value = s;
                }
                // Panel "Linije scenarija" je uklonjen; selekcija linije radi klikom u editoru.
                renderScenarioToEditor(data);

                // Po defaultu: ništa se ne može uređivati dok se ne zaključa linija.
                lockedLineId = null;
                setEditorEditableForLockedLine(-1);

                const initialLineId = getLineId();
                activeLineId = initialLineId;
                focusLine(initialLineId);

                // Ako smo upravo snimili liniju, pokušaj je ponovo zaključati.
                if (Number.isInteger(Number(pendingRelockLineId)) && Number(pendingRelockLineId) > 0) {
                    const relockId = Number(pendingRelockLineId);
                    pendingRelockLineId = null;
                    attemptLockLine(relockId, { focus: false, silent: true });
                }
            } else if (status === 404) {
                prikaziPoruku("Scenarij ne postoji!", "error");
            } else {
                prikaziPoruku(data?.message || "Greska pri dohvatu scenarija.", "error");
            }
        });
    }

    function canAutoRefreshFromDeltas() {
        // Ne refreshaj dok korisnik uređuje (zaključana linija) ili ima staging brisanja.
        if (Number.isInteger(Number(lockedLineId)) && Number(lockedLineId) > 0) return false;
        if (pendingDeletedLineIds && pendingDeletedLineIds.size > 0) return false;
        return true;
    }

    function startDeltasPolling() {
        if (!PoziviAjaxFetch || typeof PoziviAjaxFetch.getDeltas !== "function") return;

        if (deltasPollTimer) {
            clearInterval(deltasPollTimer);
            deltasPollTimer = null;
        }

        // Intuitivan interval (nije realtime): 5 sekundi.
        deltasPollTimer = setInterval(() => {
            const sid = getScenarioIdFromInputOrState(scenarioId) ?? getScenarioIdFromUrlOrStorage();
            if (!sid) return;
            if (deltasPollInFlight) return;

            deltasPollInFlight = true;
            const since = Number.isFinite(Number(deltasSinceTs)) ? Number(deltasSinceTs) : 0;
            PoziviAjaxFetch.getDeltas(sid, since, (status, data) => {
                deltasPollInFlight = false;
                if (status !== 200) return;

                const deltas = Array.isArray(data?.deltas) ? data.deltas : [];
                if (deltas.length === 0) return;

                // Pomjeri since na najveći timestamp.
                let maxTs = since;
                for (const d of deltas) {
                    const ts = Number(d?.timestamp);
                    if (Number.isFinite(ts) && ts > maxTs) maxTs = ts;
                }
                deltasSinceTs = maxTs;

                hasPendingRemoteChanges = true;

                if (canAutoRefreshFromDeltas()) {
                    suppressNextLoadSuccessMessage = true;
                    loadScenarioIfPossible();
                    return;
                }

                // Ako ne možemo refreshati (korisnik trenutno edita), prikaži poruku samo jednom.
                if (!hasShownRemoteChangesMsg) {
                    hasShownRemoteChangesMsg = true;
                    prikaziPoruku("Stigle su promjene drugih korisnika. Spasi/otključaj pa će se učitati.", "success");
                }
            });
        }, 5000);
    }

    function stopDeltasPolling() {
        if (deltasPollTimer) {
            clearInterval(deltasPollTimer);
            deltasPollTimer = null;
        }
        deltasPollInFlight = false;
    }

    async function ensureScenarioThenSave() {
        if (!PoziviAjaxFetch) {
            prikaziPoruku("PoziviAjaxFetch modul nije ucitan.", "error");
            return;
        }

        const USER_ID = getUserId();
        const effectiveLineId = (Number.isInteger(Number(lockedLineId)) && Number(lockedLineId) > 0)
            ? Number(lockedLineId)
            : getLineId();

        if (lineIdInput) lineIdInput.value = String(effectiveLineId);

        // Ako scenario još ne postoji, uzmi trenutni sadržaj editora kao draft.
        // Ne oslanjaj se na postojanje .scenario-line elemenata (na početku ih možda nema).
        const draftTextRaw = String(editorDiv?.innerText ?? editorDiv?.textContent ?? "");
        const draftLines = draftTextRaw
            .replace(/\r\n/g, "\n")
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.length > 0);
        const draftNewText = draftLines.length > 0 ? draftLines : [""];

        // scenarioId može biti unesen ručno
        scenarioId = getScenarioIdFromInputOrState(scenarioId);

        // 1) Ako nemamo scenario, kreiraj ga
        if (!scenarioId) {
            const titleEl = document.querySelector(".project-title");
            const titleRaw = titleEl ? titleEl.textContent.trim() : "";
            const title = titleRaw.length > 0 ? titleRaw : "Neimenovani scenarij";

            PoziviAjaxFetch.postScenario(title, (status, data) => {
                if (status !== 200 || !data?.id) {
                    prikaziPoruku(data?.message || "Greska pri kreiranju scenarija.", "error");
                    return;
                }

                scenarioId = data.id;
                setScenarioIdEverywhere(scenarioId);
                setScenarioIdInput(scenarioId);
                prikaziPoruku(`Kreiran scenarij ${scenarioId}.`, "success");

                // Odmah snimi draft u prvu liniju (1), pa reload scenarija.
                PoziviAjaxFetch.lockLine(scenarioId, 1, USER_ID, (lockStatus, lockData) => {
                    if (lockStatus !== 200) {
                        prikaziPoruku(lockData?.message || "Ne mogu zakljucati liniju.", "error");
                        return;
                    }

                    PoziviAjaxFetch.updateLine(scenarioId, 1, USER_ID, draftNewText, (upStatus, upData) => {
                        if (upStatus !== 200) {
                            prikaziPoruku(upData?.message || "Greska pri spremanju.", "error");
                            return;
                        }

                        prikaziPoruku("Uspješno ažuriran scenarij", "success");
                        pendingRelockLineId = null;
                        lockedLineId = null;
                        setEditorEditableForLockedLine(-1);
                        releaseAllLineLocksForUser({ silent: true });
                        suppressNextLoadSuccessMessage = true;
                        loadScenarioIfPossible();
                    });
                });
            });
            return;
        }

        // 2) Ako imamo scenario, samo snimi
        saveLine(effectiveLineId, USER_ID);
    }

    function saveLine(lineId, userId) {
        // Primijeni pending brisanja tek na "Spasi".
        const sid = getScenarioIdFromInputOrState(scenarioId) ?? getScenarioIdFromUrlOrStorage();
        const canApplyPending =
            sid &&
            pendingDeletedLineIds &&
            pendingDeletedLineIds.size > 0 &&
            (!pendingDeletedScenarioId || Number(pendingDeletedScenarioId) === Number(sid));
        const hadPendingDeletes = Boolean(canApplyPending);

        const applyPendingDeletesThen = (after) => {
            if (!canApplyPending) {
                after?.(true);
                return;
            }
            if (!PoziviAjaxFetch || typeof PoziviAjaxFetch.deleteLine !== "function") {
                prikaziPoruku("PoziviAjaxFetch.deleteLine nije dostupan.", "error");
                after?.(false);
                return;
            }

            const ids = [...pendingDeletedLineIds]
                .map((n) => Number(n))
                .filter((n) => Number.isInteger(n) && n > 0);
            let idx = 0;

            const step = () => {
                if (idx >= ids.length) {
                    after?.(true);
                    return;
                }
                const delId = ids[idx];
                PoziviAjaxFetch.lockLine(sid, delId, userId, (lockStatus, lockData) => {
                    if (lockStatus !== 200) {
                        prikaziPoruku(lockData?.message || "Ne mogu zakljucati liniju za brisanje.", "error");
                        after?.(false);
                        return;
                    }
                    PoziviAjaxFetch.deleteLine(sid, delId, userId, (delStatus, delData) => {
                        if (delStatus !== 200) {
                            prikaziPoruku(delData?.message || "Greška pri brisanju linije.", "error");
                            after?.(false);
                            return;
                        }
                        pendingDeletedLineIds.delete(delId);
                        idx++;
                        step();
                    });
                });
            };
            step();
        };

        applyPendingDeletesThen((ok) => {
            if (!ok) return;

            // Nakon primjene brisanja: ako nemamo validnu liniju za update,
            // a imali smo pending brisanja, tretiraj kao "delete-only" save.
            const newText = getNewTextForSelectedLine(lineId);
            if (!newText) {
                if (hadPendingDeletes) {
                    prikaziPoruku("Uspješno ažuriran scenarij", "success");
                    pendingRelockLineId = null;
                    lockedLineId = null;
                    setEditorEditableForLockedLine(-1);
                    releaseAllLineLocksForUser({ silent: true });
                    suppressNextLoadSuccessMessage = true;
                    loadScenarioIfPossible();
                    return;
                }
                prikaziPoruku("Ne mogu pronaći izabranu liniju u editoru. Učitaj scenarij ponovo.", "error");
                return;
            }

            PoziviAjaxFetch.lockLine(scenarioId, lineId, userId, (lockStatus, lockData) => {
                if (lockStatus !== 200) {
                    prikaziPoruku(lockData?.message || "Ne mogu zakljucati liniju.", "error");
                    return;
                }

                PoziviAjaxFetch.updateLine(scenarioId, lineId, userId, newText, (upStatus, upData) => {
                    if (upStatus !== 200) {
                        prikaziPoruku(upData?.message || "Greska pri spremanju.", "error");
                        return;
                    }

                    prikaziPoruku("Uspješno ažuriran scenarij", "success");
                    // Nakon Spasi: otključaj sve linije ovog korisnika.
                    pendingRelockLineId = null;
                    lockedLineId = null;
                    setEditorEditableForLockedLine(-1);
                    releaseAllLineLocksForUser({ silent: true });
                    suppressNextLoadSuccessMessage = true;
                    // reload iz backenda da dobijemo prelomljene linije
                    loadScenarioIfPossible();
                });
            });
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener("click", () => {
            ensureScenarioThenSave();
        });
    }

    if (deleteBtn) {
        deleteBtn.addEventListener("click", () => {
            scenarioId = getScenarioIdFromInputOrState(scenarioId);
            if (!scenarioId) {
                prikaziPoruku("Unesite Scenarij ID.", "error");
                return;
            }

            openDeleteModal();
        });
    }

    function confirmDeleteScenario() {
        scenarioId = getScenarioIdFromInputOrState(scenarioId);
        if (!scenarioId) {
            setDeleteModalError("Unesite Scenarij ID.");
            return;
        }

        if (!PoziviAjaxFetch || typeof PoziviAjaxFetch.deleteScenario !== "function") {
            setDeleteModalError("PoziviAjaxFetch.deleteScenario nije dostupan.");
            return;
        }

        PoziviAjaxFetch.deleteScenario(scenarioId, (status, data) => {
            if (status === 200) {
                // replace: da Back ne vraća na obrisani scenarij
                // cache-buster: da Projects uvijek povuče svježu listu
                window.location.replace(`/html/projects.html?t=${Date.now()}`);
            } else {
                setDeleteModalError(data?.message || "Greška pri brisanju scenarija.");
            }
        });
    }

    if (deleteModalCancel) deleteModalCancel.addEventListener("click", closeDeleteModal);
    if (deleteModalConfirm) deleteModalConfirm.addEventListener("click", confirmDeleteScenario);

    if (deleteModal) {
        deleteModal.addEventListener("click", (e) => {
            if (e.target === deleteModal) closeDeleteModal();
        });
        document.addEventListener("keydown", (e) => {
            if (!deleteModal || deleteModal.classList.contains("hidden")) return;
            if (e.key === "Escape") {
                e.preventDefault();
                closeDeleteModal();
            }
        });
    }

    if (deltasOkBtn) deltasOkBtn.addEventListener("click", closeDeltasModal);
    if (deltasModal) {
        deltasModal.addEventListener("click", (e) => {
            if (e.target === deltasModal) closeDeltasModal();
        });
        document.addEventListener("keydown", (e) => {
            if (!deltasModal || deltasModal.classList.contains("hidden")) return;
            if (e.key === "Escape") {
                e.preventDefault();
                closeDeltasModal();
            }
        });
    }

    // ========== API kontrole (S2) ==========
    if (btnApiLoadScenario) {
        btnApiLoadScenario.addEventListener("click", () => {
            scenarioId = getScenarioIdFromInputOrState(scenarioId);
            if (!scenarioId) {
                prikaziPoruku("Unesite Scenarij ID.", "error");
                return;
            }
            loadScenarioIfPossible();
        });
    }

    if (btnApiUpdateStatus) {
        btnApiUpdateStatus.addEventListener("click", () => {
            scenarioId = getScenarioIdFromInputOrState(scenarioId);
            if (!scenarioId) {
                prikaziPoruku("Unesite Scenarij ID.", "error");
                return;
            }
            const newStatus = (statusInput?.value ?? "").trim();
            if (newStatus.length === 0) {
                prikaziPoruku("Status ne smije biti prazan.", "error");
                return;
            }

            if (!PoziviAjaxFetch || typeof PoziviAjaxFetch.updateScenarioStatus !== "function") {
                prikaziPoruku("PoziviAjaxFetch.updateScenarioStatus nije dostupan.", "error");
                return;
            }

            PoziviAjaxFetch.updateScenarioStatus(scenarioId, newStatus, (st, resp) => {
                if (st === 200) {
                    prikaziPoruku("Uspješno ažuriran status", "success");
                    // refresh loaded scenario so UI stays consistent
                    suppressNextLoadSuccessMessage = true;
                    loadScenarioIfPossible();
                } else {
                    prikaziPoruku(resp?.message || "Greška pri ažuriranju statusa.", "error");
                }
            });
        });
    }

    if (btnApiLoadLine) {
        btnApiLoadLine.addEventListener("click", () => {
            const lineId = getLineId();
            if (!loadedScenario) {
                prikaziPoruku("Prvo učitajte scenarij.", "error");
                return;
            }
            const ok = focusLine(lineId);
            prikaziPoruku(ok ? `Učitana linija ${lineId}.` : `Linija ${lineId} ne postoji u scenariju.`, ok ? "success" : "error");
        });
    }

    // Dodaj praznu liniju odmah ispod trenutne (radi preko updateLine: pošaljemo multi-line sadržaj)
    if (btnApiInsertBelow) {
        btnApiInsertBelow.addEventListener("click", () => {
            if (!loadedScenario) {
                prikaziPoruku("Prvo učitajte scenarij.", "error");
                return;
            }

            const lineId = getLineId();
            const newRow = insertNewLineAfter(lineId);
            if (!newRow) {
                prikaziPoruku("Ne mogu dodati liniju: provjeri Line ID.", "error");
                return;
            }

            ensureEditableLine(newRow);
            newRow.scrollIntoView({ block: "center" });
            newRow.focus();
            prikaziPoruku("Dodana nova linija ispod (spasi da se upiše na server).", "success");
        });
    }

    // Dodaj novu liniju na kraj scenarija (prebaci na zadnju liniju + doda newline)
    if (btnApiAppendEnd) {
        btnApiAppendEnd.addEventListener("click", () => {
            if (!loadedScenario || !Array.isArray(loadedScenario.content) || loadedScenario.content.length === 0) {
                prikaziPoruku("Prvo učitajte scenarij.", "error");
                return;
            }

            // content je već poredan (backend vraća ordered), zadnja je posljednja
            const last = loadedScenario.content[loadedScenario.content.length - 1];
            const lastId = Number(last?.lineId);
            if (!Number.isInteger(lastId)) {
                prikaziPoruku("Ne mogu odrediti zadnju liniju.", "error");
                return;
            }

            if (lineIdInput) lineIdInput.value = String(lastId);
            const newRow = insertNewLineAfter(lastId);
            if (!newRow) {
                prikaziPoruku("Ne mogu dodati liniju na kraj.", "error");
                return;
            }
            ensureEditableLine(newRow);
            newRow.scrollIntoView({ block: "center" });
            newRow.focus();
            prikaziPoruku(`Dodana nova linija na kraj (ispod #${lastId}). Spasi da se upiše.`, "success");
        });
    }

    if (btnApiLockLine) {
        btnApiLockLine.addEventListener("click", () => {
            const USER_ID = getUserId();
            scenarioId = getScenarioIdFromInputOrState(scenarioId);
            const lineId = getLineId();
            if (!scenarioId) {
                prikaziPoruku("Unesite Scenarij ID.", "error");
                return;
            }

            PoziviAjaxFetch.lockLine(scenarioId, lineId, USER_ID, (status, data) => {
                if (status === 200) prikaziPoruku(data?.message || "Linija zaključana.", "success");
                else prikaziPoruku(data?.message || "Greška pri zaključavanju.", "error");
            });
        });
    }

    if (btnApiUpdateLine) {
        btnApiUpdateLine.addEventListener("click", () => {
            ensureScenarioThenSave();
        });
    }

    if (btnApiGetDeltas) {
        btnApiGetDeltas.addEventListener("click", () => {
            scenarioId = getScenarioIdFromInputOrState(scenarioId) ?? getScenarioIdFromUrlOrStorage();
            if (!scenarioId) {
                prikaziPoruku("Scenarij ID nije postavljen.", "error");
                return;
            }
            const since = sinceInput ? Number(sinceInput.value) : 0;
            PoziviAjaxFetch.getDeltas(scenarioId, since, (status, data) => {
                if (status !== 200) {
                    prikaziPoruku(data?.message || "Greška pri dohvatu deltas.", "error");
                    return;
                }

                const deltas = Array.isArray(data?.deltas) ? data.deltas : [];
                prikaziPoruku(`Deltas: ${deltas.length} promjena.`, "success");

                console.groupCollapsed(`Deltas | scenarij ${scenarioId} | since ${Number.isFinite(Number(since)) ? Number(since) : 0} | count ${deltas.length}`);
                try {
                    if (deltas.length > 0) console.table(deltas);
                    else console.log("Nema promjena.");
                } finally {
                    console.groupEnd();
                }

                openDeltasModal(deltas, { scenarioId, since });
            });
        });
    }

    if (btnApiLockChar) {
        btnApiLockChar.addEventListener("click", () => {
            const USER_ID = getUserId();
            scenarioId = getScenarioIdFromInputOrState(scenarioId);
            const characterName = (charNameInput?.value || "").trim();
            if (!scenarioId) {
                prikaziPoruku("Unesite Scenarij ID.", "error");
                return;
            }
            if (!characterName) {
                prikaziPoruku("Unesite ime lika.", "error");
                return;
            }

            PoziviAjaxFetch.lockCharacter(scenarioId, characterName, USER_ID, (status, data) => {
                if (status === 200) prikaziPoruku(data?.message || "Ime lika zaključano.", "success");
                else prikaziPoruku(data?.message || "Greška pri zaključavanju imena.", "error");
            });
        });
    }

    if (btnApiRenameChar) {
        btnApiRenameChar.addEventListener("click", () => {
            const USER_ID = getUserId();
            scenarioId = getScenarioIdFromInputOrState(scenarioId);
            const oldName = (oldNameInput?.value || "").trim();
            const newName = (newNameInput?.value || "").trim();
            if (!scenarioId) {
                prikaziPoruku("Unesite Scenarij ID.", "error");
                return;
            }
            if (!oldName || !newName) {
                prikaziPoruku("Unesite staro i novo ime.", "error");
                return;
            }

            PoziviAjaxFetch.updateCharacter(scenarioId, USER_ID, oldName, newName, (status, data) => {
                if (status === 200) {
                    prikaziPoruku("Uspjesno ste promijenili ime lika.", "success");
                    suppressNextLoadSuccessMessage = true;
                    loadScenarioIfPossible();
                } else {
                    prikaziPoruku(data?.message || "Greška pri promjeni imena.", "error");
                }
            });
        });
    }

    loadScenarioIfPossible();
    startDeltasPolling();
    setupAutosave();
    setupWordCount();

    // Pri izlasku iz scenarija: otključaj sve linije korisnika.
    window.addEventListener("pagehide", releaseLocksOnExit);
    window.addEventListener("beforeunload", releaseLocksOnExit);

    // Zaustavi polling kad napuštamo stranicu.
    window.addEventListener("pagehide", stopDeltasPolling);
    window.addEventListener("beforeunload", stopDeltasPolling);

    // Ako je stranica vraćena iz bfcache (back/forward), DOMContentLoaded se ne okida ponovo.
    // Ovim osiguramo da se naslov i sadržaj scenarija osvježe bez ručnog refresha.
    window.addEventListener("pageshow", () => {
        scenarioId = getScenarioIdFromUrlOrStorage();
        if (scenarioId) setScenarioIdInput(scenarioId);
        loadScenarioIfPossible();
        startDeltasPolling();
    });

    // ========== formatirajTekst dugmad ==========
    document.getElementById("btnBold").addEventListener("click", function () {
        pozoviFormat("bold");
    });

    document.getElementById("btnItalic").addEventListener("click", function () {
        pozoviFormat("italic");
    });

    document.getElementById("btnUnderline").addEventListener("click", function () {
        pozoviFormat("underline");
    });

    function pozoviFormat(komanda) {
        if (!editor || typeof editor.formatirajTekst !== "function") {
            prikaziPoruku("Metoda formatirajTekst nije dostupna.", "error");
            return;
        }

        const uspjelo = editor.formatirajTekst(komanda);

        if (uspjelo) {
            prikaziPoruku(`Primijenjen stil: ${komanda}.`, "success");
        } else {
            prikaziPoruku("Nije selektovan tekst ili selekcija nije u editoru.", "error");
        }

        // Auto-wrap na 20 riječi: kad korisnik izađe iz linije (blur/focusout) ili zalijepi tekst.
        // Radimo samo unutar zaključanog chunk-a da ne mijenjamo readonly dijelove.
        editorDiv.addEventListener(
            "focusout",
            (e) => {
                const target = e?.target;
                if (!target?.classList?.contains?.("scenario-line")) return;
                if (!isElementInsideLockedChunk(target)) return;
                const baseEl = resolveBaseScenarioLineEl(target);
                if (!baseEl) return;
                applyWrapToChunk(baseEl);
            },
            true
        );

        editorDiv.addEventListener(
            "paste",
            (e) => {
                const target = e?.target;
                if (!target?.classList?.contains?.("scenario-line")) return;
                if (!isElementInsideLockedChunk(target)) return;

                // Sačekaj da browser ubaci paste sadržaj, pa wrap.
                setTimeout(() => {
                    const baseEl = resolveBaseScenarioLineEl(target);
                    if (!baseEl) return;
                    applyWrapToChunk(baseEl);
                }, 0);
            },
            true
        );
    }

    // ========== ostale metode modula ==========

    // dajBrojRijeci
    document.getElementById("btnBrojRijeci").addEventListener("click", function () {
        if (!editor || typeof editor.dajBrojRijeci !== "function") {
            prikaziPoruku("Metoda dajBrojRijeci nije dostupna.", "error");
            return;
        }
        const rez = editor.dajBrojRijeci();
        const tekst = `Ukupno riječi: ${rez.ukupno} | boldiranih: ${rez.boldiranih} | italic: ${rez.italic}`;
        prikaziPoruku(tekst, "success");
        console.log("dajBrojRijeci:", rez);
    });

    // dajUloge
    document.getElementById("btnDajUloge").addEventListener("click", function () {
        if (!editor || typeof editor.dajUloge !== "function") {
            prikaziPoruku("Metoda dajUloge nije dostupna.", "error");
            return;
        }
        const uloge = editor.dajUloge();
        const tekst = uloge.length
            ? `Pronađene uloge (${uloge.length}): ${uloge.join(", ")}`
            : "Nema pronađenih uloga u tekstu.";
        prikaziPoruku(tekst, "success");
        console.log("dajUloge:", uloge);
    });

    // pogresnaUloga
    document.getElementById("btnPogresnaUloga").addEventListener("click", function () {
        if (!editor || typeof editor.pogresnaUloga !== "function") {
            prikaziPoruku("Metoda pogresnaUloga nije dostupna.", "error");
            return;
        }
        const pogresne = editor.pogresnaUloga();
        const tekst = pogresne.length === 0
            ? "Nema uloga koje izgledaju kao tipo-greške."
            : `Moguće pogrešno napisane uloge (${pogresne.length}): ${pogresne.join(", ")}`;
        prikaziPoruku(tekst, pogresne.length === 0 ? "success" : "error");
        console.log("pogresnaUloga:", pogresne);
    });

    // grupisiUloge
    document.getElementById("btnGrupisiUloge").addEventListener("click", function () {
        if (!editor || typeof editor.grupisiUloge !== "function") {
            prikaziPoruku("Metoda grupisiUloge nije dostupna.", "error");
            return;
        }
        const grupe = editor.grupisiUloge();
        if (grupe.length === 0) {
            prikaziPoruku("Nema dijalog-segmenata za grupisanje.", "success");
        } else {
            // napravi kratak pregled po scenama i segmentima
            const linije = grupe.map(g => `${g.scena || "(bez scene)"}, segment ${g.segment}: ${g.uloge.join(", ")}`);
            const tekst = `Grupe dijaloga (${grupe.length}): ` + linije.join(" | ");
            prikaziPoruku(tekst, "success");
        }
        console.log("grupisiUloge:", grupe);
    });

    // scenarijUloge (traži ulogu preko input panela)
    document.getElementById("btnScenarijUloge").addEventListener("click", function () {
        if (!editor || typeof editor.scenarijUloge !== "function") {
            prikaziPoruku("Metoda scenarijUloge nije dostupna.", "error");
            return;
        }

        otvoriInputPanel("Unesite ime uloge (tačno kao u scenariju):", function (uloga) {
            const rez = editor.scenarijUloge(uloga);
            if (rez.length === 0) {
                prikaziPoruku(`Uloga "${uloga}" nema nijednu repliku u scenariju.`, "error");
            } else {
                const linije = rez.map(r => `${r.scena || "(bez scene)"}, pozicija ${r.pozicijaUTekstu}`);
                const tekst = `Uloga "${uloga}" – pronađeno replika: ${rez.length}. ` +
                              linije.join(" | ");
                prikaziPoruku(tekst, "success");
            }
            console.log("scenarijUloge:", rez);
        });
    });

    // brojLinijaTeksta(uloga) preko input panela
    document.getElementById("btnBrojLinija").addEventListener("click", function () {
        if (!editor || typeof editor.brojLinijaTeksta !== "function") {
            prikaziPoruku("Metoda brojLinijaTeksta nije dostupna.", "error");
            return;
        }

        otvoriInputPanel("Unesite ime uloge za brojanje linija teksta:", function (uloga) {
            const n = editor.brojLinijaTeksta(uloga);
            const tekst = `Uloga "${uloga}" ima ${n} linija govora.`;
            prikaziPoruku(tekst, "success");
            console.log(`brojLinijaTeksta(${uloga}):`, n);
        });
    });
});
