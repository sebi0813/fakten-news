/* Faktum — werbefreie, faktenorientierte News-PWA.
 *
 * Die Meldungen kommen aus docs/data/news.json, das stündlich (5:30–23:00)
 * von einer GitHub Action serverseitig gebaut wird. Der Client macht daraus
 * Darstellung, Lernprofil, Merkliste, Wetter, Termine und Info-Block.
 *
 * Speichermodell:
 *   faktum.prefs     Lernprofil und Bewertungen — bleibt dauerhaft
 *   faktum.read      Was gelesen wurde — wird nach 3 Tagen gelöscht
 *   faktum.saved     Gemerkte Meldungen mit vollem Text — bleibt dauerhaft
 *   faktum.history   Verlauf zum Nachschlagen — 30 Tage
 *   faktum.cache     Letzter Datenstand für den Offline-Fall
 */
'use strict'

// Steht in der Kopfzeile und unter ⚙. Damit lässt sich am Gerät ablesen, ob
// wirklich die neue Fassung läuft — genau das war beim Cache-Problem nicht
// erkennbar. Beide Werte bei jeder Auslieferung mit hochziehen.
const APP_VERSION = 'v13'

/**
 * Zeitpunkt des Builds, in Wiener Zeit.
 *
 * Kommt aus den Daten, nicht aus einer Konstante: Die vorherige Fassung hatte
 * den Zeitstempel von Hand eingetragen — und er war um fünfzehn Stunden
 * falsch. Ein Wert, den jemand tippen muss, ist ein Wert, der irgendwann
 * nicht mehr stimmt.
 */
function buildStempel(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('de-AT', {
    timeZone: 'Europe/Vienna',
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).replace(',', '')
}

const DATA_URL = 'data/news.json'
const REFRESH_AFTER_MS = 30 * 60 * 1000
const CHECK_INTERVAL_MS = 5 * 60 * 1000
const READ_DWELL_MS = 5000            // so lange sichtbar = gelesen
const ITEM_TTL_DAYS = 3
const HISTORY_TTL_DAYS = 30

/* -------------------------------------------------------------- Profile
 *
 * Mehrere Personen auf einem Gerät: Jedes Profil bekommt einen eigenen
 * Namensraum im Speicher (faktum.<id>.prefs.v1 statt faktum.prefs.v1).
 * Lernprofil, Gemerktes, Lesestatus und Einstellungen sind dadurch strikt
 * getrennt — geteilt wird nur der Nachrichtenbestand, der ohnehin für alle
 * derselbe ist.
 *
 * Die Umstellung darf keine Daten kosten: Beim ersten Start mit dieser
 * Fassung werden die bisherigen Schlüssel in das erste Profil kopiert. Die
 * alten bleiben als Sicherung liegen und werden nicht gelöscht.
 */
const LS_PROFILES = 'faktum.profiles'
const LS_ACTIVE = 'faktum.activeProfile'
const PROFILE_KEYS = ['prefs', 'settings', 'read', 'saved', 'history', 'cache']

function readProfiles() {
  try {
    const raw = localStorage.getItem(LS_PROFILES)
    const list = raw ? JSON.parse(raw) : null
    if (Array.isArray(list) && list.length) return list
  } catch { /* fällt unten auf die Voreinstellung zurück */ }
  return [{ id: 'p1', name: 'Sebastian', emoji: '👤' }]
}

function migrateToProfiles() {
  if (localStorage.getItem(LS_PROFILES)) return
  const id = 'p1'
  let übernommen = 0
  for (const k of PROFILE_KEYS) {
    const alt = localStorage.getItem(`faktum.${k}.v1`)
    if (alt !== null) {
      localStorage.setItem(`faktum.${id}.${k}.v1`, alt)   // Original bleibt liegen
      übernommen++
    }
  }
  localStorage.setItem(LS_PROFILES, JSON.stringify([{ id, name: 'Sebastian', emoji: '👤' }]))
  localStorage.setItem(LS_ACTIVE, id)
  if (übernommen) console.info(`Faktum: ${übernommen} Datensätze ins Profil übernommen.`)
}

migrateToProfiles()

let profiles = readProfiles()
let activeProfile = localStorage.getItem(LS_ACTIVE) || profiles[0].id
if (!profiles.some(p => p.id === activeProfile)) activeProfile = profiles[0].id

const key = name => `faktum.${activeProfile}.${name}.v1`
let LS = Object.fromEntries(PROFILE_KEYS.map(k => [k, key(k)]))

const $ = sel => document.querySelector(sel)
const DAY = 86400_000

const state = {
  data: null,
  tab: 'fuer-dich',
  lastFetch: 0,
  loading: false,
  weather: null,
  weatherPlace: null,
  warnings: [],
  search: '',
}

// --------------------------------------------------------------- Persistenz

const defaults = {
  prefs: () => ({ sources: {}, cats: {}, keywords: {}, focus: {}, votes: {} }),
  settings: () => ({
    hideRead: true, hideLowFact: false, images: true, info: true,
    ortErlaubt: false, apiKey: '',
    // Welche Termin-Sparten dieses Profil sehen will. Leere Liste = alle.
    eventGenres: ['theater', 'musical', 'klassik', 'konzert'],
  }),
  read: () => ({}),
  saved: () => ({}),
  history: () => ([]),
}

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback()
    const parsed = JSON.parse(raw)
    return Array.isArray(fallback()) ? parsed : { ...fallback(), ...parsed }
  } catch { return fallback() }
}

function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* Speicher voll / Privatmodus */ }
}

let prefs = load(LS.prefs, defaults.prefs)
let settings = load(LS.settings, defaults.settings)
let readMap = load(LS.read, defaults.read)
let saved = load(LS.saved, defaults.saved)
let history = load(LS.history, defaults.history)

/**
 * Gelerntes über Umbauten hinwegretten.
 *
 * Wirtschaft war früher auf zwei Kategorien aufgeteilt. Ohne diese
 * Übertragung wären die dort gesammelten Gewichte verloren und das
 * Lernprofil müsste für Wirtschaft bei null anfangen.
 */
function migratePrefs() {
  let geändert = false
  const alt = ['wirtschaft-at', 'wirtschaft-int']
  const summe = alt.reduce((n, k) => n + (prefs.cats[k] || 0), 0)
  if (summe) {
    prefs.cats.wirtschaft = clamp((prefs.cats.wirtschaft || 0) + summe / alt.length)
    for (const k of alt) delete prefs.cats[k]
    geändert = true
  }
  if (geändert) save(LS.prefs, prefs)
}

function switchProfile(id) {
  if (!profiles.some(p => p.id === id)) return
  activeProfile = id
  localStorage.setItem(LS_ACTIVE, id)
  LS = Object.fromEntries(PROFILE_KEYS.map(k => [k, key(k)]))
  prefs = load(LS.prefs, defaults.prefs)
  settings = load(LS.settings, defaults.settings)
  readMap = load(LS.read, defaults.read)
  saved = load(LS.saved, defaults.saved)
  history = load(LS.history, defaults.history)
  migratePrefs()
  purgeOld()
  render()
  openSheet()
}

function saveProfiles() { localStorage.setItem(LS_PROFILES, JSON.stringify(profiles)) }

/** Alles Abgelaufene wegräumen. Gemerktes und das Lernprofil bleiben. */
function purgeOld() {
  const now = Date.now()
  let changed = false

  for (const [id, ts] of Object.entries(readMap)) {
    if (now - ts > ITEM_TTL_DAYS * DAY) { delete readMap[id]; changed = true }
  }
  if (changed) save(LS.read, readMap)

  const before = history.length
  history = history.filter(h => now - h.ts < HISTORY_TTL_DAYS * DAY).slice(0, 800)
  if (history.length !== before) save(LS.history, history)
}

// ------------------------------------------------------------------ Lernen

const STOPWORDS = new Set(`
der die das den dem des ein eine einer eines einem einen und oder aber doch
ist sind war waren wird werden wurde wurden hat haben hatte hatten sein seine
seiner ihres ihre ihrer für mit von vom zum zur auf aus bei nach über unter
vor durch gegen ohne um sich nicht auch noch nur mehr sehr wie was wer wann
wo warum als dass wenn weil dann man kann können soll sollen muss müssen im
in an am zu es er sie ich wir ihr bin bist seid neue neuen neuer alle allen
beim einigen wieder immer heute jahr jahre jahren prozent millionen milliarden
euro dollar the and for with from that this have has was were are will would
could should about after before into over under more most new news than then
them they their there here what when where which while who why says said told
according reuters afp apa dpa montag dienstag mittwoch donnerstag freitag
samstag sonntag jänner januar februar märz april juni juli august september
oktober november dezember morgen gestern abend nacht woche wochen monat monate
zuletzt bereits laut wegen sowie dabei damit dafür danach davon dazu etwa rund
knapp mehrere viele wenige eigenen eigene ersten erste letzten letzte neben
seit sondern zwischen während gegenüber innerhalb außerdem weiterhin erneut
jedoch bisher worden geworden werde wollen wollte lassen ließ geben gegeben
stehen steht kommen kommt gehen geht machen macht sagte sagen sehen sieht
bleibt
`.trim().split(/\s+/))

function keywordsOf(item) {
  return [...new Set(`${item.title} ${item.summary || ''}`.toLowerCase()
    .replace(/[^a-zäöüß0-9\s-]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && w.length <= 24 && !STOPWORDS.has(w) && !/^\d+$/.test(w)))]
    .slice(0, 14)
}

const CLAMP = 20
const clamp = n => Math.max(-CLAMP, Math.min(CLAMP, n))

/**
 * 👍 heißt "gut ausgewählt, entspricht meinen Kriterien".
 * 👎 heißt "ausblenden und als unbrauchbar merken".
 */
function vote(item, dir) {
  const prev = prefs.votes[item.id]?.v || 0
  if (prev === dir) {                       // nochmal getippt = zurücknehmen
    applyWeights(item, -dir)
    delete prefs.votes[item.id]
  } else {
    if (prev !== 0) applyWeights(item, -prev)
    prefs.votes[item.id] = { v: dir, ts: Date.now() }
    applyWeights(item, dir)
    addHistory(item, dir === 1 ? 'up' : 'down')
  }
  save(LS.prefs, prefs)
}

function applyWeights(item, dir) {
  prefs.sources[item.source] = clamp((prefs.sources[item.source] || 0) + dir * 1.0)
  prefs.cats[item.cat] = clamp((prefs.cats[item.cat] || 0) + dir * 0.6)
  for (const t of item.focus || []) prefs.focus[t] = clamp((prefs.focus[t] || 0) + dir * 1.2)
  for (const kw of keywordsOf(item)) {
    prefs.keywords[kw] = clamp((prefs.keywords[kw] || 0) + dir * 0.7)
  }
}

