let EditorTeksta = function (divRef) {
    //privatni atributi modula
    if (!divRef || divRef.tagName !== 'DIV') throw new Error("Pogresan tip elementa!");
    if (divRef.getAttribute("contenteditable") !== "true") throw new Error("Neispravan DIV, ne posjeduje contenteditable atribut!");
 
    const slovoRegex = /[A-Za-zŠĐČĆŽšđčćž]/;

    // helper: pročita "čisti" tekst iz contenteditable bez
    // vještačkih praznih linija između paragrafa.
    // Novi red se dodaje samo za prave block elemente i <br>.
    function procitajCistiTekst(root) {
        let rezultat = "";

        function jeBlockElement(node) {
            if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
            const blockTags = [
                "P", "DIV", "HEADER", "SECTION", "ARTICLE", "ASIDE", "MAIN",
                "H1", "H2", "H3", "H4", "H5", "H6", "LI"
            ];
            return blockTags.indexOf(node.tagName) !== -1;
        }

        function obilazak(node) {
            if (!node) return;

            if (node.nodeType === Node.TEXT_NODE) {
                rezultat += node.nodeValue;
                return;
            }

            if (node.nodeType === Node.ELEMENT_NODE) {
                const tag = node.tagName.toUpperCase();

                if (tag === "BR") {
                    rezultat += "\n";
                    return;
                }

                const prije = rezultat.length;

                for (let i = 0; i < node.childNodes.length; i++) {
                    obilazak(node.childNodes[i]);
                }

                if (jeBlockElement(node) && rezultat.length > prije) {
                    if (!rezultat.endsWith("\n")) rezultat += "\n";
                }
            }
        }

        obilazak(root);

        // normalizuj nove redove i ukloni završne
        return rezultat.replace(/\r\n/g, "\n").replace(/\n+$/g, "");
    }

    let dajBrojRijeci = function () {
        const rez = {
            ukupno: 0,
            boldiranih: 0,
            italic: 0
        };

        function jeBlockElement(node) {
            if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
            const blockTags = [
                "P", "DIV", "HEADER", "SECTION", "ARTICLE", "ASIDE", "MAIN",
                "H1", "H2", "H3", "H4", "H5", "H6", "LI"
            ];
            return blockTags.indexOf(node.tagName) !== -1;
        }

        function boldFromComputedOrNull(el) {
            if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;
            try {
                const cs = window.getComputedStyle(el);
                const fw = cs?.fontWeight;
                if (fw === "bold" || fw === "bolder") return true;
                const n = parseInt(String(fw), 10);
                if (Number.isFinite(n)) return n >= 600;
                return null;
            } catch (_) {
                return null;
            }
        }

        function italicFromComputedOrNull(el) {
            if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;
            try {
                const cs = window.getComputedStyle(el);
                const fs = String(cs?.fontStyle || "").toLowerCase();
                if (fs === "italic" || fs === "oblique") return true;
                if (fs === "normal") return false;
                return null;
            } catch (_) {
                return null;
            }
        }

        // Flatten vidljiv tekst + mapiraj stil po karakteru.
        // Ovo je bitno jer editor koristi više <div> linija i <br>.
        const chars = [];
        const boldFlags = [];
        const italicFlags = [];

        function pushText(txt, bold, italic) {
            if (!txt) return;
            for (let i = 0; i < txt.length; i++) {
                chars.push(txt[i]);
                boldFlags.push(Boolean(bold));
                italicFlags.push(Boolean(italic));
            }
        }

        function pushNewline() {
            if (chars.length > 0 && chars[chars.length - 1] === "\n") return;
            chars.push("\n");
            boldFlags.push(false);
            italicFlags.push(false);
        }

        function obilazak(node, bold, italic) {
            if (!node) return;

            if (node.nodeType === Node.TEXT_NODE) {
                pushText(node.nodeValue || "", bold, italic);
                return;
            }

            if (node.nodeType !== Node.ELEMENT_NODE) return;

            const tag = (node.tagName || "").toUpperCase();
            if (tag === "BR") {
                pushNewline();
                return;
            }

            // Uzimamo stanje stila iz computed style (tačno radi i za execCommand koji često pravi <span style="font-weight:bold">).
            // Ako computed style nije dostupan, fallback je tag + naslijeđeno stanje.
            let noviBold = bold;
            let noviItalic = italic;

            const bComp = boldFromComputedOrNull(node);
            if (bComp !== null) {
                noviBold = bComp;
            } else if (tag === "B" || tag === "STRONG") {
                noviBold = true;
            }

            const iComp = italicFromComputedOrNull(node);
            if (iComp !== null) {
                noviItalic = iComp;
            } else if (tag === "I" || tag === "EM") {
                noviItalic = true;
            }

            const prije = chars.length;
            for (let i = 0; i < node.childNodes.length; i++) {
                obilazak(node.childNodes[i], noviBold, noviItalic);
            }

            // Block elementi i linije u editoru moraju razdvajati riječi.
            if (jeBlockElement(node) && chars.length > prije) {
                pushNewline();
            }
        }

        obilazak(divRef, false, false);

        const text = chars.join("");

        // Riječ je token razdvojen razmakom/tabom/novim redom ili znakovima interpunkcije ',' i '.'.
        // Ostali znakovi interpunkcije (npr. '?', ':') ne razdvajaju riječ.
        const hasUnicodeLetters = (() => {
            try {
                return new RegExp("\\p{L}", "u").test("A");
            } catch (_) {
                return false;
            }
        })();

        function tokenImaSlovo(token) {
            if (!token) return false;
            if (hasUnicodeLetters) {
                try {
                    return /\p{L}/u.test(token);
                } catch (_) {
                    // fallback ispod
                }
            }
            for (let i = 0; i < token.length; i++) {
                if (slovoRegex.test(token[i])) return true;
            }
            return false;
        }

        function jeDelimiter(ch) {
            return ch === "," || ch === "." || /\s/.test(ch);
        }

        let tokenStart = null;
        for (let i = 0; i <= text.length; i++) {
            const ch = i < text.length ? text[i] : null;
            const delimiter = ch === null ? true : jeDelimiter(ch);

            if (!delimiter) {
                if (tokenStart === null) tokenStart = i;
                continue;
            }

            if (tokenStart !== null) {
                const start = tokenStart;
                const end = i; // exclusive
                const token = text.slice(start, end);

                if (tokenImaSlovo(token)) {
                    rez.ukupno++;

                    let allBold = true;
                    let allItalic = true;
                    for (let j = start; j < end; j++) {
                        if (!boldFlags[j]) allBold = false;
                        if (!italicFlags[j]) allItalic = false;
                        if (!allBold && !allItalic) break;
                    }

                    if (allBold) rez.boldiranih++;
                    if (allItalic) rez.italic++;
                }
                tokenStart = null;
            }
        }

        return rez;
    };

//pomocna ako se vec pojavljuje

const slovoVelikoRegex=/[A-ZŠĐČĆŽ]/;
function provjeraPostojiLi(uloge, str){
for(let i = 0; i<uloge.length; i++){
    if(uloge[i]==str)return true;
}
return false;
}
function jesuLiSpaceIliVelikoSlovo(str){
str=str.trim();
for(let i=0;i<str.length;i++){
    if(!(slovoVelikoRegex.test(str[i])|| str[i]==" "))return false;
}
let provjeraSpace=false;
for(let i=0;i<str.length;i++) if(str[i]!=" ")provjeraSpace=true;
return provjeraSpace;
}
function jePraznaLinija(linija) {
    return linija.trim().length === 0;
}

// Da li linija na indeksu i izgleda kao uloga ima makar jednu liniju govora
// prije nego što se naiđe na prekid (prazno / nova uloga / naslov scene / kraj).
// Linije koje su u potpunosti u zagradama se ignorišu (ne računaju se kao govor).
function imaGovorNakonUloge(linije, idxUloge) {
    if (!Array.isArray(linije)) return false;
    let j = idxUloge + 1;
    while (j < linije.length) {
        const l = linije[j];
        if (jePraznaLinija(l)) return false;
        if (jeNaslovScene(l)) return false;
        if (jesuLiSpaceIliVelikoSlovo(l)) return false;
        if (jeLinijaUZagradama(l)) {
            j++;
            continue;
        }
        return true;
    }
    return false;
}




    let dajUloge = function () {
        let uloge = [];
        let recenice = procitajCistiTekst(divRef).split("\n");
        for (let i = 0; i < recenice.length; i++) {
            // trenutna linija potencijalno ime uloge
            if (jesuLiSpaceIliVelikoSlovo(recenice[i]) && imaGovorNakonUloge(recenice, i)) {
                    let ime = recenice[i].trim();
                    if (!provjeraPostojiLi(uloge, ime)) uloge.push(ime);
            }
        }
        return uloge;
    }





    // poređenje dva imena uloga: koliko se slova razlikuje (dozvoljena mala razlika u dužini)
    function vrloSlicnoIme(imeA, imeB) {
        // maknemo razmake da "STARI MARKO" i "STARI     MARKO" ne zezaju
        let a = imeA.replace(/ /g, "");
        let b = imeB.replace(/ /g, "");

        let maxLen = Math.max(a.length, b.length);
        // prema zadatku: ako su oba imena duža od 5 slova dozvoljena su najviše 2 razlike, inače 1
        let maxRazlika = (maxLen > 5) ? 2 : 1;

        let i = 0, j = 0;
        let razlika = 0;

        while (i < a.length && j < b.length) {
            if (a[i] === b[j]) {
                i++;
                j++;
            } else {
                razlika++;
                if (razlika > maxRazlika) return false;

                // pokušaj preskočiti slovo u dužem stringu (brisanje/umetanje)
                if (a.length > b.length) {
                    i++;
                } else if (b.length > a.length) {
                    j++;
                } else {
                    // iste dužine: tretiramo kao zamjenu znaka
                    i++;
                    j++;
                }
            }
        }

        // preostali znakovi na kraju dužeg stringa računamo kao dodatne razlike
        razlika += (a.length - i) + (b.length - j);

        return razlika <= maxRazlika;
    }

    let pogresnaUloga = function() {
    let text = procitajCistiTekst(divRef);
    let recenice = text.split("\n");

    // broj pojavljivanja svake uloge
    let ulogaBrojac = {};   // ime -> count
    let ulogaImena = [];    // kljucevi, mogao sam i drugacije Object.keys()

    // prvo: pronađi sve validne uloge (isto pravilo kao u dajUloge)
    for (let i = 0; i < recenice.length; i++) {
        if (jesuLiSpaceIliVelikoSlovo(recenice[i]) && imaGovorNakonUloge(recenice, i)) {

            let ime = recenice[i].trim();

            if (ulogaBrojac[ime] === undefined) {
                ulogaBrojac[ime] = 1;
                ulogaImena.push(ime);
            } else {
                ulogaBrojac[ime]++;
            }
        }
    }

    let pogresne = [];

    // sad poredi svaku ulogu A sa svakom B
    for (let i = 0; i < ulogaImena.length; i++) {
        let A = ulogaImena[i];//uloga i broj njegovog pojavljivanja
        let countA = ulogaBrojac[A];

        for (let j = 0; j < ulogaImena.length; j++) {
            if (i === j) continue;

            let B = ulogaImena[j];
            let countB = ulogaBrojac[B];

            // uslov 2) - B se znatno češće pojavljuje
            if (countB >= 4 && countB >= countA + 3) {
                // uslov 1) - vrlo slična imena
                if (vrloSlicnoIme(A, B)) {
                    if (!provjeraPostojiLi(pogresne, A)) {
                        pogresne.push(A);
                    }
                }
            }
        }
    }

    return pogresne;
}


function jeLinijaUZagradama(linija) {
    let trimmed = linija.trim();
    return trimmed.length > 2 && trimmed[0] === '(' && trimmed[trimmed.length - 1] === ')';
}

// naslovi scena tipa: INT. KUHINJA - DAY, EXT. ULICA - NIGHT itd.
function jeNaslovScene(linija) {
    let trimmed = linija.trim();
    if (!(trimmed.startsWith("INT.") || trimmed.startsWith("EXT."))) return false;

    let idx = trimmed.indexOf(" - ");
    if (idx === -1) return false;

    let kraj = trimmed.substring(idx + 3).trim();
    return kraj === "DAY" || kraj === "NIGHT" || kraj === "AFTERNOON" ||
           kraj === "MORNING" || kraj === "EVENING";
}


let brojLinijaTeksta = function (uloga) {
    if (!uloga) return 0;
 
    let trazena = uloga.trim().toUpperCase();

    let text = procitajCistiTekst(divRef);
    let recenice = text.split("\n");

    let ukupno = 0;

    for (let i = 0; i < recenice.length; i++) {
        let linija = recenice[i];

        // da li je ovo red s imenom uloge
        if (jesuLiSpaceIliVelikoSlovo(linija)) {
            let ime = linija.trim();

            if (ime === trazena) {
                // ulazimo u blok govora (linije u zagradama ne brojimo)
                for (let j = i + 1; j < recenice.length; j++) {
                    let lin = recenice[j];

                    if (jePraznaLinija(lin)) break;
                    if (jeNaslovScene(lin)) break;
                    if (jesuLiSpaceIliVelikoSlovo(lin)) break;

                    if (jeLinijaUZagradama(lin)) {
                        // scenska napomena, ne brojimo, ali ne prekidamo blok
                        continue;
                    }

                    // linija govora ove uloge
                    ukupno++;
                }
            }
        }
    }

    return ukupno;
}
// akcijski segment = linija koja nije uloga, nije prazna, nije u zagradama
function jeAkcijskiSegment(linija) {
    // linija dolazi direktno iz divRef.innerText (split po "\n")
    // koristimo postojece pomocne provjere da se prazne i specijalne linije
    // ne tretiraju kao akcija
    if (jePraznaLinija(linija)) return false;
    if (jeLinijaUZagradama(linija)) return false;
    // naslove scena tretiramo kao akcijski prekid
    if (jeNaslovScene(linija)) return true;
    // sve ostalo (ukljucujuci lazne "uloge" bez govora) je akcijski segment
    return true;
}

    let scenarijUloge = function (uloga) {
    if (!uloga) return [];

    let trazena = uloga.trim().toUpperCase();

    // 1) Pročitamo tekst i podijelimo u linije
    let text = procitajCistiTekst(divRef);
    let recenice = text.split("\n");

    let replike = []; // svi blokovi govora
    let trenutnaScena = ""; // tekst naslova scene (ili "" ako nema)
    let brojacReplikaPoSceni = {}; // scena -> broj replika

    // 2) Prvi prolaz: pronađi sve replike (blokove govora)
    for (let i = 0; i < recenice.length; i++) {
        let linija = recenice[i];

        // nova scena?
        if (jeNaslovScene(linija)) {
            trenutnaScena = linija.trim();
            if (brojacReplikaPoSceni[trenutnaScena] === undefined) {
                brojacReplikaPoSceni[trenutnaScena] = 0;
            }
            continue;
        }

        // početak replike (ime uloge + linije govora)
        if (jesuLiSpaceIliVelikoSlovo(linija) && imaGovorNakonUloge(recenice, i)) {

            let imeUloge = linija.trim();
            let linijeReplike = [];
            let startIndex = i;
            let lastIndex = i;

            let j = i + 1;
            while (j < recenice.length) {
                let l2 = recenice[j];

                if (jeNaslovScene(l2)) break;
                if (jesuLiSpaceIliVelikoSlovo(l2)) break;

                if (jePraznaLinija(l2)) {
                    lastIndex = j;
                    break;
                }

                if (jeLinijaUZagradama(l2)) {
                    lastIndex = j;
                    j++;
                    continue;
                }

                // obična linija govora
                linijeReplike.push(l2);
                lastIndex = j;
                j++;
            }

            // ako nema nijedne linije govora, preskoči (ne formira repliku)
            if (linijeReplike.length > 0) {
                if (brojacReplikaPoSceni[trenutnaScena] === undefined) {
                    brojacReplikaPoSceni[trenutnaScena] = 0;
                }
                brojacReplikaPoSceni[trenutnaScena]++;

                replike.push({
                    scena: trenutnaScena,
                    uloga: imeUloge,
                    linije: linijeReplike,
                    pozicijaUTekstu: brojacReplikaPoSceni[trenutnaScena],
                    start: startIndex,
                    end: lastIndex,
                    segment: 0,       // popunjavamo kasnije
                    prevIndex: -1,    // indeks prethodne replike u istom segmentu
                    nextIndex: -1     // indeks sljedeće replike u istom segmentu
                });
            }

            i = lastIndex; // preskoči već obrađene linije
        }
    }

    // ako nema replika, nema ni scenarija
    if (replike.length === 0) return [];

    // 3) Drugi prolaz: odredi dijalog-segmente po sceni
    //   (akcijski segment ili novi naslov scene prekidaju segment)
    let sceneImena = [];
    for (let i = 0; i < replike.length; i++) {
        if (!provjeraPostojiLi(sceneImena, replike[i].scena)) {
            sceneImena.push(replike[i].scena);
        }
    }

    for (let s = 0; s < sceneImena.length; s++) {
        let scenaNaziv = sceneImena[s];

        // indeksi replika u ovoj sceni
        let indeksiScene = [];
        for (let i = 0; i < replike.length; i++) {
            if (replike[i].scena === scenaNaziv) {
                indeksiScene.push(i);
            }
        }

        if (indeksiScene.length === 0) continue;

        let segmentBroj = 0;

        for (let k = 0; k < indeksiScene.length; k++) {
            let idx = indeksiScene[k];

            if (k === 0) {
                segmentBroj = 1;
                replike[idx].segment = segmentBroj;
            } else {
                let prev = replike[indeksiScene[k - 1]];
                let cur = replike[idx];
                let prekid = false;

                // pogledaj linije između dvije replike
                for (let linIdx = prev.end + 1; linIdx < cur.start; linIdx++) {
                    let l = recenice[linIdx];

                    // naslov scene uvijek prekida
                    if (jeNaslovScene(l)) {
                        prekid = true;
                        break;
                    }

                    // ako je linija sva velikim slovima, provjeri da li je zaista pocetak replike
                    if (jesuLiSpaceIliVelikoSlovo(l)) {
                        let postojiReplika = false;
                        for (let r = 0; r < replike.length; r++) {
                            if (replike[r].start === linIdx) {
                                postojiReplika = true;
                                break;
                            }
                        }
                        // linija velikim slovima koja NIJE pocetak replike je akcijski red (npr. "AKCIJA PREKIDA")
                        if (!postojiReplika) {
                            prekid = true;
                            break;
                        }
                        // ako postoji replika, to ce biti obradjeno kao nova replika, ne ovdje
                        continue;
                    }

                    // ostali tekst (nije prazno, nije zagrade) tretiramo kao akcijski segment
                    if (jeAkcijskiSegment(l)) {
                        prekid = true;
                        break;
                    }
                }

                if (prekid) segmentBroj++;
                replike[idx].segment = segmentBroj;
            }
        }

        // za svaki segment u ovoj sceni, veži prev/next
        let maxSegment = 0;
        for (let i = 0; i < indeksiScene.length; i++) {
            let idx = indeksiScene[i];
            if (replike[idx].segment > maxSegment) {
                maxSegment = replike[idx].segment;
            }
        }

        for (let seg = 1; seg <= maxSegment; seg++) {
            let indeksiSegmenta = [];
            for (let i = 0; i < indeksiScene.length; i++) {
                let idx = indeksiScene[i];
                if (replike[idx].segment === seg) {
                    indeksiSegmenta.push(idx);
                }
            }

            for (let m = 0; m < indeksiSegmenta.length; m++) {
                let idx = indeksiSegmenta[m];
                let prevIdx = (m > 0) ? indeksiSegmenta[m - 1] : -1;
                let nextIdx = (m < indeksiSegmenta.length - 1) ? indeksiSegmenta[m + 1] : -1;

                replike[idx].prevIndex = prevIdx;
                replike[idx].nextIndex = nextIdx;
            }
        }
    }

    // 4) Filtriraj replike za traženu ulogu i složi rezultat
    let rezultat = [];

    for (let i = 0; i < replike.length; i++) {
        let r = replike[i];

        if (r.uloga === trazena) {
            // prethodni
            let prethodni = null;
            if (r.prevIndex !== -1) {
                let p = replike[r.prevIndex];
                prethodni = {
                    uloga: p.uloga,
                    linije: p.linije
                };
            }

            // sljedeći
            let sljedeci = null;
            if (r.nextIndex !== -1) {
                let sIdx = replike[r.nextIndex];
                sljedeci = {
                    uloga: sIdx.uloga,
                    linije: sIdx.linije
                };
            }

            rezultat.push({
                scena: r.scena,
                pozicijaUTekstu: r.pozicijaUTekstu,
                prethodni: prethodni,
                trenutni: {
                    uloga: r.uloga,
                    linije: r.linije
                },
                sljedeci: sljedeci
            });
        }
    }

    return rezultat;
};

    let grupisiUloge = function () {
    // 1) Pročitamo tekst i podijelimo u linije
    let text = procitajCistiTekst(divRef);
    let recenice = text.split("\n");

    let replike = [];              // svi blokovi govora
    let trenutnaScena = "";        // tekst naslova scene (ili "" ako nema)
    let brojacReplikaPoSceni = {}; // scena -> broj replika

    // 2) Prvi prolaz: pronađi sve replike (blokove govora)
    for (let i = 0; i < recenice.length; i++) {
        let linija = recenice[i];

        // nova scena?
        if (jeNaslovScene(linija)) {
            trenutnaScena = linija.trim();
            if (brojacReplikaPoSceni[trenutnaScena] === undefined) {
                brojacReplikaPoSceni[trenutnaScena] = 0;
            }
            continue;
        }

        // početak replike (ime uloge + linije govora)
        if (jesuLiSpaceIliVelikoSlovo(linija) && imaGovorNakonUloge(recenice, i)) {

            let imeUloge = linija.trim();
            let linijeReplike = [];
            let startIndex = i;
            let lastIndex = i;

            let j = i + 1;
            while (j < recenice.length) {
                let l2 = recenice[j];

                if (jeNaslovScene(l2)) break;
                if (jesuLiSpaceIliVelikoSlovo(l2)) break;

                if (jePraznaLinija(l2)) {
                    lastIndex = j;
                    break;
                }

                if (jeLinijaUZagradama(l2)) {
                    lastIndex = j;
                    j++;
                    continue;
                }

                // obična linija govora
                linijeReplike.push(l2);
                lastIndex = j;
                j++;
            }

            // ako nema nijedne linije govora, preskoči (ne formira repliku)
            if (linijeReplike.length > 0) {
                if (brojacReplikaPoSceni[trenutnaScena] === undefined) {
                    brojacReplikaPoSceni[trenutnaScena] = 0;
                }
                brojacReplikaPoSceni[trenutnaScena]++;

                replike.push({
                    scena: trenutnaScena,
                    uloga: imeUloge,
                    linije: linijeReplike,
                    pozicijaUTekstu: brojacReplikaPoSceni[trenutnaScena],
                    start: startIndex,
                    end: lastIndex,
                    segment: 0 // popunjavamo kasnije
                });
            }

            i = lastIndex; // preskoči već obrađene linije
        }
    }

    // nema replika → nema ni grupa
    if (replike.length === 0) return [];

    // 3) Odredi dijalog-segmente po sceni
    let sceneImena = [];
    for (let i = 0; i < replike.length; i++) {
        if (!provjeraPostojiLi(sceneImena, replike[i].scena)) {
            sceneImena.push(replike[i].scena);
        }
    }

    for (let s = 0; s < sceneImena.length; s++) {
        let scenaNaziv = sceneImena[s];

        // indeksi replika u ovoj sceni
        let indeksiScene = [];
        for (let i = 0; i < replike.length; i++) {
            if (replike[i].scena === scenaNaziv) {
                indeksiScene.push(i);
            }
        }

        if (indeksiScene.length === 0) continue;

        let segmentBroj = 0;

        for (let k = 0; k < indeksiScene.length; k++) {
            let idx = indeksiScene[k];

            if (k === 0) {
                segmentBroj = 1;
                replike[idx].segment = segmentBroj;
            } else {
                let prev = replike[indeksiScene[k - 1]];
                let cur = replike[idx];
                let prekid = false;

                // pogledaj linije između dvije replike
                for (let linIdx = prev.end + 1; linIdx < cur.start; linIdx++) {
                    let l = recenice[linIdx];
                    if (jeAkcijskiSegment(l) || jeNaslovScene(l)) {
                        prekid = true;
                        break;
                    }
                }

                if (prekid) segmentBroj++;
                replike[idx].segment = segmentBroj;
            }
        }
    }

    // 4) Formiraj grupe uloga po sceni i segmentu (hronološki)
    let rezultat = [];

    for (let s = 0; s < sceneImena.length; s++) {
        let scenaNaziv = sceneImena[s];

        // izdvoj replike iz ove scene
        let indeksiScene = [];
        for (let i = 0; i < replike.length; i++) {
            if (replike[i].scena === scenaNaziv) {
                indeksiScene.push(i);
            }
        }
        if (indeksiScene.length === 0) continue;

        // nađi max segment u ovoj sceni
        let maxSegment = 0;
        for (let i = 0; i < indeksiScene.length; i++) {
            let r = replike[indeksiScene[i]];
            if (r.segment > maxSegment) maxSegment = r.segment;
        }

        // za svaki segment u sceni formiraj grupu uloga
        for (let seg = 1; seg <= maxSegment; seg++) {
            let ulogeSeg = [];

            for (let i = 0; i < indeksiScene.length; i++) {
                let r = replike[indeksiScene[i]];
                if (r.segment === seg) {
                    let ime = r.uloga;
                    // dodaj ulogu samo ako je još nema (i zadrži hronološki redoslijed pojave)
                    if (!provjeraPostojiLi(ulogeSeg, ime)) {
                        ulogeSeg.push(ime);
                    }
                }
            }

            // ako segment uopće nema replika (može se desiti teoretski) – preskoči
            if (ulogeSeg.length === 0) continue;

            rezultat.push({
                scena: scenaNaziv,
                segment: seg,
                uloge: ulogeSeg
            });
        }
    }

    return rezultat;
};

   let formatirajTekst = function (komanda) {
    // podržane komande
    let mapaKomandi = {
        bold: "bold",
        italic: "italic",
        underline: "underline"
    };

    if (!mapaKomandi[komanda]) {
        return false; // nepoznata komanda
    }

    let sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;

    let range = sel.getRangeAt(0);

    // nema ništa selektovano
    if (range.collapsed) return false;

    // helper: provjera da li je node unutar editora
    function jeUnutarEditora(node) {
        if (!node) return false;
        return node === divRef || divRef.contains(node);
    }

    // provjeri da li su i početak i kraj selekcije unutar editora
    if (!jeUnutarEditora(range.startContainer) || !jeUnutarEditora(range.endContainer)) {
        return false;
    }

    // fokus na editor da bi execCommand radio na pravom mjestu, tako radi ta funkcija
    divRef.focus();

    // primijeni formatiranje preko execCommand
    // moderne implementacije ne prave nepotrebno ugniježđivanje istog stila
    document.execCommand(mapaKomandi[komanda], false, null);

    return true;
};



    return {
        dajBrojRijeci,
        dajUloge,
        pogresnaUloga,
        brojLinijaTeksta,
        scenarijUloge,
        grupisiUloge,
        formatirajTekst
    }
};
