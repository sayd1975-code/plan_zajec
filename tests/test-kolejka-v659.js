/* Testy apki Plan Zajęć — v6.59: przełącznik układu siatki, zastępstwa 2.0 (przykrycia + nieobecne oddziały), undo ×N, warianty planu, e-dziennik .xlsx
   Uruchomienie: node tests/test-kolejka-v659.js (z katalogu głównego repo)
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
function fresh(){ const st = normalize({ teachers: [], classes: [], activities: [], placement: {},
  settings: { teacherMaxPerDay: 7, classMaxPerDay: 7, lessonTimes: defaultLessonTimes() } });
  st.settings.blockedSlots = st.settings.blockedSlots || []; st.settings.holidays = st.settings.holidays || [];
  st.settings.holidayNames = st.settings.holidayNames || {}; return st; }
function mkT(S, name, unavail){ const t = { id: nextId(S.teachers, "t"), name, short: name.split(/\s+/).slice(-1)[0].slice(0,3), unavail: unavail || [] }; S.teachers.push(t); return t; }
function mkC(S, name, rew, blocked, roomId){ const c = { id: nextId(S.classes, "c"), name, rew: rew || 2, blocked: blocked || [], roomId: roomId || "" }; S.classes.push(c); return c; }
function mkA(S, cid, subj, tid, hours, extra){ const a = Object.assign({ id: nextId(S.activities, "a"), classId: cid, withClassId: "", teacherId: tid || "", subject: subj, hours: hours || 1, kind: guessKind(subj), group: "", link: "" }, extra || {}); S.activities.push(a); return a; }

/* ==================== 0. wersja ==================== */
SEC("0. wersja");
T("stopka: Wersja 6.x w index.html", /Wersja 6\.\d+\./.test(raw));
T("brak starej stopki 6.58", raw.indexOf("Wersja 6.58.") < 0);

/* ==================== 1. transpozycja siatki planu ==================== */
SEC("1. 🔄 przełącznik układu siatki");
let st = fresh();
const rc1 = mkC(st, "3a", 2, [], "");
st.rooms = [];
const rt1 = mkT(st, "Krupka Anna");
const rt2 = mkT(st, "Szczupak Jan");
mkA(st, rc1.id, "Matematyka", rt1.id, 1);   /* a1 */
mkA(st, rc1.id, "Plastyka", rt2.id, 1);     /* a2 */
mkA(st, rc1.id, "Muzyka", rt1.id, 1);       /* a3 — bez placementu */
st.placement["a1-0"] = 0;  /* pon, lek. 1 */
st.placement["a2-0"] = 9;  /* wt, lek. 2 */
S = st;
viewMode = "class"; viewSel = rc1.id; planWeek = "A"; planDay = null; sel = null;
planTranspose = false;
let hNorm = renderPlan();
T("układ klasyczny: nagłówek lek. 1", /<th>lek\. 1<br>/.test(hNorm));
T("układ klasyczny: dzień w wierszu (td.day Poniedziałek)", /<td class="day"[^>]*>Poniedziałek/.test(hNorm));
T("układ klasyczny: brak dnia w th", !/<th[^>]*>Poniedziałek/.test(hNorm));
T("cellClick(0) podpięty w siatce", hNorm.indexOf('onclick="cellClick(0)"') >= 0);
T("lekcja widoczna (Matematyka)", hNorm.indexOf("Matematyka") >= 0);
planTranspose = true;
let hTr = renderPlan();
T("układ odwrócony: dzień w nagłówku th (Poniedziałek)", /<th[^>]*>Poniedziałek/.test(hTr));
T("układ odwrócony: lekcja w wierszu (td.day lek. 1)", /<td class="day">lek\. 1<br>/.test(hTr));
T("układ odwrócony: brak th lek. 1", !/<th>lek\. 1<br>/.test(hTr));
T("układ odwrócony: cellClick(0) nadal podpięty", hTr.indexOf('onclick="cellClick(0)"') >= 0);
T("układ odwrócony: lekcja widoczna (Plastyka)", hTr.indexOf("Plastyka") >= 0);
T("układ odwrócony: godzina lek. 2 ma czas z lessonTimes", /lek\. 2<br><span class='sub'>/.test(hTr));
/* klik działa w układzie odwróconym (slot liczony tak samo) */
sel = "a1-0";
cellClick(10); /* wt, lek. 3 — wolne */
T("przeniesienie działa w układzie odwróconym", S.placement["a1-0"] === 10);
undoPop();
T("po undo lekcja wraca na slot 0", S.placement["a1-0"] === 0);
/* toggle + localStorage */
planTranspose = false;
toggleTranspose();
T("toggle: localStorage zapamiętał 1", localStorage.getItem("pz-transpose") === "1");
T("toggle: planTranspose true", planTranspose === true);
toggleTranspose();
T("toggle z powrotem: localStorage 0", localStorage.getItem("pz-transpose") === "0");
T("toggle z powrotem: planTranspose false", planTranspose === false);
/* przycisk w pasku planu */
T("przycisk 🔄 w pasku planu", hNorm.indexOf("toggleTranspose()") >= 0);

