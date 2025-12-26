// editor.js

let editor = null;

window.addEventListener("DOMContentLoaded", function () {
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
            if (!lineEl || !isElementInsideLockedChunk(lineEl)) {
                e.preventDefault();
            }
        });

        editorDiv.addEventListener("paste", (e) => {
            const lineEl = resolveScenarioLineFromEvent(e);
            if (!lineEl || !isElementInsideLockedChunk(lineEl)) {
                e.preventDefault();
            }
        });

        // Enter unutar zaključanog segmenta dodaje novu liniju ispod
        editorDiv.addEventListener("keydown", (e) => {
            if (e.key !== "Enter") return;
            const lineEl = resolveScenarioLineFromEvent(e);
            if (!lineEl) return;
            if (!isElementInsideLockedChunk(lineEl)) return;

            e.preventDefault();
            const newRow = insertNewLineAfterElement(lineEl);
            if (!newRow) return;
            newRow.scrollIntoView({ block: "center" });
            try { newRow.focus(); } catch (_) {}
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
                if (suppressNextLoadSuccessMessage) {
                    suppressNextLoadSuccessMessage = false;
                } else {
                        prikaziPoruku(`Učitano: scenarij ${scenarioId}.`, "success");
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
        const newText = getNewTextForSelectedLine(lineId);
        if (!newText) {
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
                    prikaziPoruku(data?.message || "Ime lika promijenjeno.", "success");
                    loadScenarioIfPossible();
                } else {
                    prikaziPoruku(data?.message || "Greška pri promjeni imena.", "error");
                }
            });
        });
    }

    loadScenarioIfPossible();

    // Pri izlasku iz scenarija: otključaj sve linije korisnika.
    window.addEventListener("pagehide", releaseLocksOnExit);
    window.addEventListener("beforeunload", releaseLocksOnExit);

    // Ako je stranica vraćena iz bfcache (back/forward), DOMContentLoaded se ne okida ponovo.
    // Ovim osiguramo da se naslov i sadržaj scenarija osvježe bez ručnog refresha.
    window.addEventListener("pageshow", () => {
        scenarioId = getScenarioIdFromUrlOrStorage();
        if (scenarioId) setScenarioIdInput(scenarioId);
        loadScenarioIfPossible();
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
