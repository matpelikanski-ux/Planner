# PFG Planner — specyfikacja funkcjonalna i proponowany układ

Wersja: 0.1 (propozycja) · Data: 2026-10-11

PFG Planner to trzecia aplikacja z zestawu narzędzi trenerskich PFG. Służy do planowania pracy z zespołem
na czterech poziomach: **rok** (harmonogram), **pół roku** (makrocykl z mezocyklami), **tydzień** (mikrocykl)
oraz **drużyna** (każda drużyna ma osobny, odizolowany plan).

> **Do uzupełnienia przed implementacją**
> 1. **Identyfikacja wizualna** — strony `pfgfootball.com` i `test.pfgfootball.com/coach/training/` nie były
>    dostępne podczas przygotowania tej wersji. Sekcja 7 definiuje *strukturę* tokenów i zasady; konkretne
>    wartości (kolory HEX, kroje pisma, logo) trzeba przepisać 1:1 z tych stron / księgi znaku.
> 2. **Plik `image.png`** (zasada zmiany specyficzności treningu) nie trafił do repozytorium. Domyślne wartości
>    parametrów dnia w sekcji 3.4 są oparte na opisie w zleceniu i standardowym morfocyklu — należy je
>    skalibrować z tabelą z pliku (wystarczy podmienić jedną tabelę szablonów, patrz 3.4).

---

## 1. Architektura informacji

```
Drużyna (Team)
└── Sezon (Season)                      ← Harmonogram: daty, dni treningowe, mecze
    ├── Kalendarz zdarzeń (Events)      ← jedno źródło prawdy o datach
    ├── Makrocykl 1 (runda jesienna)    ← ~pół roku
    │   ├── Mezocykl A (np. przygotowawczy)
    │   │   ├── Mikrocykl 1 (tydzień: niedziela → niedziela)
    │   │   │   └── Dni (MD+1 … MD) z parametrami treningu
    │   │   └── Mikrocykl 2 …
    │   └── Mezocykl B (np. startowy) …
    └── Makrocykl 2 (runda wiosenna) …
```

Cztery zakładki (dolny pasek na telefonie, boczny na tablecie/desktopie):

| # | Zakładka | Poziom | Pytanie, na które odpowiada |
|---|----------|--------|-----------------------------|
| 1 | **Makrocykl** | pół roku | „Na czym skupiamy się w kolejnych tygodniach?” |
| 2 | **Mikrocykl** | tydzień | „Co dokładnie robimy w każdym dniu tego tygodnia?” |
| 3 | **Harmonogram** | rok | „Kiedy trenujemy i kiedy gramy?” |
| 4 | **Drużyny** | — | „Dla której drużyny planuję?” |

Kolejność zakładek odzwierciedla częstotliwość użycia (tydzień i półrocze najczęściej), ale **przepływ zakładania
planu** idzie w kolejności 4 → 3 → 1 → 2 (patrz sekcja 6). Aplikacja przy pierwszym uruchomieniu sama prowadzi
trenera tą ścieżką.

### 1.1 Zasada nadrzędna synchronizacji

Daty istnieją **tylko w jednym miejscu** — w kalendarzu zdarzeń sezonu (zakładka Harmonogram). Makrocykl
i mikrocykl **nie przechowują własnych kopii dat treningów i meczów**, tylko je wyliczają. Treść planistyczna
(aspekty, parametry dnia) jest przypięta do tygodnia/zdarzenia przez identyfikator, a nie przez skopiowaną datę.
Dzięki temu każda zmiana w jednym widoku jest natychmiast widoczna w pozostałych bez ręcznego „odświeżania”.

---

## 2. Zakładka 1 — Makrocykl (plan półroczny)

### 2.1 Cel
Rozplanowanie pół roku na mezocykle i mikrocykle tygodniowe oraz przypisanie każdemu tygodniowi akcentów
w czterech aspektach: **taktycznym, motorycznym, technicznym, społecznym**.

### 2.2 Układ (telefon)

