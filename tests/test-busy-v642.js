/* Testy v6.42 — busy nauczycieli: nazwane blokady (🏷️ unavailWhy) + wyjazdy/wycieczki (🚌 S.trips).
   Pokrycie: parseSlotsText/slotsToStr, addNamedBlock/delNamedBlock, tripBlock, addTrip/delTrip,
   wpięcia silnika (attemptSchedule/repairSoft z trp PO unavail i clsBlock), findViolations (trM),
   zastępstwa (trU), renderPlan (trv/tEffV/cEffV, .tripcell), wydruki (planText 🚌/✕, planszeHtml),
   normalize (p.trips, czystka unavailWhy), roundtrip przez localStorage.
   Uruchomienie: node test-busy-v642.js. Bez "use strict" — sloppy eval wycieka funkcje apki.
   UWAGA: tripBlock czyta GLOBALNE S — każdy blok ustawia S = st przed silnikiem/renderem. */
const fs = require("fs");

/* ---------- mocki DOM (wzorzec z test.js / test-uczniowie-v640.js) ---------- */
function el(){ return { value:"", textContent:"", innerHTML:"", checked:false, files:[],
  className:"", style:{ display:"" },
  classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
  appendChild(){}, addEventListener(){}, scrollIntoView(){}, focus(){}, setAttribute(){}, getAttribute(){ return null; } }; }
const INPUTS = {}; /* celowane pola UI: nbWhy/nbSlots, tripLabel/tripSlots, tript-<tid>, tripc-<cid> */
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
function mkA(S, id, cls, t, subject, hours){ S.activities.push({ id, classId: cls.id, teacherId: t.id, subject, hours: hours || 1, kind: "std", group: "", link: "", studentId: "", week: "" }); }
function setupView(st, mode, selId){ S = st; viewMode = mode; viewSel = selId; sel = null; planWeek = "A"; return renderPlan(); }
function resetInputs(){ for (const k of Object.keys(INPUTS)) delete INPUTS[k]; }

/* ==================== A. parseSlotsText — format godzin bez klasy ==================== */
{
  let r = parseSlotsText("pn 1-3");
  T("A1: „pn 1-3” → sloty [0,1,2]",
    r.slots.length === 3 && [0,1,2].every(s => r.slots.indexOf(s) >= 0) && r.skipped.length === 0);
  r = parseSlotsText("wt 1,8");
  T("A2: „wt 1,8” → sloty [8,15] (przecinkowa lista godzin)",
    r.slots.length === 2 && r.slots.indexOf(8) >= 0 && r.slots.indexOf(15) >= 0);
  r = parseSlotsText("śr cały");
  T("A3: „śr cały” → cały środkowy dzień (sloty 16-23)",
    r.slots.length === 8 && r.slots.every(s => s >= 16 && s <= 23));
  r = parseSlotsText("czw od 6");
  T("A4: „czw od 6” → czwartek lekcje 6-8 (sloty 29-31)",
    r.slots.length === 3 && r.slots.every(s => s >= 29 && s <= 31));
  r = parseSlotsText("pt do 3");
  T("A5: „pt do 3” → piątek lekcje 1-3 (sloty 32-34)",
    r.slots.length === 3 && r.slots.every(s => s >= 32 && s <= 34));
  r = parseSlotsText("xyz 5");
  T("A6: tekst bez skrótu dnia → skipped, 0 slotów",
    r.slots.length === 0 && r.skipped.length === 1);
  r = parseSlotsText("pn 1; pn 1-2");
  T("A7: „pn 1; pn 1-2” → deduplikacja → sloty [0,1]",
    r.slots.length === 2 && r.slots.indexOf(0) >= 0 && r.slots.indexOf(1) >= 0);
}

/* ==================== B. slotsToStr — sloty → czytelny opis ==================== */
{
  T("B1: [0,1,2] → „po 1,2,3” (małe litery skrótów)",
    slotsToStr([0,1,2]) === "po 1,2,3");
  T("B2: [8,15] → „wt 1,8”",
    slotsToStr([8,15]) === "wt 1,8");
  T("B3: [] → „—” (pusty zapis)",
    slotsToStr([]) === "—");
  T("B4: [12,0] → sortowanie dni i godzin → „po 1; wt 5”",
    slotsToStr([12,0]) === "po 1; wt 5");
}

