# Faktum — News ohne Werbung

Eine werbefreie, faktenorientierte Nachrichten-App als PWA. Läuft auf GitHub Pages,
kostet nichts, und legt sich als eigenes Icon auf den iPhone-Homescreen.

**Kategorien:** Für dich · Flash · Fokus · Wirtschaft · Sport · Wissenschaft · Welt ·
Österreich · Korneuburg · Termine · Gemerkt · Wetter · Historie

**25 Quellen, Deutsch und Englisch.** Bewusst knapp gehalten.

---

## Wie es funktioniert

```
Stündlich 5:30–23:00 (Actions)            Beim Öffnen (dein iPhone)
┌────────────────────────────┐        ┌──────────────────────────┐
│ 72 RSS-Feeds abrufen       │        │ news.json laden          │
│ Meinung/Werbung filtern    │        │ nach Vorlieben sortieren │
│ Duplikate zusammenführen   │        │ Wetter per GPS holen     │
│ ins Deutsche übersetzen    │  --->  │ 👍/👎 lokal speichern    │
│ nochmal filtern (deutsch)  │        │ Bild antippen = Vollbild │
│ Faktenscore berechnen      │        └──────────────────────────┘
│ -> docs/data/news.json     │
└────────────────────────────┘
```

Der Abruf passiert **serverseitig** in GitHub Actions. Das umgeht CORS
(Browser dürfen fremde RSS-Feeds nicht direkt laden) und bedeutet: keine
Proxies, keine API-Keys, kein Server, den du betreiben musst.

---

## Einrichten (einmalig, ca. 5 Minuten)

### 1. Repository anlegen

```bash
cd ~/FaktenNews
git init -b main
git add .
git commit -m "Fakten-News-App"
```

Dann auf github.com ein **neues, leeres Repository** anlegen (z. B. `fakten-news`)
und verbinden:

```bash
git remote add origin https://github.com/DEIN-NAME/fakten-news.git
git push -u origin main
```

### 2. GitHub Pages aktivieren

Im Repository: **Settings → Pages → Source: „GitHub Actions"**.

### 3. Ersten Lauf starten

**Actions → „News aktualisieren" → „Run workflow"**.

Falls Actions gesperrt ist: **Settings → Actions → General →
Workflow permissions → „Read and write permissions"** aktivieren.

Nach ein bis zwei Minuten ist die App erreichbar unter:

```
https://DEIN-NAME.github.io/fakten-news/
```

### 4. Aufs iPhone legen

1. Die URL in **Safari** öffnen (nicht Chrome — nur Safari kann PWAs installieren)
2. Teilen-Symbol antippen
3. **„Zum Home-Bildschirm"**
4. Name bestätigen → fertig

Die App startet ab jetzt im Vollbild ohne Safari-Leiste, mit eigenem Icon.

---

## Das Update-Fenster

Gebaut wird **stündlich von 5:30 bis 23:00 Uhr Wiener Zeit**, nachts nicht.
Cron kennt keine Zeitzonen und keine Sommerzeit, deshalb ist der Auslöser in UTC
großzügig gesetzt und `build-news.mjs` entscheidet anhand der echten Wiener Uhrzeit,
ob gebaut wird. Ein manueller Start im Actions-Tab ignoriert das Fenster, der
↻-Knopf in der App lädt ohnehin jederzeit neu.

Lokal testen außerhalb des Fensters:

```bash
FAKTUM_FORCE=1 node scripts/build-news.mjs
```

Zwei ehrliche Einschränkungen:

- **iOS erlaubt keine echten Hintergrund-Updates für PWAs.** Faktum kann sich nicht
  selbst aktualisieren, während es geschlossen ist, und keine Push-Benachrichtigungen
  ohne zusätzlichen Server schicken. Aktualisiert wird beim Öffnen — die Daten sind
  dann trotzdem frisch, weil der Build serverseitig lief.
- **GitHub verschiebt Cron-Läufe bei hoher Last** um einige Minuten.

Scheduled Workflows werden nach 60 Tagen Repo-Inaktivität deaktiviert. Das passiert
hier nicht: Der Workflow committet selbst und hält das Repo aktiv.

---

## Flash-News

