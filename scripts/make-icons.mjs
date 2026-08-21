#!/usr/bin/env node
// Erzeugt die App-Icons als PNG ohne externe Abhängigkeiten.
// Motiv: dunkles Navy, grüner Haken (= geprüft) über drei Textzeilen (= Meldung).

import { writeFile, mkdir } from 'node:fs/promises'
import { deflateSync } from 'node:zlib'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUTDIR = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/icons')

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0                       // Filtertyp "None"
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0   // 8bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Abstand Punkt -> Strecke, für weiche Kanten beim Haken. */
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function draw(size, { maskable = false } = {}) {
  const buf = Buffer.alloc(size * size * 4)
  const s = size / 512                       // alle Maße sind für 512px gedacht
  const inset = maskable ? size * 0.14 : 0   // Sicherheitszone für maskable Icons

  const NAVY_TOP = [17, 27, 46], NAVY_BOT = [9, 14, 26]
  const GREEN = [34, 197, 94]
  const LINE = [148, 163, 184]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      // Hintergrund: vertikaler Verlauf
      const g = y / size
      let r = NAVY_TOP[0] + (NAVY_BOT[0] - NAVY_TOP[0]) * g
      let gg = NAVY_TOP[1] + (NAVY_BOT[1] - NAVY_TOP[1]) * g
      let b = NAVY_TOP[2] + (NAVY_BOT[2] - NAVY_TOP[2]) * g
      let a = 255

      if (!maskable) {
        // abgerundetes Quadrat (iOS maskiert zwar selbst, sieht aber sonst
        // in anderen Kontexten kantig aus)
        const rad = size * 0.22
        const cx = Math.max(rad, Math.min(size - rad, x))
        const cy = Math.max(rad, Math.min(size - rad, y))
        const d = Math.hypot(x - cx, y - cy)
        if (d > rad) a = 0
        else if (d > rad - 1.5) a = Math.round(255 * (rad - d) / 1.5)
      }

      const ux = (x - inset) / (size - 2 * inset) * 512
      const uy = (y - inset) / (size - 2 * inset) * 512

      // drei Textzeilen unten
      const lines = [{ y: 340, w: 300 }, { y: 386, w: 300 }, { y: 432, w: 186 }]
      for (const ln of lines) {
        const h = 24, x0 = 106, x1 = 106 + ln.w
        if (uy > ln.y - h / 2 && uy < ln.y + h / 2 && ux > x0 && ux < x1) {
          const edge = Math.min(uy - (ln.y - h / 2), (ln.y + h / 2) - uy, ux - x0, x1 - ux)
          const t = Math.min(1, edge / 3)
          r += (LINE[0] - r) * t; gg += (LINE[1] - gg) * t; b += (LINE[2] - b) * t
        }
      }

      // Haken
      const w = 40
      const d = Math.min(
        distToSegment(ux, uy, 150, 205, 228, 278),
        distToSegment(ux, uy, 228, 278, 372, 108),
      )
      if (d < w / 2 + 1) {
        const t = Math.min(1, (w / 2 + 1 - d) / 2)
        r += (GREEN[0] - r) * t; gg += (GREEN[1] - gg) * t; b += (GREEN[2] - b) * t
      }

      buf[i] = Math.round(r); buf[i + 1] = Math.round(gg); buf[i + 2] = Math.round(b); buf[i + 3] = a
      void s
    }
  }
  return encodePNG(size, size, buf)
}

await mkdir(OUTDIR, { recursive: true })
const targets = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, { maskable: true }],   // iOS rundet selbst ab
  ['favicon-32.png', 32, {}],
]
for (const [name, size, opts] of targets) {
  await writeFile(resolve(OUTDIR, name), draw(size, opts))
  console.log(`  ${name}  (${size}x${size})`)
}
console.log('Icons erzeugt.')