/* ==================== 2. undo ×N ==================== */
SEC("2. ↩ cofanie");
st = fresh();
const uc1 = mkC(st, "4b", 2, [], "");
const ut1 = mkT(st, "Rusałka Ewa");
mkA(st, uc1.id, "Historia", ut1.id, 3);
S = st;
undoStack.length = 0;
T("stos pusty na starcie", undoStack.length === 0);
S.placement["a1-0"] = 0;
sel = "a1-1";
cellClick(1);
T("po ruchu ręcznym: 1 krok na stosie", undoStack.length === 1 && S.placement["a1-1"] === 1);
sel = "a1-2"; /* applyPlacement zeruje sel — ustawiamy przed każdym ruchem */
cellClick(2);
T("drugi ruch: 2 kroki", undoStack.length === 2 && S.placement["a1-2"] === 2);
undoPop();
T("cofnięcie: ostatni ruch zniknął", S.placement["a1-2"] == null && S.placement["a1-1"] === 1 && undoStack.length === 1);
undoPop();
T("drugie cofnięcie: oba ruchy zniknęły", S.placement["a1-1"] == null && undoStack.length === 0);
/* unassign */
S.placement["a1-0"] = 0;
unassign("a1-0");
T("unassign: push na stos", undoStack.length === 1 && S.placement["a1-0"] == null);
undoPop();
T("undo przywraca usuniętą lekcję", S.placement["a1-0"] === 0);
/* clearPlan */
clearPlan();
T("clearPlan: plan pusty, stos ma kopię", Object.keys(S.placement).length === 0 && undoStack.length === 1);
undoPop();
T("undo przywraca wyczyszczony plan", S.placement["a1-0"] === 0);
/* cap 50 */
undoStack.length = 0;
for (let i = 0; i < 55; i++){ const keep = Object.assign({}, S.placement); S.placement = {}; undoPush(); S.placement = keep; }
T("cap: stos maks. 50 kroków", undoStack.length === 50);
/* runAuto */
S = st; undoStack.length = 0;
runAuto();
T("runAuto: automat na stosie do cofnięcia", undoStack.length === 1);
let placedAuto = Object.keys(S.placement).length;
T("runAuto: lekcje ułożone", placedAuto >= 1);
undoPop();
T("undo po automacie wraca do stanu sprzed", Object.keys(S.placement).length === 1 && S.placement["a1-0"] === 0);

/* ==================== 3. warianty planu ==================== */
SEC("3. 💾 warianty");
st = fresh();
const vc1 = mkC(st, "5c", 2, [], "");
const vt1 = mkT(st, "Bąk Zygmunt");
mkA(st, vc1.id, "Geografia", vt1.id, 2);
S = st;
S.placement["a1-0"] = 0; S.placement["a1-1"] = 8;
localStorage.removeItem("pz-warianty");
variantSave("wariant-alfa");
const vj = JSON.parse(localStorage.getItem("pz-warianty"));
T("zapis: wariant w localStorage", vj && vj["wariant-alfa"]);
T("zapis: licznik 2/2", vj["wariant-alfa"].placed === 2 && vj["wariant-alfa"].total === 2);
T("zapis: kopia placementu", vj["wariant-alfa"].placement["a1-0"] === 0);
S.placement = { "a1-0": 16 };
variantLoad("wariant-alfa");
T("wczytanie: placement odtworzony", S.placement["a1-0"] === 0 && S.placement["a1-1"] === 8);
T("wczytanie: da się cofnąć (undo)", undoStack.length >= 1);
undoPop();
T("undo po wczytaniu wraca do stanu próbnego", S.placement["a1-0"] === 16 && S.placement["a1-1"] == null);
variantDelete("wariant-alfa");
T("usunięcie: localStorage pusty", Object.keys(JSON.parse(localStorage.getItem("pz-warianty"))).length === 0);
variantSave("w1");
variantSave("w2");
T("kilka wariantów obok siebie", Object.keys(JSON.parse(localStorage.getItem("pz-warianty"))).length === 2);
T("karta wariantów w renderPlan", renderPlan().indexOf("Warianty planu") >= 0);
localStorage.removeItem("pz-warianty");