Schwere Unfälle, Katastrophen und Warnungen — bewusst eng gefasst. Eine Meldung muss
ein **Ereignis** nennen (Unfall, Brand, Explosion, Hochwasser, Evakuierung, Warnung …)
*und* zusätzlich **Schwere** (Tote, Schwerverletzte, Großeinsatz) oder **Regionalbezug**
zeigen. Ohne diese Kombination stünde der Tab voller Alltagskriminalität.

---

## Fokusthemen

Raiffeisen/RBI, Agile Coaching und KI-Modelle. Zwei Wege führen in den Fokus-Tab:

1. **Eigene Quellen** — Ars Technica AI, TechCrunch AI, The Verge AI, MIT Technology
   Review, Google DeepMind, The Register, heise, Golem, t3n, InfoQ Agile,
   InfoQ Kultur & Methoden, Scrum.org.
2. **Stichworttreffer** aus allen anderen Kategorien (siehe `FOCUS_TOPICS`).

Fokusmeldungen werden zusätzlich in „Für dich" nach oben gewichtet.

Ein starker Begriff **im Titel** genügt. Steht er nur im Fließtext, braucht es ein
zweites Signal — sonst galt ein Leseraufruf von Le Monde, in dem „künstliche
Intelligenz" beiläufig vorkam, als KI-Meldung.

> Agile Coaching liefert naturgemäß wenig: In diesem Feld wird selten und langsam
> publiziert. Ein paar Meldungen pro Woche sind normal, nicht ein Fehler.

---

## Merken, Gelesen und Löschen

- **Merken** speichert die Meldung **vollständig** im Gerät — sie bleibt lesbar, auch
  wenn die Quelle den Artikel entfernt oder sie aus `news.json` rotiert ist.
- **Gelesen** wird eine Meldung, wenn sie **5 Sekunden** zu mindestens 60 % sichtbar
  war (`IntersectionObserver`). Sie wird nicht sofort ausgeblendet — das würde beim
  Lesen stören — sondern verschwindet beim nächsten Aufbau des Feeds.
- **👍 Relevant** heißt „gut ausgewählt, entspricht meinen Kriterien". Die Meldung
  bleibt sichtbar.
- **👎 Eher nicht** blendet aus und merkt sich den Inhalt als unbrauchbar.
- **Gelöscht** wird nach 3 Tagen: Meldungen und Lesestatus. Die Historie hält 30 Tage.
  **Gemerktes und das Lernprofil bleiben dauerhaft** — sonst würde sich der Algorithmus
  alle drei Tage zurücksetzen und nie etwas über dich lernen.

---

## Der Info-Block

Über den Meldungen in **Für dich** und **Flash** steht eine Liste mit dem, was gerade
in der Umgebung zählt:

1. **Wetterwarnungen** von GeoSphere Austria für den aktuellen Standort
2. **Straßenmeldungen** zu A22, A23, A5, S1 und der B3
3. **ÖBB-Streckensperren** der Region Wien/Niederösterreich
4. **Wetter** am Standort plus die nächsten drei Stunden

Zuerst war das ein Laufband am unteren Rand. Das war die schlechtere Idee: Ein Ticker
zwingt zum Warten, bis die gewünschte Zeile vorbeikommt, und die Höhenberechnung
kollidierte auf dem iPhone mit der Home-Indicator-Zone. Als Liste ist alles auf einen
Blick da.

### Woher die Verkehrsdaten kommen — und woher nicht

**Streckensperren:** von der offiziellen Baustellenübersicht der ÖBB
(`oebb.at/de/fahrplan/baustelleninformation`). Das ist **kein Feed, sondern eine
Website**, die ausgelesen wird. Ihre Linktexte enthalten Strecke und Zeitraum
vollständig — wenn ÖBB die Seite umbaut, meldet der Build „Keine Links gefunden".

Der ÖBB-**RSS-Feed** taugt dafür nicht: Er listet einzelne Zugausfälle und hatte für
Wien/NÖ zuletzt nur Einträge vom **Dezember 2025**.

**Autobahnen: keine Livedaten.** ASFINAG beantwortet automatisierte Abrufe mit
HTTP 403, `data.gv.at` liefert 404, VOR ebenfalls. Wiener Linien hat eine offene
Schnittstelle, die deckt aber nur Straßenbahn, Bus und U-Bahn ab.

Stattdessen werden Meldungen aus den vorhandenen Nachrichtenquellen erkannt, wenn sie
**eine Strecke nennen und ein Ereignis beschreiben** — „A22 Radweg feierlich eröffnet"
nennt die Strecke, beschreibt aber kein Ereignis und wird verworfen.

