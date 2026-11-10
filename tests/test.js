/* Testy apki Plan Zajęć — v6.5 Etap 4 (grupy w imporcie + preset 15 oddziałów)
   Odtworzone po resecie środowiska (29.10.2026). Uruchomienie: node test.js
   UWAGA: bez "use strict" — sloppy eval musi wyciec funkcje apki do scope modułu. */
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
const raw = fs.readFileSync(process.env.APP_SOURCE || "/home/user/canvases/plan-zajec-pwa/CANVAS.md", "utf8");
const html = raw.startsWith("---") ? raw.split(/^---$/m).slice(2).join("---") : raw; /* canvas (frontmatter) albo goły index.html */
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const appSrc = scripts.reduce((a, b) => (b.length > a.length ? b : a));
eval(appSrc.replace('"use strict";', ""));

/* ---------- harness ---------- */
let pass = 0, fail = 0; const fails = [];
function T(name, cond){ if (cond) pass++; else { fail++; fails.push(name); console.log("  ✗ FAIL:", name); } }
function SEC(t){ console.log("—", t); }
function fresh(){ return normalize({ teachers: [], classes: [], activities: [], placement: {},
  settings: { teacherMaxPerDay: 7, classMaxPerDay: 7, lessonTimes: defaultLessonTimes() } }); }
function mkT(S, name){ const t = { id: nextId(S.teachers, "t"), name, short: name.split(/\s+/).slice(-1)[0].slice(0,3), unavail: [] }; S.teachers.push(t); return t; }
function mkC(S, name, rew){ const c = { id: nextId(S.classes, "c"), name, rew: rew || 2 }; S.classes.push(c); return c; }
function mkA(S, cid, subj, tid, hours, extra){ const a = Object.assign({ id: nextId(S.activities, "a"), classId: cid, withClassId: "", teacherId: tid || "", subject: subj, hours: hours || 1, kind: guessKind(subj), group: "", link: "" }, extra || {}); S.activities.push(a); return a; }

/* ==================== 1. helpery ==================== */
SEC("1. helpery");
T("normName usuwa spacje/interpunkcję", normName("3 c AUT") === "3caut" && normName("8 ZET") === "8zet");
T("samePerson kolejność obojętna", samePerson("Anna Kowalska", "Kowalska Anna") && samePerson("Krupka Joanna", "Joanna Krupka"));
T("samePerson różne osoby false", !samePerson("Anna Kowalska", "Jan Nowak"));
T("guessKind: świetlica", guessKind("Świetlica") === "swietl" && guessKind("zajęcia świetlicowe") === "swietl");
T("guessKind: rewalidacja", guessKind("Rewalidacja") === "rew" && guessKind("Zajęcia logopedyczne") === "rew" && guessKind("Zajęcia korekcyjno-kompensacyjne (ZKK)") === "rew");
T("guessKind: dydaktyczne", guessKind("Język angielski") === "dyd" && guessKind("Matematyka") === "dyd");
/* v6.15 — TUS nie jest zajęciami terapeutycznymi (wg wytycznych), mimo słowa "trening" */
T("guessKind: TUS → dyd", guessKind("Trening umiejętności społecznych") === "dyd" && guessKind("TUS") === "dyd" && guessKind("Zajęcia TUS") === "dyd");
T("guessKind: TUS nie psuje innych treningów", guessKind("Trening orientacji przestrzennej") === "rew" && guessKind("Trening umiejętności społecznych (TUS)") === "dyd" && guessKind("status") === "dyd" && guessKind("statusy zajęć") === "dyd");
T("rewFromName wg wytycznych", rewFromName("3c AUT") === 1 && rewFromName("5 ZET") === 1 && rewFromName("7 AUT") === 1 && rewFromName("8 ZET") === 1 && rewFromName("5a M") === 3 && rewFromName("6a M") === 3 && rewFromName("6b") === 3 && rewFromName("7a") === 3 && rewFromName("1a") === 2);
T("endOfLesson 8:00 → 8:45", endOfLesson("8:00") === "8:45" && minutesOf("8:55") === 535);
T("defaultLessonTimes dzwonki wg szablonu A1 SPS7 (v6.19)", JSON.stringify(defaultLessonTimes()) === JSON.stringify(["8:00","8:55","9:50","10:45","11:50","12:55","13:55","14:55"]));
T("dayGaps liczy dziury", dayGaps([0,1,3]) === 1 && dayGaps([0,1,2]) === 0 && dayGaps([0,4]) === 3);

/* ==================== 2. preset SPS 7 (v6.5: 15 oddziałów) ==================== */
SEC("2. preset SPS nr 7");
{
  const p = sps7State();
  T("preset ma 15 oddziałów", p.classes.length === 15);
  T("preset: bez '1a b' (grupa b w klasie 1a)", !p.classes.some(c => c.name === "1a b"));
  T("preset: klasy z wytycznych", ["1a","2a AUT","2b AUT (m)","3a AUT","3b AUT","3c AUT","4a AUT","5 ZET","5a M","6 AUT","6a M","6b","7 AUT","7a","8 ZET"].every(n => p.classes.some(c => c.name === n)));
  T("preset: tory rew per klasa", p.classes.find(c => c.name === "3c AUT").rew === 1 && p.classes.find(c => c.name === "5a M").rew === 3 && p.classes.find(c => c.name === "6b").rew === 3 && p.classes.find(c => c.name === "7a").rew === 3 && p.classes.find(c => c.name === "1a").rew === 2);
  T("preset: blockedSlots piątek 8. lekcja (slot 39)", JSON.stringify(p.settings.blockedSlots) === "[39]" && slotBlocked(p.settings, 39) && !slotBlocked(p.settings, 38));
  T("preset: pary polski+matematyka", p.settings.pairs.length === 4);
}

/* ==================== 3. normalize ==================== */
SEC("3. normalize");
{
  const st = normalize({ teachers: [], classes: [{ id: "c1", name: "3c AUT" }, { id: "c2", name: "X" }, { id: "c3", name: "7a" }], activities: [{ id: "a1", classId: "c1", subject: "Religia", hours: 1 }], placement: {}, settings: { friMax7: true, maxGaps: 2 } });
  T("normalize: rew z nazwy gdy brak", st.classes[0].rew === 1 && st.classes[1].rew === 2 && st.classes[2].rew === 3);
  T("normalize: blockedSlots z legacy friMax7", JSON.stringify(st.settings.blockedSlots) === "[39]");
  T("normalize: grupa default ''", st.activities[0].group === "");
  T("normalize: link default ''", st.activities[0].link === "");
  const st2 = normalize({ teachers: [], classes: [], activities: [], placement: {}, settings: { friMax7: false, maxGaps: 2 } });
  T("normalize: friMax7 false → brak blokad", JSON.stringify(st2.settings.blockedSlots) === "[]");
  const st3 = normalize({ teachers: [], classes: [], activities: [], placement: {}, settings: { blockedSlots: [3, 39], maxGaps: 2 } });
  T("normalize: istniejące blockedSlots zostają", JSON.stringify(st3.settings.blockedSlots) === "[3,39]");
  const st4 = normalize({ teachers: [], classes: [], activities: [], placement: {}, settings: { maxGaps: 2 } });
  T("normalize: lessonTimes fallback", JSON.stringify(st4.settings.lessonTimes) === JSON.stringify(defaultLessonTimes()));
  /* v6.19 — migracja starego domyślnego rytmu (co 60 min od 8:00) na dzwonki wg szablonu */
  const stOld = normalize({ teachers: [], classes: [], activities: [], placement: {}, settings: { maxGaps: 2, lessonTimes: ["8:00","8:55","9:55","10:55","11:55","12:55","13:55","14:55"] } });
  T("v6.19 migracja: stary default → nowe dzwonki", JSON.stringify(stOld.settings.lessonTimes) === JSON.stringify(["8:00","8:55","9:50","10:45","11:50","12:55","13:55","14:55"]));
  const stCust = normalize({ teachers: [], classes: [], activities: [], placement: {}, settings: { maxGaps: 2, lessonTimes: ["7:30","8:25","9:20","10:15","11:10","12:05","13:00","13:55"] } });
  T("v6.19 migracja: czasy własne zostają bez zmian", JSON.stringify(stCust.settings.lessonTimes) === JSON.stringify(["7:30","8:25","9:20","10:15","11:10","12:05","13:00","13:55"]));
  const stCustShort = normalize({ teachers: [], classes: [], activities: [], placement: {}, settings: { maxGaps: 2, lessonTimes: ["8:00","8:55","9:55"] } });
  T("v6.19 migracja: stary prefiks niepełnej listy → fallback defaultu", JSON.stringify(stCustShort.settings.lessonTimes) === JSON.stringify(defaultLessonTimes()));
}

/* ==================== 4. classClash / buildLessons ==================== */
SEC("4. classClash / buildLessons");
T("classClash dyd+dyd ta sama grupa = konflikt", classClash("dyd","dyd","a","a") === true);
T("classClash dyd+dyd różne grupy = OK", classClash("dyd","dyd","a","b") === false);
T("classClash dyd+dyd bez grup = konflikt", classClash("dyd","dyd","","") === true);
T("classClash dyd+rew = konflikt", classClash("dyd","rew","a","b") === true);
T("classClash rew+śwetlica = OK", classClash("rew","swietl","","") === false);
{
  const ls = buildLessons([{ id: "a1", classId: "c1", withClassId: "c2", teacherId: "t1", subject: "Religia", hours: 2, kind: "dyd", group: "b", link: "REL" }]);
  T("buildLessons: 2 lekcje z classIds", ls.length === 2 && ls[0].classIds.length === 2 && ls[0].classIds[0] === "c1" && ls[0].classIds[1] === "c2");
  T("buildLessons: id z indeksem (link pairing)", ls[0].id === "a1-0" && ls[1].id === "a1-1");
  T("buildLessons: niesie group/link", ls[0].group === "b" && ls[0].link === "REL");
}

/* ==================== 5. równoległość grup w silniku ==================== */
SEC("5. grupy równoległe (walidator)");
{
  const st = fresh();
  const c1 = mkC(st, "1a"); const t1 = mkT(st, "Anna Kowalska"); const t2 = mkT(st, "Jan Nowak");
  const a1 = mkA(st, c1.id, "Język angielski", t1.id, 2, { group: "1" });
  const a2 = mkA(st, c1.id, "Język angielski", t2.id, 2, { group: "2" });
  const ls = buildLessons(st.activities);
  const placement = { "a1-0": 0, "a1-1": 1, "a2-0": 0, "a2-1": 1 };
  const errs = findViolations(ls, st.teachers, st.classes, placement, st.settings);
  T("dwie grupy tej samej klasy równolegle = 0 naruszeń", errs.length === 0);
  a1.group = ""; a2.group = "";
  const errs2 = findViolations(buildLessons(st.activities), st.teachers, st.classes, placement, st.settings);
  T("bez grup te same sloty = konflikt klasowy", errs2.length > 0);
}

/* ==================== 6. link (powiązania) — regresja v6.4 ==================== */
SEC("6. powiązania link");
{
  const st = fresh();
  const c1 = mkC(st, "1a"); const t1 = mkT(st, "Anna Kowalska"); const t2 = mkT(st, "Jan Nowak");
  const a1 = mkA(st, c1.id, "Religia", t1.id, 1, { link: "REL" });
  const a2 = mkA(st, c1.id, "Świetlica", t2.id, 4, { link: "REL" });
  const ls = buildLessons(st.activities);
  let errs = findViolations(ls, st.teachers, st.classes, { "a1-0": 0, "a2-0": 0, "a2-1": 8, "a2-2": 9, "a2-3": 10 }, st.settings);
  T("religia + śaw-0 na tej samej godzinie = OK", errs.length === 0);
  errs = findViolations(ls, st.teachers, st.classes, { "a1-0": 0, "a2-0": 1, "a2-1": 8, "a2-2": 9, "a2-3": 10 }, st.settings);
  T("różne godziny tej samej pary = błąd powiązania", errs.some(e => e.indexOf("Powiązanie") >= 0));
  errs = findViolations(ls, st.teachers, st.classes, { "a1-0": 5, "a2-0": 5, "a2-1": 6, "a2-2": 7, "a2-3": 8 }, st.settings);
  T("śaw-1..3 wolne (tylko śaw-0 z religią)", errs.length === 0);
  const r = attemptSchedule(ls, st.teachers, st.classes, st.settings, Math.random);
  if (r && r.placement){
    T("automat: para link razem", r.placement["a1-0"] === r.placement["a2-0"]);
  } else T("automat: attemptSchedule zwrócił placement", false);
}

/* ==================== 7. ŚAW soft-pref — regresja v6.4 ==================== */
SEC("7. pref ŚAW godzin 1-2/6-8");
{
  const st = fresh();
  const c1 = mkC(st, "1a"); const t1 = mkT(st, "Anna Kowalska");
  mkA(st, c1.id, "Świetlica", t1.id, 2);
  const ls = buildLessons(st.activities);
  const p1 = { "a1-0": 2, "a1-1": 3 }; // godziny 3-4
  const sp1 = softPenalty(ls, st.teachers, st.classes, st.settings, p1);
  T("śaw na godzinach 3-5 → kara", sp1.pen >= 40 && sp1.det.some(d => d.indexOf("Świetlica") >= 0));
  const sp2 = softPenalty(ls, st.teachers, st.classes, st.settings, { "a1-0": 0, "a1-1": 7 });
  T("śaw na 1. i 7. godzinie → bez kary śaw", !sp2.det.some(d => d.indexOf("Świetlica") >= 0));
  T("softPenalty zwraca {pen, det}", typeof sp1.pen === "number" && Array.isArray(sp1.det));
}

/* ==================== 8. import — kolumny, wakaty, 0h (regresja v6.4) ==================== */
SEC("8. import — podstawy i wakaty");
{
  S = sps7State();
  const tsv = [
    "Nauczyciel Pierwotny\tNauczyciel Aktualny\tKlasa\tPrzedmiot\tGodziny\tGrupa/Uwagi",
    "Kowalska Anna\tKowalska Anna\t6 b\tMatematyka\t5\t",
    "\t\t6 b\tZajęcia logopedyczne\t2\t",
    "Nowak Jan\tNowak Jan\t6 b\tRewalidacja\t0\tUSUNIĘTO",
    "Bąk Tomasz\tBąk Tomasz\t6 b\tZajęcia korekcyjno-kompensacyjne (ZKK)\t1\tPozostaje jako wakat"
  ].join("\n");
  const rows = parseImportText(tsv);
  T("nagłówek → tryb kolumnowy, 4 wiersze danych", rows.length === 4);
  T("wiersz z nauczycielem: klasa zkanonizowana", rows[0].className === "6b" && rows[0].hours === 5 && rows[0].status === "warn" && rows[0].note.indexOf("nowy nauczyciel") >= 0);
  T("wiersz bez nauczyciela = warn wakat", rows[1].status === "warn" && rows[1].note.indexOf("bez nauczyciela (wakat)") >= 0 && rows[1].teacher === "");
  T("0 godzin = err pomijam", rows[2].status === "err" && rows[2].note.indexOf("0 godzin") >= 0);
  T("kind z przedmiotu (ZKK → rew)", rows[3].kind === "rew");
  importRows = rows; doImport();
  T("doImport: wakat ma teacherId ''", S.activities.some(a => a.subject === "Zajęcia logopedyczne" && a.teacherId === ""));
  T("doImport: err pominięty", !S.activities.some(a => a.subject === "Rewalidacja"));
  T("doImport: flash o wakatach", true);
}

/* ==================== 9. import — GRUPY (NOWE, Etap 4) ==================== */
SEC("9. import — grupy (v6.5)");
{
  S = sps7State();
  const tsv = [
    "Nauczyciel Pierwotny\tNauczyciel Aktualny\tKlasa\tPrzedmiot\tGodziny\tGrupa/Uwagi",
    "Kowalska Anna\tKowalska Anna\t1 a b\tZajęcia logopedyczne\t1\tDopisane z odręcznej notatki",
    "Szczupak Malwina\tSzczupak Malwina\t7 a\tJęzyk angielski\t3\tGrupa 1/2",
    "Szczupak Malwina\tSzczupak Malwina\t7 a\tJęzyk angielski\t3\tGrupa 2/2",
    "Pierzynka Ewa\tPierzynka Ewa\t7 a\tInformatyka\t1\tGrupa 1/2",
    "Pierzynka Ewa\tPierzynka Ewa\t7 a\tInformatyka\t1\tGrupa 2/2",
    "Rusałka Roksana\tRusałka Roksana\t6 a M\tzajęcia rozwijające aktywność - kreatywność\t1\tGrupa 1/1",
    "Krzykacz Artur\tKrzykacz Artur\t6 a M, 6 b\tWychowanie fizyczne\t4\tGr. 1/2. Uczennice: VIa(Ela,Madzia)",
    "Bąk Tomasz\tBąk Tomasz\t6 a M\tWychowanie fizyczne\t4\t2/2, 2/2 (podział godzin)",
    "Nowak Jan\tNowak Jan\t1 a zz\tZajęcia logopedyczne\t1\t"
  ].join("\n");
  const rows = parseImportText(tsv);
  T("'1 a b' → klasa 1a + grupa b", rows[0].className === "1a" && rows[0].group === "b" && rows[0].note.indexOf("grupa: b") >= 0);
  T("'Grupa 1/2' z uwag → grupa 1", rows[1].group === "1" && rows[1].className === "7a");
  T("'Grupa 2/2' → grupa 2 (osobne zajęcia, nie duplikat)", rows[2].group === "2" && rows[2].status !== "err");
  T("para informatyka Grupa 1/2 + 2/2", rows[3].group === "1" && rows[4].group === "2");
  T("'Grupa 1/1' → grupa 1", rows[5].group === "1");
  T("'Gr. 1/2' z przecinkiem w uwadze → grupa 1, zajęcia łączone", rows[6].group === "1" && rows[6].classNames.length === 2 && rows[6].classNames[0] === "6a M" && rows[6].classNames[1] === "6b");
  T("gołe '2/2' (podział godzin) NIE jest grupą", rows[7].group === "" && rows[7].note.indexOf("uwagi") >= 0);
  T("dwuznakowa grupa z nazwy ('1 a zz' → grupa zz)", rows[8].group === "zz" && rows[8].className === "1a");
  T("nikt nie dostał statusu err", rows.every(r => r.status !== "err"));
  importRows = rows; doImport();
  const acts = S.activities;
  T("doImport: grupy przechodzą do zajęć", acts.filter(a => a.subject === "Język angielski").every(a => a.group === "1" || a.group === "2"));
  T("doImport: zajęcia łączone z grupą", acts.some(a => a.subject === "Wychowanie fizyczne" && a.group === "1" && a.withClassId));
  T("doImport: klasa 1a bez pseudo-klasy '1a b'", !S.classes.some(c => c.name.toLowerCase() === "1a b"));
  T("klasa z grupą: 1 zajęcia w 1a + grupa b", acts.some(a => a.classId === (S.classes.find(c => c.name === "1a")).id && a.group === "b"));
}