/* ==================== C. addNamedBlock / delNamedBlock — nazwane blokady nauczyciela ==================== */
{
  const st = fresh();
  const t1 = mkT(st, "Anna Testowa"), t2 = mkT(st, "Jan Próbny");
  const c1 = mkC(st, "1a");
  mkA(st, "a1", c1, t1, "Matematyka", 1);
  st.placement["a1-0"] = 8; /* wt lekcja 1 — koliduje z blokadą */
  S = st; ogrT = t1.id; resetInputs();
  INPUTS["nbWhy"] = el(); INPUTS["nbWhy"].value = "Awizacja";
  INPUTS["nbSlots"] = el(); INPUTS["nbSlots"].value = "wt 1-2; śr 5";
  addNamedBlock();
  T("C1: blokada „Awizacja” (wt 1-2; śr 5) → unavail [8,9,20] + unavailWhy z powodem",
    t1.unavail.length === 3 && [8,9,20].every(s => t1.unavail.indexOf(s) >= 0)
    && [8,9,20].every(s => t1.unavailWhy[s] === "Awizacja"));
  T("C2: kolidująca lekcja a1-0 (wt lekcja 1) zdjęta z planu",
    st.placement["a1-0"] == null);
  T("C3: drugi nauczyciel i reszta planu nietknięte",
    t2.unavail.length === 0 && Object.keys(t2.unavailWhy).length === 0);
  resetInputs();
  INPUTS["nbWhy"] = el(); INPUTS["nbWhy"].value = "";
  INPUTS["nbSlots"] = el(); INPUTS["nbSlots"].value = "pn 1";
  const un1 = t1.unavail.length; addNamedBlock();
  T("C4: brak powodu → flash ostrzeżenia, nic nie zmienione",
    t1.unavail.length === un1);
  resetInputs();
  INPUTS["nbWhy"] = el(); INPUTS["nbWhy"].value = "Konferencja";
  INPUTS["nbSlots"] = el(); INPUTS["nbSlots"].value = "be sensu";
  const un2 = t1.unavail.length; addNamedBlock();
  T("C5: niezrozumiałe godziny → nic nie dodane",
    t1.unavail.length === un2);
  /* ręczna blokada bez powodu (pn 1-2 = sloty 0,1) + druga nazwana (pn 3 = slot 2) */
  resetInputs();
  t1.unavail.push(0); t1.unavail.push(1);
  INPUTS["nbWhy"] = el(); INPUTS["nbWhy"].value = "Wycieczka";
  INPUTS["nbSlots"] = el(); INPUTS["nbSlots"].value = "pn 3";
  addNamedBlock();
  T("C6: druga blokada „Wycieczka” (pn 3) — ręczne pn 1-2 zostają bez powodu, slot pn 3 dostaje powód",
    t1.unavailWhy[2] === "Wycieczka" && t1.unavailWhy[0] == null && t1.unavailWhy[1] == null
    && t1.unavail.length === 6);
  ogrT = t1.id;
  delNamedBlock(0); /* order: „Awizacja” jest pierwsza (sloty 8,9,20) */
  T("C7: delNamedBlock(0) usuwa tylko „Awizację” — ręczne pn 1-2 i „Wycieczka” pn 3 zostają",
    t1.unavailWhy[2] === "Wycieczka" && [8,9,20].every(s => t1.unavail.indexOf(s) < 0)
    && t1.unavailWhy[8] == null && [0,1,2].every(s => t1.unavail.indexOf(s) >= 0));
  /* starszy zapis bez unavailWhy */
  resetInputs();
  const t3 = mkT(st, "Zofia Stara"); delete t3.unavailWhy;
  ogrT = t3.id;
  INPUTS["nbWhy"] = el(); INPUTS["nbWhy"].value = "Szkolenie";
  INPUTS["nbSlots"] = el(); INPUTS["nbSlots"].value = "pn 1";
  addNamedBlock();
  T("C8: nauczyciel ze starszego zapisu (brak unavailWhy) → safety tworzy mapę i zapisuje powód",
    t3.unavailWhy && t3.unavailWhy[0] === "Szkolenie");
  resetInputs(); ogrT = "";
}