> Du siehst einen Stau, **sobald eine Redaktion darüber berichtet** — nicht wenn er
> entsteht. Für Echtzeit führt kein Weg an einer ASFINAG-Registrierung vorbei.

---

## Der Faktencheck — was er leistet und was nicht

Es gibt keine Technik, die Wahrheit automatisch erkennt. Die App macht daher
etwas anderes, das ehrlich funktioniert: sie bewertet die **Quellenlage**.

**Vorgeschaltet (Auswahl der Quellen)**
Nur kuratierte Redaktionen mit Impressum und Korrekturpraxis: öffentlich-rechtliche
Sender (ORF, tagesschau, BBC, France 24, RFI, NOS, SVT, NRK, DR, Deutsche Welle),
Nachrichtenagenturen (ANSA) und etablierte Qualitätszeitungen (FT, NYT, Le Monde,
Le Figaro, El País, la Repubblica, Il Sole 24 Ore, DER STANDARD, Die Presse, KURIER,
Handelsblatt, Guardian, POLITICO). Kein Boulevard, keine Aggregatoren, keine
Social-Media-Quellen — und bewusst keine staatlich gelenkten Auslandssender
(RT, Xinhua, TASS), denen die redaktionelle Unabhängigkeit fehlt.

**Auf Aktualität geprüft, nicht nur auf Erreichbarkeit**
Mehrere prominente Feeds antworten mit HTTP 200 und Dutzenden Einträgen und sind
trotzdem tot. Aussortiert wurden deshalb: **WSJ** (neuester Eintrag Januar 2025),
**Corriere della Sera** (Mai 2024), **Gazzetta dello Sport** (2023) und **NHK**
(13 Tage alt). Der Build warnt seither automatisch, wenn ein Feed länger als
7 Tage nichts Neues liefert — dann steht `ALT` statt `ok` im Protokoll und unter
⚙ → Quellen erscheint der Hinweis.

**Beim Build (`scripts/build-news.mjs`)**
- Kommentare, Kolumnen, Glossen, Leitartikel, Gastbeiträge → aussortiert
- Werbung, Advertorials, Gewinnspiele, Horoskope → aussortiert
- Stream- und Programmhinweise („Live hören", „Video:") → aussortiert
- Doppelmeldungen werden **zweistufig** zusammengeführt (siehe unten); berichten
  mehrere unabhängige Redaktionen dasselbe, steigt der Faktenscore — das ist das
  stärkste automatisch verfügbare Signal gegen eine Falschmeldung
- Stichprobe von 12 Original-Links wird auf Erreichbarkeit geprüft;
  tote Links bekommen den Hinweis „Link prüfen"

**Faktenscore 0–100** aus Quellengüte, Konkretheit und Länge des Textes,
Zeitstempel, expliziten Zuschreibungen („laut …", „nach Angaben von …") und
Abzügen für reißerische Sprache. Angezeigt als `hoch` (≥78), `solide` (≥60)
oder `prüfen`.

> Der Score bewertet, wie sehr eine Meldung einer nüchternen, überprüfbaren
> Nachricht entspricht — **nicht ihren Wahrheitsgehalt**. Jede Meldung verlinkt
> deshalb immer auf das Original.

### Doppelte Meldungen

Der Abgleich läuft **zweimal**. Der erste Durchlauf fängt Dubletten innerhalb einer
Sprache. Der zweite läuft **nach der Übersetzung** und ist der eigentlich wirksame:
Erst wenn alle Titel deutsch sind, lässt sich erkennen, dass Le Monde, NOS und ORF
dieselbe Meldung bringen — vorher stehen sie in drei Sprachen da und haben kein
einziges Wort gemeinsam.

Drei Details, die den Unterschied machten:

- **Nur der Titel wird verglichen**, nicht Titel plus Fließtext. Zwei Meldungen mit
  wortgleicher Überschrift, aber unterschiedlich langem Text rutschten sonst unter die
  Schwelle — so entkamen Le Monde und Le Figaro mit identischem Titel der Erkennung.
- **Gleiche markante Zahlen** (Beträge, Opferzahlen, Spielergebnisse) gelten als
  starkes Signal. Das fängt Paare, die sprachlich weit auseinanderliegen: „Hunt wird
  Zweiter über 200 m" und „Hunt holt Silber über 200 m" haben nur 23 % Wortähnlichkeit.
