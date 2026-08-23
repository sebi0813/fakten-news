#!/usr/bin/env node
// Holt alle kuratierten RSS-Feeds, filtert Meinung/Werbung/Boulevard raus,
// dedupliziert, vergibt einen Faktenscore und schreibt docs/data/news.json.
//
// Läuft serverseitig (GitHub Actions) -> kein CORS-Problem, kein Proxy nötig.
// Keine npm-Abhängigkeiten: nur Node-Builtins.

import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SOURCES, CATEGORIES, LOCAL_TERMS, OPINION_PATTERNS,
  URL_BLOCKLIST, CLICKBAIT_PATTERNS, FOCUS_TOPICS, FLASH_PATTERNS,
  OEBB_FEED, REGION_STATIONS, OEBB_NOISE, OEBB_BAUINFO, OEBB_REGION_LINES,
  REGION_MOTORWAYS, TRAFFIC_EVENT, SCIENCE_FOCUS, CONTEXT_TOPICS,
  EVENT_PAGES, EVENT_DAYS_AHEAD, EVENT_GENRES, EVENT_EXCLUDE,
  SPORT_FOCUS, KI_SIGNIFICANT,
} from './sources.mjs'
import { translateItems, loadCache, saveCache, LANG_NAMES } from './translate.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '../docs/data/news.json')
const CACHE = resolve(__dirname, '../docs/data/i18n-cache.json')

const MAX_AGE_H = { korneuburg: 24 * 7, default: 48 }
const MAX_PER_CATEGORY = 70
const STALE_FEED_DAYS = 7          // ab hier gilt ein Feed als aufgegeben

/**
 * Obergrenze pro Quelle innerhalb einer Kategorie — abhängig davon, wie viele
 * Quellen die Kategorie überhaupt hat. Ein fixer Wert wäre falsch: bei den vier
 * Österreich-Wirtschaftsquellen würde er die Kategorie leerlaufen lassen, bei
 * den 16 Welt-Quellen würde er nicht greifen.
 */
function sourceCap(nSources) {
  return Math.max(10, Math.ceil(MAX_PER_CATEGORY / nSources * 1.8))
}

/**
 * Begrenzt jede Kategorie auf `limit` Meldungen, gewichtet aus Faktenscore
 * und Aktualität, und deckelt zusätzlich pro Quelle — ohne das würden Feeds
 * wie El País (150 Einträge) eine Kategorie allein füllen.
 */
function capPerCategory(items, now, limit) {
  const byCat = {}
  for (const it of items) (byCat[it.cat] ||= []).push(it)

  const out = []
  for (const cat of CATEGORIES) {
    // Österreichische Wirtschaftsmeldungen bekommen beim Auswählen Vorrang,
    // sonst füllen die dreizehn internationalen Quellen die Kategorie fast
    // allein und im Tab stünden oben nur eine Handvoll heimische Meldungen.
    const rank = it => it.fact * 0.35 + freshness(it.ts, now) * 0.65
      + (it.at ? 18 : 0)
      + (it.sciFocus ? 10 : 0)
      + (it.sport === 0 ? 16 : it.sport === 1 ? 8 : 0)
    const cap = sourceCap(SOURCES.filter(s => s.cat === cat.id).length)
    const perSource = {}
    const list = []
    for (const it of (byCat[cat.id] || []).sort((a, b) => rank(b) - rank(a))) {
      perSource[it.source] = (perSource[it.source] || 0) + 1
      if (perSource[it.source] > cap) continue
      list.push(it)
      if (list.length >= limit) break
    }
    out.push(...list)
  }
  return out
}
const FETCH_TIMEOUT_MS = 15000
const UA = 'Mozilla/5.0 (compatible; FaktenNews/1.0; +https://github.com/)'

// ---------------------------------------------------------------- XML-Helfer

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü',
  szlig: 'ß', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç',
  ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
  bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  euro: '€', pound: '£', deg: '°', middot: '·', bull: '•', shy: '',
}

function decodeEntities(s) {
  if (!s) return ''
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => (n in ENTITIES ? ENTITIES[n] : m))
}

function safeChar(code) {
  try { return String.fromCodePoint(code) } catch { return '' }
}

function stripCdata(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
}

function stripTags(s) {
  return s.replace(/<[^>]*>/g, ' ')
}

function clean(s) {
  // Reihenfolge zählt: viele Feeds (derStandard, meinbezirk) liefern HTML
  // entity-escaped, d.h. erst nach dem Decoden sind die Tags als Tags sichtbar.
  const decoded = decodeEntities(stripCdata(s || ''))
  return decodeEntities(stripTags(decoded))
    .replace(/\s+/g, ' ')
    .trim()
}

/** Inhalt des ersten <tag>…</tag> (oder <ns:tag>) im Block. */
function tagContent(block, ...names) {
  for (const name of names) {
    const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')
    const m = block.match(re)
    if (m && m[1].trim()) return m[1]
  }
  return ''
}

