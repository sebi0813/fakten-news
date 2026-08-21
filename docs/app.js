/* Fakten — werbefreie, faktenorientierte News-PWA.
 *
 * Die Meldungen kommen aus docs/data/news.json, das stündlich von einer
 * GitHub Action serverseitig gebaut wird (siehe scripts/build-news.mjs).
 * Der Client macht daraus die Darstellung, das Lernprofil und das Wetter.
 */
'use strict'

const DATA_URL = 'data/news.json'
const REFRESH_AFTER_MS = 55 * 60 * 1000      // Daten gelten 55 Min als frisch
const CHECK_INTERVAL_MS = 5 * 60 * 1000

const LS_PREFS = 'fakten.prefs.v1'
const LS_SETTINGS = 'fakten.settings.v1'

const $ = sel => document.querySelector(sel)

const state = {
  data: null,
  tab: 'fuer-dich',
  lastFetch: 0,
  loading: false,
  weather: null,
  weatherPlace: null,
}

// --------------------------------------------------------------- Persistenz

const defaultPrefs = () => ({
  v: 1, sources: {}, cats: {}, keywords: {}, votes: {}, count: 0,
})

const defaultSettings = () => ({
  hideRejected: true, hideLowFact: false, images: true, apiKey: '',
})

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback(), ...JSON.parse(raw) } : fallback()
  } catch { return fallback() }
}

function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* Privatmodus */ }
}

let prefs = load(LS_PREFS, defaultPrefs)
let settings = load(LS_SETTINGS, defaultSettings)

// ------------------------------------------------------------------ Lernen

const STOPWORDS = new Set(`
der die das den dem des ein eine einer eines einem einen und oder aber doch
ist sind war waren wird werden wurde wurden hat haben hatte hatten sein seine
seiner ihres ihre ihrer für mit von vom zum zur auf aus bei nach über unter
vor durch gegen ohne um sich nicht auch noch nur schon mehr sehr wie was wer
wann wo warum als dass wenn weil dann man kann können soll sollen muss müssen
im in an am zu es er sie ich wir ihr sein bin bist seid neue neuen neuer alle
allen beim einigen wieder immer heute jahr jahre jahren prozent millionen
milliarden euro dollar the and for with from that this have has was were are
will would could should about after before into over under more most new news
than then them they their there here what when where which while who why
says said told according reuters afp apa dpa
montag dienstag mittwoch donnerstag freitag samstag sonntag samstags sonntags
jänner januar februar märz april juni juli august september oktober november
dezember morgen gestern abend nacht woche wochen monat monate zuletzt bereits
laut wegen sowie dabei damit dafür danach davon dazu etwa rund knapp mehrere
viele wenige eigenen eigene ersten erste letzten letzte neben seit sondern
zwischen während gegenüber innerhalb außerdem weiterhin erneut jedoch bisher
worden geworden werde wurde wollen wollte lassen ließ geben gegeben stehen
steht kommen kommt gehen geht machen macht sagte sagen sehen sieht bleibt
`.trim().split(/\s+/))

function keywordsOf(item) {
  const text = `${item.title} ${item.summary || ''}`.toLowerCase()
  const words = text
    .replace(/[^a-zäöüß0-9\s-]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && w.length <= 24 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
  return [...new Set(words)].slice(0, 14)
}

const CLAMP = 15
const clamp = n => Math.max(-CLAMP, Math.min(CLAMP, n))

function vote(item, dir) {
  const prev = prefs.votes[item.id] || 0
  if (prev === dir) { unvote(item, dir); return }
  if (prev !== 0) applyWeights(item, -prev)   // alte Bewertung zurückrechnen
  prefs.votes[item.id] = dir
  applyWeights(item, dir)
  prefs.count = Object.keys(prefs.votes).length
  save(LS_PREFS, prefs)
}

function unvote(item, dir) {
  applyWeights(item, -dir)
  delete prefs.votes[item.id]
  prefs.count = Object.keys(prefs.votes).length
  save(LS_PREFS, prefs)
}

function applyWeights(item, dir) {
  prefs.sources[item.source] = clamp((prefs.sources[item.source] || 0) + dir * 1.0)
  prefs.cats[item.cat] = clamp((prefs.cats[item.cat] || 0) + dir * 0.6)
  for (const kw of keywordsOf(item)) {
    prefs.keywords[kw] = clamp((prefs.keywords[kw] || 0) + dir * 0.7)
  }
}

/** Persönlicher Rang: Aktualität + Faktenscore + gelernte Vorlieben. */
function personalScore(item) {
  const hours = (Date.now() - item.ts) / 3600_000
  const fresh = Math.max(0, 100 - hours * 2.2)
  let s = fresh * 0.5 + item.fact * 0.3

  s += (prefs.sources[item.source] || 0) * 2.2
  s += (prefs.cats[item.cat] || 0) * 2.0

  let kwBoost = 0
  for (const kw of keywordsOf(item)) kwBoost += prefs.keywords[kw] || 0
  s += Math.max(-25, Math.min(25, kwBoost * 1.4))

  item._boost = (prefs.sources[item.source] || 0) * 2.2
    + (prefs.cats[item.cat] || 0) * 2.0
    + Math.max(-25, Math.min(25, kwBoost * 1.4))
  return s
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
    state.data = data
    state.lastFetch = Date.now()
    try { localStorage.setItem('fakten.cache', JSON.stringify(data)) } catch { /* zu groß */ }
    render()
    setStatus(`${data.items.length} Meldungen · Stand ${relTime(new Date(data.generated).getTime())}`)
  } catch (err) {
    const cached = tryCache()
    if (cached) {
      state.data = cached
      render()
      setStatus(`Offline — zeige gespeicherten Stand von ${relTime(new Date(cached.generated).getTime())}`, true)
    } else {
      setStatus(`Konnte Meldungen nicht laden: ${err.message}`, true)
      showEmpty('📡', 'Keine Verbindung', 'Sobald du wieder online bist, lädt die App automatisch nach.')
    }
  } finally {
    state.loading = false
    $('#btn-refresh').classList.remove('spin')
  }
}

