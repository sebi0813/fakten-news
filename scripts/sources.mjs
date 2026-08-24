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
  { id: 'fokus', label: 'Fokus', icon: '🎯' },
  // Wirtschaft ist eine Kategorie. Österreichische Meldungen stehen darin
  // oben, internationale darunter — sortiert über das Feld `at` am Eintrag.
  { id: 'wirtschaft', label: 'Wirtschaft', icon: '💶' },
  { id: 'sport-int', label: 'Sport', icon: '⚽' },
  { id: 'wissenschaft', label: 'Wissenschaft', icon: '🔬' },
  { id: 'welt', label: 'Welt', icon: '🗺' },
  { id: 'oesterreich', label: 'Österreich', icon: '📰' },
  { id: 'korneuburg', label: 'Korneuburg', icon: '📍' },
]

export const SOURCES = [
  // 25 Quellen, bewusst knapp gehalten. Nur Deutsch und Englisch:
  // Englisches muss nicht übersetzt werden, und genau die Übersetzung war
  // der Engpass — mit 79 Quellen drosselte der Dienst auf 4 Prozent.
  // Französische, italienische, spanische, niederländische und skandinavische
  // Quellen sind deshalb entfallen; siehe README zu dem, was damit wegfällt.

  // ---------- Österreich ----------
  { name: 'ORF Österreich', cat: 'oesterreich', trust: 3, lang: 'de',
    url: 'https://rss.orf.at/oesterreich.xml', site: 'orf.at' },
  { name: 'ORF News', cat: 'oesterreich', trust: 3, lang: 'de',
    url: 'https://rss.orf.at/news.xml', site: 'orf.at' },
  { name: 'Die Presse Innenpolitik', cat: 'oesterreich', trust: 2, lang: 'de',
    url: 'https://www.diepresse.com/rss/Innenpolitik', site: 'diepresse.com' },
  { name: 'KURIER Chronik', cat: 'oesterreich', trust: 2, lang: 'de',
    url: 'https://kurier.at/chronik/oesterreich/xml/rss', site: 'kurier.at' },

  // ---------- Korneuburg / Region ----------
  { name: 'meinbezirk Korneuburg', cat: 'korneuburg', trust: 1, lang: 'de',
    url: 'https://www.meinbezirk.at/korneuburg/rss', site: 'meinbezirk.at' },
  { name: 'ORF Niederösterreich', cat: 'korneuburg', trust: 3, lang: 'de',
    url: 'https://rss.orf.at/noe.xml', site: 'orf.at', requireLocal: true },

  // ---------- Wirtschaft (at:true steht im Tab oben) ----------
  { name: 'DER STANDARD Wirtschaft', cat: 'wirtschaft', at: true, trust: 2, lang: 'de',
    url: 'https://www.derstandard.at/rss/wirtschaft', site: 'derstandard.at' },
  { name: 'Die Presse Wirtschaft', cat: 'wirtschaft', at: true, trust: 2, lang: 'de',
    url: 'https://www.diepresse.com/rss/Wirtschaft', site: 'diepresse.com' },
  { name: 'KURIER Wirtschaft', cat: 'wirtschaft', at: true, trust: 2, lang: 'de',
    url: 'https://kurier.at/wirtschaft/xml/rss', site: 'kurier.at' },
  { name: 'Financial Times', cat: 'wirtschaft', trust: 3, lang: 'en',
    url: 'https://www.ft.com/rss/home', site: 'ft.com' },
  { name: 'BBC Business', cat: 'wirtschaft', trust: 3, lang: 'en',
    url: 'https://feeds.bbci.co.uk/news/business/rss.xml', site: 'bbc.com' },

  // ---------- Welt ----------
  { name: 'BBC World', cat: 'welt', trust: 3, lang: 'en',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml', site: 'bbc.com' },
  { name: 'New York Times World', cat: 'welt', trust: 3, lang: 'en',
    url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', site: 'nytimes.com' },
  { name: 'Deutsche Welle', cat: 'welt', trust: 3, lang: 'de',
    url: 'https://rss.dw.com/rdf/rss-de-all', site: 'dw.com' },

  // ---------- Sport ----------
  { name: 'ORF Sport', cat: 'sport-int', trust: 3, lang: 'de',
    url: 'https://rss.orf.at/sport.xml', site: 'orf.at' },
  { name: 'DER STANDARD Sport', cat: 'sport-int', trust: 2, lang: 'de',
    url: 'https://www.derstandard.at/rss/sport', site: 'derstandard.at' },
  { name: 'BBC Sport', cat: 'sport-int', trust: 3, lang: 'en',
    url: 'https://feeds.bbci.co.uk/sport/rss.xml', site: 'bbc.com' },
  { name: 'Sky Sports', cat: 'sport-int', trust: 2, lang: 'en',
    url: 'https://www.skysports.com/rss/12040', site: 'skysports.com' },

  // ---------- Wissenschaft: Ernährung, Diätologie, Astronomie ----------
  { name: 'ORF Science', cat: 'wissenschaft', trust: 3, lang: 'de',
    url: 'https://rss.orf.at/science.xml', site: 'orf.at' },
  { name: 'ScienceDaily Ernährung', cat: 'wissenschaft', trust: 2, lang: 'en',
    url: 'https://www.sciencedaily.com/rss/health_medicine/nutrition.xml', site: 'sciencedaily.com' },
  { name: 'ScienceDaily Astronomie', cat: 'wissenschaft', trust: 2, lang: 'en',
    url: 'https://www.sciencedaily.com/rss/space_time/astronomy.xml', site: 'sciencedaily.com' },
  { name: 'NASA', cat: 'wissenschaft', trust: 3, lang: 'en',
    url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss', site: 'nasa.gov' },

  // ---------- Fokus: KI und Agile ----------
  // ai:true -> nur Modell-Updates, Durchbrüche und Entscheidungen mit Tragweite.
  { name: 'TechCrunch AI', cat: 'fokus', ai: true, trust: 2, lang: 'en',
    url: 'https://techcrunch.com/category/artificial-intelligence/feed/', site: 'techcrunch.com' },
  { name: 'Ars Technica AI', cat: 'fokus', ai: true, trust: 2, lang: 'en',
    url: 'https://arstechnica.com/ai/feed/', site: 'arstechnica.com' },
  { name: 'Scrum.org', cat: 'fokus', trust: 2, lang: 'en',
    url: 'https://www.scrum.org/resources/blog/rss.xml', site: 'scrum.org' },
]

// ---------------------------------------------------------------- Fokusthemen
//
// Meldungen, die hier treffen, landen zusätzlich im Fokus-Tab und werden in
// "Für dich" bevorzugt — unabhängig davon, aus welcher Kategorie sie stammen.
// `strong` verlangt eine wörtliche Nennung, `weak` zählt nur zusammen mit
// einem weiteren Treffer. Das verhindert, dass jedes "agil" oder jedes
// beiläufige "KI" eine Meldung zum Fokusthema macht.

// Kurze Begriffe (bis 3 Zeichen) werden beim Suchen beidseitig auf Wortgrenzen
// festgenagelt, längere nur am Wortanfang. Ohne diese Regel galt "De Zerbi" als
// Raiffeisen-Meldung, weil "rbi" darin steckt, und jedes "Kind" als KI-Thema.
export const FOCUS_TOPICS = [
  {
    id: 'raiffeisen',
    label: 'Raiffeisen / RBI',
    icon: '🏦',
    strong: [
      'raiffeisen', 'rbi', 'raiffeisen bank international',
      'raiffeisenlandesbank', 'rzb', 'raiffeisen-holding',
    ],
    weak: ['bankensektor', 'osteuropa-geschäft', 'russland-geschäft', 'bawag', 'erste group'],
  },
  {
    id: 'agile',
    label: 'Agile Coaching',
    icon: '🔄',
    strong: [
      'agile coach', 'agiles coaching', 'scrum master', 'scrum-master',
      'agile transformation', 'agiles arbeiten', 'agile methoden',
      'product owner', 'kanban', 'scaled agile', 'safe framework',
      'retrospektive', 'agile leadership',
    ],
    weak: ['scrum', 'agilität', 'agile', 'new work', 'selbstorganisation', 'teamentwicklung'],
  },
  {
    id: 'ki',
    label: 'KI & neue Modelle',
    icon: '🤖',
    strong: [
      'künstliche intelligenz', 'artificial intelligence', 'ki-modell', 'ai model',
      'sprachmodell', 'language model', 'llm', 'openai', 'anthropic',
      'deepmind', 'chatgpt', 'claude', 'gemini', 'llama', 'mistral',
      'nvidia', 'ki-chip', 'transformer-modell', 'generative ki', 'generative ai',
      'machine learning', 'maschinelles lernen', 'neuronales netz', 'ki-agent',
      'ai agent', 'foundation model', 'ki-verordnung', 'ai act',
    ],
    weak: ['algorithmus', 'automatisierung', 'chatbot', 'roboter', 'rechenzentrum', 'ki'],
  },
]

// ------------------------------------------------------- Sport-Schwerpunkte
//
// Rang 0 steht im Tab ganz oben, dann 1, dann alles Übrige. Andere Sportarten
// verschwinden nicht — sie stehen weiter unten.

export const SPORT_FOCUS = [
  {
    rank: 0,
    label: 'Fußball',
    terms: [
      // Österreich
      'rapid', 'sk rapid', 'austria wien', 'fk austria', 'sturm graz', 'sk sturm',
      'bundesliga', 'öfb', 'oefb', 'cup-finale', 'wiener derby', 'lask',
      // Bewusst mit Klubkürzel: "Salzburg", "Ried" und "Tirol" allein sind
      // Ortsnamen und zogen Brand- und Unfallmeldungen in den Sport-Tab.
      'red bull salzburg', 'rb salzburg', 'fc salzburg', 'sv ried', 'wsg tirol',
      'scr altach', 'wolfsberger ac', 'blau-weiß linz', 'grazer ak',
      // Barcelona und Champions-League-Ebene
      'barcelona', 'barça', 'barca', 'champions league', 'championsleague',
      'real madrid', 'atlético', 'atletico', 'bayern', 'borussia dortmund',
      'manchester city', 'manchester united', 'liverpool', 'arsenal', 'chelsea',
      'tottenham', 'paris saint-germain', 'psg', 'inter mailand', 'ac mailand',
      'juventus', 'napoli', 'benfica', 'porto', 'ajax', 'leipzig', 'leverkusen',
      'atalanta', 'sporting', 'psv', 'feyenoord', 'europa league', 'uefa',
      'nations league', 'weltmeisterschaft', 'europameisterschaft', 'wm-quali',
    ],
  },
  {
    rank: 1,
    label: 'Formel 1 und Tennis',
    terms: [
      'formel 1', 'formel1', 'formula 1', 'grand prix', 'grandprix', 'qualifying',
      'verstappen', 'ferrari', 'mclaren', 'mercedes-amg', 'red bull racing',
      'boxenstopp', 'pole position', 'weltmeistertitel',
      'tennis', 'atp', 'wta', 'grand slam', 'wimbledon', 'us open', 'french open',
      'australian open', 'roland garros', 'davis cup', 'sinner', 'alcaraz',
      'djokovic', 'zverev', 'medwedew', 'swiatek', 'sabalenka', 'thiem',
    ],
  },
]

// -------------------------------------------------------- KI: nur Wesentliches
//
// Der KI-Sektor produziert täglich Dutzende Meldungen, überwiegend Ankündigungen
// und Branchengeplauder. Ins Fokusthema kommt nur, was ein echtes Modell-Update
// oder einen Durchbruch beschreibt — oder eine Entscheidung mit Tragweite.

export const KI_SIGNIFICANT = [
  // Modelle und Veröffentlichungen
  'vorgestellt', 'veröffentlicht', 'startet', 'erschienen', 'verfügbar ab',
  'neues modell', 'neue version', 'nachfolger', 'update', 'launch', 'release',
  'unveil', 'announce', 'introduc', 'debut', 'rollout', 'general availability',
  'gpt-', 'claude', 'gemini', 'llama', 'mistral', 'grok', 'deepseek', 'qwen',
  'sora', 'midjourney', 'stable diffusion',
  // Durchbrüche und Leistung
  'durchbruch', 'breakthrough', 'erstmals', 'first time', 'übertrifft',
  'outperform', 'benchmark', 'state of the art', 'meilenstein', 'milestone',
  'forschungsergebnis', 'studie zeigt', 'nature', 'science',
  // Tragweite
  'milliarden', 'billion', 'übernahme', 'acquisition', 'börsengang',
  'ai act', 'ki-verordnung', 'verboten', 'klage', 'urteil', 'gericht',
  'datenschutz', 'sicherheitslücke', 'rechenzentrum', 'chipfertigung',
]

// ------------------------------------------------- Wissenschafts-Schwerpunkte
//
// Meldungen aus der Kategorie Wissenschaft, die eines dieser Felder treffen,
// werden im Tab nach oben gereiht. Der Rest bleibt sichtbar — nur eben unten.

export const SCIENCE_FOCUS = [
  // Ernährungswissenschaft und Diätologie
  'ernährung', 'ernährungswissenschaft', 'diätolog', 'diät', 'nutrition',
  'nährstoff', 'vitamin', 'mikronährstoff', 'protein', 'ballaststoff',
  'darmflora', 'mikrobiom', 'übergewicht', 'adipositas', 'abnehmen',
  'stoffwechsel', 'blutzucker', 'insulin', 'cholesterin', 'lebensmittel',
  'obesity', 'weight loss', 'dietary', 'diet ', 'gut microbiome',
  'metabolism', 'intermittier', 'fasten', 'mittelmeerdiät', 'zucker',
  // Astronomie und Raumfahrt
  'astronomie', 'astronom', 'astrophysik', 'teleskop', 'galaxie', 'galaxien',
  'exoplanet', 'schwarzes loch', 'schwarze löcher', 'supernova', 'nebel',
  'sternwarte', 'milchstraße', 'sonnensystem', 'planet', 'komet', 'asteroid',
  'mondfinsternis', 'sonnenfinsternis', 'meteorit', 'raumsonde', 'weltraum',
  'astronomy', 'telescope', 'galaxy', 'black hole', 'exoplanet', 'nebula',
  'supernova', 'cosmic', 'spacecraft', 'orbit', 'james webb', 'hubble',
]

// ------------------------------------------------------------ Veranstaltungen
//
// Für Termine gibt es in Österreich keinen brauchbaren Feed und keine offene
// Schnittstelle (geprüft: Wien VADB liefert HTTP 500, data.gv.at 404, die
// Stadt-Korneuburg-Seite hat keinen Kalenderexport). meinbezirk.at stellt
// seine Terminlisten aber in sauber ausleserbarem HTML dar.

export const EVENT_PAGES = [
  { region: 'Korneuburg', url: 'https://www.meinbezirk.at/korneuburg/veranstaltungen', near: 'korneuburg' },
  { region: 'Wien', url: 'https://www.meinbezirk.at/wien/veranstaltungen', near: 'wien' },
  { region: 'Stockerau', url: 'https://www.meinbezirk.at/korneuburg/stockerau/veranstaltungen', near: 'korneuburg' },
]

export const EVENT_DAYS_AHEAD = 14

// Interessante Sparten. Termine, die nichts davon treffen, werden nicht
// verworfen — sie stehen nur hinter einem Schalter in den Einstellungen.
export const EVENT_GENRES = [
  { id: 'theater', label: 'Theater', icon: '🎭',
    terms: ['theater', 'schauspiel', 'bühne', 'komödie', 'tragödie', 'inszenierung',
      'premiere', 'kabarett', 'lesung', 'literatur'] },
  { id: 'musical', label: 'Musical', icon: '🎤',
    terms: ['musical', 'revue', 'show'] },
  { id: 'klassik', label: 'Klassik & Oper', icon: '🎻',
    terms: ['oper', 'operette', 'klassik', 'klassische', 'orchester', 'symphoni',
      'sinfoni', 'philharmoni', 'kammermusik', 'kammerorchester', 'streichquartett',
      'klavierabend', 'liederabend', 'arien', 'chor', 'chorkonzert', 'ballett',
      // Komponistennamen wurden bewusst entfernt: "Bach" traf den Ortsnamen
      // "Großrußbach", "Messe" die Messehalle. Genrewörter genügen — eine
      // Mozart-Oper heißt im Titel ohnehin Oper oder Konzert.
      'matinee', 'serenade', 'requiem', 'blasmusik', 'volksmusik'] },
  { id: 'konzert', label: 'Konzert', icon: '🎵',
    terms: ['konzert', 'live-musik', 'livemusik', 'open air', 'openair', 'band',
      'jazz', 'blues', 'soul', 'pop', 'rock', 'singer', 'songwriter', 'akustik',
      'unplugged', 'festival', 'musikfest', 'sommerkonzert'] },
]

// Nicht für die Zielgruppe: Kinderprogramm und Clubbing.
export const EVENT_EXCLUDE = [
  'kinder', 'kids', 'kleinkind', 'baby', 'jugendliche', 'teenager', 'schüler',
  'kindergarten', 'familienfest', 'spielefest', 'hüpfburg', 'kasperl',
  'clubbing', 'rave', 'techno', 'disco', 'after work', 'afterwork',
]

// ------------------------------------------------------------- Themenkontext
//
// Hintergrund zu wiederkehrenden Themen, abrufbar über das (i) an der Meldung.
//
// Bewusst nur zeitlose, gesicherte Fakten: Beginn, Beteiligte, Verlauf in
// groben Zügen. KEIN "aktueller Stand" — der veraltet in einer statischen
// Datei sofort und wäre dann schlechter als gar nichts. Den aktuellen Stand
// liefert die App selbst, indem sie die jüngsten eigenen Meldungen zum selben
// Thema darunter listet.

export const CONTEXT_TOPICS = [
  {
    id: 'ukraine',
    label: 'Russlands Krieg gegen die Ukraine',
    match: ['ukraine', 'ukrainisch', 'selenskyj', 'selensky', 'kyjiw', 'kiew', 'charkiw',
      'donezk', 'luhansk', 'krim', 'mariupol', 'odessa', 'odesa', 'putin', 'kreml',
      'russische armee', 'russischen angriff', 'russischer angriff', 'moskau'],
    since: '24. Februar 2022',
    background: [
      'Russland überfiel die Ukraine am 24. Februar 2022 in vollem Umfang. Vorausgegangen war die Annexion der Krim im März 2014 und der von Russland unterstützte bewaffnete Konflikt im Donbas ab April 2014.',
      'Die UN-Generalversammlung verurteilte den Angriff am 2. März 2022 mit 141 zu 5 Stimmen und forderte den sofortigen Rückzug. Die EU, die USA und weitere Staaten verhängten seither mehrere Sanktionspakete.',
      'Der Internationale Strafgerichtshof erließ im März 2023 einen Haftbefehl gegen Wladimir Putin wegen der Verschleppung ukrainischer Kinder.',
      'Österreich ist militärisch neutral, beteiligt sich aber an den EU-Sanktionen und leistet humanitäre Hilfe. Waffenlieferungen erfolgen nicht.',
    ],
  },
  {
    id: 'nahost',
    label: 'Krieg in Gaza und im Nahen Osten',
    match: ['gaza', 'israel', 'israelisch', 'hamas', 'westjordanland', 'netanyahu',
      'netanjahu', 'palästinens', 'rafah', 'hisbollah', 'libanon', 'idf'],
    since: '7. Oktober 2023',
    background: [
      'Die Hamas verübte am 7. Oktober 2023 einen Großangriff auf Israel mit rund 1.200 Toten und etwa 250 Verschleppten. Israel begann daraufhin eine großangelegte Militäroperation im Gazastreifen.',
      'Der Konflikt reicht weit zurück: Israel wurde 1948 gegründet, es folgten mehrere Kriege mit arabischen Nachbarstaaten. Der Gazastreifen wird seit 2007 von der Hamas kontrolliert.',
      'Der Internationale Gerichtshof befasst sich seit Dezember 2023 mit einer Klage Südafrikas wegen mutmaßlichen Völkermords; ein Urteil in der Hauptsache steht aus.',
      'Zahlenangaben zu Opfern stammen je nach Meldung von unterschiedlichen Stellen — der von der Hamas geführten Gesundheitsbehörde, israelischen Angaben oder UN-Organisationen. Sie sind selten unabhängig überprüfbar.',
    ],
  },
  {
    id: 'zoelle',
    label: 'Handelskonflikte und Zölle',
    match: ['zoll', 'zölle', 'zollsatz', 'strafzoll', 'handelskonflikt', 'handelskrieg',
      'tariff', 'handelsabkommen', 'wto', 'importzoll'],
    since: '2018',
    background: [
      'Die USA erhoben ab 2018 unter Präsident Trump Zölle auf Stahl, Aluminium und zahlreiche chinesische Waren. China antwortete mit Gegenzöllen. Teile davon blieben auch unter der Nachfolgeregierung bestehen.',
      'Die EU ist als Zollunion für die Handelspolitik ihrer Mitgliedsstaaten zuständig — Österreich verhandelt also nicht selbst, sondern die Europäische Kommission.',
      'Zölle wirken auf zwei Wegen: Sie verteuern eingeführte Waren für Verbraucher im Einfuhrland und treffen Exporteure im Ausland. Wer die Kosten trägt, ist wirtschaftswissenschaftlich umstritten.',
    ],
  },
  {
    id: 'ezb',
    label: 'Inflation und Zinspolitik der EZB',
    match: ['ezb', 'europäische zentralbank', 'leitzins', 'zinssatz', 'inflation',
      'inflationsrate', 'verbraucherpreis', 'geldpolitik', 'notenbank', 'lagarde'],
    since: 'Juli 2022',
    background: [
      'Die Europäische Zentralbank hat als vorrangiges Ziel Preisstabilität, definiert als 2 Prozent Inflation mittelfristig. Sie steuert darüber den Leitzins für den gesamten Euroraum.',
      'Nach Jahren mit Null- und Negativzinsen begann die EZB im Juli 2022 mit Zinserhöhungen, um die stark gestiegene Inflation zu dämpfen — ausgelöst unter anderem durch Energiepreise und Lieferengpässe.',
      'Österreich lag bei der Inflationsrate über Jahre über dem Euroraum-Durchschnitt. Die Gründe dafür sind umstritten; genannt werden unter anderem Energiepreise, Mietanpassungen und der Gastronomiesektor.',
    ],
  },
  {
    id: 'klima',
    label: 'Klimapolitik und Klimaziele',
    match: ['klimawandel', 'klimaziel', 'klimaneutral', 'co2', 'emission', 'treibhausgas',
      'erderwärmung', 'klimapolitik', 'pariser abkommen', 'klimagesetz', 'dürre',
      'hitzerekord', 'gletscher'],
    since: '2015',
    background: [
      'Im Pariser Abkommen von 2015 verpflichteten sich fast alle Staaten, die Erderwärmung deutlich unter 2 Grad gegenüber dem vorindustriellen Niveau zu halten und 1,5 Grad anzustreben.',
      'Die EU hat sich auf Klimaneutralität bis 2050 festgelegt und Zwischenziele für 2030 beschlossen. Österreich strebt Klimaneutralität bis 2040 an — früher als die EU-Vorgabe.',
      'Der Weltklimarat IPCC fasst regelmäßig den Forschungsstand zusammen. Dass die Erwärmung überwiegend menschengemacht ist, gilt dort als gesichert; umstritten sind Tempo, regionale Folgen und Gegenmaßnahmen.',
    ],
  },
  {
    id: 'ki-regulierung',
    label: 'Regulierung künstlicher Intelligenz',
    match: ['ai act', 'ki-verordnung', 'ki-gesetz', 'ki-regulierung', 'ki-aufsicht',
      'algorithmentransparenz', 'ki-haftung'],
    since: '2021',
    background: [
      'Die Europäische Kommission legte 2021 den Entwurf für den AI Act vor, die weltweit erste umfassende Regulierung künstlicher Intelligenz. Er stuft Anwendungen nach Risiko ein und verbietet einige ganz.',
      'Das Gesetz gilt für Anbieter, die ihre Systeme im EU-Markt anbieten — unabhängig davon, wo sie sitzen. Die Pflichten greifen gestaffelt über mehrere Jahre.',
      'Kritik kommt von zwei Seiten: Teilen der Industrie, die Wettbewerbsnachteile befürchten, und Bürgerrechtsorganisationen, denen die Ausnahmen für Sicherheitsbehörden zu weit gehen.',
    ],
  },
  {
    id: 'at-politik',
    label: 'Österreichische Innenpolitik',
    match: ['nationalrat', 'bundesregierung', 'bundeskanzler', 'koalition', 'övp',
      'spö', 'fpö', 'grüne', 'neos', 'landtagswahl', 'nationalratswahl',
      'bundespräsident', 'u-ausschuss'],
    since: null,
    background: [
      'Österreich ist eine parlamentarische Demokratie. Der Nationalrat mit 183 Abgeordneten wird alle fünf Jahre gewählt; die Regierung braucht dessen Vertrauen.',
      'Der Bundespräsident wird direkt gewählt, ernennt die Regierung und kann sie entlassen — eine Befugnis, die historisch selten genutzt wurde.',
      'Untersuchungsausschüsse sind ein Minderheitsrecht: Ein Viertel der Abgeordneten kann einen einsetzen, ohne Zustimmung der Mehrheit.',
    ],
  },
  {
    id: 'raiffeisen',
    label: 'Raiffeisen Bank International',
    match: ['raiffeisen', 'rbi', 'raiffeisenlandesbank', 'rzb'],
    since: null,
    background: [
      'Die Raiffeisen Bank International (RBI) ist eine der größten Banken Österreichs mit Schwerpunkt in Zentral- und Osteuropa. Sie ging 2010 aus der Fusion von RZB-Teilen und Raiffeisen International hervor.',
      'Der Raiffeisen-Sektor ist genossenschaftlich aufgebaut: lokale Raiffeisenbanken, darüber Landesbanken, darüber die RBI. Diese Struktur erklärt, warum Entscheidungen oft mehrere Ebenen betreffen.',
      'Das Russland-Geschäft der RBI steht seit dem Angriff auf die Ukraine unter besonderer Beobachtung von EZB und US-Behörden. Ein Rückzug wurde mehrfach angekündigt und verzögerte sich.',
    ],
  },
]

// ----------------------------------------------------------------- Flash-News
//
// Schwere Unfälle, Katastrophen und Warnungen. Bewusst eng gehalten: lieber
// eine Meldung zu wenig als ein Tab voller Alltagskriminalität.

export const FLASH_PATTERNS = {
  // Ereignis muss vorliegen ...
  event: [
    /\bschwerer? unfall\b/i, /\bverkehrsunfall\b/i, /\bmassenkarambolage\b/i,
    /\bzugunglück\b/i, /\bflugzeugabsturz\b/i, /\babsturz\b/i,
    /\bexplosion\b/i, /\bgroßbrand\b/i, /\bbrandkatastrophe\b/i,
    /\berdbeben\b/i, /\bhochwasser\b/i, /\büberschwemmung\b/i, /\bmure\b/i,
    /\blawine\b/i, /\bunwetter\b/i, /\borkan\b/i, /\btornado\b/i,
    /\bevakuier/i, /\bkatastrophenalarm\b/i, /\bausnahmezustand\b/i,
    /\bamoklauf\b/i, /\banschlag\b/i, /\bterror/i, /\bgeiselnahme\b/i,
    /\bschussabgabe\b/i, /\bmesserattacke\b/i,
    /\bvermisst\b/i, /\bgroßeinsatz\b/i, /\bsperre der\b/i,
    /\bstromausfall\b/i, /\bblackout\b/i, /\btrinkwasser/i,
    /\brückruf\b/i, /\bseuche\b/i, /\bpandemie\b/i,
    /\bwarnung\b/i, /\bwarnstufe\b/i, /\bzivilschutz/i,
  ],
  // ... und Schwere oder Regionalbezug dazukommen
  severity: [
    /\btot\b/i, /\bgetötet\b/i, /\btote[nr]?\b/i, /\bopfer\b/i,
    /\bschwer verletzt\b/i, /\bschwerverletzt/i, /\blebensgefahr\b/i,
    /\bmehrere verletzte\b/i, /\bnotarzt\b/i, /\brettungshubschrauber\b/i,
    /\bfeuerwehr\b/i, /\bkrisenstab\b/i, /\bgesperrt\b/i,
  ],
}

// ------------------------------------------------------------------ ÖBB-Ticker
//
// Der offizielle ÖBB-Feed liefert 300 Einträge, überwiegend Auslastungs-
// hinweise und bundesweite Bauarbeiten, und wiederholt dieselbe Störung je
// betroffenem Zug. Beides muss gefiltert bzw. zusammengefasst werden.

export const OEBB_FEED = 'https://fahrplan.oebb.at/bin/help.exe/dn?tpl=rss_feed'

// Offizielle Baustellenübersicht der ÖBB. Der RSS-Feed oben kennt nur
// einzelne Zugausfälle und hatte für die Region zuletzt nur Einträge vom
// Dezember 2025 — die großen Streckensperren stehen ausschließlich hier.
// Kein Feed, sondern HTML: Die Einträge stecken in Links, deren Linktext
// bereits "Bauarbeiten Franz-Josefs-Bahn von 4. Juli bis 7. September 2026"
// lautet. Das ist stabil genug zum Auslesen, aber eine Website — wenn ÖBB
// sie umbaut, meldet der Build "keine Sperren gefunden".
export const OEBB_BAUINFO = 'https://www.oebb.at/de/fahrplan/baustelleninformation'

// Strecken und Linien, die für den Raum Korneuburg–Wien zählen.
export const OEBB_REGION_LINES = [
  'franz-josefs-bahn', 'nordwestbahn', 'nordbahn', 'stammstrecke',
  'pottendorfer', 's40', 's80', 's60', 's1 ', 's2 ', 's3 ', 's7 ',
  'wien', 'korneuburg', 'stockerau', 'floridsdorf', 'tulln',
  'klosterneuburg', 'praterstern', 'hauptbahnhof', 'meidling',
  'himberg', 'gänserndorf', 'hollabrunn', 'niederösterreich',
]

// Autobahnen, die für Sebastians Wege zählen. Da ASFINAG automatisierte
// Abrufe mit HTTP 403 blockt, gibt es keine Livedaten — stattdessen werden
// Nachrichtenmeldungen erkannt, die diese Strecken nennen.
export const REGION_MOTORWAYS = [
  /\bA\s?22\b/i, /\bdonauufer(autobahn|straße)?\b/i,
  /\bA\s?23\b/i, /\bsüdosttangente\b/i,
  /\bA\s?5\b/i, /\bnordautobahn\b/i,
  /\bS\s?1\b.{0,20}(schnellstraße|ring)/i, /\bkorneuburger schnellstraße\b/i,
  /\bB\s?3\b.{0,25}(korneuburg|stockerau|langenzersdorf)/i,
]

// Ereignisse, die einen Autobahn-Eintrag im Ticker rechtfertigen.
export const TRAFFIC_EVENT = [
  /\bstau\b/i, /\bstockend/i, /\bgesperrt\b/i, /\bsperre\b/i, /\bvollsperrung\b/i,
  /\bunfall\b/i, /\bkarambolage\b/i, /\bumleitung\b/i, /\bbaustelle\b/i,
  /\bverzögerung/i, /\bwartezeit/i, /\bkilometer lang/i,
]

// Bahnhöfe und Strecken rund um Korneuburg (Nordwestbahn, Franz-Josefs-Bahn,
// S-Bahn S3). Nur Meldungen, die eine davon nennen, kommen in den Ticker.
export const REGION_STATIONS = [
  'korneuburg', 'bisamberg', 'langenzersdorf', 'leobendorf', 'burgstall',
  'spillern', 'stockerau', 'tulln', 'absdorf', 'hippersdorf', 'stetten',
  'wien floridsdorf', 'floridsdorf', 'wien franz-josefs-bahnhof',
  'franz-josefs-bahnhof', 'wien praterstern', 'wien heiligenstadt',
  'nordwestbahn', 'franz-josefs-bahn', 'weinviertel', 'ernstbrunn',
  'wolkersdorf', 'gerasdorf', 'hollabrunn', 'retz',
]

// Reine Komfort-Hinweise, die nicht in den Ticker gehören.
export const OEBB_NOISE = [
  /sehr hohe auslastung/i, /sitzplatzreservierung/i, /fahrradmitnahme/i,
  /nicht barrierefrei/i, /bordrestaurant/i, /klimaanlage/i, /wlan\b/i,
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
  // Leseraufrufe und Umfragen sind Redaktionsanfragen, keine Meldungen
  /appel à témoignages/i, /rufen sie nach testimonials/i, /\baufruf zu\b/i,
  /\berzählen sie uns\b/i, /\bihre erfahrungen\b/i, /\bshare your\b/i,
  /\btell us about\b/i, /\bhaben sie\b.*\berlebt\b/i,
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