/* ==================== D. tripBlock / addTrip / delTrip — wyjazdy i wycieczki ==================== */
{
  const st = fresh();
  const t1 = mkT(st, "Anna Testowa"), c1 = mkC(st, "1a");
  S = st;
  T("D1: brak wyjazdów → tripBlock puste mapy {t:{}, c:{}}",
    Object.keys(tripBlock().t).length === 0 && Object.keys(tripBlock().c).length === 0);
  st.trips.push({ id: "e1", label: "Muzeum", teacherIds: [t1.id], classIds: [c1.id], slots: [8, 9] });
  S = st;
  const tb = tripBlock();
  T("D2: wyjazd „Muzeum” mapuje nauczyciela i oddział na te same sloty",
    tb.t[t1.id] && tb.t[t1.id][8] === "Muzeum" && tb.t[t1.id][9] === "Muzeum"
    && tb.c[c1.id] && tb.c[c1.id][8] === "Muzeum" && tb.c[c1.id][9] === "Muzeum");
  st.trips.push({ id: "e2", label: "", teacherIds: [t1.id], classIds: [], slots: [16] });
  S = st;
  T("D3: wyjazd bez nazwy → domyślny label „Wyjazd”",
    tripBlock().t[t1.id][16] === "Wyjazd");
  /* addTrip przez UI */
  const st2 = fresh();
  const t2 = mkT(st2, "Jan Próbny"), t3 = mkT(st2, "Ola Testowa");
  const c2 = mkC(st2, "2b"), c3 = mkC(st2, "3c");
  mkA(st2, "a1", c2, t2, "Historia", 1); mkA(st2, "a2", c2, t3, "Plastyka", 1);
  st2.placement["a1-0"] = 8; /* wt lekcja 1 — koliduje */
  st2.placement["a2-0"] = 9; /* wt lekcja 2 — koliduje */
  S = st2; resetInputs();
  INPUTS["tripLabel"] = el(); INPUTS["tripLabel"].value = "Kino";
  INPUTS["tripSlots"] = el(); INPUTS["tripSlots"].value = "wt 1-2";
  INPUTS["tript-" + t2.id] = el(); INPUTS["tript-" + t2.id].checked = true;
  INPUTS["tripc-" + c2.id] = el(); INPUTS["tripc-" + c2.id].checked = true;
  addTrip();
  T("D4: addTrip przez UI → wpis {label Kino, teacherIds [t2], classIds [c2], slots [8,9]}",
    st2.trips.length === 1 && st2.trips[0].label === "Kino"
    && st2.trips[0].teacherIds.join() === t2.id && st2.trips[0].classIds.join() === c2.id
    && st2.trips[0].slots.join() === "8,9");
  T("D5: kolidujące lekcje nauczyciela i oddziału zdjęte z planu (a1-0 i a2-0)",
    st2.placement["a1-0"] == null && st2.placement["a2-0"] == null);
  const nTrips = st2.trips.length;
  resetInputs();
  INPUTS["tripLabel"] = el(); INPUTS["tripLabel"].value = "Teatr";
  INPUTS["tripSlots"] = el(); INPUTS["tripSlots"].value = "pn 1";
  addTrip(); /* nic nie zaznaczone */
  T("D6: wyjazd bez zaznaczonych nauczycieli/oddziałów → ostrzeżenie, wpis nienaruszony",
    st2.trips.length === nTrips);
  resetInputs();
  INPUTS["tripSlots"] = el(); INPUTS["tripSlots"].value = "be sensu";
  INPUTS["tript-" + t2.id] = el(); INPUTS["tript-" + t2.id].checked = true;
  addTrip();
  T("D7: niezrozumiałe godziny → ostrzeżenie, wpis nienaruszony",
    st2.trips.length === nTrips);
  /* reset pola checkbox — drugi addTrip nie dziedziczy zaznaczenia */
  INPUTS["tripLabel"] = el(); INPUTS["tripLabel"].value = "Basen";
  INPUTS["tripSlots"] = el(); INPUTS["tripSlots"].value = "pn 2";
  INPUTS["tript-" + t2.id] = el(); INPUTS["tript-" + t2.id].checked = true;
  addTrip();
  INPUTS["tript-" + t2.id] = el(); /* reset — pole odznaczone */
  INPUTS["tripLabel"] = el(); INPUTS["tripLabel"].value = "Teatr";
  INPUTS["tripc-" + c3.id] = el(); INPUTS["tripc-" + c3.id].checked = true;
  INPUTS["tripSlots"] = el(); INPUTS["tripSlots"].value = "pn 3";
  addTrip();
  T("D8: odznaczony checkbox po resecie → drugi wyjazd nie dziedziczy nauczyciela (wpis „Basen” ma t2, nowy — nie)",
    st2.trips.length === 3 && st2.trips[1].teacherIds.indexOf(t2.id) >= 0
    && st2.trips[2].teacherIds.indexOf(t2.id) < 0);
  delTrip(0);
  T("D9: delTrip(0) usuwa pierwszy wyjazd (Kino)",
    st2.trips.length === 2 && st2.trips[0].label !== "Kino");
  resetInputs();
}