function tryCache() {
  try {
    const raw = localStorage.getItem('fakten.cache')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function setStatus(text, isErr = false) {
  const el = $('#status')
  el.textContent = text
  el.classList.toggle('err', isErr)
}

// ------------------------------------------------------------------ Ansicht

function visibleItems() {
  if (!state.data) return []
  let items = state.data.items.slice()

  if (settings.hideRejected) items = items.filter(i => prefs.votes[i.id] !== -1)
  if (settings.hideLowFact) items = items.filter(i => i.fact >= 60)

  if (state.tab === 'fuer-dich') {
    const scored = items.map(i => ({ i, s: personalScore(i) })).sort((a, b) => b.s - a.s)
    return diversify(scored)
  }
  return items.filter(i => i.cat === state.tab).sort((a, b) => b.ts - a.ts)
}

/**
 * Verhindert, dass "Für dich" von einer einzigen Quelle oder Kategorie
 * dominiert wird — gerade am Anfang, wenn noch keine Bewertungen vorliegen
 * und allein die Aktualität entscheidet.
 */
function diversify(scored) {
  const out = []
  const pool = scored.slice()
  const recentSrc = []
  const recentCat = []

  while (pool.length) {
    let bestIdx = 0
    let bestVal = -Infinity
    // Nur das obere Feld betrachten — der Rest ist ohnehin zu schwach.
    const window = Math.min(pool.length, 25)
    for (let k = 0; k < window; k++) {
      const { i, s } = pool[k]
      const penalty = recentSrc.filter(x => x === i.source).length * 14
        + recentCat.filter(x => x === i.cat).length * 5
      const val = s - penalty
      if (val > bestVal) { bestVal = val; bestIdx = k }
    }
    const pick = pool.splice(bestIdx, 1)[0]
    out.push(pick.i)
    recentSrc.push(pick.i.source); if (recentSrc.length > 4) recentSrc.shift()
    recentCat.push(pick.i.cat);    if (recentCat.length > 3) recentCat.shift()
  }
  return out
}

function renderTabs() {
  const cats = state.data?.categories || []
  const counts = state.data?.counts || {}
  const tabs = [
    { id: 'fuer-dich', label: 'Für dich', icon: '⭐' },
    ...cats.map(c => ({ ...c, count: counts[c.id] })),
    { id: 'wetter', label: 'Wetter', icon: '🌤' },
  ]
  $('#tabs').innerHTML = tabs.map(t => `
    <button class="tab" role="tab" data-tab="${t.id}" aria-selected="${state.tab === t.id}">
      ${t.icon} ${esc(t.label)}${t.count != null ? `<span class="tab-count">${t.count}</span>` : ''}
    </button>`).join('')
}

function render() {
  renderTabs()
  $('#empty').hidden = true

  if (state.tab === 'wetter') {
    $('#feed').hidden = true
    $('#weather').hidden = false
    renderWeather()
    return
  }

  $('#weather').hidden = true
  $('#feed').hidden = false

  const items = visibleItems()
  if (!items.length) {
    $('#feed').innerHTML = ''
    showEmpty('🗂', 'Nichts hier',
      state.tab === 'korneuburg'
        ? 'Für die Region liegen gerade keine neuen Meldungen vor. Die Quellen werden stündlich geprüft.'
        : 'Alle Meldungen dieser Kategorie sind ausgeblendet oder bewertet.')
    return
  }

  $('#feed').innerHTML = items.map(cardHTML).join('')
}

function showEmpty(icon, title, text) {
  const el = $('#empty')
  el.innerHTML = `<div class="big">${icon}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>`
  el.hidden = false
}

function cardHTML(item) {
  const v = prefs.votes[item.id] || 0
  const showImg = settings.images && item.image
  const matched = state.tab === 'fuer-dich' && item._boost > 6

  return `
  <article class="card ${v === 1 ? 'voted-up' : ''} ${v === -1 ? 'voted-down' : ''}" data-id="${item.id}">
    <div class="card-body">
      <div class="meta">
        <span class="src">${esc(item.source)}</span>
        <span class="dot">·</span>
        <span>${relTime(item.ts)}</span>
        <span class="pill pill-${item.factLabel}">Fakten ${esc(item.factLabel)}</span>
        ${item.translated ? `<span class="pill pill-tr">übersetzt</span>` : ''}
        ${item.also ? `<span class="pill pill-muted">${item.also.length + 1} Quellen</span>` : ''}
        ${item.linkWarn ? `<span class="pill pill-warn">Link prüfen</span>` : ''}
        ${matched ? `<span class="pill pill-match">passt zu dir</span>` : ''}
      </div>
      <div class="card-main">
        <div class="card-text">
          <h2>${esc(item.title)}</h2>
          ${item.summary ? `<p class="sum">${esc(item.summary)}</p>` : ''}
        </div>
        ${showImg ? `<button class="thumb" data-act="zoom" aria-label="Bild vergrößern">
            <img src="${esc(item.image)}" alt="" loading="lazy" decoding="async"
                 onerror="this.closest('.thumb').remove()">
          </button>` : ''}
      </div>
      ${item.also ? `<p class="also">Auch berichtet von ${item.also.map(a =>
          `<a href="${esc(a.link)}" target="_blank" rel="noopener noreferrer">${esc(a.source)}</a>`).join(', ')}</p>` : ''}
    </div>
    <div class="actions">
      <button class="btn btn-yes ${v === 1 ? 'on' : ''}" data-act="up">👍 Relevant</button>
      <button class="btn btn-no ${v === -1 ? 'on' : ''}" data-act="down">👎 Eher nicht</button>
      <a class="btn btn-link" href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">🔗 Original</a>
      <button class="btn" data-act="detail">💡 Einordnung</button>
    </div>
    <div class="detail-slot"></div>
  </article>`
}

function openLightbox(item) {
  const box = $('#lightbox')
  $('#lightbox-img').src = item.image
  $('#lightbox-cap').textContent = `${item.source} — ${item.title}`
  box.hidden = false
  document.body.style.overflow = 'hidden'
}

function closeLightbox() {
  $('#lightbox').hidden = true
  $('#lightbox-img').src = ''
  document.body.style.overflow = ''
}

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

// -------------------------------------------------------------- Einordnung

const TRUST_TEXT = {
  3: 'Öffentlich-rechtlich oder Agentur-Niveau — hohe redaktionelle Prüfdichte.',
  2: 'Etablierte Qualitätsredaktion mit Impressum und Korrekturpraxis.',
  1: 'Regionalquelle — nah dran, aber kleinere Redaktion.',
}

function ruleBasedDetail(item) {
  const bits = []
  bits.push(`<li><b>Quelle:</b> ${esc(item.source)} — ${TRUST_TEXT[item.trust]}</li>`)
  bits.push(`<li><b>Faktenscore ${item.fact}/100 („${esc(item.factLabel)}“):</b> berechnet aus Quellengüte, Länge und Konkretheit des Textes, Zeitstempel, Zuschreibungen („laut …“) und Abzügen für reißerische Sprache.</li>`)
  if (item.also) {
    bits.push(`<li><b>Mehrfach bestätigt:</b> ${item.also.length + 1} unabhängige Redaktionen berichten dasselbe. Das ist das stärkste verfügbare Signal gegen eine Falschmeldung.</li>`)
  } else {
    bits.push(`<li><b>Einzelquelle:</b> bisher berichtet nur ${esc(item.source)}. Bei überraschenden Behauptungen lohnt ein Gegencheck.</li>`)
  }
  if (item.published) {
    bits.push(`<li><b>Veröffentlicht:</b> ${new Date(item.published).toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' })}</li>`)
  }
  if (item.linkWarn) {
    bits.push(`<li class="warn"><b>Hinweis:</b> Der Original-Link antwortete beim letzten Test nicht. Er kann verschoben worden sein.</li>`)
  }
  if (item.translated) {
    bits.push(`<li><b>Maschinell übersetzt</b> aus dem ${esc(item.fromLang)}.
      Originaltitel: <i>„${esc(item.origTitle)}“</i><br>
      <span class="warn">Maschinelle Übersetzung kann die Aussage verdrehen — etwa wer wen
      verklagt oder bestraft. Bei wichtigen Details ins Original schauen.</span></li>`)
  }
  return `
    <h4>Regelbasierte Einordnung</h4>
    <ul>${bits.join('')}</ul>
    <p class="src-note">Das ist eine Bewertung der <i>Quellenlage</i>, keine inhaltliche Prüfung.
    Für eine inhaltliche Einordnung durch Claude hinterlege einen API-Key unter ⚙ Einstellungen.</p>`
}

async function aiDetail(item, slot) {
  const key = settings.apiKey
  slot.innerHTML = `<div class="detail"><h4>Claude analysiert …</h4><div class="skeleton" style="height:60px"></div></div>`

  // Bei übersetzten Meldungen bekommt Claude das Original — maschinelle
  // Übersetzung kann die Aussage verdrehen, und darauf soll die Analyse
  // nicht aufbauen.
  const prompt = `Du bist ein nüchterner Nachrichtenanalyst. Ordne die folgende Meldung ein.

Titel: ${item.origTitle || item.title}
Zusammenfassung: ${item.origSummary || item.summary || '(keine)'}
${item.translated ? `Sprache des Originals: ${item.fromLang}. Antworte trotzdem auf Deutsch.\n` : ''}Quelle: ${item.source} (${item.site})
Veröffentlicht: ${item.published || 'unbekannt'}
${item.also ? `Auch berichtet von: ${item.also.map(a => a.source).join(', ')}` : 'Bisher nur diese eine Quelle.'}

Antworte auf Deutsch, kompakt, in genau diesen vier Abschnitten mit diesen Überschriften:
WORUM GEHT ES: 2 Sätze, rein faktisch.
WARUM RELEVANT: 2 Sätze, konkrete Auswirkungen.
EINZUORDNEN: 1-3 Stichpunkte — was an der Meldung unsicher, umstritten oder noch offen ist.
VORSICHT: 1 Satz — welche Behauptung man ohne Zweitquelle nicht übernehmen sollte. Wenn nichts auffällt, schreibe "Keine Auffälligkeiten in der Quellenlage."

Keine Einleitung, keine Floskeln. Erfinde keine Fakten, die nicht oben stehen.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 700,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`${res.status} — ${body.slice(0, 160)}`)
    }
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
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=de`)
    const j = await r.json()
    return [j.city || j.locality, j.principalSubdivision].filter(Boolean).join(', ') || null
  } catch { return null }
}