/** Attributwert des ersten passenden selbstschließenden/offenen Tags. */
function tagAttr(block, name, attr) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?\\s${attr}\\s*=\\s*["']([^"']+)["']`, 'i')
  const m = block.match(re)
  return m ? decodeEntities(m[1]) : ''
}

function splitItems(xml) {
  const items = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map(m => m[1])
  if (items.length) return items
  return [...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)].map(m => m[1])
}

function extractLink(block) {
  const plain = tagContent(block, 'link')
  const asText = clean(plain)
  if (asText.startsWith('http')) return asText
  // Atom: <link rel="alternate" href="...">
  const alt = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)
  if (alt) return decodeEntities(alt[1])
  const any = block.match(/<link[^>]*href=["']([^"']+)["']/i)
  if (any) return decodeEntities(any[1])
  const guid = clean(tagContent(block, 'guid', 'id'))
  return guid.startsWith('http') ? guid : ''
}

function extractImage(block) {
  const candidates = [
    tagAttr(block, 'media:content', 'url'),
    tagAttr(block, 'media:thumbnail', 'url'),
    tagAttr(block, 'enclosure', 'url'),
    tagAttr(block, 'itunes:image', 'href'),
  ]
  // Bild aus dem HTML der description (z.B. derStandard, meinbezirk).
  // Vorher decodieren — dort steckt das HTML oft entity-escaped drin.
  const html = decodeEntities(stripCdata(tagContent(block, 'content:encoded', 'description', 'summary', 'content')))
  const img = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (img) candidates.push(decodeEntities(img[1]))

  for (const c of candidates) {
    if (!c) continue
    if (!/^https?:\/\//i.test(c)) continue
    if (!/\.(jpe?g|png|webp|avif|gif)(\?|$)/i.test(c) && !/image|img|photo|media/i.test(c)) continue
    if (/\b(1x1|pixel|spacer|blank|logo)\b/i.test(c)) continue
    return c
  }
  return ''
}

function parseDate(block) {
  const raw = clean(tagContent(block, 'pubDate', 'published', 'updated', 'dc:date', 'lastBuildDate'))
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

// ------------------------------------------------------------ Qualitätslogik

function normalizeTitle(t) {
  return t.toLowerCase()
    .replace(/[„“”"'’‘»«]/g, '')
    .replace(/[^a-zA-Z0-9äöüßàéèçñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Wortmenge für Ähnlichkeitsvergleich (Jaccard). */
function titleTokens(t) {
  return new Set(normalizeTitle(t).split(' ').filter(w => w.length > 3))
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const w of a) if (b.has(w)) inter++
  return inter / (a.size + b.size - inter)
}

function isOpinionOrAd(title, link, cats) {
  const hay = `${title} ${cats}`
  if (OPINION_PATTERNS.some(re => re.test(hay))) return true
  const lower = (link || '').toLowerCase()
  if (URL_BLOCKLIST.some(p => lower.includes(p))) return true
  return false
}

function hasLocalRef(text) {
  const lower = text.toLowerCase()
  return LOCAL_TERMS.some(t => lower.includes(t))
}

/**
 * Faktenscore 0..100. Bewertet, wie sehr ein Eintrag einer nüchternen,
 * überprüfbaren Meldung entspricht — nicht den Wahrheitsgehalt selbst.
 */
function factScore(item) {
  let s = 25
  s += { 3: 25, 2: 15, 1: 6 }[item.trust] ?? 6

  const sum = item.summary || ''
  if (sum.length > 80) s += 8
  if (sum.length > 200) s += 6
  if (sum.length < 40) s -= 12                                  // Titel ohne Substanz

  if (item.published) s += 7
  if (item.image) s += 2
  if (/^https:\/\//i.test(item.link)) s += 3

  const t = item.title
  if (CLICKBAIT_PATTERNS.some(re => re.test(t))) s -= 30
  if (t === t.toUpperCase() && t.length > 12) s -= 12           // NUR GROSSBUCHSTABEN
  if ((t.match(/[!?]/g) || []).length >= 2) s -= 10
  if (t.length < 25) s -= 10

  // Konkrete Zahlen und explizite Zuschreibung sprechen für eine
  // überprüfbare Meldung statt für eine Einordnung.
  if (/\d/.test(t)) s += 3
  if (/\b(laut|nach angaben|zufolge|erklärte|teilte mit|meldet|bestätigte|according to|said|reported|announced)\b/i.test(sum)) s += 8

  return Math.max(0, Math.min(100, s))
}

// Schwellen sind auf die Score-Verteilung oben kalibriert: 87 ist ohne
// Mehrfachbestätigung durch weitere Quellen praktisch das Maximum.
function factLabel(score) {
  if (score >= 78) return 'hoch'
  if (score >= 60) return 'solide'
  return 'prüfen'
}

// ------------------------------------------------------------------- Fetching

async function fetchFeed(src) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(src.url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'application/rss+xml, application/xml, text/xml, */*' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

/** Link-Erreichbarkeit stichprobenartig prüfen (HEAD, kurzer Timeout). */
async function linkAlive(url) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 6000)
  try {
    const res = await fetch(url, {
      method: 'HEAD', signal: ctrl.signal, redirect: 'follow',
      headers: { 'user-agent': UA },
    })
    return res.status < 400 || res.status === 405 || res.status === 403
  } catch {
    return true // im Zweifel behalten — Timeout heißt nicht "tot"
  } finally {
    clearTimeout(timer)
  }
}

function parseFeed(xml, src, now) {
  const out = []
  const maxAgeH = MAX_AGE_H[src.cat] ?? MAX_AGE_H.default
  const cutoff = now - maxAgeH * 3600_000
  let newest = 0                     // jüngster Eintrag, unabhängig von Filtern

  for (const block of splitItems(xml)) {
    const title = clean(tagContent(block, 'title'))
    const link = extractLink(block)
    if (!title || !link) continue

    const cats = [...block.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi)]
      .map(m => clean(m[1])).join(' ')

    if (isOpinionOrAd(title, link, cats)) continue

    let summary = clean(tagContent(block, 'description', 'summary', 'content:encoded', 'content'))
    if (summary.length > 420) summary = summary.slice(0, 417).replace(/\s\S*$/, '') + '…'
    if (normalizeTitle(summary).startsWith(normalizeTitle(title).slice(0, 40))) {
      summary = summary.slice(title.length).replace(/^[\s–—-]+/, '')
    }

    const date = parseDate(block)
    const ts = date ? date.getTime() : now
    if (date && ts > newest && ts <= now + 6 * 3600_000) newest = ts
    if (ts < cutoff) continue
    if (ts > now + 6 * 3600_000) continue   // offensichtlich falsches Datum

    // Kategorie "Korneuburg": Regionalfeeds nur mit echtem Ortsbezug
    if (src.requireLocal && !hasLocalRef(`${title} ${summary} ${link}`)) continue

    const item = {
      id: '',
      title,
      summary,
      link,
      image: extractImage(block),
      source: src.name,
      site: src.site,
      cat: src.cat,
      at: !!src.at,                    // österreichische Wirtschaft steht im Tab oben
      lang: src.lang,
      trust: src.trust,
      published: date ? date.toISOString() : null,
      ts,
      local: hasLocalRef(`${title} ${summary}`),
    }
    item.fact = factScore(item)
    item.factLabel = factLabel(item.fact)
    item.id = hashId(item.link)
    out.push(item)
  }
  return { items: out, newest }
}

function hashId(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

function canonicalUrl(u) {
  try {
    const url = new URL(u)
    url.hash = ''
    for (const k of [...url.searchParams.keys()]) {
      if (/^(utm_|ref|fbclid|gclid|at_|cmp|ito|CMP)/i.test(k)) url.searchParams.delete(k)
    }
    return url.origin + url.pathname.replace(/\/+$/, '') + (url.search || '')
  } catch { return u }
}

/**
 * Zusammenführen doppelter Meldungen.
 *
 * Läuft zweimal: einmal vor der Übersetzung (fängt Dubletten innerhalb einer
 * Sprache) und einmal danach. Der zweite Durchlauf ist der wichtigere — erst
 * wenn alle Titel deutsch sind, lässt sich erkennen, dass Le Monde, NOS und
 * ORF dieselbe Meldung bringen. Vorher stehen sie in drei Sprachen da und
 * haben kein einziges Wort gemeinsam.
 *
 * @param crossCategory  im zweiten Durchlauf true: dieselbe Meldung steht oft
 *                       in "Welt" und "Wirtschaft international" gleichzeitig.
 * @param threshold      Ähnlichkeit der Titelwörter (Jaccard), ab der zwei
 *                       Meldungen als dieselbe gelten.
 */
function dedupe(items, { crossCategory = false, threshold = 0.62, perCategory = null } = {}) {
  const byUrl = new Map()
  for (const it of items) {
    const key = canonicalUrl(it.link)
    const prev = byUrl.get(key)
    if (!prev || it.fact > prev.fact) byUrl.set(key, it)
  }
  // Vertrauenswürdigste zuerst: die überlebende Meldung soll die von der
  // besseren Quelle sein, nicht zufällig die zuerst eingelesene.
  const list = [...byUrl.values()].sort((a, b) => (b.trust - a.trust) || (b.ts - a.ts))

  const kept = []
  for (const it of list) {
    // Nur der Titel, nicht die Zusammenfassung: zwei Meldungen mit
    // identischem Titel, aber unterschiedlich langem Fließtext rutschten
    // sonst unter die Schwelle. Genau so entkamen Le Monde und Le Figaro
    // mit wortgleicher Überschrift der Erkennung.
    const tokens = titleTokens(it.title)
    const nums = numbersIn(it.title)
    const th = perCategory?.[it.cat] ?? threshold
    let dup = null
    for (const k of kept) {
      if (!crossCategory && k.cat !== it.cat) continue
      if (Math.abs(k.ts - it.ts) > 36 * 3600_000) continue
      const limit = Math.max(th, perCategory?.[k.cat] ?? threshold)
      const sim = jaccard(tokens, k._tokens)
      if (sim >= limit) { dup = k; break }
      // Zwei Meldungen mit denselben markanten Zahlen (Beträge, Opferzahlen,
      // Spielergebnisse) sind fast immer dieselbe — das fängt Paare, die
      // sprachlich weit auseinanderliegen ("Hunt wird Zweiter über 200 m"
      // gegen "Hunt holt Silber über 200 m", Wortähnlichkeit nur 0,23).
      if (sim >= limit - 0.20 && nums.size && setsEqual(nums, k._nums)) { dup = k; break }
    }
    if (dup) {
      dup.also = dup.also || []
      if (!dup.also.some(a => a.source === it.source) && dup.also.length < 4) {
        dup.also.push({ source: it.source, link: it.link })
      }
      // Mehrere unabhängige Quellen berichten dasselbe -> Faktenscore steigt.
      // Der Bonus wird separat gemerkt, weil der Score für übersetzte
      // Meldungen später auf dem deutschen Text neu berechnet wird.
      dup.alsoBonus = (dup.alsoBonus || 0) + 6
      dup.fact = Math.min(100, dup.fact + 6)
      dup.factLabel = factLabel(dup.fact)
      if (!dup.image && it.image) dup.image = it.image
      // Die längere Zusammenfassung ist meist die informativere.
      if ((it.summary || '').length > (dup.summary || '').length + 60) dup.summary = it.summary
      continue
    }
    it._tokens = tokens
    it._nums = nums
    kept.push(it)
  }
  for (const k of kept) { delete k._tokens; delete k._nums }
  return kept
}

/** Markante Zahlen aus einem Titel (ohne Jahreszahlen, die zu häufig sind). */
function numbersIn(title) {
  const out = new Set()
  for (const m of title.matchAll(/\d[\d.,]*/g)) {
    const n = m[0].replace(/[.,]$/, '')
    if (n.length < 2) continue
    if (/^(19|20)\d\d$/.test(n)) continue
    out.add(n)
  }
  return out
}

function setsEqual(a, b) {
  if (!a || !b || a.size !== b.size || a.size === 0) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

// --------------------------------------------------- Fokusthemen und Flash

/** Welche Fokusthemen trifft die Meldung? Siehe FOCUS_TOPICS. */
function detectFocus(item) {
  const title = item.title
  const hay = `${item.title} ${item.summary || ''}`
  const hits = []
  for (const topic of FOCUS_RE) {
    const inTitle = topic.strong.some(re => re.test(title))
    const strong = topic.strong.filter(re => re.test(hay)).length
    const weak = topic.weak.filter(re => re.test(hay)).length
    // Ein starker Treffer im Titel genügt. Steht der Begriff nur im Fließtext,
    // braucht es ein zweites Signal — sonst gilt ein Leseraufruf, in dem
    // "künstliche Intelligenz" beiläufig vorkommt, als KI-Meldung.
    if (!(inTitle || strong >= 2 || (strong >= 1 && weak >= 1) || weak >= 3)) continue
    // KI nur, wenn wirklich etwas passiert ist.
    if (topic.id === 'ki' && !isKiSignificant(item)) continue
    hits.push(topic.id)
  }
  return hits
}

/**
 * Flash-News: schwere Unfälle, Katastrophen, Warnungen.
 * Verlangt ein Ereignis UND (Schwere ODER Regionalbezug), damit nicht jede
 * Meldung mit dem Wort "Warnung" im Flash-Tab landet.
 */
function isFlash(item) {
  const hay = `${item.title} ${item.summary || ''}`
  if (!FLASH_PATTERNS.event.some(re => re.test(hay))) return false
  const severe = FLASH_PATTERNS.severity.some(re => re.test(hay))
  const regional = item.local || item.cat === 'korneuburg' || item.cat === 'oesterreich'
  return severe || regional
}

// ------------------------------------------------------------------ ÖBB-Ticker

/**
 * Baut die ÖBB-Zeilen für das Laufband.
 *
 * Der Feed hat drei Eigenheiten, die alle behandelt werden müssen:
 *  - Die <title>-Elemente sind leer, der Inhalt steckt in <description>.
 *  - Rund ein Drittel sind reine Auslastungshinweise ("Sitzplatzreservierung").
 *  - Dieselbe Störung erscheint einmal pro betroffenem Zug, teils 20-mal.
 */
async function buildOebbTicker(now) {
  let xml
  try {
    xml = await fetchFeed({ url: OEBB_FEED, name: 'ÖBB' })
  } catch (err) {
    console.warn(`  ÖBB-Feed nicht erreichbar: ${err.message}`)
    return []
  }

  const seen = new Set()
  const out = []
  for (const block of splitItems(xml)) {
    const text = clean(tagContent(block, 'description')) || clean(tagContent(block, 'title'))
    if (!text || text.length < 25) continue
    if (OEBB_NOISE.some(re => re.test(text))) continue

    const lower = text.toLowerCase()
    if (!REGION_STATIONS.some(s => lower.includes(s))) continue

    // Entstören: gleiche Meldung für 20 Züge -> eine Zeile.
    const key = lower.replace(/\d/g, '').replace(/\s+/g, ' ').slice(0, 90)
    if (seen.has(key)) continue
    seen.add(key)

    const date = parseDate(block)
    const ts = date ? date.getTime() : now
    if (ts < now - 14 * 86400_000) continue        // abgelaufene Bauarbeiten

    out.push({
      kind: 'oebb',
      text: text.length > 190 ? text.slice(0, 187).replace(/\s\S*$/, '') + '…' : text,
      ts,
    })
    if (out.length >= 8) break
  }
  return out
}

/**
 * Die großen Streckensperren von der offiziellen ÖBB-Baustellenübersicht.
 *
 * Der RSS-Feed enthält sie nicht — er listet einzelne Zugausfälle und hatte
 * für Wien/NÖ zuletzt nur Einträge vom Dezember 2025. Die Sperren, die
 * monatelang gelten (Franz-Josefs-Bahn, Nordbahn, Stammstrecke), stehen nur
 * auf der HTML-Seite. Deren Linktexte enthalten Strecke und Zeitraum
 * vollständig, deshalb genügt es, die Links einzusammeln.
 */
async function buildOebbClosures() {
  let html
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 20000)
    const res = await fetch(OEBB_BAUINFO, {
      signal: ctrl.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15'
          + ' (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        'accept-language': 'de-AT,de;q=0.9',
      },
    })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    html = await res.text()
  } catch (err) {
    console.warn(`  ÖBB-Baustellenübersicht nicht erreichbar: ${err.message}`)
    return []
  }

  const links = [...html.matchAll(/<a[^>]+href="([^"]*baustelleninformation\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map(m => [m[1], clean(m[2])])
    .filter(([, t]) => t.length > 10)

  const seen = new Set()
  const out = []
  for (const [href, title] of links) {
    if (seen.has(title)) continue
    seen.add(title)
    const lower = title.toLowerCase()
    if (!OEBB_REGION_LINES.some(l => lower.includes(l))) continue
    out.push({
      kind: 'oebb',
      text: title,
      link: href.startsWith('http') ? href : `https://www.oebb.at${href}`,
      ts: Date.now(),
    })
  }

  if (!links.length) {
    console.warn('  ⚠ Keine Links auf der ÖBB-Baustellenseite gefunden — Seitenaufbau geändert?')
  }
  return out
}

