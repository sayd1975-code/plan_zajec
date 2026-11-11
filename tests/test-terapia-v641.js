/* Testy v6.41 — znaczek „uczeń na terapii" (👤) w planie oddziału: chip zajęć 1:1.
   Pokrycie: renderPlan widok oddziału (👤 + imię w sub + title), zwykłe zajęcia bez 👤,
   widok nauczyciela bez 👤, widok ucznia (v6.40) nietknięty, tydzień A/B, escape HTML, hint,
   button „Nieprzypisane” (v6.33) bez regresji.
   Uruchomienie: node test-terapia-v641.js. Bez "use strict" — sloppy eval wycieka funkcje apki.
   UWAGA: S, viewMode, viewSel, planWeek to globaly apki — każdy blok ustawia je przed renderPlan(). */
const fs = require("fs");

/* ---------- mocki DOM (wzorzec z test.js / test-cap-v639.js / test-uczniowie-v640.js) ---------- */
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
function mkT(S, name){ const t = { id: nextId(S.teachers, "t"), name, short: name.split(/\s+/).slice(-1)[0].slice(0,3), unavail: [] }; S.teachers.push(t); return t; }
function mkStudents(S, c, names){ c.students = names.map(function(n){ return { id: nextId(c.students || (c.students = []), "s"), name: n }; }); return c; }
function setupView(st, mode, selId){ S = st; viewMode = mode; viewSel = selId; sel = null; planWeek = "A"; return renderPlan(); }

/* ==================== A. widok oddziału: znaczek, podpis, dymek ==================== */
{
  const st = fresh();
  const c1 = mkC(st, "1a"), c2 = mkC(st, "2b");
  const t1 = mkT(st, "Maria Kowalska");
  mkStudents(st, c1, ["Jan Kowalski"]);
  st.activities.push({ id: "a1", classId: c1.id, teacherId: t1.id, subject: "Rewalidacja", hours: 1, kind: "rew", group: "", link: "", studentId: c1.students[0].id, week: "" });
  st.activities.push({ id: "a2", classId: c1.id, teacherId: t1.id, subject: "Matematyka", hours: 1, kind: "std", group: "", link: "", studentId: "", week: "" });
  st.placement["a1-0"] = 0;
  st.placement["a2-0"] = 1;
  const h = setupView(st, "class", c1.id);
  T("A1: chip zajęć 1:1 w widoku oddziału ma „👤 Rewalidacja”",
    h.indexOf("\u{1F464} Rewalidacja") >= 0);
  T("A2: podpis chipu 1:1 = „Jan Kowalski • MK” (imię ucznia • skrót nauczyciela)",
    h.indexOf("Jan Kowalski • MK") >= 0);
  T("A3: dymek (title) chipu 1:1 zawiera „Rewalidacja — Jan Kowalski”",
    h.indexOf("Rewalidacja — Jan Kowalski") >= 0);
  T("A4: zwykłe zajęcia klasowe BEZ znaczka 👤",
    h.indexOf("\u{1F464} Matematyka") < 0);
  T("A5: podpis zwykłych zajęć = sam skrót nauczyciela („ • ” tylko przy 1:1)",
    />MK<\/span>/.test(h));
  T("A6: imię ucznia pojawia się w widoku dokładnie raz (sub) + raz w title = 2 wystąpienia",
    h.split("Jan Kowalski").length === 3);
  /* 1:1 ucznia innej klasy nie widać w widoku 1a */
  const t2 = mkT(st, "Anna Nowak");
  mkStudents(st, c2, ["Ola Testowa"]);
  st.activities.push({ id: "a3", classId: c2.id, teacherId: t2.id, subject: "Rewalidacja", hours: 1, kind: "rew", group: "", link: "", studentId: c2.students[0].id, week: "" });
  st.placement["a3-0"] = 2;
  const h2 = setupView(st, "class", c1.id);
  T("A7: zajęcia 1:1 innego oddziału (2b) nie widać w widoku 1a",
    h2.indexOf("Ola Testowa") < 0 && h2.indexOf("\u{1F464} Rewalidacja") >= 0);
}

/* ==================== B. widok oddziału: fallback „?” i escape HTML ==================== */
{
  const st = fresh();
  const c1 = mkC(st, "3a AUT");
  const t1 = mkT(st, "Piotr Zieliński");
  mkStudents(st, c1, ["Ala <b>Widget</b>"]);
  st.activities.push({ id: "a1", classId: c1.id, teacherId: t1.id, subject: "Rewalidacja", hours: 1, kind: "rew", group: "", link: "", studentId: c1.students[0].id, week: "" });
  st.activities.push({ id: "a2", classId: c1.id, teacherId: t1.id, subject: "Terapia", hours: 1, kind: "rew", group: "", link: "", studentId: "s-brak", week: "" });
  st.placement["a1-0"] = 0;
  st.placement["a2-0"] = 1;
  const h = setupView(st, "class", c1.id);
  T("B1: imię ucznia z HTML jest escapowane (brak surowego <b>Widget</b>)",
    h.indexOf("<b>Widget</b>") < 0);
  T("B2: escapowane imię widoczne w podpisie",
    h.indexOf("Ala &lt;b&gt;Widget&lt;/b&gt; • ") >= 0);
  T("B3: studentId wskazujący na usuniętego ucznia → fallback „?” w podpisie",
    /\? • PZ<\/span>/.test(h));
}