async function renderWeather({ force = false } = {}) {
  const el = $('#weather')
  if (state.weather && !force) return paintWeather(el)

  el.innerHTML = `<div class="skeleton" style="height:200px"></div>
                  <div class="skeleton" style="height:90px"></div>`

  const pos = await getPosition()
  const p = pos || FALLBACK_POS
  const usedFallback = !pos

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}`
      + `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m`
      + `&hourly=temperature_2m,weather_code,precipitation_probability`
      + `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset`
      + `&forecast_days=5&forecast_hours=12&timezone=auto`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    state.weather = await res.json()
    state.weatherPlace = usedFallback
      ? `${FALLBACK_POS.name} (Standort nicht freigegeben)`
      : (await placeName(p.lat, p.lon)) || `${p.lat.toFixed(2)}, ${p.lon.toFixed(2)}`
    paintWeather(el)
  } catch (err) {
    el.innerHTML = `<div class="card-lite"><h3>Wetter nicht verfügbar</h3>
      <p class="muted small">${esc(err.message)}</p>
      <div class="row"><button class="btn btn-ghost" data-act="wx-retry">Erneut versuchen</button></div></div>`
  }
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
    <p class="muted small" style="text-align:center">Daten: Open-Meteo · Ort: BigDataCloud · beide ohne Tracking</p>`
}

