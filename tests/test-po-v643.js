/* Testy v6.43 — roundtrip skrótów dni: slotsToStr drukuje „po”/„pi”, parsery je przyjmują.
   Fix: parseSlotsText + parseAvailText + parseCBlockText rozumieją „po” (poniedziałek)
   i „pi” (piątek) — z negatywnym lookahead, żeby „poziomka 3”/„piwo 2” nie były dniami.
   Uruchomienie: node test-po-v643.js. Bez "use strict" — sloppy eval wycieka funkcje apki. */
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
function mkC(S, name){ const c = { id: nextId(S.classes, "c"), name, rew: 2, blocked: [] }; S.classes.push(c); return c; }
function mkT(S, name){ const t = { id: nextId(S.teachers, "t"), name, short: name.split(/\s+/).slice(-1)[0].slice(0,3), unavail: [], unavailWhy: {} }; S.teachers.push(t); return t; }
function resetInputs(){ for (const k of Object.keys(INPUTS)) delete INPUTS[k]; }

/* ==================== A. parseSlotsText — nowe skróty „po”/„pi” ==================== */
{
  let r = parseSlotsText("po 1-3");
  T("A1: „po 1-3” → sloty [0,1,2] (poniedziałek)",
    r.slots.length === 3 && [0,1,2].every(s => r.slots.indexOf(s) >= 0));
  r = parseSlotsText("pi 5");
  T("A2: „pi 5” → slot [36] (piątek, lekcja 5)",
    r.slots.length === 1 && r.slots[0] === 36);
  r = parseSlotsText("po 1; wt 2; śr 3; cz 4; pi 5");
  T("A3: pełny tydzień nowymi skrótami „po/wt/śr/cz/pi” → [0,9,18,27,36]",
    r.slots.join() === "0,9,18,27,36");
  r = parseSlotsText("poziomka 3");
  T("A4: „poziomka 3” → negatywny lookahead blokuje (skipped, 0 slotów)",
    r.slots.length === 0 && r.skipped.length === 1);
  r = parseSlotsText("piwo 2");
  T("A5: „piwo 2” → negatywny lookahead blokuje (skipped, 0 slotów)",
    r.slots.length === 0 && r.skipped.length === 1);
  r = parseSlotsText("piątek 1");
  T("A6: „piątek 1” → stara forma pi[ąa] nadal działa → [32]",
    r.slots.length === 1 && r.slots[0] === 32);
  r = parseSlotsText("pn 2");
  T("A7: „pn 2” bez regresji → [1]",
    r.slots.length === 1 && r.slots[0] === 1);
  r = parseSlotsText("pon 2");
  T("A8: „pon 2” bez regresji → [1]",
    r.slots.length === 1 && r.slots[0] === 1);
  r = parseSlotsText("po 1; po 1-2");
  T("A9: „po 1; po 1-2” → deduplikacja → [0,1]",
    r.slots.length === 2 && r.slots.indexOf(0) >= 0 && r.slots.indexOf(1) >= 0);
  r = parseSlotsText("po cały");
  T("A10: „po cały” → cały poniedziałek [0-7]",
    r.slots.length === 8 && r.slots.every(s => s >= 0 && s <= 7));
  r = parseSlotsText("pi do 3");
  T("A11: „pi do 3” → piątek lekcje 1-3 [32,33,34]",
    r.slots.length === 3 && r.slots.every(s => s >= 32 && s <= 34));
}

/* ==================== B. parseAvailText (dyspozycyjność) — „po”/„pi” ==================== */
{
  let r = parseAvailText("po cały");
  T("B1: dyspozycyjność „po cały” → 8 slotów poniedziałku",
    r.slots.length === 8 && r.slots.every(s => s >= 0 && s <= 7));
  r = parseAvailText("pi do 3");
  T("B2: dyspozycyjność „pi do 3” → [32,33,34]",
    r.slots.length === 3 && r.slots.every(s => s >= 32 && s <= 34));
  r = parseAvailText("wt 1-2; po 5");
  T("B3: dyspozycyjność mieszana „wt 1-2; po 5” → [8,9,4]",
    r.slots.length === 3 && [8,9,4].every(s => r.slots.indexOf(s) >= 0));
}

/* ==================== C. parseCBlockText (blokady oddziału) — „po”/„pi” ==================== */
{
  let r = parseCBlockText("po 1; pi 7");
  T("C1: szybkie wpisywanie bez nazwy klasy „po 1; pi 7” → 1 wiersz, po=[1], pi=[7]",
    r.rows.length === 1 && r.skipped.length === 0
    && r.rows[0].days[0].join() === "1" && r.rows[0].days[4].join() === "7");
  r = parseCBlockText("1a; po 2; pi 3");
  T("C2: z nazwą klasy „1a; po 2; pi 3” → name „1a”, po=[2], pi=[3]",
    r.rows.length === 1 && r.rows[0].name === "1a"
    && r.rows[0].days[0].join() === "2" && r.rows[0].days[4].join() === "3");
  r = parseCBlockText("poziomka 3");
  T("C3: „poziomka 3” → lookahead blokuje → skipped",
    r.rows.length === 0 && r.skipped.length === 1);
}

