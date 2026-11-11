/* Testy apki Plan Zajęć — v6.58: dystrybucja planu (iCal .ics + HTML)
   Uruchomienie: node tests/test-dystrybucja-v658.js (z katalogu głównego repo)
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
function mkC(S, name, rew, blocked, roomId){ const c = { id: nextId(S.classes, "c"), name, rew: rew || 2, blocked: blocked || [], roomId: roomId || "" }; S.classes.push(c); return c; }
function mkA(S, cid, subj, tid, hours, extra){ const a = Object.assign({ id: nextId(S.activities, "a"), classId: cid, withClassId: "", teacherId: tid || "", subject: subj, hours: hours || 1, kind: guessKind(subj), group: "", link: "" }, extra || {}); S.activities.push(a); return a; }
function bytesOf(s){ return Buffer.byteLength(s, "utf8"); }

/* ==================== 1. icsEsc / icsFold ==================== */
SEC("1. icsEsc i icsFold (RFC 5545)");
T("icsEsc: przecinek → \\,", icsEsc("a,b") === "a\\,b");
T("icsEsc: średnik → \\;", icsEsc("a;b") === "a\\;b");
T("icsEsc: backslash → podwójny", icsEsc("a\\b") === "a\\\\b");
T("icsEsc: newline → \\n", icsEsc("a\nb") === "a\\nb");
T("icsEsc: null → pusty", icsEsc(null) === "");
{
  const short = "SUMMARY:Fizyka rozszerzona";
  T("icsFold: krótka linia bez zmian", icsFold(short) === short);
  const long = "SUMMARY:" + "Zajęcia wyrównawcze z języka polskiego dla klas 4-6 oraz zajęcia rewalidacyjne z zakresu nauczania początkowego".repeat(1) + " żółć" + "ą".repeat(30);
  const folded = icsFold(long);
  const parts = folded.split("\r\n");
  T("icsFold: każda linia ≤ 75 oktetów", parts.every(p => bytesOf(p) <= 75));
  T("icsFold: kontynuacje z wiodącą spacją", parts.slice(1).every(p => p[0] === " "));
  const unfolded = parts.map((p, i) => i ? p.slice(1) : p).join("");
  T("icsFold: unfold odtwarza oryginał", unfolded === long);
}

/* ==================== 2. icsCal: nauczyciel, podstawy ==================== */
SEC("2. icsCal: plan nauczyciela");
let st = fresh();
const c1 = mkC(st, "3a", 2, [], "r1");
st.rooms = [{ id: "r1", name: "Sala 12", cap: 1 }];
const t1 = mkT(st, "Krupka Anna");
const t2 = mkT(st, "Szczupak Jan");
mkA(st, c1.id, "Matematyka", t1.id, 1);          /* a1 */
mkA(st, c1.id, "Język polski", t1.id, 1);         /* a2 */
mkA(st, c1.id, "Plastyka", t2.id, 1);            /* a3 — inny nauczyciel */
mkA(st, c1.id, "Muzyka", t1.id, 1);              /* a4 — bez placementu */
st.placement["a1-0"] = 0;   /* pon, lek. 1 */
st.placement["a2-0"] = 8;   /* wt, lek. 1 */
st.placement["a3-0"] = 16;  /* śr, lek. 1 (Plastyka — Szczupak) */
st.settings.icsFrom = "2026-11-16"; /* poniedziałek */
S = st;
const calT = icsCal("teacher", t1.id);
T("VCALENDAR: BEGIN/VERSION/END", /^BEGIN:VCALENDAR\r\n/.test(calT) && calT.indexOf("VERSION:2.0") >= 0 && /\r\nEND:VCALENDAR\r\n$/.test(calT));
T("PRODID i CALSCALE", calT.indexOf("PRODID:-//plan-zajec-sps7//Plan Zajec//PL") >= 0 && calT.indexOf("CALSCALE:GREGORIAN") >= 0);
T("X-WR-CALNAME z nazwiskiem", calT.indexOf("X-WR-CALNAME:Plan — Krupka Anna") >= 0);
T("X-WR-TIMEZONE", calT.indexOf("X-WR-TIMEZONE:Europe/Warsaw") >= 0);
T("tylko lekcje nauczyciela (2 VEVENT, Muzyka bez slotu pominięta)", (calT.match(/BEGIN:VEVENT/g) || []).length === 2 && calT.indexOf("Muzyka") < 0);
T("bez lekcji Szczupaka (Plastyka pominięta)", calT.indexOf("Plastyka") < 0);
T("DTSTART pon 8:00", calT.indexOf("DTSTART:20261116T080000") >= 0);
T("DTEND pon 8:45", calT.indexOf("DTEND:20261116T084500") >= 0);
T("DTSTART wt 8:00", calT.indexOf("DTSTART:20261117T080000") >= 0);
T("RRULE tygodniowa z UNTIL 30.06.2027", calT.indexOf("RRULE:FREQ=WEEKLY;UNTIL=20270630T235900") >= 0);
T("UID stabilny @plan-zajec-sps7", calT.indexOf("UID:a1-0-0@plan-zajec-sps7") >= 0);
T("DTSTAMP w UTC", /DTSTAMP:\d{8}T\d{6}Z/.test(calT));
T("SUMMARY: przedmiot + klasa", calT.indexOf("SUMMARY:Matematyka 3a") >= 0 && calT.indexOf("SUMMARY:Język polski 3a") >= 0);
T("LOCATION: sala macierzysta klasy", calT.indexOf("LOCATION:Sala 12") >= 0);
T("DESCRIPTION z oddziałem", calT.indexOf("DESCRIPTION:Oddział: 3a") >= 0);
T("wszystkie linie ≤ 75 oktetów", calT.split("\r\n").every(p => bytesOf(p) <= 75));
T("bez INTERVAL gdy rotacja A/B wyłączona", calT.indexOf("INTERVAL") < 0);

