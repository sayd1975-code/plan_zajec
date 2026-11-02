/* Testy v6.39 — pojemność sal (cap): ile różnych grup klas może mieć zajęcia w sali naraz.
   Pokrycie: roomGroups, roomCap, normalize (migracja), walidator, automat (ciasny slot), UI/dopy, localStorage.
   Uruchomienie: node test-cap-v639.js. Bez "use strict" — sloppy eval wycieka funkcje apki.
   UWAGA: roomCap/roomName czytają GLOBALNE S — każdy blok ustawia S = st przed wywołaniami walidatora/automatu. */
const fs = require("fs");

/* ---------- mocki DOM (wzorzec z test.js) ---------- */
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
function fresh(){ return normalize({ teachers: [], classes: [], activities: [], placement: {},
  settings: {} }); }
function mkT(S, name){ const t = { id: nextId(S.teachers, "t"), name, short: name.split(/\s+/).slice(-1)[0].slice(0,3), unavail: [] }; S.teachers.push(t); return t; }
function mkC(S, name, rew){ const c = { id: nextId(S.classes, "c"), name, rew: rew || 2 }; S.classes.push(c); return c; }
function mkA(S, cid, subj, tid, hours, extra){ const a = Object.assign({ id: nextId(S.activities, "a"), classId: cid, withClassId: "", teacherId: tid || "", subject: subj, hours: hours || 1, kind: guessKind(subj), group: "", link: "" }, extra || {}); S.activities.push(a); return a; }

/* ==================== A. roomGroups (czysta funkcja) ==================== */
{
  const L = (ids) => ({ id: "x", classIds: ids });
  T("A1: pusta lista → 0 grup", roomGroups([]) === 0);
  T("A2: jedna lekcja → 1 grupa", roomGroups([L(["c1"])]) === 1);
  T("A3: zajęcia łączone [c1,c2] same → 1 grupa (to jedna lekcja)", roomGroups([L(["c1","c2"])]) === 1);
  T("A4: łączone [c1,c2] + [c1] → 1 grupa (spójne przez c1)", roomGroups([L(["c1","c2"]), L(["c1"])]) === 1);
  T("A5: dwie różne klasy → 2 grupy", roomGroups([L(["c1"]), L(["c2"])]) === 2);
  T("A6: łańcuch [c1,c2]+[c2,c3]+[c9] → 2 grupy (spójność przechodnia)", roomGroups([L(["c1","c2"]), L(["c2","c3"]), L(["c9"])]) === 2);
  T("A7: trzy osobne → 3 grupy", roomGroups([L(["c1"]), L(["c2"]), L(["c3"])]) === 3);
}

/* ==================== B. roomCap / setRoomCap ==================== */
{
  const st = fresh();
  st.rooms.push({ id: "r1", name: "Gabinet SI" });
  st.rooms.push({ id: "r2", name: "Sala gimnastyczna", cap: 2 });
  S = st;
  T("B1: sala bez cap → pojemność 1 (reguła v6.32)", roomCap("r1") === 1);
  T("B2: sala z cap 2 → pojemność 2", roomCap("r2") === 2);
  T("B3: nieistniejąca sala → 1", roomCap("brak") === 1);
  setRoomCap("r1", "3");
  T("B4: setRoomCap 3 → pojemność 3", roomCap("r1") === 3);
  setRoomCap("r1", "0");
  T("B5: setRoomCap 0 → clamp do 1", roomCap("r1") === 1);
  setRoomCap("r1", "abc");
  T("B6: setRoomCap śmieci → 1", roomCap("r1") === 1);
  setRoomCap("r1", "99");
  T("B7: setRoomCap 99 → clamp do 1 (max 20)", roomCap("r1") === 1);
  setRoomCap("r1", "20");
  T("B8: setRoomCap 20 → 20 (górna granica OK)", roomCap("r1") === 20);
  setRoomCap("r1", "1");
}