/* ==================== E. silnik — attemptSchedule / repairSoft uwzględniają wyjazdy ==================== */
{
  /* E1: nauczyciel na wyjeździe */
  const st = fresh();
  const t1 = mkT(st, "Anna Testowa"), c1 = mkC(st, "1a");
  mkA(st, "a1", c1, t1, "Matematyka", 1);
  st.trips.push({ id: "e1", label: "Muzeum", teacherIds: [t1.id], classIds: [], slots: [0,1,2,3,4,5,6,7] });
  S = st;
  const r1 = attemptSchedule(lessons(), st.teachers, st.classes, st.settings, () => 0.42);
  T("E1: nauczyciel na całodniowym wyjeździe (pn) → lekcja nie wyląduje w poniedziałek",
    r1.placement["a1-0"] != null && Math.floor(r1.placement["a1-0"] / NH) !== 0);
  /* E2: klasa na wyjeździe */
  const st2 = fresh();
  const t2 = mkT(st2, "Jan Próbny"), c2 = mkC(st2, "2b");
  mkA(st2, "a1", c2, t2, "Historia", 1);
  st2.trips.push({ id: "e1", label: "Kino", teacherIds: [], classIds: [c2.id], slots: [0,1,2,3,4,5,6,7] });
  S = st2;
  const r2 = attemptSchedule(lessons(), st2.teachers, st2.classes, st2.settings, () => 0.42);
  T("E2: oddział na całodniowym wyjeździe (pn) → lekcja nie wyląduje w poniedziałek",
    r2.placement["a1-0"] != null && Math.floor(r2.placement["a1-0"] / NH) !== 0);
  /* E3: format godzin w addTrip — „wt 1,2” */
  const st3 = fresh();
  const t3 = mkT(st3, "Ola Testowa"), c3 = mkC(st3, "3c");
  S = st3; resetInputs();
  INPUTS["tripLabel"] = el(); INPUTS["tripLabel"].value = "Występ";
  INPUTS["tripSlots"] = el(); INPUTS["tripSlots"].value = "wt 1,2";
  INPUTS["tripc-" + c3.id] = el(); INPUTS["tripc-" + c3.id].checked = true;
  addTrip();
  T("E3: „wt 1,2” w addTrip → sloty [8,9] (przecinkowa lista)",
    st3.trips.length === 1 && st3.trips[0].slots.join() === "8,9");
  resetInputs();
  /* E4: repairSoft nie przenosi lekcji na wyjazd */
  const st4 = fresh();
  const t4 = mkT(st4, "Ewa Testowa"), c4 = mkC(st4, "4d");
  mkA(st4, "a1", c4, t4, "Muzyka", 1);
  const pl = { "a1-0": 12 }; /* wt lekcja 5 — luka przed nią */
  st4.settings.classMaxGaps = 0; st4.settings.maxGaps = 0;
  S = st4;
  st4.trips.push({ id: "e1", label: "Basen", teacherIds: [], classIds: [c4.id], slots: [8,9,10,11] });
  S = st4;
  const r4 = repairSoft(lessons(), st4.teachers, st4.classes, st4.settings, pl);
  T("E4: repairSoft nie przesuwa lekcji na godziny wyjazdu oddziału (8-11)",
    r4["a1-0"] != null && [8,9,10,11].indexOf(r4["a1-0"]) < 0);
  /* E5: unavail + wyjazd naraz — obie blokady działają (trp PO unavail) */
  const st5 = fresh();
  const t5 = mkT(st5, "Igor Testowy"), c5 = mkC(st5, "5e");
  mkA(st5, "a1", c5, t5, "Polski", 1);
  t5.unavail = [0,1,2,3,4,5,6,7]; /* pn ręcznie */
  st5.trips.push({ id: "e1", label: "ZOO", teacherIds: [t5.id], classIds: [], slots: [8,9,10,11,12,13,14,15] });
  S = st5;
  const r5 = attemptSchedule(lessons(), st5.teachers, st5.classes, st5.settings, () => 0.42);
  T("E5: unavail (pn) + wyjazd (wt) naraz → lekcja omija oba dni",
    r5.placement["a1-0"] != null && [0,1].indexOf(Math.floor(r5.placement["a1-0"] / NH)) < 0);
  /* E6: blokada oddziału + wyjazd na tym samym dniu — trp PO clsBlock nadal blokuje */
  const st6 = fresh();
  const t6 = mkT(st6, "Kuba Testowy"), c6 = mkC(st6, "6f");
  mkA(st6, "a1", c6, t6, "Technika", 1);
  c6.blocked = [0,1,2,3]; /* pn 1-4 z ⛔ Ograniczenia */
  st6.trips.push({ id: "e1", label: "Wycieczka", teacherIds: [], classIds: [c6.id], slots: [4,5,6,7] });
  S = st6;
  const r6 = attemptSchedule(lessons(), st6.teachers, st6.classes, st6.settings, () => 0.42);
  T("E6: blokada oddziału (pn 1-4) + wyjazd (pn 5-8) → cały poniedziałek zablokowany dla klasy",
    r6.placement["a1-0"] != null && Math.floor(r6.placement["a1-0"] / NH) !== 0);
  /* E7: wyjazd z pustymi listami nie wywala silnika */
  const st7 = fresh();
  const t7 = mkT(st7, "Nina Testowa"), c7 = mkC(st7, "7g");
  mkA(st7, "a1", c7, t7, "Biology", 1);
  st7.trips.push({ id: "e1", label: "Pusto", teacherIds: [], classIds: [], slots: [] });
  S = st7;
  const r7 = attemptSchedule(lessons(), st7.teachers, st7.classes, st7.settings, () => 0.42);
  T("E7: wyjazd bez nauczycieli/klas/godzin → silnik działa normalnie (lekcja ułożona)",
    r7.placement["a1-0"] != null);
}

