# Audyt: synchronizacja aplikacji PFG i wersje mobilne

Stan na 28.10.2026. Źródło: paczki wdrożeniowe `app.pfgfootball.com` (build z 25.10, 21:20) i `pfgfootball.com`.
Analizowany był zbudowany kod (zminifikowany JS/CSS po sformatowaniu) oraz aplikacje uruchomione lokalnie
w Chromium z zasymulowanym kontem (iPhone 13 — 390 px, Galaxy S9+ — 320 px).

Priorytety: **P1** — błąd lub utrata danych, **P2** — wyraźnie psuje wrażenie / spójność, **P3** — porządki.

---

## 1. Jak dziś wygląda synchronizacja

| Aplikacja | Magazyn lokalny | Silnik synchronizacji | Tabele / RPC w Supabase | Odświeżanie z serwera |
|---|---|---|---|---|
| Tactics | IndexedDB `pfg-coach` (boards) | wspólny silnik z `bootstrap` | `sync_push/pull_boards` | co 60 s + focus/visibility/online + 2 s po zmianie |
| Training | IndexedDB `pfg-coach` + `pfg-coach-plans` | wspólny silnik z `bootstrap` | `sync_*_boards`, `sync_*_categories`, `sync_*_plans` | jw. |
| Planner | **localStorage** (`pfg_planner_*`) + odczyt `pfg-coach-plans` | **własna kolejka** (`K`) w `coach-planner-*.js` | `planner_teams/events/cycles/weeks/days` (bezpośrednio, `.from()`), RPC `planner_patch_week/day` | Realtime (`postgres_changes`) + flush co 30 s |

Wniosek: istnieją **dwa niezależne mechanizmy** — dojrzały (kursory, tombstone'y, kopie konfliktów,
ochrona przed „cudzymi danymi”) i uproszczony w Plannerze. Większość problemów z synchronizacją wynika
z tej różnicy.

---

## 2. Synchronizacja — co poprawić

### P1-1. Planner nie widzi konspektów utworzonych w Training w innej karcie
`coach-planner`: lista konspektów (`Ue.cats/Ue.plans`) odświeża się tylko w `y.onChange(...)`.
`onChange` w `plan-store` to zwykły `Set` w pamięci **jednej karty**. Scenariusz:
1. W Plannerze klikam „Utwórz konspekt” → Training otwiera się w nowej karcie (`target="_blank"`).
2. Training zapisuje konspekt do wspólnej IndexedDB i wysyła na serwer.
3. Wracam do Planera: focus → sync → pull. Wiersz w IndexedDB jest już najnowszy (`remoteTime > local` = fałsz),
   więc `apply()` się nie wykonuje, `onChange` nie strzela → **przycisk dalej pokazuje „Utwórz konspekt”
   aż do przeładowania strony** (ryzyko utworzenia duplikatu).

**Poprawka:** w `Kr()` zamiast `y.onChange` użyć istniejących `y.watchPlans()` / `y.watchCategories()`
(Dexie `liveQuery` — działa między kartami), ewentualnie dodatkowo `BroadcastChannel('pfg-coach')`
z komunikatem `plans-changed` wysyłanym z `plan-store.l()`.

### P1-2. Powiązanie konspekt ↔ wydarzenie jest kruche
Klucz: `plannerEventId = "${team.id}:${date}:${time}"` (`An()` w Plannerze).
Zmiana godziny treningu w szablonie drużyny, przesunięcie dnia albo zmiana godziny w konspekcie
w Training **zrywa powiązanie** — konspekt staje się „sierotą”, a Planner proponuje utworzenie nowego.
Training przy zmianie godziny nie aktualizuje `plannerEventId`.

**Poprawka:** stabilny identyfikator zajęć (UUID nadawany treningowi w Plannerze — np. w `planner_days.data.session_id`
albo osobna tabela `planner_sessions`), a w konspekcie `plannerSessionId` + `date` jako dane pomocnicze.
Migracja: dla istniejących konspektów dopasować po starym kluczu i zapisać nowy identyfikator.

### P1-3. Kolejka Planera w localStorage nie jest bezpieczna dla wielu kart i wielu kont
- `pfg_planner_queue_v1` czyta każda karta przy starcie i każda ją nadpisuje (`R(Ke, this.queue)`).
  Dwie otwarte karty Planera = utrata operacji albo ich podwójne wykonanie. Brak nasłuchu `storage`.
- Kolejka i cache (`pfg_planner_cache_v1:*`) **nie są czyszczone przy wylogowaniu/zmianie konta**.
  Operacje użytkownika A zostaną wysłane z sesją użytkownika B (RLS je odrzuci → trafią do „odrzuconych”),
  a cache A jest czytelny na współdzielonym urządzeniu. Wspólny silnik ma na to stan `foreign-data` — Planner nie.
