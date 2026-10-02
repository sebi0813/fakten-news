// Kinotermine für den Reiter "Termine".
//
// Es gibt in Österreich keine offene Kino-Schnittstelle. Geprüft wurden:
// cineplexx.at liefert auf jeden Pfad dieselbe JavaScript-Hülle (5 KB, kein
// Inhalt), kinoprogramm.at ist eine geparkte Verkaufsdomain, und die Feeds
// einzelner Häuser (Filmcasino, Stadtkino) sind Blog-Feeds ohne Spielzeiten.
//
// Falter rendert sein Kinoprogramm dagegen serverseitig und nennt pro Film
// Titel, Genre, Kino und Spielzeit. Angeknüpft wird an Dinge, die Bedeutung
// tragen und deshalb seltener umgebaut werden: der Link auf /kino/<id>/,
// das Attribut data-upscore-title und das <time>-Element. Nicht an die
// Tailwind-Klassen — die wechseln bei jedem Umbau.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15'
  + ' (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

export const KINO_URL = 'https://www.falter.at/kino'

const WOCHENTAGE = {
  montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4,
  freitag: 5, samstag: 6, sonntag: 0,
}

function sauber(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * "Freitag, 17:30 Uhr" auf das nächste Vorkommen dieses Wochentags legen.
 * Fällt die Zeit heute schon hinter uns, gilt die nächste Woche.
 */
export function naechsterTermin(text, jetzt = Date.now()) {
  const m = String(text || '').match(/([A-Za-zäöü]+),?\s*(\d{1,2}):(\d{2})/)
  if (!m) return null
  const ziel = WOCHENTAGE[m[1].toLowerCase()]
  if (ziel === undefined) return null

  const d = new Date(jetzt)
  d.setSeconds(0, 0)
  const vor = (ziel - d.getDay() + 7) % 7
  d.setDate(d.getDate() + vor)
  d.setHours(Number(m[2]), Number(m[3]), 0, 0)
  // Heute, aber die Vorstellung ist durch -> dieselbe Zeit in einer Woche.
  if (d.getTime() < jetzt - 30 * 60_000) d.setDate(d.getDate() + 7)
  return d
}

/** Zerlegt die Programmseite. Getrennt vom Abruf, damit prüfbar. */
export function parseKino(html, jetzt = Date.now()) {
  const anker = [...String(html).matchAll(/href="(https:\/\/www\.falter\.at\/kino\/\d+\/[^"]+)"/g)]
  const out = []
  const gesehen = new Set()

  for (let i = 0; i < anker.length; i++) {
    const von = anker[i].index
    const bis = i + 1 < anker.length ? anker[i + 1].index : Math.min(html.length, von + 4000)
    const block = html.slice(von, bis)

    const titel = sauber((block.match(/data-upscore-title[^>]*>([\s\S]*?)<\/h1>/i) || [])[1])
    const zeitRoh = sauber((block.match(/<time[^>]*>([\s\S]*?)<\/time>/i) || [])[1])
    if (!titel || !zeitRoh) continue

    const wann = naechsterTermin(zeitRoh, jetzt)
    if (!wann) continue

    // Das Kino steht im Block direkt vor der Zeitangabe.
    const vorZeit = block.slice(0, block.search(/<time[^>]*>/i))
    const kino = sauber((vorZeit.match(/<div class="lining-nums[^"]*">([\s\S]*?)<\/div>\s*$/i)
      || vorZeit.match(/<div class="lining-nums[^"]*">([\s\S]*?)<\/div>/i) || [])[1])
    const genre = sauber((block.match(/text-flame-700[^>]*>([\s\S]*?)<\/p>/i) || [])[1])

    const schluessel = `${titel}|${wann.getTime()}`
    if (gesehen.has(schluessel)) continue
    gesehen.add(schluessel)

    out.push({
      title: titel,
      genre: genre && genre.length < 40 ? genre : '',
      venue: kino && kino.length < 60 ? kino : '',
      ts: wann.getTime(),
      when: wann.toISOString(),
      link: anker[i][1],
    })
  }
  return out.sort((a, b) => a.ts - b.ts)
}

export async function buildKino(jetzt = Date.now(), tageVoraus = 14) {
  const grenze = jetzt + tageVoraus * 86400_000
  for (let versuch = 1; versuch <= 3; versuch++) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 20000)
      const res = await fetch(KINO_URL, { signal: ctrl.signal, headers: { 'user-agent': UA } })
      clearTimeout(timer)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const filme = parseKino(await res.text(), jetzt).filter(f => f.ts <= grenze)
      console.log(`  ${String(filme.length).padStart(3)}  Kino (Falter)`)
      return filme
    } catch (err) {
      if (versuch === 3) {
        console.warn(`  FEHLER    Kino: ${err.message}`)
        return []
      }
      await new Promise(r => setTimeout(r, versuch * 2000))
    }
  }
  return []
}