/**
 * Autobahnmeldungen für den Ticker.
 *
 * ASFINAG beantwortet automatisierte Abrufe mit HTTP 403, es gibt also keine
 * Livedaten zur Verkehrslage. Was bleibt: Meldungen aus den bereits
 * vorhandenen Nachrichtenquellen erkennen, die eine der relevanten Strecken
 * nennen UND ein Verkehrsereignis beschreiben.
 */
function trafficTicker(items) {
  const out = []
  for (const it of items) {
    const hay = `${it.title} ${it.summary || ''}`
    if (!REGION_MOTORWAYS.some(re => re.test(hay))) continue
    if (!TRAFFIC_EVENT.some(re => re.test(hay))) continue
    out.push({ kind: 'traffic', text: it.title, link: it.link, ts: it.ts })
    if (out.length >= 4) break
  }
  return out
}

// ---------------------------------------------------------- Veranstaltungen

const EVENT_GENRES_RE = EVENT_GENRES.map(g => ({ ...g, res: g.terms.map(termRegex) }))
const EVENT_EXCLUDE_RE = EVENT_EXCLUDE.map(termRegex)

const MONATE = {
  jänner: 0, januar: 0, februar: 1, märz: 2, maerz: 2, april: 3, mai: 4,
  juni: 5, juli: 6, august: 7, september: 8, oktober: 9, november: 10, dezember: 11,
}

