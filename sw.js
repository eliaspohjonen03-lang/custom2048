// Service worker: offline-tuki ja päivitykset.
// HUOM: nosta versiota jokaisessa julkaisussa, jotta käyttäjät saavat uudet tiedostot.
const CACHE = '2048-v2';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/main.js',
  './js/logic.js',
  './js/render.js',
  './js/storage.js',
  './js/stats.js',
  './js/profiles.js',
  './js/cropper.js',
  './js/ui.js',
  './js/dom.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  // cache: 'reload' ohittaa selaimen HTTP-välimuistin, jotta saadaan varmasti uusimmat tiedostot.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('2048-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // vieraat originit (linkkikuvat) menevät suoraan verkkoon

  if (req.mode === 'navigate') {
    // Navigoinnit: verkko ensin, varalla välimuisti ja index.html.
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) { const c = await caches.open(CACHE); c.put('./index.html', res.clone()); }
        return res;
      } catch (err) {
        const c = await caches.open(CACHE);
        return (await c.match(req, { ignoreSearch: true })) || (await c.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // Muut saman originin pyynnöt: välimuisti ensin.
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res && res.ok && res.type === 'basic') c.put(req, res.clone());
    return res;
  })());
});
