# Testy apki Plan Zajęć (SPS nr 7)

14 suit testowych — zwykły Node.js (≥18), **zero zależności do instalacji** (`npm install` niepotrzebne).
Każda suita czyta kod apki z pliku wskazanego zmienną `APP_SOURCE` (domyślnie `index.html` w korzeniu repo),
wyciąga z niego `<script>`, evaluuje i testuje funkcje. Każda kończy się `WYNIK: N OK, 0 FAIL`
i kodem wyjścia 0 (przy FAIL — 1), więc nadają się do CI.

## Suity

| Plik | Zakres | Testów |
|---|---|---|
| `test.js` | rdzeń: importy, walidator, automat, eksporty + v6.48 (asystent usunięty) | 405 |
| `test-kolejka-v659.js` | v6.59: przełącznik układu siatki (dni poziomo), zastępstwa 2.0 (przykrycia klikaniem, oddziały poza szkołą), undo ×N, warianty planu, e-dziennik .xlsx | 91 |
| `test-silnik-v657.js` | v6.57: blok nauczyciela (tblock), dogięcie automatu (2 blokery, dognięcie po naprawach) | 44 |
| `test-dystrybucja-v658.js` | v6.58: dystrybucja — eksport iCal (.ics nauczyciel/oddział, EXDATE świąt, rotacja A/B) i plan-szkoly.html | 73 |
| `test-cap-v639.js` | sale/gabinety, pojemności | 33 |
| `test-uczniowie-v640.js` | import uczniów, klasy z grupami | 35 |
| `test-terapia-v641.js` | znacznik ucznia na terapii 1:1 | 18 |
| `test-busy-v642.js` | nazwane blokady, wyjazdy, szybkie wpisywanie, dyżury | 53 |
| `test-po-v643.js` | szybkie wpisywanie blokad „wt 1-2; śr 5" | 26 |
| `test-wykaz-v644.js` | czytnik xlsx wykazu uczniów (sekcja D wymaga pliku lokalnego — patrz niżej) | 22 w CI |
| `test-czas-v645.js` | godziny rewalidacyjne 60 min | 29 |
| `test-straznik-v646.js` | strażnik sesji: kopie zapasowe, banery, autosave | 25 |
| `test-audyt-v647.js` | audyt kodu apki (stopka wersji, brak śladów asystenta itp.) | 24 |

## Uruchomienie

```bash
node tests/test.js                      # z katalogu głównego repo
# lub wszystkie:
for f in tests/test*.js; do node "$f" || break; done
```

CI (`.github/workflows/tests.yml`) robi dokładnie to na Node 22 przy każdym pushu do main i każdym PR.

## Ważne zasady

- **Suity zawierają wyłącznie dane fikcyjne** (Kowalski, Testowa, Krupka…). Realne dane szkoły
  nigdy nie wchodzą do tego repo — repo jest publiczne.
- Sekcja D `test-wykaz-v644.js` testuje czytnik xlsx na **realnym pliku wykazu uczniów**, który
  z oczywistych względów nie jest w repo. Gdy pliku nie ma, suita wypisuje „pominięto" i idzie dalej
  (w CI: 22 testów zamiast 26). Lokalnie, mając plik, dostajesz pełne 26.
- Test na **realnym przydziale FET** (`fet_test.js`) jest trzymany poza repo (w folderze „env"
  na Dysku) — czyta realny arkusz z danymi nauczycieli. W repo publicznym nie ma go wcale.