/** Persönlicher Rang: Aktualität, Faktenscore, Fokusthemen, gelernte Vorlieben. */
function personalScore(item) {
  const hours = (Date.now() - item.ts) / 3600_000
  const fresh = Math.max(0, 100 - hours * 2.2)
  let boost = 0

  boost += (prefs.sources[item.source] || 0) * 2.2
  boost += (prefs.cats[item.cat] || 0) * 2.0

  // Fokusthemen bekommen eine feste Grundbevorzugung, unabhängig davon, ob
  // schon Bewertungen vorliegen — sie sind ausdrücklich gewünscht.
  //
  // KI liegt bewusst niedriger: Der Sektor produziert ein Vielfaches dessen,
  // was Raiffeisen und Agile Coaching liefern. Mit gleichem Gewicht besetzte
  // KI den halben Hauptfeed und verdrängte die seltenen Themen.
  const GRUNDGEWICHT = { ki: 8, raiffeisen: 20, agile: 20 }
  for (const t of item.focus || []) {
    boost += (GRUNDGEWICHT[t] ?? 15) + (prefs.focus[t] || 0) * 2.5
  }

  let kw = 0
  for (const k of keywordsOf(item)) kw += prefs.keywords[k] || 0
  boost += Math.max(-25, Math.min(25, kw * 1.4))

  if (item.flash) boost += 12

  item._boost = boost

  // Aktualität entscheidet. Die gelernten Vorlieben stimmen nur innerhalb
  // desselben Zeitfensters fein ab — sie verschieben um höchstens ein paar
  // Stunden, statt eine gut passende alte Meldung nach oben zu heben.
  const fein = Math.max(-12, Math.min(12, boost * 0.4))
  let score = fresh + item.fact * 0.05 + fein

  // Erledigtes ans Ende, aber nicht weg: gelesen und 👍 rutschen hinter
  // alles Ungesehene. So steht Neues immer oben.
  if (readMap[item.id]) score -= 500
  if (prefs.votes[item.id]?.v === 1) score -= 500

  return score
}

// ------------------------------------------------------- Gelesen / Merken

function markRead(item) {
  if (readMap[item.id]) return
  readMap[item.id] = Date.now()
  save(LS.read, readMap)
  addHistory(item, 'read')
  // Bewusst kein sofortiges Abblenden: die Karte ist gerade im Blick, und
  // sie wegzudimmen, während man noch liest, irritiert. Sie verschwindet
  // beim nächsten Aufbau des Feeds.
}

function addHistory(item, action) {
  history = history.filter(h => !(h.id === item.id && h.action === action))
  history.unshift({
    id: item.id, action, ts: Date.now(),
    title: item.title, source: item.source, link: item.link, cat: item.cat,
  })
  if (history.length > 800) history.length = 800
  save(LS.history, history)
}

function isSaved(id) { return !!saved[id] }

function toggleSave(item) {
  if (saved[item.id]) {
    delete saved[item.id]
  } else {
    // Vollständige Kopie: die Meldung soll auch dann noch lesbar sein, wenn
    // sie längst aus news.json rotiert ist.
    saved[item.id] = { ...item, savedAt: Date.now() }
  }
  save(LS.saved, saved)
}

// ---------------------------------------------------------------- Datenlauf