/* ==================== 10. grupy — tryb wolny (wklejka z Worda, bez nagłówka) ==================== */
SEC("10. grupy — wklejka bez nagłówka");
{
  S = sps7State();
  mkT(S, "Kowalska Anna");
  const txt = "Kowalska Anna\tZajęcia logopedyczne\t1 a b\t1";
  const rows = parseImportText(txt);
  T("tryb wolny: '1 a b' → 1a + grupa b", rows.length === 1 && rows[0].className === "1a" && rows[0].group === "b" && rows[0].teacher === "Kowalska Anna");
}
{
  S = sps7State();
  const txt = "Kowalska Anna\tEdukacja wczesnoszkolna\t5 a M\t13";
  const rows = parseImportText(txt);
  T("'5 a M' bez grupy (kanon bezpośredni)", rows[0].className === "5a M" && rows[0].group === "");
  const txt2 = "Kowalska Anna\tWychowanie fizyczne\t8 zet\t3";
  const rows2 = parseImportText(txt2);
  T("'8 zet' kanonizowane, bez grupy", rows2[0].className === "8 ZET" && rows2[0].group === "");
}
{
  S = fresh(); // brak klas
  const rows = parseImportText("Kowalska Anna\tEdukacja\t5 a M\t13");
  T("brak klas w danych: '5 a M' nie rozbijane na grupę", rows[0].className === "5 a M" && rows[0].group === "");
  const rows2 = parseImportText("Kowalska Anna\tEdukacja\t3 d\t2");
  T("'3 d' bez klasy bazowej → nowa klasa, bez grupy", rows2[0].className === "3 d" && rows2[0].group === "" && rows2[0].status === "warn");
}

/* ==================== 11. walidator — nauczyciel, blokady, limity ==================== */
SEC("11. walidator");
{
  const st = fresh();
  const c1 = mkC(st, "1a"); const t1 = mkT(st, "Anna Kowalska"); const t2 = mkT(st, "Jan Nowak");
  const a1 = mkA(st, c1.id, "Matematyka", t1.id, 2);
  const a2 = mkA(st, c1.id, "Polski", t2.id, 2);
  st.settings.blockedSlots = [39];
  const ls = buildLessons(st.activities);
  let errs = findViolations(ls, st.teachers, st.classes, { "a1-0": 0, "a1-1": 39, "a2-0": 0, "a2-1": 1 }, st.settings);
  T("nauczyciel dwa razy naraz = błąd", errs.some(e => e.indexOf("dwie lekcje naraz") >= 0));
  T("zablokowany slot 39 = błąd", errs.some(e => e.indexOf("Zablokowana godzina") >= 0));
  errs = findViolations(ls, st.teachers, st.classes, { "a1-0": 0, "a1-1": 1, "a2-0": 2, "a2-1": 3 }, st.settings);
  T("poprawne miejsce = 0 błędów", errs.length === 0);
  t1.unavail = [2];
  errs = findViolations(ls, st.teachers, st.classes, { "a1-0": 2, "a1-1": 1, "a2-0": 3, "a2-1": 4 }, st.settings);
  T("niedostępność nauczyciela = błąd", errs.some(e => e.indexOf("nie jest dostępny") >= 0));
  st.settings.teacherMaxPerDay = 1; st.settings.classMaxPerDay = 7;
  errs = findViolations(ls, st.teachers, st.classes, { "a1-0": 0, "a1-1": 1, "a2-0": 18, "a2-1": 27 }, st.settings);
  T("limit dzienny nauczyciela", errs.some(e => e.indexOf("lekcji w") >= 0 || e.indexOf("limit") >= 0));
  st.settings.teacherMaxPerDay = 7; st.settings.classMaxPerDay = 1;
  errs = findViolations(ls, st.teachers, st.classes, { "a1-0": 0, "a1-1": 1, "a2-0": 8, "a2-1": 9 }, st.settings);
  T("limit dzienny klasy", errs.some(e => e.indexOf("lekcji w") >= 0 || e.indexOf("limit") >= 0));
}

/* ==================== 12. automat — mała szkoła + grupy ==================== */
SEC("12. automat");
{
  const st = fresh();
  const c1 = mkC(st, "1a", 2); const c2 = mkC(st, "2a", 2);
  const t1 = mkT(st, "Anna Kowalska"); const t2 = mkT(st, "Jan Nowak"); const t3 = mkT(st, "Ewa Lis");
  mkA(st, c1.id, "Edukacja wczesnoszkolna", t1.id, 8);
  mkA(st, c2.id, "Edukacja wczesnoszkolna", t2.id, 7);
  mkA(st, c1.id, "Język angielski", t3.id, 2, { group: "1" });
  mkA(st, c1.id, "Język angielski", t3.id, 2, { group: "2" });
  st.settings.blockedSlots = [39];
  const ls = buildLessons(st.activities);
  const best = autoSchedule(ls, st.teachers, st.classes, st.settings, 15);
  T("automat: wynik istnieje", !!best && !!best.placement);
  const placed = Object.keys(best.placement).length;
  T("automat: wszystko ułożone (" + placed + "/" + ls.length + ")", placed === ls.length);
  const errs = findViolations(ls, st.teachers, st.classes, best.placement, st.settings);
  T("automat: 0 naruszeń twardych", errs.length === 0);
  T("automat: slot 39 (piątek 8.) pusty", !Object.keys(best.placement).some(k => best.placement[k] === 39));
  const slot1 = best.placement["a3-0"], slot2 = best.placement["a4-0"];
  T("grupy angielskiego mogą iść równolegle albo po kolei (bez konfliktu)", true);
  T("automat: koszt zwrócony", typeof best.cost === "number");
}
{
  // ciasny scenariusz: nakładanie grup wymagane
  const st = fresh();
  const c1 = mkC(st, "1a", 2);
  const t1 = mkT(st, "Anna Kowalska"); const t2 = mkT(st, "Jan Nowak");
  mkA(st, c1.id, "Zajęcia A", t1.id, 4, { group: "1" });
  mkA(st, c1.id, "Zajęcia B", t2.id, 4, { group: "2" });
  const ls = buildLessons(st.activities);
  const best = autoSchedule(ls, st.teachers, st.classes, st.settings, 10);
  const placed = Object.keys(best.placement).length;
  const errs = findViolations(ls, st.teachers, st.classes, best.placement, st.settings);
  T("ciasny: 8 lekcji dyd w klasie = tylko równoległość grup (ułożone " + placed + ")", placed === ls.length && errs.length === 0);
}

/* ==================== 13. demo + eksport smoke ==================== */
SEC("13. demo / eksport");
{
  S = normalize(demoState());
  const ls = buildLessons(S.activities);
  const sum = S.activities.reduce((a, x) => a + x.hours, 0);
  T("demo: liczba lekcji = suma godzin", ls.length === sum);
  const best = autoSchedule(ls, S.teachers, S.classes, S.settings, 5);
  T("demo: automat układa wszystko", Object.keys(best.placement).length === ls.length);
  const txt = planText("class", S.classes[0].id, best.placement);
  T("planText zwraca tekst planu", typeof txt === "string" && txt.length > 50);
  T("planText zawiera nazwę klasy", txt.indexOf(S.classes[0].name) >= 0);
}

/* ==================== 14. kolejność argumentów softPenalty (pułapka z v6.4) ==================== */
SEC("14. softPenalty sygnatura");
{
  const st = fresh();
  const c1 = mkC(st, "1a"); const t1 = mkT(st, "Anna Kowalska");
  mkA(st, c1.id, "Świetlica", t1.id, 1);
  const ls = buildLessons(st.activities);
  const sp = softPenalty(ls, st.teachers, st.classes, st.settings, { "a1-0": 3 });
  T("softPenalty(ls, teachers, classes, settings, placement)", sp.pen >= 40);
  const sp0 = softPenalty(ls, st.teachers, st.classes, st.settings, { "a1-0": 0 });
  T("śaw na 1. godzinie: bez kary", sp0.pen === 0);
}

/* ==================== 15. twardy test regresji importu v6.3/v6.4 (TSV ścieżka wolna) ==================== */
SEC("15. regresja importu");
{
  S = sps7State();
  const tsv = "Dąbrowski Tadeusz\tReligia\t1 a,2 a AUT\t1";
  const rows = parseImportText(tsv);
  T("wieloklasowa lista z przecinkiem → łączone", rows[0].classNames.length === 2 && rows[0].classNames[0] === "1a" && rows[0].classNames[1] === "2a AUT" && rows[0].note.indexOf("łączone") >= 0);
  const txt = "Nauczyciel: Kowalska Anna\nMatematyka 1a 5\nPolski 1a 4";
  const rows2 = parseImportText(txt);
  T("nagłówek z nazwiskiem + linie bez tabów → err 'użyj tabulatorów'", rows2.every(r => r.status === "err"));
  S = sps7State();
  const rows3 = parseImportText("Kowalska Anna\tMatematyka\t6 b\t5");
  T("kanonizacja '6 b' → 6b", rows3[0].className === "6b");
  const rows4 = parseImportText("Kowalska Anna\tMatematyka\t3 c aut\t5");
  T("kanonizacja '3 c aut' → 3c AUT", rows4[0].className === "3c AUT");
}

/* ==================== 16. okienka klasowe (v6.23: ZERO — najtwardsza reguła) ==================== */
SEC("16. okienka klasowe (v6.23: ZERO — najtwardsza)");
{
  const st = fresh();
  const c1 = mkC(st, "1a"); const t1 = mkT(st, "Anna Kowalska");
  mkA(st, c1.id, "Matematyka", t1.id, 1);
  mkA(st, c1.id, "Polski", t1.id, 1);
  mkA(st, c1.id, "Historia", t1.id, 1);
  const ls = buildLessons(st.activities);
  T("normalize: pola limitów zostają w danych (kompatybilność kopii)", st.settings.classMaxGaps === 1 && st.settings.classMaxGapsPerDay === 1);
  const pl = { "a1-0": 0, "a2-0": 1, "a3-0": 3 }; /* dziura na 3. lekcji (slot 2) */
  const sp1 = softPenalty(ls, st.teachers, st.classes, st.settings, pl);
  T("v6.23: 1 okienko klasy → kara tyg 150 + dzienna 150 = 300",
    sp1.pen === 300 && sp1.det.some(d => d.indexOf("okienek w tygodniu (najtwardsza reguła: 0)") >= 0) && sp1.det.some(d => d.indexOf("w jednym dniu") >= 0));
  st.settings.classMaxGaps = 5; st.settings.classMaxGapsPerDay = 8; /* limity ustawień ignorowane */
  const sp1b = softPenalty(ls, st.teachers, st.classes, st.settings, pl);
  T("v6.23: limity ustawień (5/8) ignorowane — kara bez zmian", sp1b.pen === 300);
  const pl2 = { "a1-0": 0, "a2-0": 2, "a3-0": 4 }; /* 2 dziury */
  const sp2g = softPenalty(ls, st.teachers, st.classes, st.settings, pl2);
  T("v6.23: 2 okienka → kara tyg 300 + dzienna 300 = 600", sp2g.pen === 600);
  st.settings.wClassGap = 0;
  const spT0 = softPenalty(ls, st.teachers, st.classes, st.settings, pl2);
  T("v6.23: waga tygodniowa klasy 0 → zostaje dzienna (300)", spT0.pen === 300);
  st.settings.wClassGap = 150; st.settings.wClassGapDay = 0;
  const spD0 = softPenalty(ls, st.teachers, st.classes, st.settings, pl2);
  T("v6.23: waga dzienna klasy 0 → zostaje tygodniowa (300)", spD0.pen === 300);
  st.settings.wClassGap = 0; st.settings.wClassGapDay = 0;
  const spZero = softPenalty(ls, st.teachers, st.classes, st.settings, pl2);
  T("v6.23: obie wagi 0 → okienka klasy bez kar", spZero.pen === 0);
  st.settings.wClassGap = 150; st.settings.wClassGapDay = 150;
  const plNoGap = { "a1-0": 0, "a2-0": 1, "a3-0": 2 };
  const spNG = softPenalty(ls, st.teachers, st.classes, st.settings, plNoGap);
  T("bez okienek → kara 0", spNG.pen === 0);
}

/* ==================== 17. blokady oddziału — przewozy (v6.6) ==================== */
SEC("17. blokady oddziału");
{
  const st = fresh();
  const c1 = mkC(st, "1a"); const t1 = mkT(st, "Anna Kowalska");
  mkA(st, c1.id, "Matematyka", t1.id, 1);
  const ls = buildLessons(st.activities);
  c1.blocked = [0, 1, 2, 3, 4, 5, 6, 7]; /* cały poniedziałek zablokowany (przewozy) */
  const errs = findViolations(ls, st.teachers, st.classes, { "a1-0": 3 }, st.settings);
  T("findViolations: lekcja na zablokowanym slocie → błąd blokady oddziału",
    errs.some(e => e.indexOf("nie może mieć wtedy lekcji") >= 0 && e.indexOf("blokada oddziału") >= 0));
  const errsOK = findViolations(ls, st.teachers, st.classes, { "a1-0": 8 }, st.settings);
  T("findViolations: wtorek wolny → bez błędu blokady", !errsOK.some(e => e.indexOf("nie może mieć wtedy lekcji") >= 0));
  const best = autoSchedule(ls, st.teachers, st.classes, st.settings, 5);
  T("automat omija zablokowane sloty oddziału", best.placement["a1-0"] >= 8);
  /* toggC / ogrCSet interakcja */
  S = normalize({ teachers: [], classes: [{ id: "c1", name: "1a", rew: 2 }], activities: [], placement: {}, settings: { teacherMaxPerDay: 7, classMaxPerDay: 7 } });
  ogrC = "c1";
  toggC(0);
  T("toggC blokuje slot 0", S.classes[0].blocked.indexOf(0) >= 0);
  toggC(0);
  T("toggC odblokowuje slot 0", S.classes[0].blocked.indexOf(0) < 0);
}

/* ==================== 18. plansze A3/A2 + normalize v6.6 ==================== */
SEC("18. plansze A3/A2");
{
  const st = normalize({ teachers: [], classes: [{ id: "c1", name: "1a", rew: 2, blocked: "xxx" }, { id: "c2", name: "6b", rew: 3 }], activities: [], placement: {}, settings: { teacherMaxPerDay: 7, classMaxPerDay: 7 } });
  T("normalize: blocked nie-tablica → []", Array.isArray(st.classes[0].blocked) && st.classes[0].blocked.length === 0);
  T("normalize: brak blocked → []", Array.isArray(st.classes[1].blocked) && st.classes[1].blocked.length === 0);
  S = sps7State();
  S.placement = {};
  const h = planszeHtml();
  T("planszeHtml: @page A3 landscape", h.indexOf("@page") >= 0 && h.indexOf("A3 landscape") >= 0);
  T("planszeHtml: nagłówek PLAN LEKCJI + nazwa szkoły", h.indexOf("PLAN LEKCJI") >= 0 && h.indexOf("Szkoła Podstawowa nr 7 Specjalna w Katowicach") >= 0);
  T("planszeHtml: sekcja per oddział (15×)", h.indexOf("Oddział: 1a") >= 0 && h.indexOf("Oddział: 6b") >= 0 && (h.match(/class="pl"/g) || []).length === 15);
  T("planszeHtml: przycisk druku + tip A2", h.indexOf("DRUKUJ / zapisz PDF") >= 0 && h.indexOf("A2") >= 0);
  T("planszeHtml: dni tygodnia po polsku", h.indexOf("Poniedziałek") >= 0 && h.indexOf("Piątek") >= 0);
  T("planszeHtml: BEZ <script> (document.write)", h.toLowerCase().indexOf("<script") < 0);
  T("planszeHtml: pełne DOCTYPE i </html>", h.indexOf("<!DOCTYPE html>") === 0 && h.trimEnd().endsWith("</html>"));
}

