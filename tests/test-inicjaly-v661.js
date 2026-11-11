/* Testy apki Plan Zajęć — v6.61 Automatyczne inicjały BM wszędzie (opcja A):
   nameParts (mieszane formaty „Imię Nazwisko”/„Nazwisko Imię”), tShort na żywo z teacherInits,
   pole „skrót” = ręczne nadpisanie, clearShorts, UI modułu Nauczyciele.
   Uruchomienie: node test-inicjaly-v661.js (APP_SOURCE = index.html)
   UWAGA: bez "use strict" — sloppy eval wyciąga funkcje apki do scope modułu. ZERO realnych nazwisk. */
const fs = require("fs");

/* ---------- mocki DOM (jak w test.js) ---------- */
function el(){ return { value: "", textContent: "", innerHTML: "", checked: false, files: [],
  classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
  appendChild(){}, addEventListener(){}, style: {}, scrollIntoView(){}, focus(){}, setAttribute(){}, getAttribute(){ return null; } }; }
global.document = { getElementById(){ return el(); }, querySelector(){ return el(); }, documentElement: { classList: { add(){}, remove(){}, contains(){ return false; }, toggle(){} } },
  addEventListener(){}, createElement(){ return el(); }, body: { classList: { add(){}, remove(){}, toggle(){} } } };
global.window = global;
try { global.navigator = {}; } catch(e) {}
global.location = { protocol: "http:" };
const _store = {};
global.localStorage = { getItem(k){ return (k in _store) ? _store[k] : null; }, setItem(k, v){ _store[k] = String(v); }, removeItem(k){ delete _store[k]; } };
global.confirm = () => true;
global.fetch = () => Promise.resolve({ ok: true });
global.alert = () => {};