/** "26. August 2026 um 18:30" -> Date. Ohne Jahr wird das laufende genommen. */
function parseGermanDate(s, now) {
  const m = s.match(/(\d{1,2})\.\s*([A-Za-zäöüÄÖÜ]+)\s*(\d{4})?(?:\s*um\s*(\d{1,2}):(\d{2}))?/)
  if (!m) return null
  const monat = MONATE[m[2].toLowerCase()]
  if (monat === undefined) return null
  const jahr = m[3] ? Number(m[3]) : new Date(now).getFullYear()
  const d = new Date(jahr, monat, Number(m[1]), m[4] ? Number(m[4]) : 0, m[5] ? Number(m[5]) : 0)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Termine der nächsten zwei Wochen.
 *
 * Es gibt für Österreich keinen Veranstaltungs-Feed und keine offene
 * Schnittstelle — Wien liefert HTTP 500, data.gv.at 404, die Stadt Korneuburg
 * hat keinen Kalenderexport. meinbezirk.at stellt seine Listen aber in
 * gleichmäßigem HTML dar: eine <ul class="content-card-date-location"> mit
 * Datum, Ort und Gemeinde, gefolgt von der Überschrift.
 */
async function buildEvents(now) {
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15'
    + ' (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
  const cutoff = now + EVENT_DAYS_AHEAD * 86400_000
  const alle = []

  for (const seite of EVENT_PAGES) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 20000)
      const res = await fetch(seite.url, { signal: ctrl.signal, headers: { 'user-agent': UA } })
      clearTimeout(timer)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const html = await res.text()

      const re = /<ul class="content-card-date-location">([\s\S]*?)<\/ul>([\s\S]{0,900}?)<h3[^>]*class="[^"]*content-card-headline[^"]*"[^>]*>([\s\S]*?)<\/h3>/gi
      let n = 0
      for (const m of html.matchAll(re)) {
        const felder = [...m[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
          .map(x => clean(x[1])).filter(Boolean)
        const titel = clean(m[3])
        if (!felder.length || !titel) continue

        const wann = parseGermanDate(felder[0], now)
        if (!wann) continue
        const ts = wann.getTime()
        if (ts < now - 12 * 3600_000 || ts > cutoff) continue

        // Link zur Veranstaltung steckt im Block davor.
        const linkM = m[2].match(/href="(\/[^"]+)"/) || m[0].match(/href="(\/[^"]+)"/)
        // Wortgrenzen statt Teilzeichenketten: Sonst galt das Feuerwehrfest
        // in "Großrußbach" als Klassikkonzert, weil "bach" darin steckt.
        const hay = `${titel} ${felder.join(' ')}`
        const genres = EVENT_GENRES_RE.filter(g => g.res.some(re => re.test(hay))).map(g => g.id)
        const ausgeschlossen = EVENT_EXCLUDE_RE.some(re => re.test(hay))

        alle.push({
          id: hashId(`${titel}|${felder[0]}`),
          title: titel,
          genres,
          fits: genres.length > 0 && !ausgeschlossen,
          when: wann.toISOString(),
          ts,
          venue: felder[1] || '',
          place: felder[2] || felder[1] || seite.region,
          region: seite.region,
          near: seite.near,
          link: linkM ? `https://www.meinbezirk.at${linkM[1]}` : seite.url,
        })
        n++
      }
      console.log(`  ${String(n).padStart(3)}  ${seite.region}`)
    } catch (err) {
      console.warn(`  FEHLER    ${seite.region}: ${err.message}`)
    }
  }

  // Dubletten über mehrere Seiten (Korneuburg und Stockerau überschneiden sich)
  const gesehen = new Set()
  return alle
    .filter(e => { const k = `${e.title}|${e.ts}`; if (gesehen.has(k)) return false; gesehen.add(k); return true })
    .sort((a, b) => a.ts - b.ts)
    .slice(0, 80)
}