```
┌─────────────────────────────────────┐
│ [≡] U-17 PFG ▾        Runda jesienna▾│  ← przełącznik drużyny + makrocyklu
├─────────────────────────────────────┤
│ 04.08 – 26.01 · 26 tyg. · 78 tren. · 15 meczów │  ← podsumowanie (wyliczane)
├─────────────────────────────────────┤
│ ▌PRZYGOTOWAWCZY  04.08–31.08  4 tyg.│  ← mezocykl (kolorowy pasek)
│ ┌─────────────────────────────────┐ │
│ │ T1  03.08–10.08   ●●● 3 tren.   │ │
│ │ ⚽ 10.08 vs Lech (D)             │ │
│ │ [TAK][MOT][TEC][SPO]             │ │  ← chipy aspektów (aktywne = wypełnione)
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ T2  10.08–17.08   ●●●● 4 tren.  │ │
│ │ …                               │ │
├─────────────────────────────────────┤
│ ▌STARTOWY  01.09–…                  │
│ …                                   │
│              [ + Mezocykl ]         │
├─────────────────────────────────────┤
│ MAKRO │ MIKRO │ HARMONOGRAM │ DRUŻYNY│  ← dolna nawigacja
└─────────────────────────────────────┘
```

Na tablecie/desktopie dodatkowo **widok macierzy**: kolumny = tygodnie, wiersze = aspekty, komórki = akcent
(brak / utrzymanie / akcent / główny akcent), plus wiersz „liczba treningów” i wiersz „mecze”. To klasyczny
arkusz periodyzacji, czytelny jednym rzutem oka.

### 2.3 Funkcje
- **Tworzenie makrocyklu**: z harmonogramu — automatycznie dwa makrocykle (runda jesienna / wiosenna) dzielone
  przerwą zimową; trener może zmienić granice lub dodać kolejny (np. okres przejściowy).
- **Mezocykle**: dodawanie, nazwa (lista podpowiedzi: przygotowawczy, startowy, utrzymania, przejściowy,
  własna), kolor, cel opisowy. Granice mezocyklu ustawia się **przeciągając granicę między tygodniami**
  (lub wybierając „pierwszy tydzień / ostatni tydzień”) — mezocykl zawsze składa się z całych mikrocykli.
- **Mikrocykl w makrocyklu** (karta tygodnia):
  - termin od–do (wyliczany z harmonogramu, tylko do odczytu; klik → przejście do Harmonogramu),
  - **liczba treningów** — domyślnie wyliczana z harmonogramu; trener może ją nadpisać, wtedy pojawia się
    plakietka `RĘCZNIE` i ostrzeżenie, jeśli liczba nie zgadza się z kalendarzem (z przyciskiem
    „Dodaj brakujące treningi do harmonogramu” / „Przywróć z harmonogramu”),
  - mecz(e) w tygodniu (z harmonogramu),
  - **aspekty**: dla każdego z 4 aspektów poziom akcentu (0–3) + krótki cel tekstowy (np. TAK: „pressing
    po stracie”, MOT: „siła eksplozywna”, TEC: „podanie pod presją”, SPO: „komunikacja w linii obrony”),
  - typ tygodnia: standardowy (1 mecz) / podwójny (2 mecze) / bez meczu / roztrenowanie.
- **Kopiowanie** akcentów z poprzedniego tygodnia i „rozciągnięcie” celu aspektu na cały mezocykl.

### 2.4 Kluczowe pola danych

| Encja | Pola |
|-------|------|
| `Macrocycle` | id, teamId, seasonId, nazwa, startDate, endDate, cel |
| `Mesocycle` | id, macrocycleId, nazwa, typ, kolor, cel, firstWeekId, lastWeekId |
| `Microcycle` | id, macrocycleId, weekStart (niedziela meczowa poprzedniego tyg.), weekEnd, typTygodnia, trainingsOverride?, notatka |
| `AspectFocus` | microcycleId, aspekt (`tactical`/`physical`/`technical`/`social`), poziom 0–3, cel |

---

## 3. Zakładka 2 — Mikrocykl (plan tygodnia)

### 3.1 Cel
Szczegółowy plan jednego tygodnia **od niedzieli do niedzieli** (mecz → mecz), zbudowany na morfocyklu,
czyli zasadzie zmiany specyficzności treningu w kolejnych dniach.

### 3.2 Ramy tygodnia (morfocykl standardowy)

Niedziela otwierająca tydzień to mecz poprzedni (pokazywany jako punkt odniesienia — wynik, notatka,
„analiza poprzedniego meczu”); niedziela zamykająca to mecz, do którego tydzień prowadzi.

