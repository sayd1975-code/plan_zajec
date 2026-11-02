/* Testy v6.47 — audyt „bez zarzutu”: krytyczny fix id="availTxt (szybkie wpisywanie blokad
   znów działa), save() nie połyka błędów localStorage (czerwony baner NIE MOGĘ ZAPISAĆ),
   baner kopii nie wyskakuje przy samym presecie oddziałów, checkRules nie chwali pustego
   planu, „Awizacja” znika z przykładów. Nazwiska fikcyjne. node test-audyt-v647.js. Bez "use strict". */
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
global.addEventListener = function(ev, fn){ HANDLERS[ev] = fn; };
global.removeEventListener = function(){};
const _store = {};
let lsFail = false; /* v6.47: symulacja localStorage odmawiającego zapisu (QuotaExceeded / tryb prywatny) */
global.localStorage = { getItem(k){ return (k in _store) ? _store[k] : null; },
  setItem(k,v){ if (lsFail) throw new Error("QuotaExceeded"); _store[k] = String(v); },
  removeItem(k){ delete _store[k]; } };
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
function mkT(id, name){ S.teachers.push({ id: id, name: name, short: name.slice(0, 3), unavail: [], unavailWhy: {} }); ogrT = id; }

/* ==================== A. fix id="availTxt — szybkie wpisywanie blokad ==================== */
{
  fresh();
  mkT("t1", "Adam Testowy");
  const h = renderOgr();
  T("A1: renderOgr() generuje input z poprawnym id=\"availTxt\"",
    h.indexOf('id="availTxt"') >= 0);
  T("A2: stary bug (niedomknięty cudzysłów id=\"availTxt style=) nieobecny",
    h.indexOf('id="availTxt style=') < 0);
  INPUTS["availTxt"] = el(); INPUTS["availTxt"].value = "pn 7,8";
  applyAvailText();
  const t1 = S.teachers[0];
  T("A3: applyAvailText czyta pole (pn 7,8 → sloty 6,7) — funkcja ZNÓW działa",
    t1.unavail.slice().sort(function(a,b){ return a-b; }).join(",") === "6,7");
  T("A4: flash potwierdza ustawienie blokad (ok)",
    INPUTS["msg"].className === "ok" && INPUTS["msg"].innerHTML.indexOf("Blokady dla") >= 0);
  INPUTS["availTxt"].value = "";
  applyAvailText();
  T("A5: puste pole → sensowny warn „Puste pole” (nie crash)",
    INPUTS["msg"].className === "warn" && INPUTS["msg"].innerHTML.indexOf("Puste pole") >= 0);
}

/* ==================== B. save() nie połyka błędów — czerwony baner ==================== */
{
  withData(); lsFail = false; save();
  T("B0: flaga saveFail zadeklarowana i domyślnie wyłączona", saveFail === false);
  lsFail = true;
  save();
  T("B1: localStorage odmawia zapisu → saveFail = true (błąd już nie ginie po cichu)",
    saveFail === true);
  const bnr = backupBannerHtml();
  T("B2: czerwony baner „NIE MOGĘ ZAPISAĆ W PRZEGLĄDARCE”",
    bnr.indexOf("NIE MOG\u0118 ZAPISA\u0106") >= 0);
  T("B3: baner ostrzega, że plan może zniknąć, i ma przycisk pobrania kopii .json",
    bnr.indexOf("zamkni\u0119ciu karty") >= 0 && bnr.indexOf("backupPlan()") >= 0);
  tab = "plan"; viewMode = "class"; viewSel = ""; sel = null;
  render();
  T("B4: render() pokazuje czerwony baner na zakładce",
    INPUTS["main"].innerHTML.indexOf("NIE MOG\u0118 ZAPISA\u0106") >= 0);
  /* zaległa kopia + awaria zapisu → czerwony baner ma priorytet nad zwykłym przypomnieniem */
  lsFail = true; save(); saveFail = true;
  T("B5: awaria zapisu ma priorytet nad zwykłym banerem kopii",
    backupBannerHtml().indexOf("Nie masz jeszcze kopii zapasowej") < 0 && backupBannerHtml().indexOf("NIE MOG\u0118 ZAPISA\u0106") >= 0);
  lsFail = false; save();
  T("B6: po naprawie zapisu saveFail wraca do false i baner znika",
    saveFail === false && backupBannerHtml().indexOf("NIE MOG\u0118 ZAPISA\u0106") < 0);
}