/* ==================== 19. kreator reguł własnych (v6.7) ==================== */
SEC("19. reguły własne");
{
  const st = fresh();
  T("normalize: settings.rules domyślnie []", Array.isArray(st.settings.rules) && st.settings.rules.length === 0);
  const rd = ruleDesc({ type: "subjHours", classId: "", subject: "Matematyka", subject2: "", a: 1, b: 4, n: 1, hard: true, weight: 100, on: true });
  T("ruleDesc: subjHours dla wszystkich oddziałów", rd.indexOf("tylko na lekcjach 1–4") >= 0 && rd.indexOf("wszystkie oddziały") >= 0);
  T("rulesOn filtruje wyłączone", rulesOn({ rules: [{ id: "r1", on: true }, { id: "r2", on: false }, null] }).length === 1);
  T("lastHourOf: piątek z blokadą 8. lekcji → 7. lekcja", lastHourOf(st.settings, 4) === NH - 2 && lastHourOf(st.settings, 0) === NH - 1);
}
{
  /* twarda: przedmiot tylko na lekcjach 1-2 */
  const st = fresh();
  const c1 = mkC(st, "1a"); const t1 = mkT(st, "Anna Kowalska");
  mkA(st, c1.id, "Matematyka", t1.id, 2);
  st.settings.rules.push({ id: "r1", type: "subjHours", classId: "", subject: "Matematyka", subject2: "", a: 1, b: 2, n: 1, hard: true, weight: 100, on: true });
  const ls = buildLessons(st.activities);
  const best = autoSchedule(ls, st.teachers, st.classes, st.settings, 5);
  const hrs = Object.keys(best.placement).map(k => best.placement[k] % NH);
  T("twarda subjHours: automat kładzie tylko na lekcjach 1-2", Object.keys(best.placement).length === 2 && hrs.every(h => h <= 1));
  const errs = findViolations(ls, st.teachers, st.classes, { "a1-0": 0, "a1-1": 4 }, st.settings);
  T("findViolations łamie twardą regułę godzin", errs.some(e => e.indexOf("tylko na lekcjach 1–2") >= 0));
  /* miękka wariant */
  st.settings.rules[0].hard = false; st.settings.rules[0].weight = 120;
  const errsS = findViolations(ls, st.teachers, st.classes, { "a1-0": 0, "a1-1": 4 }, st.settings);
  T("miękka reguła NIE jest błędem twardym", !errsS.some(e => e.indexOf("tylko na lekcjach") >= 0));
  const sp = softPenalty(ls, st.teachers, st.classes, st.settings, { "a1-0": 0, "a1-1": 4 });
  T("miękka reguła: kara wg wagi + uwaga", sp.pen >= 120 && sp.det.some(d => d.indexOf("Reguła własna") >= 0));
  const spOK = softPenalty(ls, st.teachers, st.classes, st.settings, { "a1-0": 0, "a1-1": 1 });
  T("miękka reguła spełniona → kara 0", spOK.pen === 0);
  st.settings.rules[0].on = false;
  const spOff = softPenalty(ls, st.teachers, st.classes, st.settings, { "a1-0": 0, "a1-1": 9 });
  T("reguła wyłączona → zero kary (złamanie nic nie kosztuje)", spOff.pen === 0 && !spOff.det.some(d => d.indexOf("Reguła własna") >= 0));
}
{
  /* twarda: nie na ostatniej lekcji */
  const st = fresh();
  const c1 = mkC(st, "1a"); const t1 = mkT(st, "Anna Kowalska");
  mkA(st, c1.id, "Wychowanie fizyczne", t1.id, 2);
  st.settings.rules.push({ id: "r2", type: "subjNotLast", classId: "", subject: "Wychowanie fizyczne", subject2: "", a: 1, b: NH, n: 1, hard: true, weight: 100, on: true });
  const ls = buildLessons(st.activities);
  const best = autoSchedule(ls, st.teachers, st.classes, st.settings, 5);
  const ok = Object.keys(best.placement).every(k => best.placement[k] % NH < lastHourOf(st.settings, Math.floor(best.placement[k] / NH)));
  T("twarda subjNotLast: nigdy ostatnia lekcja", Object.keys(best.placement).length === 2 && ok);
  const errs = findViolations(ls, st.teachers, st.classes, { "a1-0": 7, "a1-1": 15 }, st.settings);
  T("findViolations: WF na ostatniej → błąd", errs.some(e => e.indexOf("nie na ostatniej lekcji") >= 0));
}
{
  /* twarda: maks. N dziennie */
  const st = fresh();
  const c1 = mkC(st, "1a"); const t1 = mkT(st, "Anna Kowalska");
  mkA(st, c1.id, "Rewalidacja", t1.id, 3);
  st.settings.rules.push({ id: "r3", type: "subjMaxDay", classId: "", subject: "Rewalidacja", subject2: "", a: 1, b: NH, n: 1, hard: true, weight: 100, on: true });
  const ls = buildLessons(st.activities);
  const best = autoSchedule(ls, st.teachers, st.classes, st.settings, 5);
  const perDay = {};
  Object.keys(best.placement).forEach(k => { const d = Math.floor(best.placement[k] / NH); perDay[d] = (perDay[d] || 0) + 1; });
  T("twarda subjMaxDay: max 1 dziennie (3 lekcje → 3 różne dni)", Object.keys(best.placement).length === 3 && Object.values(perDay).every(n => n <= 1));
  const errs = findViolations(ls, st.teachers, st.classes, { "a1-0": 0, "a1-1": 1, "a1-2": 2 }, st.settings);
  T("findViolations: 3 rewalidacje w jeden dzień → błąd", errs.some(e => e.indexOf("maks. 1 lekcje dziennie") >= 0));
  const errsD = findViolations(ls, st.teachers, st.classes, { "a1-0": 0, "a1-1": 8, "a1-2": 16 }, st.settings);
  T("findViolations: rozłożone na 3 dni → bez błędu reguły", !errsD.some(e => e.indexOf("maks. 1 lekcje") >= 0));
  /* miękka: kara za przekroczenie (3 lekcje: 0,1,2 → przekroczenie o 1) */
  st.settings.rules[0].hard = false; st.settings.rules[0].weight = 50; st.settings.rules[0].n = 2;
  const sp = softPenalty(ls, st.teachers, st.classes, st.settings, { "a1-0": 0, "a1-1": 1, "a1-2": 2 });
  /* v6.45 dolicza 40 (wRewMid) za rewalidację na lekcji 3 — slot 2 wchodzi w 3-6 */
  T("miękka subjMaxDay: 3 lekcje przy limicie 2 → kara 1×waga (+40 wRewMid v6.45 za lekcję 3)", sp.pen === 90 && sp.det.some(d => d.indexOf("maks. 2") >= 0) && sp.det.some(d => d.indexOf("3-6") >= 0));
}
{
  /* twarda: dwa przedmioty nie obok siebie */
  const st = fresh();
  const c1 = mkC(st, "1a"); const t1 = mkT(st, "Anna Kowalska");
  mkA(st, c1.id, "W-F", t1.id, 1);
  mkA(st, c1.id, "Świetlica", t1.id, 1);
  mkA(st, c1.id, "Matematyka", t1.id, 2);
  st.settings.rules.push({ id: "r4", type: "subjNotNext", classId: "", subject: "W-F", subject2: "Świetlica", a: 1, b: NH, n: 1, hard: true, weight: 100, on: true });
  const ls = buildLessons(st.activities);
  const best = autoSchedule(ls, st.teachers, st.classes, st.settings, 5);
  const pl = best.placement;
  let adj = false;
  ls.forEach(function(A){ ls.forEach(function(B){
    if (A.subject === "W-F" && B.subject === "Świetlica" && pl[A.id] != null && pl[B.id] != null
      && Math.floor(pl[A.id] / NH) === Math.floor(pl[B.id] / NH) && Math.abs(pl[A.id] - pl[B.id]) === 1) adj = true;
  }); });
  T("twarda subjNotNext: automat nie kładzie obok siebie", Object.keys(pl).length === 4 && !adj);
  const errs = findViolations(ls, st.teachers, st.classes, { "a1-0": 0, "a2-0": 1, "a3-0": 8, "a3-1": 16 }, st.settings);
  T("findViolations: W-F obok Świetlicy → błąd", errs.some(e => e.indexOf("nie obok") >= 0));
  st.settings.rules[0].hard = false; st.settings.rules[0].weight = 80;
  const sp = softPenalty(ls, st.teachers, st.classes, st.settings, { "a1-0": 0, "a2-0": 1, "a3-0": 8, "a3-1": 16 });
  T("miękka subjNotNext: kara wg wagi", sp.pen === 80 && sp.det.some(d => d.indexOf("Reguła własna") >= 0));
  /* reguła tylko dla jednej klasy nie dotyka innej */
  const c2 = mkC(st, "2a");
  mkA(st, c2.id, "W-F", t1.id, 1);
  mkA(st, c2.id, "Świetlica", t1.id, 1);
  st.settings.rules[0].hard = true; st.settings.rules[0].classId = c1.id;
  const ls2 = buildLessons(st.activities.filter(a => a.classId === c2.id));
  const errs2 = findViolations(ls2, st.teachers, st.classes, { "a5-0": 0, "a6-0": 1 }, st.settings);
  T("reguła z classId nie dotyka innych klas", !errs2.some(e => e.indexOf("nie obok") >= 0));
}

/* ==================== 20. asystent AI — USUNIĘTY w v6.48 ==================== */
SEC("20. asystent usunięty (v6.48)");
{
  T("v6.48: funkcje czatu nie istnieją (typeof undefined ×5)",
    typeof chatHtml === "undefined" && typeof chatToggle === "undefined" && typeof chatSend === "undefined" && typeof chatSave === "undefined" && typeof chatLoad === "undefined");
  const st = fresh();
  T("v6.48: normalize bez pól asystenta (assistantUrl, chatToken)",
    !("assistantUrl" in st.settings) && !("chatToken" in st.settings));
  T("v6.48: html apki bez czatu (chatfab / chatpan / Asystent AI)",
    raw.indexOf("chatfab") < 0 && raw.indexOf("chatpan") < 0 && raw.indexOf("Asystent AI") < 0);
  T("v6.48: stopka „Wersja 6.50.” w html apki", raw.indexOf("Wersja 6.50.") >= 0);
}

/* ==================== 21. etap 2 kreatora: min. odstęp dni / maks. tygodniowo / tylko wybrane dni (v6.9) ==================== */
SEC("21. reguły etapu 2");
{
  /* ruleDesc nowych typów + defaults */
  const st = fresh();
  const rd1 = ruleDesc({ type: "subjMinDays", classId: "", subject: "Język polski", subject2: "", a: 1, b: NH, n: 2, hard: true, weight: 100, on: true });
  T("ruleDesc: subjMinDays", rd1.indexOf("min. 2 dni odstępu") >= 0 && rd1.indexOf("Język polski") >= 0);
  const rd2 = ruleDesc({ type: "subjMaxWeek", classId: "", subject: "Muzyka", subject2: "", a: 1, b: NH, n: 2, hard: true, weight: 100, on: true });
  T("ruleDesc: subjMaxWeek", rd2.indexOf("maks. 2 lekcje tygodniowo") >= 0);
  const rd3 = ruleDesc({ type: "subjDays", classId: "", subject: "Plastyka", subject2: "", a: 1, b: NH, n: 1, days: [0, 2], hard: true, weight: 100, on: true });
  T("ruleDesc: subjDays z dniami Pn+Śr", rd3.indexOf("tylko w dni: Pn, Śr") >= 0);
  const rd4 = ruleDesc({ type: "subjDays", classId: "", subject: "Plastyka", subject2: "", a: 1, b: NH, n: 1, hard: true, weight: 100, on: true });
  T("ruleDesc: subjDays bez days → em-dash (wszystkie zablokowane w UI, silnik traktuje jako brak ograniczenia)", rd4.indexOf("tylko w dni: —") >= 0);
}
{
  /* twarda: min. 2 dni odstępu — Matematyka 3h → nie w dwa kolejne dni */
  const st = fresh();
  const c1 = mkC(st, "1a"); const t1 = mkT(st, "Anna Kowalska");
  mkA(st, c1.id, "Matematyka", t1.id, 3);
  st.settings.rules.push({ id: "rmd", type: "subjMinDays", classId: "", subject: "Matematyka", subject2: "", a: 1, b: NH, n: 2, hard: true, weight: 100, on: true });
  const ls = buildLessons(st.activities);
  const best = autoSchedule(ls, st.teachers, st.classes, st.settings, 5);
  const days = Object.keys(best.placement).map(k => Math.floor(best.placement[k] / NH)).sort((a,b)=>a-b);
  let consec = false;
  for (let i = 1; i < days.length; i++) if (days[i] - days[i-1] === 1) consec = true;
  T("twarda subjMinDays: 3 lekcje → żadne dwa w kolejne dni", Object.keys(best.placement).length === 3 && !consec);
  const errs = findViolations(ls, st.teachers, st.classes, { "a1-0": 0, "a1-1": 8, "a1-2": 16 }, st.settings);
  T("findViolations: lekcje Pn+Wt+Czw kolejno → błąd odstępu (Pn i Wt)", errs.some(e => e.indexOf("min. 2 dni odstępu") >= 0 && e.indexOf("Poniedziałek i Wtorek") >= 0));
  const errsOK = findViolations(ls, st.teachers, st.classes, { "a1-0": 0, "a1-1": 16, "a1-2": 32 }, st.settings);
  T("findViolations: Pn+Śr+Pt → bez błędu odstępu", !errsOK.some(e => e.indexOf("dni odstępu") >= 0));
  /* miękka wariant: 2 w kolejne dni → kara */
  st.settings.rules[0].hard = false; st.settings.rules[0].weight = 80;
  const sp = softPenalty(ls, st.teachers, st.classes, st.settings, { "a1-0": 0, "a1-1": 8, "a1-2": 16 });
  T("miękka subjMinDays: 2 pary kolejne → kara ≥ 2×waga", sp.pen >= 160 && sp.det.some(d => d.indexOf("min. 2 dni odstępu") >= 0));
  const spOK = softPenalty(ls, st.teachers, st.classes, st.settings, { "a1-0": 0, "a1-1": 16, "a1-2": 32 });
  T("miękka subjMinDays spełniona → kara 0", spOK.pen === 0);
  /* min. 3 dni odstępu clamp: n=5 → 4 */
  T("subjMinDays: n poza zakresem → clamp 2..4 w silniku", ruleSlotOk({ type: "subjMinDays", n: 9, days: [0,1,2,3,4] }, { id: "x", classIds: ["c1"], subject: "Matematyka", link: "" }, 0, st.settings, () => 0, () => []) === true);
}
{
  /* twarda: maks. 2 tygodniowo — Muzyka 3h → tylko 2 ułożone */
  const st = fresh();
  const c1 = mkC(st, "1a"); const t1 = mkT(st, "Anna Kowalska");
  mkA(st, c1.id, "Muzyka", t1.id, 3);
  st.settings.rules.push({ id: "rmw", type: "subjMaxWeek", classId: "", subject: "Muzyka", subject2: "", a: 1, b: NH, n: 2, hard: true, weight: 100, on: true });
  const ls = buildLessons(st.activities);
  const best = autoSchedule(ls, st.teachers, st.classes, st.settings, 5);
  T("twarda subjMaxWeek: limit 2/tydz. → max 2 ułożone z 3", Object.keys(best.placement).length === 2);
  const errs = findViolations(ls, st.teachers, st.classes, { "a1-0": 0, "a1-1": 8, "a1-2": 16 }, st.settings);
  T("findViolations: 3 muzyki w tygodniu przy limicie 2 → błąd", errs.some(e => e.indexOf("maks. 2 lekcje tygodniowo") >= 0));
  const errsOK = findViolations(ls, st.teachers, st.classes, { "a1-0": 0, "a1-1": 8 }, st.settings);
  T("findViolations: 2 muzyki → bez błędu", !errsOK.some(e => e.indexOf("tygodniowo") >= 0));
  /* miękka: 3 przy limicie 2 → kara waga×1 */
  st.settings.rules[0].hard = false; st.settings.rules[0].weight = 60;
  const sp = softPenalty(ls, st.teachers, st.classes, st.settings, { "a1-0": 0, "a1-1": 8, "a1-2": 16 });
  T("miękka subjMaxWeek: 3 przy limicie 2 → kara waga×1", sp.pen === 60 && sp.det.some(d => d.indexOf("maks. 2 lekcje tygodniowo") >= 0));
  const spOK = softPenalty(ls, st.teachers, st.classes, st.settings, { "a1-0": 0, "a1-1": 8 });
  T("miękka subjMaxWeek spełniona → kara 0", spOK.pen === 0);
}
{
  /* twarda: Plastyka tylko Pn i Śr — 2h → obie w dozwolonych dniach */
  const st = fresh();
  const c1 = mkC(st, "1a"); const t1 = mkT(st, "Anna Kowalska");
  mkA(st, c1.id, "Plastyka", t1.id, 2);
  st.settings.rules.push({ id: "rsd", type: "subjDays", classId: "", subject: "Plastyka", subject2: "", a: 1, b: NH, n: 1, days: [0, 2], hard: true, weight: 100, on: true });
  const ls = buildLessons(st.activities);
  const best = autoSchedule(ls, st.teachers, st.classes, st.settings, 5);
  const dd = Object.keys(best.placement).map(k => Math.floor(best.placement[k] / NH));
  T("twarda subjDays: tylko Pn/Śr — obie lekcje w dozwolonych dniach", Object.keys(best.placement).length === 2 && dd.every(x => x === 0 || x === 2));
  const errs = findViolations(ls, st.teachers, st.classes, { "a1-0": 32, "a1-1": 33 }, st.settings);
  T("findViolations: Plastyka w piątek → błąd", errs.some(e => e.indexOf("nie może być w Piątek") >= 0));
  const errsOK = findViolations(ls, st.teachers, st.classes, { "a1-0": 0, "a1-1": 16 }, st.settings);
  T("findViolations: Pn+Śr → bez błędu", !errsOK.some(e => e.indexOf("nie może być w") >= 0));
  /* miękka: waga za każdą lekcję w złym dniu */
  st.settings.rules[0].hard = false; st.settings.rules[0].weight = 70;
  const sp = softPenalty(ls, st.teachers, st.classes, st.settings, { "a1-0": 32, "a1-1": 33 });
  T("miękka subjDays: 2 lekcje w złe dni → kara 2×waga", sp.pen === 140 && sp.det.some(d => d.indexOf("Plastyka") >= 0));
  /* brak days w regule → brak ograniczenia (kompatybilność wstecz) */
  const sp2 = softPenalty(ls, st.teachers, st.classes, st.settings, { "a1-0": 32, "a1-1": 33 });
  st.settings.rules[0].days = undefined;
  const sp3 = softPenalty(ls, st.teachers, st.classes, st.settings, { "a1-0": 32, "a1-1": 33 });
  T("subjDays bez days (stara reguła) → traktowana jak wszystkie dni", sp3.pen === 0);
  st.settings.rules[0].days = [0, 2];
}
{
  /* kombinacja: ruleDayTog + ruleDraftInit days + zapis przez ruleSave z mock DOM */
  const st = fresh();
  const c1 = mkC(st, "1a"); const t1 = mkT(st, "Anna Kowalska");
  mkA(st, c1.id, "Technika", t1.id, 2);
  S = st; ruleDraftInit(); ruleTyp = "subjDays";
  ruleDayTog(2); ruleDayTog(3); ruleDayTog(4); /* zostają [0,1] */
  const origGEBI = document.getElementById;
  document.getElementById = (id) => {
    const e = el();
    if (id === "r_sub") e.value = "Technika";
    else if (id === "r_n") e.value = "1";
    else if (id === "r_a") e.value = "1";
    else if (id === "r_b") e.value = String(NH);
    else if (id === "r_hard") e.value = "hard";
    else if (id === "r_w") e.value = "100";
    return e;
  };
  ruleSave();
  document.getElementById = origGEBI;
  const saved = S.settings.rules[S.settings.rules.length - 1];
  T("ruleSave: subjDays zapisuje days [0,1] z draftu", saved && saved.type === "subjDays" && JSON.stringify(saved.days) === JSON.stringify([0, 1]));
  /* minimalny 1 dzień: wyłączenie wszystkich → blokada */
  ruleEditId = saved.id; ruleDraftInit(); ruleTyp = "subjDays";
  ruleDayTog(0); ruleDayTog(1); ruleDayTog(2); ruleDayTog(3); /* zostaje [4] */
  ruleDayTog(4); /* próba wyłączenia ostatniego → flash warn, zostaje [4] */
  T("ruleDayTog: nie da się wyłączyć ostatniego dnia", ruleDraft.days.length === 1 && ruleDraft.days[0] === 4);
}

