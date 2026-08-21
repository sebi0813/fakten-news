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
  URL_BLOCKLIST, CLICKBAIT_PATTERNS,
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

function dedupe(items) {
  const byUrl = new Map()
  for (const it of items) {
    const key = canonicalUrl(it.link)
    const prev = byUrl.get(key)
    if (!prev || it.fact > prev.fact) byUrl.set(key, it)
  }
  const list = [...byUrl.values()].sort((a, b) => b.ts - a.ts)

  const kept = []
  for (const it of list) {
    const tokens = titleTokens(it.title)
    let dup = null
    for (const k of kept) {
      if (k.cat !== it.cat) continue
      if (Math.abs(k.ts - it.ts) > 36 * 3600_000) continue
      if (jaccard(tokens, k._tokens) >= 0.62) { dup = k; break }
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
      continue
    }
    it._tokens = tokens
    kept.push(it)
  }
  for (const k of kept) delete k._tokens
  return kept
}

// ----------------------------------------------------------------------- Main

async function main() {
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

  let items = dedupe(all)

  // Pro Kategorie begrenzen, gewichtet aus Faktenscore und Aktualität.
  // Zusätzlich pro Quelle deckeln: ohne das würden Feeds wie El País (150
  // Einträge) oder Gazzetta (125) eine Kategorie allein füllen.
  const byCat = {}
  for (const it of items) (byCat[it.cat] ||= []).push(it)
  items = []
  for (const cat of CATEGORIES) {
    const rank = it => it.fact * 0.35 + freshness(it.ts, now) * 0.65
    const cap = sourceCap(SOURCES.filter(s => s.cat === cat.id).length)
    const perSource = {}
    const list = []
    for (const it of (byCat[cat.id] || []).sort((a, b) => rank(b) - rank(a))) {
      perSource[it.source] = (perSource[it.source] || 0) + 1
      if (perSource[it.source] > cap) continue
      list.push(it)
      if (list.length >= MAX_PER_CATEGORY) break
    }
    items.push(...list)
  }

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

  // Stichprobe: 12 Links auf Erreichbarkeit prüfen
  const sample = items.filter((_, i) => i % Math.max(1, Math.floor(items.length / 12)) === 0).slice(0, 12)
  const alive = await Promise.all(sample.map(it => linkAlive(it.link)))
  const dead = sample.filter((_, i) => !alive[i]).map(it => it.id)
  for (const it of items) if (dead.includes(it.id)) it.linkWarn = true

  items.sort((a, b) => b.ts - a.ts)

  const payload = {
    generated: new Date(now).toISOString(),
    version: 1,
    categories: CATEGORIES,
    counts: Object.fromEntries(CATEGORIES.map(c => [c.id, items.filter(i => i.cat === c.id).length])),
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