async function fetchNews({ force = false } = {}) {
  if (state.loading) return
  if (!force && state.data && Date.now() - state.lastFetch < REFRESH_AFTER_MS) return

  state.loading = true
  $('#btn-refresh').classList.add('spin')
  try {
    const res = await fetch(`${DATA_URL}?t=${Math.floor(Date.now() / 60000)}`, { cache: 'no-cache' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (!data.items?.length) throw new Error('Keine Meldungen im Datensatz')

    // Alles älter als 3 Tage gar nicht erst behalten.
    const cutoff = Date.now() - ITEM_TTL_DAYS * DAY
    data.items = data.items.filter(i => i.ts >= cutoff)

    // Läuft hier eine veraltete Fassung? news.json kommt immer frisch aus
    // dem Netz, die App selbst kann dagegen aus dem Speicher stammen — iOS
    // stellt Web-Apps beim Öffnen wieder her, statt sie neu zu laden. Dann
    // hilft weder der Service Worker noch Warten.
    if (data.appVersion && data.appVersion !== APP_VERSION) {
      await selbstErneuern(data.appVersion)
      return
    }

    state.data = data
    state.lastFetch = Date.now()
    save(LS.cache, data)
    render()
    const rest = data.translation?.untranslated || 0
    setStatusParts([
      `Meldungen: ${data.items.length}`,
      `Stand: ${relTime(new Date(data.generated).getTime()).replace(/^vor /, '')}`,
      rest > 3 ? { text: `${rest} im Original`, warn: true } : null,
      `Version: ${APP_VERSION} (${buildStempel(data.generated)})`,
    ])
  } catch (err) {
    const cached = load(LS.cache, () => null)
    if (cached?.items?.length) {
      state.data = cached
      render()
      setStatusParts([
        { text: 'Offline', warn: true },
        `Stand: ${relTime(new Date(cached.generated).getTime()).replace(/^vor /, '')}`,
        `Version: ${APP_VERSION} (${buildStempel(cached.generated)})`,
      ])
    } else {
      setStatus(`Konnte Meldungen nicht laden: ${err.message}`, true)
      showEmpty('📡', 'Keine Verbindung', 'Sobald du wieder online bist, lädt Faktum automatisch nach.')
    }
  } finally {
    state.loading = false
    $('#btn-refresh').classList.remove('spin')
  }
}

/**
 * Veraltete Fassung im Speicher: Caches leeren, Service Worker abmelden,
 * einmal neu laden. Der Merker verhindert eine Schleife, falls das Neuladen
 * die alte Fassung zurückbringt — dann steht wenigstens ein Hinweis da.
 */
async function selbstErneuern(neueFassung) {
  const merker = 'faktum.erneuert'
  if (sessionStorage.getItem(merker) === neueFassung) {
    setStatus(`Fassung ${neueFassung} verfügbar — bitte App einmal schließen und neu öffnen.`, true)
    return
  }
  sessionStorage.setItem(merker, neueFassung)
  setStatus(`Neue Fassung ${neueFassung} wird geladen …`)
  try {
    for (const r of await navigator.serviceWorker?.getRegistrations?.() || []) await r.unregister()
    for (const k of await caches.keys()) await caches.delete(k)
  } catch { /* auch ohne Aufräumen lohnt der Versuch */ }
  location.reload()
}

function setStatus(text, isErr = false) {
  const el = $('#status')
  el.textContent = text
  el.classList.toggle('err', isErr)
}

/**
 * Statuszeile mit einzeln eingefärbten Teilen.
 * Die Versionsangabe soll neutral bleiben, auch wenn daneben eine Warnung
 * steht — sonst liest sich "v7 · Build …" wie eine Fehlermeldung.
 */
function setStatusParts(teile) {
  const el = $('#status')
  el.classList.remove('err')
  el.innerHTML = teile.filter(Boolean)
    .map(t => typeof t === 'string'
      ? `<span>${esc(t)}</span>`
      : `<span class="${t.warn ? 'st-warn' : ''}">${esc(t.text)}</span>`)
    .join('<span class="st-sep">·</span>')
}

// ------------------------------------------------------------------ Ansicht

const CLIENT_TABS = {
  'fuer-dich': { label: 'Für dich', icon: '⭐' },
  flash: { label: 'Flash', icon: '⚡' },
  termine: { label: 'Termine', icon: '📅' },
  gemerkt: { label: 'Gemerkt', icon: '🔖' },
  historie: { label: 'Historie', icon: '🕘' },
  wetter: { label: 'Wetter', icon: '🌤' },
}

function matchesSearch(item) {
  if (!state.search) return true
  const q = state.search.toLowerCase()
  return `${item.title} ${item.summary || ''} ${item.source}`.toLowerCase().includes(q)
}

/**
 * Ausgeblendet wird nur, was ausdrücklich abgelehnt wurde.
 * Gelesenes und 👍 verschwinden nicht mehr — sie rutschen ans Ende
 * (siehe personalScore). Vorher waren sie weg, was das Zurückblättern
 * unmöglich machte und wie ein Fehler wirkte.
 */
function isHidden(item) {
  if (isSaved(item.id)) return false                 // Gemerktes bleibt immer
  return settings.hideRead && prefs.votes[item.id]?.v === -1
}

function allItems() {
  return state.data?.items || []
}

function visibleItems() {
  let items = allItems().filter(matchesSearch)
  if (settings.hideLowFact) items = items.filter(i => i.fact >= 60)

  // Wird gesucht, gilt die Suche für den GESAMTEN Bestand. Vorher wirkte
  // zwar der Suchbegriff, danach griff aber weiterhin der Kategorie-Filter
  // — man suchte also immer nur im gerade offenen Tab.
  if (state.search && state.tab !== 'gemerkt' && state.tab !== 'historie') {
    return items.filter(i => !isHidden(i)).sort((a, b) => b.ts - a.ts)
  }

  switch (state.tab) {
    case 'gemerkt':
      return Object.values(saved).sort((a, b) => b.savedAt - a.savedAt).filter(matchesSearch)
    case 'flash':
      return items.filter(i => i.flash && !isHidden(i)).sort((a, b) => b.ts - a.ts)
    case 'fokus':
      return items.filter(i => (i.cat === 'fokus' || i.focus) && !isHidden(i))
        .sort((a, b) => personalScore(b) - personalScore(a))
    case 'fuer-dich': {
      // Mischung über alle Kategorien, nach persönlichem Rang.
      const scored = items.filter(i => !isHidden(i))
        .map(i => ({ i, s: personalScore(i) }))
        .sort((a, b) => b.s - a.s)
      return diversify(scored)
    }
    case 'wirtschaft':
      // Österreich zuerst, darunter international — innerhalb beider Blöcke
      // nach Aktualität.
      return items.filter(i => i.cat === 'wirtschaft' && !isHidden(i))
        .sort((a, b) => (Number(!!b.at) - Number(!!a.at)) || (b.ts - a.ts))
    case 'sport-int':
      // Fußball (Österreich, Barcelona, Champions League) zuerst, dann
      // Formel 1 und Tennis, dann die übrigen Sportarten.
      return items.filter(i => i.cat === 'sport-int' && !isHidden(i))
        .sort((a, b) => ((a.sport ?? 3) - (b.sport ?? 3)) || (b.ts - a.ts))
    case 'wissenschaft':
      // Ernährung, Diätologie und Astronomie stehen oben.
      return items.filter(i => i.cat === 'wissenschaft' && !isHidden(i))
        .sort((a, b) => (Number(!!b.sciFocus) - Number(!!a.sciFocus)) || (b.ts - a.ts))
    default:
      return items.filter(i => i.cat === state.tab && !isHidden(i)).sort((a, b) => b.ts - a.ts)
  }
}

/**
 * Verhindert, dass der Hauptfeed von einer Quelle oder Kategorie dominiert
 * wird — besonders am Anfang, wenn nur die Aktualität entscheidet.
 */
function diversify(scored) {
  const out = []
  const pool = scored.slice()
  const recentSrc = []
  const recentCat = []

  while (pool.length) {
    let bestIdx = 0
    let bestVal = -Infinity
    const window = Math.min(pool.length, 25)
    for (let k = 0; k < window; k++) {
      const { i, s } = pool[k]
      const penalty = recentSrc.filter(x => x === i.source).length * 14
        + recentCat.filter(x => x === i.cat).length * 5
      if (s - penalty > bestVal) { bestVal = s - penalty; bestIdx = k }
    }
    const pick = pool.splice(bestIdx, 1)[0]
    out.push(pick.i)
    recentSrc.push(pick.i.source); if (recentSrc.length > 4) recentSrc.shift()
    recentCat.push(pick.i.cat); if (recentCat.length > 3) recentCat.shift()
  }
  return out
}

function renderTabs() {
  const cats = state.data?.categories || []
  const counts = state.data?.counts || {}
  const items = allItems()

  const tabs = [
    { id: 'fuer-dich', ...CLIENT_TABS['fuer-dich'] },
    { id: 'flash', ...CLIENT_TABS.flash, count: items.filter(i => i.flash && !isHidden(i)).length },
    ...cats.map(c => ({
      ...c,
      count: c.id === 'fokus'
        ? items.filter(i => (i.cat === 'fokus' || i.focus) && !isHidden(i)).length
        : items.filter(i => i.cat === c.id && !isHidden(i)).length,
    })),
    { id: 'termine', ...CLIENT_TABS.termine, count: (state.data?.events || []).length },
    { id: 'gemerkt', ...CLIENT_TABS.gemerkt, count: Object.keys(saved).length },
    { id: 'wetter', ...CLIENT_TABS.wetter },
    { id: 'historie', ...CLIENT_TABS.historie },
  ]

  $('#tabs').innerHTML = tabs.map(t => `
    <button class="tab ${t.id === 'flash' && t.count ? 'tab-flash' : ''}" role="tab"
            data-tab="${t.id}" aria-selected="${state.tab === t.id}">
      ${t.icon} ${esc(t.label)}${t.count != null ? `<span class="tab-count">${t.count}</span>` : ''}
    </button>`).join('')
}

function render() {
  renderTabs()
  $('#empty').hidden = true
  stopReadTracking()

  if (state.tab === 'wetter') {
    $('#feed').hidden = true
    $('#weather').hidden = false
    renderWeather()
    return
  }
  $('#weather').hidden = true
  $('#feed').hidden = false

  if (state.tab === 'historie') { renderHistory(); return }
  if (state.tab === 'termine') { renderEvents(); return }

  // Nur in "Für dich". Flash bleibt schweren Unfällen, Katastrophen und
  // Warnungen vorbehalten — Bahn- und Straßeninfo hat dort nichts verloren.
  const info = state.tab === 'fuer-dich' ? infoBlockHTML() : ''

  const items = visibleItems()
  if (!items.length) {
    $('#feed').innerHTML = info
    renderEmptyFor(state.tab)
    return
  }

  $('#feed').innerHTML = info + items.map(cardHTML).join('')
  startReadTracking()
}

function renderEmptyFor(tab) {
  if (state.search) {
    return showEmpty('🔍', 'Nichts gefunden',
      `Zu „${state.search}“ gibt es in den aktuellen Meldungen keinen Treffer.`)
  }
  const texts = {
    flash: ['⚡', 'Keine Flash-News', 'Aktuell keine schweren Unfälle, Katastrophen oder Warnungen. Gut so.'],
    gemerkt: ['🔖', 'Noch nichts gemerkt', 'Tippe bei einer Meldung auf „Merken“ — Gemerktes bleibt dauerhaft erhalten, auch wenn die Quelle den Artikel löscht.'],
    fokus: ['🎯', 'Keine Fokus-Meldungen', 'Zu Raiffeisen/RBI, Agile Coaching und KI liegt gerade nichts Neues vor.'],
    korneuburg: ['📍', 'Nichts aus der Region', 'Für Korneuburg liegen gerade keine neuen Meldungen vor.'],
  }
  const [i, t, s] = texts[tab] || ['🗂', 'Alles gelesen',
    'Du hast alle Meldungen dieser Kategorie gesehen oder bewertet. Unter „Historie“ kannst du sie nachlesen.']
  showEmpty(i, t, s)
}

function showEmpty(icon, title, text) {
  const el = $('#empty')
  el.innerHTML = `<div class="big">${icon}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>`
  el.hidden = false
}

function renderHistory() {
  const list = history.filter(h => !state.search
    || `${h.title} ${h.source}`.toLowerCase().includes(state.search.toLowerCase()))
  if (!list.length) {
    $('#feed').innerHTML = ''
    return showEmpty('🕘', 'Historie leer', 'Hier sammelt sich, was du gelesen und bewertet hast — 30 Tage lang.')
  }
  const ICON = { up: '👍', down: '👎', read: '👁' }
  $('#feed').innerHTML = `<p class="muted small hist-note">${list.length} Einträge der letzten 30 Tage</p>`
    + list.map(h => `
    <a class="hist-row" href="${esc(h.link)}" target="_blank" rel="noopener noreferrer">
      <span class="hist-icon">${ICON[h.action] || '·'}</span>
      <span class="hist-text">
        <b>${esc(h.title)}</b>
        <small class="muted">${esc(h.source)} · ${relTime(h.ts)}</small>
      </span>
    </a>`).join('')
}

const GENRE_ICON = { theater: '🎭 ', musical: '🎤 ', klassik: '🎻 ', konzert: '🎵 ' }

/** Termine der nächsten zwei Wochen, nach Nähe zum Standort gruppiert. */
function renderEvents() {
  let events = (state.data?.events || []).filter(e => e.ts > Date.now() - 12 * 3600_000)
  const alleAnzahl = events.length
  // Nur filtern, wenn die Daten die Sparten überhaupt kennen. Ein älterer
  // Datenstand ohne Sparten würde sonst sämtliche Termine ausblenden.
  const kenntSparten = events.some(e => e.genres !== undefined)
  const gewuenscht = settings.eventGenres || []
  if (kenntSparten && gewuenscht.length) {
    events = events.filter(e => (e.genres || []).some(g => gewuenscht.includes(g)))
  }
  if (state.search) {
    const q = state.search.toLowerCase()
    events = events.filter(e => `${e.title} ${e.place} ${e.venue}`.toLowerCase().includes(q))
  }
  if (!events.length) {
    $('#feed').innerHTML = ''
    return showEmpty('📅', 'Keine Termine',
      state.search ? `Zu „${state.search}“ gibt es keinen Termin in den nächsten zwei Wochen.`
        : settings.eventsFilter && alleAnzahl
          ? `${alleAnzahl} Termine liegen vor, aber keiner passt zu Theater, Musical, Konzert oder Klassik. Unter ⚙ lässt sich der Filter abschalten.`
          : 'Für die nächsten zwei Wochen liegen gerade keine Veranstaltungen vor.')
  }

  // Chronologisch, damit die Uhrzeiten innerhalb eines Tages nicht
  // zurückspringen. Die Nähe zum Standort entscheidet nur bei gleicher Zeit.
  const hier = (state.weatherPlace || '').toLowerCase()
  const nah = e => hier.includes(e.near) ? 0 : (e.near === 'korneuburg' ? 1 : 2)
  events.sort((a, b) => (a.ts - b.ts) || (nah(a) - nah(b)))

  const tage = {}
  for (const e of events) {
    const d = new Date(e.ts)
    const key = d.toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long' })
    ;(tage[key] ||= []).push(e)
  }

  const hinweis = alleAnzahl > events.length
    ? ` · ${alleAnzahl - events.length} weitere ausgeblendet (⚙ Anzeige)` : ''
  $('#feed').innerHTML = `<p class="muted small hist-note">${events.length} Termine in den nächsten zwei Wochen${hinweis} · Quelle: meinbezirk.at</p>`
    + Object.entries(tage).map(([tag, liste]) => `
      <h3 class="event-day">${esc(tag)}</h3>
      ${liste.map(e => `
        <a class="event-row" href="${esc(e.link)}" target="_blank" rel="noopener noreferrer">
          <span class="event-time">${new Date(e.ts).getHours() || new Date(e.ts).getMinutes()
            ? new Date(e.ts).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })
            : '–'}</span>
          <span class="event-text">
            <b>${esc(e.title)}</b>
            <small class="muted">${(e.genres || []).map(g => GENRE_ICON[g] || '').join('')}
              ${esc([e.venue, e.place].filter(Boolean).join(' · '))}</small>
          </span>
        </a>`).join('')}`).join('')
}

