// check-it — fünf Wissensfragen pro Tag, hergeleitet aus den aktuellen Meldungen.
//
// Die Fragen prüfen Allgemeinwissen (Natur, Physik, Geschichte, Politik) an
// Themen, die gerade in den Nachrichten vorkommen. Nicht: "Was stand heute in
// der Zeitung" — das wäre ein Gedächtnistest. Sondern der Hintergrund dazu.
//
// Ohne ANTHROPIC_API_KEY entstehen keine Fragen. Der Build läuft trotzdem
// durch, der Reiter bleibt dann leer und sagt auch warum.

import { claudeVerfügbar, claudeSchluessel } from './translate.mjs'

const MODELL = 'claude-sonnet-5'
const FRAGEN_PRO_TAG = 5
const FRAGEN_ERZEUGT = 10   // gestaffelt über die Niveaus, der Client wählt aus

const FELDER = ['Natur', 'Physik', 'Geschichte', 'Politik']

/** Niveau 1..5; kommt aus dem Lernstand des Profils, Vorgabe Mitte. */
function niveauText(n) {
  return [
    'einfach — Schulwissen, das die meisten Erwachsenen parat haben',
    'leicht gehoben — solides Allgemeinwissen',
    'mittel — für einen gut informierten Zeitungsleser',
    'anspruchsvoll — verlangt Zusammenhänge, nicht nur Begriffe',
    'schwer — Detailwissen, wie es Fachinteressierte haben',
  ][Math.max(0, Math.min(4, n - 1))]
}

/**
 * Antwort einlesen. Erwartet ein JSON-Array mit Frage, vier Optionen,
 * Index der richtigen Antwort, Erklärung und Themenfeld.
 */
export function parseFragen(text, erwartet) {
  const roh = String(text || '').trim()
  const a = roh.indexOf('[')
  const b = roh.lastIndexOf(']')
  if (a < 0 || b <= a) throw new Error('kein JSON-Array in der Antwort')
  const liste = JSON.parse(roh.slice(a, b + 1))
  if (!Array.isArray(liste)) throw new Error('Antwort ist kein Array')

  const sauber = liste.filter(f =>
    f && typeof f.frage === 'string' && f.frage.length > 10
    && Array.isArray(f.optionen) && f.optionen.length === 4
    && f.optionen.every(o => typeof o === 'string' && o.length)
    && Number.isInteger(f.richtig) && f.richtig >= 0 && f.richtig < 4
    && typeof f.erklaerung === 'string' && f.erklaerung.length > 10)

  if (!sauber.length) throw new Error('keine verwertbare Frage in der Antwort')
  if (erwartet && sauber.length < erwartet) {
    console.warn(`    check-it: nur ${sauber.length} von ${erwartet} Fragen brauchbar`)
  }
  return sauber.slice(0, erwartet || sauber.length)
}

/** Themen aus den Meldungen, breit gestreut über die Kategorien. */
function themenAuswahl(items) {
  const proKategorie = {}
  for (const it of items) {
    if (!it.title || it.title.length < 25) continue
    ;(proKategorie[it.cat] ||= []).push(it)
  }
  const out = []
  // Reihum aus jeder Kategorie, damit nicht fünf Fragen zu Fußball entstehen.
  const listen = Object.values(proKategorie).map(l => l.slice(0, 6))
  for (let i = 0; i < 6 && out.length < 18; i++) {
    for (const l of listen) if (l[i] && out.length < 18) out.push(l[i])
  }
  return out
}

export async function buildCheckIt(items) {
  if (!claudeVerfügbar()) {
    console.log('  check-it: übersprungen (Secret ANTHROPIC_API_KEY fehlt)')
    return null
  }

  const themen = themenAuswahl(items)
  if (themen.length < 5) {
    console.warn('  check-it: zu wenige Meldungen als Grundlage')
    return null
  }

  const liste = themen.map((t, i) => `${i + 1}. [${t.cat}] ${t.title}`).join('\n')
  const prompt = `Du erstellst ${FRAGEN_ERZEUGT} Wissensfragen für eine deutschsprachige Nachrichten-App.

Diese Themen stehen heute in den Meldungen:
${liste}

Erstelle daraus ${FRAGEN_ERZEUGT} Multiple-Choice-Fragen zum ALLGEMEINWISSEN aus den Feldern ${FELDER.join(', ')}.

Wichtig:
- Gefragt ist der HINTERGRUND, nicht der Inhalt der Meldung. Schlecht: "Wie viele Unternehmen hackte Gemini?" Gut: "Was bezeichnet man in der IT-Sicherheit als Penetrationstest?"
- Die Frage muss ohne Kenntnis der Meldung beantwortbar sein.
- Staffle die Schwierigkeit: je zwei Fragen der Stufen 1 bis 5.
  Stufe 1 = ${niveauText(1)}
  Stufe 3 = ${niveauText(3)}
  Stufe 5 = ${niveauText(5)}
- Streue über verschiedene Felder, nicht fünfmal dasselbe.
- Genau vier Antwortmöglichkeiten, davon genau eine richtig. Die falschen müssen plausibel sein, nicht albern.
- Die Erklärung erläutert in ein bis zwei Sätzen, warum die Antwort stimmt.

Antworte AUSSCHLIESSLICH mit einem JSON-Array dieser Form, ohne Text davor oder danach:
[{"frage":"…","optionen":["…","…","…","…"],"richtig":0,"erklaerung":"…","feld":"Physik","niveau":3,"bezug":3}]

"bezug" ist die Nummer der Meldung aus der Liste oben, auf die sich die Frage bezieht.`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 90000)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': claudeSchluessel(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODELL,
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${(await res.text()).slice(0, 140)}`)
    const json = await res.json()
    const text = (json.content || []).filter(c => c.type === 'text').map(c => c.text).join('')
    const fragen = parseFragen(text, FRAGEN_ERZEUGT)

    // Bezug auf die Meldung auflösen, damit man nachlesen kann.
    for (const f of fragen) {
      const q = themen[(f.bezug || 0) - 1]
      f.quelle = q ? { title: q.title, link: q.link, source: q.source } : null
      delete f.bezug
    }

    // Niveau absichern: fehlt es oder liegt es daneben, gilt die Mitte.
    for (const f of fragen) {
      f.niveau = Number.isInteger(f.niveau) && f.niveau >= 1 && f.niveau <= 5 ? f.niveau : 3
    }
    const verteilung = [1, 2, 3, 4, 5].map(n => fragen.filter(f => f.niveau === n).length)
    console.log(`  check-it: ${fragen.length} Fragen erzeugt, Niveaus ${verteilung.join('/')}`)
    return { erstellt: new Date().toISOString(), proTag: FRAGEN_PRO_TAG, fragen }
  } catch (err) {
    console.warn(`  check-it fehlgeschlagen: ${err.message}`)
    return null
  } finally {
    clearTimeout(timer)
  }
}