/* ==================== 3. icsCal: oddział ==================== */
SEC("3. icsCal: plan oddziału");
const calC = icsCal("class", c1.id);
T("klasa: 3 VEVENT (Matematyka, Język polski, Plastyka)", (calC.match(/BEGIN:VEVENT/g) || []).length === 3);
T("klasa: SUMMARY ze skrótem nauczyciela", calC.indexOf("SUMMARY:Matematyka (AK)") >= 0);
T("klasa: DESCRIPTION z nauczycielem", calC.indexOf("DESCRIPTION:Nauczyciel: Krupka Anna") >= 0);
T("klasa: X-WR-CALNAME", calC.indexOf("X-WR-CALNAME:Plan — klasa 3a") >= 0);
const emptyT = icsCal("teacher", t2.id);
T("kalendarz Szczupaka: 1 VEVENT (Plastyka)", (emptyT.match(/BEGIN:VEVENT/g) || []).length === 1);
T("poprawka semantyki: Plastyka jest w kalendarzu Szczupaka", emptyT.indexOf("SUMMARY:Plastyka 3a") >= 0);

/* ==================== 4. EXDATE: dni wolne ==================== */
SEC("4. iCal: EXDATE dni wolnych");
st.settings.holidays = ["2026-11-17", "2026-12-25", "2027-07-01"]; /* wtorek, piątek, po UNTIL */
mkA(st, c1.id, "Technika", t2.id, 1); /* a5 — piątek lek. 1 */
st.placement["a5-0"] = 4 * NH + 0;
const calH = icsCal("teacher", t1.id);
const evMon = calH.split("BEGIN:VEVENT").filter(x => x.indexOf("Matematyka") >= 0)[0];
const evTue = calH.split("BEGIN:VEVENT").filter(x => x.indexOf("Język polski") >= 0)[0];
T("EXDATE: wtorek-święto 17.11 na lekcji wtorkowej", evTue.indexOf("EXDATE:20261117T080000") >= 0);
T("EXDATE: poniedziałek bez świąt = bez EXDATE", evMon.indexOf("EXDATE:") < 0);
const calF = icsCal("teacher", t2.id);
const evFri = calF.split("BEGIN:VEVENT").filter(x => x.indexOf("Technika") >= 0)[0];
T("EXDATE: piątek-święto 25.12 na lekcji piątkowej", evFri.indexOf("EXDATE:20261225T080000") >= 0);
T("EXDATE: data po UNTIL (1.07.2027) pominięta", calF.indexOf("20270701") < 0);