| Dzień | Kod | Rola dnia | Oznaczenie |
|-------|-----|-----------|-----------|
| Niedziela (start) | MD | Mecz poprzedni (odniesienie, tylko odczyt) | ⚽ MECZ |
| Poniedziałek | MD+1 | Dzień wolny (OFF) lub aktywacja | OFF / AKT |
| Wtorek | MD+2 | Regeneracja aktywna | REG |
| Środa | MD-4 | Siła i moc | SIŁA |
| Czwartek | MD-3 | Systemy energetyczne o wysokiej intensywności | WYTRZ. HI |
| Piątek | MD-2 | Szybkość i aktywacja przed meczem | SZYBK. |
| Sobota | MD-1 | Dzień wolny (OFF) lub aktywacja | OFF / AKT |
| Niedziela (koniec) | MD | Mecz | ⚽ MECZ |

- **Sobota i niedziela są zawsze wyraźnie oznaczone**: sobota pełnoszerokościową etykietą `OFF` lub `AKTYWACJA`
  (przełącznik), niedziela kartą meczu (przeciwnik, D/W, godzina) w kolorze akcentu meczowego. W kalendarzu
  i w makrocyklu stosowane są te same oznaczenia.
- Role są zapisane **względem dnia meczu (kod MD±n)**, a nie względem dnia tygodnia. Jeśli w harmonogramie
  mecz zostanie przesunięty (np. na sobotę) albo tydzień ma dwa mecze, aplikacja przelicza kody MD i proponuje
  odpowiedni szablon tygodnia (np. „tydzień skrócony”, „tydzień z meczem w środę”), pytając trenera przed
  nadpisaniem już wpisanej treści.
- Dzień bez treningu w harmonogramie (np. trener trenuje 3× w tygodniu) jest pokazywany jako wyszarzony z
  etykietą `BRAK TRENINGU`; jego parametry nie są wymagane.

### 3.3 Parametry dnia

Każdy dzień treningowy przechowuje i wyświetla poniższe pola (słowniki zamknięte + opcja „inne” tam,
gdzie to sensowne):

| # | Pole | Typ / wartości |
|---|------|----------------|
| 1 | **Zasada treningowa** | `regeneracja` · `sub-zasady` · `główne zasady` · `sub- i sub-sub-zasady` + opis zasady (tekst) |
| 2 | **Grupy zawodników** | `formacje i pozycje` · `pomiędzy liniami` · `wszystkie grupy` (wielokrotny wybór) |
| 3 | **Taktyka / strategia gry** | dynamika w `małej` · `średniej` · `dużej` grze |
| 4 | **Temat treningu** | tekst (np. „Pressing po stracie w strefie środkowej”) |
| 5 | **Złożoność** | `brak` · `niska` · `średnia` · `wysoka` |
| 6 | **Intensywność** | `brak` · `niska` · `średnia` · `wysoka` |
| 7 | **Wielkość boiska / układ strefowy** | `małe` · `średnie` · `ograniczone` · `całe boisko` + opcjonalnie wymiary (m × m) |
| 8 | **Czas trwania i objętość** | seria × czas, np. `4×15'`, `6×10'`, `2×30'` (wyliczana łączna objętość w min) |
| 9 | **Interwały i wypoczynek** | liczba interwałów (int) + wypoczynek między nimi (np. `2'`, `90"`) |
| 10 | **Liczba gier / przeciwników** | format `zawodnicy × przeciwnicy`, np. `5×2`, `8×4`, `10×8`, `11×11` |
| 11 | **Strategia (praca sztabu)** | `analiza poprzedniego meczu` · `analiza następnego przeciwnika` · `definicja składu i taktyki` |

Złożoność i intensywność są osobnymi polami (pokazywanymi razem jako para), bo właśnie ich zmiana między
dniami jest istotą zasady zmiany specyficzności.

Dodatkowo, dla powiązania z makrocyklem, każdy dzień ma **znaczniki aspektów** (TAK/MOT/TEC/SPO) i notatkę.

### 3.4 Szablon domyślny dni (do kalibracji z `image.png`)

Przy tworzeniu tygodnia dni wypełniają się szablonem. Szablon jest jedną tabelą konfiguracyjną
(`dayTemplates`), więc po weryfikacji z plikiem wystarczy zmienić wartości w jednym miejscu.