function cardHTML(item) {
  const v = prefs.votes[item.id]?.v || 0
  const showImg = settings.images && item.image
  const matched = item._boost > 20
  const topics = (item.focus || []).map(id =>
    (state.data?.focusTopics || []).find(t => t.id === id)).filter(Boolean)

  return `
  <article class="card ${v === 1 ? 'voted-up' : ''} ${item.flash ? 'is-flash' : ''} ${readMap[item.id] ? 'is-read' : ''}"
           data-id="${item.id}">
    <div class="card-body">
      <div class="meta">
        ${item.flash ? `<span class="pill pill-flash">⚡ Flash</span>` : ''}
        ${topics.map(t => `<span class="pill pill-focus">${t.icon} ${esc(t.label)}</span>`).join('')}
        <span class="src">${esc(item.source)}</span>
        <span class="dot">·</span>
        <span>${relTime(item.ts)}</span>
        <span class="pill pill-${item.factLabel}">Fakten ${esc(item.factLabel)}</span>
        ${item.translated ? `<span class="pill pill-tr">übersetzt</span>` : ''}
        ${item.untranslated ? `<span class="pill pill-orig">${esc(sprachKurz(item.lang))}</span>` : ''}
        ${item.paywall ? `<span class="pill pill-pay">Bezahlschranke</span>` : ''}
        ${item.presse ? `<span class="pill pill-pay">Pressemitteilung</span>` : ''}
        ${item.also ? `<span class="pill pill-muted">${item.also.length + 1} Quellen</span>` : ''}
        ${item.linkWarn ? `<span class="pill pill-warn">Link prüfen</span>` : ''}
        ${matched ? `<span class="pill pill-match">passt zu dir</span>` : ''}
      </div>
      <div class="card-main">
        <div class="card-text">
          <h2>${esc(item.title)}${item.context
            ? `<button class="ctx-btn" data-act="context" title="Hintergrund zum Thema"
                       aria-label="Hintergrund zum Thema">i</button>` : ''}</h2>
          ${item.summary ? `<p class="sum">${esc(item.summary)}</p>` : ''}
        </div>
        ${showImg ? `<button class="thumb" data-act="zoom" aria-label="Bild vergrößern">
            <img src="${esc(item.image)}" alt="" loading="lazy" decoding="async"
                 referrerpolicy="no-referrer"
                 onerror="this.closest('.thumb').remove()">
          </button>` : ''}
      </div>
      ${item.also ? `<p class="also">Auch berichtet von ${item.also.map(a =>
          `<a href="${esc(a.link)}" target="_blank" rel="noopener noreferrer">${esc(a.source)}</a>`).join(', ')}</p>` : ''}
    </div>
    <div class="actions">
      <button class="btn btn-yes ${v === 1 ? 'on' : ''}" data-act="up"
              title="Gut ausgewählt, passt zu meinen Kriterien">👍 Relevant</button>
      <button class="btn btn-no" data-act="down" title="Ausblenden und künftig weniger davon">👎 Eher nicht</button>
      <button class="btn btn-save ${isSaved(item.id) ? 'on' : ''}" data-act="save">
        ${isSaved(item.id) ? '🔖 Gemerkt' : '🔖 Merken'}</button>
      <a class="btn btn-link" href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">🔗 Original</a>
      <button class="btn" data-act="detail">💡 Einordnung</button>
    </div>
    <div class="detail-slot"></div>
  </article>`
}

const SPRACHE_KURZ = {
  en: 'Englisch', fr: 'Französisch', es: 'Spanisch', it: 'Italienisch',
  nl: 'Niederländisch', sv: 'Schwedisch', no: 'Norwegisch', da: 'Dänisch',
  fi: 'Finnisch', pt: 'Portugiesisch', ja: 'Japanisch',
}
const sprachKurz = l => SPRACHE_KURZ[l] || String(l || '').toUpperCase()

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function relTime(ts) {
  const min = Math.round((Date.now() - ts) / 60000)
  if (min < 1) return 'gerade eben'
  if (min < 60) return `vor ${min} Min`
  const h = Math.round(min / 60)
  if (h < 24) return `vor ${h} Std`
  const d = Math.round(h / 24)
  return d === 1 ? 'gestern' : `vor ${d} Tagen`
}

// ------------------------------------------------- Gelesen nach 5 Sekunden

let readObserver = null
const dwellTimers = new Map()

function startReadTracking() {
  stopReadTracking()
  if (!('IntersectionObserver' in window)) return

  readObserver = new IntersectionObserver(entries => {
    for (const e of entries) {
      const id = e.target.dataset.id
      if (e.isIntersecting && e.intersectionRatio >= 0.6) {
        if (dwellTimers.has(id)) continue
        dwellTimers.set(id, setTimeout(() => {
          dwellTimers.delete(id)
          const item = findItem(id)
          if (item) markRead(item)
        }, READ_DWELL_MS))
      } else {
        clearTimeout(dwellTimers.get(id))
        dwellTimers.delete(id)
      }
    }
  }, { threshold: [0, 0.6, 1] })

  for (const card of document.querySelectorAll('#feed .card')) readObserver.observe(card)
}

function stopReadTracking() {
  readObserver?.disconnect()
  readObserver = null
  for (const t of dwellTimers.values()) clearTimeout(t)
  dwellTimers.clear()
}

function findItem(id) {
  return allItems().find(i => i.id === id) || saved[id] || null
}

// -------------------------------------------------------------- Info-Block

/** "27.08.2026 00:00" -> Date. GeoSphere liefert Tag zuerst. */
function tagAus(str) {
  const m = String(str || '').match(/(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/)
  if (!m) return null
  return new Date(+m[3], +m[2] - 1, +m[1], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0)
}

/** Lesbarer Zeitraum, ohne Wiederholung wenn alles am selben Tag liegt. */
function zeitraum(von, bis) {
  if (!von) return ''
  const tag = d => d.toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'numeric' })
  const heute = new Date().toDateString()
  const vonTxt = von.toDateString() === heute ? 'heute' : tag(von)
  if (!bis || von.toDateString() === bis.toDateString()) return ` (${vonTxt})`
  return ` (${vonTxt} bis ${tag(bis)})`
}

async function fetchWarnings() {
  const p = await getPosition() || FALLBACK_POS
  try {
    const r = await fetch(`https://warnungen.zamg.at/wsapp/api/getWarningsForCoords?lat=${p.lat}&lon=${p.lon}&lang=de`)
    const j = await r.json()
    const place = j?.properties?.location?.properties?.name || ''

    // GeoSphere liefert dieselbe Warnung einmal pro Kalendertag. Eine
    // zweitägige Hitzewarnung erschien dadurch zweimal wortgleich. Gleicher
    // Text wird zusammengefasst, der Zeitraum über alle Tage gespannt.
    const nachText = new Map()
    for (const w of j?.properties?.warnings || []) {
      const p = w?.properties || {}
      const text = p.text || 'Wetterwarnung'
      const eintrag = nachText.get(text) || { text, von: null, bis: null }
      const von = tagAus(p.begin)
      const bis = tagAus(p.end)
      if (von && (!eintrag.von || von < eintrag.von)) eintrag.von = von
      if (bis && (!eintrag.bis || bis > eintrag.bis)) eintrag.bis = bis
      nachText.set(text, eintrag)
    }

    state.warnings = [...nachText.values()].map(e => ({
      kind: 'warn',
      text: `${place ? place + ': ' : ''}${e.text}${zeitraum(e.von, e.bis)}`,
    }))
  } catch { state.warnings = [] }
}

/**
 * Der Info-Block über den Meldungen: Warnungen, Straße, Bahn, Wetter.
 *
 * Ersetzt das frühere Laufband. Ein Ticker zwingt zum Warten, bis die
 * gewünschte Zeile vorbeikommt — als Liste ist alles auf einen Blick da.
 */
function infoEntries() {
  const out = []

  for (const w of state.warnings) out.push({ kind: 'warn', icon: '⚠', text: w.text })

  const ICON = { traffic: '🚗', oebb: '🚆' }
  const LABEL = { traffic: 'Straße', oebb: 'Bahn' }
  // Monatelange Baustellen sind Hintergrundwissen, keine Tagesinformation.
  // Sie standen bisher als sechs gleiche Zeilen über allem und verdrängten
  // die tatsächliche Störung von heute. Höchstens drei, und immer zuletzt.
  // Sperren, die vor mehr als einer Woche begannen, stehen nicht mehr im
  // Vordergrund. Sie ändern sich monatelang nicht — wer sie täglich liest,
  // übersieht irgendwann die eine Meldung, die zählt.
  const info = state.data?.info || []
  for (const t of info) {
    if (t.kind === 'oebb' && t.neu === false) continue
    out.push({ kind: t.kind, icon: ICON[t.kind] || 'ℹ', label: LABEL[t.kind], text: t.text, link: t.link })
  }

  // Wetter am aktuellen Standort — immer, nicht nur als Notnagel.
  if (state.weather?.hourly) {
    const w = state.weather
    const jetzt = new Date()
    const start = w.hourly.time.findIndex(t => new Date(t) > jetzt)
    const teile = []
    for (let k = 0; k < 3 && start >= 0; k++) {
      const i = start + k
      if (!w.hourly.time[i]) break
      const [icon] = wmo(w.hourly.weather_code[i])
      teile.push(`${new Date(w.hourly.time[i]).getHours()}:00 ${icon} ${Math.round(w.hourly.temperature_2m[i])}°`
        + ` · ${w.hourly.precipitation_probability[i] ?? 0}%`)
    }
    const [nowIcon, nowDesc] = wmo(w.current.weather_code)
    out.push({
      kind: 'wx',
      icon: nowIcon,
      label: state.weatherPlace || 'Wetter',
      text: `${Math.round(w.current.temperature_2m)}°, ${nowDesc}`
        + (teile.length ? ` — danach ${teile.join('  ·  ')}` : ''),
    })
  }
  return out
}

/* ------------------------------------------------------------ Verbindungen
 *
 * Live-Abfahrtszeiten lassen sich nicht in die App holen: Weder ÖBB noch
 * Wiener Linien senden CORS-Header, der Browser darf ihre Schnittstellen
 * also nicht abfragen. Geprüft wurden fahrplan.oebb.at (Liveticker und
 * Stationssuche) und wienerlinien.at/ogd_realtime — alle drei ohne
 * Access-Control-Allow-Origin.
 *
 * Was bleibt und ehrlich funktioniert: Direktlinks in die ÖBB-Fahrplan-
 * auskunft, mit fertiger Strecke und aktueller Uhrzeit. Ein Fingertipp,
 * und Scotty zeigt die nächsten Verbindungen.
 */

const STATIONEN = {
  korneuburg: 'Korneuburg',
  wienMitte: 'Wien Mitte-Landstraße',
  praterstern: 'Wien Praterstern',
  floridsdorf: 'Wien Floridsdorf',
  franzJosefs: 'Wien Franz-Josefs-Bahnhof',
}

/** Fahrplanauskunft für eine Strecke, ab jetzt. */
function scottyLink(von, nach) {
  const jetzt = new Date()
  const p = new URLSearchParams({
    S: von,
    Z: nach,
    date: jetzt.toLocaleDateString('de-AT', { timeZone: 'Europe/Vienna' }),
    time: jetzt.toLocaleTimeString('de-AT', { timeZone: 'Europe/Vienna', hour: '2-digit', minute: '2-digit' }),
    start: '1',
  })
  return `https://fahrplan.oebb.at/bin/query.exe/dn?${p}`
}

