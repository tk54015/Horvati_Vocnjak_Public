// Service worker: instalacija aplikacije (PWA) i osnovni rad bez interneta.
// - Vlastite datoteke (HTML, JS, CSS, data/*.json): prvo mreža, bez interneta zadnja spremljena verzija.
// - Leaflet i ostale biblioteke s CDN-a: iz spremnika, osvježe se u pozadini.
// - Supabase (prijava i podaci), karte i prognoza: uvijek samo mreža.
const CACHE = 'hvj-v3b';
const PRECACHE = ['/', '/index.html', '/manifest.webmanifest', '/icons/tree.svg', '/icons/app/icon-192.png', '/icons/app/icon-512.png'];
const CDN = ['unpkg.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('/') : Response.error()))));
    return;
  }
  if (CDN.includes(url.hostname)) {
    e.respondWith(caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; });
      return hit || net;
    }));
  }
});