// --------------------------------------------------------- Einstellungs-UI

function openSheet() {
  renderLearnSummary()
  renderSourceReport()
  $('#opt-hide-rejected').checked = settings.hideRejected
  $('#opt-hide-lowfact').checked = settings.hideLowFact
  $('#opt-images').checked = settings.images
  $('#opt-apikey').value = settings.apiKey || ''
  $('#sheet').hidden = false
}

function renderLearnSummary() {
  const n = Object.keys(prefs.votes).length
  const up = Object.values(prefs.votes).filter(v => v === 1).length
  $('#learn-summary').textContent = n === 0
    ? 'Noch keine Bewertungen. Tippe bei den Meldungen auf 👍 oder 👎 — die Sortierung in „Für dich“ passt sich an.'
    : `${n} Bewertungen (${up}× relevant, ${n - up}× nicht relevant). Die Reihenfolge in „Für dich“ richtet sich danach.`

  const top = (arr, min) => arr.filter(([, v]) => Math.abs(v) >= min)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 12)

  const html = []
  // Themen erst ab dem zweiten Treffer zeigen — ein einzelnes Wort aus einer
  // einzigen Meldung ist noch kein Interesse.
  const kws = top(Object.entries(prefs.keywords), 1.3)
  const srcs = top(Object.entries(prefs.sources), 0.7)
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
      const status = !r.ok ? 'nicht erreichbar'
        : r.stale ? 'veraltet'
        : `${r.items} Meldungen`
      return `<div class="${!r.ok || r.stale ? 'bad' : ''}"><span>${esc(r.source)}</span><span>${status}</span></div>`
    }).join('') || '<div class="muted">Kein Bericht verfügbar.</div>')
}