// -------------------------------------------------------------- Themenkontext

/**
 * Suchmuster für den Themenkontext, einmalig vorbereitet.
 *
 * Verankert am Wortanfang, nicht als beliebige Teilzeichenkette. Ohne diese
 * Grenze ordnete "De Zerbi" dem Thema Raiffeisen zu, weil "rbi" darin steckt.
 * Am Wortende bleibt es offen, damit "ukraine" auch "ukrainische" trifft.
 */
/**
 * Suchmuster aus einem Stichwort.
 *
 * Kurze Begriffe bis drei Zeichen werden beidseitig auf Wortgrenzen
 * festgenagelt, längere nur am Anfang — damit "ukraine" auch "ukrainische"
 * trifft, "rbi" aber nicht in "De Zerbi" und "ki" nicht in "Kind".
 */
function termRegex(term) {
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(term.length <= 3 ? `\\b${esc}\\b` : `\\b${esc}`, 'i')
}

const CONTEXT_RE = CONTEXT_TOPICS.map(t => ({ id: t.id, res: t.match.map(termRegex) }))

const FOCUS_RE = FOCUS_TOPICS.map(t => ({
  id: t.id,
  strong: t.strong.map(termRegex),
  weak: t.weak.map(termRegex),
}))

/**
 * Passt die Meldung zu einem Thema mit hinterlegtem Hintergrund?
 * Ein einzelner kurzer Treffer genügt nicht — sonst reicht ein beiläufiges
 * "Moskau" oder "Israel", um einen ganzen Kriegshintergrund einzublenden.
 */