- **Wissenschaft und Fokus bekommen eine höhere Schwelle** (0,60 statt 0,42). Dort ist
  Fachvokabular-Überlappung normal: „Klimawandel könnte den Weizenpreis verdreifachen"
  und „Waldbrandfläche könnte sich verdreifachen" galten sonst als dieselbe Meldung.

Ergebnis im Test: von 20 verdächtigen Paaren blieb eines übrig — und das ist der
absichtlich verschonte Wissenschafts-Fall.

---

## Warum nur 25 Quellen — und nur zwei Sprachen

Der Bestand lag zwischenzeitlich bei 79 Quellen in acht Sprachen. Das war zu viel,
und zwar an einer konkreten Stelle: der Übersetzung.

Der kostenlose Übersetzungsdienst begrenzt nach **Anzahl der Aufrufe**. Bei 79 Quellen
kamen pro Lauf über 20 Anfragen allein für Englisch zusammen; der Dienst antwortete mit
HTTP 429 und übersetzte zuletzt nur noch **4 Prozent**. Kein Fehler im Code — die
schlichte Grenze eines Dienstes, der nicht für diese Menge gedacht ist.

Die Konsequenz: **nur Deutsch und Englisch.** Englisches muss nicht übersetzt werden,
und damit verschwindet der Engpass fast vollständig. Übrig bleiben rund 250 englische
Texte beim ersten Lauf, danach greift der Cache und es sind wenige Dutzend pro Stunde.

### Was dadurch wegfällt

Ehrlich benannt: **die nicht-englische Außensicht.** Le Monde, El País, la Repubblica,
ANSA, NOS, SVT, NRK, DR und RFI sind entfallen. Damit fehlt, wie in Paris, Madrid, Rom
oder Stockholm über dieselben Ereignisse berichtet wird — das war der eigentliche Wert
dieser Quellen und er lässt sich nicht durch BBC und NYT ersetzen.

Ebenfalls entfallen: Nature, Spektrum, scinexx, phys.org, ESA, Sky & Telescope
(Wissenschaft), heise, Golem, t3n, MIT Technology Review, DeepMind, InfoQ (Fokus),
Sportschau, MARCA, KURIER Sport, Die Presse Sport, Guardian, POLITICO, Al Jazeera,
Japan Times, Handelsblatt, CNBC, Euronews, tagesschau.

Wer das zurückholen will, trägt die Quelle wieder in
[`scripts/sources.mjs`](scripts/sources.mjs) ein — und sollte dann den
Claude-Rückfall aktivieren, sonst bleibt Fremdsprachiges unübersetzt.

---

## Übersetzung

Nicht-deutsche Meldungen werden beim Build ins Deutsche übersetzt — Titel zuerst,
dann Kurztexte. Bricht der Dienst mittendrin ab, sind wenigstens alle Überschriften
deutsch und der Feed bleibt überfliegbar.

Zwei Dinge, die beim Bauen wichtig wurden:

- **Nach Sprache gebündelt.** Mischt man Sprachen in einer Anfrage und lässt den Dienst
  raten, erkennt er nur die Mehrheitssprache und halluziniert den Rest. Ein japanischer
  Titel wurde im Test zu *„Ich bin mir nicht sicher, was ich tun soll."*
- **Cache.** Übersetztes landet in `docs/data/i18n-cache.json` und wird mitcommittet.
  Jeder Text wird genau einmal übersetzt.

Scheitert die Übersetzung, bleibt die Meldung in der Originalsprache und trägt ein
**oranges Sprachkennzeichen**. Die Kopfzeile nennt die Zahl. Beim nächsten Lauf wird
erneut versucht.

> ⚠ **Maschinelle Übersetzung kann die Aussage verdrehen.** Im Test wurde aus
> *„Uber condamné à une amende"* (Uber **wurde** bestraft) das deutsche „Uber
> **verhängte** eine Geldstrafe". Deshalb steht bei jeder übersetzten Meldung der
> Originaltitel in der Einordnung.

### Rückfallebene: Claude

Ist das Repository-Secret `ANTHROPIC_API_KEY` gesetzt, übersetzt Claude (Haiku 4.5)
genau die Texte, an denen der kostenlose Dienst gescheitert ist. Ohne Secret ist der
Rückfall inaktiv, der Build läuft unverändert durch.