/* ---------- załadowanie apki (NAJDŁUŻSZY <script>, zdjęcie "use strict") ---------- */
const raw = fs.readFileSync(process.env.APP_SOURCE || "index.html", "utf8");
const scripts = [...raw.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const appSrc = scripts.reduce((a, b) => (b.length > a.length ? b : a));
eval(appSrc.replace('"use strict";', ""));
render = function(){}; /* v6.61: render dotyka DOM — w Node zbędny do logiki */

/* ---------- harness ---------- */
let pass = 0, fail = 0; const fails = [];
function T(name, cond){ if (cond) pass++; else { fail++; fails.push(name); console.log("  ✗ FAIL:", name); } }
function SEC(t){ console.log("—", t); }
function fresh(){ return normalize({ teachers: [], classes: [], activities: [], placement: {},
  settings: { teacherMaxPerDay: 7, classMaxPerDay: 7, lessonTimes: defaultLessonTimes() } }); }
function mkT(S, name){ const t = { id: nextId(S.teachers, "t"), name, short: name.split(/\s+/).slice(-1)[0].slice(0, 3), unavail: [] }; S.teachers.push(t); return t; } /* short = stary default generatora */

/* ==================== 1. wersja + SW ==================== */
SEC("1. wersja 6.61 + SW");
T("stopka: Wersja 6.61", raw.indexOf("Wersja 6.61.") > 0);
T("stopka: brak starej 6.60", raw.indexOf("Wersja 6.60.") < 0);
T("IMIONA_SET zdefiniowane", typeof IMIONA_SET === "object" && IMIONA_SET["beata"] === 1 && IMIONA_SET["wojciech"] === 1);
if (fs.existsSync("sw.js")){
  const sw = fs.readFileSync("sw.js", "utf8");
  T("sw.js: CACHE_NAME plan-zajec-v6.61", sw.indexOf("plan-zajec-v6.61") > 0 && sw.indexOf("v6.60") < 0);
} else {
  console.log("  (sw.js poza katalogiem roboczym — pominięto)");
}

/* ==================== 2. nameParts — mieszane formaty ==================== */
SEC("2. nameParts (format „Imię Nazwisko” i „Nazwisko Imię”) ");
T("„Beata Muzyka” → imię Beata, nazwisko Muzyka", nameParts("Beata Muzyka").imie === "Beata" && nameParts("Beata Muzyka").nazwisko === "Muzyka" && !nameParts("Beata Muzyka").single);
T("„Muzyka Beata” (odwrócone) → też imię Beata", nameParts("Muzyka Beata").imie === "Beata" && nameParts("Muzyka Beata").nazwisko === "Muzyka");
T("„Pseudonim” → jednoczłonowa", nameParts("Pseudonim").single === true && nameParts("Pseudonim").imie === "Pseudonim");
T("„Joanna Torb (urlop)” → nawias pomijany", nameParts("Joanna Torb (urlop)").imie === "Joanna" && nameParts("Joanna Torb (urlop)").nazwisko === "Torb");
T("„Ewa Maria Kowalska” → imię pierwsze, nazwisko ostatnie", nameParts("Ewa Maria Kowalska").imie === "Ewa" && nameParts("Ewa Maria Kowalska").nazwisko === "Kowalska");
T("pusta nazwa → puste części", nameParts("").imie === "" && nameParts("").single === true);
T("„Kwarc Krzem” (nieznane słowa) → fallback „Imię Nazwisko”", nameParts("Kwarc Krzem").imie === "Kwarc" && nameParts("Kwarc Krzem").nazwisko === "Krzem");
T("„B. P.” — kropki pomijane", nameParts("B. P.").imie === "B" && nameParts("B. P.").nazwisko === "P");

/* ==================== 3. teacherInits — inicjały BM z kolizjami ==================== */
SEC("3. teacherInits (inicjały imię+nazwisko, kolizje) ");
S = fresh();
const tA = mkT(S, "Beata Muzyka");
const tB = mkT(S, "Anna Krupka");
let m = teacherInits();
T("bez kolizji → BM / AK", m[tA.id] === "BM" && m[tB.id] === "AK");
/* kolizja rozstrzygnięta drugą literą nazwiska (reguła Roberta: BM + druga litera) */
const tC = mkT(S, "Anna Skaza");
const tD = mkT(S, "Agnieszka Szafa");
m = teacherInits();
T("kolizja AS → ASk / ASz (druga litera nazwiska)", m[tC.id] === "ASk" && m[tD.id] === "ASz");
/* kolizja, gdzie druga litera się dubluje → trzecia litera (BPia/BPij) */
const tE = mkT(S, "Barbara Pianka");
const tF = mkT(S, "Bożena Pijanka");
m = teacherInits();
T("kolizja BP (obie „Pi”) → BPia / BPij (kolejna litera)", m[tE.id] === "BPia" && m[tF.id] === "BPij");
/* jednoczłonowa nazwa → 2 litery (bez regresji v6.25) */
S = fresh();
const tG = { id: "tg", name: "Pseudonim", short: "Pse", unavail: [] };
S.teachers.push(tG);
m = teacherInits();
T("jednoczłonowa → pierwsze 2 litery", m[tG.id] === "PS");
/* odwrócony format tej samej osoby → te same inicjały */
S = fresh();
const tH = mkT(S, "Muzyka Beata");
m = teacherInits();
T("„Muzyka Beata” sama w bazie → BM (nie MB!)", m[tH.id] === "BM");
/* dwa rekordy tej samej osoby (oba formaty) → nierozróżnialne, zostają przy bazie BM */
const tI = mkT(S, "Beata Muzyka");
m = teacherInits();
T("duplikat osoby w dwóch formatach → obie BM (scal w UI ręcznie)", m[tI.id] === "BM" && m[tH.id] === "BM");
/* used-filter: konflikt liczony tylko wśród pokazanych (bez regresji v6.25/v6.34) */
S = fresh();
const tJ = mkT(S, "Jan Torb");
const tK = mkT(S, "Justyna Tama");
const used = {}; used[tJ.id] = 1;
T("teacherInits(used) → used z czystym JT", teacherInits(used)[tJ.id] === "JT");
m = teacherInits();
T("teacherInits() bez filtra → oba wydłużone (JTo/JTa)", m[tJ.id] === "JTo" && m[tK.id] === "JTa");
/* determinizm */
const m2 = teacherInits();
T("deterministyczne między wywołaniami", JSON.stringify(m) === JSON.stringify(m2));

/* ==================== 4. tShort — skrót na żywo, nadpisanie, czyszczenie ==================== */
SEC("4. tShort (auto BM / nadpisanie / clearShorts) ");
S = fresh();
const t1 = mkT(S, "Beata Muzyka"); /* short "Muz" = stary default */
T("stary default (3 litery) → pokazuje BM", tShort(t1.id) === "BM");
T("puste pole skrótu → BM", (t1.short = "", tShort(t1.id) === "BM"));
T("ręczne nadpisanie zostaje", (t1.short = "BM!", tShort(t1.id) === "BM!"));
T("nadpisanie ≠ stary default po zmianie nazwy zostaje", (t1.name = "Anna Nowa", tShort(t1.id) === "BM!"));
t1.name = "Beata Muzyka"; t1.short = "";
const t2 = { id: "t2", name: "Muzyka Beata", short: "Bea", unavail: [] }; /* stary default odwróconej formy */
S.teachers.push(t2);
T("odwrócony format + stary default → BM (nie MB)", tShort(t2.id) === "BM");
const t3 = mkT(S, "Pseudonim");
T("jednoczłonowa → PS (2 litery)", tShort(t3.id) === "PS");
T("nieznany id → „?”", tShort("t-nic") === "?");
T("puste id → „—”", tShort("") === "—");
/* nauczyciel jak z importu FET (pusty short od v6.61) */
const t4 = { id: "t4", name: "Krupka Anna", short: "", unavail: [] };
S.teachers.push(t4);
T("import FET (pusty short) → AK", tShort(t4.id) === "AK");
/* clearShorts */
const t5 = mkT(S, "Anna Skaza"); t5.short = "SK-custom";
clearShorts(); /* confirm stub = true */
T("clearShorts zeruje wszystkie pola skrótu", S.teachers.every(t => t.short === ""));
T("po clearShorts tShort wraca do inicjałów (nadpisanie zdjęte)", tShort(t5.id) === "AS");

/* ==================== 5. UI modułu Nauczyciele + eksporty ==================== */
SEC("5. renderDane: podpowiedzi BM i przycisk czyszczenia ");
S = fresh();
mkT(S, "Beata Muzyka");
const h = renderDane();
T("renderDane: przycisk „↻ Wyczyść skróty” z onclick clearShorts()", h.indexOf('onclick="clearShorts()"') > 0);
T("renderDane: tooltip pola skrótu o auto inicjałach", h.indexOf("skrót (puste = automatyczne inicjały BM)") > 0);
T("renderDane: placeholder pola skrótu = wyliczone BM", h.indexOf('placeholder="BM"') > 0);
T("renderDane: placeholder formularza „skrót (puste = BM)”", h.indexOf("skrót (puste = BM)") > 0);
T("renderDane: hint o automatycznych inicjałach", h.indexOf("Pusty skrót → plan używa automatycznych inicjałów") > 0);
/* iCal: SUMMARY w planie oddziału używa inicjałów (kontynuacja v6.58) */
const c1 = { id: "c1", name: "3a", rew: 2 };
S.classes.push(c1);
S.activities.push({ id: "a1", classId: c1.id, teacherId: S.teachers[0].id, subject: "Matematyka", hours: 1, kind: "std", group: "", link: "" });
S.placement["a1-0"] = 0;
T("icsCal oddziału: SUMMARY z inicjałami BM", icsCal("class", c1.id).indexOf("SUMMARY:Matematyka (BM)") >= 0);

/* ==================== podsumowanie ==================== */
console.log("");
if (fails.length){ console.log("NIEPRZECHODZĄCE:"); fails.forEach(f => console.log("  ✗", f)); }
console.log("WYNIK v6.61-inicjaly: " + pass + " OK, " + fail + " FAIL  (razem " + (pass + fail) + ")");
console.log(fail ? "❌ SQUASHED BUGS?" : "WSZYSTKIE TESTY v6.61 ZAKOŃCZONE ✅");
process.exit(fail ? 1 : 0);