| Pole | MD+1 OFF/AKT | MD+2 Regeneracja | MD-4 Siła i moc | MD-3 Wytrzymałość HI | MD-2 Szybkość | MD-1 OFF/AKT |
|------|---|---|---|---|---|---|
| Zasada | regeneracja | sub-zasady | sub- i sub-sub-zasady | główne zasady | sub-zasady | regeneracja |
| Grupy | — | wszystkie grupy | formacje i pozycje | wszystkie grupy | pomiędzy liniami | — / wszystkie |
| Taktyka | — | mała gra | mała gra | duża gra | średnia gra | — |
| Złożoność | brak | niska | średnia | wysoka | średnia | brak / niska |
| Intensywność | brak / niska | niska | wysoka | wysoka | wysoka (krótko) | niska |
| Boisko | — | małe | małe / ograniczone | całe boisko | średnie | — / małe |
| Objętość | — | 2×15' | 6×10' | 2×30' / 4×15' | 4×10' | — |
| Interwały / odpoczynek | — | 2 / 3' | 6 / 2' | 2–4 / 3' | 4 / 3' | — |
| Gry | — | 5×2 | 5×2, 8×4 | 10×8, 11×11 | 8×4 | — |
| Strategia | analiza poprzedniego meczu | analiza poprzedniego meczu | analiza następnego przeciwnika | analiza następnego przeciwnika | definicja składu i taktyki | definicja składu i taktyki |

Trener może zapisać własny szablon tygodnia („Mój tydzień 3 treningi”) i używać go w kolejnych mikrocyklach.

### 3.5 Układ (telefon)

```
┌─────────────────────────────────────┐
│ U-17 PFG ▾   ◀ T7 · 14.09–21.09 ▶   │  ← przewijanie tygodni
│ Mezocykl: STARTOWY · 3 treningi     │
│ [TAK●●][MOT●][TEC●●●][SPO●]          │  ← akcenty z makrocyklu (edytowalne)
│ Widok: [Wszystko][TAK][MOT][TEC][SPO]│  ← filtr aspektów
├─────────────────────────────────────┤
│ ND 14.09 ⚽ vs Lech 2:1  (poprzedni) │
│ PN 15.09 ░░ OFF ░░░░░░░░░░░░░░░░░░░ │
│ WT 16.09 REG   niska/niska  ›        │
│ ŚR 17.09 SIŁA  śr./wys.  6×10' 5×2 › │
│ CZ 18.09 WYTRZ wys./wys. 2×30' 11×11›│
│ PT 19.09 SZYBK śr./wys.  4×10' 8×4  ›│
│ SO 20.09 ░░ OFF ░░░░░░░░░░░░░░░░░░░ │
│ ND 21.09 ⚽ MECZ vs Warta (W) 12:00  │
├─────────────────────────────────────┤
│ MAKRO │ MIKRO │ HARMONOGRAM │ DRUŻYNY│
└─────────────────────────────────────┘
```

- Wiersz dnia pokazuje najważniejsze parametry (złożoność/intensywność, objętość, format gry); stuknięcie
  otwiera **kartę dnia** z pełnymi 11 polami, edytowanymi przyciskami-segmentami (bez klawiatury tam, gdzie
  to możliwe).
- **Filtr aspektów** pokazuje tylko pola i notatki dotyczące wybranego aspektu (np. MOT → złożoność,
  intensywność, objętość, interwały, boisko; TAK → zasada, grupy, taktyka, gry, strategia).
- **Wykres „fali” tygodnia** (tablet/desktop, na telefonie po rozwinięciu): słupki złożoności i intensywności
  dla MD+1 … MD — natychmiastowa kontrola, czy zachowana jest zmiana specyficzności (np. ostrzeżenie, gdy
  dwa kolejne dni mają wysoką intensywność i wysoką objętość).

### 3.6 Kluczowe pola danych

| Encja | Pola |
|-------|------|
| `TrainingDay` | id, microcycleId, eventId (trening z harmonogramu), mdCode (`MD+1`…`MD-1`), dayRole (`off`/`activation`/`recovery`/`strength`/`endurance`/`speed`), principle, playerGroups[], tacticalDynamic, topic, complexity, intensity, pitchSize, pitchDims?, volume {sets, minutes}, intervals {count, rest}, gameFormat {players, opponents}, staffStrategy, aspects[], note |

---

## 4. Zakładka 3 — Harmonogram (kalendarz roczny)

### 4.1 Cel
Jedno źródło prawdy o terminach. Na podstawie kilku danych wejściowych generuje kalendarz całego sezonu, który
zasila makrocykle i mikrocykle.

### 4.2 Dane wejściowe (kreator sezonu)
1. **Początek sezonu** i **koniec sezonu** (daty).
2. **Przerwy** (np. zimowa, świąteczna, ferie) — zakresy dat bez treningów.
3. **Liczba treningów w tygodniu** (1–7) i **dni treningowe** z godziną i miejscem (np. WT/ŚR/PT 17:30,
   boisko B). Kreator podpowiada dni zgodne z morfocyklem dla wybranej liczby treningów:
   3 → WT, ŚR, PT; 4 → WT, ŚR, CZ, PT; 5 → PN(akt.), WT, ŚR, CZ, PT.