/* ==================== F. renderPlan i wydruki — busy widoczne w planie ==================== */
{
  /* F1/F2/F3: widok nauczyciela */
  const st = fresh();
  const t1 = mkT(st, "Anna Testowa");
  const c1 = mkC(st, "1a");
  st.trips.push({ id: "e1", label: "Muzeum", teacherIds: [t1.id], classIds: [], slots: [0] }); /* pn 1 */
  t1.unavail.push(8); t1.unavailWhy[8] = "Awizacja"; /* wt 1 */
  t1.unavail.push(16); /* śr 1 — ręczne bez powodu */
  S = st;
  const h1 = setupView(st, "teacher", t1.id);
  T("F1: widok nauczyciela — pn 1 pokazuje „🚌 Muzeum” w .tripcell",
    h1.indexOf("tripcell") >= 0 && h1.indexOf("🚌 Muzeum") >= 0);
  T("F2: widok nauczyciela — wt 1 pokazuje „✕ Awizacja” (nazwana blokada)",
    h1.indexOf("✕ Awizacja") >= 0);
  T("F3: widok nauczyciela — śr 1 pokazuje samo „✕” (ręczna blokada bez powodu)",
    /class="tripcell">✕<\/div>/.test(h1));
  /* F4/F5: widok oddziału */
  const st2 = fresh();
  const t2 = mkT(st2, "Jan Próbny"), c2 = mkC(st2, "2b");
  S = st2; ogrT = ""; resetInputs();
  INPUTS["tripLabel"] = el(); INPUTS["tripLabel"].value = "Kino";
  INPUTS["tripSlots"] = el(); INPUTS["tripSlots"].value = "pn 1; wt 1,2";
  INPUTS["tripc-" + c2.id] = el(); INPUTS["tripc-" + c2.id].checked = true;
  addTrip();
  const h2 = setupView(st2, "class", c2.id);
  T("F4: wyjazd oddziału „pn 1; wt 1,2” → 🚌 Kino w pn 1, wt 1 i wt 2 planu oddziału",
    (h2.match(/🚌 Kino/g) || []).length >= 3 && st2.trips[0].slots.join() === "0,8,9");
  resetInputs();
  c2.blocked = [16]; /* śr 1 */
  const h3 = renderPlan();
  T("F5: blokada oddziału (⛔ Ograniczenia) → ⛔ z tytułem w pustym polu",
    h3.indexOf("tripcell") >= 0 && /title="Godzina zablokowana dla oddziału \(⛔ Ograniczenia\)">⛔</.test(h3));
  /* F6/F7: planText (wydruk) nauczyciela */
  const st3 = fresh();
  const t3 = mkT(st3, "Ola Testowa");
  const c3 = mkC(st3, "3c");
  st3.trips.push({ id: "e1", label: "Muzeum", teacherIds: [t3.id], classIds: [], slots: [0] });
  t3.unavail.push(8); t3.unavailWhy[8] = "Awizacja";
  S = st3;
  const pt = planText("teacher", t3.id, lessonsBySlot(lessons(), {}));
  T("F6: planText nauczyciela — wydruk pokazuje „🚌 Muzeum” w pustym pn 1",
    pt.indexOf("🚌 Muzeum") >= 0);
  T("F7: planText nauczyciela — wydruk pokazuje „✕ Awizacja” w pustym wt 1",
    pt.indexOf("✕ Awizacja") >= 0);
  /* F8: planText oddziału z wyjazdem */
  const st4 = fresh();
  const t4 = mkT(st4, "Ewa Testowa"), c4 = mkC(st4, "4d");
  st4.trips.push({ id: "e1", label: "Kino", teacherIds: [], classIds: [c4.id], slots: [0] });
  S = st4;
  const pt2 = planText("class", c4.id, lessonsBySlot(lessons(), {}));
  T("F8: planText oddziału — wydruk pokazuje „🚌 Kino” w pustym pn 1",
    pt2.indexOf("🚌 Kino") >= 0);
  /* F9: planszeHtml (plansze do druku A3) */
  const st5 = fresh();
  const t5 = mkT(st5, "Ada Testowa"), c5 = mkC(st5, "5e");
  st5.trips.push({ id: "e1", label: "Teatr", teacherIds: [], classIds: [c5.id], slots: [0] });
  S = st5;
  const ph = planszeHtml();
  T("F9: planszeHtml — plansza oddziału 5e pokazuje „🚌 Teatr” w pn 1",
    ph.indexOf("Oddział: 5e") >= 0 && ph.indexOf("🚌 Teatr") >= 0);
  /* F10: 🏷️ i 🚌 — karty UI istnieją w kodzie (sekcje renderOgr) */
  T("F10: renderOgr zawiera sekcję „🏷️ Nazwane blokady” oraz renderDane/karty „🚌 Wyjazdy i wycieczki”",
    appSrc.indexOf("Nazwane blokady") >= 0 && appSrc.indexOf("Wyjazdy i wycieczki") >= 0);
}