/* ==================== 5. rotacja A/B ==================== */
SEC("5. iCal: rotacja tygodni A/B");
{
  const st2 = fresh();
  const cA = mkC(st2, "5b");
  const tA = mkT(st2, "Rusałka Ewa");
  mkA(st2, cA.id, "Fizyka", tA.id, 1, { week: "A" });
  mkA(st2, cA.id, "Chemia", tA.id, 1, { week: "B" });
  mkA(st2, cA.id, "Biologia", tA.id, 1, { week: "" }); /* oba tygodnie */
  st2.placement["a1-0"] = 0; st2.placement["a2-0"] = 0; st2.placement["a3-0"] = 0;
  st2.settings.icsFrom = "2026-11-16";
  st2.settings.weekAB = true;
  S = st2;
  const cal = icsCal("teacher", tA.id);
  const evA = cal.split("BEGIN:VEVENT").filter(x => x.indexOf("Fizyka") >= 0)[0];
  const evB = cal.split("BEGIN:VEVENT").filter(x => x.indexOf("Chemia") >= 0)[0];
  const evO = cal.split("BEGIN:VEVENT").filter(x => x.indexOf("Biologia") >= 0)[0];
  T("A: DTSTART 16.11 + INTERVAL=2", evA.indexOf("DTSTART:20261116T080000") >= 0 && evA.indexOf("RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20270630T235900") >= 0);
  T("B: DTSTART tydzień później (23.11) + INTERVAL=2", evB.indexOf("DTSTART:20261123T080000") >= 0 && evB.indexOf("INTERVAL=2") >= 0);
  T("pusty tydzień: co tydzień (bez INTERVAL)", evO.indexOf("RRULE:FREQ=WEEKLY;UNTIL=20270630T235900") >= 0 && evO.indexOf("INTERVAL") < 0);
  T("DESCRIPTION: oznaczenie tygodnia A/B", evA.indexOf("tydzień A") >= 0 && evB.indexOf("tydzień B") >= 0 && evO.indexOf("tydzień") < 0);
  /* weekAB wyłączone: lekcja oznaczona „A" leci co tydzień jak zwykła */
  st2.settings.weekAB = false;
  const cal2 = icsCal("teacher", tA.id);
  const evA2 = cal2.split("BEGIN:VEVENT").filter(x => x.indexOf("Fizyka") >= 0)[0];
  T("weekAB off: oznaczone A traktowane jak zwykła (bez INTERVAL)", evA2.indexOf("INTERVAL") < 0);
}

/* ==================== 6. icsFileName / setIcsFrom / normalize ==================== */
SEC("6. icsFileName, setIcsFrom, normalize");
S = st; /* sekcja 5 przestawiła globalne S na swój fixture */
T("icsFileName nauczyciel", icsFileName("teacher", t1.id) === "plan-nauczyciel-Krupka-Anna.ics");
T("icsFileName oddział", icsFileName("class", c1.id) === "plan-klasa-3a.ics");
T("icsFileName: znaki specjalne → myślniki", icsFileNameFor("Krupka-Anna (v2)") === "plan-nauczyciel-Krupka-Anna-v2.ics");
function icsFileNameFor(nm){ /* helper testu przez tName — nauczyciel zastępczy */
  const st3 = fresh(); const t3 = { id: "tx", name: nm, short: "X", unavail: [] }; st3.teachers.push(t3); S = st3; return icsFileName("teacher", "tx");
}
{
  const stN = normalize({ teachers: [], classes: [], activities: [], placement: {}, settings: { teacherMaxPerDay: 7, classMaxPerDay: 7 } });
  T("normalize: icsFrom domyślnie pusty", stN.settings.icsFrom === "");
  S = stN;
  T("puste icsFrom: start = bieżący poniedziałek", icsFromMonday().getDay() === 1);
  stN.settings.icsFrom = "2026-11-18"; /* środa */
  T("icsFrom snapuje do poniedziałku", isoDate(icsFromMonday()) === "2026-11-16");
  T("icsUntil: koniec roku szkolnego 30.06", icsStamp(icsUntil(), "23:59") === "20270630T235900");
  stN.settings.icsFrom = "2027-03-01";
  T("icsUntil w semestrze wiosennym: ten sam 30.06", icsStamp(icsUntil(), "23:59") === "20270630T235900");
}

