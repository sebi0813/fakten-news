// Fasst Meldungen zusammen, die in mehreren Quellen vorkommen.
//
// Die Dublettenerkennung führt sie bereits zu einem Eintrag zusammen und hebt
// den Faktenscore. Was fehlte: der inhaltliche Gewinn. Verschiedene
// Redaktionen nennen verschiedene Details — die eine die Opferzahl, die
// andere den Hergang, die dritte die Reaktion. Bisher sah man nur eine
// Fassung und musste die anderen einzeln aufklappen.
//
// Zwei Wege, je nachdem was zur Verfügung steht:
//   mit ANTHROPIC_API_KEY -> Claude schreibt einen zusammengeführten Text
//   ohne Schlüssel        -> regelbasiert: die informativste Fassung, ergänzt
//                            um Sätze der anderen, die neue Fakten bringen

import { claudeVerfügbar, claudeSchluessel } from './translate.mjs'

const MODELL = 'claude-haiku-4-5-20251001'
const MIN_FASSUNG = 40          // kürzere Texte tragen nichts bei
const MAX_LAENGE = 900

const sleep = ms => new Promise(r => setTimeout(r, ms))

/** Text in Sätze zerlegen. Bewusst schlicht — es geht um Nachrichtenprosa. */
function saetze(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ„"])/)
    .map(s => s.trim())
    .filter(s => s.length > 25)
}

function woerter(s) {
  return new Set(s.toLowerCase().replace(/[^a-zäöüß0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3))
}

function aehnlich(a, b) {
  const x = woerter(a), y = woerter(b)
  if (!x.size || !y.size) return 0
  let gleich = 0
  for (const w of x) if (y.has(w)) gleich++
  return gleich / Math.min(x.size, y.size)
}

/**
 * Regelbasierte Zusammenführung: längste Fassung als Grundlage, dann Sätze
 * der übrigen Quellen anhängen, die inhaltlich Neues bringen.
 */
export function extraktivZusammenfassen(fassungen) {
  const sortiert = [...fassungen].sort((a, b) => (b.text?.length || 0) - (a.text?.length || 0))
  const genommen = saetze(sortiert[0].text)
  const quellen = new Set([sortiert[0].source])

  for (const f of sortiert.slice(1)) {
    for (const satz of saetze(f.text)) {
      // Nur was zu allem Bisherigen deutlich verschieden ist.
      if (genommen.some(g => aehnlich(g, satz) > 0.45)) continue
      genommen.push(satz)
      quellen.add(f.source)
      if (genommen.join(' ').length > MAX_LAENGE) break
    }
  }
  // Satzzeichen ergänzen, wo die Quelle keines hatte. Ohne das klebten die
  // Fassungen aneinander: "…um die Unabhängigkeit zu wahren Durch den Deal…"
  const text = genommen
    .map(t => (/[.!?…]$/.test(t) ? t : t + '.'))
    .join(' ')
    .slice(0, MAX_LAENGE)
    .trim()
  return { text, quellen: [...quellen] }
}

async function claudeZusammenfassen(titel, fassungen) {
  const key = claudeSchluessel()
  const bloecke = fassungen
    .map(f => `[${f.source}]\n${f.text}`)
    .join('\n\n')

  const prompt = `Mehrere Redaktionen berichten über dieselbe Sache. Fasse ihre Angaben zu EINEM deutschen Text zusammen.

Überschrift: ${titel}

${bloecke}

Regeln:
- 3 bis 5 Sätze, nüchtern und faktisch, auf Deutsch.
- Nimm die Fakten aus ALLEN Fassungen auf: Zahlen, Orte, Namen, Zeitangaben, Ursachen, Reaktionen.
- Erfinde nichts. Was in keiner Fassung steht, kommt nicht vor.
- Widersprechen sich Angaben (etwa Opferzahlen), nenne beide mit ihrer Quelle.
- Keine Einleitung wie "Zusammenfassend" und keine Quellenaufzählung am Ende.
- Antworte ausschließlich mit dem Text selbst.`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 45000)
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
        model: MODELL,
        max_tokens: 700,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${(await res.text()).slice(0, 120)}`)
    const json = await res.json()
    const text = (json.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim()
    if (text.length < 60) throw new Error('Antwort zu kurz')
    return text.slice(0, MAX_LAENGE)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Ergänzt alle mehrfach berichteten Meldungen um einen zusammengeführten Text.
 * Mutiert die Items: setzt `combined` und `combinedBy`.
 */
export async function summarizeMerged(items) {
  const mehrfach = items.filter(i => i.also?.length)
  let perClaude = 0, perRegel = 0, uebersprungen = 0

  for (const it of mehrfach) {
    const fassungen = [{ source: it.source, text: it.summary }, ...it.also.map(a => ({ source: a.source, text: a.summary }))]
      .filter(f => f.text && f.text.length >= MIN_FASSUNG)

    // Nur eine brauchbare Fassung -> nichts zusammenzuführen.
    if (fassungen.length < 2) { uebersprungen++; continue }

    if (claudeVerfügbar()) {
      try {
        it.combined = await claudeZusammenfassen(it.title, fassungen)
        it.combinedBy = 'claude'
        it.combinedSources = fassungen.map(f => f.source)
        perClaude++
        await sleep(300)
        continue
      } catch (err) {
        console.warn(`    Zusammenfassung über Claude fehlgeschlagen: ${err.message}`)
      }
    }

    const { text, quellen } = extraktivZusammenfassen(fassungen)
    // Lohnt nur, wenn dabei wirklich mehr Inhalt entsteht.
    if (text.length > (it.summary || '').length + 60) {
      it.combined = text
      it.combinedBy = 'regel'
      it.combinedSources = quellen
      perRegel++
    } else {
      uebersprungen++
    }
  }

  return { gesamt: mehrfach.length, perClaude, perRegel, uebersprungen }
}
