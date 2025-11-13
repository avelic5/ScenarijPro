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

    let dajUloge = function () {
    }
    let pogresnaUloga= function() {
    }
    let brojLinijaTeksta = function (uloga){
    }
    let scenarijUloge = function (uloga){
    }
    let grupisiUloge = function (){

    }
    let formatirajTekst = function (komanda){

    }

    // … na isti način i za ostale metode
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
