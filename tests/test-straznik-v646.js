/* Testy v6.46 — strażnik sesji: autosave wklejki importu (draft), pasek przypomnienia
   o kopii zapasowej (coś większego niż znaczek — baner na każdej zakładce),
   ostrzeżenie beforeunload przy zamykaniu (niezatwierdzony import / zmiany bez kopii).
   Nazwiska wyłącznie fikcyjne. Uruchomienie: node test-straznik-v646.js. Bez "use strict". */
const fs = require("fs");

/* ---------- mocki DOM ---------- */
function el(){ return { value:"", textContent:"", innerHTML:"", checked:false, files:[],
  className:"", style:{ display:"" }, href:"", download:"",
  classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
  appendChild(){ return el(); }, addEventListener(){}, scrollIntoView(){}, focus(){}, setAttribute(){}, getAttribute(){ return null; },
  click(){}, remove(){} }; }
const INPUTS = {};
global.document = { getElementById(id){ return INPUTS[id] || (INPUTS[id] = el()); }, querySelector(){ return el(); }, documentElement:{ classList:{ add(){}, remove(){}, contains(){ return false; }, toggle(){} } },
  addEventListener(){}, createElement(){ return el(); }, body:{ classList:{ add(){}, remove(){}, toggle(){} }, appendChild(){ return el(); } } };
global.window = global;
try { global.navigator = {}; } catch(e) {}
global.location = { protocol: "http:" };
const HANDLERS = {};
global.addEventListener = function(ev, fn){ HANDLERS[ev] = fn; }; /* kolektor — test beforeunload */
global.removeEventListener = function(){};
const _store = {};
global.localStorage = { getItem(k){ return (k in _store) ? _store[k] : null; }, setItem(k,v){ _store[k] = String(v); }, removeItem(k){ delete _store[k]; } };
global.confirm = () => true;
global.fetch = () => Promise.resolve({ ok: true });
global.alert = () => {};
global.URL = global.URL || {};
global.URL.createObjectURL = () => "blob:test";
global.URL.revokeObjectURL = () => {};

/* ---------- załadowanie apki ---------- */
const raw = fs.readFileSync(process.env.APP_SOURCE || "/home/user/canvases/plan-zajec-pwa/CANVAS.md", "utf8");
const html = raw.startsWith("---") ? raw.split(/^---$/m).slice(2).join("---") : raw; /* canvas (frontmatter) albo goły index.html */
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const appSrc = scripts.reduce((a, b) => (b.length > a.length ? b : a));
eval(appSrc.replace('"use strict";', ""));

/* ---------- harness ---------- */
let pass = 0, fail = 0; const fails = [];
function T(name, cond){ if (cond) pass++; else { fail++; fails.push(name); console.log("  ✗ FAIL:", name); } }
function fresh(){ S = normalize({ teachers: [], classes: [], activities: [], placement: {}, settings: {} }); importText = ""; importRows = null; delete _store[LS_DRAFT]; delete _store[LS_NAG]; return S; }
function withData(){ const st = fresh(); st.classes.push({ id: "c1", name: "1a" }); st.activities.push({ id: "a1", classId: "c1", subject: "Matematyka", teacherId: "", hours: 2, kind: "dyd" }); return st; }

/* ==================== A. draft wklejki importu ==================== */
{
  fresh();
  importText = "Anna Kowalska\tMatematyka\t1a\t2";
  draftSave();
  const d = JSON.parse(localStorage.getItem(LS_DRAFT) || "null");
  T("A1: draftSave zapisuje wklejkę do localStorage",
    !!d && d.t === "Anna Kowalska\tMatematyka\t1a\t2" && d.at > 0);
  draftClear();
  T("A2: draftClear usuwa draft",
    localStorage.getItem(LS_DRAFT) === null);
  draftSave();
  importText = "";
  draftRestore();
  T("A3: draftRestore przywraca wklejkę po zamknięciu karty",
    importText === "Anna Kowalska\tMatematyka\t1a\t2");
  draftClear();
  importText = "po restore jest pusto";
  draftRestore();
  T("A4: draftRestore bez zapisanego draftu nie rusza bieżącej wklejki",
    importText === "po restore jest pusto");
  /* analyze() — pełna ścieżka: wklejka w textarea → podgląd → autosave */
  fresh();
  tab = "dane";
  INPUTS["importText"] = el(); INPUTS["importText"].value = "Maria Nowak\tRewalidacja\t1a\t2";
  analyze();
  T("A5: analyze() zapisuje draft wklejki (przeżywa zamknięcie)",
    JSON.parse(localStorage.getItem(LS_DRAFT) || "null").t.indexOf("Nowak") >= 0);
  T("A6: analyze() ustawia importRows (podgląd działa bez regresji)",
    Array.isArray(importRows) && importRows.length === 1 && importRows[0].teacher.indexOf("Nowak") >= 0);
  clearAll();
  T("A7: clearAll czyści draft (po wyczyszczeniu apki wklejka nie wraca)",
    localStorage.getItem(LS_DRAFT) === null && importText === "");
}