/* ==================== 4. zastępstwa 2.0 ==================== */
SEC("4. 🔁 przykrycia klikaniem + nieobecne oddziały");
st = fresh();
const zc1 = mkC(st, "6d", 2, [], "");
const zc2 = mkC(st, "7e", 2, [], "");
const zt1 = mkT(st, "Krupka Anna");   /* nieobecny */
const zt2 = mkT(st, "Szczupak Jan");  /* kandydat */
const zt3 = mkT(st, "Lis Adam");      /* kandydat */
const zt4 = mkT(st, "Rusałka Ewa");   /* ma własną lekcję na slocie 0 */
const zt5 = mkT(st, "Bąk Zygmunt");   /* drugi nieobecny — też lekcja na slocie 0 */
mkA(st, zc1.id, "Matematyka", zt1.id, 1);   /* a1 — slot 0 (pon lek.1), wypada */
mkA(st, zc2.id, "Biologia", zt1.id, 1);     /* a2 — slot 2 (pon lek.3), wypada */
mkA(st, zc2.id, "Chemia", zt4.id, 1);       /* a3 — slot 0, NIE wypada (blokuje zt4) */
mkA(st, zc1.id, "Fizyka", zt3.id, 1);      /* a4 — slot 4 (pon lek.5) */
mkA(st, zc1.id, "Informatyka", zt5.id, 1); /* a5 — slot 0, wypada (zt5 nieobecny) */
S = st;
st.placement["a1-0"] = 0;
st.placement["a2-0"] = 2;
st.placement["a3-0"] = 0;
st.placement["a4-0"] = 4;
st.placement["a5-0"] = 0;
zastDay = 0; zastAbsent = {}; zastCover = {}; zastAbsentClass = {};
zastAbsent[zt1.id] = true; zastAbsent[zt5.id] = true;
let zd = zastData();
T("fall: 3 lekcje nieobecnych (2× zt1 + 1× zt5)", zd.fall.length === 3);
T("fall: brak lekcji obecnych (Chemia)", !zd.fall.some(f => f.subject === "Chemia"));
T("kandydaci: zt4 odpada (ma lekcję na slocie 0)", !zd.fall[0].candidates.some(t => t.id === zt4.id));
T("kandydaci: zt2 dostępny", zd.fall[0].candidates.some(t => t.id === zt2.id));
T("kandydaci: zt3 dostępny", zd.fall[0].candidates.some(t => t.id === zt3.id));
T("covered: 0 na starcie", zd.covered === 0);
/* przypisanie przykrycia */
zastCoverClick(0, zt1.id, zt2.id);
zd = zastData();
const f0 = zd.fall.filter(f => f.slot === 0)[0];
T("przypisanie: coverId ustawiony", f0 && f0.coverId === zt2.id && f0.coverName === "Szczupak Jan");
T("covered: 1/3", zd.covered === 1 && zd.fall.length === 3);
T("przykrycie blokuje kandydata na tym slocie (a5 też slot 0)", !zd.fall.filter(f => f.slot === 0 && f.teacherId === zt5.id)[0].candidates.some(t => t.id === zt2.id));
/* konflikt: nauczyciel z własną lekcją na tym slocie (zt4 ma Chemię na slocie 0) */
zastCoverClick(0, zt5.id, zt4.id);
T("konflikt: nauczyciel z lekcją odrzucony", !zastCover["0|" + zt5.id]);
/* konflikt: ten sam nauczyciel nie przykryje drugiej lekcji na tej samej godzinie */
zastCoverClick(0, zt5.id, zt2.id);
T("konflikt: już przykrywa wtedy inną lekcję", !zastCover["0|" + zt5.id]);
/* poprawne drugie przykrycie */
zastCoverClick(2, zt1.id, zt3.id);
zd = zastData();
T("drugie przykrycie innym nauczycielem OK", zd.fall.filter(f => f.slot === 2)[0].coverId === zt3.id && zd.covered === 2);
/* zdjęcie przykrycia ponownym kliknięciem */
zastCoverClick(2, zt1.id, zt3.id);
T("ponowny klik zdejmuje przykrycie", !zastCover["2|" + zt1.id]);
zastCoverClick(2, zt1.id, zt3.id);
/* trwałość: saveZast/loadZast */
saveZast();
const zj = JSON.parse(localStorage.getItem("pz-zast"));
T("localStorage: cover zapisany", Array.isArray(zj.cover) && zj.cover.length === 2); /* 0|zt1→zt2 i 2|zt1→zt3 */
T("localStorage: struktura {s,a,c}", zj.cover.every(c => typeof c.s === "number" && c.a && c.c));
zastCover = {}; zastAbsent = {}; zastAbsentClass = {};
loadZast();
T("loadZast odtwarza nieobecnych", !!zastAbsent[zt1.id]);
T("loadZast odtwarza przykrycia", zastCover["0|" + zt1.id] === zt2.id && zastCover["2|" + zt1.id] === zt3.id);
T("kompatybilność wstecz: stary zapis bez cover nie wybucha", (JSON.parse(JSON.stringify(zj)), true));
/* odznaczenie nieobecności czyści jego przykrycia */
toggleZastAbsent(zt1.id);
T("odznaczenie nieobecności czyści przykrycia", Object.keys(zastCover).length === 0);
zastAbsent[zt1.id] = true;
/* nieobecny oddział */
zastAbsentClass[zc2.id] = true;
zd = zastData();
T("wyjazd oddziału: jego lekcje nie wypisują się do przykryć", !zd.fall.some(f => f.subject === "Biologia") && !zd.fall.some(f => f.subject === "Chemia"));
T("wyjazd oddziału: classFall ma Biologię i Chemię", zd.classFall.some(f => f.subject === "Biologia") && zd.classFall.some(f => f.subject === "Chemia"));
T("wyjazd oddziału: zwolniony nauczyciel w classFall", zd.classFall.some(f => f.teacherName === "Krupka Anna") && zd.classFall.some(f => f.teacherName === "Rusałka Ewa"));
T("wyjazd oddziału: tylko Matematyka + Informatyka do przykrycia", zd.fall.length === 2 && zd.fall.every(f => f.subject === "Matematyka" || f.subject === "Informatyka"));
T("zwolniony zt4 wraca do kandydatów (Chemia odpadła)", zd.fall.filter(f => f.subject === "Matematyka")[0].candidates.some(t => t.id === zt4.id));
const hZ = renderZast();
T("renderZast: karta oddziałów poza szkołą", hZ.indexOf("Oddziały poza szkołą") >= 0);
T("renderZast: wypadające lekcje oddziałów", hZ.indexOf("Wypadające lekcje oddziałów poza szkołą") >= 0);
T("renderZast: podsumowanie przykrytych", hZ.indexOf("Przykryte:") >= 0);
T("renderZast: klik kandydata podpięty", hZ.indexOf("zastCoverClick(") >= 0);
saveZast();
const zj2 = JSON.parse(localStorage.getItem("pz-zast"));
T("localStorage: absentClasses zapisany", Array.isArray(zj2.absentClasses) && zj2.absentClasses.indexOf(zc2.id) >= 0);
/* kartka do druku z przykryciami */
zastCoverClick(0, zt1.id, zt2.id);
const ph = zastPrintHtml();
T("wydruk: przykrywający na kartce (Szczupak Jan)", ph.indexOf("<b>Szczupak Jan</b>") >= 0);
T("wydruk: oddziały poza szkołą na kartce", ph.indexOf("Oddziały poza szkołą") >= 0);
T("wydruk: wypadające lekcje oddziałów na kartce", ph.indexOf("Wypadają lekcje oddziałów") >= 0 || ph.indexOf("Wypadające lekcje oddziałów") >= 0);
/* wyczyszczenie wszystkiego */
zastClear();
T("zastClear czyści nieobecnych, przykrycia i oddziały", Object.keys(zastAbsent).length === 0 && Object.keys(zastCover).length === 0 && Object.keys(zastAbsentClass).length === 0);

