# Poprawki serwera — app.pfgfootball.com (etap 1)

Pliki z tego folderu wdraża się bez przebudowy aplikacji. Wynikają z audytu
[`docs/AUDYT-SYNC-MOBILE.md`](../docs/AUDYT-SYNC-MOBILE.md), sekcje 3 i 4 (PWA).

Struktura folderu odpowiada serwerowi: zawartość `app.pfgfootball.com/public_html/` wgrywasz do
`public_html` domeny app.pfgfootball.com (Hostido → Menedżer plików albo FTP).

## Co się zmienia

| Plik | Zmiana | Punkt audytu |
|---|---|---|
| `.htaccess` | `no-cache` dla **wszystkich** manifestów (wcześniej tylko `manifest.webmanifest`); typ MIME `.webmanifest`/`.woff2`/`.webp` w całej domenie; ikony i fonty bez hasha — cache 7 dni; kompresja; HTML w `/coach/` dostaje jeden nagłówek `Cache-Control` zamiast dwóch | 3 |
| `assets/.htaccess` *(nowy)* | Pliki z buildu (nazwa z hashem) — cache na rok, `immutable`. Telefon nie pobiera ponownie ~600 kB JS przy każdym wejściu | 3 |
| `manifest-planner.webmanifest` | ikona maskable 192 px, zrzuty ekranu (telefon + komputer), `orientation`, `categories` | 4 / PWA |
| `manifest-tactics.webmanifest` | **ikony maskable** (wcześniej brak — Android przycinał logo), tło ekranu startowego jak w Plannerze, zrzut ekranu, skrót „Nowa taktyka” | 4 / PWA |
| `manifest-training.webmanifest` | jw. + skróty „Nowe ćwiczenie” i „Konspekty” | 4 / PWA |
| `brand/*-maskable-*.png`, `brand/*-touch-180.png` *(nowe)* | ikony maskable Tactics/Training w tym samym układzie co Planner; ikony iOS dla Tactics/Training (do użycia po zmianie w źródłach — patrz niżej) | 4 / PWA |
| `brand/screens/*.webp` *(nowe)* | zrzuty do okna instalacji aplikacji (z obecnej strony pfgfootball.com) | 4 / PWA |
| `tools/cleanup-assets.mjs` | skrypt sprzątający stare buildy i pozostałości | 3 |

`id`, `start_url`, `scope` i nazwy w manifestach są bez zmian, więc już zainstalowane aplikacje
zaktualizują się same, bez ponownej instalacji.

## Wdrożenie krok po kroku

1. **Kopia zapasowa:** pobierz z serwera obecne `public_html/.htaccess` i trzy pliki `manifest-*.webmanifest`.
2. **Wgraj** całą zawartość `app.pfgfootball.com/public_html/` z tego folderu do `public_html`
   (nadpisz `.htaccess` i manifesty; `assets/.htaccess`, `brand/…` dojdą jako nowe pliki).
   Uwaga: pliki zaczynające się od kropki bywają ukryte w menedżerze plików — włącz „pokaż ukryte”.
3. **Sprawdź** w przeglądarce (DevTools → Network) albo poleceniem:
   ```bash
   curl -sI https://app.pfgfootball.com/assets/bootstrap-DdKl4dcN.js | grep -i cache-control
   # oczekiwane: public, max-age=31536000, immutable
   curl -sI https://app.pfgfootball.com/manifest-planner.webmanifest | grep -iE 'cache-control|content-type'
   # oczekiwane: no-cache, application/manifest+json
   ```
   W Chrome: DevTools → Application → Manifest dla `/coach/planner/`, `/coach/tactics/`, `/coach/training/`
   — brak błędów, widoczne ikony maskable i zrzuty.
4. **Sprzątanie** (najlepiej 1–2 dni po wdrożeniu nowego buildu). Na kopii lokalnej serwera:
   ```bash
   node deploy/tools/cleanup-assets.mjs /ścieżka/do/public_html --legacy            # raport
   node deploy/tools/cleanup-assets.mjs /ścieżka/do/public_html --legacy --delete   # usunięcie
   ```
   Skrypt zachowuje wszystko, do czego prowadzą aktualne strony (z importami i fontami), oraz pliki
   młodsze niż 2 dni (`--keep-days N`). Wypisane ścieżki usuń z serwera tak samo jak lokalnie.
   Na obecnym stanie serwera usuwa 62 pozycje (~5,3 MB): 36 plików starych buildów w `assets/`,
   katalog `assets_old/`, 23 nieużywane pliki dawnej strony w `/coach/` oraz
   `coach/tactics/icons/` i `coach/training/icons/` (zastąpione przez `brand/*-maskable-*`).
   Nie rusza `coach/tactics/sw.js` i `coach/training/sw.js` (wyłączniki starych Service Workerów).

## Jak to zostało sprawdzone

- Kopia serwera z ZIP-a + te pliki + `cleanup-assets.mjs --legacy --delete`, uruchomione w Chromium
  (iPhone 13): Planner (Mikrocykl, Makrocykl, eksport Excel), Training (baza, konspekty, nowe ćwiczenie),
  Tactics (nowa tablica), `/coach/`, strona główna, `/share/` — **0 odpowiedzi 404**.
- Manifesty w Chromium (`Page.getAppManifest`, `getInstallabilityErrors`): 0 błędów, wszystkie ikony
  i zrzuty dostępne.
- `.htaccess` na Apache 2.4.58 (mod_rewrite/headers/deflate): nagłówki jak w tabeli wyżej, przekierowania
  `/tactics/…` → `/coach/tactics/…` i blokady `.env`, `.map` działają jak wcześniej.
  Hostido używa LiteSpeed, który czyta te same dyrektywy — mimo to po wgraniu wykonaj krok 3.

## Do przeniesienia do kodu źródłowego (gdy będą dostępne źródła)

Te pliki pochodzą z buildu, więc następny build może je nadpisać:

- manifesty i `brand/*` → katalog `public/` projektu Vite;
- w `coach/tactics/index.html` i `coach/training/index.html` (szablony HTML w źródłach) zmienić
  `<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png">` na `/brand/tactics-touch-180.png`
  i `/brand/training-touch-180.png` — dziś na ekranie iPhone'a obie mają tę samą ikonę;
- w Training/Tactics dodać do `<link rel="manifest">` parametr wersji (`?v=2`) jak w Plannerze;
- `assets/.htaccess` i zmiany cache dopisać do `vite-plugins/hosting.ts`, żeby generował je sam.