/**
 * Live-Verkehrslage auf der Karte.
 *
 * Eigene Stau-Daten gibt es nicht: ASFINAG beantwortet automatisierte
 * Abrufe mit HTTP 403, data.gv.at und VOR mit 404. Statt einer halbgaren
 * eigenen Anzeige führt der Knopf dorthin, wo die Lage wirklich steht.
 */
function verkehrskarte() {
  const nachWien = richtung() === 'ausKorneuburg'
  const von = nachWien ? 'Korneuburg' : 'Wien Mitte, Wien'
  const nach = nachWien ? 'Wien Mitte, Wien' : 'Korneuburg'
  return 'https://www.google.com/maps/dir/?api=1'
    + `&origin=${encodeURIComponent(von)}&destination=${encodeURIComponent(nach)}`
    + '&travelmode=driving&layer=traffic'
}

/** Abfahrtstafel einer Station. */
function tafelLink(station) {
  return `https://fahrplan.oebb.at/bin/stboard.exe/dn?input=${encodeURIComponent(station)}&boardType=dep&start=1`
}

/**
 * Bin ich gerade eher in Wien oder im Bezirk Korneuburg? Entscheidet, in
 * welche Richtung die Verbindungen vorgeschlagen werden. Ohne Standort
 * wird Korneuburg angenommen.
 */
function richtung() {
  const ort = (state.weatherPlace || '').toLowerCase()
  return /wien|floridsdorf|donaustadt|leopoldstadt|brigittenau/.test(ort) ? 'ausWien' : 'ausKorneuburg'
}

function verbindungenHTML() {
  const S = STATIONEN
  const nachWien = richtung() === 'ausKorneuburg'
  const start = nachWien ? S.korneuburg : S.wienMitte
  const ziele = nachWien
    ? [[S.wienMitte, 'Wien Mitte'], [S.praterstern, 'Praterstern'], [S.floridsdorf, 'Floridsdorf']]
    : [[S.korneuburg, 'Korneuburg']]

  return `<section class="infoblock verbindungen">
    <h2 class="info-head">
      🚉 ${nachWien ? 'Von Korneuburg nach Wien' : 'Von Wien nach Korneuburg'}
      <button class="mini-btn" data-act="verbindung-neu" title="Standort neu bestimmen">↻</button>
    </h2>
    <div class="conn-row">
      ${ziele.map(([ziel, kurz]) => `
        <a class="conn-btn" href="${esc(scottyLink(start, ziel))}" target="_blank" rel="noopener noreferrer">
          ${esc(kurz)} <span>›</span></a>`).join('')}
    </div>
    <div class="conn-row">
      <a class="conn-btn conn-sec" href="${esc(tafelLink(start))}" target="_blank" rel="noopener noreferrer">
        Abfahrten ${esc(nachWien ? 'Korneuburg' : 'Wien Mitte')}</a>
      <a class="conn-btn conn-sec" href="https://anachb.vor.at/" target="_blank" rel="noopener noreferrer">
        Wiener Linien</a>
      <a class="conn-btn conn-sec" href="${esc(verkehrskarte())}" target="_blank" rel="noopener noreferrer">
        🚗 Verkehrslage</a>
    </div>
    <p class="conn-note muted">Öffnet die ÖBB-Fahrplanauskunft mit der aktuellen Uhrzeit.
      Live-Abfahrten lassen sich nicht in die App holen — ÖBB und Wiener Linien
      erlauben keinen direkten Zugriff aus dem Browser.</p>
  </section>`
}

/** Laufende Streckensperren, eingeklappt als Nachschlagewerk. */
function sperrenHTML() {
  const alt = (state.data?.info || []).filter(t => t.kind === 'oebb' && t.neu === false)
  if (!alt.length) return ''
  return `<details class="sperren">
    <summary>🚧 Laufende Streckensperren (${alt.length})</summary>
    ${alt.map(t => `<a class="info-row" href="${esc(t.link || '#')}"
        target="_blank" rel="noopener noreferrer">
        <span class="info-icon">🚆</span>
        <span class="info-text">${esc(t.text)}</span></a>`).join('')}
  </details>`
}

function infoBlockHTML() {
  if (!settings.info) return ''
  const entries = infoEntries()
  const sperren = sperrenHTML()
  // Auch ohne akute Meldung soll die Sperren-Rubrik erreichbar bleiben —
  // sonst verschwindet sie genau dann, wenn gerade nichts los ist.
  if (!entries.length && !sperren) return verbindungenHTML()

  return verbindungenHTML() + `<section class="infoblock">
    <h2 class="info-head">📍 In deiner Umgebung</h2>
    ${entries.map(e => {
      const inner = `<span class="info-icon">${e.icon}</span>
        <span class="info-text">${e.label ? `<b>${esc(e.label)}</b> ` : ''}${esc(e.text)}</span>`
      return e.link
        ? `<a class="info-row" data-kind="${e.kind}" href="${esc(e.link)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
        : `<div class="info-row" data-kind="${e.kind}">${inner}</div>`
    }).join('')}
    ${sperren}
  </section>`
}

// -------------------------------------------------------------- Einordnung

const TRUST_TEXT = {
  3: 'Öffentlich-rechtlich oder Agentur-Niveau — hohe redaktionelle Prüfdichte.',
  2: 'Etablierte Qualitätsredaktion mit Impressum und Korrekturpraxis.',
  1: 'Regionalquelle oder Pressemitteilungsdienst — Inhalte werden dort teils ungeprüft durchgereicht.',
}

function ruleBasedDetail(item) {
  const bits = []
  bits.push(`<li><b>Quelle:</b> ${esc(item.source)} — ${TRUST_TEXT[item.trust]}</li>`)
  bits.push(`<li><b>Faktenscore ${item.fact}/100 („${esc(item.factLabel)}“):</b> aus Quellengüte, Konkretheit des Textes, Zeitstempel, Zuschreibungen („laut …“) und Abzügen für reißerische Sprache.</li>`)
  if (item.also) {
    bits.push(`<li><b>Mehrfach bestätigt:</b> ${item.also.length + 1} unabhängige Redaktionen berichten dasselbe. Das ist das stärkste automatisch verfügbare Signal gegen eine Falschmeldung.</li>`)
  } else {
    bits.push(`<li><b>Einzelquelle:</b> bisher berichtet nur ${esc(item.source)}. Bei überraschenden Behauptungen lohnt ein Gegencheck.</li>`)
  }
  if (item.published) {
    bits.push(`<li><b>Veröffentlicht:</b> ${new Date(item.published).toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' })}</li>`)
  }
  if (item.linkWarn) {
    bits.push(`<li class="warn"><b>Hinweis:</b> Der Original-Link antwortete beim letzten Test nicht.</li>`)
  }
  if (item.translated) {
    bits.push(`<li><b>Maschinell übersetzt</b> aus dem ${esc(item.fromLang)}.
      Originaltitel: <i>„${esc(item.origTitle)}“</i><br>
      <span class="warn">Maschinelle Übersetzung kann die Aussage verdrehen — etwa wer wen
      bestraft. Bei wichtigen Details ins Original schauen.</span></li>`)
  }
  // Bei Mehrfachmeldungen die Fassung jeder Redaktion zeigen. Verschiedene
  // Häuser nennen verschiedene Details — so sieht man die Fakten aus allen
  // Quellen nebeneinander, statt nur einen höheren Punktestand.
  const fassungen = (item.also || []).filter(a => a.summary && a.summary.length > 40)
  const vergleich = fassungen.length ? `
    <h4 style="margin-top:14px">Was die anderen Quellen schreiben</h4>
    <div class="quellen-vergleich">
      <div class="qv-eintrag"><b>${esc(item.source)}</b><p>${esc(item.summary || '')}</p></div>
      ${fassungen.map(a => `<div class="qv-eintrag">
        <b><a href="${esc(a.link)}" target="_blank" rel="noopener noreferrer">${esc(a.source)}</a></b>
        <p>${esc(a.summary)}</p></div>`).join('')}
    </div>` : ''

  return `
    <h4>Regelbasierte Einordnung</h4>
    <ul>${bits.join('')}</ul>
    ${vergleich}
    <p class="src-note">Das ist eine Bewertung der <i>Quellenlage</i>, keine inhaltliche Prüfung.
    Für eine inhaltliche Einordnung durch Claude hinterlege einen API-Key unter ⚙ Einstellungen.</p>`
}