/* ==================== G. findViolations + zastępstwa ==================== */
{
  /* G1/G2/G3 */
  const st = fresh();
  const t1 = mkT(st, "Anna Testowa"), c1 = mkC(st, "1a");
  mkA(st, "a1", c1, t1, "Matematyka", 1);
  S = st;
  const ls = lessons();
  st.trips.push({ id: "e1", label: "Muzeum", teacherIds: [t1.id], classIds: [c1.id], slots: [0] });
  S = st;
  const errs = findViolations(ls, st.teachers, st.classes, { "a1-0": 0 }, st.settings);
  T("G1: lekcja na godzinie wyjazdu nauczyciela → „jest wtedy na wyjeździe (🚌 Muzeum)”",
    errs.some(e => e.indexOf("jest wtedy na wyjeździe (🚌 Muzeum)") >= 0));
  T("G2: lekcja na godzinie wyjazdu oddziału → „Klasa … jest wtedy na wyjeździe”",
    errs.some(e => /^Klasa .* jest wtedy na wyjeździe/.test(e)));
  const errs2 = findViolations(ls, st.teachers, st.classes, { "a1-0": 10 }, st.settings);
  T("G3: lekcja poza wyjazdem → brak komunikatów o wyjeździe",
    !errs2.some(e => e.indexOf("wyjeździe") >= 0));
  /* G4: kandydat na zastępstwo nie może być na wyjeździe */
  const st2 = fresh();
  const tN = mkT(st2, "Nieobecny Testowy"); /* nieobecny */
  const tFree = mkT(st2, "Wolna Testowa"); /* wolna bez wyjazdu */
  const tTrip = mkT(st2, "Wyjazdowa Testowa"); /* wolna, ale na wyjeździe */
  const c2 = mkC(st2, "2b");
  mkA(st2, "a1", c2, tN, "Historia", 1);
  st2.placement["a1-0"] = 0; /* pn lekcja 1 */
  st2.trips.push({ id: "e1", label: "Muzeum", teacherIds: [tTrip.id], classIds: [], slots: [0] });
  zastDay = 0; zastAbsent = {}; zastAbsent[tN.id] = true;
  S = st2;
  const zd = zastData();
  const candIds = zd.fall.map(f => f.candidates.map(t => t.id)).flat();
  T("G4: zastępstwa — kandydat na wyjeździe (pn 1) nie jest proponowany, wolny bez wyjazdu jest",
    candIds.indexOf(tFree.id) >= 0 && candIds.indexOf(tTrip.id) < 0);
  zastDay = null; zastAbsent = {};
}

