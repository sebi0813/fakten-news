// Übersetzt fremdsprachige Meldungen ins Deutsche.
//
// Wichtig (im Test bestätigt): Texte MÜSSEN nach Ausgangssprache getrennt
// gebündelt und mit explizitem `sl` übergeben werden. Mischt man Sprachen in
// einem Batch mit `sl=auto`, erkennt der Dienst nur die Mehrheitssprache und
// liefert für die übrigen Texte Halluzinationen — ein japanischer Titel wurde
// so zu "Ich bin mir nicht sicher, was ich tun soll."
//
// Übersetztes wird in docs/data/i18n-cache.json zwischengespeichert und vom
// Workflow mitcommittet. Dadurch wird jeder Text genau einmal übersetzt.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single'
const SEP = '\n\n'                  // im Test verlustfrei durch die Übersetzung getragen
const MAX_BATCH_CHARS = 1400
const MAX_BATCH_ITEMS = 25
const CACHE_TTL_DAYS = 21
const RETRIES = 3

/** Stabiler Schlüssel für den Cache. */
function hash(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  let h2 = 52711
  for (let i = s.length - 1; i >= 0; i--) h2 = ((h2 << 5) + h2 + s.charCodeAt(i)) >>> 0
  return h.toString(36) + h2.toString(36)
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

export async function loadCache(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return {}
  }
}

export async function saveCache(path, cache) {
  const cutoff = Date.now() - CACHE_TTL_DAYS * 86400_000
  const pruned = {}
  let dropped = 0
  for (const [k, v] of Object.entries(cache)) {
    if (v.s >= cutoff) pruned[k] = v
    else dropped++
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(pruned), 'utf8')
  return { kept: Object.keys(pruned).length, dropped }
}

/** Ein Batch gleicher Ausgangssprache an den Dienst schicken. */
async function callService(texts, sl) {
  const q = texts.join(SEP)
  const url = `${ENDPOINT}?client=gtx&sl=${encodeURIComponent(sl)}&tl=de&dt=t&q=${encodeURIComponent(q)}`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; FaktenNews/1.0)' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (!Array.isArray(data?.[0])) throw new Error('unerwartete Antwortstruktur')
    const joined = data[0].map(seg => seg?.[0] ?? '').join('')
    const parts = joined.split(SEP)
    if (parts.length !== texts.length) throw new Error(`Segmente ${parts.length} statt ${texts.length}`)
    return parts.map(p => p.trim())
  } finally {
    clearTimeout(timer)
  }
}

/** Mit Wiederholung; bei Segment-Fehlern einzeln nachziehen. */
async function translateBatch(texts, sl) {
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      return await callService(texts, sl)
    } catch (err) {
      const isSplitError = /Segmente/.test(err.message)
      if (isSplitError && texts.length > 1) {
        // Trenner ist verrutscht -> jeden Text einzeln übersetzen.
        const out = []
        for (const t of texts) {
          try { out.push((await callService([t], sl))[0]) }
          catch { out.push(null) }
          await sleep(120)
        }
        return out
      }
      if (attempt === RETRIES) {
        console.warn(`    Übersetzung ${sl} fehlgeschlagen: ${err.message}`)
        return texts.map(() => null)
      }
      await sleep(500 * attempt)
    }
  }
  return texts.map(() => null)
}

function chunk(texts) {
  const out = []
  let cur = []
  let len = 0
  for (const t of texts) {
    if (cur.length >= MAX_BATCH_ITEMS || (len + t.length > MAX_BATCH_CHARS && cur.length)) {
      out.push(cur); cur = []; len = 0
    }
    cur.push(t); len += t.length + SEP.length
  }
  if (cur.length) out.push(cur)
  return out
}

/**
 * Übersetzt Titel und Zusammenfassung aller nicht-deutschen Meldungen.
 * Mutiert die Items: title/summary werden deutsch, das Original wandert
 * nach origTitle/origSummary.
 */
export async function translateItems(items, cache) {
  const now = Date.now()
  const needed = new Map()   // sl -> Set<text>

  const foreign = items.filter(i => i.lang !== 'de')
  for (const it of foreign) {
    for (const text of [it.title, it.summary]) {
      if (!text) continue
      const key = hash(`${it.lang}|${text}`)
      if (cache[key]) { cache[key].s = now; continue }
      if (!needed.has(it.lang)) needed.set(it.lang, new Set())
      needed.get(it.lang).add(text)
    }
  }

  let translated = 0
  let failed = 0

  for (const [sl, set] of needed) {
    const texts = [...set]
    const batches = chunk(texts)
    console.log(`  ${sl}: ${texts.length} neue Texte in ${batches.length} Batches`)
    for (const batch of batches) {
      const res = await translateBatch(batch, sl)
      res.forEach((out, k) => {
        if (out) {
          cache[hash(`${sl}|${batch[k]}`)] = { t: out, s: now }
          translated++
        } else {
          failed++
        }
      })
      await sleep(200)   // freundlich zum Dienst bleiben
    }
  }

  // Übersetzungen einsetzen
  let applied = 0
  for (const it of foreign) {
    const tTitle = cache[hash(`${it.lang}|${it.title}`)]?.t
    const tSum = it.summary ? cache[hash(`${it.lang}|${it.summary}`)]?.t : null
    if (!tTitle) continue          // ohne Titel keine Übersetzung anzeigen
    it.origTitle = it.title
    it.title = tTitle
    if (tSum) { it.origSummary = it.summary; it.summary = tSum }
    it.translated = true
    applied++
  }

  return { translated, failed, applied, foreign: foreign.length }
}

export const LANG_NAMES = {
  en: 'Englischen', fr: 'Französischen', es: 'Spanischen', it: 'Italienischen',
  nl: 'Niederländischen', sv: 'Schwedischen', no: 'Norwegischen',
  da: 'Dänischen', fi: 'Finnischen', pt: 'Portugiesischen', ja: 'Japanischen',
}
