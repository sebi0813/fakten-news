// Kuratierte, faktenorientierte Quellen.
//
// Jeder Feed wurde vor Aufnahme geprüft: erreichbar, parsebar UND aktuell.
// Der letzte Punkt ist der wichtigste — mehrere prominente Feeds antworten mit
// HTTP 200 und Dutzenden Einträgen, sind aber faktisch tot. Aussortiert wurden
// deshalb: WSJ (feeds.a.dj.com, Stand Jan 2025), Corriere della Sera
// (Mai 2024), Gazzetta dello Sport (2023) und NHK (13 Tage alt).
//
// trust: 1..3  (3 = Nachrichtenagentur / öffentlich-rechtlich, 2 = etablierte
//               Qualitätszeitung, 1 = regional/spezialisiert)
// lang:  Ausgangssprache. Alles außer 'de' wird beim Build übersetzt.
//
// Bewusst NICHT enthalten: Boulevard, reine Meinungsfeeds und staatlich
// gelenkte Auslandssender (RT, Xinhua, TASS) — dort fehlt die redaktionelle
// Unabhängigkeit, die "akkreditierte Berichterstattung" ausmacht.

export const CATEGORIES = [
  { id: 'wirtschaft-int', label: 'Wirtschaft international', icon: '🌍' },
  { id: 'wirtschaft-at', label: 'Wirtschaft Österreich', icon: '🇦🇹' },
  { id: 'sport-int', label: 'Sport international', icon: '⚽' },
  { id: 'welt', label: 'Welt', icon: '🗺' },
  { id: 'oesterreich', label: 'Österreich', icon: '📰' },
  { id: 'korneuburg', label: 'Korneuburg', icon: '📍' },
]