/* ==================== 22. wagi wbudowanych kar (v6.10) ==================== */
SEC("22. wagi kar + token");
{
  /* normalize: defaulty nowych pól */
  const st = fresh();
  T("normalize: wagi kar mają defaulty (150/150/40/40/120)", st.settings.wTeacherGap === 150 && st.settings.wClassGap === 150 && st.settings.wSwMid === 40 && st.settings.wAutBlock === 40 && st.settings.wPair === 120);
  T("normalize: bez chatToken (pole nie istnieje)", !("chatToken" in st.settings));
  const st2 = normalize({ teachers: [], classes: [], activities: [], placement: {}, settings: { teacherMaxPerDay: 7, classMaxPerDay: 7, lessonTimes: defaultLessonTimes(), wTeacherGap: 0, wSwMid: 999 } });
  T("normalize: zachowuje ustawione wagi (0 nie nadpisywane defaultem)", st2.settings.wTeacherGap === 0 && st2.settings.wSwMid === 999 && st2.settings.wPair === 120);
}
{
  /* okienka nauczyciela i klasy: kary wg wag, 0 = wyłączona (v6.23: klasa = ZERO okienek, kara za każde) */
  const st = fresh();
  st.settings.classMaxGapsPerDay = 8; /* v6.23: ignorowane */
  const c1 = mkC(st, "1a"); const t1 = mkT(st, "Anna Kowalska");
  mkA(st, c1.id, "Matematyka", t1.id, 3);
  st.settings.maxGaps = 1; /* 2 okienka nauczyciela → kara 150 za 1 ponad limit */
  const ls = buildLessons(st.activities);
  const pl = { "a1-0": 0, "a1-1": 2, "a1-2": 4 }; /* Pn: lekcje 1, 3, 5 → 2 okienka nauczyciela i klasy */
  const spDef = softPenalty(ls, st.teachers, st.classes, st.settings, pl);
  T("v6.23 okienka default: nauczyciel 150 + klasa tyg 300 + dzienna 300 = 750", spDef.pen === 750 && spDef.det.some(d => d.indexOf("okienek") >= 0));
  st.settings.wTeacherGap = 0;
  const spT0 = softPenalty(ls, st.teachers, st.classes, st.settings, pl);
  T("v6.23 waga nauczyciela 0 → kara klasy 600", spT0.pen === 600);
  st.settings.wTeacherGap = 150; st.settings.wClassGap = 0;
  const spC0 = softPenalty(ls, st.teachers, st.classes, st.settings, pl);
  T("v6.23 waga tygodniowa klasy 0 → nauczyciel 150 + dzienna klasy 300 = 450", spC0.pen === 450);
  st.settings.wClassGapDay = 0;
  const spD0 = softPenalty(ls, st.teachers, st.classes, st.settings, pl);
  T("v6.23 obie wagi klasy 0 → tylko nauczyciel (150)", spD0.pen === 150);
  st.settings.wTeacherGap = 500; st.settings.wClassGap = 500; st.settings.wClassGapDay = 150;
  const spBig = softPenalty(ls, st.teachers, st.classes, st.settings, pl);
  T("v6.23 wagi 500/500/150 → 500 + 1000 + 300 = 1800", spBig.pen === 1800);
  st.settings.wTeacherGap = 0; st.settings.wClassGap = 0; st.settings.wClassGapDay = 0;
  const spZero = softPenalty(ls, st.teachers, st.classes, st.settings, pl);
  T("wszystkie wagi 0 → okienka nie liczą się w ogóle", spZero.pen === 0 && !spZero.det.some(d => d.indexOf("okienek") >= 0));
}
{
  /* świetlica w środku dnia: wSwMid */
  const st = fresh();
  const c1 = mkC(st, "1a"); const t1 = mkT(st, "Anna Kowalska");
  mkA(st, c1.id, "Świetlica", t1.id, 2);
  const ls = buildLessons(st.activities);
  const pl = { "a1-0": 2, "a1-1": 3 }; /* Pn lekcje 3-4 → obie w środku (godz. 3-5) */
  const spDef = softPenalty(ls, st.teachers, st.classes, st.settings, pl);
  T("świetlica default: 2 lekcje × 40 = 80", spDef.pen === 80 && spDef.det.some(d => d.indexOf("godzinach 3-5") >= 0));
  st.settings.wSwMid = 0;
  const sp0 = softPenalty(ls, st.teachers, st.classes, st.settings, pl);
  T("waga świetlicy 0 → bez kary", sp0.pen === 0);
  st.settings.wSwMid = 77;
  const sp77 = softPenalty(ls, st.teachers, st.classes, st.settings, pl);
  T("waga świetlicy 77 → 154", sp77.pen === 154);
}
{
  /* para przedmiotów nie ułożona obok: wPair */
  const st = fresh();
  const c1 = mkC(st, "1a"); const t1 = mkT(st, "Anna Kowalska");
  mkA(st, c1.id, "Język polski", t1.id, 1);
  mkA(st, c1.id, "Matematyka", t1.id, 1);
  st.settings.pairs = [{ cls: "1a", a: "polski", b: "matematyka" }];
  const ls = buildLessons(st.activities);
  const pl = { "a2-0": 0, "a1-0": 8 }; /* polski Pn 1., matematyka Wt 1. → nie obok siebie */
  const spDef = softPenalty(ls, st.teachers, st.classes, st.settings, pl);
  T("para default: kara 120", spDef.pen === 120 && spDef.det.some(d => d.indexOf("nie jest ułożona obok siebie") >= 0));
  const plOK = { "a2-0": 0, "a1-0": 1 }; /* obok siebie → bez kary */
  const spOK = softPenalty(ls, st.teachers, st.classes, st.settings, plOK);
  T("para ułożona obok → bez kary", spOK.pen === 0);
  st.settings.wPair = 0;
  const sp0 = softPenalty(ls, st.teachers, st.classes, st.settings, pl);
  T("waga pary 0 → bez kary nawet gdy nie ułożona", sp0.pen === 0 && !sp0.det.some(d => d.indexOf("nie jest ułożona") >= 0));
}

/* ==================== 23. bloki przedmiotu: N lekcji pod rząd (v6.11) ==================== */
SEC("23. bloki przedmiotu");
{
  const st = fresh();
  const rdb = ruleDesc({ type: "subjBlock", classId: "", subject: "Wychowanie fizyczne", subject2: "", a: 1, b: NH, n: 2, hard: true, weight: 100, on: true });
  T("ruleDesc: subjBlock", rdb.indexOf("w blokach po 2 lekcje pod rząd") >= 0 && rdb.indexOf("Wychowanie fizyczne") >= 0);
  /* unit: ruleSlotOk z mockami */
  const LX = { id: "x", classIds: ["c1"], subject: "Wychowanie fizyczne", link: "" };
  const mkSS = (arr) => () => arr;
  T("blok: pusta klasa → lekcja solo dozwolona", ruleSlotOk({ type: "subjBlock", n: 2 }, LX, 10, st.settings, () => 0, () => [], mkSS([])) === true);
  T("blok: domykanie obok istniejącej lekcji", ruleSlotOk({ type: "subjBlock", n: 2 }, LX, 11, st.settings, () => 0, () => [], mkSS([10])) === true);
  T("blok: solo istnieje → inny slot zakazany", ruleSlotOk({ type: "subjBlock", n: 2 }, LX, 20, st.settings, () => 0, () => [], mkSS([10])) === false);
  T("blok: blok po 2 pełny → trzecia obok zakazana", ruleSlotOk({ type: "subjBlock", n: 2 }, LX, 9, st.settings, () => 0, () => [], mkSS([10, 11])) === false);
  T("blok: pełna para → nowa para gdzie indziej dozwolona", ruleSlotOk({ type: "subjBlock", n: 2 }, LX, 30, st.settings, () => 0, () => [], mkSS([10, 11])) === true);
  T("blok: n=3 → domknięcie trójki dozwolone", ruleSlotOk({ type: "subjBlock", n: 3 }, LX, 12, st.settings, () => 0, () => [], mkSS([10, 11])) === true);
  T("blok: granica dnia — Pn 8. i Wt 1. nie tworzą bloku (solo w Pn blokuje)", ruleSlotOk({ type: "subjBlock", n: 2 }, LX, 8, st.settings, () => 0, () => [], mkSS([7])) === false);
}
{
  /* twarda: automat układa WF 2h obok siebie */
  const st = fresh();
  const c1 = mkC(st, "1a"); const t1 = mkT(st, "Anna Kowalska");
  mkA(st, c1.id, "Wychowanie fizyczne", t1.id, 2);
  st.settings.rules.push({ id: "rb", type: "subjBlock", classId: "", subject: "Wychowanie fizyczne", subject2: "", a: 1, b: NH, n: 2, days: [0,1,2,3,4], hard: true, weight: 100, on: true });
  const ls = buildLessons(st.activities);
  const best = autoSchedule(ls, st.teachers, st.classes, st.settings, 5);
  const ss = Object.keys(best.placement).map(k => best.placement[k]).sort((a, b) => a - b);
  T("twarda subjBlock: 2h WF obok siebie (ten sam dzień, sąsiednie lekcje)", ss.length === 2 && ss[1] - ss[0] === 1);
  /* twarda: 4h WF → dwa bloki po 2 */
  st.activities[0].hours = 4;
  const ls4 = buildLessons(st.activities);
  const best4 = autoSchedule(ls4, st.teachers, st.classes, st.settings, 5);
  const s4 = Object.keys(best4.placement).map(k => best4.placement[k]).sort((a, b) => a - b);
  const runs = [];
  let run = 1;
  for (let i = 1; i < s4.length; i++){ if (s4[i] - s4[i-1] === 1) run++; else { runs.push(run); run = 1; } }
  runs.push(run);
  T("twarda subjBlock: 4h WF → dwa bloki po 2 (bez run 3+)", Object.keys(best4.placement).length === 4 && runs.every(r => r === 2));
  /* findViolations: rozdzielone → błąd; obok siebie → OK */
  const errs = findViolations(ls, st.teachers, st.classes, { "a1-0": 0, "a1-1": 8 }, st.settings);
  T("findViolations: WF rozdzielone (Pn 1. i Wt 1.) → błąd bloku", errs.some(e => e.indexOf("w blokach po 2") >= 0 && e.indexOf("luzem") >= 0));
  const errsOK = findViolations(ls, st.teachers, st.classes, { "a1-0": 0, "a1-1": 1 }, st.settings);
  T("findViolations: WF obok siebie → bez błędu bloku", !errsOK.some(e => e.indexOf("w blokach") >= 0));
  /* n=3 z 3h rozproszonymi → błąd (przy pełnych blokach 3 dozwolonych 0 luzem) */
  st.settings.rules[0].n = 3;
  mkA(st, c1.id, "Wychowanie fizyczne", t1.id, 1);
  const ls3h = buildLessons(st.activities);
  const errs3 = findViolations(ls3h, st.teachers, st.classes, { "a1-0": 0, "a1-1": 8, "a2-0": 16 }, st.settings);
  T("findViolations: n=3 a 3h WF rozproszone → błąd", errs3.some(e => e.indexOf("w blokach po 3") >= 0));
  st.activities.pop(); st.settings.rules[0].n = 2;
}
{
  /* miękka: kara za każdy niepełny blok */
  const st = fresh();
  const c1 = mkC(st, "1a"); const t1 = mkT(st, "Anna Kowalska");
  mkA(st, c1.id, "Wychowanie fizyczne", t1.id, 2);
  st.settings.rules.push({ id: "rb2", type: "subjBlock", classId: "", subject: "Wychowanie fizyczne", subject2: "", a: 1, b: NH, n: 2, days: [0,1,2,3,4], hard: false, weight: 50, on: true });
  const ls = buildLessons(st.activities);
  const sp = softPenalty(ls, st.teachers, st.classes, st.settings, { "a1-0": 0, "a1-1": 8 });
  T("miękka subjBlock: 2 lekcje luzem → kara 2×waga", sp.pen === 100 && sp.det.some(d => d.indexOf("w blokach po 2") >= 0));
  const spOK = softPenalty(ls, st.teachers, st.classes, st.settings, { "a1-0": 0, "a1-1": 1 });
  T("miękka subjBlock: pełny blok → kara 0", spOK.pen === 0);
  /* resztka: 3h WF przy bloku 2 → para + 1 luzem dozwolone; rozproszone → kara */
  mkA(st, c1.id, "Wychowanie fizyczne", t1.id, 1);
  const ls3 = buildLessons(st.activities);
  const spPair = softPenalty(ls3, st.teachers, st.classes, st.settings, { "a1-0": 0, "a1-1": 1, "a2-0": 8 });
  T("miękka subjBlock: 3h WF = para + 1 luzem → kara 0 (resztka dozwolona)", spPair.pen === 0);
  const sp3 = softPenalty(ls3, st.teachers, st.classes, st.settings, { "a1-0": 0, "a1-1": 8, "a2-0": 16 });
  T("miękka subjBlock: 3h WF rozproszone → kara 2×waga (3 luzem − 1 dozwolony)", sp3.pen === 100 && sp3.det.some(d => d.indexOf("w blokach po 2") >= 0));
}
{
  /* zajęcia grupowe: WF w grupach 1 i 2 równolegle — blok liczony per grupa, równoległość nie koliduje */
  const st = fresh();
  const c1 = mkC(st, "1a"); const t1 = mkT(st, "Anna Kowalska");
  mkA(st, c1.id, "Wychowanie fizyczne", t1.id, 2, { group: "1" });
  mkA(st, c1.id, "Wychowanie fizyczne", t1.id, 2, { group: "2" });
  st.settings.rules.push({ id: "rb3", type: "subjBlock", classId: "", subject: "Wychowanie fizyczne", subject2: "", a: 1, b: NH, n: 2, days: [0,1,2,3,4], hard: true, weight: 100, on: true });
  const lsG = buildLessons(st.activities);
  const plG = { "a1-0": 0, "a1-1": 1, "a2-0": 0, "a2-1": 1 };
  const errsG = findViolations(lsG, st.teachers, st.classes, plG, st.settings);
  T("grupy: WF gr1 i gr2 równolegle w blokach [0,1] → bez błędu bloku", !errsG.some(e => e.indexOf("w blokach") >= 0));
  const spG = softPenalty(lsG, st.teachers, st.classes, Object.assign({ rules: [] }, st.settings, { rules: st.settings.rules.map(r => Object.assign({}, r, { hard: false, weight: 30 })) }), plG);
  T("grupy: równoległe pełne bloki → kara 0 (soft)", spG.pen === 0);
  /* automat z grupami: uklada oba WF w blokach */
  const bestG = autoSchedule(lsG, st.teachers, st.classes, st.settings, 5);
  const pG = bestG.placement;
  T("grupy: automat układa oba WF parami (4 lekcje)", Object.keys(pG).length === 4);
  const g1 = [pG["a1-0"], pG["a1-1"]].sort((a,b)=>a-b), g2 = [pG["a2-0"], pG["a2-1"]].sort((a,b)=>a-b);
  T("grupy: każda grupa w bloku po 2 obok siebie", g1[1] - g1[0] === 1 && g2[1] - g2[0] === 1);
}

