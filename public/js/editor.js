// editor.js

let editor = null;

window.addEventListener("DOMContentLoaded", function () {
    const editorDiv = document.getElementById("editor");
    const porukeDiv = document.getElementById("poruke");
    const saveBtn = document.querySelector(".save-btn");

    const USER_ID = 1;

    function getScenarioIdFromUrlOrStorage() {
        const params = new URLSearchParams(window.location.search);
        const fromUrl = params.get("scenarioId");
        if (fromUrl && Number.isInteger(Number(fromUrl))) return Number(fromUrl);

        const fromStorage = localStorage.getItem("scenarioId");
        if (fromStorage && Number.isInteger(Number(fromStorage))) return Number(fromStorage);
        return null;
    }

    function setScenarioIdEverywhere(id) {
        localStorage.setItem("scenarioId", String(id));
        const params = new URLSearchParams(window.location.search);
        params.set("scenarioId", String(id));
        const newUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.replaceState({}, "", newUrl);
    }

    function getEditorLines() {
        const text = (editorDiv?.innerText || "").replace(/\r\n/g, "\n");
        const lines = text.split("\n");
        // Dozvoljeno je da pojedini stringovi budu prazni, ali newText niz ne smije biti prazan.
        return lines.length > 0 ? lines : [""];
    }

    function renderScenario(scenario) {
        if (!scenario || !Array.isArray(scenario.content)) return;
        const text = scenario.content.map((l) => l.text ?? "").join("\n");
        editorDiv.textContent = text;
    }

    // ========== helper za poruke ==========
    function prikaziPoruku(tekst, tip) {
        if (!porukeDiv) return;
        porukeDiv.textContent = tekst;
        porukeDiv.classList.remove("error", "success");
        if (tip === "error") porukeDiv.classList.add("error");
        if (tip === "success") porukeDiv.classList.add("success");
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

    function loadScenarioIfPossible() {
        if (!PoziviAjaxFetch || typeof PoziviAjaxFetch.getScenario !== "function") return;
        if (!scenarioId) return;

        PoziviAjaxFetch.getScenario(scenarioId, (status, data) => {
            if (status === 200) {
                renderScenario(data);
                prikaziPoruku(`Ucitano: scenario ${scenarioId}.`, "success");
            } else if (status === 404) {
                prikaziPoruku("Scenario ne postoji!", "error");
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

        // 1) Ako nemamo scenario, kreiraj ga
        if (!scenarioId) {
            const titleEl = document.querySelector(".project-title");
            const title = titleEl ? titleEl.textContent.trim() : "Neimenovani scenarij";

            PoziviAjaxFetch.postScenario(title, (status, data) => {
                if (status !== 200 || !data?.id) {
                    prikaziPoruku(data?.message || "Greska pri kreiranju scenarija.", "error");
                    return;
                }

                scenarioId = data.id;
                setScenarioIdEverywhere(scenarioId);
                prikaziPoruku(`Kreiran scenario ${scenarioId}.`, "success");
                saveLine1();
            });
            return;
        }

        // 2) Ako imamo scenario, samo snimi
        saveLine1();
    }

    function saveLine1() {
        const newText = getEditorLines();
        PoziviAjaxFetch.lockLine(scenarioId, 1, USER_ID, (lockStatus, lockData) => {
            if (lockStatus !== 200) {
                prikaziPoruku(lockData?.message || "Ne mogu zakljucati liniju.", "error");
                return;
            }

            PoziviAjaxFetch.updateLine(scenarioId, 1, USER_ID, newText, (upStatus, upData) => {
                if (upStatus !== 200) {
                    prikaziPoruku(upData?.message || "Greska pri spremanju.", "error");
                    return;
                }

                prikaziPoruku("Spaseno.", "success");
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

    loadScenarioIfPossible();

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