4. **Domyślny dzień meczu** (niedziela) i godzina.
5. **Terminy meczów** — lista: data, godzina, przeciwnik, dom/wyjazd, rozgrywki (liga, puchar, sparing).
   Wprowadzanie ręczne lub wklejenie listy terminarza (data;przeciwnik;D/W) — parser rozpoznaje wiersze.

Kreator generuje wszystkie zdarzenia (treningi i mecze). Każde wygenerowane zdarzenie można potem
pojedynczo przesunąć, odwołać lub dodać nowe (np. dodatkowy trening, sparing).

### 4.3 Widoki
- **Rok** — 12 mini-miesięcy; kolorowe kropki: trening, mecz (wyróżniony akcentem meczowym), przerwa;
  **soboty i niedziele mają tło wyróżnione** we wszystkich widokach; tło dnia w kolorze mezocyklu.
- **Miesiąc** — siatka tygodni pn–nd z wyraźnie zaznaczonym weekendem, ikoną ⚽ i nazwą przeciwnika.
- **Lista** — chronologiczna lista zdarzeń (najszybsza na telefonie): „ND 21.09 ⚽ Warta (W) 12:00”.
- Licznik: łączna liczba treningów i meczów w sezonie / rundzie / miesiącu, plan vs zrealizowane.

### 4.4 Kluczowe pola danych

| Encja | Pola |
|-------|------|
| `Season` | id, teamId, nazwa (np. 2026/27), startDate, endDate, trainingsPerWeek, trainingSlots[{weekday, time, place}], defaultMatchDay, defaultMatchTime, breaks[{from, to, label}] |
| `Event` | id, seasonId, type (`training`/`match`), date, time, place, status (`planned`/`moved`/`cancelled`/`done`), source (`generated`/`manual`); dla meczu: opponent, homeAway, competition, result? |

---

## 5. Zakładka 4 — Drużyny

### 5.1 Cel
Obsługa wielu drużyn z pełną izolacją danych.

### 5.2 Funkcje
- Lista drużyn (karta: nazwa, kategoria wiekowa, kolor drużyny, najbliższe wydarzenie, bieżący tydzień).
- Dodanie drużyny: nazwa, kategoria (np. U-11 … seniorzy), liga/rozgrywki, kolor rozróżniający, sztab
  (opcjonalnie), domyślna liczba treningów.
- **Duplikowanie struktury** z innej drużyny (szablony tygodnia, nazwy mezocykli) — kopiuje *strukturę*,
  nigdy nie łączy danych; po skopiowaniu drużyny są niezależne.
- Archiwizacja drużyny / sezonu; eksport planu drużyny (PDF tygodnia do wydruku/udostępnienia, JSON kopii).
- Przełącznik drużyny jest stale widoczny w nagłówku każdej zakładki; aktywna drużyna jest oznaczona jej
  kolorem (pasek pod nagłówkiem), aby trener zawsze wiedział, czyj plan edytuje.

### 5.3 Izolacja danych
- Każda encja ma `teamId` (bezpośrednio lub przez `seasonId`); wszystkie zapytania i widoki są filtrowane
  przez aktywną drużynę.
- Synchronizacja (sekcja 8) działa **wyłącznie w obrębie jednej drużyny i jednego sezonu** — zmiana
  w harmonogramie U-17 nie może dotknąć U-15.
- Szablony wspólne (np. szablon tygodnia) są osobną kategorią „Moje szablony” na poziomie trenera; użycie
  szablonu tworzy kopię w drużynie.

---

## 6. Przykładowy przebieg pracy trenera

**Od założenia drużyny do zaplanowania pierwszego mikrocyklu (ok. 10 minut na telefonie).**

1. **Drużyny → „+ Dodaj drużynę”.** Trener wpisuje „U-17 PFG”, wybiera kategorię U-17, ligę wojewódzką,
   kolor niebieski. Aplikacja: „Drużyna gotowa. Ustalmy sezon.” → przejście do Harmonogramu.
2. **Harmonogram → kreator sezonu.**
   - Sezon: 04.08.2026 – 20.06.2027; przerwa zimowa 14.12.2026 – 10.01.2027.
   - Treningi: 3 w tygodniu → aplikacja podpowiada WT/ŚR/PT, trener ustawia 17:30, boisko B.
   - Mecze: domyślnie niedziela 12:00; trener wkleja terminarz rundy jesiennej (15 meczów).
   - Podsumowanie: „Sezon: 45 tygodni · 129 treningów · 30 meczów (15 wpisanych)”. **Zapisz.**
