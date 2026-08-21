# Faktum — News ohne Werbung

Eine werbefreie, faktenorientierte Nachrichten-App als PWA. Läuft auf GitHub Pages,
kostet nichts, und legt sich als eigenes Icon auf den iPhone-Homescreen.

**Kategorien:** Für dich · Flash · Fokus · Wirtschaft international · Wirtschaft Österreich ·
Sport · Wissenschaft · Welt · Österreich · Korneuburg · Gemerkt · Wetter · Historie

**72 Quellen in 8 Sprachen** — alles Fremdsprachige wird automatisch ins Deutsche übersetzt.

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

## Das Laufband

Unten läuft ein Ticker mit, in dieser Rangfolge:

1. **Wetterwarnungen** von GeoSphere Austria für deinen Standort
2. **Autobahnmeldungen** zu A22, A23, A5, S1 und der B3
3. **ÖBB-Streckensperren** der Region Wien/Niederösterreich
4. **ÖBB-Zugmeldungen** aus dem Fahrplanfeed
5. **Flash-News**
6. Ist nichts davon aktuell: **Wetter der nächsten 3 Stunden**

Tempo: 90 Pixel pro Sekunde, aus der gerenderten Breite berechnet. Die erste Fassung
schätzte über die Zeichenzahl und kam bei acht Einträgen auf 216 Sekunden pro Durchlauf.

Höhe: `calc(40px + var(--safe-b))`. Mit `box-sizing: border-box` zählt das Padding in
die Höhe hinein — stand dort nur `38px`, blieb auf dem iPhone nach Abzug der
Home-Indicator-Zone ein 4-Pixel-Streifen übrig und der Text war abgeschnitten.

### Woher die Verkehrsdaten kommen — und woher nicht

**Streckensperren:** von der offiziellen Baustellenübersicht der ÖBB
(`oebb.at/de/fahrplan/baustelleninformation`). Das ist **kein Feed, sondern eine
Website**, die ausgelesen wird. Ihre Linktexte enthalten Strecke und Zeitraum
vollständig, das ist stabil genug — wenn ÖBB die Seite umbaut, meldet der Build
„Keine Links gefunden" und der Ticker bleibt bei diesem Punkt leer.

Der ÖBB-**RSS-Feed** taugt dafür nicht: Er listet einzelne Zugausfälle und hatte für
Wien/NÖ zuletzt nur Einträge vom **Dezember 2025**. Die monatelangen Sperren
(Franz-Josefs-Bahn, Nordbahn, Stammstrecke) stehen ausschließlich auf der HTML-Seite.

**Autobahnen: keine Livedaten.** ASFINAG beantwortet automatisierte Abrufe mit
HTTP 403, `data.gv.at` liefert auf allen Katalogpfaden 404, VOR und die
ÖBB-Verkehrsinfo-Seiten ebenfalls 404. Wiener Linien hat zwar eine offene
Schnittstelle, die deckt aber nur Straßenbahn, Bus und U-Bahn ab — keine Autobahnen
und keine S-Bahn.

Was stattdessen passiert: Meldungen aus den vorhandenen Nachrichtenquellen werden
erkannt, wenn sie **eine Strecke nennen und ein Ereignis beschreiben**. Beides muss
zutreffen — „A22 Radweg feierlich eröffnet" nennt zwar die Strecke, beschreibt aber
kein Verkehrsereignis und wird verworfen.

> Das heißt konkret: Du siehst einen Stau auf der A23, **sobald eine Redaktion darüber
> berichtet** — nicht in dem Moment, in dem er entsteht. Für Echtzeitdaten führt kein
> Weg an der ASFINAG-Entwicklerregistrierung vorbei.

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

## Übersetzung

Alle nicht-deutschen Meldungen werden beim Build ins Deutsche übersetzt — Titel und
Kurztext. Quellsprachen: Englisch, Französisch, Spanisch, Italienisch, Niederländisch,
Schwedisch, Norwegisch, Dänisch.

Übersetzte Meldungen tragen das Kennzeichen **übersetzt**. Der Originaltitel steht
unter **💡 Einordnung**.

Drei Dinge, die beim Bauen wichtig wurden:

- **Nach Sprache gebündelt.** Mischt man Sprachen in einer Anfrage und lässt den Dienst
  die Sprache erraten, erkennt er nur die Mehrheitssprache und halluziniert den Rest.
  Ein japanischer Titel wurde im Test zu *„Ich bin mir nicht sicher, was ich tun soll."*
  Deshalb wird pro Sprache gebündelt und die Ausgangssprache explizit mitgegeben.
- **Zweimal filtern.** Die Meinungs- und Prognosefilter greifen auf Deutsch und Englisch.
  Ein norwegisches *„Ekspertenes spådommer"* passiert sie — das deutsche „Prognosen der
  Experten" nicht. Also wird nach der Übersetzung erneut gefiltert.
- **Cache.** Übersetztes landet in `docs/data/i18n-cache.json` und wird mitcommittet.
  Nach dem ersten Lauf müssen pro Stunde nur die neuen Meldungen übersetzt werden —
  typisch unter 10 statt knapp 300.

> ⚠ **Maschinelle Übersetzung kann die Aussage verdrehen.** Im Test wurde aus dem
> französischen *„Uber condamné à une amende"* (Uber **wurde** bestraft) das deutsche
> „Uber **verhängte** eine Geldstrafe" — Täter und Opfer vertauscht. Genau deshalb steht
> bei jeder übersetzten Meldung der Originaltitel in der Einordnung und der Link führt
> immer zum Original. Bei wichtigen Details: hinschauen.

Nicht aufgenommen wurde Finnisch (Yle): die Übersetzung lieferte unbrauchbares Deutsch.
Germanische und romanische Sprachen sind deutlich zuverlässiger.

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