- Operacja odrzucona przez serwer jest **usuwana z kolejki, ale lokalny stan zostaje** → ekran pokazuje dane,
  których nie ma w bazie. Brak ponownego pobrania po błędzie.
- Wygaśnięcie sesji (JWT/`PGRST301`) jest traktowane jak trwałe odrzucenie, a nie jak „zaloguj ponownie i ponów”.

**Poprawka (minimum):** klucze kolejki/cache z `user.id`; czyszczenie przy `SIGNED_OUT`; blokada
`navigator.locks.request('pfg-planner-flush', …)` wokół `_flush()`; po odrzuceniu — `loadTeam()` (rollback);
błędy auth → zatrzymanie kolejki i odświeżenie sesji zamiast odrzucenia.
**Poprawka (docelowo):** przenieść Planner na wspólny silnik (`sync_push/pull_planner_*` w tej samej konwencji
co boards/plans, IndexedDB zamiast localStorage). Wtedy offline, konflikty, kursory i „cudze dane” działają
identycznie we wszystkich trzech aplikacjach.

### P1-4. Realtime bez ponownego pobrania po zerwaniu połączenia
Kanał `planner-<teamId>` jest subskrybowany raz. Na telefonie (uśpiona karta, zmiana sieci) WebSocket się
rozłącza, a zdarzenia z tego czasu przepadają — nie ma pełnego pobrania po `SUBSCRIBED` ani po `visibilitychange`.
**Poprawka:** w `t.subscribe(status => …)` przy `SUBSCRIBED` (także ponownym) oraz przy powrocie karty
na pierwszy plan wywołać `loadTeam(V.teamId)`.

### P2-1. Konflikty: „ostatni zapis wygrywa” na pełnych wierszach
`event.upsert` / `cycle.upsert` / `team.update` wysyłają cały wiersz — równoległa edycja z dwóch urządzeń
nadpisuje cudze pola bez śladu (tygodnie/dni są lepiej — patch przez RPC). Wspólny silnik porównuje czas
klienta (`client_updated_at`) — przy przestawionym zegarze telefonu wygrywa zły zapis.
**Poprawka:** kolumna `version`/`updated_at` z serwera i warunek `eq('updated_at', znany)` przy update;
w razie konfliktu — kopia jak w Training („… (konflikt)”). W RPC sync preferować czas serwera.

### P2-2. Training/Tactics: zmiany z innego urządzenia docierają z opóźnieniem do 60 s
Wspólny silnik nie korzysta z Realtime. Na tablecie przy boisku trener nie zobaczy ćwiczenia dodanego
na komputerze, dopóki nie minie interwał lub nie przełączy aplikacji.
**Poprawka:** lekki kanał Realtime per użytkownik (`broadcast` „sync-dirty” wysyłany po udanym `push`)
→ w odbiorcy `syncNow()`. Nie trzeba przesyłać danych — tylko sygnał.

### P2-3. Brak powiązania zwrotnego Training → Planner
Konspekt z `plannerEventId` pokazuje tylko „Powiązany z Planerem” + „Odłącz”. Brak przycisku
„Otwórz w Planerze” (deep link `/coach/planner/?team=…&day=YYYY-MM-DD`). Planner nie obsługuje dziś
parametrów w URL do otwarcia konkretnego dnia — warto dodać.

### P2-4. Spójność drużyna ↔ kategoria
Drużyna Planera wskazuje `training_category_id`. Usunięcie kategorii w Training usuwa też jej konspekty
(`removeCategory`) — Planner nie dostaje ostrzeżenia i powiązanie znika po cichu.
**Poprawka:** w Training przy usuwaniu kategorii sprawdzić, czy jest powiązana z drużyną Planera, i ostrzec.

### P3-1. Drobne niespójności
- Klucz motywu: wspólna powłoka używa `pfg.theme`, Planner ma w konfiguracji martwy `THEME_KEY: 'pfg-theme'` — usunąć.
- Zmiana motywu nie przenosi się między otwartymi kartami (brak nasłuchu `storage`).
- Limity `plannerTeams`/`plannerSeasonDays` są pobierane w `my_entitlements`, ale kod Planera ich nie używa
  (brak obsługi `LIMIT_*` jak w Training) — przekroczenie limitu skończy się „odrzuconym zapisem” zamiast
  czytelnego komunikatu o planie taryfowym.
- Spec (sekcja 8.1) zakłada działanie offline jako PWA, ale **żadna aplikacja nie rejestruje Service Workera**
  — bez sieci strona w ogóle się nie otworzy (cache przeglądarki to nie gwarantuje).