3. **Automatycznie:** powstają dwa makrocykle (runda jesienna 04.08–13.12, wiosenna 11.01–20.06) i lista
   mikrocykli tygodniowych (niedziela → niedziela) z policzonymi treningami i przypisanymi meczami.
4. **Makrocykl (runda jesienna).** Trener dodaje mezocykle: „Przygotowawczy” (tyg. 1–4), „Startowy”
   (tyg. 5–10), „Utrzymania” (tyg. 11–19). W macierzy ustawia akcenty, np. w tygodniu 1: MOT 3
   („baza tlenowa + siła”), TAK 1, TEC 2, SPO 2 („integracja nowych zawodników”). Tydzień 3 ma sparing
   w środę — aplikacja oznacza go jako „tydzień z dwoma meczami”.
5. **Mikrocykl (tydzień 1).** Otwiera się tydzień 2.08–9.08 wypełniony szablonem morfocyklu: PN OFF,
   WT regeneracja, ŚR siła i moc, CZ (brak treningu — 3 treningi), PT szybkość, SO OFF, ND mecz.
   Ponieważ trener trenuje 3×, aplikacja proponuje: „Przenieść akcent wytrzymałości (MD-3) do środy?”
   — trener wybiera „połącz siłę i wytrzymałość w środzie”.
6. **Karta dnia — środa.** Temat: „Pressing po stracie w strefie środkowej”; zasada: sub- i sub-sub-zasady;
   grupy: formacje i pozycje; mała gra; złożoność średnia / intensywność wysoka; boisko ograniczone 30×25 m;
   6×10', 6 interwałów / 2' przerwy; gry 5×2 i 8×4; strategia: analiza następnego przeciwnika. Znaczniki
   aspektów: TAK, MOT.
7. **Kontrola.** Wykres fali tygodnia pokazuje poprawną zmianę specyficzności; znaczniki aspektów dni
   pokrywają akcenty z makrocyklu (MOT 3 → 2 dni z akcentem motorycznym ✓).
8. **Zmiana w trakcie.** Liga przekłada mecz z niedzieli 9.08 na sobotę 8.08. Trener zmienia datę
   w Harmonogramie → mikrocykl przelicza kody MD (PT staje się MD-1, czw. MD-2…), pokazuje baner
   „Mecz przesunięty — dopasuj tydzień” z podglądem zmian; makrocykl aktualizuje kartę tygodnia; sobota
   w kalendarzu dostaje ikonę meczu.

---

## 7. Identyfikacja wizualna (PFG)

### 7.1 Zasady
- **Wierność marce:** kolory, kroje pisma, logo, styl przycisków, kart i nagłówków przenosimy 1:1 z
  `pfgfootball.com` i aplikacji `coach/training` (pierwsze dwie aplikacje zestawu) — trener ma czuć, że to
  ten sam produkt. Komponenty (nagłówek, dolna nawigacja, karta, przycisk główny, chipy) powinny być
  współdzielone z pozostałymi aplikacjami PFG, jeśli istnieje wspólna biblioteka.
- **Ton komunikacji:** krótko, w trybie rozkazującym, językiem trenera („Zaplanuj tydzień”, „Dodaj mecz”,
  „Mecz przesunięty — dopasuj tydzień”), bez żargonu technicznego. Etykiety pól zgodne z terminologią
  morfocyklu (MD+1, MD-4, sub-zasady).
- Wartości kolorów nie są wpisywane w komponentach — tylko przez tokeny poniżej.

### 7.2 Tokeny (wartości do przepisania z marki PFG)

| Token | Zastosowanie | Wartość |
|-------|-------------|---------|
| `--pfg-primary` | główny kolor marki, nagłówek, aktywna zakładka | z pfgfootball.com |
| `--pfg-accent` | przycisk główny, wyróżnienia, akcent meczowy | z pfgfootball.com |
| `--pfg-bg`, `--pfg-surface` | tło aplikacji, tło kart | z pfgfootball.com |
| `--pfg-text`, `--pfg-text-muted` | tekst główny / pomocniczy | z pfgfootball.com |
| `--pfg-font-display` | nagłówki, kody dni (MD-4), liczby | krój nagłówkowy PFG |
| `--pfg-font-body` | treść, formularze | krój tekstowy PFG |
| `--pfg-radius`, `--pfg-shadow` | zaokrąglenia, cienie kart | z aplikacji coach/training |

