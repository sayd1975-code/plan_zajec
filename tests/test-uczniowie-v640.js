/* Testy v6.40 — import list uczniów (sekcja Dane): wklejka + pliki (.txt/.csv/.docx/.xlsx).
   Pokrycie: parseStudentsText (separatory, auto-detekcja kolumny klasy, nagłówki, liczności, przecinki),
   applyStudentsImport (append, dedupe normName, liczniki), UI renderDane, ścieżka plikowa .txt.
   Uruchomienie: node test-uczniowie-v640.js. Bez "use strict" — sloppy eval wycieka funkcje apki.
   UWAGA: classByNormTxt/parseStudentsText czytają GLOBALNE S — każdy blok ustawia S = st. */
const fs = require("fs");

/* ---------- mocki DOM (wzorzec z test.js / test-cap-v639.js) ---------- */
function el(){ return { value:"", textContent:"", innerHTML:"", checked:false, files:[],
  classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
  appendChild(){}, addEventListener(){}, style:{}, scrollIntoView(){}, focus(){}, setAttribute(){}, getAttribute(){ return null; } }; }
global.document = { getElementById(){ return el(); }, querySelector(){ return el(); }, documentElement:{ classList:{ add(){}, remove(){}, contains(){ return false; }, toggle(){} } },
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
function mkC(S, name){ const c = { id: nextId(S.classes, "c"), name, rew: 2 }; S.classes.push(c); return c; }
function mkStudents(S, c, names){ c.students = names.map(function(n){ return { id: nextId(c.students || (c.students = []), "s"), name: n }; }); return c; }

/* ==================== A. parseStudentsText — separatory i dopasowanie klas ==================== */
{
  const st = fresh();
  const c1 = mkC(st, "1a"), c6 = mkC(st, "6b"), c5 = mkC(st, "5 ZET");
  S = st;
  let r = parseStudentsText("1a | Jan Kowalski");
  T("A1: pipe „1a | Jan Kowalski” → 1 wiersz, klasa 1a, nazwisko dokładne",
    r.rows.length === 1 && r.rows[0].cls === c1 && r.rows[0].name === "Jan Kowalski" && r.skipped.length === 0);
  r = parseStudentsText("6b\tAnna Wiśniewska");
  T("A2: tabulator (wklejka z Excela) → OK",
    r.rows.length === 1 && r.rows[0].cls === c6 && r.rows[0].name === "Anna Wiśniewska");
  r = parseStudentsText("6b ; Anna Wiśniewska");
  T("A3: średnik jako separator → OK",
    r.rows.length === 1 && r.rows[0].cls === c6 && r.rows[0].name === "Anna Wiśniewska");
  r = parseStudentsText("Jan Kowalski | 1a");
  T("A4: odwrotna kolejność kolumn (uczeń | klasa) → auto-detekcja kolumny klasy",
    r.rows.length === 1 && r.rows[0].cls === c1 && r.rows[0].name === "Jan Kowalski");
  r = parseStudentsText("3 | 1a | Jan Kowalski");
  T("A5: kolumna lp z numerami → numer nie zostaje nazwiskiem",
    r.rows.length === 1 && r.rows[0].name === "Jan Kowalski" && r.rows[0].cls === c1);
  r = parseStudentsText("Klasa\tUczeń\n1a\tJan Kowalski");
  T("A6: wiersz nagłówka „Klasa/Uczeń” pominięty, dane rozpoznane",
    r.rows.length === 1 && r.rows[0].cls === c1 && r.skipped.length === 0);
  r = parseStudentsText("9x | Jan Kowalski");
  T("A7: nieznany oddział → skipped z komunikatem, 0 rows",
    r.rows.length === 0 && r.skipped.length === 1 && /nie znam takiego oddziału/i.test(r.skipped[0]));
  r = parseStudentsText("Jan Kowalski");
  T("A8: linia bez separatora → skipped, 0 rows",
    r.rows.length === 0 && r.skipped.length === 1);
  r = parseStudentsText('1a | "Kowalska, Anna"');
  T("A9: przecinek NIE jest separatorem — „Kowalska, Anna” jedno nazwisko; cudzysłowy wycięte",
    r.rows.length === 1 && r.rows[0].name === "Kowalska, Anna");
  r = parseStudentsText("\n\n#cokolwiek\n\n");
  T("A10: puste linie i komentarze # pomijane cicho",
    r.rows.length === 0 && r.skipped.length === 0);
  r = parseStudentsText("5 zet | Ola Testowa");
  T("A11: dopasowanie klasy przez normName („5 zet” → „5 ZET”) — case/spacje bez znaczenia",
    r.rows.length === 1 && r.rows[0].cls === c5);
  r = parseStudentsText("1a\tJan\tKowalski");
  T("A12: trzy kolumny (nazwisko rozbite) → pierwsza nie-klasowa staje się imieniem",
    r.rows.length === 1 && r.rows[0].name === "Jan" && r.rows[0].cls === c1);
}

/* ==================== B. parseStudentsText — zabezpieczenia ==================== */
{
  const st = fresh();
  const c1 = mkC(st, "1a");
  S = st;
  let r = parseStudentsText("1a | 2 uczniów");
  T("B1: „2 uczniów” = liczność, nie nazwisko → skipped (zestawienia liczb nie wjadą jako uczniowie)",
    r.rows.length === 0 && r.skipped.length === 1 && /liczba uczni/i.test(r.skipped[0]));
  r = parseStudentsText("Klasa\tLiczba uczniów\tWymiar\tObsada\n1a\t2 uczniów\t12 h / tydz. / klasę\tdwóch nauczycieli");
  T("B2: cały wiersz danych z zestawienia Zajecia_Terapeutyczne → nic nie zostaje dodane",
    r.rows.length === 0 && r.skipped.length === 1 && /liczba uczni/i.test(r.skipped[0]));
  r = parseStudentsText("1a | x");
  T("B3: nazwa za krótka („x”) → skipped",
    r.rows.length === 0 && r.skipped.length === 1);
  r = parseStudentsText("1a | 12345");
  T("B4: sama liczba w kolumnie nazwiska → brak nazwiska → skipped",
    r.rows.length === 0 && r.skipped.length === 1);
  r = parseStudentsText(null);
  T("B5: null/undefined → pusty wynik bez wyjątku",
    r.rows.length === 0 && r.skipped.length === 0);
}

/* ==================== C. applyStudentsImport — append, dedupe, liczniki ==================== */
{
  const st = fresh();
  const c1 = mkC(st, "1a"), c6 = mkC(st, "6b");
  mkStudents(st, c1, ["Jan Kowalski"]); /* s1 już istnieje w 1a */
  S = st;
  applyStudentsImport(parseStudentsText("1a | jan kowalski\n1a | Anna Testowa\n6b | Piotr Testowy"));
  T("C1: duplikat po normName („jan kowalski” = „Jan Kowalski”) pominięty, pozostali dodani",
    c1.students.length === 2 && c6.students.length === 1);
  T("C2: duplikat nie nadpisuje istniejącego zapisu",
    c1.students[0].name === "Jan Kowalski");
  T("C3: nowi uczniowie mają unikalne id z nextId (s2 w 1a, s1 w 6b)",
    c1.students[1].id === "s2" && c6.students[0].id === "s1");
  T("C4: append nie kasuje niczego",
    c1.students[0].id === "s1" && c1.students[0].name === "Jan Kowalski");
  const st2 = fresh();
  const cx = mkC(st2, "7a"); /* bez tablicy students */
  S = st2;
  applyStudentsImport(parseStudentsText("7a | Ala Testowa"));
  T("C5: oddział bez tablicy students → tablica utworzona, uczeń dodany",
    Array.isArray(cx.students) && cx.students.length === 1 && cx.students[0].name === "Ala Testowa");
  /* brak rozpoznanych → stan S nietknięty */
  const before = JSON.stringify(st2);
  applyStudentsImport(parseStudentsText("9x | Jan Kowalski"));
  T("C6: same nieznane oddziały → S bez zmian",
    JSON.stringify(st2) === before);
  /* puste → bez wyjątku */
  applyStudentsImport(parseStudentsText(""));
  T("C7: pusty import → bez wyjątku, S bez zmian",
    JSON.stringify(st2) === before);
  applyStudentsImport(null);
  T("C8: null → bez wyjątku (flash warn)",
    true);
}

/* ==================== D. integracja z modelem i UI ==================== */
{
  const st = fresh();
  const c1 = mkC(st, "1a");
  S = st;
  /* zajęcia 1:1 widzą zaimportowanego ucznia (ta sama tablica co studentsOf) */
  applyStudentsImport(parseStudentsText("1a | Ewa Testowa"));
  T("D1: zaimportowany uczeń widoczny przez studentsOf (spójność z v6.33)",
    studentsOf(c1.id).length === 1 && studentsOf(c1.id)[0].name === "Ewa Testowa");
  const st2 = fresh();
  const cy = mkC(st2, "6b");
  mkStudents(st2, cy, ["Ala Testowa"]);
  S = st2;
  applyStudentsImport(parseStudentsText("6b | Ala Testowa"));
  T("D2: ponowny import tego samego pliku → zero duplikatów",
    cy.students.length === 1);
  /* renderDane zawiera nowe elementy UI */
  S = st;
  const h = renderDane();
  T("D3: renderDane zawiera pole wklejki studentsImportTxt",
    h.indexOf("studentsImportTxt") >= 0);
  T("D4: renderDane zawiera przycisk Importuj wklejkę (studentsApplyText)",
    h.indexOf("studentsApplyText") >= 0);
  T("D5: renderDane zawiera wczyt pliku (studentsFileRead)",
    h.indexOf("studentsFileRead") >= 0);
  T("D6: renderDane listuje uczniów oddziału (pole rename ucznia)",
    h.indexOf("renStudent") >= 0);
  /* zapis localStorage (save) zawiera zaimportowanych uczniów — przetrwają restart apki */
  save(); /* S = st (blok D) — ostatni zapis w _store pochodził z bloku C, odświeżamy */
  const savedOk = Object.keys(_store).some(k => (_store[k] || "").indexOf("Ewa Testowa") >= 0);
  T("D7: zapis save() zawiera zaimportowanych uczniów (trwałość localStorage)",
    savedOk);
  /* delStudent pilnuje zajęć 1:1 na zaimportowanym uczniu */
  const sid = studentsOf(c1.id)[0].id;
  st.activities.push({ id: "a1", classId: c1.id, teacherId: "", subject: "Rewalidacja", hours: 1, kind: "rew", group: "", link: "", studentId: sid, week: "" });
  S = st;
  delStudent(c1.id, sid);
  T("D8: delStudent blokuje usunięcie ucznia z zajęciami 1:1 (zachowanie v6.33)",
    studentsOf(c1.id).length === 1);
}

/* ==================== E. ścieżka plikowa .txt (studentsFileRead, async) ==================== */
(async function(){
  const st = fresh();
  const c1 = mkC(st, "1a");
  S = st;
  const txt = "Klasa;Uczeń\n1a | Jan Kowalski";
  const buf = Uint8Array.from(Buffer.from(txt, "utf8")).buffer;
  const input = { files: [{ name: "lista-uczniow.txt", arrayBuffer: () => Promise.resolve(buf) }] };
  await new Promise(function(res){ studentsFileRead(input); setTimeout(res, 50); });
  T("E1: studentsFileRead (.txt z nagłówkiem i danymi) → uczeń zaimportowany",
    studentsOf(c1.id).length === 1 && studentsOf(c1.id)[0].name === "Jan Kowalski");
  const input2 = { files: [] };
  studentsFileRead(input2);
  T("E2: pusty wybór pliku → bez wyjątku",
    true);
  console.log("\n========================================");
  console.log("WYNIK v6.40-import-uczniow: " + pass + " OK, " + fail + " FAIL  (razem " + (pass + fail) + ")");
  if (fail === 0) console.log("WSZYSTKIE TESTY IMPORTU UCZNIÓW PRZECHODZĄ ✅");
  else { console.log("NIEPRZECHODZĄCE:"); fails.forEach(f => console.log("  ✗", f)); process.exit(1); }
})();
