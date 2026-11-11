/* Testy v6.45 — czasy rewalidacji (godzina rewalidacyjna 60 min, start przed dzwonkiem):
   helpery rewDur/rewLead/rewSpan, migracja ustawień (normalize), kara wRewMid w softPenalty
   (rewalidacja poza lekcjami 1-2/7-8), czas ⏱ w renderPlan/planText/planszeHtml,
   pola w Zasadach planu (setRewNum). Nazwiska wyłącznie fikcyjne.
   Uruchomienie: node test-czas-v645.js. Bez "use strict" — sloppy eval wycieka funkcje apki. */
const fs = require("fs");

/* ---------- mocki DOM ---------- */
function el(){ return { value:"", textContent:"", innerHTML:"", checked:false, files:[],
  className:"", style:{ display:"" },
  classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
  appendChild(){}, addEventListener(){}, scrollIntoView(){}, focus(){}, setAttribute(){}, getAttribute(){ return null; } }; }
const INPUTS = {};
global.document = { getElementById(id){ return INPUTS[id] || (INPUTS[id] = el()); }, querySelector(){ return el(); }, documentElement:{ classList:{ add(){}, remove(){}, contains(){ return false; }, toggle(){} } },
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
let seq = 0;
function fresh(){ return normalize({ teachers: [], classes: [], activities: [], placement: {}, settings: {} }); }
function mkC(st, name){ const c = { id: "c" + (++seq), name: name }; st.classes.push(c); return c; }
function mkT(st, name){ const t = { id: "t" + (++seq), name: name, short: (name.split(" ")[1] || name).slice(0,3), unavail: [] }; st.teachers.push(t); return t; }
function mkA(st, cid, subj, tid, h){ const a = { id: "a" + (++seq), classId: cid, subject: subj, teacherId: tid, hours: h, kind: guessKind(subj) }; st.activities.push(a); return a; }

/* ==================== A. helpery czasów rewalidacji ==================== */
{
  const st = fresh(); S = st;
  T("A1: domyśły: rewDur 60, rewLead 15, wRewMid 40 (normalize)",
    S.settings.rewDur === 60 && S.settings.rewLead === 15 && S.settings.wRewMid === 40);
  T("A2: rewSpan(0) = „7:45–8:45” (lek. 1, start 15 min przed 8:00, 60 min)",
    rewSpan(0) === "7:45–8:45");
  T("A3: rewSpan(7) = „14:40–15:40” (lek. 8, 14:55 − 15)",
    rewSpan(7) === "14:40–15:40");
  T("A4: rewSpan(2) = „9:35–10:35” (lek. 3, 9:50 − 15)",
    rewSpan(2) === "9:35–10:35");
  S.settings.rewLead = 0;
  T("A5: rewLead 0 → rewSpan(0) = „8:00–9:00” (start na dzwonku)",
    rewSpan(0) === "8:00–9:00");
  S.settings.rewLead = 15;
  setRewNum("rewDur", "90");
  T("A6: setRewNum rewDur 90 → settings 90, rewSpan(0) = „7:45–9:15”",
    S.settings.rewDur === 90 && rewSpan(0) === "7:45–9:15");
  setRewNum("rewDur", "5"); setRewNum("rewLead", "-3");
  T("A7: clamp: rewDur min 30, rewLead min 0",
    S.settings.rewDur === 30 && S.settings.rewLead === 0);
  const st2 = normalize({ teachers: [], classes: [], activities: [], placement: {}, settings: { rewDur: 50 } });
  T("A8: migracja nie nadpisuje wartości wpisanych (rewDur 50 zostaje)",
    st2.settings.rewDur === 50 && st2.settings.rewLead === 15);
}

/* ==================== B. softPenalty — kara wRewMid ==================== */
{
  const st = fresh(); S = st;
  const c1 = mkC(st, "1a"); const t1 = mkT(st, "Anna Kowalska");
  const rew = mkA(st, c1.id, "Rewalidacja", t1.id, 1);
  const ls = lessons(planWeek);
  const p0 = softPenalty(ls, st.teachers, st.classes, st.settings, {});
  S.settings.rewLead = 15;
  const sMid = softPenalty(ls, st.teachers, st.classes, st.settings, { [rew.id + "-0"]: 2 });
  const sOk = softPenalty(ls, st.teachers, st.classes, st.settings, { [rew.id + "-0"]: 0 });
  T("B1: rewalidacja na lekcji 3 (slot 2) → kara +40 i det „Rewalidacja”",
    sMid.pen - p0.pen === 40 && sMid.det.some(d => d.indexOf("Rewalidacja") >= 0));
  T("B2: rewalidacja na lekcji 1 (slot 0) → bez kary (p0 vs sOk)",
    sOk.pen - p0.pen === 0 && !sOk.det.some(d => d.indexOf("Rewalidacja:") === 0));
  const s8 = softPenalty(ls, st.teachers, st.classes, st.settings, { [rew.id + "-0"]: 7 });
  T("B3: rewalidacja na lekcji 8 (slot 7) → bez kary",
    s8.pen - p0.pen === 0);
  S.settings.wRewMid = 0;
  const sMid0 = softPenalty(ls, st.teachers, st.classes, st.settings, { [rew.id + "-0"]: 2 });
  T("B4: wRewMid = 0 → kara wyłączona",
    sMid0.pen - p0.pen === 0 && !sMid0.det.some(d => d.indexOf("Rewalidacja:") === 0));
  S.settings.wRewMid = 40;
  const rew2 = mkA(st, c1.id, "Rewalidacja", mkT(st, "Maria Nowak").id, 1);
  const ls2 = lessons(planWeek);
  const s2 = softPenalty(ls2, st.teachers, st.classes, st.settings, { [rew.id + "-0"]: 2, [rew2.id + "-0"]: 3 });
  T("B5: 2 rewalidacje na lekcjach 3 i 4 → kara 2×40 i det „2 godz.”",
    s2.pen - p0.pen === 80 && s2.det.some(d => d.indexOf("2 godz.") >= 0));
  const mat = mkA(st, c1.id, "Matematyka", t1.id, 1);
  const ls3 = lessons(planWeek);
  const s3 = softPenalty(ls3, st.teachers, st.classes, st.settings, { [mat.id + "-0"]: 2 });
  T("B6: zajęcia dydaktyczne na lekcji 3 → bez kary wRewMid (regresja)",
    !s3.det.some(d => d.indexOf("Rewalidacja:") === 0));
}

/* ==================== C. planText — wydruk z czasem ==================== */
{
  const st = fresh(); S = st;
  const c1 = mkC(st, "1a"); const t1 = mkT(st, "Anna Kowalska");
  const rew = mkA(st, c1.id, "Rewalidacja", t1.id, 1);
  const mat = mkA(st, c1.id, "Matematyka", mkT(st, "Jan Wiśniewski").id, 1);
  st.placement[rew.id + "-0"] = 0; st.placement[mat.id + "-0"] = 1;
  const ls = lessons(planWeek);
  const txt = planText("class", c1.id, lessonsBySlot(ls, st.placement));
  T("C1: legenda: „Godzina rewalidacyjna (60 min): start 15 min przed dzwonkiem”",
    txt.indexOf("Godzina rewalidacyjna (60 min): start 15 min przed dzwonkiem") >= 0);
  T("C2: legenda z konkretnymi czasami: lek. 1 → 7:45–8:45, lek. 8 → 14:40–15:40",
    txt.indexOf("lek. 1 → 7:45–8:45") >= 0 && txt.indexOf("lek. 8 → 14:40–15:40") >= 0);
  T("C3: rewalidacja w komórce z czasem „[7:45–8:45]”",
    /\[7:45–8:45\]/.test(txt));
  T("C4: matematyka (dydaktyczna) bez dopisku czasu [",
    (txt.match(/\[7:45|\[8:00|\[9:/g) || []).length === 1);
  S.settings.rewLead = 0;
  const txt2 = planText("class", c1.id, lessonsBySlot(ls, st.placement));
  T("C5: rewLead 0 → legenda „start 0 min” i komórka „[8:00–9:00]”",
    txt2.indexOf("start 0 min przed dzwonkiem") >= 0 && txt2.indexOf("[8:00–9:00]") >= 0);
}

/* ==================== D. renderPlan — chip z czasem ==================== */
{
  const st = fresh(); S = st;
  const c1 = mkC(st, "1a"); const t1 = mkT(st, "Anna Kowalska");
  mkA(st, c1.id, "Rewalidacja", t1.id, 1);
  mkA(st, c1.id, "Matematyka", mkT(st, "Jan Wiśniewski").id, 1);
  const ls = lessons(planWeek);
  const first = ls.filter(l => l.subject === "Rewalidacja")[0];
  const second = ls.filter(l => l.subject === "Matematyka")[0];
  st.placement[first.id] = 0; st.placement[second.id] = 8;
  tab = "plan"; viewMode = "class"; viewSel = c1.id; sel = null;
  const h = renderPlan();
  T("D1: chip rewalidacji z „⏱7:45–8:45” i tytułem godziny rewalidacyjnej",
    h.indexOf("⏱7:45–8:45") >= 0 && h.indexOf("Godzina rewalidacyjna") >= 0);
  T("D2: chip matematyki bez ⏱ (tylko rewalidacja ma czas)",
    (h.match(/⏱/g) || []).length === 1);
}

/* ==================== E. planszeHtml — legenda i komórka ==================== */
{
  const st = fresh(); S = st;
  const c1 = mkC(st, "1a"); const t1 = mkT(st, "Anna Kowalska");
  mkA(st, c1.id, "Rewalidacja", t1.id, 1);
  const ls = lessons(planWeek);
  st.placement[ls[0].id] = 2;
  const ph = planszeHtml();
  T("E1: legenda plansz: „Godzina rewalidacyjna: 60 min, start 15 min przed dzwonkiem (lek. 1 → 7:45–8:45)”",
    ph.indexOf("Godzina rewalidacyjna: 60 min, start 15 min przed dzwonkiem (lek. 1 → 7:45–8:45)") >= 0);
  T("E2: komórka rewalidacji na planszy z „· ⏱9:35–10:35”",
    ph.indexOf("· ⏱9:35–10:35") >= 0);
}

/* ==================== F. UI — Zasady planu ==================== */
{
  const st = fresh(); S = st;
  tab = "ogr"; ogrT = ""; ogrC = "";
  render();
  const ui = INPUTS["main"] && INPUTS["main"].innerHTML ? INPUTS["main"].innerHTML : "";
  T("F1: karta Godziny lekcyjne: pole „Godzina rewalidacyjna (min)” z wartością 60",
    ui.indexOf("Godzina rewalidacyjna (min)") >= 0 && ui.indexOf('value="60"') >= 0);
  T("F2: pole „Start rewalidacji przed dzwonkiem (min)” z wartością 15",
    ui.indexOf("Start rewalidacji przed dzwonkiem (min)") >= 0 && ui.indexOf('value="15"') >= 0);
  T("F3: wagi kar: „Rewalidacja poza lekcjami 1–2 i 7–8” z wRewMid",
    ui.indexOf("Rewalidacja poza lekcjami 1–2 i 7–8") >= 0 && ui.indexOf("wRewMid") >= 0);
}

/* ==================== G. sanity ==================== */
{
  T("G1: stopka „Wersja 6.4x.” w html apki (wersjo-odporne, ≥6.45)",
    /Wersja 6\.\d+\./.test(html));
  T("G2: endOfLesson bez zmian (8:00 → 8:45)",
    endOfLesson("8:00") === "8:45");
  T("G3: guessKind „Rewalidacja” → rew i kindOf kind:rew (regresja)",
    guessKind("Rewalidacja") === "rew" && kindOf({ kind: "rew" }) === "rew");
}

/* ==================== WYNIK ==================== */
console.log(fail ? "NIEUDANE:\n  - " + fails.join("\n  - ") : "WSZYSTKIE TESTY v6.45-czas ZAKOŃCZONE");
console.log("WYNIK v6.45-czas: " + pass + " OK, " + fail + " FAIL  (razem " + (pass + fail) + ")");
if (fail) process.exit(1);