Kolory funkcjonalne (specyficzne dla Plannera, dobierane w harmonii z paletą PFG i sprawdzane pod kątem
kontrastu): 4 kolory aspektów (TAK/MOT/TEC/SPO), skala 4-stopniowa złożoności/intensywności (brak→wysoka),
kolor weekendu (tło sob./niedz.), kolor meczu, kolor OFF (wyszarzony, kreskowany wzór — rozróżnialny także
bez koloru), kolory mezocykli (paleta 6 barw).

### 7.3 Czytelność przy linii boiska
- Minimalny rozmiar tekstu 16 px, kody dni i liczby 20–24 px; cele dotykowe ≥ 48 × 48 px.
- Kontrast min. WCAG AA (4.5:1), a dla kluczowych etykiet (dzień, MECZ, OFF) cel 7:1 — ekran w słońcu.
- Informacja nigdy tylko kolorem: aspekty mają skróty tekstowe (TAK/MOT/TEC/SPO), intensywność także liczbę
  kropek, OFF wzór kreskowany, mecz ikonę ⚽.
- Najczęstsze akcje jednym kciukiem: dolna nawigacja, przycisk „+” w prawym dolnym rogu, edycja pól przez
  segmenty i chipy zamiast pisania.
- Tryb ciemny (wieczorne treningi) oparty na tych samych tokenach.
- Ekran „Dziś” — po otwarciu aplikacji w dniu treningu pierwsza widoczna jest karta dzisiejszego dnia.

---

## 8. Synchronizacja między zakładkami

### 8.1 Model
- **Jeden magazyn danych na drużynę** (stan aplikacji + lokalna baza offline, np. IndexedDB) ze
  znormalizowanymi encjami z sekcji 2–5. Każda zakładka to *widok* na ten sam stan; wartości pochodne
  (liczba treningów w tygodniu, daty tygodnia, kod MD dnia, liczniki sezonu) są **wyliczane**, nie zapisywane.
- Każda zmiana przechodzi przez jedną warstwę komend (np. `moveEvent`, `setAspectFocus`, `updateTrainingDay`),
  która zapisuje zmianę, przelicza zależności i powiadamia wszystkie widoki. Ta sama warstwa daje historię
  zmian i **cofnij** (ostatnie 20 operacji).
- Aplikacja działa offline (PWA); przy łączności zmiany synchronizują się z kontem trenera, aby plan był taki
  sam na telefonie i komputerze.

### 8.2 Reguły propagacji

| Zmiana | Harmonogram | Makrocykl | Mikrocykl |
|--------|-------------|-----------|-----------|
| Zmiana dat sezonu | regeneracja zdarzeń poza zakresem (z potwierdzeniem) | przeliczenie granic makrocykli i listy tygodni | nowe tygodnie z szablonem; tygodnie poza zakresem → archiwum |
| Dodanie / usunięcie treningu | zdarzenie dodane / odwołane | liczba treningów tygodnia +/−1 | dzień zyskuje / traci status treningowy; wpisana treść nie jest kasowana, tylko oznaczona „bez terminu” |
| Przesunięcie meczu | zmiana daty | karta tygodnia pokazuje nową datę | przeliczenie kodów MD + baner „dopasuj tydzień” |
| Dodanie meczu w tygodniu | nowe zdarzenie | typ tygodnia → „2 mecze” | propozycja szablonu tygodnia z dwoma meczami |
| Zmiana liczby treningów / dni treningowych | regeneracja przyszłych treningów (przeszłe bez zmian) | przeliczone liczby treningów | aktualizacja dni treningowych przyszłych tygodni |
| Zmiana akcentu aspektu | — | zapis | chipy akcentów w nagłówku tygodnia; ostrzeżenie, jeśli dni nie pokrywają akcentu |
| Nadpisanie liczby treningów w makrocyklu | propozycja dodania / usunięcia treningów | plakietka `RĘCZNIE` | — |
| Edycja parametrów dnia / znaczników aspektów | — | wskaźnik pokrycia aspektów w karcie tygodnia | zapis |
| Zmiana granic mezocyklu | tło dni w kolorze mezocyklu | zapis | nazwa mezocyklu w nagłówku tygodnia |
| Zmiana aktywnej drużyny | wszystkie widoki przełączają się na dane wybranej drużyny | ← | ← |

### 8.3 Zasady bezpieczeństwa danych
- **Nigdy nie kasujemy cichaczem treści trenera.** Gdy zmiana dat „osieroca” zaplanowany dzień, treść trafia
  do sekcji „Do przypisania” w mikrocyklu z możliwością przeniesienia na inny dzień.