---

## 3. Wdrożenie / serwer (wpływa na synchronizację wersji)

- **P1** `assets/` zawiera 4 kolejne buildy (24.10 ×2, 25.10 ×2) + katalog `assets_old/` (24 pliki).
  Dobrze, że stare pliki zostają (otwarte karty nie dostaną 404), ale nie ma reguły sprzątania. Proponuję
  trzymać 2 ostatnie buildy i usuwać starsze w skrypcie wdrożenia.
- **P2** Brak długiego cache dla plików z hashem. Dodać w `/.htaccess`:
  ```apache
  <IfModule mod_headers.c>
    <FilesMatch "-[A-Za-z0-9_-]{8}\.(js|css|woff2)$">
      Header set Cache-Control "public, max-age=31536000, immutable"
    </FilesMatch>
  </IfModule>
  ```
  Na telefonach z wolnym łączem to duża różnica (bootstrap 343 kB + DocumentPage 178 kB).
- **P2** Reguła `no-cache` obejmuje tylko `manifest.webmanifest`, a nie `manifest-planner/-training/-tactics.webmanifest`.
  Zmienić wzorzec na `^(sw\.js|manifest(-[a-z]+)?\.webmanifest)$`.
- **P2** `/coach/pfg-site.css` i `/coach/pfg-site.js` różnią się od wersji w katalogu głównym i na `pfgfootball.com`,
  ale są linkowane z tym samym `?v=` — stare kopie; usunąć z `/coach/` (nic ich tam nie używa).
- **P3** Brak wykrywania nowej wersji: otwarta karta/PWA działa na starym JS aż do przeładowania.
  Prosty `version.json` sprawdzany przy `visibilitychange` + baner „Dostępna nowa wersja — odśwież”.

---

## 4. Wersje mobilne — co poprawić

Zrzuty wykonane na 390 px i 320 px. Brak poziomego przewijania strony (dobrze), ale:

### Nawigacja i spójność między aplikacjami
- **P1** Training/Tactics na 320 px: zakładki w nagłówku nachodzą na siebie („Boisko” + „Konspekty” → „Boisk**or**”).
  Na wąskich ekranach przenieść zakładki modułu do **dolnego paska** — tak jak w Plannerze.
- **P2** Trzy aplikacje mają trzy różne wzorce nawigacji: Planner — dolny pasek 5 zakładek; Training/Tactics —
  zakładki w ciemnym nagłówku. Ujednolicić: dolny pasek modułu (max 4–5 pozycji) + przełącznik aplikacji
  pod logo (Tactics / Training / Planner) — dziś przejście między aplikacjami na telefonie wymaga powrotu do `/coach/`.
- **P2** Dolny pasek Planera na 320 px: etykieta „Drużyny” jest ucięta, „Harmonogram” zajmuje 1/3 szerokości.
  Skrócić do „Kalendarz” albo ukryć etykiety < 360 px (same ikony + `aria-label`).
- **P2** Strona `/coach/` używa generycznych ikon (zielona tarcza, hantla) zamiast ikon marki z `/brand/*`
  (`tactics-*.webp`, `training-*.webp`, `planner-*.webp`) — inna identyfikacja niż ikony PWA i strona `pfgfootball.com`.

### Planner
- **P1** Pływający przycisk (FAB „+ Tydzień”, „+ Mezocykl”, „+ Mecz”) zasłania treść: plakietkę intensywności
  w karcie dnia, tekst podpowiedzi w Makrocyklu i weekendowe kolumny kalendarza w Harmonogramie.
  Dodać `padding-bottom` treści = wysokość FAB + dolny pasek + `env(safe-area-inset-bottom)`;
  na < 400 px zwijać FAB do okrągłej ikony „+”, rozwijać etykietę przy przewinięciu w górę.
- **P2** Oś sezonu w Makrocyklu na 320 px: etykiety miesięcy ściśnięte, znacznik „Dziś” nachodzi na tekst
  �„Brak mezocykli”. Na telefonie: przewijana poziomo oś z `scroll-snap` albo pionowa lista mezocykli.
- **P2** Nagłówek Mikrocyklu zajmuje ~60% pierwszego ekranu (selektor drużyny, tytuł, 5 przycisków-pigułek, filtry)
  zanim pojawi się pierwszy dzień. „Drukuj plan” / „Eksport cyklu” przenieść do menu „⋯”.
- **P2** CSS Planera używa `100vh` (na iOS zasłaniane przez pasek Safari) — zamienić na `100dvh` jak w powłoce.
- **P3** Planner ma własne breakpointy (520/639/700/960/1100 px), powłoka 599/900, Training 599/720/760/860.
  Wspólne tokeny breakpointów (np. 600 / 900 / 1200) ułatwią utrzymanie.
