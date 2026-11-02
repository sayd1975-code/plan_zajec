/* Testy v6.44 — import wykazów dziennikowych (arkusz = oddział):
   sheetClassGuess (nazwa arkusza → oddział przez SYN7), cleanStudentName (cinanie dopisków),
   parseStudentsText w trybie „#sheet:" (kolumna ucznia z nagłówka, raw bez filtra pustych),
   integracyjnie PRAWDZIWY plik „Wykaz uczniów 2026-2027.xlsx" (69 uczniów, 15 arkuszy)
   przez pełny pipeline apki zipRead → xlsxToTsv → parseStudentsText → dedupe.
   Nazwiska w suitach są WYŁĄCZNIE fikcyjne; prawdziwe dane czytane z pliku w runtime.
   Uruchomienie: node test-wykaz-v644.js. Bez "use strict" — sloppy eval wycieka funkcje apki. */
const fs = require("fs");

/* ---------- mocki DOM ---------- */
function el(){ return { value:"", textContent:"", innerHTML:"", checked:false, files:[],
  className:"", style:{ display:"" },
  classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
  appendChild(){}, addEventListener(){}, scrollIntoView(){}, focus(){}, setAttribute(){}, getAttribute(){ return null; } }; }
const INPUTS = {};
global.document = { getElementById(id){ return (id in INPUTS) ? INPUTS[id] : el(); }, querySelector(){ return el(); }, documentElement:{ classList:{ add(){}, remove(){}, contains(){ return false; }, toggle(){} } },
  addEventListener(){}, createElement(){ return el(); }, body:{ classList:{ add(){}, remove(){}, toggle(){} } } };
global.window = global;
try { global.navigator = {}; } catch(e) {}
global.location = { protocol: "http:" };
const _store = {};
global.localStorage = { getItem(k){ return (k in _store) ? _store[k] : null; }, setItem(k,v){ _store[k] = String(v); }, removeItem(k){ delete _store[k]; } };
global.confirm = () => true;
global.fetch = () => Promise.resolve({ ok: true });
global.alert = () => {};

/* ---------- załadowanie apki ---------- */
const raw = fs.readFileSync(process.env.APP_SOURCE || "/home/user/canvases/plan-zajec-pwa/CANVAS.md", "utf8");
const html = raw.startsWith("---") ? raw.split(/^---$/m).slice(2).join("---") : raw; /* canvas (frontmatter) albo goły index.html */
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const appSrc = scripts.reduce((a, b) => (b.length > a.length ? b : a));
eval(appSrc.replace('"use strict";', ""));

/* ---------- harness ---------- */
let pass = 0, fail = 0; const fails = [];
function T(name, cond){ if (cond) pass++; else { fail++; fails.push(name); console.log("  ✗ FAIL:", name); } }
function fresh(){ return normalize({ teachers: [], classes: [], activities: [], placement: {}, settings: {} }); }
function sps7(){ S = sps7State(); return S; }

/* ==================== A. sheetClassGuess — nazwa arkusza → oddział ==================== */
{
  sps7();
  /* syntetyczne nazwy arkuszy o strukturze prawdziwego wykazu (fikcyjne inicjały) */
  const map = {
    "kl. 1a X.Y": "1a",
    "kl. 2A X.Y": "2a AUT",
    "kl. 2BM X.X": "2b AUT (m)",
    "kl. 3A X.X": "3a AUT",
    "kl.3B X.X": "3b AUT",
    "kl. 3C X.X": "3c AUT",
    "kl. 4 AUT X.X": "4a AUT",
    "kl. 5 ZET X.X": "5 ZET",
    "kl. 5aM X.X": "5a M",
    "kl. 6aM X.X": "6a M",
    "kl. 6b X.X": "6b",
    "kl. 6 AUT X.X": "6 AUT",
    "kl. 7 AUT X.X": "7 AUT",
    "kl. 7a X.X": "7a",
    "kl. 8 ZET X.X": "8 ZET"
  };
  let ok = 0, bad = [];
  for (const [sheet, cls] of Object.entries(map)){
    const g = sheetClassGuess(sheet);
    if (g && g.name === cls) ok++; else bad.push(sheet + " → " + (g ? g.name : "null") + " (oczek. " + cls + ")");
  }
  T("A1: wszystkie 15 nazw arkuszy mapują na właściwe oddziały SPS7",
    ok === 15 && !bad.length);
  if (bad.length) console.log("   ", bad.join("; "));
  T("A2: „Arkusz9”, „Arkusz10”, „Świetlica” → null (arkusze pomocnicze ignorowane)",
    sheetClassGuess("Arkusz9") === null && sheetClassGuess("Arkusz10") === null && sheetClassGuess("Świetlica") === null);
  T("A3: warianty pisowni — „KL. 2A”, „klasa 3C”, „KL. 6b” działają",
    sheetClassGuess("KL. 2A").name === "2a AUT" && sheetClassGuess("klasa 3C").name === "3c AUT" && sheetClassGuess("KL. 6b").name === "6b");
  T("A4: nieznany oddział („kl. 9z”) → null (świadome pominięcie, nie zgadywanie)",
    sheetClassGuess("kl. 9z") === null);
}

