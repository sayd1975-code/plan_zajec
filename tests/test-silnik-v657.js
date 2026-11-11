/* Testy apki Plan Zajęć — v6.57: blok nauczyciela (tblock) + dogięcie automatu
   Uruchomienie: node tests/test-silnik-v657.js (z katalogu głównego repo)
   UWAGA: bez "use strict" — sloppy eval musi wyciec funkcje apki do scope modułu.
   Fikstury anonimowe: Krupka, Szczupak, Rusałka, Bąk, Lis. */
const fs = require("fs");

/* ---------- mocki DOM ---------- */
function el(){ return { value:"", textContent:"", innerHTML:"", checked:false, files:[],
  classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
  appendChild(){}, addEventListener(){}, style:{}, scrollIntoView(){}, focus(){}, setAttribute(){}, getAttribute(){ return null; } }; }
global.document = { getElementById(){ return el(); }, querySelector(){ return el(); }, documentElement:{ classList:{ add(){}, remove(){}, contains(){ return false; }, toggle(){} } },
  addEventListener(){}, createElement(){ return el(); }, body:{ classList:{ add(){}, remove(){}, toggle(){} } } };
global.window = global;
try { global.navigator = {}; } catch(e) { /* getter-only w nowszym Node — wystarczy domyślny */ }
global.location = { protocol: "http:" };
const _store = {};
global.localStorage = { getItem(k){ return (k in _store) ? _store[k] : null; }, setItem(k,v){ _store[k] = String(v); }, removeItem(k){ delete _store[k]; } };
global.confirm = () => true;
global.fetch = () => Promise.resolve({ ok: true });
global.alert = () => {};

/* ---------- załadowanie apki (NAJDŁUŻSZY <script>, zdjęcie "use strict") ---------- */
const raw = fs.readFileSync(process.env.APP_SOURCE || "index.html", "utf8");
const html = raw.startsWith("---") ? raw.split(/^---$/m).slice(2).join("---") : raw;
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const appSrc = scripts.reduce((a, b) => (b.length > a.length ? b : a));
eval(appSrc.replace('"use strict";', ""));

/* ---------- harness ---------- */
let pass = 0, fail = 0; const fails = [];
function T(name, cond){ if (cond) pass++; else { fail++; fails.push(name); console.log("  ✗ FAIL:", name); } }
function SEC(t){ console.log("—", t); }
function fresh(){ return normalize({ teachers: [], classes: [], activities: [], placement: {},
  settings: { teacherMaxPerDay: 7, classMaxPerDay: 7, lessonTimes: defaultLessonTimes() } }); }
function mkT(S, name, unavail){ const t = { id: nextId(S.teachers, "t"), name, short: name.split(/\s+/).slice(-1)[0].slice(0,3), unavail: unavail || [] }; S.teachers.push(t); return t; }
function mkC(S, name, rew, blocked){ const c = { id: nextId(S.classes, "c"), name, rew: rew || 2, blocked: blocked || [] }; S.classes.push(c); return c; }
function mkA(S, cid, subj, tid, hours, extra){ const a = Object.assign({ id: nextId(S.activities, "a"), classId: cid, withClassId: "", teacherId: tid || "", subject: subj, hours: hours || 1, kind: guessKind(subj), group: "", link: "" }, extra || {}); S.activities.push(a); return a; }
const ALL = []; for (let s = 0; s < 5 * 8; s++) ALL.push(s); /* 0..39 */

/* ==================== 1. normalize + buildLessons ==================== */
SEC("1. tblock: normalize i buildLessons");
{
  const st = fresh();
  const c1 = mkC(st, "3a");
  const t1 = mkT(st, "Krupka Joanna");
  const a1 = mkA(st, c1.id, "Świetlica", t1.id, 2);
  const st2 = normalize(JSON.parse(JSON.stringify(st)));
  T("normalize: tblock domyślnie false", st2.activities[0].tblock === false);
  const a2 = mkA(st, c1.id, "Doradztwo", t1.id, 1, { tblock: true });
  const st3 = normalize(JSON.parse(JSON.stringify(st)));
  T("normalize: tblock true zostaje", st3.activities[1].tblock === true);
  const ls = buildLessons(st.activities);
  T("buildLessons: tblock propagowany do lekcji", ls.filter(L => L.activityId === a2.id).every(L => L.tblock === true));
  T("buildLessons: zwykłe zajęcia bez tblock", ls.filter(L => L.activityId === a1.id).every(L => !L.tblock));
}

