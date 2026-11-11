/* Testy apki Plan Zajęć — v6.60 Nadrobienie braków (konsola niewykonalności, licznik przykryć, QR na planszach, raport A4)
   Uruchomienie: node test-nadrobienia-v660.js (APP_SOURCE = index.html)
   UWAGA: bez "use strict" — sloppy eval wyciąga funkcje apki do scope modułu. */
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

/* ---------- harness ---------- */
let pass = 0, fail = 0; const fails = [];
function T(name, cond){ if (cond) pass++; else { fail++; fails.push(name); console.log("  ✗ FAIL:", name); } }
function SEC(t){ console.log("—", t); }
function fresh(){ return normalize({ teachers: [], classes: [], activities: [], placement: {},
  settings: { teacherMaxPerDay: 7, classMaxPerDay: 7, lessonTimes: defaultLessonTimes() } }); }
function mkT(S, name){ const t = { id: nextId(S.teachers, "t"), name, short: name.split(/\s+/).slice(-1)[0].slice(0, 3), unavail: [] }; S.teachers.push(t); return t; }
function mkC(S, name, rew){ const c = { id: nextId(S.classes, "c"), name, rew: rew || 2 }; S.classes.push(c); return c; }
function mkA(S, cid, subj, tid, hours, extra){ const a = Object.assign({ id: nextId(S.activities, "a"), classId: cid, withClassId: "", teacherId: tid || "", subject: subj, hours: hours || 1, kind: guessKind(subj), group: "", link: "" }, extra || {}); S.activities.push(a); return a; }
function allSlots(){ const out = []; for (let s = 0; s < 5 * NH; s++) out.push(s); return out; }

/* ==================== 1. normalize + planUrl ==================== */
SEC("1. normalize + planUrl");
S = fresh();
T("normalize domyka planUrl = \"\"", S.settings.planUrl === "");
S.settings.planUrl = "https://szkola.example/plan";
S = normalize(S);
T("normalize zachowuje ustawione planUrl", S.settings.planUrl === "https://szkola.example/plan");

/* ==================== 2. silnik QR (zwalidowany z autorskim portem Python) ==================== */
SEC("2. silnik QR");
T("qrcodegen załadowany", typeof qrcodegen === "object" && typeof qrcodegen.QrCode.encodeText === "function");
(function(){
  const qr = qrcodegen.QrCode.encodeText("https://sayd1975-code.github.io/plan_zajec/", qrcodegen.QrCode.Ecc.MEDIUM);
  let dark = 0;
  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.getModule(x, y)) dark++;
  T("QR referencja: wersja 4, maska 0, rozmiar 33", qr.version === 4 && qr.mask === 0 && qr.size === 33);
  T("QR referencja: 546 ciemnych modułów (macierz 1:1 z portem Python Nayuki)", dark === 546);
})();
T("qrSvg: pusty adres → puste SVG", qrSvg("", 40) === "");
T("qrSvg: puste po trim → puste SVG", qrSvg("   ", 40) === "");
(function(){
  const svg = qrSvg("https://sayd1975-code.github.io/plan_zajec/", 40);
  T("qrSvg: zwraca <svg z viewBox 41x41 (33 moduły + 2×4 border)", svg.indexOf('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 41 41"') === 0);
  T("qrSvg: crispEdges + wypełnienie ścieżką", svg.indexOf('shape-rendering="crispEdges"') > 0 && svg.indexOf("<path d=\"M") > 0 && svg.indexOf("40mm") > 0);
  const d = /<path d="([^"]+)"/.exec(svg)[1];
  T("qrSvg: ścieżka niepusta i tylko legalne komendy M/h/v/z", d.length > 100 && /^([Mvhz0-9\-. ])+$/.test(d));
  T("qrSvg: za długi adres (5000 znaków) → puste, bez wyjątku", qrSvg("x".repeat(5000), 40) === "");
})();

