const CACHE = 'wpq-scorecard-v1'
const PRECACHE = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.pathname.startsWith('/api/')) return
  event.respondWith((async () => {
    const cached = await caches.match(req)
    try {
      const res = await fetch(req)
      if (res && res.ok && url.origin === self.location.origin) {
        const copy = res.clone()
        const cache = await caches.open(CACHE)
        await cache.put(req, copy)
      }
      return res
    } catch (err) {
      return cached || (await caches.match('/index.html'))
    }
  })())
})