/* ==================== 2. findViolations: semantyka tblock ==================== */
SEC("2. findViolations: tblock zwalnia reguły klasowe, trzyma nauczycielskie");
{
  /* (a) brak konfliktu klasy: tblock może iść równolegle z lekcją tej samej klasy */
  const st = fresh();
  const c1 = mkC(st, "3a");
  const t1 = mkT(st, "Krupka Joanna"); const t2 = mkT(st, "Szczupak Jan");
  const a1 = mkA(st, c1.id, "Matematyka", t1.id, 1);
  const a2 = mkA(st, c1.id, "Doradztwo zawodowe", t2.id, 1, { tblock: true });
  const ls = buildLessons(st.activities);
  let errs = findViolations(ls, st.teachers, st.classes, { "a1-0": 0, "a2-0": 0 }, st.settings);
  T("tblock równolegle z lekcją tej samej klasy = OK (0 błędów)", errs.length === 0);
  /* kontrast: bez tblock to konflikt klasy (mutujemy lekcje, nie aktywności) */
  ls.forEach(L => { if (L.activityId === a2.id) L.tblock = ""; });
  errs = findViolations(ls, st.teachers, st.classes, { "a1-0": 0, "a2-0": 0 }, st.settings);
  T("bez flagi: dwie lekcje klasy naraz = błąd", errs.some(e => e.indexOf("dwie lekcje naraz") >= 0));
  ls.forEach(L => { if (L.activityId === a2.id) L.tblock = true; });
}
{
  /* (b) konflikt nauczyciela zostaje twardy */
  const st = fresh();
  const c1 = mkC(st, "3a"); const c2 = mkC(st, "3b");
  const t1 = mkT(st, "Rusałka Ewa");
  const a1 = mkA(st, c1.id, "Świetlica", t1.id, 1, { tblock: true });
  const a2 = mkA(st, c2.id, "Świetlica", t1.id, 1, { tblock: true });
  const ls = buildLessons(st.activities);
  const errs = findViolations(ls, st.teachers, st.classes, { "a1-0": 0, "a2-0": 0 }, st.settings);
  T("dwa tblock tego samego nauczyciela naraz = błąd nauczyciela", errs.some(e => e.indexOf("ma dwie lekcje naraz") >= 0));
}
{
  /* (c) limity dzienne: klasowy nie obowiązuje tblock, nauczycielski obowiązuje */
  const st = fresh();
  const c1 = mkC(st, "3a");
  const t1 = mkT(st, "Bąk Antoni"); const t2 = mkT(st, "Lis Ewa");
  for (let i = 0; i < 7; i++) mkA(st, c1.id, "Edukacja", t2.id, 1); /* 7 zwykłych */
  const aT = mkA(st, c1.id, "Doradztwo", t1.id, 3, { tblock: true });
  const ls = buildLessons(st.activities);
  /* 7 zwykłych @ sloty 0..6 + 3 tblock @ sloty 7,8,9 → poniedziałek: 8 lekcji klasy, ale tblock nie liczy się do limitu */
  const pl = {};
  let k = 0;
  ls.forEach(L => { pl[L.id] = (L.activityId === aT.id) ? (7 + parseInt(L.id.split("-")[1], 10)) : (k++); });
  let errs = findViolations(ls, st.teachers, st.classes, pl, st.settings);
  T("klasa 3a: 7 zwykłych + tblock w poniedziałek = bez błędu limitu klasy", errs.length === 0);
  /* bez flagi: 8 > 7 → błąd limitu klasy */
  ls.forEach(L => { if (L.activityId === aT.id) L.tblock = ""; });
  errs = findViolations(ls, st.teachers, st.classes, pl, st.settings);
  T("bez flagi: 8 lekcji klasy w poniedziałek = błąd limitu", errs.some(e => e.indexOf("ma 8 lekcji w") >= 0 && e.indexOf("(limit 7)") >= 0));
  ls.forEach(L => { if (L.activityId === aT.id) L.tblock = true; });
  /* tblock liczy się do limitu dziennego NAUCZYCIELA */
  st.settings.teacherMaxPerDay = 2;
  const pl2 = { "a8-0": 8, "a8-1": 9, "a8-2": 10 }; /* 3 tblock wtorek */
  const errs2 = findViolations(ls, st.teachers, st.classes, pl2, st.settings);
  T("tblock liczy się do limitu dziennego nauczyciela", errs2.some(e => e.indexOf("ma 3 lekcji w") >= 0 && e.indexOf("(limit 2)") >= 0));
}
{
  /* (d) okienka klasy: tblock nie tworzy okienek */
  const st = fresh();
  const c1 = mkC(st, "2a");
  const t1 = mkT(st, "Krupka Joanna"); const t2 = mkT(st, "Szczupak Jan");
  mkA(st, c1.id, "Edukacja", t1.id, 1);
  mkA(st, c1.id, "Doradztwo", t2.id, 1, { tblock: true });
  const ls = buildLessons(st.activities);
  /* zwykła @h0, tblock @h2 — bez maski klasa miałaby okienko na h1 */
  let errs = findViolations(ls, st.teachers, st.classes, { "a1-0": 0, "a2-0": 2 }, st.settings);
  T("tblock na h2 nie robi okienka klasie (zwykła na h0)", errs.length === 0);
  errs = findViolations(ls, st.teachers, st.classes, { "a1-0": 0, "a2-0": 1 }, st.settings);
  T("kontrola: zwykła na h1 = nadal 0 błędów (kontiguacja)", errs.length === 0);
}
{
  /* (e) niedostępność nauczyciela i zablokowana godzina zostają */
  const st = fresh();
  const c1 = mkC(st, "2a");
  const t1 = mkT(st, "Rusałka Ewa", [4]);
  const a1 = mkA(st, c1.id, "Świetlica", t1.id, 2, { tblock: true });
  const ls = buildLessons(st.activities);
  let errs = findViolations(ls, st.teachers, st.classes, { "a1-0": 4 }, st.settings);
  T("tblock na unavailable slocie nauczyciela = błąd", errs.some(e => e.indexOf("nie jest dostępny") >= 0));
  st.settings.blockedSlots = [39];
  errs = findViolations(ls, st.teachers, st.classes, { "a1-0": 39 }, st.settings);
  T("tblock na zablokowanej godzinie = błąd", errs.some(e => e.indexOf("Zablokowana godzina") >= 0));
  /* (f) blokada oddziału nie obowiązuje tblock */
  const c2 = mkC(st, "3b", 2, [7]);
  const a2 = mkA(st, c2.id, "Doradztwo", t1.id, 1, { tblock: true });
  const a3 = mkA(st, c2.id, "Matematyka", mkT(st, "Lis Ewa").id, 1);
  const ls2 = buildLessons([a2, a3]);
  errs = findViolations(ls2, st.teachers, st.classes, { "a2-0": 7, "a3-0": 6 }, st.settings);
  T("tblock ignoruje blokadę oddziału", !errs.some(e => e.indexOf("nie może mieć wtedy lekcji") >= 0));
  errs = findViolations(ls2, st.teachers, st.classes, { "a2-0": 6, "a3-0": 7 }, st.settings);
  T("zwykła lekcja na blokadzie oddziału = błąd", errs.some(e => e.indexOf("nie może mieć wtedy lekcji") >= 0));
}