/* ==================== C. widok nauczyciela: bez znaczka ==================== */
{
  const st = fresh();
  const c1 = mkC(st, "1a");
  const t1 = mkT(st, "Maria Kowalska");
  mkStudents(st, c1, ["Jan Kowalski"]);
  st.activities.push({ id: "a1", classId: c1.id, teacherId: t1.id, subject: "Rewalidacja", hours: 1, kind: "rew", group: "", link: "", studentId: c1.students[0].id, week: "" });
  st.placement["a1-0"] = 0;
  const h = setupView(st, "teacher", t1.id);
  T("C1: chip 1:1 w widoku nauczyciela BEZ znaczka 👤 (znaczek tylko w widoku oddziału)",
    h.indexOf("\u{1F464} Rewalidacja") < 0);
  T("C2: podpis chipu 1:1 w widoku nauczyciela = nazwa oddziału (1a), nie imię",
    h.indexOf("1a") >= 0 && h.indexOf("Jan Kowalski") < 0);
}

/* ==================== D. widok ucznia (1:1) — zachowanie v6.33 nietknięte ==================== */
{
  const st = fresh();
  const c1 = mkC(st, "1a");
  const t1 = mkT(st, "Maria Kowalska");
  mkStudents(st, c1, ["Jan Kowalski"]);
  st.activities.push({ id: "a1", classId: c1.id, teacherId: t1.id, subject: "Rewalidacja", hours: 1, kind: "rew", group: "", link: "", studentId: c1.students[0].id, week: "" });
  st.placement["a1-0"] = 0;
  const h = setupView(st, "student", c1.students[0].id);
  T("D1: widok ucznia nietknięty — chip 1:1 bez 👤 (znak v6.41 tylko w widoku oddziału)",
    h.indexOf("Rewalidacja") >= 0 && h.indexOf("\u{1F464} Rewalidacja") < 0);
  /* D2: button „Nieprzypisane” z zajęciami 1:1 — 👤+imię (v6.33/6.40) bez regresji */
  const st2 = fresh();
  const c2 = mkC(st2, "2a");
  const t2 = mkT(st2, "Maria Kowalska");
  mkStudents(st2, c2, ["Jan Kowalski"]);
  st2.activities.push({ id: "a1", classId: c2.id, teacherId: t2.id, subject: "Rewalidacja", hours: 1, kind: "rew", group: "", link: "", studentId: c2.students[0].id, week: "" });
  const hu = setupView(st2, "class", c2.id);
  T("D2: button „Nieprzypisane” zajęć 1:1 nadal ma 👤 + imię + skrót (v6.33 — bez regresji)",
    hu.indexOf("\u{1F464}Jan Kowalski") >= 0 && hu.indexOf("MK") >= 0);
}

/* ==================== E. tydzień A/B ==================== */
{
  const st = fresh();
  const c1 = mkC(st, "1a");
  const t1 = mkT(st, "Maria Kowalska");
  mkStudents(st, c1, ["Jan Kowalski"]);
  st.settings.weekAB = true;
  st.activities.push({ id: "a1", classId: c1.id, teacherId: t1.id, subject: "Rewalidacja", hours: 1, kind: "rew", group: "", link: "", studentId: c1.students[0].id, week: "B" });
  st.placement["a1-0"] = 0;
  const hA = setupView(st, "class", c1.id);
  T("E1: zajęcia 1:1 tylko w tygodniu B — w tygodniu A ich nie widać",
    hA.indexOf("Rewalidacja") < 0);
  S = st; viewMode = "class"; viewSel = c1.id; planWeek = "B";
  const hB = renderPlan();
  T("E2: w tygodniu B zajęcia 1:1 widoczne ze znaczkiem i imieniem",
    hB.indexOf("\u{1F464} Rewalidacja") >= 0 && hB.indexOf("Jan Kowalski • MK") >= 0);
}

/* ==================== F. hint i drobiazgi ==================== */
{
  const st = fresh();
  const c1 = mkC(st, "1a");
  const t1 = mkT(st, "Maria Kowalska");
  st.activities.push({ id: "a1", classId: c1.id, teacherId: t1.id, subject: "Muzyka", hours: 1, kind: "std", group: "", link: "", studentId: "", week: "" });
  st.placement["a1-0"] = 0;
  const h = setupView(st, "class", c1.id);
  T("F1: hint pod planem wyjaśnia znaczek 👤 (zajęcia 1:1 poza klasą)",
    h.indexOf("👤 przy zajęciach w widoku oddziału = uczeń jest wtedy na zajęciach indywidualnych") >= 0);
  T("F2: plan bez zajęć 1:1 nie zawiera żadnego 👤 w chipach",
    h.indexOf("\u{1F464} Muzyka") < 0);
}

/* ---------- podsumowanie ---------- */
console.log("\n========================================");
console.log("WYNIK v6.41-terapia: " + pass + " OK, " + fail + " FAIL  (razem " + (pass + fail) + ")");
if (fail === 0) console.log("WSZYSTKIE TESTY ZNACZKA UCZNIA NA TERAPII PRZECHODZĄ ✅");
else { console.log("NIEPRZECHODZĄCE:"); fails.forEach(f => console.log("  ✗", f)); process.exit(1); }