// ------------------------------------------------------------------ Events

document.addEventListener('click', ev => {
  if (ev.target.closest('[data-lb-close]') || ev.target.id === 'lightbox') { closeLightbox(); return }

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
    const item = state.data.items.find(i => i.id === card.dataset.id)
    if (!item) return
    if (act === 'up' || act === 'down') {
      vote(item, act === 'up' ? 1 : -1)
      if (act === 'down' && settings.hideRejected) {
        card.style.transition = 'opacity .2s, transform .2s'
        card.style.opacity = '0'
        card.style.transform = 'scale(.97)'
        setTimeout(render, 200)
      } else {
        render()
      }
    } else if (act === 'detail') {
      toggleDetail(card, item)
    } else if (act === 'zoom') {
      openLightbox(item)
    }
    return
  }

  if (act === 'wx-retry') { renderWeather({ force: true }); return }

  if (ev.target.closest('#btn-refresh')) { fetchNews({ force: true }); if (state.tab === 'wetter') renderWeather({ force: true }); return }
  if (ev.target.closest('#btn-settings')) { openSheet(); return }
  if (ev.target.closest('[data-close]')) { $('#sheet').hidden = true; return }
})

$('#opt-hide-rejected').addEventListener('change', e => {
  settings.hideRejected = e.target.checked; save(LS_SETTINGS, settings); render()
})
$('#opt-hide-lowfact').addEventListener('change', e => {
  settings.hideLowFact = e.target.checked; save(LS_SETTINGS, settings); render()
})
$('#opt-images').addEventListener('change', e => {
  settings.images = e.target.checked; save(LS_SETTINGS, settings); render()
})
$('#btn-save-key').addEventListener('click', () => {
  settings.apiKey = $('#opt-apikey').value.trim(); save(LS_SETTINGS, settings)
  $('#btn-save-key').textContent = settings.apiKey ? '✓ Gespeichert' : '✓ Entfernt'
  setTimeout(() => { $('#btn-save-key').textContent = 'Speichern' }, 1800)
})
$('#btn-clear-key').addEventListener('click', () => {
  settings.apiKey = ''; $('#opt-apikey').value = ''; save(LS_SETTINGS, settings)
})
$('#btn-reset-learning').addEventListener('click', () => {
  if (!confirm('Alle gelernten Vorlieben und Bewertungen löschen?')) return
  prefs = defaultPrefs(); save(LS_PREFS, prefs); renderLearnSummary(); render()
})

// Stündlich nachladen, solange die App offen ist, und beim Zurückkehren.
setInterval(() => fetchNews(), CHECK_INTERVAL_MS)
document.addEventListener('visibilitychange', () => { if (!document.hidden) fetchNews() })
window.addEventListener('online', () => fetchNews({ force: true }))
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Escape') return
  if (!$('#lightbox').hidden) closeLightbox()
  else if (!$('#sheet').hidden) $('#sheet').hidden = true
})

// ------------------------------------------------------------------- Start

$('#feed').innerHTML = Array.from({ length: 4 }, () => '<div class="skeleton"></div>').join('')
setStatus('Lade Meldungen …')

const cached = tryCache()
if (cached) { state.data = cached; render() }
fetchNews({ force: true })

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}))
}
