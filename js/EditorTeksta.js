let EditorTeksta = function (divRef) {
    //privatni atributi modula
    if(divRef.contentEditable !== "true") throw new Error("Neispravan DIV, ne posjeduje contenteditable atribut!");
    if(divRef.tagName !='DIV') throw new Error("Pogresan tip elementa!");
 
    const slovoRegex = /[A-Za-zŠĐČĆŽšđčćž]/;
    // funkcija: da li je sastavni dio riječi
    function isWordChar(ch) {
        return slovoRegex.test(ch) || ch === '-' || ch === "'";
    }

    let dajBrojRijeci = function () {
        let rez = {
            ukupno: 0,
            boldiranih: 0,
            italic: 0
        };

        // stanje trenutne "logičke" riječi kroz cijeli dokument
        let trenutnaRijec = "";
        let wordHasLetter = false;    // da osiguramo da riječ ima makar jedno slovo
        let wordBold = true;          // da li su svi znakovi u riječi bold
        let wordItalic = true;        // da li su svi znakovi u riječi italic

        // helper: završava trenutnu riječ (ako postoji)
        function zavrsiRijec() {
            if (trenutnaRijec.length > 0 && wordHasLetter) {
                rez.ukupno++;

                if (wordBold) rez.boldiranih++;
                if (wordItalic) rez.italic++;
            }
            // reset za sljedeću riječ
            trenutnaRijec = "";
            wordHasLetter = false;
            wordBold = true;
            wordItalic = true;
        }

        // rekurzivni prolazak kroz DOM
        function obilazak(node, bold, italic) {
            if (node.nodeType === Node.TEXT_NODE) { //odnosno value=3
                // obrađujemo tekst karakter po karakter
                let text = node.nodeValue; //ovako dolazimo do teksta

                for (let i = 0; i < text.length; i++) {
                    let ch = text[i];

                    if (isWordChar(ch)) {
                        // ovaj char ulazi u neku riječ
                        let jeSlovo = slovoRegex.test(ch);


                        if (trenutnaRijec === "") {
                            // počinjemo novu riječ
                            trenutnaRijec = ch;
                            wordHasLetter = jeSlovo;
                            // za prvu polovinu riječi preuzimamo formatiranje
                            wordBold = bold;
                            wordItalic = italic;
                        } else {
                            // nastavljamo postojeću riječ
                            trenutnaRijec += ch;
                            if (jeSlovo) wordHasLetter = true;
                            // riječ će biti boldirana/italic samo ako SVI znakovi to jesu
                            wordBold = wordBold && bold;
                            wordItalic = wordItalic && italic;
                        }
                    } else {
                        // naišli smo na razmak, tačku, zarez, itd. → kraj riječi
                        zavrsiRijec();
                    }
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                // ažuriramo stanje bold/italic ako ulazimo u te tagove
                let tag = node.tagName.toLowerCase();
                let noviBold = bold;//novi bold koji moze ostati kao i stari
                let noviItalic = italic;

                if (tag === 'b' || tag === 'strong') noviBold = true;
                if (tag === 'i' || tag === 'em') noviItalic = true;

                // prolaz kroz djecu
                for (let i = 0; i < node.childNodes.length; i++) {
                    obilazak(node.childNodes[i], noviBold, noviItalic);
                }
            } else {
                // druge tipove čvorova ignorišemo
                return;
            }
        }

        // pokrećemo obilazak od root-a (divRef), početno bez bold/italic
        obilazak(divRef, false, false);

        // ako je dokument završio usred riječi, zatvori je
        zavrsiRijec();

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
for(let i=0;i<str.length;i++){
    if(!(slovoVelikoRegex.test(str[i])|| str[i]==" "))return false;
}
let provjeraSpace=false;
for(let i=0;i<str.length;i++) if(str[i]!=" ")provjeraSpace=true;
return true&&provjeraSpace;
}
function jePraznaLinija(linija) {
    return linija.trim().length === 0;
}




    let dajUloge = function () {
        let uloge = [];
        let recenice = divRef.innerText.split("\n");
        for(let i=0;i<recenice.length;i++){
            if(jesuLiSpaceIliVelikoSlovo(recenice[i]) && i+1!=recenice.length && !jePraznaLinija(recenice[i+1]) && !jesuLiSpaceIliVelikoSlovo(recenice[i+1])){
                if(!provjeraPostojiLi(uloge,recenice[i].trim()))uloge.push(recenice[i].trim());
            }
        }
        return uloge;
    }





    // poredjenje dva imena uloga: koliko se slova razlikuje
function vrloSlicnoIme(imeA, imeB) {
    // maknemo razmake da "STARI MARKO" i "STARI     MARKO" ne zezaju
    let a = imeA.replace(/ /g, "");
    let b = imeB.replace(/ /g, "");

    if (a.length !== b.length) return false;

    // prema zadatku: oba moraju biti > 5 da bi razlika bila do 2
    let maxRazlika = (a.length > 5 && b.length > 5) ? 2 : 1;

    let razlika = 0;

    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            razlika++;
            if (razlika > maxRazlika) return false;
        }
    }

    return true;
}

    let pogresnaUloga = function() {
    let text = divRef.innerText;
    let recenice = text.split("\n");

    // broj pojavljivanja svake uloge
    let ulogaBrojac = {};   // ime -> count
    let ulogaImena = [];    // kljucevi, mogao sam i drugacije Object.keys()

    // prvo: pronađi sve validne uloge (isto pravilo kao u dajUloge)
    for (let i = 0; i < recenice.length; i++) {
        if (jesuLiSpaceIliVelikoSlovo(recenice[i]) &&
            i + 1 < recenice.length &&
            !jePraznaLinija(recenice[i + 1]) &&
            !jesuLiSpaceIliVelikoSlovo(recenice[i + 1])) {

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
    return kraj === "DAY" || kraj === "NIGHT" || kraj === "AFTERNOON" || kraj === "MORNING" || kraj === "EVENING";
}


let brojLinijaTeksta = function (uloga) {
    if (!uloga) return 0;

    let trazena = uloga.trim().toUpperCase();

    let text = divRef.innerText;
    let recenice = text.split("\n");

    let ukupno = 0;

    for (let i = 0; i < recenice.length; i++) {
        let linija = recenice[i];

        // da li je ovo red s imenom uloge
        if (jesuLiSpaceIliVelikoSlovo(linija)) {
            let ime = linija.trim();

            if (ime === trazena) {
                // provjera da li je uopšte validna uloga (da ispod ima govor)
                if (i + 1 < recenice.length &&
                    !jePraznaLinija(recenice[i + 1]) &&
                    !jesuLiSpaceIliVelikoSlovo(recenice[i + 1])) {

                    // ulazimo u blok govora
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
    }

    return ukupno;
}
// akcijski segment = linija koja nije uloga, nije prazna, nije u zagradama
function jeAkcijskiSegment(linija) {
    if (jePraznaLinija(linija)) return false;
    if (jeLinijaUZagradama(linija)) return false;
    if (jesuLiSpaceIliVelikoSlovo(linija)) return false;
    if (jeNaslovScene(linija)) return true;
    return true;
}

    let scenarijUloge = function (uloga) {
    if (!uloga) return [];

    let trazena = uloga.trim().toUpperCase();

    // 1) Pročitamo tekst i podijelimo u linije
    let text = divRef.innerText;
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
        if (jesuLiSpaceIliVelikoSlovo(linija) &&
            i + 1 < recenice.length &&
            !jePraznaLinija(recenice[i + 1]) &&
            !jesuLiSpaceIliVelikoSlovo(recenice[i + 1])) {

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
                    if (jeAkcijskiSegment(l) || jeNaslovScene(l)) {
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

    let grupisiUloge = function (){

    }
    let formatirajTekst = function (komanda){

    }


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