/* ==================== B. cleanStudentName — dopiski z wykazów ==================== */
{
  T("B1: „X Y przyjęta od 27.10.25” → „X Y”",
    cleanStudentName("Nowakowa Ala przyjęta od 27.10.25") === "Nowakowa Ala");
  T("B2: „X Y 02.03.2026” (doklejona data) → czyste nazwisko",
    cleanStudentName("Testowy Jan 02.03.2026") === "Testowy Jan");
  T("B3: „X Y KL.II a” (dopisek klasy) → czyste nazwisko",
    cleanStudentName("Próbn Anna KL.II a") === "Próbn Anna");
  T("B4: wieloliniowa komórka → tylko pierwsza linia",
    cleanStudentName("Wielolin Jan\nprzyjęty 25.09.2023") === "Wielolin Jan");
  T("B5: format ISO na końcu („X Y 2018-11-13 00:00:00”) → czyste",
    cleanStudentName("Datowna Ewa 2018-11-13 00:00:00") === "Datowna Ewa");
  T("B6: czyste nazwisko trójczłonowe bez zmian",
    cleanStudentName("Kowalski Jan Piotr") === "Kowalski Jan Piotr");
  T("B7: „X Y od 14.09.2022” → „X Y”",
    cleanStudentName("Dopiskowy Zygmunt od 14.09.2022") === "Dopiskowy Zygmunt");
}

/* ==================== C. parseStudentsText — tryb wykazu (#sheet) ==================== */
{
  sps7();
  /* mini-wykaz dziennikowy — struktura jak w prawdziwym pliku, dane fikcyjne */
  const tsv = [
    "#sheet: kl. 2A X.Y",
    "KL. II A mgr X X    rok szkolny 2026/2027",
    "l.p\tNazwisko i imiona ucznia\tData i miejsce urodzenia\tAdres\tTelefon\tPESEL ucznia\tNumer orzeczenia\tNr w księdze ucznia",
    "1\tTestowy Jan Piotr\t04.12.2017 X\tul. X 1\t501 100 200\t17320404612\tPPP-1.2026\t3082",
    "2\tPróbna Ada\t07.03.2017 X\tul. Y 2\t502 200 300\t17230701564\tPPP-2.2026\t3083",
    "",
    "#sheet: kl. 5 ZET X.X",
    "KL. 5 ZET mgr X X rok szkolny 2026/2027",
    "l.p\tNazwisko i imiona ucznia\tData urodzenia\tAdres",
    "1\tFikcyja Ala przyjęta od 27.10.25\t19.09.2013 X\tul. Z 3"
  ].join("\n");
  const r = parseStudentsText(tsv);
  T("C1: mini-wykaz 2 arkusze → 3 uczniów, 0 pominiętych",
    r.rows.length === 3 && r.skipped.length === 0);
  T("C2: uczniowie z pierwszego arkusza trafiają do „2a AUT” (SYN7)",
    r.rows[0] && r.rows[0].cls.name === "2a AUT" && r.rows[0].name === "Testowy Jan Piotr"
    && r.rows[1].cls.name === "2a AUT" && r.rows[1].name === "Próbna Ada");
  T("C3: drugi arkusz „5 ZET” i czyszczenie dopisku „przyjęta od…”",
    r.rows[2] && r.rows[2].cls.name === "5 ZET" && r.rows[2].name === "Fikcyja Ala");
  T("C4: kolumna „PESEL ucznia” NIE myli kolumny (pierwszy nagłówek z „uczni…” wygrywa)",
    r.rows.every(row => !/^\d+$/.test(row.name)));
  /* arkusz nierozpoznany → wiersze nie wchodzą do rows */
  const tsv2 = [
    "#sheet: Świetlica",
    "l.p\tNazwisko i imiona ucznia",
    "1\tNikczemny Nikt"
  ].join("\n");
  const r2 = parseStudentsText(tsv2);
  T("C5: arkusz nierozpoznany („Świetlica”) → 0 uczniów, nic nie zgadnięte",
    r2.rows.length === 0);
  /* regresje starego formatu v6.40 */
  const r3 = parseStudentsText("1a | Jan Kowalski\n1a\tAnna Wiśniewska");
  T("C6: stary format „oddział | imię nazwisko” bez #sheet — bez regresji",
    r3.rows.length === 2 && r3.rows[0].name === "Jan Kowalski" && r3.rows[0].cls.name === "1a");
  const r4 = parseStudentsText("1a | 2 uczniów");
  T("C7: liczebności („2 uczniów”) nadal odrzucane — bez regresji v6.40",
    r4.rows.length === 0 && r4.skipped.length === 1);
  /* wiersz danych bez nagłówka kolumn w arkuszu → pominięty cicho, nie zgadza kolumny */
  const tsv5 = [
    "#sheet: kl. 6b X.X",
    "KL.6 b mgr X X",
    "1\tKtoś Tam"
  ].join("\n");
  const r5 = parseStudentsText(tsv5);
  T("C8: arkusz bez wiersza nagłówków kolumn → 0 uczniów (bez zgadywania kolumn)",
    r5.rows.length === 0);
  /* puste wiersze danych z samym l.p → pomijane */
  const tsv6 = [
    "#sheet: kl. 6b X.X",
    "l.p\tNazwisko i imiona ucznia",
    "1\tPierwszy Uczeń",
    "2\t",
    "3\tDrugi Uczeń"
  ].join("\n");
  const r6 = parseStudentsText(tsv6);
  T("C9: puste nazwiska między danymi pomijane cicho (2 uczniów, nie 3)",
    r6.rows.length === 2 && r6.skipped.length === 0);
}