- Operacje masowe (regeneracja treningów, zmiana dat sezonu) pokazują podgląd: „Zmieni się 12 treningów,
  2 zaplanowane dni wymagają przypisania”.
- Zdarzenia przeszłe (`done`) nie są regenerowane automatycznie.

---

## 9. Model danych (zbiorczo, TypeScript)

```ts
type ID = string;
type ISODate = string; // YYYY-MM-DD

interface Team { id: ID; name: string; ageGroup: string; competition?: string; color: string; archived: boolean }

interface Season {
  id: ID; teamId: ID; name: string; startDate: ISODate; endDate: ISODate;
  trainingsPerWeek: number;
  trainingSlots: { weekday: 0|1|2|3|4|5|6; time: string; place?: string }[];
  defaultMatchDay: 0|1|2|3|4|5|6; defaultMatchTime: string;
  breaks: { from: ISODate; to: ISODate; label: string }[];
}

interface Event {
  id: ID; seasonId: ID; type: 'training' | 'match'; date: ISODate; time?: string; place?: string;
  status: 'planned' | 'moved' | 'cancelled' | 'done'; source: 'generated' | 'manual';
  match?: { opponent: string; homeAway: 'H' | 'A'; competition: 'league' | 'cup' | 'friendly'; result?: string };
}

interface Macrocycle { id: ID; seasonId: ID; name: string; startDate: ISODate; endDate: ISODate; goal?: string }
interface Mesocycle  { id: ID; macrocycleId: ID; name: string; kind: string; color: string; goal?: string; firstWeekId: ID; lastWeekId: ID }

type Aspect = 'tactical' | 'physical' | 'technical' | 'social';
interface Microcycle {
  id: ID; macrocycleId: ID; weekStart: ISODate; weekEnd: ISODate; // niedziela → niedziela
  weekType: 'standard' | 'double' | 'no-match' | 'transition';
  trainingsOverride?: number; note?: string;
  focus: Record<Aspect, { level: 0|1|2|3; goal?: string }>;
}

type Level = 'none' | 'low' | 'medium' | 'high';
interface TrainingDay {
  id: ID; microcycleId: ID; eventId?: ID;                 // brak eventId = „Do przypisania”
  mdCode: 'MD+1' | 'MD+2' | 'MD-4' | 'MD-3' | 'MD-2' | 'MD-1';  // wyliczany, cache do odczytu
  dayRole: 'off' | 'activation' | 'recovery' | 'strength' | 'endurance' | 'speed';
  principle: 'recovery' | 'sub' | 'main' | 'sub-sub'; principleNote?: string;
  playerGroups: ('units-positions' | 'between-lines' | 'all')[];
  tacticalDynamic?: 'small' | 'medium' | 'large';
  topic?: string;
  complexity: Level; intensity: Level;
  pitchSize?: 'small' | 'medium' | 'restricted' | 'full'; pitchDims?: { length: number; width: number };
  volume?: { sets: number; minutes: number };             // 4×15'
  intervals?: { count: number; restSeconds: number };
  gameFormats: { players: number; opponents: number }[];  // 5×2, 8×4, 10×8, 11×11
  staffStrategy?: 'prev-match-analysis' | 'next-opponent-analysis' | 'lineup-and-tactics';
  aspects: Aspect[]; note?: string;
}
```

Zależności wyliczane: `trainingsInWeek(microcycle)`, `matchesInWeek(microcycle)`, `mdCode(day)`,
`aspectCoverage(microcycle)`, `seasonTotals(season)`.

---

## 10. Zakres MVP i kolejne etapy

**MVP:** drużyny (CRUD, izolacja), kreator sezonu i harmonogram (lista + miesiąc), makrocykl z mezocyklami
i akcentami aspektów, mikrocykl z szablonem morfocyklu i pełną kartą dnia, synchronizacja wg 8.2, offline,
eksport tygodnia do PDF.

**Etap 2:** widok roczny i macierz periodyzacji, wykres fali tygodnia z ostrzeżeniami, własne szablony,
import terminarza, synchronizacja między urządzeniami, połączenie z biblioteką ćwiczeń aplikacji
`coach/training` (temat dnia → gotowe ćwiczenia).

**Etap 3:** dostęp dla sztabu (asystent, trener przygotowania motorycznego) z rolami, realizacja vs plan
(obecność, RPE), raporty obciążeń.