/* ==================== 3. QR na planszach A1/Zbiorczej ==================== */
SEC("3. QR na planszach");
(function(){
  S = fresh();
  S.settings.planUrl = "";
  const t1 = mkT(S, "Anna Kowalska"); const c1 = mkC(S, "5a");
  const act1 = mkA(S, c1.id, "Matematyka", t1.id, 2);
  S.placement[act1.id + "-0"] = 0; S.placement[act1.id + "-1"] = 1;
  const zb = planszaZbiorczaHtml();
  T("Zbiorcza bez planUrl: brak <svg (QR)", zb.indexOf("<svg") < 0);
  S.settings.planUrl = "https://www.szkola.example/plan-zajec";
  const zb2 = planszaZbiorczaHtml();
  T("Zbiorcza z planUrl: jest <svg (QR) i adres w stopce", zb2.indexOf("<svg") > 0 && zb2.indexOf("https://www.szkola.example/plan-zajec") > 0);
  T("Zbiorcza: podpis „Zeskanuj telefonem”", zb2.indexOf("Zeskanuj telefonem") > 0);
  const a1 = planszaA1Html();
  T("A1 z planUrl: jest <svg (QR) i adres", a1.indexOf("<svg") > 0 && a1.indexOf("https://www.szkola.example/plan-zajec") > 0);
  S.settings.planUrl = "";
  T("A1 bez planUrl: brak <svg", planszaA1Html().indexOf("<svg") < 0);
  T("qrBlockHtml: pusty → \"\"", qrBlockHtml(40) === "");
})();

/* ==================== 4. konsola niewykonalności (analyzeUnplaced) ==================== */
SEC("4. analyzeUnplaced — konsola niewykonalności");
(function(){
  S = fresh();
  T("analyzeUnplaced: brak nieprzypisanych → []", Array.isArray(analyzeUnplaced()) && analyzeUnplaced().length === 0);
  const t1 = mkT(S, "Anna Kowalska"); const c1 = mkC(S, "5a");
  mkA(S, c1.id, "Matematyka", t1.id, 2);
  const w = analyzeUnplaced();
  T("2 nieprzypisane lekcje w raporcie", w.length === 2 && w[0].subject === "Matematyka");
  T("pusta szkoła: 39 wolnych slotów (domyślnie piątek 8. lekcja wyłączona)", w[0].free === 39);
  T("jedyne „blokujące”: zablokowana godzina ×1 (slot 39)", w[0].reasons.length === 1 && /zablokowana godzina/.test(w[0].reasons[0].label) && w[0].reasons[0].count === 1);
  T("bez prechecków globalnych", w[0].pre.length === 0);
})();
(function(){ /* nauczyciel niedostępny wszędzie */
  S = fresh();
  const t1 = mkT(S, "Anna Kowalska"); t1.unavail = allSlots();
  const c1 = mkC(S, "5a");
  mkA(S, c1.id, "Matematyka", t1.id, 2);
  const w = analyzeUnplaced();
  T("niedostępny nauczyciel: 0 wolnych slotów", w.length === 2 && w.every(x => x.free === 0));
  T("powód „nauczyciel niedostępny” liczony dla 40 slotów", w[0].reasons.some(r => /niedostępny/.test(r.label) && r.count === 40));
  T("precheck: nauczyciel ma 2 lekcje, 0 slotów dostępnych", w[0].pre.some(p => /slotów dostępnych tylko 0/.test(p)));
})();
(function(){ /* kolizja nauczyciela z ułożonymi lekcjami */
  S = fresh();
  const t1 = mkT(S, "Anna Kowalska");
  const c1 = mkC(S, "5a"); const c2 = mkC(S, "2b AUT");
  const a1 = mkA(S, c1.id, "Matematyka", t1.id, 8);
  const a2 = mkA(S, c2.id, "Język polski", t1.id, 8);
  for (let i = 0; i < 8; i++) S.placement[a1.id + "-" + i] = i; /* cały dzień 0 dla 5a */
  const w = analyzeUnplaced();
  const jp = w.find(x => x.subject === "Język polski");
  T("lekcje polskiego nieprzypisane z powodem „nauczyciel ma wtedy inną lekcję” (8 slotów dnia 0)", jp.reasons.some(r => /inną lekcję/.test(r.label) && r.count === 8));
  T("…ale 31 slotów nadal wolnych (dni 1-4 bez piątku 8.)", jp.free === 31);
})();
(function(){ /* limit dzienny oddziału + okienko */
  S = fresh();
  S.settings.classMaxPerDay = 1;
  const t1 = mkT(S, "Anna Kowalska"); const c1 = mkC(S, "5a");
  const a1 = mkA(S, c1.id, "Matematyka", t1.id, 3);
  S.placement[a1.id + "-0"] = 0;
  const w = analyzeUnplaced();
  T("powód „limit dzienny oddziału (1)” obecny", w.some(x => x.reasons.some(r => /limit dzienny oddziału \(1\)/.test(r.label))));
  T("powód „okienko oddziału” obecny (wstawienie obok 1. lekcji zrobiło by okienko)", w.some(x => x.reasons.some(r => /okienko/.test(r.label))));
  mkA(S, c1.id, "Plastyka", t1.id, 4); /* razem 7h > 1×5 */
  const w2 = analyzeUnplaced();
  T("precheck: 7 lekcji > limit 1×5=5", w2.some(x => x.pre.some(p => /przekracza limit 1×5=5/.test(p))));
})();
(function(){ /* blokada slotu w ustawieniach */
  S = fresh();
  S.settings.blockedSlots = allSlots().slice(0, 8); /* cały dzień 0 wyłączony */
  const t1 = mkT(S, "Anna Kowalska"); const c1 = mkC(S, "5a");
  mkA(S, c1.id, "Matematyka", t1.id, 2);
  const w = analyzeUnplaced();
  T("powód „zablokowana godzina” liczy 8 slotów dnia 0", w[0].reasons.some(r => /zablokowana godzina/.test(r.label) && r.count === 8));
  T("…i 32 sloty wolne", w[0].free === 32);
})();
T("przycisk „Dlaczego nieprzypisane?” w renderPlan", (function(){
  const t1 = mkT(S, "Anna Kowalska");
  const h = renderPlan();
  return h.indexOf("Dlaczego nieprzypisane?") > 0;
})());
T("renderPlan z otwartą konsolą pokazuje powody", (function(){
  whyOpen = true;
  const h = renderPlan();
  whyOpen = false;
  return h.indexOf("zablokowana godzina") > 0;
})());