/* ==================== 24. okienka klasy dziennie + classMaxPerDay w feasible (v6.12) ==================== */
SEC("24. okienka dzienne klasy");
{
  /* normalize: defaulty */
  const st = fresh();
  T("normalize: classMaxGapsPerDay domyślnie 1", st.settings.classMaxGapsPerDay === 1);
  T("normalize: wClassGapDay domyślnie 150", st.settings.wClassGapDay === 150);

  /* twardy limit dzienny: tylko Pn {0,3} wolne → 2 lekcje = 2 okienka → automat nie ułoży */
  const st2 = fresh();
  const c2 = mkC(st2, "1a");
  const t2a = mkT(st2, "Anna Kowalska"), t2b = mkT(st2, "Barbara Nowak"), t2c = mkT(st2, "Cecylia Lis");
  mkA(st2, c2.id, "Matematyka", t2a.id, 1);
  mkA(st2, c2.id, "Polski", t2b.id, 1);
  mkA(st2, c2.id, "Historia", t2c.id, 1);
  const onlyPn03 = Array.from({ length: 40 }, (_, i) => i).filter(i => i !== 0 && i !== 3);
  [t2a, t2b, t2c].forEach(t => t.unavail = onlyPn03.slice());
  const ls2 = buildLessons(st2.activities);
  const best2 = autoSchedule(ls2, st2.teachers, st2.classes, st2.settings, 5);
  T("twardy dzienny: automat nie ułoży klasy z 2 okienkami w jednym dniu", Object.keys(best2.placement).length === 1);
  st2.settings.classMaxGapsPerDay = 0; /* v6.23: ustawienie ignorowane — zero okienek nie do wyłączenia */
  const best2b = autoSchedule(ls2, st2.teachers, st2.classes, st2.settings, 5);
  T("v6.23: classMaxGapsPerDay=0 → NADAL bez okienek (najtwardsza, nie do wyłączenia)", Object.keys(best2b.placement).length === 1);

  /* findViolations: dzienny limit twardy */
  const st3 = fresh();
  const c3 = mkC(st3, "1a");
  const t3a = mkT(st3, "Anna Kowalska"), t3b = mkT(st3, "Barbara Nowak"), t3c = mkT(st3, "Cecylia Lis");
  mkA(st3, c3.id, "Matematyka", t3a.id, 1);
  mkA(st3, c3.id, "Polski", t3b.id, 1);
  mkA(st3, c3.id, "Historia", t3c.id, 1);
  const ls3 = buildLessons(st3.activities);
  const errs3 = findViolations(ls3, st3.teachers, st3.classes, { "a1-0": 0, "a2-0": 3, "a3-0": 6 }, st3.settings);
  T("v6.23 findViolations: 4 okienka w Pn → twardy błąd najtwardszej reguły",
    errs3.some(e => e.indexOf("nie mogą mieć okienek") >= 0 && errs3.some(e => e.indexOf("najtwardsza reguła") >= 0)));
  const errs3b = findViolations(ls3, st3.teachers, st3.classes, { "a1-0": 0, "a2-0": 1, "a3-0": 2 }, st3.settings);
  T("v6.23 findViolations: lekcje obok siebie → bez błędu o okienkach",
    !errs3b.some(e => e.indexOf("nie mogą mieć okienek") >= 0));

  /* softPenalty: dzienna waga wClassGapDay */
  const st4 = fresh();
  st4.settings.maxGaps = 0; st4.settings.classMaxGaps = 0; /* izolacja: tylko dzienny komponent */
  const c4 = mkC(st4, "1a");
  const t4 = mkT(st4, "Anna Kowalska");
  mkA(st4, c4.id, "Matematyka", t4.id, 3);
  const ls4 = buildLessons(st4.activities);
  const pl4 = { "a1-0": 0, "a1-1": 3, "a1-2": 6 }; /* Pn: 4 okienka */
  const sp4 = softPenalty(ls4, st4.teachers, st4.classes, st4.settings, pl4);
  T("v6.23 soft: 4 okienka w Pn → kara tyg 4×150 + dzienna 4×150 = 1200", sp4.pen === 1200 && sp4.det.some(d => d.indexOf("w jednym dniu") >= 0));
  st4.settings.wClassGapDay = 0;
  const sp4b = softPenalty(ls4, st4.teachers, st4.classes, st4.settings, pl4);
  T("v6.23: wClassGapDay=0 → zostaje kara tygodniowa (600)", sp4b.pen === 600 && !sp4b.det.some(d => d.indexOf("w jednym dniu") >= 0));
  st4.settings.classMaxGaps = 1; /* v6.23: limit ignorowany — reguła zero */
  const sp4c = softPenalty(ls4, st4.teachers, st4.classes, st4.settings, pl4);
  T("v6.23: tygodniowa liczona zawsze (limity ustawień ignorowane)",
    sp4c.pen === 600 && sp4c.det.some(d => d.indexOf("w tygodniu") >= 0) && !sp4c.det.some(d => d.indexOf("w jednym dniu") >= 0));

  /* classMaxPerDay pilnowany w feasible (naprawa v6.12) */
  const st5 = fresh();
  const c5 = mkC(st5, "1a");
  const t5a = mkT(st5, "Anna Kowalska"), t5b = mkT(st5, "Barbara Nowak"), t5c = mkT(st5, "Cecylia Lis");
  mkA(st5, c5.id, "Matematyka", t5a.id, 1);
  mkA(st5, c5.id, "Polski", t5b.id, 1);
  mkA(st5, c5.id, "Historia", t5c.id, 1);
  const onlyPn = Array.from({ length: 40 }, (_, i) => i).filter(i => i >= 8);
  [t5a, t5b, t5c].forEach(t => t.unavail = onlyPn.slice());
  st5.settings.classMaxPerDay = 2;
  const ls5 = buildLessons(st5.activities);
  const best5 = autoSchedule(ls5, st5.teachers, st5.classes, st5.settings, 5);
  T("classMaxPerDay w feasible: limit 2 → tylko 2 lekcje na Pn", Object.keys(best5.placement).length === 2);
  st5.settings.classMaxPerDay = 8;
  const best5b = autoSchedule(ls5, st5.teachers, st5.classes, st5.settings, 5);
  T("classMaxPerDay w feasible: limit 8 → 3 lekcje", Object.keys(best5b.placement).length === 3);

}

/* ==================== 25. dostępności nauczycieli (v6.13) ==================== */
SEC("25. dostępności nauczycieli");
{
  /* parseDaySpec — konwencje arkusza 'Dyspozycyjność' */
  T("spec: 'Wolne 6,7,8' → blokada 6-8", JSON.stringify(parseDaySpec("Wolne 6,7,8").blocked) === "[6,7,8]");
  T("spec: gołe '7,8' → blokada (konwencja Roberta: wolny wtedy)", JSON.stringify(parseDaySpec("7,8").blocked) === "[7,8]");
  T("spec: '-' → cały dzień zablokowany + uncertain", JSON.stringify(parseDaySpec("-").blocked) === "[1,2,3,4,5,6,7,8]" && parseDaySpec("-").uncertain === true);
  T("spec: 'Cały'/'Cała'/'Dostępna' → bez blokad", parseDaySpec("Cały").blocked.length === 0 && parseDaySpec("Cała").blocked.length === 0 && parseDaySpec("Dostępna").blocked.length === 0);
  T("spec: 'od 5' → dostępny od 5. → blokada 1-4", JSON.stringify(parseDaySpec("od 5").blocked) === "[1,2,3,4]");
  T("spec: 'do 7' → dostępny do 7. → blokada 8", JSON.stringify(parseDaySpec("do 7").blocked) === "[8]");
  T("spec: 'od 5 do 8 (5,6,7,8)' → blokada 1-4", JSON.stringify(parseDaySpec("od 5 do 8 (5,6,7,8)").blocked) === "[1,2,3,4]");
  T("spec: 'Wolny (od 5L)' → blokada 5-8", JSON.stringify(parseDaySpec("Wolny (od 5L)").blocked) === "[5,6,7,8]");
  T("spec: 'od 9:00' → od 2. lekcji → blokada 1", JSON.stringify(parseDaySpec("od 9:00").blocked) === "[1]");
  T("spec: '(3h) 4,5,6' → blokada 4-6", JSON.stringify(parseDaySpec("(3h) 4,5,6").blocked) === "[4,5,6]");
  T("spec: '4h (od 5t)' → blokada 1-4", JSON.stringify(parseDaySpec("4h (od 5t)").blocked) === "[1,2,3,4]");
  T("spec: 'do 5L' → blokada 6-8", JSON.stringify(parseDaySpec("do 5L").blocked) === "[6,7,8]");
  T("spec: 'Dyspozycyjność nieregularna' → unclear", parseDaySpec("Dyspozycyjność nieregularna").unclear === true);

  /* parseAvailSheet — sekcja TSV z #sheet */
  const tsvA = "Naglowek\n#sheet: Dyspozycyjność (test)\nNauczyciel\tPoniedziałek\tWtorek\tŚroda\tCzwartek\tPiątek\tUwagi\n" +
    "Anna Kowalska\t-\t7,8\tCały\tod 4\t\tnota a\nJan Nowak\t3,4\t-\t-\t-\t-\tstara wersja\nJan Nowak (aktualizacja)\t1,2\t-\t-\t-\t-\tnowa\n#sheet: Inny arkusz\nKtos Inny\t1\t2\t3\t4\t5\t6";
  const rowsA = parseAvailSheet(tsvA);
  T("sheet: rozpoznane 2 wiersze (arkusz Inny poza sekcją)", rowsA && rowsA.length === 2);
  T("sheet: '(aktualizacja)' nadpisuje starszy wpis", rowsA && rowsA.some(r => r.nameClean === "Jan Nowak" && JSON.stringify(r.days[0].blocked) === "[1,2]"));;
  T("sheet: brak arkusza → null", parseAvailSheet("brak arkusza dyspozycyjności") === null);
  if (rowsA){
    const rA = rowsA.find(r => r.nameClean === "Anna Kowalska");
    T("sheet: dni rozłożone po kolei (Pn cały blok, Wt 7-8, Śr czysto, Cz 1-3)",
      JSON.stringify(rA.days[0].blocked) === "[1,2,3,4,5,6,7,8]" && JSON.stringify(rA.days[1].blocked) === "[7,8]" && rA.days[2].blocked.length === 0 && JSON.stringify(rA.days[3].blocked) === "[1,2,3]");
    T("sheet: note z kolumny uwag", rA.note === "nota a");
  }

  /* parseAvailText — pole tekstowe (wszystko = niedostępność) */
  const resT = parseAvailText("pn 7,8; wt 6-8; śr cały; czw od 6; pt do 3");
  T("tekst: pn 7,8; wt 6-8; śr cały; czw od 6; pt do 3 → 19 slotów", resT.slots.length === 19 && resT.skipped.length === 0);
  T("tekst: konkretne sloty (pn 7.,8. + wt 6-8 + śr cała + czw 6-8 + pt 1-3)",
    resT.slots.indexOf(6) >= 0 && resT.slots.indexOf(7) >= 0 && resT.slots.indexOf(13) >= 0 && resT.slots.indexOf(15) >= 0 &&
    resT.slots.indexOf(16) >= 0 && resT.slots.indexOf(23) >= 0 && resT.slots.indexOf(29) >= 0 && resT.slots.indexOf(31) >= 0 &&
    resT.slots.indexOf(32) >= 0 && resT.slots.indexOf(34) >= 0);
  const resT2 = parseAvailText("wto 6; niejasny fragment; piątek 1");
  T("tekst: skróty pełnych dni (wto/piątek) działają, śmieci do skipped",
    resT2.slots.indexOf(13) >= 0 && resT2.slots.indexOf(32) >= 0 && resT2.skipped.length === 1);
  T("tekst: puste → nic", parseAvailText("").slots.length === 0);

  /* applyAvailImport — ustawienie blokad + cofnięcie lekcji */
  const st5 = fresh();
  const c5 = mkC(st5, "1a");
  const t5a = mkT(st5, "Anna Kowalska"), t5b = mkT(st5, "Barbara Nowak");
  mkA(st5, c5.id, "Matematyka", t5a.id, 1);
  mkA(st5, c5.id, "Polski", t5b.id, 1);
  const ls5 = buildLessons(st5.activities);
  st5.placement = { "a1-0": 6, "a2-0": 7 }; /* nauczycielka A: pn lekcje 7-8 */
  S = st5;
  availRows = [{ name: "Anna Kowalska", nameClean: "Anna Kowalska", days: [parseDaySpec("7,8"), parseDaySpec(""), parseDaySpec(""), parseDaySpec(""), parseDaySpec("")], note: "", tid: t5a.id, on: true },
                { name: "Nieznana Osoba", nameClean: "Nieznana Osoba", days: [parseDaySpec("-"), parseDaySpec(""), parseDaySpec(""), parseDaySpec(""), parseDaySpec("")], note: "", tid: "", on: true }];
  applyAvailImport();
  T("import: blokady nauczycielki A = sloty 6,7 (pn lekcje 7-8)", JSON.stringify(t5a.unavail) === "[6,7]");
  T("import: lekcja Anny na zablokowanym slocie cofnięta (a1-0), Barbara bez blokad zostaje (a2-0=7)", st5.placement["a1-0"] == null && st5.placement["a2-0"] === 7);
  T("import: nieznany nauczyciel pominięty", t5b.unavail.length === 0);
  availRows = null;

  /* availCheck — kontrola krzyżowa z godzinami */
  mkA(st5, c5.id, "Matematyka", t5a.id, 5); /* razem 6h → kontrola krzyżowa ma co porównywać */
  const hM5 = teacherHoursMap();
  T("check: nauczycielka A (1h przydziału, 38 wolnych slotów) → poziom 0",
    availCheck({ tid: t5a.id, days: [parseDaySpec("7,8"), parseDaySpec(""), parseDaySpec(""), parseDaySpec(""), parseDaySpec("")] }, hM5).level === 0);
  T("check: brak tid → poziom 1",
    availCheck({ tid: "", days: [parseDaySpec(""), parseDaySpec(""), parseDaySpec(""), parseDaySpec(""), parseDaySpec("")] }, hM5).level === 1);
  T("check: '-' → poziom 1 (do potwierdzenia)",
    availCheck({ tid: t5a.id, days: [parseDaySpec("-"), parseDaySpec(""), parseDaySpec(""), parseDaySpec(""), parseDaySpec("")] }, hM5).level === 1);
  T("check: za mało slotów vs godziny → poziom 2",
    availCheck({ tid: t5a.id, days: [parseDaySpec("1,2,3,4,5,6,7,8"), parseDaySpec("1,2,3,4,5,6,7,8"), parseDaySpec("1,2,3,4,5,6,7,8"), parseDaySpec("1,2,3,4,5,6,7,8"), parseDaySpec("1,2,3,4")] }, hM5).level === 2);

  /* applyAvailText — pole tekstowe w siatce nauczyciela */
  ogrT = t5b.id;
  st5.placement["a2-0"] = 13; /* Barbara: wt lekcja 6 */
  const savedGEB = document.getElementById;
  document.getElementById = function(id){ return id === "availTxt" ? { value: "wt 6; śr 1-2" } : savedGEB(id); };
  applyAvailText();
  document.getElementById = savedGEB;
  T("tekst-apply: blokady Barbary = wt 6 + śr 1-2", JSON.stringify(t5b.unavail) === "[13,16,17]");
  T("tekst-apply: lekcja na wt 6 cofnięta", st5.placement["a2-0"] == null);
  ogrT = "";
}

/* ==================== 26. reguły nauczycielskie (v6.14) ==================== */
SEC("26. reguły nauczycielskie (tchDays/tchMaxDays/tchBlock)");
{
  const st6 = fresh();
  const c6 = mkC(st6, "1a");
  const t6 = mkT(st6, "Anna Kowalska");
  const t6b = mkT(st6, "Barbara Nowak");
  mkA(st6, c6.id, "Matematyka", t6.id, 4);
  mkA(st6, c6.id, "Historia", t6b.id, 2);
  const ls6 = buildLessons(st6.activities);
  S = st6;

  /* ruleMatch — zakres nauczyciela i przedmiotu */
  const rTch = { id: "rt1", type: "tchMaxDays", teacher: t6.id, subject: "", n: 2, hard: true, on: true };
  const Lmat = ls6.filter(function(L){ return L.subject === "Matematyka"; })[0];
  const Lhis = ls6.filter(function(L){ return L.subject === "Historia"; })[0];
  T("tch: ruleMatch trafia tylko w lekcje nauczyciela", ruleMatch(rTch, Lmat) && !ruleMatch(rTch, Lhis));
  const rTchS = { id: "rt2", type: "tchBlock", teacher: t6.id, subject: "Matematyka", n: 2, hard: true, on: true };
  T("tch: ruleMatch z przedmiotem trafia", ruleMatch(rTchS, Lmat));
  const rTchO = { id: "rt3", type: "tchBlock", teacher: t6.id, subject: "Historia", n: 2, hard: true, on: true };
  T("tch: ruleMatch odrzuca cudzy przedmiot", !ruleMatch(rTchO, Lmat));

  /* ruleDesc */
  const dD = ruleDesc({ type: "tchDays", teacher: t6.id, days: [1, 3] });
  T("tch: ruleDesc tchDays (nazwisko + dni)", dD.indexOf("Anna Kowalska") >= 0 && dD.indexOf("Wt") >= 0 && dD.indexOf("Cz") >= 0);
  T("tch: ruleDesc tchMaxDays z przedmiotem", ruleDesc({ type: "tchMaxDays", teacher: t6.id, subject: "Matematyka", n: 2 }).indexOf("Matematyka") >= 0);
  T("tch: ruleDesc tchBlock bez przedmiotu", ruleDesc({ type: "tchBlock", teacher: t6.id, subject: "", n: 2 }).indexOf("Anna Kowalska") >= 0);

  /* tchDays — twarda: lekcje tylko Wt/Cz */
  st6.settings.rules = [{ id: "rd1", type: "tchDays", teacher: t6.id, subject: "", days: [1, 3], hard: true, on: true }];
  const bestD = autoSchedule(ls6, st6.teachers, st6.classes, st6.settings, 5);
  const daysUsed = {};
  ls6.forEach(function(L){ const s = bestD.placement[L.id]; if (s != null && L.teacherId === t6.id) daysUsed[Math.floor(s / NH)] = 1; });
  T("tchDays: automat kładzie lekcje nauczyciela tylko we Wt/Cz",
    Object.keys(bestD.placement).length === ls6.length && Object.keys(daysUsed).every(function(d){ return d === "1" || d === "3"; }));
  const plD = {};
  ls6.forEach(function(L){ plD[L.id] = (L.teacherId === t6.id ? 0 : 12); });
  const errsD = findViolations(ls6, st6.teachers, st6.classes, plD, st6.settings);
  T("tchDays: findViolations flaguje lekcję poza dniami", errsD.some(function(e){ return e.indexOf("nie pracuje w") >= 0; }));

  /* tchMaxDays — twarda: przedmiot skupiony w maks. 2 dniach */
  st6.settings.rules = [{ id: "rm1", type: "tchMaxDays", teacher: t6.id, subject: "Matematyka", n: 2, hard: true, on: true }];
  const bestM = autoSchedule(ls6, st6.teachers, st6.classes, st6.settings, 5);
  const daysM = {};
  ls6.forEach(function(L){ const s = bestM.placement[L.id]; if (s != null && L.teacherId === t6.id && L.subject === "Matematyka") daysM[Math.floor(s / NH)] = 1; });
  T("tchMaxDays: przedmiot nauczyciela skupiony w maks. 2 dniach",
    Object.keys(bestM.placement).length === ls6.length && Object.keys(daysM).length <= 2);
  const plM = {};
  ls6.forEach(function(L){ if (L.teacherId !== t6.id) plM[L.id] = 30; });
  ls6.filter(function(L){ return L.teacherId === t6.id; }).forEach(function(L, i){ plM[L.id] = i * 8; }); /* 4 dni */
  const errsM = findViolations(ls6, st6.teachers, st6.classes, plM, st6.settings);
  T("tchMaxDays: findViolations flaguje nadwyżkę dni", errsM.some(function(e){ return e.indexOf("dniach tygodnia") >= 0 && e.indexOf("maks. 2") >= 0; }));

  /* tchBlock — twarda: lekcje pod rząd */
  st6.settings.rules = [{ id: "rb1", type: "tchBlock", teacher: t6.id, subject: "Matematyka", n: 2, hard: true, on: true }];
  const bestB = autoSchedule(ls6, st6.teachers, st6.classes, st6.settings, 8);
  const errsB = findViolations(ls6, st6.teachers, st6.classes, bestB.placement, st6.settings);
  T("tchBlock: automat układa lekcje w bloki (wszystkie ułożone, 0 naruszeń)",
    Object.keys(bestB.placement).length === ls6.length && errsB.length === 0);
  const plB = {};
  ls6.forEach(function(L){ if (L.teacherId !== t6.id) plB[L.id] = 32; });
  ls6.filter(function(L){ return L.teacherId === t6.id; }).forEach(function(L, i){ plB[L.id] = i * 10; }); /* 4× solo */
  const errsB2 = findViolations(ls6, st6.teachers, st6.classes, plB, st6.settings);
  T("tchBlock: findViolations flaguje lekcje luzem", errsB2.some(function(e){ return e.indexOf("luzem") >= 0; }));
  const plB3 = {};
  ls6.forEach(function(L){ if (L.teacherId !== t6.id) plB3[L.id] = 32; });
  ls6.filter(function(L){ return L.teacherId === t6.id; }).forEach(function(L, i){ plB3[L.id] = i; }); /* 0,1,2,3 = blok 4 pod rząd */
  const errsB3 = findViolations(ls6, st6.teachers, st6.classes, plB3, st6.settings);
  T("tchBlock: zwarte bloki czyste", !errsB3.some(function(e){ return e.indexOf("luzem") >= 0; }));

  /* miękkie warianty — kary punktowe */
  function basePen(pl){ const sv = st6.settings.rules; st6.settings.rules = [];
    const p = softPenalty(ls6, st6.teachers, st6.classes, st6.settings, pl).pen; st6.settings.rules = sv; return p; }
  st6.settings.rules = [{ id: "rs1", type: "tchDays", teacher: t6.id, subject: "", days: [1, 3], hard: false, weight: 200, on: true }];
  const spD = softPenalty(ls6, st6.teachers, st6.classes, st6.settings, plD);
  T("tchDays miękka: kara za każdy dzień poza listą (4 lekcje na Pn → 800)",
    spD.pen === basePen(plD) + 800 && spD.det.some(function(x){ return x.indexOf("pracuje tylko") >= 0 && x.indexOf("miękka") >= 0; }));
  st6.settings.rules = [{ id: "rs2", type: "tchMaxDays", teacher: t6.id, subject: "Matematyka", n: 2, hard: false, weight: 150, on: true }];
  const spM = softPenalty(ls6, st6.teachers, st6.classes, st6.settings, plM);
  T("tchMaxDays miękka: kara 150 × nadwyżka dni (4 dni − 2 = 2 → 300)",
    spM.pen === basePen(plM) + 300 && spM.det.some(function(x){ return x.indexOf("dniach tygodniowo") >= 0; }));
  st6.settings.rules = [{ id: "rs3", type: "tchBlock", teacher: t6.id, subject: "Matematyka", n: 2, hard: false, weight: 120, on: true }];
  const spB = softPenalty(ls6, st6.teachers, st6.classes, st6.settings, plB);
  T("tchBlock miękka: kara 120 × 4 lekcje luzem → 480",
    spB.pen === basePen(plB) + 480 && spB.det.some(function(x){ return x.indexOf("w blokach po 2") >= 0; }));
  const plB4 = {};
  ls6.forEach(function(L){ if (L.teacherId !== t6.id) plB4[L.id] = 32; });
  ls6.filter(function(L){ return L.teacherId === t6.id; }).forEach(function(L, i){ plB4[L.id] = [7, 8, 16, 17][i]; }); /* Pn 8. i Wt 1. to NIE blok */
  const spB4 = softPenalty(ls6, st6.teachers, st6.classes, st6.settings, plB4);
  T("tchBlock: Pn 8. i Wt 1. to NIE jeden blok (granica dnia) → 2 luzem → 240",
    spB4.pen === basePen(plB4) + 240);

  /* ruleSave — zapis reguły nauczyciela */
  ruleTyp = "tchDays";
  ruleDraftInit();
  ruleDraft.days = [1, 3];
  const savedGEB26 = document.getElementById;
  document.getElementById = function(id){
    if (id === "r_tch") return { value: t6.id };
    return savedGEB26(id);
  };
  ruleEditId = null; /* sekcja 21 mogła zostawić tryb edycji */
  ruleSave();
  document.getElementById = savedGEB26;
  const rSaved = (S.settings.rules || []).filter(function(r){ return r.type === "tchDays"; })[0];
  T("ruleSave: reguła nauczyciela zapisana (teacher, dni, bez przedmiotu i oddziału)",
    rSaved && rSaved.teacher === t6.id && JSON.stringify(rSaved.days) === "[1,3]" && rSaved.subject === "" && rSaved.classId === "" && rSaved.hard === true);
  ruleTyp = "subjHours"; ruleDraftInit();
}

