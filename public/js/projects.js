// projects.js
// Minimalno povezivanje Projects stranice sa backendom (kreiranje scenarija).

let __projectsInitialized = false;
let __refreshProjectsScenarios = null;
let __projectsRequestSeq = 0;

function initProjectsPage() {
    if (__projectsInitialized) return;
    __projectsInitialized = true;
    const newProjectBtn = document.querySelector(".new-project-btn");
    const createBtn = document.querySelector(".create-btn");
    const projectsGrid = document.getElementById("projectsGrid");

    const actionsForm = document.getElementById("projectsActions");
    const searchInput = document.getElementById("projectSearch");

    const modal = document.getElementById("createScenarioModal");
    const modalContent = modal?.querySelector?.(".modal-content") || null;
    const modalTitleInput = document.getElementById("newScenarioTitle");
    const modalError = document.getElementById("createScenarioError");
    const modalCancel = document.getElementById("btnCreateScenarioCancel");
    const modalConfirm = document.getElementById("btnCreateScenarioConfirm");

    let allScenarios = [];

    function setModalError(message) {
        if (!modalError) return;
        modalError.textContent = message || "";
    }

    function openCreateScenarioModal() {
        if (!modal || !modalTitleInput) return;
        modal.classList.remove("hidden");
        modal.setAttribute("aria-hidden", "false");
        setModalError("");

        if (!modalTitleInput.value) modalTitleInput.value = "Neimenovani scenarij";
        modalTitleInput.focus();
        modalTitleInput.select?.();
    }

    function closeCreateScenarioModal() {
        if (!modal) return;
        modal.classList.add("hidden");
        modal.setAttribute("aria-hidden", "true");
        setModalError("");
    }

    function kreirajScenarioPotvrdi() {
        // PoziviAjaxFetch je definisan kao "const" u klasičnom scriptu,
        // pa nije nužno dostupan kao window.PoziviAjaxFetch.
        if (typeof PoziviAjaxFetch === "undefined" || typeof PoziviAjaxFetch.postScenario !== "function") {
            setModalError("PoziviAjaxFetch modul nije učitan.");
            return;
        }

        const title = (modalTitleInput?.value || "").trim();
        if (title.length === 0) {
            setModalError("Naziv scenarija ne smije biti prazan.");
            return;
        }

        PoziviAjaxFetch.postScenario(title, (status, data) => {
            if (status !== 200 || !data?.id) {
                setModalError(data?.message || "Greška pri kreiranju scenarija.");
                return;
            }

            const scenarioId = data.id;
            localStorage.setItem("scenarioId", String(scenarioId));
            // zapamti zadnje kliknut projekat (za aktivni outline na Projects)
            localStorage.setItem("activeProjectScenarioId", String(scenarioId));

            // Nakon uspješnog kreiranja, sakrij popup.
            closeCreateScenarioModal();
            window.location.href = `/html/writing.html?scenarioId=${encodeURIComponent(scenarioId)}`;
        });
    }

    function stableRand(seed) {
        // deterministic pseudo-random in [0, 1)
        const x = Math.sin(seed * 999) * 10000;
        return x - Math.floor(x);
    }

    function formatRandomDate(seed) {
        // random-ish date in 2025 (stable per scenario)
        const months = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "avg", "sep", "okt", "nov", "dec"]; 
        const m = Math.floor(stableRand(seed + 1) * 12);
        const d = 1 + Math.floor(stableRand(seed + 2) * 28);
        return `${d}. ${months[m]} 2025.`;
    }

    function formatDateFromUnixSeconds(unixSeconds) {
        const ts = Number(unixSeconds);
        if (!Number.isFinite(ts) || ts <= 0) return null;
        const d = new Date(ts * 1000);
        const months = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "avg", "sep", "okt", "nov", "dec"]; 
        const day = d.getDate();
        const month = months[d.getMonth()] || "";
        const year = d.getFullYear();
        return `${day}. ${month} ${year}.`;
    }

    function buildScenarioCard(s, isActive) {
        const id = Number(s?.id);
        const title = String(s?.title ?? `Scenarij ${id}`);

        const types = [
            "Krimi / Dugometražni film",
            "Dokumentarni / Serija",
            "Drama / Dugometražni film",
            "Reklama / TV",
            "Komedija / Serija",
        ];
        const statuses = [
            "Prva verzija",
            "Druga verzija",
            "Outline završen",
            "U radu",
            "Finalna verzija",
        ];

        const seed = Number.isFinite(id) ? id : 1;
        const desc = types[Math.floor(stableRand(seed + 4) * types.length)];
        const status = (typeof s?.status === "string" && s.status.trim().length > 0)
            ? s.status.trim()
            : "U radu";
        const lastEdit = formatDateFromUnixSeconds(s?.lastModified) || formatRandomDate(seed + 6);

        const card = document.createElement("article");
        card.className = `project-card${isActive ? " active" : ""}`;
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", `Otvori scenarij ${title}`);

        const header = document.createElement("div");
        header.className = isActive ? "activeflex" : "";

        const h2 = document.createElement("h2");
        h2.className = "project-title";
        h2.textContent = title;
        header.appendChild(h2);

        if (isActive) {
            const badge = document.createElement("div");
            badge.className = "active-badge";
            badge.textContent = "Aktivan";
            header.appendChild(badge);
        }

        card.appendChild(header);

        const pDesc = document.createElement("p");
        pDesc.className = "project-desc";
        pDesc.textContent = desc;
        card.appendChild(pDesc);

        const meta = document.createElement("div");
        meta.className = "project-meta";
        meta.innerHTML = `
            <p><strong>Status:</strong> ${status}</p>
            <p><strong>Vrijeme posljednje izmjene:</strong> ${lastEdit}</p>
        `.trim();
        card.appendChild(meta);

        function openScenario() {
            if (!Number.isInteger(id) || id < 1) {
                return;
            }
            localStorage.setItem("scenarioId", String(id));
            localStorage.setItem("activeProjectScenarioId", String(id));
            window.location.href = `/html/writing.html?scenarioId=${encodeURIComponent(String(id))}`;
        }

        card.addEventListener("click", openScenario);
        card.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openScenario();
            }
        });

        return card;
    }

    function renderProjectsList(list) {
        if (!projectsGrid) return;
        const createNewCard = projectsGrid.querySelector(".project-card.create-new");
        projectsGrid.innerHTML = "";
        const scenarios = Array.isArray(list) ? list : [];

        const activeIdRaw = localStorage.getItem("activeProjectScenarioId");
        const activeId = Number(activeIdRaw);

        scenarios.forEach((s) => {
            const sid = Number(s?.id);
            const isActive = Number.isInteger(activeId) && activeId > 0 && sid === activeId;
            projectsGrid.appendChild(buildScenarioCard(s, isActive));
        });

        if (createNewCard) projectsGrid.appendChild(createNewCard);
    }

    function ucitajScenarijeWithRetry({ retriesLeft, delayMs, treatEmptyAsFailure, fresh, reqSeq }) {
        if (typeof PoziviAjaxFetch === "undefined") {
            return;
        }

        const fetchFn = PoziviAjaxFetch.getScenarios;
        if (typeof fetchFn !== "function") return;

        fetchFn((status, data) => {
            if (reqSeq !== __projectsRequestSeq) return; // ignore stale/out-of-order responses
            const list = Array.isArray(data?.scenarios) ? data.scenarios : null;
            const ok = status === 200 && Array.isArray(list);
            const emptyFailure = !!treatEmptyAsFailure && ok && list.length === 0;

            if (!ok || emptyFailure) {
                if (retriesLeft > 0) {
                    setTimeout(() => {
                        ucitajScenarijeWithRetry({
                            retriesLeft: retriesLeft - 1,
                            delayMs,
                            treatEmptyAsFailure,
                            reqSeq,
                        });
                    }, delayMs);
                    return;
                }
                // tek na zadnjem pokušaju prikaži prazno stanje
                renderProjectsList([]);
                return;
            }

            allScenarios = list;
            applySearchFilter();
        });
    }

    function refreshScenarios(force) {
        __projectsRequestSeq++;
        const reqSeq = __projectsRequestSeq;
        // Standardno učitavanje scenarija
        ucitajScenarijeWithRetry({
            retriesLeft: 0,
            delayMs: 250,
            treatEmptyAsFailure: false,
            reqSeq,
        });
    }

    // expose refresh for pageshow (bfcache)
    __refreshProjectsScenarios = refreshScenarios;

    function applySearchFilter() {
        const q = String(searchInput?.value ?? "").trim().toLowerCase();
        if (q.length === 0) {
            renderProjectsList(allScenarios);
            return;
        }
        const filtered = allScenarios.filter((s) => String(s?.title ?? "").toLowerCase().includes(q));
        renderProjectsList(filtered);
    }

    if (actionsForm) {
        actionsForm.addEventListener("submit", (e) => e.preventDefault());
    }

    if (searchInput) {
        searchInput.addEventListener("input", applySearchFilter);
    }

    if (newProjectBtn) newProjectBtn.addEventListener("click", openCreateScenarioModal);
    if (createBtn) createBtn.addEventListener("click", openCreateScenarioModal);

    if (modalCancel) modalCancel.addEventListener("click", closeCreateScenarioModal);
    if (modalConfirm) modalConfirm.addEventListener("click", kreirajScenarioPotvrdi);

    if (modalTitleInput) {
        modalTitleInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                kreirajScenarioPotvrdi();
            } else if (e.key === "Escape") {
                e.preventDefault();
                closeCreateScenarioModal();
            }
        });
    }

    if (modal) {
        modal.addEventListener("click", (e) => {
            // klik van modal-content zatvara
            if (e.target === modal) closeCreateScenarioModal();
        });
    }

    // Učitaj postojeće scenarije i prikaži ih kao kartice
    refreshScenarios(false);
}

// Init radi i kada je stranica vraćena iz bfcache (npr. nakon redirecta/back)
if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", initProjectsPage);
} else {
    initProjectsPage();
}

window.addEventListener("pageshow", (e) => {
    // Ako je stranica vraćena iz bfcache, DOMContentLoaded se ne okida ponovo.
    // Ovo osigurava da se lista scenarija uvijek osvježi bez ručnog refresha.
    if (!__projectsInitialized) initProjectsPage();

    // Kada se stranica ponovo prikaže (uključujući bfcache), osvježi listu.
    if (typeof __refreshProjectsScenarios === "function") __refreshProjectsScenarios(false);
});