/* ==================== 3. softPenalty: tblock poza okienkami klasy ==================== */
SEC("3. softPenalty: tblock nie karze okienek klasy");
{
  const st = fresh();
  const c1 = mkC(st, "2a");
  const t1 = mkT(st, "Krupka Joanna"); const t2 = mkT(st, "Szczupak Jan");
  mkA(st, c1.id, "Edukacja", t1.id, 1);
  mkA(st, c1.id, "Doradztwo zawodowe", t2.id, 1, { tblock: true });
  const ls = buildLessons(st.activities);
  const sp = softPenalty(ls, st.teachers, st.classes, st.settings, { "a1-0": 0, "a2-0": 2 });
  T("tblock na h2 nie generuje kary okienka klasy (pen=0)", sp.pen === 0 && sp.det.length === 0);
  /* kontrast: bez tblock (mutujemy lekcje) */
  ls.forEach(L => { if (L.activityId === "a2") L.tblock = ""; });
  const sp2 = softPenalty(ls, st.teachers, st.classes, st.settings, { "a1-0": 0, "a2-0": 2 });
  T("bez flagi: okienko klasy karane (pen>0)", sp2.pen > 0 && sp2.det.some(d => d.indexOf("okienek") >= 0));
  ls.forEach(L => { if (L.activityId === "a2") L.tblock = true; });
}