/* ==================== 5. licznik przykryć (fairness) ==================== */
SEC("5. licznik przykryć — historia zastępstw");
T("pusta historia: load [] i totals {}", zastHistLoad().length === 0 && Object.keys(zastHistTotals()).length === 0);
(function(){
  S = fresh();
  const t1 = mkT(S, "Jan Nieobecny"); const t2 = mkT(S, "Anna Kowalska"); const t3 = mkT(S, "Jan Krupka"); const t4 = mkT(S, "Piotr Szczupak");
  const c1 = mkC(S, "5a");
  const a1 = mkA(S, c1.id, "Matematyka", t1.id, 2);
  S.placement[a1.id + "-0"] = 0; S.placement[a1.id + "-1"] = 1;
  zastDay = 0;
  zastHistSave();
  T("zapis bez przykryć: brak wpisu (komunikat ostrzegawczy)", zastHistLoad().length === 0);
  zastAbsent[t1.id] = true;
  zastCover[zastCoverKey(1, t1.id)] = t4.id; /* tylko lekcja 2. przykryta przez Szczupaka — lekcja 1. ma trzech kandydatów */
  zastHistSave();
  const hist = zastHistLoad();
  T("zapis przykryć tworzy wpis z datą dnia zastępczego", hist.length === 1 && hist[0].date === weekDates(planWeekMonday())[0]);
  T("wpis liczy 1 przykrycie dla Szczupaka", hist[0].covers[t4.id] === 1);
  const tot = zastHistTotals();
  T("totals: Szczupak 1, Kowalska/Krupka 0", tot[t4.id] === 1 && tot[t2.id] === undefined && tot[t3.id] === undefined);
  /* ponowny zapis tej samej daty zastępuje wpis (teraz Szczupak przykrywa obydwie lekcje) */
  zastCover[zastCoverKey(0, t1.id)] = t4.id;
  zastCover[zastCoverKey(1, t1.id)] = t4.id;
  zastHistSave();
  const hist2 = zastHistLoad();
  T("drugi zapis tej samej daty ZASTĘPUJE wpis (nie duplikuje)", hist2.length === 1 && hist2[0].covers[t4.id] === 2 && hist2[0].covers[t2.id] === undefined);
  /* fairness: kandydaci lekcji 1. to Kowalska, Krupka (Σ0) i Szczupak (Σ2) — hist wrzuca Szczupaka na koniec */
  zastCover[zastCoverKey(0, t1.id)] = undefined; delete zastCover[zastCoverKey(0, t1.id)]; /* lekcja 1. znowu bez przykrycia */
  const zd = zastData();
  const fall0 = zd.fall.filter(function(f){ return f.slot === 0; })[0];
  const cand = fall0.candidates;
  T("kandydaci lekcji 1.: trzej wolni (Kowalska, Krupka, Szczupak)", cand.length === 3);
  T("fairness: Szczupak (Σ2) na końcu mimo alfabetu (S przed K?)", cand[cand.length - 1].id === t4.id);
  T("fairness: Kowalska i Krupka (Σ0) przed Szczupakiem", cand[0].id !== t4.id && cand[1].id !== t4.id);
  T("chip kandydata pokazuje Σ przykryć (renderZast)", renderZast().indexOf("Σ2") > 0);
  zastHistClear();
  T("wyczyszczenie historii usuwa wpisy", zastHistLoad().length === 0 && Object.keys(zastHistTotals()).length === 0);
  const zd2 = zastData();
  const fall02 = zd2.fall.filter(function(f){ return f.slot === 0; })[0];
  const cand2 = fall02.candidates;
  T("bez historii sort wraca do lekcji-dzień + alfabet (Kowalska, Krupka, Szczupak)", cand2.length === 3 && cand2[0].id === t2.id && cand2[1].id === t3.id && cand2[2].id === t4.id);
  zastAbsent = {}; zastAbsentClass = {}; zastCover = {}; zastDay = null;
})();