/* ==================== B. przypomnienie o kopii zapasowej ==================== */
{
  fresh();
  T("B1: pusta apka (bez danych) → bez przypomnienia",
    backupDueNow() === false && backupBannerHtml() === "");
  withData(); save();
  T("B2: dane + nigdy nie było kopii → przypomnienie „Nie masz jeszcze kopii zapasowej”",
    backupDueNow() === true && backupBannerHtml().indexOf("Nie masz jeszcze kopii zapasowej") >= 0);
  S.settings.lastBackupAt = Date.now(); save();
  T("B3: świeża kopia → bez przypomnienia",
    backupDueNow() === false && backupBannerHtml() === "");
  S.settings.lastBackupAt = Date.now() - 72 * 3600000; save();
  T("B4: kopia sprzed 3 dni + nowa zmiana → przypomnienie „3 dni temu” z przyciskami",
    backupDueNow() === true && backupBannerHtml().indexOf("3 dni temu") >= 0
    && backupBannerHtml().indexOf("Zapisz kopię teraz") >= 0 && backupBannerHtml().indexOf("Przypomnij za 24 h") >= 0);
  backupNagDismiss();
  T("B5: „Przypomnij za 24 h” wycisza baner (zapis w localStorage)",
    backupDueNow() === false && localStorage.getItem(LS_NAG) !== null);
  delete _store[LS_NAG];
  S.settings.lastBackupAt = Date.now() - 5 * 3600000;
  T("B6: backupAgeTxt: 5 godz. temu",
    backupAgeTxt() === "5 godz. temu");
  /* pełny backupPlan w mockach (Blob/URL zamockowane) */
  withData(); save();
  backupPlan();
  T("B7: backupPlan() ustawia lastBackupAt — przypomnienie wygasa",
    S.settings.lastBackupAt > 0 && backupDueNow() === false);
  /* wczytanie kopii = posiadanie pliku */
  S.settings.lastBackupAt = Date.now() - 100 * 3600000;
  const snap = JSON.stringify(S);
  applyBackupText(snap);
  T("B8: applyBackupText (wczytanie kopii) ustawia świeże lastBackupAt",
    S.settings.lastBackupAt > Date.now() - 60000 && backupDueNow() === false);
}

/* ==================== C. baner w render() ==================== */
{
  withData(); save();
  tab = "plan"; viewMode = "class"; viewSel = ""; sel = null;
  render();
  T("C1: render() pokazuje baner .bkbnr gdy zaległa kopia",
    INPUTS["main"].innerHTML.indexOf("bkbnr") >= 0 && INPUTS["main"].innerHTML.indexOf("Zapisz kopię teraz") >= 0);
  S.settings.lastBackupAt = Date.now(); save();
  render();
  T("C2: render() bez baneru po świeżej kopii",
    INPUTS["main"].innerHTML.indexOf("bkbnr") < 0);
  T("C3: baner na zakładce Dane też (każda zakładka)",
    (function(){ S.settings.lastBackupAt = 0; save(); tab = "dane"; render(); return INPUTS["main"].innerHTML.indexOf("bkbnr") >= 0; })());
}

/* ==================== D. beforeunload — ostrzeżenie przy zamykaniu ==================== */
{
  T("D1: handler beforeunload zarejestrowany przy starcie apki",
    typeof HANDLERS["beforeunload"] === "function");
  withData(); save();
  let prevented = false;
  const ev = { preventDefault(){ prevented = true; }, returnValue: "init" };
  HANDLERS["beforeunload"](ev);
  T("D2: zmiany bez kopii → zamykanie ostrzeżone (preventDefault)",
    prevented === true);
  S.settings.lastBackupAt = Date.now(); save();
  importText = "";
  let prevented2 = false;
  HANDLERS["beforeunload"]({ preventDefault(){ prevented2 = true; }, returnValue: "" });
  T("D3: świeża kopia i brak wklejki → zamykanie bez ostrzeżenia",
    prevented2 === false);
  importText = "Anna Kowalska\tMatematyka\t1a\t2";
  let prevented3 = false;
  HANDLERS["beforeunload"]({ preventDefault(){ prevented3 = true; }, returnValue: "" });
  T("D4: niezatwierdzona wklejka w toku → zamykanie ostrzeżone nawet ze świeżą kopią",
    prevented3 === true);
}

/* ==================== E. sanity ==================== */
{
  T("E1: stopka „Wersja 6.4x.” w html apki (wersjo-odporne, ≥6.46)",
    /Wersja 6\.4[6-9]\./.test(html));
  fresh(); save();
  T("E2: save() stawia znacznik lastSaveAt",
    S.settings.lastSaveAt > 0);
  T("E3: CSS banera (.bkbnr) w html",
    html.indexOf(".bkbnr") >= 0);
}

/* ==================== WYNIK ==================== */
console.log(fail ? "NIEUDANE:\n  - " + fails.join("\n  - ") : "WSZYSTKIE TESTY v6.46-straznik ZAKOŃCZONE");
console.log("WYNIK v6.46-straznik: " + pass + " OK, " + fail + " FAIL  (razem " + (pass + fail) + ")");
if (fail) process.exit(1);