Einrichten: **Settings → Secrets and variables → Actions → New repository secret**,
Name `ANTHROPIC_API_KEY`.

---

## Wie alt Meldungen sein dürfen

| Kategorie | Fenster |
|---|---|
| Wissenschaft, Korneuburg | 7 Tage |
| Fokus | 5 Tage |
| alles Übrige | 48 Stunden |

Nachrichten altern in Stunden, Forschung nicht. Mit 48 Stunden für alles trugen Nature,
ESA und die Ernährungs-Umschau nichts bei — sie publizieren seltener — und wurden
zusätzlich fälschlich als tote Feeds gemeldet. Die Totmelder-Erkennung schaut jetzt auf
das Alter des jüngsten Eintrags, nicht darauf, ob Meldungen durchs Zeitfenster kamen.

---

## Bilder

Bilder erscheinen als kleines Vorschaubild rechts neben dem Text. **Antippen öffnet
das Vollbild**, ein Tippen daneben oder auf ✕ schließt es wieder. Wenn eine Meldung
kein Bild hat, stehen Überschrift und Kurztext über die volle Breite. Bilder lassen
sich unter ⚙ ganz abschalten.

---

## Die Lernfunktion

Jede Meldung hat **👍 Relevant** und **👎 Eher nicht**. Daraus lernt die App drei Dinge:

| Signal | Gewicht |
|---|---|
| Quelle | ±1,0 pro Bewertung |
| Kategorie | ±0,6 |
| Schlagwörter aus Titel und Text | ±0,7 je Wort |

Der Tab **„Für dich"** sortiert danach — kombiniert mit Aktualität und Faktenscore.
Damit dich der Algorithmus nicht in eine Blase sortiert, mischt eine
Diversifizierung die Reihenfolge so, dass nicht mehrere Meldungen derselben
Quelle direkt hintereinander stehen.

Alles bleibt **lokal auf deinem Gerät** (localStorage). Kein Konto, kein Tracking,
keine Übertragung. Unter ⚙ siehst du dein Profil und kannst es zurücksetzen.

---

## Optional: KI-Einordnung

Der Button **💡 Einordnung** zeigt ohne Konfiguration eine regelbasierte Analyse
der Quellenlage. Hinterlegst du unter ⚙ einen Anthropic-API-Key, erstellt
Claude zusätzlich eine inhaltliche Einordnung (worum es geht, warum es relevant
ist, was offen bleibt, was man ohne Zweitquelle nicht übernehmen sollte).

Key besorgen: <https://console.anthropic.com> → API Keys.
Kosten: wenige Cent pro Tag bei normaler Nutzung.

> ⚠ Der Key liegt im localStorage des Browsers und geht direkt an
> `api.anthropic.com`. Das ist bequem, aber kein Tresor — setze in der Konsole
> ein Ausgabelimit für den Key.

---

## Quellen anpassen

Alle Quellen stehen in [`scripts/sources.mjs`](scripts/sources.mjs):

```js
{ name: 'ORF Österreich', cat: 'oesterreich', trust: 3, lang: 'de',
  url: 'https://rss.orf.at/oesterreich.xml', site: 'orf.at' },
```

- `trust`: 3 = öffentlich-rechtlich/Agentur, 2 = Qualitätszeitung, 1 = regional
- `requireLocal: true` → nur Meldungen mit Ortsbezug (siehe `LOCAL_TERMS`)

Neue Filterregeln kommen in `OPINION_PATTERNS` (Meinung/Werbung raus) oder
`CLICKBAIT_PATTERNS` (Punktabzug).

Danach lokal testen:

```bash
node scripts/build-news.mjs
```

---

## Eigene Änderungen hochladen

Der News-Bot committet stündlich `news.json` und `i18n-cache.json`. Wer zwischendurch
selbst etwas ändert, bekommt beim Push ein `rejected (fetch first)` — der Remote ist
weitergezogen. Statt `git push` deshalb:

```bash
./sync.sh
```

Das Skript holt den Bot-Stand, setzt die eigenen Commits darauf und löst die
Konflikte in den generierten Dateien automatisch auf:

- **news.json** → die eigene, neuere Fassung (wird ohnehin stündlich neu gebaut)
- **i18n-cache.json** → beide Seiten werden **vereinigt**, nicht ersetzt. Sonst gingen
  bereits übersetzte Meldungen verloren und müssten erneut durch den Dienst.