async function aiDetail(item, slot) {
  slot.innerHTML = `<div class="detail"><h4>Claude analysiert …</h4><div class="skeleton" style="height:60px"></div></div>`

  // Ohne heutiges Datum hält Claude jede Meldung für zukunftsdatiert und
  // warnt vor einem "Metadatenfehler" — das Modell kennt den Kalender nicht.
  const heute = new Date().toLocaleDateString('de-AT', {
    timeZone: 'Europe/Vienna', weekday: 'long', day: '2-digit',
    month: 'long', year: 'numeric',
  })

  const prompt = `Du bist ein nüchterner Nachrichtenanalyst. Ordne die folgende Meldung ein.

Heute ist ${heute}. Meldungen der letzten Tage sind also aktuell und kein Fehler.

Titel: ${item.origTitle || item.title}
Zusammenfassung: ${item.origSummary || item.summary || '(keine)'}
${item.translated ? `Sprache des Originals: ${item.fromLang}. Antworte trotzdem auf Deutsch.\n` : ''}Quelle: ${item.source} (${item.site})
Veröffentlicht: ${item.published || 'unbekannt'}
${item.also ? `Auch berichtet von: ${item.also.map(a => a.source).join(', ')}` : 'Bisher nur diese eine Quelle.'}

Antworte auf Deutsch, kompakt, in genau diesen vier Abschnitten mit diesen Überschriften:
WORUM GEHT ES: 2 Sätze, rein faktisch.
WARUM RELEVANT: 2 Sätze, konkrete Auswirkungen.
EINZUORDNEN: 1-3 Stichpunkte — was unsicher, umstritten oder noch offen ist.
VORSICHT: 1 Satz — welche inhaltliche Behauptung man ohne Zweitquelle nicht übernehmen sollte. Wenn nichts auffällt, schreibe "Keine Auffälligkeiten in der Quellenlage."

Keine Einleitung, keine Floskeln. Erfinde keine Fakten, die nicht oben stehen.
Kommentiere NICHT das Veröffentlichungsdatum — es ist korrekt und liegt nicht in der Zukunft.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 700,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) throw new Error(`${res.status} — ${(await res.text()).slice(0, 160)}`)
    const json = await res.json()
    const text = (json.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim()
    slot.innerHTML = `<div class="detail">
        <h4>Einordnung durch Claude</h4>
        <div class="ai-body">${esc(text)}</div>
        <p class="src-note">KI-generiert auf Basis von Titel und Kurztext. Prüfe Wesentliches im
        <a href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">Original</a>.</p>
      </div>`
  } catch (err) {
    slot.innerHTML = `<div class="detail">
        <h4>KI-Einordnung fehlgeschlagen</h4>
        <p class="warn small">${esc(err.message)}</p>
        ${ruleBasedDetail(item)}
      </div>`
  }
}

function toggleDetail(card, item) {
  const slot = card.querySelector('.detail-slot')
  if (slot.innerHTML) { slot.innerHTML = ''; return }
  if (settings.apiKey) aiDetail(item, slot)
  else slot.innerHTML = `<div class="detail">${ruleBasedDetail(item)}</div>`
}

// ------------------------------------------------------------------ Wetter

const WMO = {
  0: ['☀️', 'Klar'], 1: ['🌤', 'Überwiegend klar'], 2: ['⛅️', 'Teils bewölkt'], 3: ['☁️', 'Bedeckt'],
  45: ['🌫', 'Nebel'], 48: ['🌫', 'Reifnebel'],
  51: ['🌦', 'Leichter Sprühregen'], 53: ['🌦', 'Sprühregen'], 55: ['🌧', 'Dichter Sprühregen'],
  56: ['🌧', 'Gefrierender Sprühregen'], 57: ['🌧', 'Gefrierender Sprühregen'],
  61: ['🌦', 'Leichter Regen'], 63: ['🌧', 'Regen'], 65: ['🌧', 'Starker Regen'],
  66: ['🌧', 'Gefrierender Regen'], 67: ['🌧', 'Gefrierender Regen'],
  71: ['🌨', 'Leichter Schneefall'], 73: ['🌨', 'Schneefall'], 75: ['❄️', 'Starker Schneefall'],
  77: ['🌨', 'Schneegriesel'],
  80: ['🌦', 'Leichte Schauer'], 81: ['🌧', 'Schauer'], 82: ['⛈', 'Heftige Schauer'],
  85: ['🌨', 'Schneeschauer'], 86: ['🌨', 'Starke Schneeschauer'],
  95: ['⛈', 'Gewitter'], 96: ['⛈', 'Gewitter mit Hagel'], 99: ['⛈', 'Schweres Gewitter mit Hagel'],
}
const wmo = c => WMO[c] || ['🌡', 'Unbekannt']

const FALLBACK_POS = { lat: 48.3456, lon: 16.3331, name: 'Korneuburg' }

function getPosition() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 15 * 60 * 1000 },
    )
  })
}

async function placeName(lat, lon) {
  try {
    // Auf zwei Nachkommastellen gerundet: rund einen Kilometer genau. Das
    // genügt für "Korneuburg, Niederösterreich" — die volle Auflösung wäre
    // hausgenau und geht einen Geodatenanbieter nichts an.
    const g = n => Number(n).toFixed(2)
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${g(lat)}&longitude=${g(lon)}&localityLanguage=de`)
    const j = await r.json()
    return [j.city || j.locality, j.principalSubdivision].filter(Boolean).join(', ') || null
  } catch { return null }
}

async function loadWeather({ force = false } = {}) {
  if (state.weather && !force) return
  const pos = await getPosition()
  const p = pos || FALLBACK_POS
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}`
      + `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m`
      + `&hourly=temperature_2m,weather_code,precipitation_probability`
      + `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset`
      + `&forecast_days=5&forecast_hours=12&timezone=auto`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    state.weather = await res.json()
    state.weatherPlace = pos
      ? (await placeName(p.lat, p.lon)) || `${p.lat.toFixed(2)}, ${p.lon.toFixed(2)}`
      : `${FALLBACK_POS.name} (Standort nicht freigegeben)`
  } catch (err) {
    state.weather = null
    state.weatherError = err.message
  }
}

async function renderWeather({ force = false } = {}) {
  const el = $('#weather')
  if (!state.weather || force) {
    el.innerHTML = `<div class="skeleton" style="height:200px"></div><div class="skeleton" style="height:90px"></div>`
    await loadWeather({ force })
    render()
  }
  if (!state.weather) {
    el.innerHTML = `<div class="card-lite"><h3>Wetter nicht verfügbar</h3>
      <p class="muted small">${esc(state.weatherError || '')}</p>
      <div class="row"><button class="btn btn-ghost" data-act="wx-retry">Erneut versuchen</button></div></div>`
    return
  }
  paintWeather(el)
}

function paintWeather(el) {
  const w = state.weather
  const c = w.current
  const [icon, desc] = wmo(c.weather_code)
  const now = new Date()

  const hourIdx = w.hourly.time.findIndex(t => new Date(t) > now)
  const hours = (hourIdx < 0 ? [] : w.hourly.time.slice(hourIdx, hourIdx + 8)).map((t, k) => {
    const i = hourIdx + k
    const [hi] = wmo(w.hourly.weather_code[i])
    return `<div class="wx-hour">
      <div class="h">${new Date(t).getHours()}:00</div>
      <div class="i">${hi}</div>
      <div class="t">${Math.round(w.hourly.temperature_2m[i])}°</div>
      <div class="p">${w.hourly.precipitation_probability[i] ?? 0}%</div>
    </div>`
  }).join('')

  const days = w.daily.time.map((t, i) => {
    const [di, dd] = wmo(w.daily.weather_code[i])
    const d = new Date(t)
    const label = i === 0 ? 'Heute' : i === 1 ? 'Morgen'
      : d.toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'numeric' })
    return `<div class="wx-day">
      <div class="d">${esc(label)}</div>
      <div class="i" title="${esc(dd)}">${di}</div>
      <div class="p">${w.daily.precipitation_probability_max[i] ?? 0} % Regen</div>
      <div class="t">${Math.round(w.daily.temperature_2m_max[i])}° <span class="min">${Math.round(w.daily.temperature_2m_min[i])}°</span></div>
    </div>`
  }).join('')

  const sunrise = new Date(w.daily.sunrise[0]).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })
  const sunset = new Date(w.daily.sunset[0]).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })

  el.innerHTML = `
    ${state.warnings.length ? `<div class="wx-warn">⚠ ${state.warnings.map(w2 => esc(w2.text)).join('<br>⚠ ')}</div>` : ''}
    <div class="wx-now">
      <div class="wx-place">📍 ${esc(state.weatherPlace || '')}</div>
      <div class="wx-icon">${icon}</div>
      <div class="wx-temp">${Math.round(c.temperature_2m)}°</div>
      <div class="wx-desc">${esc(desc)}</div>
      <div class="wx-sub">
        Gefühlt ${Math.round(c.apparent_temperature)}° · ${c.relative_humidity_2m}&nbsp;% Luftfeuchte ·
        ${Math.round(c.wind_speed_10m)}&nbsp;km/h Wind<br>
        ☀ ${sunrise} &nbsp;·&nbsp; 🌙 ${sunset}
      </div>
    </div>
    ${hours ? `<div class="wx-hours">${hours}</div>` : ''}
    <div class="wx-days">${days}</div>
    <div class="wx-actions">
      <button class="btn btn-ghost" data-act="wx-retry">↻ Standort neu bestimmen</button>
    </div>
    <p class="muted small" style="text-align:center">Wetter: Open-Meteo · Warnungen: GeoSphere Austria · Ort: BigDataCloud</p>`
}

// --------------------------------------------------------- Einstellungs-UI

const AI_EXPLAIN = `
<p class="small">Der Knopf <b>💡 Einordnung</b> hat zwei Ausbaustufen.</p>
<p class="small"><b>Ohne Schlüssel</b> siehst du eine regelbasierte Analyse der <i>Quellenlage</i>:
Wie verlässlich ist die Redaktion, berichten mehrere unabhängige Häuser dasselbe, wie alt ist die
Meldung, wurde sie maschinell übersetzt. Das sagt nichts über den Inhalt — nur darüber, wie gut
die Meldung abgesichert ist.</p>
<p class="small"><b>Mit Schlüssel</b> liest Claude Titel und Kurztext und schreibt dir vier Absätze:
<i>Worum geht es</i> (rein faktisch), <i>Warum relevant</i> (konkrete Auswirkungen),
<i>Einzuordnen</i> (was unsicher oder umstritten ist) und <i>Vorsicht</i> (welche Behauptung du
ohne Zweitquelle nicht übernehmen solltest). Bei übersetzten Meldungen bekommt Claude das
Original, nicht die Übersetzung.</p>
<p class="small warn">Wichtig: Claude sieht nur Titel und Kurztext, nicht den ganzen Artikel.
Die Einordnung ersetzt das Lesen des Originals nicht.</p>
<details class="howto">
  <summary>So bekommst du einen Anthropic-API-Key</summary>
  <ol class="small">
    <li>Auf <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer">console.anthropic.com</a>
        mit E-Mail registrieren.</li>
    <li>Links auf <b>Billing</b> und ein Guthaben aufladen — 5 $ sind das Minimum und reichen
        für Monate. Ohne Guthaben liefert der Schlüssel nur Fehler.</li>
    <li>Unter <b>Limits</b> ein monatliches Ausgabenlimit setzen, z. B. 5 $. Das ist die
        Bremse, falls etwas schiefgeht.</li>
    <li>Links auf <b>API Keys</b> → <b>Create Key</b>, Namen vergeben (z. B. „Faktum“).</li>
    <li>Den Schlüssel <b>sofort kopieren</b> — er wird nur einmal angezeigt — und unten einfügen.</li>
  </ol>
  <p class="small muted">Kosten: eine Einordnung liegt im Bereich von deutlich unter einem Cent.
  Selbst bei zwanzig Einordnungen am Tag bleibst du unter 1 € im Monat.</p>