/* ==================== D. integracyjnie — PRAWDZIWY plik wykazu (pełny pipeline apki; wymaga pliku lokalnego — w CI sekcja pomijana) ==================== */
if (fs.existsSync("/home/user/uploads/Wykaz uczniów 2026-2027.xlsx")) {
  sps7();
  const buf = fs.readFileSync("/home/user/uploads/Wykaz uczniów 2026-2027.xlsx");
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const tsv = xlsxToTsv(zipRead(ab));
  const r = parseStudentsText(tsv);
  T("D1: prawdziwy plik: 69 uczniów, 0 pominiętych, 15 oddziałów",
    r.rows.length === 69 && r.skipped.length === 0
    && new Set(r.rows.map(x => x.cls.name)).size === 15);
  const expect = { "1a": 2, "2a AUT": 4, "2b AUT (m)": 6, "3a AUT": 4, "3b AUT": 4, "3c AUT": 2, "4a AUT": 4, "5 ZET": 1, "5a M": 6, "6a M": 6, "6b": 11, "6 AUT": 3, "7 AUT": 2, "7a": 12, "8 ZET": 2 };
  const per = {};
  r.rows.forEach(row => per[row.cls.name] = (per[row.cls.name] || 0) + 1);
  T("D2: rozkład per oddział zgadza się z arkuszami (2,4,6,4,4,2,4,1,6,6,11,3,2,12,2)",
    Object.keys(expect).every(k => per[k] === expect[k]));
  /* symulacja applyStudentsImport: append + dedupe po normName */
  let added = 0, dup = 0;
  r.rows.forEach(function(row){
    const exists = (row.cls.students || []).some(st => normName(st.name) === normName(row.name));
    if (exists){ dup++; return; }
    (row.cls.students = row.cls.students || []).push({ id: nextId(row.cls.students, "s"), name: row.name });
    added++;
  });
  T("D3: symulacja importu: 69 dodanych, 0 duplikatów w pierwszym przebiegu",
    added === 69 && dup === 0);
  const r2 = parseStudentsText(tsv);
  let dup2 = 0;
  r2.rows.forEach(row => { if ((row.cls.students || []).some(st => normName(st.name) === normName(row.name))) dup2++; });
  T("D4: drugi ten sam import → 69 duplikatów pominiętych, nic się nie dubluje",
    dup2 === 69);
} else {
  console.log("— D: pominięto (brak lokalnego pliku wykazu — sekcja wymaga realnego pliku, patrz README)");
}

/* ==================== E. sanity ==================== */
{
  T("E1: stopka „Wersja 6.4x.” w html apki (wersjo-odporne, ≥6.44)",
    /Wersja 6\.4[4-9]\./.test(html));
  T("E2: SYN7 w kodzie — bez danych osobowych (same nazwy oddziałów)",
    typeof SYN7 === "object" && Object.keys(SYN7).length === 16);
}

/* ==================== WYNIK ==================== */
console.log("WSZYSTKIE TESTY v6.44-wykaz ZAKOŃCZONE");
console.log("WYNIK v6.44-wykaz: " + pass + " OK, " + fail + " FAIL  (razem " + (pass + fail) + ")");
if (fail) { console.log("Nieudane:"); fails.forEach(f => console.log("  -", f)); process.exit(1); }