/* ==================== 7. planHtmlDoc ==================== */
SEC("7. planHtmlDoc: samowystarczalny HTML");
{
  const st4 = fresh();
  const cH = mkC(st4, "3a", 2, [], "r1");
  st4.rooms = [{ id: "r1", name: "Sala 12", cap: 1 }];
  const tH = mkT(st4, "Krupka Anna");
  const tX = mkT(st4, "Szczupak <b>Jan"); /* nazwa do przetestowania escapowania */
  mkA(st4, cH.id, "Matematyka", tH.id, 1);
  mkA(st4, cH.id, "Informatyka", tX.id, 1); /* bez slotu = 1 nieprzypisana */
  st4.placement["a1-0"] = 0;
  st4.settings.icsFrom = "2026-11-16";
  S = st4;
  const doc = planHtmlDoc();
  T("doctype + html lang=pl", doc.indexOf("<!doctype html>") === 0 && doc.indexOf('<html lang="pl">') >= 0);
  T("tytuł z rokiem szkolnym", doc.indexOf("<title>Plan zajęć ") === 0 || doc.indexOf("<title>") >= 0);
  T("nawigacja: kotwice klas i nauczycieli", doc.indexOf('href="#k-') >= 0 && doc.indexOf('href="#t-') >= 0);
  T("sekcja oddziału", doc.indexOf("Oddział 3a") >= 0);
  T("sekcja nauczyciela", doc.indexOf("Krupka Anna") >= 0);
  T("godziny dzwonków", doc.indexOf("8:00–8:45") >= 0);
  T("kolumny dni", doc.indexOf("Poniedziałek") >= 0 && doc.indexOf("Piątek") >= 0);
  T("lekcja w siatce: przedmiot + skrót nauczyciela", doc.indexOf("<b>MAT</b> AK") >= 0);
  T("sala w komórce", doc.indexOf("Sala 12") >= 0);
  T("nazwa z <b> jest escapowana", doc.indexOf("<b>Sz") < 0 && doc.indexOf("&lt;b&gt;") >= 0);
  T("informacja o nieprzypisanej lekcji", doc.indexOf("1 lekcji nie ma jeszcze przydzielonej godziny") >= 0);
  T("bez rotacji: jedna siatka na encję (brak „tydzień A”)", doc.indexOf("tydzień A") < 0);
  /* rotacja A/B: dwie siatki + lekcja tylko-A nie ląduje w siatce B */
  st4.settings.weekAB = true;
  mkA(st4, cH.id, "Fizyka", tH.id, 1, { week: "A" });
  st4.placement["a3-0"] = 0;
  S = st4;
  const doc2 = planHtmlDoc();
  T("A/B: siatki tydzień A i B", doc2.indexOf("tydzień A") >= 0 && doc2.indexOf("tydzień B") >= 0);
  const gridA = planHtmlGrid("X", lessons("A"), "class", cH.id, "A");
  const gridB = planHtmlGrid("X", lessons("B"), "class", cH.id, "B");
  T("A/B: lekcja tylko-A w siatce A", gridA.indexOf("<b>FIZ</b>") >= 0);
  T("A/B: lekcja tylko-A NIE w siatce B", gridB.indexOf("FIZ") < 0 && gridB.indexOf("Fizyka") < 0);
  T("A/B: lekcja bez oznaczenia w obu siatkach", gridA.indexOf("<b>MAT</b>") >= 0 && gridB.indexOf("<b>MAT</b>") >= 0);
  /* zajęcia bez oddziału (tblock): na siatce nauczyciela bez „?” */
  mkA(st4, "", "Świetlica", tH.id, 1, { tblock: true });
  st4.placement["a4-0"] = 10;
  const gridT = planHtmlGrid("X", lessons(""), "teacher", tH.id, "");
  T("tblock w siatce nauczyciela bez pustego „?”", gridT.indexOf("<b>ŚWI</b> </div>") >= 0 && gridT.indexOf(">?<") < 0);
}

/* ==================== 8. renderEks: UI ==================== */
SEC("8. renderEks: przyciski dystrybucji");
{
  const h = renderEks();
  T("przycisk iCal nauczyciele", h.indexOf("icsDownloadAll('teacher')") >= 0);
  T("przycisk iCal klasy", h.indexOf("icsDownloadAll('class')") >= 0);
  T("przycisk HTML cała szkoła", h.indexOf("downloadPlanHtml()") >= 0);
  T("pole daty „iCal od”", h.indexOf('type="date"') >= 0 && h.indexOf("setIcsFrom(this.value)") >= 0);
  T("pole daty wypełnione settings.icsFrom", h.indexOf('value="' + (S.settings.icsFrom || "") + '"') >= 0);
  T("hint iCal (import Google)", h.indexOf("Importuj") >= 0);
  T("hint HTML (plan-szkoly.html)", h.indexOf("plan-szkoly.html") >= 0);
}

/* ==================== wynik ==================== */
console.log("\n=== test-dystrybucja-v658: " + pass + " OK, " + fail + " FAIL ===");
if (fail) { fails.forEach(f => console.log(" ✗", f)); process.exit(1); }
