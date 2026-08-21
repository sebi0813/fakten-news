# Fakten — News ohne Werbung

Eine werbefreie, faktenorientierte Nachrichten-App als PWA. Läuft auf GitHub Pages,
kostet nichts, und legt sich als eigenes Icon auf den iPhone-Homescreen.

**Kategorien:** Wirtschaft international · Wirtschaft Österreich · Sport international ·
Welt · Österreich · Korneuburg · Wetter am aktuellen Standort

**51 Quellen in 9 Sprachen** — alles Fremdsprachige wird automatisch ins Deutsche übersetzt.

---

## Wie es funktioniert

```
Stündlich (GitHub Actions)            Beim Öffnen (dein iPhone)
┌────────────────────────────┐        ┌──────────────────────────┐
│ 51 RSS-Feeds abrufen       │        │ news.json laden          │
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

## Das stündliche Update — was realistisch passiert

Die GitHub Action läuft jede Stunde und schreibt einen frischen Datenstand.
Wenn du die App öffnest, sind die Meldungen also **höchstens eine Stunde alt**.
Zusätzlich lädt die App nach, solange sie offen ist, und beim Zurückwechseln.

Zwei ehrliche Einschränkungen:

- **iOS erlaubt keine echten Hintergrund-Updates für PWAs.** Die App kann sich
  nicht selbst aktualisieren, während sie geschlossen ist, und keine Push-
  Benachrichtigungen ohne zusätzlichen Server schicken. Aktualisiert wird beim
  Öffnen — die Daten sind dann trotzdem frisch, weil der Build serverseitig lief.
- **GitHub verschiebt Cron-Läufe bei hoher Last** um einige Minuten. Für
  stündliche Nachrichten ist das unerheblich.

Scheduled Workflows werden auf GitHub nach 60 Tagen Repo-Inaktivität deaktiviert.
Das passiert hier nicht: Der Workflow committet selbst und hält das Repo aktiv.

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
- Doppelmeldungen werden zusammengeführt; berichten mehrere unabhängige
  Redaktionen dasselbe, steigt der Faktenscore — das ist das stärkste
  automatisch verfügbare Signal gegen eine Falschmeldung
- Stichprobe von 12 Original-Links wird auf Erreichbarkeit geprüft;
  tote Links bekommen den Hinweis „Link prüfen"

**Faktenscore 0–100** aus Quellengüte, Konkretheit und Länge des Textes,
Zeitstempel, expliziten Zuschreibungen („laut …", „nach Angaben von …") und
Abzügen für reißerische Sprache. Angezeigt als `hoch` (≥78), `solide` (≥60)
oder `prüfen`.

> Der Score bewertet, wie sehr eine Meldung einer nüchternen, überprüfbaren
> Nachricht entspricht — **nicht ihren Wahrheitsgehalt**. Jede Meldung verlinkt
> deshalb immer auf das Original.

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