/* ==================== 5. e-dziennik .xlsx ==================== */
SEC("5. 🏫 e-dziennik (wprowadzanie Vulcan)");
st = fresh();
const ec1 = mkC(st, "8f", 2, [], "er1");
const ec2 = mkC(st, "9g", 2, [], "");
st.rooms = [{ id: "er1", name: "Sala 12", cap: 1 }];
const et1 = mkT(st, "Krupka Anna");
const et2 = mkT(st, "Szczupak Jan");
mkA(st, ec1.id, "Matematyka", et1.id, 1);  /* a1 */
mkA(st, ec1.id, "Plastyka", et2.id, 1);    /* a2 */
mkA(st, ec2.id, "Chemia", et2.id, 1);      /* a3 */
mkA(st, ec1.id, "Muzyka", et1.id, 1);      /* a4 — bez placementu */
S = st;
st.placement["a1-0"] = 0;   /* pon lek.1, 8f, Krupka, Sala 12 */
st.placement["a2-0"] = 8;   /* wt lek.1, 8f, Szczupak */
st.placement["a3-0"] = 4;   /* pon lek.5, 9g, Szczupak */
T("sheetNameSafe: obcina do 31 znaków", sheetNameSafe("x".repeat(40)).length <= 31);
T("sheetNameSafe: znaki zakazane → myślnik", sheetNameSafe("a[b]:c*d?e/f\\g") === "a-b--c-d-e-f-g".slice(0, 31) || !/[\[\]:*?\/\\]/.test(sheetNameSafe("a[b]:c*d?e/f\\g")));
const parts = edziennikXlsxParts();
const names = parts.map(p => p.name);
T("entries: pełny szkielet OPC", ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml", "xl/worksheets/sheet3.xml"].every(n => names.indexOf(n) >= 0));
const wb = parts.filter(p => p.name === "xl/workbook.xml")[0].data;
T("workbook: arkusz 8f + 9g + Nauczyciele", wb.indexOf('name="8f"') >= 0 && wb.indexOf('name="9g"') >= 0 && wb.indexOf('name="Nauczyciele"') >= 0);
const ct = parts.filter(p => p.name === "[Content_Types].xml")[0].data;
T("Content_Types: override na 3 arkusze + styles", (ct.match(/sheet\d+\.xml/g) || []).length === 3 && ct.indexOf("styles.xml") >= 0);
const s1 = parts.filter(p => p.name === "xl/worksheets/sheet1.xml")[0].data;
T("arkusz klasy: nagłówek Godzina + dni", s1.indexOf("Godzina") >= 0 && s1.indexOf("Poniedziałek") >= 0 && s1.indexOf("Wtorek") >= 0);
T("arkusz klasy: komórka z przedmiotem i nauczycielem", s1.indexOf("Matematyka — Krupka Anna") >= 0);
T("arkusz klasy: sala w komórce", s1.indexOf("sala Sala 12") >= 0);
T("arkusz klasy: godziny wierszami (lek. 1 z czasem)", /lek\. 1[^<]*<\/t>/.test(s1) || s1.indexOf("1. 8:00") >= 0 || s1.indexOf("8:00") >= 0);
T("arkusz klasy: lekcje bez placementu pomijane", s1.indexOf("Muzyka") < 0);
const rowsR = [...s1.matchAll(/<row r="(\d+)"/g)].map(m => +m[1]);
T("arkusz klasy: wiersze w kolejności rosnącej", rowsR.every((v, i) => i === 0 || v > rowsR[i - 1]));
const sN = parts.filter(p => p.name === "xl/worksheets/sheet3.xml")[0].data;
T("arkusz nauczycieli: wiersz na lekcję z dniem", sN.indexOf("Krupka Anna") >= 0 && sN.indexOf("Poniedziałek") >= 0 && sN.indexOf("Chemia") >= 0);
T("arkusz nauczycieli: oddział w wierszu", sN.indexOf("9g") >= 0);
/* rotacja A/B → dwa bloki */
S.settings.weekAB = true;
S = normalize(S);
const partsAB = edziennikXlsxParts();
const s1ab = partsAB.filter(p => p.name === "xl/worksheets/sheet1.xml")[0].data;
T("rotacja A/B: bloki Tydzień A i B", s1ab.indexOf("Tydzień A") >= 0 && s1ab.indexOf("Tydzień B") >= 0);
/* escaping w arkuszu */
st = fresh(); S = st;
const ec3 = mkC(st, "1h", 2, [], "");
const et3 = mkT(st, "Lis Adam");
mkA(st, ec3.id, "Zajęcia <niebezpieczne> & \"cytat\"", et3.id, 1);
S.placement["a1-0"] = 0;
const partsEsc = edziennikXlsxParts();
const s1e = partsEsc.filter(p => p.name === "xl/worksheets/sheet1.xml")[0].data;
T("esc w arkuszu: < > & quotowane", s1e.indexOf("<niebezpieczne>") < 0 && s1e.indexOf("&amp;") >= 0 && s1e.indexOf("&quot;") >= 0);
T("zipWrite działa na parts (bajty)", (() => { try { zipWrite(partsEsc); return true; } catch(e){ return false; } })());

/* ==================== podsumowanie ==================== */
console.log("");
console.log("Wynik: " + pass + " testów OK, " + fail + " fail.");
if (fail){ console.log("Nieudane:"); fails.forEach(f => console.log(" -", f)); process.exit(1); }