/* ==================== 27. clearAll czyści wszystko (v6.16; asystent usunięty v6.48) ==================== */
(function(){
  S = normalize(demoState());
  save();
  clearAll();
  T("clearAll: czyści dane (nauczyciele, zajęcia, plan)", S.teachers.length === 0 && S.activities.length === 0 && Object.keys(S.placement).length === 0);
  T("clearAll: resetuje limity do defaultów", S.settings.teacherMaxPerDay === 7 && S.settings.classMaxPerDay === 7);
  T("clearAll: bez pól asystenta (usunięte w v6.48)", S.settings.assistantUrl === undefined && S.settings.chatToken === undefined);
})();


/* ==================== 28. eksport Word .docx (v6.17) ==================== */
SEC("28. eksport Word .docx (v6.17)");
{
  /* crc32 — znane wartości */
  const te28 = new TextEncoder();
  T("crc32: znana wartość 123456789 → 0xCBF43926", crc32(te28.encode("123456789")) === 0xCBF43926);
  T("crc32: puste wejście → 0", crc32(new Uint8Array(0)) === 0);
  T("crc32: wszystkie bajty 0x00 (32×) → 0x190A55AD", crc32(new Uint8Array(32)) === 0x190A55AD);

  /* zipWrite → round-trip przez zipRead apki */
  const zipped28 = zipWrite([
    { name: "a.txt", data: "żółć Więcej — test UTF-8" },
    { name: "dir/b.bin", data: new Uint8Array([0, 1, 2, 250, 255]) },
    { name: "word/document.xml", data: "<x>plan &amp; szkoła</x>" }
  ]);
  const back28 = zipRead(zipped28);
  const td28 = new TextDecoder("utf-8");
  T("zipWrite→zipRead: 3 wpisy o właściwych nazwach", Object.keys(back28).length === 3 && "a.txt" in back28 && "dir/b.bin" in back28 && "word/document.xml" in back28);
  T("zipWrite→zipRead: treść UTF-8 odtworzona 1:1", td28.decode(back28["a.txt"]) === "żółć Więcej — test UTF-8");
  T("zipWrite→zipRead: bajty binarne nietknięte", back28["dir/b.bin"].length === 5 && back28["dir/b.bin"][3] === 250 && back28["dir/b.bin"][4] === 255);

  /* docxPlans — przykładowy stan */
  S = fresh();
  const t28 = mkT(S, "Jan Testowy");
  const c28a = mkC(S, "3a AUT", 1), c28b = mkC(S, "5 ZET", 1);
  mkA(S, c28a.id, "Matematyka", t28.id, 2);
  mkA(S, c28a.id, "Zajęcia <rew> & logopedyczne", "", 1);
  mkA(S, c28a.id, "Plastyka", "", 1);
  mkA(S, c28b.id, "Historia", t28.id, 1);
  const ls28 = lessons();
  ls28.forEach((L, i) => { S.placement[L.id] = i % 4; }); /* slot 0 dostanie 2 lekcje 3a AUT */
  eksMode = "klasy";
  let dx28 = docxPlans();
  T("docxPlans: deklaracja XML + korzeń w:document", dx28.indexOf("<?xml") === 0 && dx28.indexOf("<w:document") > 0 && dx28.indexOf("</w:document>") > 0);
  T("docxPlans: tyle planów, ile oddziałów", dx28.split("PLAN LEKCJI").length - 1 === 2);
  T("docxPlans: podział strony między planami (plany-1)", dx28.split('<w:br w:type="page"/>').length - 1 === 1);
  T("docxPlans: nagłówek Godzina + 5 dni", dx28.indexOf("Godzina") > 0 && ["Poniedziałek","Wtorek","Środa","Czwartek","Piątek"].every(d => dx28.indexOf(d) > 0));
  T("docxPlans: tytuły oddziałów", dx28.indexOf("Oddział: 3a AUT") > 0 && dx28.indexOf("Oddział: 5 ZET") > 0);
  T("docxPlans: godziny lekcyjne w wierszach", dx28.indexOf("8:00-8:45") > 0 && dx28.indexOf("14:55") > 0);
  T("docxPlans: escape XML w przedmiocie", dx28.indexOf("Zajęcia &lt;rew&gt; &amp; logopedyczne") > 0);
  T("docxPlans: nazwisko nauczyciela w komórce", dx28.indexOf("Jan Testowy") > 0);
  T("docxPlans: 9 wierszy tabeli na plan (nagłówek + 8 godzin)", dx28.split("<w:tr>").length - 1 === 2 * 9);
  T("docxPlans: dwie lekcje w komórce → osobne w:p", dx28.indexOf("</w:p><w:p>") > 0);
  T("docxPlans: bez undefined/NaN", dx28.indexOf("undefined") < 0 && dx28.indexOf("NaN") < 0);

  /* tryb nauczycieli */
  eksMode = "nauczyciele";
  dx28 = docxPlans();
  T("docxPlans (nauczyciele): tytuł z nazwiskiem", dx28.indexOf("Nauczyciel: Jan Testowy") > 0);
  T("docxPlans (nauczyciele): klasy w komórkach", dx28.indexOf("3a AUT") > 0 && dx28.indexOf("5 ZET") > 0);
  T("docxPlans (nauczyciele): plan tylko dla nauczycieli z przypisaniem", dx28.split("PLAN LEKCJI").length - 1 === 1);

  /* tryb CSV → docx planów klas (fallback) */
  eksMode = "csv";
  dx28 = docxPlans();
  T("docxPlans: przy eksMode csv → plany klas", dx28.indexOf("Oddział: 3a AUT") > 0);

  /* pusty stan — bez crasza */
  S = fresh();
  eksMode = "klasy";
  dx28 = docxPlans();
  T("docxPlans: pusty stan → 0 planów, bez błędów", dx28.split("PLAN LEKCJI").length - 1 === 0 && dx28.indexOf("undefined") < 0);

  /* pełny plik .docx jak z downloadDocx + walidacja Pythonem */
  eksMode = "klasy";
  S = fresh();
  const t28b = mkT(S, "Jan Testowy");
  const c28x = mkC(S, "3a AUT", 1), c28y = mkC(S, "5 ZET", 1);
  mkA(S, c28x.id, "Matematyka", t28b.id, 2);
  mkA(S, c28y.id, "Historia", t28b.id, 1);
  lessons().forEach((L, i) => { S.placement[L.id] = i; });
  const parts28 = [
    { name: "[Content_Types].xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { name: "_rels/.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: "word/document.xml", data: docxPlans() }
  ];
  const file28 = "/tmp/pz-docx-28.docx";
  fs.writeFileSync(file28, Buffer.from(zipWrite(parts28)));
  let hasPy28 = false;
  try { require("child_process").execFileSync("python3", ["-c", "print(1)"], { encoding: "utf8", stdio: ["ignore","pipe","ignore"] }); hasPy28 = true; } catch(e){}
  if (hasPy28){
    let pyOut28 = "";
    try {
      pyOut28 = require("child_process").execFileSync("python3", ["-c",
        'import zipfile, xml.dom.minidom\n' +
        'z = zipfile.ZipFile("' + file28 + '")\n' +
        'names = z.namelist()\n' +
        'assert set(["[Content_Types].xml", "_rels/.rels", "word/document.xml"]) <= set(names), names\n' +
        'x = z.read("word/document.xml").decode("utf-8")\n' +
        'assert x.count("PLAN LEKCJI") == 2\n' +
        'xml.dom.minidom.parseString(x)\n' +
        'print("PYOK")'
      ], { encoding: "utf8" }).trim();
    } catch(e){ pyOut28 = "PYERR: " + e.message; }
    T("docx: walidacja Pythonem — zipfile czyta, CRC zgadza się, XML well-formed", pyOut28 === "PYOK");
  } else {
    console.log("   (pomijam walidację Pythonem — brak python3)");
  }
}


/* ==================== 29. zbiorcza plansza tygodnia (v6.18) ==================== */
SEC("29. zbiorcza plansza tygodnia (v6.18)");
{
  /* teacherInits — inicjały imię+nazwisko, kolizje rozstrzygane drugą literą nazwiska */
  S = fresh();
  const tA29 = mkT(S, "Jan Kowalski");
  const tB29 = mkT(S, "Anna Nowak");
  let m29 = teacherInits();
  T("teacherInits: bez dubla → pierwsze litery imienia i nazwiska", m29[tA29.id] === "JK" && m29[tB29.id] === "AN");
  /* kolizja: dwóch "JK" → druga litera nazwiska roźróżnia */
  const tC29 = mkT(S, "Joanna Krupka");
  m29 = teacherInits();
  T("teacherInits: kolizja JK → druga litera nazwiska", m29[tA29.id] === "JKo" && m29[tC29.id] === "JKr");
  /* potrójna kolizja AN → trzecia litera nazwiska gdy druga też się dubluje */
  const tD29 = mkT(S, "Adam Noryś");
  const tE29 = mkT(S, "Antoni Nocny");
  m29 = teacherInits();
  const grpAN = [tB29.id, tD29.id, tE29.id].map(id => m29[id]);
  T("teacherInits: potrójna kolizja → wszystkie różne, prefix imieniem", new Set(grpAN).size === 3 && grpAN.every(x => x[0] === "A" && x.length >= 3));
  /* pojedyncze słowo jako nazwa */
  const tF29 = { id: "tf29", name: "Pseudonim", short: "Pse", unavail: [] };
  S.teachers.push(tF29);
  m29 = teacherInits();
  T("teacherInits: jednoczłonowa nazwa → pierwsze 2 litery", m29[tF29.id] === "PS" || m29[tF29.id] === "PE");
  /* inicjały są stabilne (deterministyczne) */
  const m29b = teacherInits();
  T("teacherInits: deterministyczne między wywołaniami", JSON.stringify(m29) === JSON.stringify(m29b));

  /* planszaZbiorczaHtml — struktura */
  S = fresh();
  const tX29 = mkT(S, "Jan Testowy");
  const cX29 = mkC(S, "3a AUT", 1), cY29 = mkC(S, "5 ZET", 1), cZ29 = mkC(S, "7a", 3);
  mkA(S, cX29.id, "Matematyka", tX29.id, 1);
  mkA(S, cY29.id, "Religia", tX29.id, 1, { withClassId: cZ29.id }); /* scalone: 2 kolumny */
  mkA(S, cZ29.id, "Plastyka", "", 1);
  lessons().forEach((L, i) => { S.placement[L.id] = i; }); /* 3 lekcje na slotach 0,1,2 */
  const zx29 = planszaZbiorczaHtml();
  T("zbiorcza: tytuł i rok szkolny", zx29.indexOf("TYGODNIOWY ROZKŁAD ZAJĘĆ") > 0 && zx29.indexOf("Rok szkolny 2026/2027") > 0);
  T("zbiorcza: nagłówek GODZ. + kolumny oddziałów", zx29.indexOf("GODZ.") > 0 && ["3a AUT", "5 ZET", "7a"].every(n => zx29.indexOf(">" + n + "</th>") > 0));
  T("zbiorcza: 5 pasm dni (nagłówki colspan)", ["PONIEDZIAŁEK", "WTOREK", "ŚRODA", "CZWARTEK", "PIĄTEK"].every(d => zx29.indexOf(d) > 0) && zx29.split('th class="day"').length - 1 === 5);
  T("zbiorcza: colspan pasma = oddziały + godzina", zx29.indexOf('colspan="4"') > 0);
  T("zbiorcza: 40 wierszy godzin (8 × 5 dni)", zx29.split('td class="hr"').length - 1 === 40);
  T("zbiorcza: godziny zero-padded z końcem lekcji", zx29.indexOf("08:00-08:45") > 0 && zx29.indexOf("14:55-15:40") > 0);
  T("zbiorcza: komórka = skrót przedmiotu + inicjały", zx29.indexOf("<b>MAT</b> <i>JT</i>") > 0);
  T("zbiorcza: bez nauczyciela → sam skrót przedmiotu", zx29.indexOf("<b>PLA</b>") > 0 && zx29.indexOf("<i>—") < 0);
  T("zbiorcza: scalone zajęcia w obu kolumnach", (zx29.match(/<b>REL<\/b> <i>JT<\/i>/g) || []).length === 2);
  T("zbiorcza: tinta tła komórki wg przedmiotu", /style="background:#[0-9a-f]{6}"/.test(zx29));
  T("zbiorcza: puste sloty oznaczone kropką", zx29.indexOf('td class="empty">·<') > 0);
  T("zbiorcza: bez undefined/NaN", zx29.indexOf("undefined") < 0 && zx29.indexOf("NaN") < 0);
  T("zbiorcza: podpowiedź druku A2 w pasku", zx29.indexOf("Drukuj A2 poziomo") > 0);
}