/* ==================== 4. automat: ŚAW bez oddziału (klasa "-") ==================== */
SEC("4. automat: tblock uklada 40h zajęć bez oddziału w 39 slotach");
{
  const st = fresh();
  st.settings.blockedSlots = [39];
  const c0 = mkC(st, "-"); const c1 = mkC(st, "2a");
  const t1 = mkT(st, "Krupka Joanna"); const t2 = mkT(st, "Szczupak Jan"); const t3 = mkT(st, "Rusałka Ewa");
  mkA(st, c0.id, "Świetlica", t1.id, 20, { tblock: true, kind: "swietl" });
  mkA(st, c0.id, "Świetlica", t2.id, 20, { tblock: true, kind: "swietl" });
  mkA(st, c1.id, "Edukacja wczesnoszkolna", t3.id, 8);
  const ls = buildLessons(st.activities);
  const best = autoSchedule(ls, st.teachers, st.classes, st.settings, 5);
  T("automat: wynik istnieje", !!best && !!best.placement);
  const placed = Object.keys(best.placement).length;
  T("automat: 48/48 ułożonych (tblock bez limitu klasy), ułożone " + placed, placed === ls.length && best.unplaced.length === 0);
  const errs = findViolations(ls, st.teachers, st.classes, best.placement, st.settings);
  T("automat: 0 naruszeń twardych", errs.length === 0);
  T("automat: slot 39 pusty", !Object.keys(best.placement).some(k => best.placement[k] === 39));
}

/* ==================== 5. automat: dogięcie 2-blokerowe ==================== */
SEC("5. dogięcie: wypychanie 2 lekcji naraz (deterministycznie, rng=0.5)");
{
  /* Geometria (piny przez unavail, rng stały = pełny determinizm):
     X dostępny tylko {0,1}; U (X, 3a) po greedy nie ma żadnego slotu:
       - slot 0: g1 (3a, grupa 1, Y1) + a1 (X, 3b — konflikt nauczyciela) = 2 blokery
       - slot 1: g2 (3a, grupa 2, Y2) = 1 blokera, ale g2 nie ma dokąd uciec (f2 zajmuje jej rezerwę)
     Sukces: wypchnięcie pary {g1, a1} z slotu 0 → U@0, relokacja g1→30, a1→1.
     Silnik 1-blokerowy (≤v6.56) zostawia U nieprzypisane. */
  const st = fresh();
  st.settings.blockedSlots = [];
  const cA = mkC(st, "3a"); const cB = mkC(st, "3b"); const cZ = mkC(st, "3z");
  const y1 = mkT(st, "Krupka Joanna"); const y2 = mkT(st, "Szczupak Jan"); const x = mkT(st, "Rusałka Ewa");
  /* y1: {0,13,30}; y2: {1,7}; x: {0,1} */
  y1.unavail = ALL.filter(s => [0, 13, 30].indexOf(s) < 0);
  y2.unavail = ALL.filter(s => [1, 7].indexOf(s) < 0);
  x.unavail = ALL.filter(s => [0, 1].indexOf(s) < 0);
  const g1 = mkA(st, cA.id, "Zajęcia grupowe A", y1.id, 1, { group: "1" });
  const f1 = mkA(st, cZ.id, "Wypełniacz A", y1.id, 1);
  const g2 = mkA(st, cA.id, "Zajęcia grupowe B", y2.id, 1, { group: "2" });
  const f2 = mkA(st, cZ.id, "Wypełniacz B", y2.id, 1);
  const a1 = mkA(st, cB.id, "Wychowanie", x.id, 1);
  const u = mkA(st, cA.id, "Matematyka", x.id, 1);
  const ls = buildLessons(st.activities);
  const r = attemptSchedule(ls, st.teachers, st.classes, st.settings, function(){ return 0.5; });
  T("dogięcie: wynik istnieje", !!r && !!r.placement);
  T("dognięcie: 6/6 lekcji ułożonych (2-blokerowe wypchnięcie), nieprzypisane: " + (r ? r.unplaced.length : "?"), !!r && r.unplaced.length === 0);
  const errs = findViolations(ls, st.teachers, st.classes, r.placement, st.settings);
  T("dogięcie: 0 naruszeń twardych po wypchnięciu", errs.length === 0);
}

