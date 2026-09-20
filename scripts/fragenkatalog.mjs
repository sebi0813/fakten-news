// Fragenkatalog für check-it.
//
// Die Fragen liegen als Dateien im Repository (docs/data/fragen/*.json) und
// werden hier zu einem einzigen Katalog zusammengefasst und geprüft. Kein
// Sprachmodell zur Laufzeit, kein Schlüssel, keine laufenden Kosten — die
// App holt eine Datei und kommt damit aus.
//
// Warum ein Bauschritt und nicht einfach die Dateien direkt?
// Weil hier geprüft wird: doppelte Kennungen, fehlende Felder, drei statt
// vier Antworten, ein "richtig" außerhalb des Bereichs. Eine kaputte Frage
// soll beim Bauen auffallen und nicht erst auf dem Telefon.

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const QUELLE = resolve(__dirname, '../docs/data/fragen')
const ZIEL = resolve(__dirname, '../docs/data/fragen.json')

const NIVEAUS = [1, 2, 3, 4, 5]

/** Vergleichsform für die Dublettensuche: ohne Satzzeichen, klein, gestrafft. */
function normal(text) {
  return String(text || '').toLowerCase()
    .replace(/[^\wäöüß ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Prüft eine einzelne Frage und meldet den ersten Mangel im Klartext. */
export function pruefeFrage(f) {
  if (!f || typeof f !== 'object') return 'kein Objekt'
  if (typeof f.id !== 'string' || !f.id.trim()) return 'keine Kennung'
  if (typeof f.frage !== 'string' || f.frage.trim().length < 10) return 'Frage fehlt oder zu kurz'
  if (!Array.isArray(f.optionen) || f.optionen.length !== 4) return 'nicht genau vier Antworten'
  if (!f.optionen.every(o => typeof o === 'string' && o.trim())) return 'leere Antwortmöglichkeit'
  if (new Set(f.optionen.map(normal)).size !== 4) return 'zwei gleiche Antwortmöglichkeiten'
  if (!Number.isInteger(f.richtig) || f.richtig < 0 || f.richtig > 3) return 'richtig liegt außerhalb 0..3'
  if (typeof f.erklaerung !== 'string' || f.erklaerung.trim().length < 15) return 'Erklärung fehlt oder zu kurz'
  if (typeof f.feld !== 'string' || !f.feld.trim()) return 'Feld fehlt'
  if (!NIVEAUS.includes(f.niveau)) return 'Niveau nicht 1..5'
  return null
}

/**
 * Alle Teildateien einlesen, prüfen, zusammenführen.
 * Fehlerhafte Fragen fliegen raus und werden benannt — der Bau läuft weiter,
 * damit eine einzelne schiefe Frage nicht die ganze App aufhält.
 */
export async function buildFragenkatalog() {
  let dateien = []
  try {
    dateien = (await readdir(QUELLE)).filter(n => n.endsWith('.json')).sort()
  } catch {
    console.log('  check-it: kein Fragenordner — Katalog bleibt leer')
    return null
  }
  if (!dateien.length) {
    console.log('  check-it: keine Fragendateien gefunden')
    return null
  }

  const fragen = []
  const kennungen = new Set()
  const texte = new Set()
  let verworfen = 0

  for (const name of dateien) {
    let liste
    try {
      liste = JSON.parse(await readFile(resolve(QUELLE, name), 'utf8'))
      if (!Array.isArray(liste)) throw new Error('kein Array')
    } catch (err) {
      console.warn(`    ${name}: nicht lesbar (${err.message}) — übersprungen`)
      continue
    }

    let gut = 0
    for (const f of liste) {
      const mangel = pruefeFrage(f)
      if (mangel) {
        console.warn(`    ${name} [${f?.id || '?'}]: ${mangel}`)
        verworfen++
        continue
      }
      if (kennungen.has(f.id)) {
        console.warn(`    ${name} [${f.id}]: Kennung doppelt`)
        verworfen++
        continue
      }
      const schluessel = normal(f.frage)
      if (texte.has(schluessel)) {
        console.warn(`    ${name} [${f.id}]: Frage steht schon im Katalog`)
        verworfen++
        continue
      }
      kennungen.add(f.id)
      texte.add(schluessel)
      fragen.push({
        id: f.id,
        frage: f.frage.trim(),
        optionen: f.optionen.map(o => o.trim()),
        richtig: f.richtig,
        erklaerung: f.erklaerung.trim(),
        feld: f.feld.trim(),
        niveau: f.niveau,
      })
      gut++
    }
    console.log(`    ${name}: ${gut} Fragen`)
  }

  if (!fragen.length) {
    console.warn('  check-it: keine gültige Frage übrig')
    return null
  }

  const felder = {}
  for (const f of fragen) felder[f.feld] = (felder[f.feld] || 0) + 1
  const proNiveau = NIVEAUS.map(n => fragen.filter(f => f.niveau === n).length)

  // Position der richtigen Antwort. Liegt sie zu oft auf derselben Stelle,
  // lernt man die Position statt der Sache.
  const proPosition = [0, 1, 2, 3].map(i => fragen.filter(f => f.richtig === i).length)

  const katalog = {
    stand: new Date().toISOString(),
    anzahl: fragen.length,
    felder,
    fragen,
  }

  await mkdir(dirname(ZIEL), { recursive: true })
  await writeFile(ZIEL, JSON.stringify(katalog), 'utf8')

  console.log(`  check-it: ${fragen.length} Fragen im Katalog`
    + (verworfen ? `, ${verworfen} verworfen` : ''))
  console.log(`    Felder: ${Object.entries(felder).map(([k, v]) => `${k} ${v}`).join(', ')}`)
  console.log(`    Niveau 1..5: ${proNiveau.join('/')}`)
  console.log(`    richtige Antwort auf Position A/B/C/D: ${proPosition.join('/')}`)

  return { anzahl: fragen.length, stand: katalog.stand, felder }
}