Auch der Bot selbst kann in diesen Wettlauf geraten: Er checkt aus, baut mehrere
Minuten und pusht dann. Landet in dieser Zeit ein anderer Push, wird er abgelehnt.
Der Workflow versucht es deshalb bis zu fünfmal mit wachsender Pause.

---

## Termine

Ein eigener Tab zeigt Veranstaltungen der **nächsten zwei Wochen** für Korneuburg,
Stockerau und Wien, nach Tagen gruppiert und chronologisch sortiert.

Auch hier gibt es keine Schnittstelle: Wien liefert auf seinem Veranstaltungsdienst
HTTP 500, `data.gv.at` 404, die Stadt Korneuburg hat keinen Kalenderexport, Falter und
events.at ebenfalls 404. meinbezirk.at stellt seine Terminlisten aber in gleichmäßigem
HTML dar (`<ul class="content-card-date-location">` mit Datum, Ort und Gemeinde),
das sich zuverlässig auslesen lässt.

---

## Hintergrund zu laufenden Themen

Meldungen zu wiederkehrenden Themen tragen ein kleines **(i)** neben der Überschrift.
Ein Tipp darauf öffnet zwei Dinge:

- **Hintergrund** — gesicherte Eckdaten aus einer kuratierten Sammlung: Beginn,
  Beteiligte, Verlauf in groben Zügen. Bewusst **ohne Tagesaktuelles**, denn ein
  „aktueller Stand" in einer statischen Datei veraltet sofort und wäre dann schlechter
  als gar nichts.
- **Aktuell dazu in Faktum** — die jüngsten eigenen Meldungen zum selben Thema. Das ist
  der aktuelle Stand, und er hält sich von selbst frisch.

Themen: Ukraine-Krieg, Nahost, Handelskonflikte, EZB und Inflation, Klimapolitik,
KI-Regulierung, österreichische Innenpolitik, Raiffeisen. Erweiterbar in
`CONTEXT_TOPICS` in [`scripts/sources.mjs`](scripts/sources.mjs).

Die Zuordnung verlangt **mindestens zwei Treffer** — ein beiläufiges „Moskau" soll
keinen ganzen Kriegshintergrund einblenden. Kurze Begriffe bis drei Zeichen werden
beidseitig auf Wortgrenzen festgenagelt: Ohne diese Regel galt „De Zerbi" als
Raiffeisen-Meldung, weil „rbi" darin steckt, und jedes „Kind" als KI-Thema.

---

## Mehrere Personen auf einem Gerät

Unter ⚙ ganz oben lässt sich zwischen Profilen wechseln. Jedes hat **eigene
Bewertungen, eigene Merkliste, eigenen Lesestatus und eigene Einstellungen** —
einschließlich des API-Keys. Geteilt wird nur der Nachrichtenbestand, der ohnehin
für alle derselbe ist.

Technisch: Jedes Profil bekommt einen eigenen Namensraum im Speicher
(`faktum.<id>.prefs.v1` statt `faktum.prefs.v1`). Beim ersten Start mit dieser
Fassung werden die vorhandenen Daten ins erste Profil kopiert; die alten Schlüssel
bleiben als Sicherung liegen.

> Es gibt kein Passwort und keine Anmeldung. Die Trennung ist gegen **Vermischung**
> gedacht — damit nicht die Fußballinteressen des einen die Opernvorschläge des
> anderen verdrängen — nicht gegen neugierige Mitbewohner. Wer echten Schutz
> braucht, nimmt getrennte Geräte oder getrennte Browserprofile.

---

## Warum APA nicht als Quelle auftaucht

Kurz: **APA-Material ist längst drin, nur unter anderem Namen.**

Die Austria Presse Agentur ist ein Großhändler. Sie verkauft ihre Meldungen an
Redaktionen und betreibt selbst keinen öffentlichen Nachrichtenkanal. Geprüft wurden
`apa.at/rss`, `apa.at/feed`, `science.apa.at` und mehrere OTS-Adressen:

- `apa.at/rss` liefert **zwei Einträge, datiert Oktober 2024 und Juni 2020** — ein
  Firmenblog über KI-Recht und Textautomatisierung, kein Nachrichtenfeed.
- `science.apa.at` verlinkt keinen Feed.
- Die OTS-Adressen antworten mit 404.