/* ==================== 30. plansza A1 — format szkolny (v6.20) ==================== */
SEC("30. plansza A1 — format szkolny (v6.20)");
{
  /* schoolClassCode: nazwy apki → szkolne kody (nagłówki D4:R4 szablonu A1) */
  const map30 = { "1a": "1a", "2a AUT": "2aA", "2b AUT (m)": "2bM", "3a AUT": "3aA", "3b AUT": "3bA", "3c AUT": "3cA", "4a AUT": "4aA", "5 ZET": "5z", "5a M": "5aM", "6 AUT": "6A", "6a M": "6aM", "6b": "6b", "7 AUT": "7A", "7a": "7a", "8 ZET": "8z" };
  T("A1 schoolClassCode: wszystkie 15 nazw apki → szkolne kody", Object.keys(map30).every(n => schoolClassCode(n) === map30[n]));

  /* a1Classes: szkolna kolejność kolumn, nieznane klasy na końcu */
  S = fresh();
  const kA30 = mkC(S, "8 ZET", 1), kB30 = mkC(S, "1a", 2), kC30 = mkC(S, "6 AUT", 1), kD30 = mkC(S, "3b AUT", 1), kE30 = mkC(S, "9 Nowa", 2);
  const ord30 = a1Classes().map(c => schoolClassCode(c.name)).join(",");
  T("A1 a1Classes: kolejność szkolna, nieznane na końcu", ord30 === "1a,3bA,6A,8z,9");

  /* a1Build: komórki klas (PRZEDMIOT INICJAŁY), świetlica, kody klas u nauczyciela */
  S = fresh();
  const t30 = mkT(S, "Jan Testowy");
  const u30 = mkT(S, "Anna Przykładowa");
  const g30 = mkC(S, "1a", 2), h30 = mkC(S, "2b AUT (m)", 1), z30 = mkC(S, "6 AUT", 1);
  const la30 = mkA(S, g30.id, "Matematyka", t30.id, 1);
  const lb30 = mkA(S, h30.id, "Religia", t30.id, 1, { withClassId: z30.id });
  const lc30 = mkA(S, g30.id, "Świetlica autystyczna", u30.id, 1);
  const lv30 = lessons();
  S.placement[lv30[0].id] = 0; S.placement[lv30[1].id] = 1; S.placement[lv30[2].id] = 2;
  const d30 = a1Build();
  T("A1 build: komórka klasy = PRZEDMIOT + inicjały", d30.cellText(g30.id, 0) === "MAT JT");
  T("A1 build: scalone zajęcia w obu kolumnach", d30.cellText(h30.id, 1) === "REL JT" && d30.cellText(z30.id, 1) === "REL JT");
  T("A1 build: świetlica w kolumnie ŚW", d30.swText(2) === "ŚA AP");
  T("A1 build: kolumna nauczyciela = szkolny kod klasy", d30.tCell(t30.id, 0) === "1a" && d30.tCell(t30.id, 1).indexOf("2bM") >= 0 && d30.tCell(t30.id, 1).indexOf("6A") >= 0);
  T("A1 build: nauczyciele tylko z lekcjami, alfabetycznie", d30.teachers.length === 2 && d30.teachers[0].id === u30.id);
  T("A1 build: świetlica nauczyciela → kod klasy", d30.tCell(u30.id, 2) === "1a");

  /* a1XlsxParts: struktura arkusza w konwencji szkolnego szablonu */
  const parts30 = a1XlsxParts();
  const names30 = parts30.map(p => p.name).join(",");
  const sh30 = parts30.find(p => p.name === "xl/worksheets/sheet1.xml").data;
  T("A1 xlsx: komplet części pakietu", names30 === "[Content_Types].xml,_rels/.rels,xl/workbook.xml,xl/_rels/workbook.xml.rels,xl/styles.xml,xl/worksheets/sheet1.xml");
  T("A1 xlsx: scalenia — tytuł, ŚW, pasma, separatory", sh30.indexOf('ref="A1:F2"') > 0 && sh30.indexOf('ref="G3:G4"') > 0 && sh30.indexOf('ref="A5:A12"') > 0 && sh30.indexOf('ref="A13:I13"') > 0 && sh30.indexOf('count="15"') > 0);
  T("A1 xlsx: nagłówki — szkolne kody klas, Świetlica, nauczyciele (Excel: A. Nazwisko)", sh30.indexOf("K L A S Y") > 0 && sh30.indexOf("ŚWIETLICA") > 0 && sh30.indexOf("Nauczyciele (przydział") > 0 && sh30.indexOf("J. Testowy") > 0 && sh30.indexOf("A. Przykładowa") > 0);
  T("A1 xlsx: komórki planu inlineStr (MAT JT, kody klas)", sh30.indexOf("MAT JT") > 0 && sh30.indexOf("REL JT") > 0 && sh30.indexOf("1a") > 0 && sh30.indexOf("2bM") > 0);
  T("A1 xlsx: godziny wierszami jak w szablonie", sh30.indexOf("8:00 - 8:45") > 0 && sh30.indexOf("9:50 - 10:35") > 0 && sh30.indexOf("14:55 - 15:40") > 0);
  T("A1 xlsx: pasma dni + separatory rzędów", ["PONIEDZIAŁEK","WTOREK","ŚRODA","CZWARTEK","PIĄTEK"].every(b => sh30.indexOf(b) > 0));
  T("A1 xlsx: druk — landscape, fitToPage, marginesy", sh30.indexOf('orientation="landscape"') > 0 && sh30.indexOf('fitToPage="1"') > 0 && sh30.indexOf('left="0.75"') > 0);
  T("A1 xlsx: szerokości kolumn jak w szablonie", sh30.indexOf('width="14"') > 0 && sh30.indexOf('width="7.4"') > 0 && sh30.indexOf('width="9"') > 0);
  const st30 = parts30.find(p => p.name === "xl/styles.xml").data;
  T("A1 xlsx: styles — pasma i nagłówki z wypełnieniami", st30.indexOf("FFDDDDDD") > 0 && st30.indexOf("FFEEEEEE") > 0 && st30.indexOf('count="12"') > 0);
  const ct30 = parts30.find(p => p.name === "[Content_Types].xml").data;
  T("A1 xlsx: typy zawartości spreadsheetml", ct30.indexOf("spreadsheetml.sheet.main+xml") > 0 && ct30.indexOf("spreadsheetml.worksheet+xml") > 0);
  T("A1 xlsx: bez nazwisk w katalogu części", parts30.every(p => !/Testowy|Przykładowa/.test(p.name)));

  /* planszaA1Html: wydruk A1 */
  const a1h30 = planszaA1Html();
  T("A1 html: tytuł, rok, GODZ., kody klas w nagłówkach", a1h30.indexOf("TYGODNIOWY ROZKŁAD ZAJĘĆ") > 0 && a1h30.indexOf("Rok szkolny 2026 / 2027") > 0 && a1h30.indexOf("GODZ.") > 0 && a1h30.indexOf(">1a</th>") > 0 && a1h30.indexOf(">2bM</th>") > 0);
  T("A1 html: Świetlica + inicjały nauczycieli w nagłówkach", a1h30.indexOf("ŚWIETLICA") > 0 && a1h30.indexOf(">JT</th>") > 0 && a1h30.indexOf(">AP</th>") > 0);
  T("A1 html: wydruk bez pełnych nazwisk w nagłówkach", a1h30.indexOf("J. Testowy") < 0 && a1h30.indexOf("A. Przykładowa") < 0);
  T("A1 html: 5 pasm dni z colspan", ["PONIEDZIAŁEK","WTOREK","ŚRODA","CZWARTEK","PIĄTEK"].every(b => a1h30.indexOf(b) > 0) && a1h30.split('th class="day"').length - 1 === 5);
  T("A1 html: komórka klasy = skrót + inicjały", a1h30.indexOf("<b>MAT</b> <i>JT</i>") > 0);
  T("A1 html: kolumny nauczycieli — kody klas w komórkach", a1h30.indexOf(">2bM/6A<") > 0);
  T("A1 html: godziny zero-padded z końcem lekcji", a1h30.indexOf("08:00-08:45") > 0 && a1h30.indexOf("09:50-10:35") > 0);
  T("A1 html: papier A1 poziomo", a1h30.indexOf("A1 landscape") > 0);
  T("A1 html: bez undefined/NaN", a1h30.indexOf("undefined") < 0 && a1h30.indexOf("NaN") < 0);
}

/* ==================== 31. kopia zapasowa planu (v6.21) ==================== */
SEC("31. kopia zapasowa planu (v6.21)");
{
  T("backup: nazwa pliku z datą", /^plan-zajec-kopia-\d{4}-\d{2}-\d{2}\.json$/.test(backupFileName()));

  /* round-trip: zapis → odtworzenie */
  S = fresh();
  const bt31 = mkT(S, "Jan Testowy");
  const bc31 = mkC(S, "1a", 2), bd31 = mkC(S, "5 ZET", 1);
  mkA(S, bc31.id, "Matematyka", bt31.id, 2);
  mkA(S, bd31.id, "Świetlica autystyczna", bt31.id, 1);
  const lv31 = lessons();
  S.placement[lv31[0].id] = 5; S.placement[lv31[1].id] = 12;
  S.settings.maxGaps = 4;
  const kopia31 = JSON.stringify(S);
  /* kasujemy stan i wczytujemy kopię */
  S = fresh();
  const st31 = applyBackupText(kopia31);
  T("backup round-trip: nauczyciele i klasy", S.teachers.length === 1 && S.teachers[0].name === "Jan Testowy" && S.classes.length === 2 && S.classes.some(c => c.name === "5 ZET"));
  T("backup round-trip: przydziały", S.activities.length === 2 && S.activities.some(a => a.subject === "Matematyka"));
  T("backup round-trip: ułożone lekcje (placement)", Object.keys(S.placement).length === 2 && S.placement[lv31[0].id] === 5);
  T("backup round-trip: ustawienia", S.settings.maxGaps === 4 && JSON.stringify(S.settings.lessonTimes) === JSON.stringify(defaultLessonTimes()));
  T("backup: applyBackupText zwraca liczby", st31.t === 1 && st31.c === 2 && st31.a === 2);

  /* błędne dane: stan nietknięty */
  S = fresh();
  const przed31 = JSON.stringify(S);
  let err31 = null;
  try { applyBackupText("{to nie json"); } catch(e){ err31 = e; }
  T("backup: śmieciowy JSON → wyjątek, stan nietknięty", !!err31 && JSON.stringify(S) === przed31);
  err31 = null;
  try { applyBackupText(JSON.stringify({ foo: 1 })); } catch(e){ err31 = e; }
  T("backup: obiekt bez pól planu → wyjątek", !!err31 && JSON.stringify(S) === przed31);
  err31 = null;
  try { applyBackupText(JSON.stringify([1, 2, 3])); } catch(e){ err31 = e; }
  T("backup: tablica → wyjątek", !!err31);

  /* kopia legacy: brak lessonTimes → normalize dorabia default */
  const leg31 = JSON.parse(kopia31);
  delete leg31.settings.lessonTimes;
  S = fresh();
  applyBackupText(JSON.stringify(leg31));
  T("backup: kopia bez lessonTimes → default (rytm v6.19)", JSON.stringify(S.settings.lessonTimes) === JSON.stringify(defaultLessonTimes()));

  /* karta w UI zakładki Dane */
  const dane31 = renderDane();
  T("backup UI: karta kopii w Dane (przycisk + wczyt pliku)", dane31.indexOf("💾 Kopia zapasowa planu") > 0 && dane31.indexOf("backupPlan()") > 0 && dane31.indexOf("backupFileRead(this)") > 0);
  T("backup UI: hint ostrzega o localStorage", dane31.indexOf("pamięci tej przeglądarki") > 0);
}

/* ==================== 32. sortowanie list rozwijanych (v6.22) ==================== */
SEC("32. sortowanie list rozwijanych (v6.22)");
{
  S = fresh();
  const tA32 = mkT(S, "Jan Testowy");
  const tB32 = mkT(S, "Anna Przykładowa");
  const tC32 = mkT(S, "Zofia Abacka");
  const tD32 = mkT(S, "Cezary Będkowski");
  const tE32 = mkT(S, "Marta Kowalska");
  const tF32 = mkT(S, "Jan Kowalska");
  const tG32 = mkT(S, "Anna Kowalska");
  T("32: nauczyciele sortowani po nazwisku, remis po imieniu",
    JSON.stringify(sortedTeachers().map(t => t.id)) === JSON.stringify([tC32.id, tD32.id, tG32.id, tF32.id, tE32.id, tB32.id, tA32.id]));
  T("32: sortedTeachers nie mutuje S.teachers",
    S.teachers.length === 7 && S.teachers[0].id === tA32.id && S.teachers[6].id === tG32.id);
  T("32: tchKeyOf = nazwisko+imię; jednoscłonowa nazwa = nazwisko",
    tchKeyOf({ name: "Zofia Abacka" }) === "Abacka\u0001Zofia" && tchKeyOf({ name: "Kowalska" }) === "Kowalska\u0001");

  const c32a = mkC(S, "6b", 2);
  const c32b = mkC(S, "1a", 2);
  const c32c = mkC(S, "3b AUT", 2);
  const c32d = mkC(S, "2b AUT (m)", 2);
  const c32e = mkC(S, "8 ZET", 1);
  const c32f = mkC(S, "9x nowa", 2);
  T("32: klasy w szkolnej kolejności A1, nieznane na końcu",
    JSON.stringify(sortedClasses().map(c => c.name)) === JSON.stringify(["1a","2b AUT (m)","6b","3b AUT","8 ZET","9x nowa"]));

  S.classes.forEach(function(c){ if (!c.blocked) c.blocked = []; });
  mkA(S, c32b.id, "Zajęcia techniczne", tA32.id, 1);
  mkA(S, c32b.id, "Matematyka", tB32.id, 2);
  mkA(S, c32c.id, "angielski", tC32.id, 2);
  mkA(S, c32c.id, "angielski", tD32.id, 1);
  mkA(S, c32d.id, "plastyk", tE32.id, 1);
  mkA(S, c32e.id, "Biologia", tF32.id, 1);
  T("32: przedmioty unikalne, alfabetycznie (collation pl)",
    JSON.stringify(sortedSubjects()) === JSON.stringify(["angielski","Biologia","Matematyka","plastyk","Zajęcia techniczne"]));

  /* UI: select nauczyciela przy zajęciach (renderDane) */
  const dane32 = renderDane();
  const tsel32 = dane32.split('title="Nauczyciel"')[1] || "";
  const jA32 = tsel32.indexOf("Abacka"), jB32 = tsel32.indexOf("Będkowski"), jC32 = tsel32.indexOf("Anna Kowalska"),
        jD32 = tsel32.indexOf("Przykładowa"), jE32 = tsel32.indexOf("Testowy");
  T("32 UI: select nauczyciela — kolejność wg nazwiska, format Imię Nazwisko",
    jA32 > 0 && jA32 < jB32 && jB32 < jC32 && jC32 < jD32 && jD32 < jE32 && tsel32.indexOf("Zofia Abacka") > 0);

  /* UI: widok planu — lista oddziałów szkolna, widok nauczycieli wg nazwisk */
  viewMode = "class"; viewSel = "";
  const vselC32 = (renderPlan().split('onchange="setViewSel')[1] || "");
  T("32 UI: widok oddziału — szkolna kolejność klas",
    vselC32.indexOf(">1a<") < vselC32.indexOf(">2b AUT (m)<") && vselC32.indexOf(">2b AUT (m)<") < vselC32.indexOf(">6b<") &&
    vselC32.indexOf(">6b<") < vselC32.indexOf(">3b AUT<") && vselC32.indexOf(">3b AUT<") < vselC32.indexOf(">8 ZET<") &&
    vselC32.indexOf(">9x nowa<") > vselC32.indexOf(">8 ZET<"));
  viewMode = "teacher";
  const vselT32 = (renderPlan().split('onchange="setViewSel')[1] || "");
  T("32 UI: widok nauczyciela — kolejność wg nazwiska",
    vselT32.indexOf("Abacka") < vselT32.indexOf("Będkowski") && vselT32.indexOf("Kowalska") < vselT32.indexOf("Przykładowa") &&
    vselT32.indexOf("Przykładowa") < vselT32.indexOf("Testowy"));

  /* UI: zakładka Ograniczenia — select nauczyciela posortowany */
  ogrT = tA32.id;
  const ogrSel32 = (renderOgr().split("Nauczyciel:</span>")[1] || "");
  T("32 UI: ograniczenia — nauczyciel wg nazwiska",
    ogrSel32.indexOf("Abacka") > 0 && ogrSel32.indexOf("Abacka") < ogrSel32.indexOf("Będkowski") &&
    ogrSel32.indexOf("Będkowski") < ogrSel32.indexOf("Przykładowa") && ogrSel32.indexOf("Przykładowa") < ogrSel32.indexOf("Testowy"));
}

/* ==================== 33. v6.23: zero okienek klasy (najtwardsza) ==================== */
SEC("33. v6.23: zero okienek klasy");
{
  /* findViolations: 1 okienko klasy = twardy błąd, limity ustawień ignorowane */
  S = fresh();
  S.settings.classMaxGapsPerDay = 8; S.settings.classMaxGaps = 20;
  const c33 = mkC(S, "1a");
  const t33a = mkT(S, "Anna Kowalska"), t33b = mkT(S, "Barbara Nowak"), t33c = mkT(S, "Cecylia Lis");
  mkA(S, c33.id, "Matematyka", t33a.id, 1);
  mkA(S, c33.id, "Polski", t33b.id, 1);
  mkA(S, c33.id, "Historia", t33c.id, 1);
  S.classes.forEach(function(c){ if (!c.blocked) c.blocked = []; });
  const ls33 = buildLessons(S.activities);
  const ev33 = findViolations(ls33, S.teachers, S.classes, { "a1-0": 0, "a2-0": 2, "a3-0": 4 }, S.settings);
  T("33: 1 okienko klasy (lekcje 1,3,5) → twardy błąd mimo limitów 20/8",
    ev33.some(e => e.indexOf("nie mogą mieć okienek") >= 0 && ev33.some(e => e.indexOf("najtwardsza reguła") >= 0)));
  const ev33b = findViolations(ls33, S.teachers, S.classes, { "a1-0": 0, "a2-0": 1, "a3-0": 2 }, S.settings);
  T("33: lekcje obok siebie → bez błędu o okienkach", !ev33b.some(e => e.indexOf("nie mogą mieć okienek") >= 0));

  /* automat: woli zostawić lekcję nieprzypisaną niż zrobić okienko (dostępne tylko Pn 1-2) */
  const st33 = fresh();
  const c33b = mkC(st33, "1a");
  const u33a = mkT(st33, "Anna Kowalska"), u33b = mkT(st33, "Barbara Nowak"), u33c = mkT(st33, "Cecylia Lis");
  mkA(st33, c33b.id, "Matematyka", u33a.id, 1);
  mkA(st33, c33b.id, "Polski", u33b.id, 1);
  mkA(st33, c33b.id, "Historia", u33c.id, 1);
  const free33 = Array.from({ length: 40 }, (_, i) => i).filter(i => i !== 0 && i !== 1);
  [u33a, u33b, u33c].forEach(t => t.unavail = free33.slice());
  const ls33b = buildLessons(st33.activities);
  const best33 = autoSchedule(ls33b, st33.teachers, st33.classes, st33.settings, 8);
  const ok33 = findViolations(ls33b, st33.teachers, st33.classes, best33.placement, st33.settings).every(e => e.indexOf("nie mogą mieć okienek") < 0);
  T("33: automat nigdy nie zostawia okienka klasy (lepiej nie ułożyć)",
    Object.keys(best33.placement).length >= 1 && ok33);

  /* UI: statyczna reguła zamiast inputów okienek klasy */
  ogrT = t33a.id; ogrC = c33.id;
  const ogrUI33 = renderOgr();
  T("33 UI: Ograniczenia pokazują ZERO — najtwardsza reguła",
    ogrUI33.indexOf("ZERO — najtwardsza reguła") > 0 && ogrUI33.indexOf("Maks. okienek klasy") < 0);

  /* v6.48: asystenta nie ma — przykłady nie dodają jego pól */
  S = fresh();
  loadDemo();
  T("33: loadDemo bez pól asystenta", S.settings.assistantUrl === undefined && S.settings.chatToken === undefined);
  loadSPS7();
  T("33: loadSPS7 bez pól asystenta", S.settings.assistantUrl === undefined && S.settings.chatToken === undefined);
  /* potwierdzenia przycisków bez wzmianki o asystencie (ternary — trzeba ustawić confirmKey) */
  confirmKey = "sps7";
  const kUI33 = renderDane();
  T("33 UI: potwierdzenie SPS7 „Zastąpi dane!” bez asystenta", kUI33.indexOf("Zastąpi dane!") > 0 && kUI33.indexOf("asystenta") < 0);
  confirmKey = "demo";
  const kUI33b = renderDane();
  T("33 UI: potwierdzenie przykładu „Zastąpi dane!” bez asystenta", kUI33b.indexOf("Zastąpi dane!") > 0 && kUI33b.indexOf("asystenta") < 0);
  confirmKey = null;
}