/* ==================== 6. dognięcie po naprawach miękkich ==================== */
SEC("6. repairSoft: dogięcie dołacza nieprzypisane w wolne sloty");
{
  const st = fresh();
  const c1 = mkC(st, "2a");
  const t1 = mkT(st, "Bąk Antoni", [6, 7, 8, 9, 10]);
  const a1 = mkA(st, c1.id, "Czytanie", t1.id, 2);
  const ls = buildLessons(st.activities);
  const pl = repairSoft(ls, st.teachers, st.classes, st.settings, { "a1-0": 5 });
  T("dogięcie: a1-1 dostaje slot", pl["a1-1"] != null);
  T("dogięcie: slot poza unavailable nauczyciela", [6, 7, 8, 9, 10].indexOf(pl["a1-1"]) < 0);
  const errs = findViolations(ls, st.teachers, st.classes, pl, st.settings);
  T("dogięcie: 0 naruszeń po dołożeniu", errs.length === 0);
  /* dognięcie szanuje unavailable: wąski dostęp — tylko slot 13 wolny dla a1-1 */
  const t2 = mkT(st, "Lis Ewa", ALL.filter(s => s !== 13 && s !== 5));
  const a2 = mkA(st, c1.id, "Pisanie", t2.id, 2);
  const ls2 = buildLessons([a2]);
  const pl2 = repairSoft(ls2, st.teachers, st.classes, st.settings, { "a2-0": 5 });
  T("dogięcie: jedyny wolny slot (13) wykorzystany", pl2["a2-1"] === 13);
}

/* ==================== 7. import: automatyczna flaga tblock ==================== */
SEC("7. import: '-' i „obowiązki…” dostają tblock automatycznie");
{
  S = fresh();
  importRows = [
    { teacher: "Krupka Joanna", subject: "Świetlica", className: "-", hours: 3, status: "ok" },
    { teacher: "Lis Ewa", subject: "obowiązki nauczyciela doradcy zawodowego", className: "7a", hours: 2, status: "ok" },
    { teacher: "Bąk Antoni", subject: "Matematyka", className: "3a", hours: 5, status: "ok" }
  ];
  doImport();
  T("import: 3 wiersze zaimportowane", S.activities.length === 3);
  T("import: klasa '-' → tblock", S.activities[0].tblock === true);
  T("import: „obowiązki…” → tblock", S.activities[1].tblock === true);
  T("import: zwykłe zajęcia bez tblock", !S.activities[2].tblock);
  T("import: klasa '-' utworzona", S.classes.some(c => c.name === "-"));
  /* setAct */
  setAct(S.activities[2].id, "tblock", true);
  T("setAct: tblock włączany checkboxem", S.activities[2].tblock === true);
  setAct(S.activities[2].id, "tblock", false);
  T("setAct: tblock wyłączany", S.activities[2].tblock === false);
}

/* ==================== 8. UI: checkbox + naprawa podwójnego selektora tygodnia ==================== */
SEC("8. UI: checkbox „N” i jeden selektor tygodnia A/B");
{
  T("UI: checkbox bloku nauczyciela w wierszu zajęć", html.indexOf("\\'tblock\\',this.checked)") >= 0);
  T("UI: tooltip bloku nauczyciela", html.indexOf("Blok nauczyciela") >= 0);
  T("UI: podwójny selektor tygodnia usunięty (v6.56 bug)", html.indexOf("h += wkSel + '<select") < 0);
  T("UI: selektor tygodnia renderowany raz", html.indexOf("h += wkSel;") >= 0);
  T("UI: hint o bloku nauczyciela pod listą zajęć", html.indexOf("N = blok nauczyciela") >= 0);
  T("stopka „Wersja 6.57.” w html apki", html.indexOf("Wersja 6.57.") >= 0);
}

/* ==================== 9. regresja: zwykłe klasy nadal bez okienek ==================== */
SEC("9. regresja: zero-okienkowa zasada dla zwykłych zajęć");
{
  const st = fresh();
  const c1 = mkC(st, "3a");
  const t1 = mkT(st, "Krupka Joanna"); const t2 = mkT(st, "Szczupak Jan");
  mkA(st, c1.id, "Edukacja", t1.id, 4);
  mkA(st, c1.id, "Plastyka", t2.id, 2);
  const ls = buildLessons(st.activities);
  const best = autoSchedule(ls, st.teachers, st.classes, st.settings, 10);
  const errs = findViolations(ls, st.teachers, st.classes, best.placement, st.settings);
  T("regresja: zwykłe zajęcia ułożone w całości", Object.keys(best.placement).length === ls.length);
  T("regresja: 0 naruszeń (w tym okienka klasy)", errs.length === 0);
}

/* ---------- podsumowanie ---------- */
console.log("");
console.log(fail === 0 ? "WSZYSTKIE TESTY v6.57-silnik ZAKOŃCZONE" : "TESTY v6.57-silnik ZAKOŃCZONE Z BŁĘDAMI");
console.log("WYNIK v6.57-silnik: " + pass + " OK, " + fail + " FAIL  (razem " + (pass + fail) + ")");
if (fails.length){ console.log("Nieprzechodzące:"); fails.forEach(f => console.log("  -", f)); }
process.exit(fail ? 1 : 0);