Zugleich stammen **124 der rund 380 Meldungen** aus Häusern, die APA-Kunden sind:
ORF, DER STANDARD, Die Presse und KURIER. Deren Agenturmeldungen sind APA-Material,
redaktionell geprüft und mit Quellenangabe.

**OTS wäre technisch verfügbar, wird aber bewusst nicht eingebunden.** Das ist der
Presseaussendungsdienst der APA: Dort veröffentlichen Unternehmen, Parteien und
Verbände gegen Bezahlung ihre eigenen Mitteilungen. Das ist PR, keine Berichterstattung
— und würde dem Grundsatz dieser App direkt widersprechen.

---

## Wenn die App eine alte Fassung zeigt

iOS stellt installierte Web-Apps beim Öffnen häufig aus dem Speicher wieder her,
statt sie neu zu laden. Dann läuft der alte Code weiter und prüft nie auf Neues —
weder der Service Worker noch Warten hilft.

Faktum erkennt das jetzt selbst: Der Build schreibt die App-Fassung nach
`news.json`, und `news.json` wird bei jedem Start frisch aus dem Netz geholt.
Weicht die laufende Fassung ab, leert die App ihre Zwischenspeicher, meldet den
Service Worker ab und lädt einmal neu. Ein Merker in `sessionStorage` verhindert
eine Schleife: Scheitert es zweimal mit derselben Fassung, erscheint stattdessen
der Hinweis, die App einmal zu schließen und neu zu öffnen.

Notfalls von Hand: Icon vom Home-Bildschirm löschen, in **Einstellungen → Safari →
Erweitert → Website-Daten** den Eintrag `github.io` entfernen, Seite in Safari neu
öffnen und wieder zum Home-Bildschirm hinzufügen. Dabei gehen Gemerktes und das
Lernprofil verloren.

---

## Warum der Zeitplan von GitHub nicht reicht

GitHub führt geplante Läufe ausdrücklich nur als „best effort" aus. Für dieses
Repository wurde das messbar schlechter — verlangt waren 20 Läufe am Tag:

| Tag | tatsächliche Läufe |
|---|---|
| 22.08. | 15 |
| 23.08. | 14 |
| 24.08. | 10 |
| 25.08. | 9 |
| 26.08. | 5 |
| 27.08. | **0** |

28 Stunden ohne einen einzigen Lauf. Kein Fehler, kein deaktivierter Workflow,
kein Hinweis — die Daten froren einfach ein.

**Lösung:** Ein externer Wecker stößt den Build über `repository_dispatch` an.
Der GitHub-Cron bleibt als zusätzliche Absicherung bestehen.

Wichtig dabei: Ein `repository_dispatch` hält die Nachtruhe genauso ein wie der
Zeitplan — er ist dessen Ersatz, keine Umgehung. Nur was ein Mensch anstößt
(`workflow_dispatch`) oder ein Push auslöst, baut zu jeder Tageszeit.

**Sichtbar gemacht:** Sind die Daten tagsüber älter als drei Stunden, meldet die
Kopfzeile „Aktualisierung steht". Beim letzten Ausfall war der Stillstand nur
daran zu erkennen, dass die Meldungen bekannt vorkamen.

---

## Lokal entwickeln

```bash
node scripts/build-news.mjs          # Feeds holen, news.json bauen
node scripts/make-icons.mjs          # App-Icons neu erzeugen
python3 -m http.server 8099 --directory docs
```

→ <http://localhost:8099>

Keine npm-Abhängigkeiten. Node 20+ genügt (nutzt `fetch` und `zlib` aus der Standardbibliothek).

---

## Dateien

```
scripts/build-news.mjs      Feeds holen, filtern, deduplizieren, bewerten
scripts/sources.mjs         Quellenliste und Filterregeln
scripts/translate.mjs       Übersetzung ins Deutsche, mit Cache
scripts/make-icons.mjs      PNG-Icons ohne externe Bibliotheken
docs/index.html             App-Gerüst
docs/app.js                 Darstellung, Lernprofil, Wetter, Vollbild, Einordnung
docs/style.css              Dark Theme, iPhone-Safe-Areas
docs/sw.js                  Service Worker (offline, network-first)
docs/manifest.webmanifest   PWA-Manifest fürs Homescreen-Icon
docs/data/news.json         Erzeugt — stündlich überschrieben
docs/data/i18n-cache.json   Übersetzungs-Cache — muss mitcommittet werden
.github/workflows/          Stündlicher Build + Pages-Deploy
```