/* ==================== C. normalize — migracja starych zapisów ==================== */
{
  const st = normalize({ rooms: [{ id: "r1", name: "Stara sala" }, { id: "r2", name: "Dwuklasowa", cap: 2 }], teachers: [], classes: [], activities: [], placement: {}, settings: {} });
  T("C1: stary zapis bez cap → normalize doucza 1", st.rooms[0].cap === 1);
  T("C2: cap 2 przeżywa normalize", st.rooms[1].cap === 2);
  const st2 = normalize({ rooms: [{ id: "r1", name: "Zepsuta", cap: "x" }], teachers: [], classes: [], activities: [], placement: {}, settings: {} });
  S = st2;
  T("C3: cap-śmieć w zapisie → roomCap zwraca 1", roomCap("r1") === 1);
}

/* ==================== D. walidator (findViolations) ==================== */
{
  /* c1, c2, c3 — trzy klasy; WF każdej w sali r1 */
  const st = fresh();
  const c1 = mkC(st, "1a"); const c2 = mkC(st, "2a"); const c3 = mkC(st, "3a");
  const t1 = mkT(st, "Jan Testowy"); const t2 = mkT(st, "Ewa Testowa"); const t3 = mkT(st, "Ola Testowa");
  st.rooms.push({ id: "r1", name: "Sala SI" });
  mkA(st, c1.id, "WF", t1.id, 1, { roomId: "r1" });
  mkA(st, c2.id, "WF", t2.id, 1, { roomId: "r1" });
  mkA(st, c3.id, "WF", t3.id, 1, { roomId: "r1" });
  S = st; /* roomCap/roomName czytają globalne S */
  const ls = buildLessons(st.activities);
  const pl = { "a1-0": 0, "a2-0": 0, "a3-0": 0 };
  const errs = findViolations(ls, st.teachers, st.classes, pl, st.settings);
  T("D1: cap=1, dwie różne klasy w sali → błąd", errs.some(e => e.indexOf("zajęta przez różne klasy naraz") >= 0));
  T("D2: cap=1 → dokładnie stary komunikat v6.32", errs.some(e => e === "Sala Sala SI zajęta przez różne klasy naraz (Poniedziałek, godz. 1)"));
  /* cap 2: c1+c2 legalnie, c3 nadmiarowe */
  st.rooms[0].cap = 2;
  const errs2 = findViolations(ls, st.teachers, st.classes, { "a1-0": 0, "a2-0": 0 }, st.settings);
  T("D3: cap=2, dwie klasy w sali → bez błędu o sale", !errs2.some(e => e.indexOf("Sala") === 0));
  const errs3 = findViolations(ls, st.teachers, st.classes, pl, st.settings);
  T("D4: cap=2, trzy klasy → błąd z limitem pojemności", errs3.some(e => e.indexOf("3 różnych grup klas naraz — limit pojemności: 2") >= 0));
  /* równoległość tej samej klasy = jedna grupa */
  const st2 = fresh();
  const k1 = mkC(st2, "1a", 2); const tk = mkT(st2, "Iza Testowa");
  st2.rooms.push({ id: "r1", name: "Sala SI" });
  mkA(st2, k1.id, "Rewalidacja", tk.id, 2, { roomId: "r1", kind: "rew" });
  S = st2;
  const ls2 = buildLessons(st2.activities);
  const errs4 = findViolations(ls2, st2.teachers, st2.classes, { "a1-0": 0, "a1-1": 0 }, st2.settings);
  T("D5: dwie równoległe rewalidacje TEJ SAMEJ klasy w jednej sali (cap=1) → bez błędu o sale", !errs4.some(e => e.indexOf("Sala") === 0));
  /* zajęcia łączone A+B + lekcja A w tej samej sali (cap=1) → jedna grupa, bez błędu o sale */
  const st3 = fresh();
  const m1 = mkC(st3, "1a"); const m2 = mkC(st3, "2a"); const tm1 = mkT(st3, "Rel Testowy"); const tm2 = mkT(st3, "Rew Testowy");
  st3.rooms.push({ id: "r1", name: "Sala 1a" });
  mkA(st3, m1.id, "Religia", tm1.id, 1, { roomId: "r1", withClassId: m2.id });
  mkA(st3, m1.id, "Rewalidacja", tm2.id, 1, { roomId: "r1", kind: "rew", link: "REL" });
  S = st3;
  const ls3 = buildLessons(st3.activities);
  const errs5 = findViolations(ls3, st3.teachers, st3.classes, { "a1-0": 0, "a2-0": 0 }, st3.settings);
  T("D6: religia łączona 1a+2a + rewalidacja 1a z tym samym linkiem w jednej sali → jedna grupa, bez błędu o sale", !errs5.some(e => e.indexOf("Sala") === 0));
}