/* ==================== C. baner kopii nie przy samym presecie ==================== */
{
  fresh();
  S.classes.push({ id: "c1", name: "1a" }, { id: "c2", name: "2a AUT" });
  save();
  T("C1: same oddziały (preset), zero przydziałów → BEZ przypomnienia o kopii",
    backupDueNow() === false && backupBannerHtml() === "");
  fresh();
  S.classes.push({ id: "c1", name: "1a" });
  mkT("t1", "Borys Przykładowy");
  save();
  T("C2: oddziały + nauczyciel, zero przydziałów → nadal bez przypomnienia",
    backupDueNow() === false);
  withData(); save();
  T("C3: realne przydziały → przypomnienie o kopii wraca (regresja: nic nie ubyło)",
    backupDueNow() === true && backupBannerHtml().indexOf("kopii zapasowej") >= 0);
}

/* ==================== D. checkRules nie chwali pustego planu ==================== */
{
  fresh();
  checkRules();
  T("D1: pusty plan → warn „Plan jest jeszcze pusty”",
    INPUTS["msg"].className === "warn" && INPUTS["msg"].innerHTML.indexOf("pusty") >= 0);
  T("D2: komunikat wskazuje drogę („najpierw dodaj przydziały”)",
    INPUTS["msg"].innerHTML.indexOf("przydzia\u0142y") >= 0);
  fresh();
  S.classes.push({ id: "c1", name: "1a" });
  S.activities.push({ id: "a1", classId: "c1", subject: "Matematyka", teacherId: "", hours: 1, kind: "dyd" });
  S.placement["a1-0"] = null; /* klucz w placement ale null → nadal pusty */
  checkRules();
  T("D3: placement z samymi nullami to wciąż pusty plan (warn)",
    INPUTS["msg"].className === "warn" && INPUTS["msg"].innerHTML.indexOf("pusty") >= 0);
  S.placement["a1-0"] = 0; /* lekcja 1 poniedziałek */
  checkRules();
  T("D4: ułożona lekcja → checkRules działa normalnie (bez „pusty”)",
    INPUTS["msg"].innerHTML.indexOf("pusty") < 0);
}

/* ==================== E. „Awizacja” znika + sanity ==================== */
{
  T("E1: słowo „Awizacja” nieobecne w kodzie apki", appSrc.indexOf("Awizacja") < 0);
  T("E2: placeholder powodu: „Wycieczka / Szkolenie / Konkurs”",
    appSrc.indexOf("Wycieczka / Szkolenie / Konkurs") >= 0);
  T("E3: flash addNamedBlock podaje zrozumiały przykład (Wycieczka, Szkolenie)",
    appSrc.indexOf("Wycieczka, Szkolenie)") >= 0);
  T("E4: stopka „Wersja 6.48.” w html apki", /Wersja 6\.4[8-9]\./.test(html));
  T("E5: stara suita v6.42–v6.46 bez regresji: save() nadal stawia lastSaveAt",
    (function(){ fresh(); lsFail = false; save(); return S.settings.lastSaveAt > 0 && saveFail === false; })());
}

/* ==================== WYNIK ==================== */
console.log(fail ? "NIEUDANE:\n  - " + fails.join("\n  - ") : "WSZYSTKIE TESTY v6.47-audyt ZAKO\u0144CZONE");
console.log("WYNIK v6.47-audyt: " + pass + " OK, " + fail + " FAIL  (razem " + (pass + fail) + ")");
process.exit(fail ? 1 : 0);