/* ==================== 6. raport jakości planu (A4) ==================== */
SEC("6. raport A4");
(function(){
  S = fresh();
  const t1 = mkT(S, "Anna Kowalska"); const c1 = mkC(S, "5a");
  const a1 = mkA(S, c1.id, "Matematyka", t1.id, 2);
  S.placement[a1.id + "-0"] = 0;
  const r = reportHtml();
  T("raport: nagłówek RAPORT JAKOŚCI PLANU ZAJĘĆ", r.indexOf("RAPORT JAKOŚCI PLANU ZAJĘĆ") > 0);
  T("raport: A4 portrait w @page", r.indexOf("@page { size: A4 portrait") > 0);
  T("raport: sekcja twarde naruszenia", r.indexOf("Twarde naruszenia reguł") > 0);
  T("raport: sekcja nieprzypisane z powodami", r.indexOf("Nieprzypisane lekcje — dlaczego") > 0);
  T("raport: kafel 1/2 ułożonych", r.indexOf(">1/2</span>") > 0);
  T("raport: sekcja okienka i obciążenie", r.indexOf("Okienka i obciążenie") > 0);
  T("raport: przycisk druku", r.indexOf("window.print()") > 0);
  S.placement[a1.id + "-1"] = 1; /* komplet */
  T("raport: 2/2 ułożonych gdy komplet", reportHtml().indexOf(">2/2</span>") > 0);
  T("raport: powód nieprzydziału trafia do tabeli", (function(){
    const t2 = mkT(S, "Jan Krupka"); t2.unavail = allSlots();
    const c2 = mkC(S, "2b AUT");
    mkA(S, c2.id, "Muzyka", t2.id, 1); /* wypada: nauczyciel nigdzie niedostępny */
    return reportHtml().indexOf("nauczyciel niedostępny") > 0;
  })());
  T("raport: precheck globalny nauczyciela wypisany", reportHtml().indexOf("slotów dostępnych tylko 0") > 0);
})();

/* ==================== 7. eksport: planUrl + raport w UI ==================== */
SEC("7. UI — renderEks/renderZast");
(function(){
  const h = renderEks();
  T("renderEks: input planUrl z onchange=setPlanUrl", h.indexOf('onchange="setPlanUrl(this.value)"') > 0);
  T("renderEks: przycisk Raport jakości planu (A4)", h.indexOf("Raport jakości planu (A4)") > 0);
  T("renderEks: hint o QR („ostatnia mila”)", h.indexOf("ostatnia mila") > 0);
  T("renderZast: przycisk zapisu historii przykryć", renderZast().indexOf("Zapisz przykrycia do historii") > 0);
  setPlanUrl("https://www.szkola.example/plan");
  T("setPlanUrl zapisuje w ustawieniach", S.settings.planUrl === "https://www.szkola.example/plan");
})();

/* ==================== 8. wersja + service worker ==================== */
SEC("8. wersja 6.60 + SW");
T("stopka: Wersja 6.60", raw.indexOf("Wersja 6.60.") > 0);
T("stopka: brak starej 6.59", raw.indexOf("Wersja 6.59.") < 0);
if (fs.existsSync("sw.js")){
  const sw = fs.readFileSync("sw.js", "utf8");
  T("sw.js: CACHE_NAME plan-zajec-v6.60", sw.indexOf('plan-zajec-v6.60') > 0 && sw.indexOf("v6.59") < 0);
} else {
  console.log("  (sw.js poza katalogiem roboczym — pominięto)");
}

/* ==================== podsumowanie ==================== */
console.log("");
console.log("WYNIK v6.60-nadrobienia: " + pass + " OK, " + fail + " FAIL  (razem " + (pass + fail) + ")");
if (fail){ console.log("Nieprzechodzące:", fails.join(" | ")); process.exit(1); }
console.log("WSZYSTKIE TESTY v6.60 ZAKOŃCZONE ✅");