function detectContext(item) {
  const hay = `${item.title} ${item.summary || ''}`
  let best = null
  let bestTreffer = 0
  for (const t of CONTEXT_RE) {
    const treffer = t.res.filter(re => re.test(hay)).length
    if (treffer >= 2 && treffer > bestTreffer) { bestTreffer = treffer; best = t.id }
  }
  return best
}

const SPORT_RE = SPORT_FOCUS.map(g => ({ rank: g.rank, res: g.terms.map(termRegex) }))
const KI_SIG_RE = KI_SIGNIFICANT.map(termRegex)

/**
 * Sport-Rang: 0 = Fußball (Österreich, Barcelona, Champions League),
 * 1 = Formel 1 und Tennis, 2 = alles Übrige. Bestimmt die Reihenfolge im Tab.
 */
function sportRank(item) {
  const hay = `${item.title} ${item.summary || ''}`
  for (const g of SPORT_RE) if (g.res.some(re => re.test(hay))) return g.rank
  return 2
}

/**
 * Beschreibt die KI-Meldung ein echtes Modell-Update oder einen Durchbruch?
 * Ohne diese Hürde besteht der Fokus-Tab zu drei Vierteln aus Branchen-
 * geplauder und verdrängt Raiffeisen und Agile Coaching.
 */
function isKiSignificant(item) {
  const hay = `${item.title} ${item.summary || ''}`
  return KI_SIG_RE.some(re => re.test(hay))
}

/** Trifft die Meldung einen der Wissenschafts-Schwerpunkte? */
function isScienceFocus(item) {
  const hay = `${item.title} ${item.summary || ''}`.toLowerCase()
  return SCIENCE_FOCUS.some(t => hay.includes(t))
}

// ----------------------------------------------------------------------- Main

/**
 * Nachts nicht bauen. Der Cron-Auslöser kann keine Zeitzonen, also wird das
 * Fenster hier gegen die echte Wiener Zeit geprüft — inklusive Sommerzeit,
 * um die sich Intl selbst kümmert.
 * Ein manueller Start im Actions-Tab ignoriert das Fenster.
 */