export const SOURCES = [
  // ---------- Wirtschaft international ----------
  { name: 'BBC Business', cat: 'wirtschaft-int', trust: 3, lang: 'en',
    url: 'https://feeds.bbci.co.uk/news/business/rss.xml', site: 'bbc.com' },
  { name: 'Guardian Business', cat: 'wirtschaft-int', trust: 2, lang: 'en',
    url: 'https://www.theguardian.com/uk/business/rss', site: 'theguardian.com' },
  { name: 'CNBC World', cat: 'wirtschaft-int', trust: 2, lang: 'en',
    url: 'https://www.cnbc.com/id/10001147/device/rss/rss.html', site: 'cnbc.com' },
  { name: 'Financial Times', cat: 'wirtschaft-int', trust: 3, lang: 'en',
    url: 'https://www.ft.com/rss/home', site: 'ft.com' },
  { name: 'tagesschau Wirtschaft', cat: 'wirtschaft-int', trust: 3, lang: 'de',
    url: 'https://www.tagesschau.de/wirtschaft/index~rss2.xml', site: 'tagesschau.de' },
  { name: 'Euronews Business', cat: 'wirtschaft-int', trust: 2, lang: 'en',
    url: 'https://www.euronews.com/rss?level=theme&name=business', site: 'euronews.com' },
  { name: 'Handelsblatt', cat: 'wirtschaft-int', trust: 2, lang: 'de',
    url: 'https://www.handelsblatt.com/contentexport/feed/schlagzeilen', site: 'handelsblatt.com' },
  { name: 'ANSA Wirtschaft', cat: 'wirtschaft-int', trust: 3, lang: 'it',
    url: 'https://www.ansa.it/sito/notizie/economia/economia_rss.xml', site: 'ansa.it' },
  { name: 'Il Sole 24 Ore', cat: 'wirtschaft-int', trust: 3, lang: 'it',
    url: 'https://www.ilsole24ore.com/rss/mondo.xml', site: 'ilsole24ore.com' },
  { name: 'El País Wirtschaft', cat: 'wirtschaft-int', trust: 2, lang: 'es',
    url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/economia/portada', site: 'elpais.com' },
  { name: 'Le Monde Wirtschaft', cat: 'wirtschaft-int', trust: 3, lang: 'fr',
    url: 'https://www.lemonde.fr/economie/rss_full.xml', site: 'lemonde.fr' },
  { name: 'Le Figaro Wirtschaft', cat: 'wirtschaft-int', trust: 2, lang: 'fr',
    url: 'https://www.lefigaro.fr/rss/figaro_economie.xml', site: 'lefigaro.fr' },
  { name: 'POLITICO Europe', cat: 'wirtschaft-int', trust: 2, lang: 'en',
    url: 'https://www.politico.eu/feed/', site: 'politico.eu' },

  // ---------- Wirtschaft Österreich ----------
  { name: 'DER STANDARD Wirtschaft', cat: 'wirtschaft-at', trust: 2, lang: 'de',
    url: 'https://www.derstandard.at/rss/wirtschaft', site: 'derstandard.at' },
  { name: 'Die Presse Wirtschaft', cat: 'wirtschaft-at', trust: 2, lang: 'de',
    url: 'https://www.diepresse.com/rss/Wirtschaft', site: 'diepresse.com' },
  { name: 'KURIER Wirtschaft', cat: 'wirtschaft-at', trust: 2, lang: 'de',
    url: 'https://kurier.at/wirtschaft/xml/rss', site: 'kurier.at' },
  { name: 'ORF Konsument', cat: 'wirtschaft-at', trust: 3, lang: 'de',
    url: 'https://rss.orf.at/help.xml', site: 'orf.at' },

  // ---------- Sport international ----------
  { name: 'BBC Sport', cat: 'sport-int', trust: 3, lang: 'en',
    url: 'https://feeds.bbci.co.uk/sport/rss.xml', site: 'bbc.com' },
  // ESPN entfernt: liefert lokal 42 Meldungen, aus GitHub Actions aber 0 —
  // der Anbieter sperrt Rechenzentrums-IPs aus. Da der Build dort läuft,
  // ist die Quelle für uns wertlos und würde nur dauerhaft als "veraltet"
  // im Quellenbericht stehen.
  { name: 'Sky Sports', cat: 'sport-int', trust: 2, lang: 'en',
    url: 'https://www.skysports.com/rss/12040', site: 'skysports.com' },
  { name: 'Sportschau', cat: 'sport-int', trust: 3, lang: 'de',
    url: 'https://www.sportschau.de/index~rss2.xml', site: 'sportschau.de' },
  { name: 'DER STANDARD Sport', cat: 'sport-int', trust: 2, lang: 'de',
    url: 'https://www.derstandard.at/rss/sport', site: 'derstandard.at' },
  { name: 'KURIER Sport', cat: 'sport-int', trust: 2, lang: 'de',
    url: 'https://kurier.at/sport/xml/rss', site: 'kurier.at' },
  { name: 'Die Presse Sport', cat: 'sport-int', trust: 2, lang: 'de',
    url: 'https://www.diepresse.com/rss/Sport', site: 'diepresse.com' },
  { name: 'MARCA', cat: 'sport-int', trust: 2, lang: 'es',
    url: 'https://e00-marca.uecdn.es/rss/portada.xml', site: 'marca.com' },

  // ---------- Welt (international, fremdsprachig -> übersetzt) ----------
  { name: 'BBC World', cat: 'welt', trust: 3, lang: 'en',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml', site: 'bbc.com' },
  { name: 'New York Times World', cat: 'welt', trust: 3, lang: 'en',
    url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', site: 'nytimes.com' },
  { name: 'Al Jazeera', cat: 'welt', trust: 2, lang: 'en',
    url: 'https://www.aljazeera.com/xml/rss/all.xml', site: 'aljazeera.com' },
  { name: 'Japan Times', cat: 'welt', trust: 2, lang: 'en',
    url: 'https://www.japantimes.co.jp/feed/', site: 'japantimes.co.jp' },
  { name: 'Deutsche Welle', cat: 'welt', trust: 3, lang: 'de',
    url: 'https://rss.dw.com/rdf/rss-de-all', site: 'dw.com' },
  { name: 'Le Monde', cat: 'welt', trust: 3, lang: 'fr',
    url: 'https://www.lemonde.fr/rss/une.xml', site: 'lemonde.fr' },
  { name: 'France 24', cat: 'welt', trust: 3, lang: 'fr',
    url: 'https://www.france24.com/fr/rss', site: 'france24.com' },
  { name: 'RFI', cat: 'welt', trust: 3, lang: 'fr',
    url: 'https://www.rfi.fr/fr/rss', site: 'rfi.fr' },
  { name: 'El País', cat: 'welt', trust: 2, lang: 'es',
    url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada', site: 'elpais.com' },
  { name: 'la Repubblica', cat: 'welt', trust: 2, lang: 'it',
    url: 'https://www.repubblica.it/rss/homepage/rss2.0.xml', site: 'repubblica.it' },
  { name: 'ANSA', cat: 'welt', trust: 3, lang: 'it',
    url: 'https://www.ansa.it/sito/ansait_rss.xml', site: 'ansa.it' },
  { name: 'NOS', cat: 'welt', trust: 3, lang: 'nl',
    url: 'https://feeds.nos.nl/nosnieuwsalgemeen', site: 'nos.nl' },
  { name: 'SVT Nyheter', cat: 'welt', trust: 3, lang: 'sv',
    url: 'https://www.svt.se/nyheter/rss.xml', site: 'svt.se' },
  { name: 'NRK', cat: 'welt', trust: 3, lang: 'no',
    url: 'https://www.nrk.no/toppsaker.rss', site: 'nrk.no' },
  { name: 'DR Nyheder', cat: 'welt', trust: 3, lang: 'da',
    url: 'https://www.dr.dk/nyheder/service/feeds/allenyheder', site: 'dr.dk' },
  // Yle (fi) wurde getestet und wieder entfernt: die maschinelle Übersetzung
  // Finnisch -> Deutsch lieferte unbrauchbare Sätze ("Die Laufpferde Ihrer
  // Auktion in der Stadt Pori"). Germanische und romanische Sprachen sind
  // deutlich zuverlässiger.

  // ---------- Österreich ----------
  { name: 'ORF Österreich', cat: 'oesterreich', trust: 3, lang: 'de',
    url: 'https://rss.orf.at/oesterreich.xml', site: 'orf.at' },
  { name: 'ORF News', cat: 'oesterreich', trust: 3, lang: 'de',
    url: 'https://rss.orf.at/news.xml', site: 'orf.at' },
  { name: 'ORF Wien', cat: 'oesterreich', trust: 3, lang: 'de',
    url: 'https://rss.orf.at/wien.xml', site: 'orf.at' },
  { name: 'DER STANDARD Inland', cat: 'oesterreich', trust: 2, lang: 'de',
    url: 'https://www.derstandard.at/rss/inland', site: 'derstandard.at' },
  { name: 'DER STANDARD Panorama', cat: 'oesterreich', trust: 2, lang: 'de',
    url: 'https://www.derstandard.at/rss/panorama', site: 'derstandard.at' },
  { name: 'Die Presse Innenpolitik', cat: 'oesterreich', trust: 2, lang: 'de',
    url: 'https://www.diepresse.com/rss/Innenpolitik', site: 'diepresse.com' },
  { name: 'KURIER Politik', cat: 'oesterreich', trust: 2, lang: 'de',
    url: 'https://kurier.at/politik/inland/xml/rss', site: 'kurier.at' },
  { name: 'KURIER Chronik', cat: 'oesterreich', trust: 2, lang: 'de',
    url: 'https://kurier.at/chronik/oesterreich/xml/rss', site: 'kurier.at' },

  // ---------- Korneuburg / Region ----------
  { name: 'meinbezirk Korneuburg', cat: 'korneuburg', trust: 1, lang: 'de',
    url: 'https://www.meinbezirk.at/korneuburg/rss', site: 'meinbezirk.at' },
  { name: 'meinbezirk Niederösterreich', cat: 'korneuburg', trust: 1, lang: 'de',
    url: 'https://www.meinbezirk.at/niederoesterreich/rss', site: 'meinbezirk.at',
    requireLocal: true },
  { name: 'ORF Niederösterreich', cat: 'korneuburg', trust: 3, lang: 'de',
    url: 'https://rss.orf.at/noe.xml', site: 'orf.at', requireLocal: true },
]

// Ortsbezug für die Korneuburg-Kategorie: Bezirk Korneuburg + direkte Nachbarn.
export const LOCAL_TERMS = [
  'korneuburg', 'bisamberg', 'stockerau', 'langenzersdorf', 'leobendorf',
  'spillern', 'harmannsdorf', 'hagenbrunn', 'enzersfeld', 'klosterneuburg',
  'tulln', 'gerasdorf', 'wolkersdorf', 'ernstbrunn', 'großmugl', 'grossmugl',
  'niederhollabrunn', 'rußbach', 'russbach', 'sierndorf', 'weinviertel',
  'bezirk korneuburg', 'donauturm', 'werft korneuburg',
]

// Titel/Rubriken, die auf Meinung, Werbung oder Boulevard hindeuten -> aussortieren.
export const OPINION_PATTERNS = [
  /\bkommentar\b/i, /\bgastkommentar\b/i, /\bleitartikel\b/i, /\bkolumne\b/i,
  /\bglosse\b/i, /\bmeinung\b/i, /\bpro und contra\b/i, /\bstandpunkt\b/i,
  /\beditorial\b/i, /\bopinion\b/i, /\bcomment is free\b/i, /\banalysis:/i,
  /\bblog\b/i, /\bpodcast\b/i, /\bnewsletter\b/i, /\bliveticker\b/i,
  // Stream-/Programmhinweise sind Ankündigungen, keine Meldungen
  /\blive hören\b/i, /\blive sehen\b/i, /\bim livestream\b/i, /\blive-stream\b/i,
  /^\s*(audio|video|livestream|liveblog|tv-tipp)\s*:/i, /\bre-live\b/i,
  /\bim (video|audio)\b/i, /\bzum nachhören\b/i, /\bzum nachsehen\b/i,
  /\bhoroskop\b/i, /\bquiz\b/i, /\bgewinnspiel\b/i, /\bratgeber\b/i,
  /\brezept\b/i, /\bkreuzworträtsel\b/i, /\bsudoku\b/i, /\bnachruf\b/i,
  /\badvertorial\b/i, /\bsponsored\b/i, /\banzeige\b/i, /\bwerbung\b/i,
  /\bpromi\b/i, /\broyals?\b/i, /\bstar-\b/i, /\bletters?:/i,
  // Prognosen, Rankings und Vorschauen sind Einschätzungen, keine Meldungen
  /\bpredictions?\b/i, /\bpower rankings?\b/i, /\brankings?:/i, /\bbest xi\b/i,
  /\bwho will win\b/i, /\bmock draft\b/i, /\bwhat to watch\b/i,
  /\bprognose\b/i, /\bvorschau\b/i, /\bpreview\b/i, /\bwett-?tipps?\b/i,
  /\btipp(s|spiel)\b/i, /\bso könnte\b/i, /\bdas erwartet\b/i,
  // Romanische, niederländische und skandinavische Meinungsformate
  /\bopini[óo]n\b/i, /\btribuna\b/i, /\bcolumna\b/i, /\beditoriale?\b/i,
  /\bcommento\b/i, /\bil punto\b/i, /\banalisi\b/i,
  /\bchronique\b/i, /\btribune\b/i, /\bbillet\b/i, /\bpoint de vue\b/i,
  /\bopinie\b/i, /\bcommentaar\b/i, /\bcolumn\b/i,
  /\bledare\b/i, /\bdebatt\b/i, /\bkr[øö]nike\b/i, /\bkommentator\b/i,
  /\b社説\b/, /\b解説\b/,
]

// URL-Pfade, die typischerweise keine Nachricht sind.
export const URL_BLOCKLIST = [
  '/commentisfree/', '/opinion/', '/meinung/', '/kommentar/', '/lifestyle/',
  '/podcast', '/video/', '/games/', '/crosswords/', '/horoskop', '/gewinnspiel',
  '/anzeige', '/promotion', '/sponsored', '/leserbriefe', '/livestream',
  // fremdsprachige Entsprechungen
  '/opinion/', '/opiniones/', '/tribunas/', '/editorial/', '/idees/', '/idees-debats/',
  '/chroniques/', '/blogs/', '/opinioni/', '/commenti/', '/editoriali/',
  '/opinie/', '/columns/', '/ledare/', '/debatt/', '/meninger/', '/kultur/',
]

// Reißerische Formulierungen -> Punktabzug beim Faktenscore.
export const CLICKBAIT_PATTERNS = [
  /sie werden nicht glauben/i, /das steckt dahinter/i, /schock/i, /skandal/i,
  /unglaublich/i, /sensation/i, /!!+/, /\?\?+/, /^\s*das ist/i,
  /wirklich passiert/i, /jetzt spricht/i, /nackt/i, /peinlich/i,
  /you won't believe/i, /shocking/i, /this is why/i, /goes viral/i,
]
