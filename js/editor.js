// editor.js

let editor = null;

window.addEventListener("DOMContentLoaded", function () {
    const editorDiv = document.getElementById("editor");
    const porukeDiv = document.getElementById("poruke");

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