/* ==================== E. automat end-to-end (ciasny slot) ==================== */
{
  /* wszystkie sloty zablokowane oprócz 0 — dwie klasy muszą się zmieścić z WF w sali r1 */
  const mk = () => {
    const st = fresh();
    const c1 = mkC(st, "1a"); const c2 = mkC(st, "2a");
    const t1 = mkT(st, "Jan Testowy"); const t2 = mkT(st, "Ewa Testowa");
    st.rooms.push({ id: "r1", name: "Sala gimnastyczna" });
    mkA(st, c1.id, "WF", t1.id, 1, { roomId: "r1" });
    mkA(st, c2.id, "WF", t2.id, 1, { roomId: "r1" });
    st.settings.blockedSlots = Array.from({ length: 4 * NH + 7 }, (_, i) => i + 1); /* 1..39 */
    return st;
  };
  const stA = mk();
  S = stA;
  const bestA = autoSchedule(buildLessons(stA.activities), stA.teachers, stA.classes, stA.settings, 10);
  T("E1: cap=1, jeden wolny slot → automat kładzie tylko 1 z 2 WF w sali", Object.keys(bestA.placement).length === 1);
  const stB = mk();
  stB.rooms[0].cap = 2;
  S = stB;
  const bestB = autoSchedule(buildLessons(stB.activities), stB.teachers, stB.classes, stB.settings, 10);
  T("E2: cap=2, jeden wolny slot → obie klasy WF w sali naraz", Object.keys(bestB.placement).length === 2);
  const errsB = findViolations(buildLessons(stB.activities), stB.teachers, stB.classes, bestB.placement, stB.settings);
  T("E3: cap=2, obie w satu slotie → walidator czysty co do sal", !errsB.some(e => e.indexOf("Sala") === 0));
  /* kontrola: to SALE blokują (cap=1), nie coś innego — różne sale → obie się mieszczą */
  const stC = mk();
  stC.rooms.push({ id: "r2", name: "Sala druga" });
  stC.activities[1].roomId = "r2";
  S = stC;
  const bestC = autoSchedule(buildLessons(stC.activities), stC.teachers, stC.classes, stC.settings, 10);
  T("E4: różne sale (cap irrelevant) → obie WF ułożone w jednym slocie", Object.keys(bestC.placement).length === 2);
}

/* ==================== F. UI / preset demo / localStorage ==================== */
{
  S = normalize(demoState());
  T("F1: demo — Sala gimnastyczna ma cap 2", roomCap("r3") === 2);
  T("F2: demo — gabinety zostają przy 1", roomCap("r1") === 1 && roomCap("r2") === 1);
  const opts = roomOpts("");
  T("F3: roomOpts pokazuje etykietę pojemności sali współdzielonej", opts.indexOf("Sala gimnastyczna (do 2 klas)") >= 0);
  setRoomCap("r3", "3");
  T("F4: setRoomCap działa na demo → 3", roomCap("r3") === 3);
  const saved = JSON.parse(localStorage.getItem("plan-zajec-vibe-v1") || "{}");
  const r3 = (saved.rooms || []).filter(r => r.id === "r3")[0];
  T("F5: zapis do localStorage zachowuje cap=3", r3 && r3.cap === 3);
  setRoomCap("r3", "2");
}

/* ==================== WYNIK ==================== */
console.log("\n========================================");
console.log("WYNIK v6.39-pojemnosc: " + pass + " OK, " + fail + " FAIL  (razem " + (pass + fail) + ")");
if (fail) { console.log("NIEZALANE:"); fails.forEach(f => console.log("  -", f)); process.exit(1); }
console.log("WSZYSTKIE TESTY POJEMNOŚCI PRZECHODZĄ ✅");