/* ==================== H. normalize + roundtrip ==================== */
{
  const st = fresh();
  st.trips = [
    { id: "e1", label: "OK", teacherIds: ["t1"], classIds: ["c1"], slots: [0, 1] },
    { id: "e2", label: "Złe sloty", teacherIds: [], classIds: [], slots: ["3", 999, -1, 2.5] },
    null, { id: null, label: null }
  ];
  delete st.trips[2]; /* dziura w tablicy — forEach pominie ten indeks */
  const p2 = normalize(st);
  T("H1: normalize tworzy p.trips, czyści nieprawidłowe sloty i domyśla się pól",
    Array.isArray(p2.trips) && p2.trips.length >= 2
    && p2.trips[0].slots.join() === "0,1"
    && p2.trips[1].slots.length === 0
    && p2.trips[3].id != null && p2.trips[3].label != null);
  const t1 = mkT(st, "Anna Testowa");
  t1.unavail = [0, 1]; t1.unavailWhy = { 0: "Awizacja", 2: "Wiszący powód bez slotu", 5: "Inny" };
  const p3 = normalize(st);
  T("H2: normalize czyści unavailWhy bez aktywnego slotu (wiszący „powód bez slotu” znika)",
    p3.teachers[0].unavailWhy["0"] === "Awizacja" && p3.teachers[0].unavailWhy[1] == null
    && p3.teachers[0].unavailWhy[2] === undefined && Object.keys(p3.teachers[0].unavailWhy).join() === "0");
  /* H3: roundtrip przez localStorage — wyjazdy i powody przetrwają zapis/odczyt */
  const st2 = fresh();
  const t2 = mkT(st2, "Jan Próbny"), c2 = mkC(st2, "2b");
  mkA(st2, "a1", c2, t2, "Geografia", 1);
  st2.placement["a1-0"] = 10;
  st2.trips.push({ id: "e1", label: "Kino", teacherIds: [t2.id], classIds: [c2.id], slots: [8] });
  t2.unavailWhy[0] = "Awizacja"; t2.unavail.push(0);
  S = st2; save();
  const r = JSON.parse(localStorage.getItem(LS));
  T("H3: roundtrip localStorage — trips, unavailWhy i placement przetrwają zapis/odczyt",
    r.trips.length === 1 && r.trips[0].label === "Kino" && r.trips[0].slots.join() === "8"
    && r.teachers[0].unavailWhy["0"] === "Awizacja" && r.placement["a1-0"] === 10);
  T("H4: stopka „Wersja 6.4x.” obecna w html apki (wersjo-odporne, ≥6.42)",
    /Wersja 6\.\d+\./.test(html));
}

/* ==================== WYNIK ==================== */
console.log("WSZYSTKIE TESTY v6.42-busy ZAKOŃCZONE");
console.log("WYNIK v6.42-busy: " + pass + " OK, " + fail + " FAIL  (razem " + (pass + fail) + ")");
if (fail) { console.log("Nieudane:"); fails.forEach(f => console.log("  -", f)); process.exit(1); }
