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

// Größere Bündel bedeuten weniger Anfragen. Der Dienst drosselt nach Anzahl
// der Aufrufe, nicht nach Textmenge — 200 kleine Anfragen führten zu HTTP 429,
// wonach der ganze Lauf unübersetzt blieb.
const MAX_BATCH_CHARS = 3000
const MAX_BATCH_ITEMS = 40

const CACHE_TTL_DAYS = 21
const RETRIES = 4
const PAUSE_ZWISCHEN_BATCHES = 600

// Bei Drosselung braucht es Minuten, nicht Millisekunden.
const BACKOFF = [5000, 15000, 45000]

// Sind wir gesperrt, hat es keinen Sinn, den Rest des Laufs weiter anzuklopfen.
let gedrosselt = false

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
    if (res.status === 429 || res.status === 503) {
      const err = new Error(`HTTP ${res.status}`)
      err.gedrosselt = true
      throw err
    }
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
  if (gedrosselt) return texts.map(() => null)

  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await callService(texts, sl)
      return res
    } catch (err) {
      const isSplitError = /Segmente/.test(err.message)
      if (isSplitError && texts.length > 1) {
        // Trenner ist verrutscht -> jeden Text einzeln übersetzen.
        const out = []
        for (const t of texts) {
          try { out.push((await callService([t], sl))[0]) }
          catch { out.push(null) }
          await sleep(200)
        }
        return out
      }

      if (err.gedrosselt) {
        if (attempt === RETRIES) {
          // Weiter anzuklopfen verlängert die Sperre nur. Der Rest des Laufs
          // bleibt unübersetzt; beim nächsten Lauf fehlen diese Texte im
          // Cache und werden erneut versucht.
          gedrosselt = true
          console.warn(`    ${sl}: Dienst drosselt (${err.message}) — Übersetzung für diesen Lauf ausgesetzt.`)
          return texts.map(() => null)
        }
        const warte = BACKOFF[Math.min(attempt - 1, BACKOFF.length - 1)]
        console.warn(`    ${sl}: gedrosselt, warte ${warte / 1000}s (Versuch ${attempt}/${RETRIES})`)
        await sleep(warte)
        continue
      }

      if (attempt === RETRIES) {
        console.warn(`    Übersetzung ${sl} fehlgeschlagen: ${err.message}`)
        return texts.map(() => null)
      }
      await sleep(800 * attempt)
    }
  }
  return texts.map(() => null)
}

// ------------------------------------------------- Rückfallebene: Claude
//
// Der kostenlose Dienst drosselt nach Anzahl der Aufrufe und sperrt dann die
// ganze Adresse für Stunden. Liegt ANTHROPIC_API_KEY in der Umgebung, springt
// Claude für genau die Texte ein, die dort durchgefallen sind. Ohne Schlüssel
// bleibt alles wie bisher — die Meldungen erscheinen dann in der
// Originalsprache und werden im nächsten Lauf erneut versucht.

const CLAUDE_MODELL = 'claude-haiku-4-5-20251001'

export function claudeVerfügbar() {
  return !!process.env.ANTHROPIC_API_KEY
}

/** Antwort von Claude einlesen: erwartet ein JSON-Array gleicher Länge. */
export function parseClaudeAntwort(text, erwartet) {
  const roh = String(text || '').trim()
  const start = roh.indexOf('[')
  const ende = roh.lastIndexOf(']')
  if (start < 0 || ende <= start) throw new Error('kein JSON-Array in der Antwort')
  const liste = JSON.parse(roh.slice(start, ende + 1))
  if (!Array.isArray(liste)) throw new Error('Antwort ist kein Array')
  if (liste.length !== erwartet) throw new Error(`${liste.length} Übersetzungen statt ${erwartet}`)
  return liste.map(x => (typeof x === 'string' ? x.trim() : ''))
}

async function translateWithClaude(texts, sl) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return texts.map(() => null)

  const liste = texts.map((t, i) => `${i + 1}. ${t.replace(/\n/g, ' ')}`).join('\n')
  const prompt = `Übersetze die folgenden ${texts.length} Nachrichten-Textteile aus dem `
    + `${LANG_NAMES[sl] || sl} ins Deutsche.

${liste}

Regeln:
- Antworte AUSSCHLIESSLICH mit einem JSON-Array aus ${texts.length} Zeichenketten, in derselben Reihenfolge.
- Keine Nummerierung, keine Erklärung, kein Text davor oder danach.
- Übersetze wörtlich und nüchtern. Verdrehe niemals, wer etwas tut und wer betroffen ist.
- Eigennamen, Vereins- und Firmennamen bleiben unverändert.
- Ist ein Text bereits deutsch, gib ihn unverändert zurück.`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 60000)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODELL,
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${(await res.text()).slice(0, 120)}`)
    const json = await res.json()
    const text = (json.content || []).filter(c => c.type === 'text').map(c => c.text).join('')
    return parseClaudeAntwort(text, texts.length)
  } catch (err) {
    console.warn(`    Claude-Rückfall ${sl} fehlgeschlagen: ${err.message}`)
    return texts.map(() => null)
  } finally {
    clearTimeout(timer)
  }
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
  gedrosselt = false
  const now = Date.now()
  const needed = new Map()   // sl -> Set<text>

  const foreign = items.filter(i => i.lang !== 'de')

  // Erst ALLE Überschriften, dann die Kurztexte. Bei Drosselung bricht die
  // Übersetzung mittendrin ab — dann sind wenigstens die Titel deutsch und
  // der Feed bleibt überfliegbar. Vorher wechselten sich Titel und Text ab,
  // sodass beides zur Hälfte fehlte.
  const merken = (lang, text) => {
    if (!text) return
    const k = hash(`${lang}|${text}`)
    if (cache[k]) { cache[k].s = now; return }
    if (!needed.has(lang)) needed.set(lang, new Set())
    needed.get(lang).add(text)
  }
  for (const it of foreign) merken(it.lang, it.title)
  for (const it of foreign) merken(it.lang, it.summary)

  let translated = 0
  let failed = 0
  let viaClaude = 0

  for (const [sl, set] of needed) {
    const texts = [...set]
    const batches = chunk(texts)
    console.log(`  ${sl}: ${texts.length} neue Texte in ${batches.length} Batches`)

    const offen = []          // was der kostenlose Dienst nicht geschafft hat
    for (const batch of batches) {
      const res = await translateBatch(batch, sl)
      res.forEach((out, k) => {
        if (out) {
          cache[hash(`${sl}|${batch[k]}`)] = { t: out, s: now }
          translated++
        } else {
          offen.push(batch[k])
        }
      })
      await sleep(PAUSE_ZWISCHEN_BATCHES)
    }

    if (offen.length && claudeVerfügbar()) {
      console.log(`    ${offen.length} Texte an Claude weitergereicht`)
      for (const batch of chunk(offen)) {
        const res = await translateWithClaude(batch, sl)
        res.forEach((out, k) => {
          if (out) {
            cache[hash(`${sl}|${batch[k]}`)] = { t: out, s: now }
            translated++; viaClaude++
          } else {
            failed++
          }
        })
      }
    } else {
      failed += offen.length
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

  return { translated, failed, applied, viaClaude, foreign: foreign.length, gedrosselt }
}

export const LANG_NAMES = {
  en: 'Englischen', fr: 'Französischen', es: 'Spanischen', it: 'Italienischen',
  nl: 'Niederländischen', sv: 'Schwedischen', no: 'Norwegischen',
  da: 'Dänischen', fi: 'Finnischen', pt: 'Portugiesischen', ja: 'Japanischen',
}