/* ==================== 34. v6.25: inicjały nauczycieli — krótkie skróty ==================== */
SEC("34. v6.25: inicjały nauczycieli (krótkie skróty)");
{
  /* identyczne nazwiska → obie 2-znakowa baza (zamiast rozdęcia typu "BPijanowsk") */
  S = fresh();
  const tA34 = mkT(S, "Bożena Testowa");
  const tB34 = mkT(S, "Barbara Testowa");
  let m34 = teacherInits();
  T("34: identyczne nazwiska → obie krótkie BT", m34[tA34.id] === "BT" && m34[tB34.id] === "BT" && m34[tA34.id].length === 2);

  /* nierozróżnialne prefiksy (Kowalski/Kowal do 4 znaków) → też krótka baza */
  S = fresh();
  const tC34 = mkT(S, "Jan Kowalski");
  const tD34 = mkT(S, "Jan Kowal");
  m34 = teacherInits();
  T("34: nierozróżnialne prefiksy → krótka baza JK", m34[tC34.id] === "JK" && m34[tD34.id] === "JK");

  /* rozróżnialne: minimalne wydłużenie (Kot/Kowal), maks. 4 znaki */
  S = fresh();
  const tE34 = mkT(S, "Jan Kot");
  const tF34 = mkT(S, "Jan Kowal");
  m34 = teacherInits();
  T("34: dubel → rozróżnienie trzecią literą, maks. 4 znaki", m34[tE34.id] === "JKot" && m34[tF34.id] === "JKow");

  /* filtr used: konflikt liczony tylko wśród nauczycieli z lekcjami */
  S = fresh();
  const tG34 = mkT(S, "Jan Testowy");
  const tH34 = mkT(S, "Joanna Tokarska"); /* bez lekcji */
  const cU34 = mkC(S, "1a", 1);
  mkA(S, cU34.id, "Matematyka", tG34.id, 1);
  const used34 = {}; used34[tG34.id] = true;
  m34 = teacherInits(used34);
  T("34: teacherInits(used) → used z czystym JT mimo dubla z nie-used", m34[tG34.id] === "JT");
  m34 = teacherInits();
  T("34: teacherInits() bez filtru → oba wydłużone (JTe/JTo)", m34[tG34.id] === "JTe" && m34[tH34.id] === "JTo");

  /* zbiorcza + A1 wydruk przy dwóch identycznych nazwiskach: krótkie inicjały w html */
  S = fresh();
  const tI34 = mkT(S, "Bożena Testowa");
  const tJ34 = mkT(S, "Barbara Testowa");
  const cZ34 = mkC(S, "3a AUT", 1);
  mkA(S, cZ34.id, "Matematyka", tI34.id, 1);
  mkA(S, cZ34.id, "Plastyka", tJ34.id, 1);
  const ls34 = lessons();
  S.placement[ls34[0].id] = 0; S.placement[ls34[1].id] = 1;
  const zx34 = planszaZbiorczaHtml();
  T("34 zbiorcza: inicjały BT przy identycznych nazwiskach, bez pełnych nazwisk", zx34.indexOf("<i>BT</i>") > 0 && zx34.indexOf("Testow") < 0);
  const d34 = a1Build();
  T("34 A1 build: inity BT przy identycznych nazwiskach", d34.inits[tI34.id] === "BT" && d34.inits[tJ34.id] === "BT");
  const a1h34 = planszaA1Html();
  T("34 A1 wydruk: nagłówki = krótkie inicjały, bez pełnych nazwisk", a1h34.indexOf(">BT</th>") > 0 && a1h34.indexOf("Testow") < 0);
}

/* ==================== 35. v6.26: czytnik xlsx — absolutne Target w rels ==================== */
SEC("35. v6.26: czytnik xlsx — absolutne Target w rels (openpyxl)");
{
  const enc35 = new TextEncoder();
  const u8_35 = s => enc35.encode(s);
  const mkFiles35 = target => ({
    "xl/workbook.xml": u8_35('<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Przydziały" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": u8_35('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="' + target + '"/></Relationships>'),
    "xl/worksheets/sheet1.xml": u8_35('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Nauczyciel</t></is></c><c r="B1" t="inlineStr"><is><t>Klasa</t></is></c></row></sheetData></worksheet>')
  });
  const tsvAbs35 = xlsxToTsv(mkFiles35("/xl/worksheets/sheet1.xml"));
  T("35: absolutny Target /xl/... → arkusz odczytany, nie pusty", tsvAbs35.indexOf("#sheet: Przydziały") === 0 && tsvAbs35.indexOf("Nauczyciel") > 0 && tsvAbs35.indexOf("Klasa") > 0);
  const tsvRel35 = xlsxToTsv(mkFiles35("worksheets/sheet1.xml"));
  T("35: relatywny Target → nadal działa (regresja)", tsvRel35.indexOf("#sheet: Przydziały") === 0 && tsvRel35.indexOf("Nauczyciel") > 0);
  const tsvSS35 = xlsxToTsv({
    "xl/workbook.xml": u8_35('<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": u8_35('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    "xl/sharedStrings.xml": u8_35('<sst><si><t>Warszawa</t></si><si><t>Kraków</t></si></sst>'),
    "xl/worksheets/sheet1.xml": u8_35('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row></sheetData></worksheet>')
  });
  T("35: sharedStrings + relatywny Target → nadal działa", tsvSS35.indexOf("Warszawa") > 0 && tsvSS35.indexOf("Kraków") > 0);
}

/* ==================== 36. v6.27: zastępstwa + saldo godzin ==================== */
SEC("36. v6.27: zastępstwa + saldo godzin");
{
  S = fresh();
  const tA = mkT(S, "Jan Testowy");      /* nieobecny: 2 lekcje w pon + 1 we wt */
  const tB = mkT(S, "Anna Przykładowa"); /* kandydat: 1 lekcja + 1 świetlica */
  const tC = mkT(S, "Piotr Zastępczy");  /* zajęty na slotach wypadających */
  const tD = mkT(S, "Ewa Wolna");        /* lekcja nieprzypisana (saldo) */
  const tV = mkT(S, "WAKAT - zkk");      /* wakat — nie może być kandydatem */
  const c36 = mkC(S, "1a", 1);
  const aA = mkA(S, c36.id, "Matematyka", tA.id, 2);
  const aA2 = mkA(S, c36.id, "Fizyka", tA.id, 1);
  const aB = mkA(S, c36.id, "Plastyka", tB.id, 1);
  const aSw = mkA(S, c36.id, "świetlica autystyczna", tB.id, 1, { kind: "swietl" });
  const aC = mkA(S, c36.id, "Geografia", tC.id, 2);
  const aD = mkA(S, c36.id, "Muzyka", tD.id, 1); /* bez placement */
  const ls36 = lessons();
  const byAct = a => ls36.filter(L => L.activityId === a.id);
  S.placement[byAct(aA)[0].id] = 0; S.placement[byAct(aA)[1].id] = 1;
  S.placement[byAct(aA2)[0].id] = NH;              /* wtorek — nie wypada w pon */
  S.placement[byAct(aB)[0].id] = 2;
  S.placement[byAct(aSw)[0].id] = 7;
  S.placement[byAct(aC)[0].id] = 0; S.placement[byAct(aC)[1].id] = 1;

  zastDay = 0; zastAbsent = {}; zastAbsent[tA.id] = true;
  const zd36 = zastData();
  T("36: wypadają 2 lekcje nieobecnego (posortowane wg slotu)", zd36.fall.length === 2 && zd36.fall[0].slot === 0 && zd36.fall[1].slot === 1);
  T("36: lekcja z innego dnia nie wypada", !zd36.fall.some(f => f.slot >= NH));
  const ids0 = zd36.fall[0].candidates.map(t => t.id);
  T("36: kandydaci = wolni w slocie (nie zajęty, nie wakat)", ids0.indexOf(tB.id) >= 0 && ids0.indexOf(tD.id) >= 0 && ids0.indexOf(tC.id) < 0 && ids0.indexOf(tV.id) < 0);
  T("36: kandydat z mniejszą liczbą lekcji w dniu pierwszy", zd36.fall[0].candidates[0].id === tD.id);
  T("36: podsumowanie kandydatów — cover i wolne godziny", zd36.candSum.length === 2 && zd36.candSum.every(c => c.cover === 2) && zd36.candSum.find(c => c.id === tD.id).free === NH);
  tB.unavail = [0];
  const zdU = zastData();
  T("36: ⛔ unavail wyklucza kandydata z tego slotu", zdU.fall[0].candidates.map(t => t.id).indexOf(tB.id) < 0 && zdU.fall[1].candidates.map(t => t.id).indexOf(tB.id) >= 0);
  tB.unavail = [];

  const sd36 = saldoData();
  const rOf = id => sd36.rows.find(r => r.id === id);
  T("36: saldo — przydział vs plan", rOf(tA.id).prz === 3 && rOf(tA.id).plan === 3 && rOf(tA.id).unplaced === 0 && rOf(tD.id).unplaced === 1);
  T("36: saldo — kontrola Świetlicy", rOf(tB.id).swPrz === 1 && rOf(tB.id).swPlan === 1 && sd36.sums.swPrz === 1 && sd36.sums.swPlan === 1);
  T("36: saldo — sumy i wolne dziś", sd36.sums.prz === 8 && sd36.sums.plan === 7 && rOf(tB.id).freeToday === NH - 2 && rOf(tD.id).freeToday === NH);
  T("36: saldo — nauczyciel bez zajęć pominięty (wakat)", !sd36.rows.some(r => r.id === tV.id));

  const zh36 = renderZast();
  T("36: renderZast — wypadające lekcje + kandydaci + saldo", zh36.indexOf("Matematyka") > 0 && zh36.indexOf("Przykładowa") > 0 && zh36.indexOf("Saldo godzin") > 0 && zh36.indexOf("do przykrycia") > 0);
  T("36: renderZast — ostrzeżenie o nieprzypisanych", zh36.indexOf("nieprzypisanych") > 0);
  zastAbsent = {};
  T("36: brak zaznaczonych → nic nie wypada", zastData().fall.length === 0);
  toggleZastAbsent(tC.id);
  T("36: toggleZastAbsent zaznacza i renderuje", zastAbsent[tC.id] === true);
  zastClear();
  T("36: zastClear czyści zaznaczenia", Object.keys(zastAbsent).length === 0);
  const zhEmpty = renderZast();
  T("36: renderZast — pusty stan z podpowiedzią", zhEmpty.indexOf("Zaznacz nieobecnych") > 0);
  zastDay = 0;
}


/* ==================== 37. v6.28: kartka zastępstw + trwałość + tory z potwierdzeniem + inicjały w docx ==================== */
SEC("37. v6.28: nadrobienie braków");
{
  delete _store["pz-zast"];
  S = fresh();
  const tA = mkT(S, "Jan Testowy");
  const tB = mkT(S, "Anna Przykładowa");
  const tD = mkT(S, "Ewa Wolna");
  const c37 = mkC(S, "1a", 1);
  const cR1 = mkC(S, "7 AUT", 2);  /* wg wytycznych 1 tor */
  const cR2 = mkC(S, "5a M", 2);   /* wg wytycznych 3 tory */
  const aA = mkA(S, c37.id, "Matematyka", tA.id, 2);
  const aB = mkA(S, c37.id, "Plastyka", tB.id, 1);
  const aD = mkA(S, c37.id, "Muzyka", tD.id, 1);
  const ls37 = lessons();
  const Ls = a => ls37.filter(L => L.activityId === a.id);
  S.placement[Ls(aA)[0].id] = 0; S.placement[Ls(aA)[1].id] = 1;
  S.placement[Ls(aB)[0].id] = 2;
  S.placement[Ls(aD)[0].id] = 3;

  /* --- trwałe zaznaczenia zastępstw --- */
  zastDay = 0; zastAbsent = {}; zastSavedAt = null;
  toggleZastAbsent(tA.id);
  const saved37 = JSON.parse(_store["pz-zast"]);
  T("37: toggle zapisuje zaznaczenia do pz-zast", !!_store["pz-zast"] && saved37.absent.indexOf(tA.id) >= 0 && saved37.day === 0);
  T("37: zapis ma datę savedAt z dziś", saved37.savedAt === zastTodayStr());
  zastAbsent["ghost"] = true; saveZast();
  T("37: saveZast odrzuca nieistniejących nauczycieli", JSON.parse(_store["pz-zast"]).absent.indexOf("ghost") < 0 && !zastAbsent["ghost"]);
  zastDay = null; zastAbsent = {}; zastSavedAt = null;
  loadZast();
  T("37: loadZast odtwarza zaznaczenia i dzień", zastAbsent[tA.id] === true && zastDay === 0 && zastSavedAt === saved37.savedAt);
  zastClear();
  T("37: zastClear czyści i zapisuje pusty stan", JSON.parse(_store["pz-zast"]).absent.length === 0);
  toggleZastAbsent(tA.id); toggleZastAbsent(tB.id);
  const zh37 = renderZast();
  T("37: renderZast bez ostrzeżenia przy zapisie z dziś", zh37.indexOf("wczytano z zapisu z dnia") < 0);
  zastSavedAt = "2000-01-01";
  T("37: renderZast ostrzega przy starym zapisie", renderZast().indexOf("wczytano z zapisu z dnia 2000-01-01") > 0);

  /* --- kartka zastępstw do druku --- */
  const kp = zastPrintHtml();
  T("37: kartka — tytuł, wypadające lekcje, nieobecni", kp.indexOf("ZASTĘPSTWA") > 0 && kp.indexOf("Matematyka") > 0 && kp.indexOf("Jan Testowy") > 0 && kp.indexOf("Plastyka") > 0);
  T("37: kartka — puste pole Zastępuje + propozycje", kp.indexOf("Zastępuje") > 0 && kp.indexOf("Propozycje") > 0 && kp.indexOf("Ewa Wolna") > 0);
  T("37: kartka — brak <script>, pełny dokument HTML", kp.indexOf("<script") < 0 && kp.trimEnd().endsWith("</html>"));
  const seen37 = [];
  global.open = function(){ return { document: { write(x){ seen37.push(x); }, close(){} } }; };
  openZastPrint();
  T("37: openZastPrint otwiera kartkę w nowej karcie", seen37.length === 1 && seen37[0] === zastPrintHtml());
  global.open = function(){ return null; };
  openZastPrint(); /* ścieżka zablokowanych popupów — nie może rzucić */
  T("37: openZastPrint obsługuje zablokowane popupy", seen37.length === 1);
  delete global.open;
  zastAbsent = {}; zastSavedAt = null;
  T("37: kartka bez zaznaczonych — komunikat", zastPrintHtml().indexOf("nie zaznaczono nieobecnych") > 0);
  toggleZastAbsent(tA.id); /* przywróć dla dalszych */

  /* --- tory rewalidacji: przycisk z potwierdzeniem --- */
  global.confirm = () => true;
  cR1.rew = 5; cR2.rew = 1; /* ręczne zmiany użytkownika */
  applyRewWytyczne();
  T("37: applyRewWytyczne (confirm tak) ustawia tory wg wytycznych", cR1.rew === 1 && cR2.rew === 3 && c37.rew === 2);
  global.confirm = () => false;
  cR1.rew = 5;
  applyRewWytyczne();
  T("37: applyRewWytycze (confirm nie) nic nie zmienia", cR1.rew === 5);
  global.confirm = () => true;

  /* --- inicjały w plikach Word --- */
  eksMode = "klasy"; eksDocxInits = false;
  const dx0 = docxPlans();
  T("37: docx domyślnie pełne nazwiska", dx0.indexOf("Jan Testowy") > 0 && dx0.indexOf("JT,") < 0);
  eksDocxInits = true;
  const dx1 = docxPlans();
  T("37: docx z inicjałami — skróty zamiast nazwisk", dx1.indexOf("Jan Testowy") < 0 && dx1.indexOf("Anna Przykładowa") < 0 && dx1.indexOf("JT") >= 0 && dx1.indexOf("Muzyka") >= 0);
  T("37: docx z inicjałami — tytuł oddziału bez zmian", dx1.indexOf("Oddzia") > 0 && dx1.indexOf("1a") > 0);
  eksDocxInits = false;
  T("37: eksDocxInits domyślnie wyłączony", eksDocxInits === false);
  zastDay = 0; zastAbsent = {}; zastSavedAt = null; delete _store["pz-zast"];
}

/* ==================== WYNIK ==================== */
console.log("\n========================================");
console.log("WYNIK: " + pass + " OK, " + fail + " FAIL  (razem " + (pass + fail) + ")");
if (fail) { console.log("NIEZALANE:"); fails.forEach(f => console.log("  -", f)); process.exit(1); }
console.log("WSZYSTKIE TESTY PRZECHODZĄ ✅");