</details>
<p class="muted small warn">⚠ Der Schlüssel liegt im Speicher deines Browsers und geht direkt an
api.anthropic.com. Das ist bequem, aber kein Tresor — setze das Ausgabenlimit.</p>
`

const GENRE_LISTE = [
  { id: 'theater', label: 'Theater', icon: '🎭' },
  { id: 'musical', label: 'Musical', icon: '🎤' },
  { id: 'klassik', label: 'Klassik & Oper', icon: '🎻' },
  { id: 'konzert', label: 'Konzert', icon: '🎵' },
  { id: 'familie', label: 'Familie & Kinder', icon: '👨‍👩‍👧' },
]

/** Termin-Sparten dieses Profils. Jedes Profil entscheidet für sich. */
function renderGenres() {
  const gewaehlt = settings.eventGenres || []
  $('#genre-list').innerHTML = GENRE_LISTE.map(g => `
    <button class="genre-chip ${gewaehlt.includes(g.id) ? 'on' : ''}" data-genre="${g.id}">
      ${g.icon} ${esc(g.label)}
    </button>`).join('')
}

function renderProfiles() {
  $('#profile-list').innerHTML = profiles.map(p => `
    <button class="profile-chip ${p.id === activeProfile ? 'on' : ''}" data-profile="${esc(p.id)}">
      <span>${esc(p.emoji || '👤')}</span> ${esc(p.name)}
    </button>`).join('')
}

function openSheet() {
  $('#ai-explain').innerHTML = AI_EXPLAIN
  renderProfiles()
  renderGenres()
  const gemerktGesamt = profiles.reduce((n, p) => {
    try { return n + Object.keys(JSON.parse(localStorage.getItem(`faktum.${p.id}.saved.v1`) || '{}')).length }
    catch { return n }
  }, 0)
  $('#backup-info').textContent =
    `${profiles.length} Profil(e), ${gemerktGesamt} gemerkte Meldungen insgesamt.`
  renderLearnSummary()
  renderSourceReport()
  renderStorageInfo()
  $('#opt-hide-read').checked = settings.hideRead
  $('#opt-hide-lowfact').checked = settings.hideLowFact
  $('#opt-images').checked = settings.images
  $('#opt-info').checked = settings.info
  $('#opt-apikey').value = settings.apiKey || ''
  $('#sheet').hidden = false
}

function renderStorageInfo() {
  const bytes = Object.values(LS).reduce((n, k) => n + (localStorage.getItem(k)?.length || 0), 0)
  $('#storage-info').innerHTML =
    `${Object.keys(saved).length} gemerkt · ${Object.keys(readMap).length} gelesen · `
    + `${history.length} Einträge in der Historie · ${(bytes / 1024).toFixed(0)} KB belegt`
    + `<br><b>App-Fassung ${esc(APP_VERSION)}</b>`
    + ` · Build ${esc(buildStempel(state.data?.generated))} Wiener Zeit`
}

function renderLearnSummary() {
  const n = Object.keys(prefs.votes).length
  const up = Object.values(prefs.votes).filter(v => v.v === 1).length
  $('#learn-summary').textContent = n === 0
    ? 'Noch keine Bewertungen. Tippe bei den Meldungen auf 👍 oder 👎 — „Für dich“ richtet sich danach.'
    : `${n} Bewertungen (${up}× relevant, ${n - up}× eher nicht). Das Lernprofil wächst weiter, auch wenn die Meldungen selbst nach 3 Tagen gelöscht werden.`

  const top = (arr, min) => arr.filter(([, v]) => Math.abs(v) >= min)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 12)

  const html = []
  const focus = top(Object.entries(prefs.focus), 0.5)
  const srcs = top(Object.entries(prefs.sources), 0.7)
  const kws = top(Object.entries(prefs.keywords), 1.3)

  if (focus.length) {
    html.push(`<p class="muted small" style="margin:10px 0 0">Fokusthemen</p><div class="tag-list">${
      focus.map(([k, v]) => `<span class="tag ${v > 0 ? 'pos' : 'neg'}">${esc(k)}</span>`).join('')}</div>`)
  }
  if (srcs.length) {
    html.push(`<p class="muted small" style="margin:10px 0 0">Quellen</p><div class="tag-list">${
      srcs.map(([k, v]) => `<span class="tag ${v > 0 ? 'pos' : 'neg'}">${esc(k)} ${v > 0 ? '+' : ''}${v.toFixed(1)}</span>`).join('')}</div>`)
  }
  if (kws.length) {
    html.push(`<p class="muted small" style="margin:10px 0 0">Themen</p><div class="tag-list">${
      kws.map(([k, v]) => `<span class="tag ${v > 0 ? 'pos' : 'neg'}">${esc(k)}</span>`).join('')}</div>`)
  }
  $('#learn-top').innerHTML = html.join('')
}

function renderSourceReport() {
  const rep = state.data?.sourceReport || []
  const problems = rep.filter(r => !r.ok || r.stale).length
  $('#source-report').innerHTML =
    (problems
      ? `<p class="muted small warn" style="margin:0 0 6px">${problems} von ${rep.length} Quellen mit Problemen.</p>`
      : `<p class="muted small" style="margin:0 0 6px">Alle ${rep.length} Quellen liefern aktuell.</p>`)
    + (rep.map(r => {
      const status = !r.ok ? 'nicht erreichbar' : r.stale ? 'veraltet' : `${r.items} Meldungen`
      return `<div class="${!r.ok || r.stale ? 'bad' : ''}"><span>${esc(r.source)}</span><span>${status}</span></div>`
    }).join('') || '<div class="muted">Kein Bericht verfügbar.</div>')
}

// ------------------------------------------------------------ Themenkontext

/**
 * Hintergrund zu einem laufenden Thema.
 *
 * Zwei Teile: gesicherte, zeitlose Fakten aus einer kuratierten Sammlung —
 * und darunter die jüngsten Meldungen zum selben Thema aus dem eigenen
 * Bestand. Der statische Teil kann nicht veralten, weil er bewusst keinen
 * "aktuellen Stand" behauptet; den liefern die Schlagzeilen darunter.
 */
function openContext(item) {
  const topic = (state.data?.contextTopics || []).find(t => t.id === item.context)
  if (!topic) return

  const verwandt = allItems()
    .filter(i => i.context === topic.id && i.id !== item.id)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 6)

  $('#context-title').textContent = topic.label
  $('#context-body').innerHTML = `
    <section class="card-lite">
      <h3>Hintergrund${topic.since ? ` <span class="pill pill-muted">seit ${esc(topic.since)}</span>` : ''}</h3>
      ${topic.background.map(p => `<p class="small ctx-p">${esc(p)}</p>`).join('')}
      <p class="muted small ctx-note">Gesicherte Eckdaten, bewusst ohne Tagesaktuelles —
      eine feste Zusammenfassung würde sonst veralten. Was gerade passiert, steht unten.</p>
    </section>

    <section class="card-lite">
      <h3>Aktuell dazu in Faktum</h3>
      ${verwandt.length
        ? verwandt.map(i => `
          <a class="hist-row" href="${esc(i.link)}" target="_blank" rel="noopener noreferrer">
            <span class="hist-icon">›</span>
            <span class="hist-text"><b>${esc(i.title)}</b>
              <small class="muted">${esc(i.source)} · ${relTime(i.ts)}</small></span>
          </a>`).join('')
        : '<p class="muted small">Derzeit keine weiteren Meldungen zu diesem Thema.</p>'}
    </section>

    ${settings.apiKey ? `<section class="card-lite">
      <h3>Vertiefen</h3>
      <p class="muted small">Die Einordnung durch Claude an der Meldung selbst geht auf
      den konkreten Vorgang ein — dieser Hintergrund auf das Thema insgesamt.</p>
    </section>` : ''}`

  $('#context').hidden = false
}

/* ------------------------------------------------------- Sicherung
 *
 * Alles, was Faktum über dich weiß, liegt im Speicher des Browsers. Ein
 * App-Update tastet den nicht an — wohl aber "Website-Daten löschen", ein
 * neues Gerät, oder iOS selbst, das den Speicher wenig genutzter Web-Apps
 * irgendwann abräumt.
 *
 * Deshalb eine Sicherung als Datei, die du besitzt: Sie liegt außerhalb des
 * Browsers und übersteht alles davon.
 *
 * Bewusst NICHT enthalten: der Zwischenspeicher der Meldungen. Der wird
 * ohnehin stündlich neu geholt und würde die Datei nur aufblähen.
 */

const SICHERUNG_FORMAT = 1

function sicherungErzeugen() {
  const daten = {}
  for (const p of profiles) {
    const eintrag = {}
    for (const k of PROFILE_KEYS) {
      if (k === 'cache') continue
      const roh = localStorage.getItem(`faktum.${p.id}.${k}.v1`)
      if (roh !== null) { try { eintrag[k] = JSON.parse(roh) } catch { /* überspringen */ } }
    }
    daten[p.id] = eintrag
  }
  return {
    app: 'Faktum',
    format: SICHERUNG_FORMAT,
    appVersion: APP_VERSION,
    erstellt: new Date().toISOString(),
    profiles,
    daten,
  }
}

function sicherungHerunterladen() {
  const sicherung = sicherungErzeugen()
  const text = JSON.stringify(sicherung, null, 2)
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const datum = new Date().toISOString().slice(0, 10)
  const a = document.createElement('a')
  a.href = url
  a.download = `faktum-sicherung-${datum}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)

  const n = Object.values(sicherung.daten).reduce((sum, d) => sum + Object.keys(d.saved || {}).length, 0)
  return { profile: profiles.length, gemerkt: n, groesse: text.length }
}

/** Prüft eine eingelesene Datei, bevor irgendetwas überschrieben wird. */
function sicherungPruefen(roh) {
  let s
  try { s = JSON.parse(roh) } catch { throw new Error('Die Datei ist keine gültige Sicherung (kein JSON).') }
  if (s.app !== 'Faktum') throw new Error('Das ist keine Faktum-Sicherung.')
  if (!Array.isArray(s.profiles) || !s.profiles.length) throw new Error('In der Datei sind keine Profile enthalten.')
  if (!s.daten || typeof s.daten !== 'object') throw new Error('In der Datei fehlen die Profildaten.')
  return s
}

function sicherungEinlesen(s) {
  // Erst schreiben, dann Profilliste setzen — bricht es dazwischen ab,
  // bleibt der alte Zustand gültig statt halb überschrieben.
  for (const p of s.profiles) {
    const d = s.daten[p.id] || {}
    for (const k of PROFILE_KEYS) {
      if (k === 'cache' || d[k] === undefined) continue
      localStorage.setItem(`faktum.${p.id}.${k}.v1`, JSON.stringify(d[k]))
    }
  }
  localStorage.setItem(LS_PROFILES, JSON.stringify(s.profiles))
  localStorage.setItem(LS_ACTIVE, s.profiles[0].id)
}

// ---------------------------------------------------------------- Lightbox

function openLightbox(item) {
  $('#lightbox-img').src = item.image
  $('#lightbox-cap').textContent = `${item.source} — ${item.title}`
  $('#lightbox').hidden = false
  document.body.style.overflow = 'hidden'
}

function closeLightbox() {
  $('#lightbox').hidden = true
  $('#lightbox-img').src = ''
  document.body.style.overflow = ''
}

// ------------------------------------------------------------------ Events

