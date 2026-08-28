/* Service Worker: App-Hülle offline verfügbar halten,
 * Nachrichten aber immer zuerst aus dem Netz holen. */

// WICHTIG: Diese Zeichenkette bei jeder Änderung an index.html, app.js oder
// style.css hochzählen. Der activate-Handler löscht alle Caches, die anders
// heißen — bleibt der Name gleich, überlebt der alte Inhalt jedes Update.
// Genau das ist passiert: Version blieb auf v1, das iPhone zeigte tagelang
// die erste Fassung, obwohl der Server längst die neue auslieferte.
const VERSION = 'faktum-v16'
const SHELL = [
  './', './index.html', './style.css', './app.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/apple-touch-icon.png', './icons/favicon-32.png',
]

self.addEventListener('install', ev => {
  ev.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', ev => {
  const req = ev.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // Fremd-Hosts (Bilder, Wetter-API) nie cachen — der Browser regelt das selbst.
  if (url.origin !== self.location.origin) return

  // Icons und Manifest ändern sich praktisch nie -> Cache zuerst.
  if (/\/(icons|manifest)/.test(url.pathname)) {
    ev.respondWith(
      caches.match(req, { ignoreSearch: true })
        .then(hit => hit || fetch(req).then(res => store(req, res))),
    )
    return
  }

  // Alles andere (index.html, app.js, style.css, news.json): erst das Netz,
  // damit App-Updates und neue Meldungen sofort ankommen. Der Cache ist nur
  // das Offline-Netz darunter.
  ev.respondWith(
    fetch(req)
      .then(res => store(req, res))
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then(hit => hit || caches.match('./index.html'))),
  )
})

function store(req, res) {
  if (res.ok) {
    const copy = res.clone()
    caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {})
  }
  return res
}