- **P3** 48 wstawek `style="…"` w HTML generowanym przez Planner (stąd wyjątek `style-src-attr 'unsafe-inline'`
  w CSP tylko dla Planera) — przenieść do klas CSS i usunąć wyjątek.

### Training
- **P2** Biblioteka ćwiczeń na telefonie: przed pierwszym ćwiczeniem jest wyszukiwarka, 2 przyciski importu/eksportu,
  6 list wyboru, „Ulubione”, „Wyczyść filtry” i przełącznik widoku — cały pierwszy ekran to filtry.
  Na < 600 px: wyszukiwarka + przycisk „Filtry (n)” otwierający arkusz od dołu; „Wczytaj/Pobierz bazę” do menu „⋯”.
- **P3** Tak samo w Konspektach i Tactics („Wczytaj/Pobierz” to rzadkie akcje, a są najwyżej na ekranie).

### Tactics (tablica)
- **P1** W pionie na 320 px przyciski paska narzędzi są ucięte do „Boi…” i „O…”, boisko zajmuje ~1/3 wysokości,
  a pod nim jest pusta przestrzeń. Paleta zawodników przewija się poziomo bez wskazówki.
  Propozycja: w pionie boisko obrócone pionowo (bramki góra/dół) na pełną szerokość, narzędzia jako ikony
  z `aria-label`, paleta w dolnym arkuszu; zachęta „Obróć telefon” dla trybu animacji.
- **P3** Brak `manifest`-owego `orientation` — dla Tactics rozważyć `"orientation": "any"` i obsługę obu trybów.

### PWA / instalacja na telefonie
- **P2** Każda aplikacja to osobne PWA z wąskim `scope` (`/coach/planner/` itd.). Link z Planera do Training
  (`target="_blank"`) w zainstalowanej aplikacji otwiera **przeglądarkę**, a na iOS PWA ma **oddzielny magazyn**
  od Safari (inna sesja logowania i inna IndexedDB). Opcje: jedna PWA „PFG Coach” ze `scope: "/coach/"`
  i przełącznikiem aplikacji (zalecane — spójne z P2 wyżej), albo przynajmniej linki bez `target="_blank"`
  w trybie `display-mode: standalone`.
- **P2** Manifesty niespójne: tylko Planner ma ikonę `maskable`, a pliki `coach/tactics/icons/maskable-*.png`
  i `coach/training/icons/*` leżą nieużywane. `background_color` Planera `#0B1422`, pozostałych `#0B0F14`.
  Tactics/Training używają wspólnego `apple-touch-icon.png` (na ekranie iPhone'a wyglądają identycznie).
  Brak `screenshots` i `shortcuts` (np. „Dziś”, „Nowa taktyka”, „Nowy konspekt”).
- **P2** Brak Service Workera → brak trybu offline i brak pełnego monitu instalacji „bogatego” (screenshots).
  Minimalny SW: cache „app shell” (HTML + bieżące `assets/*`), strategia network-first dla HTML.
  Uwaga na istniejące „wyłączniki” `coach/tactics/sw.js` i `coach/training/sw.js` — nowy SW musi mieć
  inną nazwę/scope albo te pliki trzeba zastąpić świadomie.

---

## 5. Kolejność prac (propozycja)

1. **Szybkie poprawki (1–2 dni):** P1-1 (`liveQuery` w Plannerze), P1-4 (refetch po reconnect),
   klucze kolejki z `user.id` + czyszczenie przy wylogowaniu, nagłówki cache, padding pod FAB, zakładki na 320 px.
2. **Spójność (1 tydzień):** stabilny `plannerSessionId`, link zwrotny Training → Planner, ujednolicona nawigacja
   mobilna z przełącznikiem aplikacji, ikony marki, porządki w manifestach.
3. **Architektura (2–3 tygodnie):** Planner na wspólnym silniku synchronizacji (IndexedDB, RPC `sync_*_planner_*`),
   sygnał Realtime dla wszystkich modułów, jedna PWA `/coach/` z Service Workerem i trybem offline.

## 6. Do sprawdzenia na prawdziwych urządzeniach
- iOS Safari + zainstalowana PWA: logowanie w PWA vs Safari, otwieranie Training z Planera.
- Android Chrome: zachowanie Realtime po 10+ min w tle (Doze), `wakeLock` w trybie „Trening w toku”.
- Dwie karty Planera jednocześnie (test P1-3) i edycja tej samej drużyny z dwóch urządzeń (P2-1).