/* ==================== D. pełny roundtrip slotsToStr → parser ==================== */
{
  const st = fresh(); S = st;
  let allOk = true;
  for (let d = 0; d < 5; d++){
    const slot = d * NH; /* lekcja 1 każdego dnia */
    const txt = slotsToStr([slot]);
    const r = parseSlotsText(txt);
    if (!(r.slots.length === 1 && r.slots[0] === slot)){ allOk = false; break; }
  }
  T("D1: slotsToStr → parseSlotsText roundtrip dla każdego dnia tygodnia (po/wt/śr/cz/pi)",
    allOk);
  T("D2: slotsToStr([0,1,2]) = „po 1,2,3” — dokładny format",
    slotsToStr([0,1,2]) === "po 1,2,3");
  T("D3: slotsToStr([32,33]) = „pi 1,2” — dokładny format",
    slotsToStr([32,33]) === "pi 1,2");
}

/* ==================== E. ścieżki UI — blokada i wyjazd nowym skrótem ==================== */
{
  /* E1: addNamedBlock z „po 1-2” */
  const st = fresh();
  const t1 = mkT(st, "Anna Testowa");
  S = st; ogrT = t1.id; resetInputs();
  INPUTS["nbWhy"] = el(); INPUTS["nbWhy"].value = "Awizacja";
  INPUTS["nbSlots"] = el(); INPUTS["nbSlots"].value = "po 1-2";
  addNamedBlock();
  T("E1: nazwana blokada „po 1-2” → unavail [0,1] + powód",
    t1.unavail.join() === "0,1" && t1.unavailWhy[0] === "Awizacja" && t1.unavailWhy[1] === "Awizacja");
  resetInputs(); ogrT = "";
  /* E2: addTrip z „pi 1,2” */
  const st2 = fresh();
  const c2 = mkC(st2, "2b");
  S = st2; resetInputs();
  INPUTS["tripLabel"] = el(); INPUTS["tripLabel"].value = "Kino";
  INPUTS["tripSlots"] = el(); INPUTS["tripSlots"].value = "pi 1,2";
  INPUTS["tripc-" + c2.id] = el(); INPUTS["tripc-" + c2.id].checked = true;
  addTrip();
  T("E2: wyjazd „pi 1,2” → slots [32,33] w S.trips",
    st2.trips.length === 1 && st2.trips[0].slots.join() === "32,33");
  /* E3: druga blokada na „po 3” — powody rozdzielone */
  resetInputs();
  S = st; ogrT = t1.id;
  INPUTS["nbWhy"] = el(); INPUTS["nbWhy"].value = "Konferencja";
  INPUTS["nbSlots"] = el(); INPUTS["nbSlots"].value = "po 3";
  addNamedBlock();
  T("E3: blokada „po 3” → unavail [0,1,2], powody rozdzielone (Awizacja/Konferencja)",
    t1.unavail.join() === "0,1,2" && t1.unavailWhy[2] === "Konferencja" && t1.unavailWhy[0] === "Awizacja");
  resetInputs(); ogrT = "";
  /* E4: stary format nie umiera — „pn 1” == „po 1” */
  const st3 = fresh();
  const t3 = mkT(st3, "Ola Testowa");
  S = st3; ogrT = t3.id; resetInputs();
  INPUTS["nbWhy"] = el(); INPUTS["nbWhy"].value = "Szkolenie";
  INPUTS["nbSlots"] = el(); INPUTS["nbSlots"].value = "pn 1";
  addNamedBlock();
  T("E4: stary format „pn 1” nadal działa (slot 0)",
    t3.unavail.join() === "0" && t3.unavailWhy[0] === "Szkolenie");
  resetInputs(); ogrT = "";
}

/* ==================== F. sanity kodu ==================== */
{
  T("F1: stopka „Wersja 6.4x.” w html apki (wersjo-odporne, ≥6.43)",
    /Wersja 6\.\d+\./.test(html));
  T("F2: trzy parsery mają mapowanie „po”",
    appSrc.split('dl === "po"').length === 4);
}

/* ==================== WYNIK ==================== */
console.log("WSZYSTKIE TESTY v6.43-po ZAKOŃCZONE");
console.log("WYNIK v6.43-po: " + pass + " OK, " + fail + " FAIL  (razem " + (pass + fail) + ")");
if (fail) { console.log("Nieudane:"); fails.forEach(f => console.log("  -", f)); process.exit(1); }