function insideUpdateWindow() {
  if (process.env.FAKTUM_FORCE) return true          // lokal: FAKTUM_FORCE=1 node scripts/build-news.mjs
  if (process.env.GITHUB_EVENT_NAME && process.env.GITHUB_EVENT_NAME !== 'schedule') return true
  const parts = new Intl.DateTimeFormat('de-AT', {
    timeZone: 'Europe/Vienna', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date())
  const h = Number(parts.find(p => p.type === 'hour').value)
  const m = Number(parts.find(p => p.type === 'minute').value)
  const minutes = h * 60 + m
  return minutes >= 5 * 60 + 30 && minutes < 23 * 60
}

async function main() {
  if (!insideUpdateWindow()) {
    const t = new Intl.DateTimeFormat('de-AT', {
      timeZone: 'Europe/Vienna', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date())
    console.log(`Es ist ${t} Uhr in Wien — außerhalb des Fensters 5:30–23:00. Kein Build.`)
    return
  }

  const now = Date.now()
  const report = []
  const all = []

  const results = await Promise.allSettled(SOURCES.map(async src => {
    const xml = await fetchFeed(src)
    return { src, ...parseFeed(xml, src, now) }
  }))

  const stale = []
  results.forEach((r, i) => {
    const src = SOURCES[i]
    if (r.status !== 'fulfilled') {
      report.push({ source: src.name, cat: src.cat, ok: false, error: String(r.reason?.message || r.reason) })
      console.warn(`  FEHLER    ${src.name}: ${r.reason?.message || r.reason}`)
      return
    }
    all.push(...r.value.items)

    // Ein Feed kann HTTP 200 und Dutzende Einträge liefern und trotzdem tot
    // sein — genau so verhielten sich WSJ, Corriere und Gazzetta.
    // Manche Feeds (z.B. Sky Sports) führen gar keine Datumsangaben. Das ist
    // unschön, aber kein Grund zur Warnung — solange Meldungen ankommen.
    const ageDays = r.value.newest ? (now - r.value.newest) / 86400_000 : null
    const isStale = (ageDays !== null && ageDays > STALE_FEED_DAYS) || r.value.items.length === 0
    if (isStale) {
      stale.push(`${src.name} (${ageDays === null ? 'keine Einträge, keine Datumsangaben'
        : Math.round(ageDays) + ' Tage alt'})`)
    }

    report.push({
      source: src.name, cat: src.cat, ok: true,
      items: r.value.items.length,
      ageH: ageDays === null ? null : Math.round(ageDays * 24),
      stale: isStale,
    })
    console.log(`  ${isStale ? 'ALT ' : 'ok  '} ${String(r.value.items.length).padStart(3)}  ${src.name}`)
  })

  if (stale.length) {
    console.warn(`\n⚠  ${stale.length} Feed(s) liefern nichts Aktuelles mehr:`)
    for (const s of stale) console.warn(`     ${s}`)
    console.warn('   -> in scripts/sources.mjs ersetzen.')
  }

  // Quellen mit focusOnly (heise, Golem) sind allgemeine Tech-Feeds. Aus
  // ihnen ist nur interessant, was ein Fokusthema trifft.
  const focusOnlySources = new Set(SOURCES.filter(s => s.focusOnly).map(s => s.name))
  const aiSources = new Set(SOURCES.filter(s => s.ai).map(s => s.name))
  const vorAI = all.length
  let items = all.filter(it => {
    if (focusOnlySources.has(it.source) && detectFocus(it).length === 0) return false
    // KI-Quellen: nur Modell-Updates, Durchbrüche und Entscheidungen mit
    // Tragweite — nicht jede Ankündigung aus der Branche.
    if (aiSources.has(it.source) && !isKiSignificant(it)) return false
    return true
  })
  console.log(`  ${vorAI - items.length} Meldungen als KI-Alltagsrauschen aussortiert`)

  // Durchlauf 1: Dubletten innerhalb einer Sprache, konservative Schwelle.
  items = dedupe(items, { threshold: 0.62 })

  // Vorauswahl pro Kategorie mit Puffer — nach der Übersetzung fällt durch
  // den zweiten Dubletten-Durchlauf noch einiges weg.
  items = capPerCategory(items, now, MAX_PER_CATEGORY + 25)

  // Erst jetzt übersetzen — nach dem Deckeln, sonst würden Hunderte
  // aussortierter Meldungen unnötig durch den Dienst laufen.
  const cache = await loadCache(CACHE)
  const before = Object.keys(cache).length
  console.log(`\nÜbersetzen (Cache: ${before} Einträge) …`)
  const tr = await translateItems(items, cache)
  const { kept, dropped } = await saveCache(CACHE, cache)
  console.log(`  ${tr.applied}/${tr.foreign} fremdsprachige Meldungen übersetzt`
    + ` (${tr.translated} neu, ${tr.failed} fehlgeschlagen)`)
  console.log(`  Cache: ${kept} Einträge, ${dropped} verfallene entfernt`)

  // Die Meinungs- und Prognosefilter liefen bisher gegen den Originaltitel.
  // Ein norwegisches "Ekspertenes spådommer" passiert sie deshalb, obwohl das
  // deutsche "Prognosen der Experten" geblockt würde. Also nach der
  // Übersetzung ein zweites Mal prüfen.
  const beforeFilter = items.length
  items = items.filter(it => !it.translated || !isOpinionOrAd(it.title, it.link, ''))
  const droppedAfterTr = beforeFilter - items.length
  if (droppedAfterTr) console.log(`  ${droppedAfterTr} übersetzte Meldungen nachträglich als Meinung/Prognose aussortiert`)

  for (const it of items) {
    if (!it.translated) continue
    it.fromLang = LANG_NAMES[it.lang] || it.lang.toUpperCase()
    // Faktenscore auf Basis des deutschen Textes korrigieren; reißerische
    // Sprache wird oft erst in der Übersetzung sichtbar.
    it.fact = Math.min(100, factScore(it) + (it.alsoBonus || 0))
    it.factLabel = factLabel(it.fact)
  }

  // Durchlauf 2 der Dublettenerkennung — der eigentlich wirksame. Jetzt sind
  // alle Titel deutsch, also findet er auch Meldungen, die vorher in vier
  // Sprachen nebeneinander standen. Zusätzlich kategorieübergreifend, weil
  // dieselbe Meldung häufig in "Welt" und "Wirtschaft international" landet.
  const beforeDedupe2 = items.length
  items = dedupe(items, {
    crossCategory: true,
    threshold: 0.42,
    // Wissenschafts- und KI-Schlagzeilen teilen sich viel Fachvokabular.
    // Bei 0,45 galten "Klimawandel könnte den Weizenpreis verdreifachen" und
    // "Waldbrandfläche könnte sich verdreifachen" als dieselbe Meldung.
    perCategory: { wissenschaft: 0.60, fokus: 0.60 },
  })
  console.log(`  ${beforeDedupe2 - items.length} sprachübergreifende Dubletten zusammengeführt`)

  // Fokusthemen, Flash-News, Themenkontext und Wissenschafts-Schwerpunkte
  let nFocus = 0, nFlash = 0, nCtx = 0, nSci = 0
  for (const it of items) {
    const f = detectFocus(it)
    if (f.length) { it.focus = f; nFocus++ }
    if (isFlash(it)) { it.flash = true; nFlash++ }
    const ctx = detectContext(it)
    if (ctx) { it.context = ctx; nCtx++ }
    if (it.cat === 'wissenschaft' && isScienceFocus(it)) { it.sciFocus = true; nSci++ }
    if (it.cat === 'sport-int') it.sport = sportRank(it)
  }
  const sportVerteilung = [0, 1, 2].map(r => items.filter(i => i.sport === r).length)
  console.log(`  ${nFocus} Fokusthemen, ${nFlash} Flash-News, ${nCtx} mit Hintergrund,`
    + ` ${nSci} Wissenschaft im Schwerpunkt`)
  console.log(`  Sport: ${sportVerteilung[0]} Fußball, ${sportVerteilung[1]} F1/Tennis,`
    + ` ${sportVerteilung[2]} übrige Sportarten`)

  // Endgültige Begrenzung
  items = capPerCategory(items, now, MAX_PER_CATEGORY)

  // Stichprobe: 12 Links auf Erreichbarkeit prüfen
  const sample = items.filter((_, i) => i % Math.max(1, Math.floor(items.length / 12)) === 0).slice(0, 12)
  const alive = await Promise.all(sample.map(it => linkAlive(it.link)))
  const dead = sample.filter((_, i) => !alive[i]).map(it => it.id)
  for (const it of items) if (dead.includes(it.id)) it.linkWarn = true

  items.sort((a, b) => b.ts - a.ts)

  // Info-Block: Verkehr und Bahn. Das Wetter kommt clientseitig dazu, weil es
  // vom aktuellen Standort abhängt und der beim Bauen nicht bekannt ist.
  console.log('\nInfo-Block …')
  const [closures, oebb] = await Promise.all([buildOebbClosures(), buildOebbTicker(now)])
  const traffic = trafficTicker(items)
  const info = [...traffic, ...closures, ...oebb]
  console.log(`  ${traffic.length} Straße, ${closures.length} Streckensperren, ${oebb.length} Zugmeldungen`)
  for (const c of closures) console.log(`     ${c.text.slice(0, 90)}`)

  console.log('\nVeranstaltungen (nächste 2 Wochen) …')
  const events = await buildEvents(now)
  console.log(`  ${events.length} Termine gesamt`)

  const payload = {
    generated: new Date(now).toISOString(),
    version: 3,
    categories: CATEGORIES,
    focusTopics: FOCUS_TOPICS.map(t => ({ id: t.id, label: t.label, icon: t.icon })),
    contextTopics: CONTEXT_TOPICS.map(t => ({
      id: t.id, label: t.label, since: t.since, background: t.background,
    })),
    counts: Object.fromEntries(CATEGORIES.map(c => [c.id, items.filter(i => i.cat === c.id).length])),
    flashCount: items.filter(i => i.flash).length,
    focusCount: items.filter(i => i.focus).length,
    info,
    events,
    sourceReport: report,
    items,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload), 'utf8')

  console.log(`\n${items.length} Meldungen -> ${OUT}`)
  for (const c of CATEGORIES) console.log(`  ${c.icon} ${c.label}: ${payload.counts[c.id]}`)
  const failed = report.filter(r => !r.ok)
  if (failed.length) console.log(`\n${failed.length}/${SOURCES.length} Quellen nicht erreichbar.`)
  if (items.length === 0) { console.error('Keine Meldungen — Build fehlgeschlagen.'); process.exit(1) }
}

function freshness(ts, now) {
  const h = (now - ts) / 3600_000
  return Math.max(0, 100 - h * 2.2)
}

main().catch(err => { console.error(err); process.exit(1) })