document.addEventListener('click', ev => {
  if (ev.target.closest('[data-lb-close]') || ev.target.id === 'lightbox') { closeLightbox(); return }
  if (ev.target.closest('[data-ctx-close]')) { $('#context').hidden = true; return }

  const tab = ev.target.closest('.tab')
  if (tab) {
    state.tab = tab.dataset.tab
    render()
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }

  const card = ev.target.closest('.card')
  const act = ev.target.closest('[data-act]')?.dataset.act

  if (card && act) {
    const item = findItem(card.dataset.id)
    if (!item) return
    if (act === 'up') {
      vote(item, 1)
      render()
    } else if (act === 'down') {
      vote(item, -1)
      card.style.transition = 'opacity .2s, transform .2s'
      card.style.opacity = '0'
      card.style.transform = 'scale(.97)'
      setTimeout(render, 200)
    } else if (act === 'save') {
      toggleSave(item)
      render()
    } else if (act === 'detail') {
      toggleDetail(card, item)
    } else if (act === 'zoom') {
      openLightbox(item)
    } else if (act === 'context') {
      openContext(item)
    }
    return
  }

  if (act === 'wx-retry') { renderWeather({ force: true }); return }
  if (act === 'verbindung-neu') {
    settings.ortErlaubt = true
    save(LS.settings, settings)
    loadWeather({ force: true }).then(() => { fetchWarnings().then(render); render() })
    return
  }

  if (ev.target.closest('#btn-refresh')) {
    // Rückmeldung geben: Bisher passierte sichtbar nichts, wenn es nichts
    // Neues gab — der Knopf wirkte kaputt.
    const vorher = new Set(allItems().map(i => i.id))
    $('#btn-refresh').classList.add('spin')
    fetchNews({ force: true }).then(() => {
      const neu = allItems().filter(i => !vorher.has(i.id)).length
      const el = document.createElement('div')
      el.className = 'toast'
      el.textContent = neu ? `${neu} neue Beiträge geladen` : 'Keine neuen Beiträge'
      document.body.appendChild(el)
      setTimeout(() => el.remove(), 2600)
    })
    if (settings.ortErlaubt) fetchWarnings().then(render)
    if (state.tab === 'wetter') renderWeather({ force: true })
    return
  }
  if (ev.target.closest('#btn-search')) { toggleSearch(); return }
  if (ev.target.closest('#btn-search-clear')) { toggleSearch(false); return }
  const gchip = ev.target.closest('[data-genre]')
  if (gchip) {
    const id = gchip.dataset.genre
    const liste = new Set(settings.eventGenres || [])
    liste.has(id) ? liste.delete(id) : liste.add(id)
    settings.eventGenres = [...liste]
    save(LS.settings, settings)
    renderGenres()
    render()
    return
  }

  const chip = ev.target.closest('[data-profile]')
  if (chip) { switchProfile(chip.dataset.profile); return }
  if (ev.target.closest('#btn-settings')) { openSheet(); return }
  if (ev.target.closest('[data-close]')) { $('#sheet').hidden = true; return }
})

function toggleSearch(show) {
  const bar = $('#searchbar')
  const open = show === undefined ? bar.hidden : show
  bar.hidden = !open
  if (open) {
    $('#search-input').focus()
  } else {
    $('#search-input').value = ''
    state.search = ''
    render()
  }
}

let searchTimer = null
$('#search-input').addEventListener('input', e => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    state.search = e.target.value.trim()
    render()
  }, 180)
})

/**
 * Schalter binden. Fehlt das Element, wird das gemeldet statt den Start
 * abzubrechen: Ein entfernter Schalter im HTML riss vorher die komplette
 * App mit — keine Tabs, keine Meldungen, kein Hinweis worauf.
 */
const bindToggle = (sel, key) => $(sel)?.addEventListener('change', e => {
  settings[key] = e.target.checked
  save(LS.settings, settings)
  render()
})
bindToggle('#opt-hide-read', 'hideRead')
bindToggle('#opt-hide-lowfact', 'hideLowFact')
bindToggle('#opt-images', 'images')
bindToggle('#opt-info', 'info')

$('#btn-save-key').addEventListener('click', () => {
  settings.apiKey = $('#opt-apikey').value.trim()
  save(LS.settings, settings)
  $('#btn-save-key').textContent = settings.apiKey ? '✓ Gespeichert' : '✓ Entfernt'
  setTimeout(() => { $('#btn-save-key').textContent = 'Speichern' }, 1800)
})
$('#btn-clear-key').addEventListener('click', () => {
  settings.apiKey = ''
  $('#opt-apikey').value = ''
  save(LS.settings, settings)
})
$('#btn-reset-learning').addEventListener('click', () => {
  if (!confirm('Alle gelernten Vorlieben und Bewertungen löschen? Gemerktes bleibt erhalten.')) return
  prefs = defaults.prefs()
  save(LS.prefs, prefs)
  renderLearnSummary()
  render()
})
const EMOJIS = ['👤', '🧑', '👩', '👨', '🧓', '👧', '🐧', '🦊']

$('#btn-profile-new').addEventListener('click', () => {
  const name = prompt('Name für das neue Profil?')?.trim()
  if (!name) return
  const id = 'p' + (Date.now().toString(36))
  profiles.push({ id, name: name.slice(0, 20), emoji: EMOJIS[profiles.length % EMOJIS.length] })
  saveProfiles()
  switchProfile(id)
})

$('#btn-profile-rename').addEventListener('click', () => {
  const p = profiles.find(x => x.id === activeProfile)
  const name = prompt('Neuer Name?', p.name)?.trim()
  if (!name) return
  p.name = name.slice(0, 20)
  saveProfiles()
  renderProfiles()
  renderGenres()
  const gemerktGesamt = profiles.reduce((n, p) => {
    try { return n + Object.keys(JSON.parse(localStorage.getItem(`faktum.${p.id}.saved.v1`) || '{}')).length }
    catch { return n }
  }, 0)
  $('#backup-info').textContent =
    `${profiles.length} Profil(e), ${gemerktGesamt} gemerkte Meldungen insgesamt.`
})

$('#btn-profile-delete').addEventListener('click', () => {
  if (profiles.length < 2) return alert('Das letzte Profil lässt sich nicht löschen.')
  const p = profiles.find(x => x.id === activeProfile)
  if (!confirm(`Profil „${p.name}“ mit allen Bewertungen und Gemerktem löschen?`)) return
  for (const k of PROFILE_KEYS) localStorage.removeItem(`faktum.${activeProfile}.${k}.v1`)
  profiles = profiles.filter(x => x.id !== activeProfile)
  saveProfiles()
  switchProfile(profiles[0].id)
})

$('#btn-backup-export')?.addEventListener('click', () => {
  try {
    const r = sicherungHerunterladen()
    $('#backup-info').textContent =
      `Gesichert: ${r.profile} Profil(e), ${r.gemerkt} gemerkte Meldungen, ${(r.groesse / 1024).toFixed(0)} KB.`
  } catch (err) {
    $('#backup-info').textContent = `Sicherung fehlgeschlagen: ${err.message}`
  }
})

$('#btn-backup-import')?.addEventListener('click', () => $('#backup-file').click())

$('#backup-file')?.addEventListener('change', async e => {
  const datei = e.target.files?.[0]
  if (!datei) return
  e.target.value = ''
  try {
    const s = sicherungPruefen(await datei.text())
    const gemerkt = Object.values(s.daten).reduce((n, d) => n + Object.keys(d.saved || {}).length, 0)
    const wann = new Date(s.erstellt).toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' })
    const frage = `Sicherung vom ${wann}\n\n`
      + `${s.profiles.length} Profil(e): ${s.profiles.map(p => p.name).join(', ')}\n`
      + `${gemerkt} gemerkte Meldungen\n\n`
      + 'Der aktuelle Stand dieser Profile wird dabei überschrieben. Fortfahren?'
    if (!confirm(frage)) return
    sicherungEinlesen(s)
    alert('Sicherung eingelesen. Faktum startet neu.')
    location.reload()
  } catch (err) {
    alert(`Konnte die Sicherung nicht einlesen:\n\n${err.message}`)
  }
})

$('#btn-clear-history').addEventListener('click', () => {
  if (!confirm('Historie und Lesestatus leeren? Gemerktes und das Lernprofil bleiben erhalten.')) return
  history = []
  readMap = {}
  save(LS.history, history)
  save(LS.read, readMap)
  renderStorageInfo()
  render()
})

setInterval(() => fetchNews(), CHECK_INTERVAL_MS)
document.addEventListener('visibilitychange', () => { if (!document.hidden) fetchNews() })
window.addEventListener('online', () => fetchNews({ force: true }))
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Escape') return
  if (!$('#lightbox').hidden) closeLightbox()
  else if (!$('#context').hidden) $('#context').hidden = true
  else if (!$('#sheet').hidden) $('#sheet').hidden = true
  else if (!$('#searchbar').hidden) toggleSearch(false)
})

// ------------------------------------------------------------------- Start

migratePrefs()
purgeOld()
$('#feed').innerHTML = Array.from({ length: 4 }, () => '<div class="skeleton"></div>').join('')
setStatus('Lade Meldungen …')

const cached = load(LS.cache, () => null)
if (cached?.items?.length) { state.data = cached; render() }

fetchNews({ force: true })

// Standort bewusst NICHT beim Start abfragen. Vorher holte die App zweimal
// GPS, bevor eine einzige Meldung gelesen war. Ortsbezogenes lädt erst, wenn
// es gebraucht wird — beim Öffnen von Wetter oder beim Antippen des
// Info-Blocks.
if (settings.ortErlaubt) {
  loadWeather().then(() => { render(); if (state.tab === 'wetter') renderWeather() })
  fetchWarnings().then(render)
}

/* Update-Erkennung.
 *
 * iOS hält installierte Web-Apps hartnäckig fest. Damit eine neue Fassung
 * ankommt, braucht es drei Dinge:
 *   1. updateViaCache:'none' — sonst kommt sw.js selbst aus dem HTTP-Cache
 *      und der Browser bemerkt die Änderung nie.
 *   2. registration.update() bei jedem Start und jedem Zurückwechseln.
 *   3. Beim Wechsel des aktiven Workers einmal neu laden, damit die neue
 *      Fassung sofort greift statt erst beim übernächsten Start.
 */
if ('serviceWorker' in navigator) {
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    location.reload()
  })

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      reg.update()
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) reg.update()
      })
    } catch { /* ohne Service Worker läuft die App auch, nur ohne Offline-Modus */ }
  })
}
