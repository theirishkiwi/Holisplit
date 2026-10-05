// Holiday Split offline support: the app opens with no signal; trip data syncs when back online.
const CACHE = 'hs-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const put = (req, res) => caches.open(CACHE).then(c => c.put(req, res));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin && url.pathname.startsWith('/api/')) {
    // Photos never change for a given ?v=, so keep them for offline viewing. Trip data always goes to the network.
    if (url.pathname.startsWith('/api/photo/')) {
      e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) put(req, res.clone()); return res; })));
    }
    return;
  }

  // The app page: use the network for the latest version, but fall back to the saved copy after 3s or when offline
  if (req.mode === 'navigate') {
    e.respondWith(new Promise(resolve => {
      let done = false;
      const fallback = () => caches.match('/').then(hit => { if (!done && hit) { done = true; resolve(hit); } });
      const timer = setTimeout(fallback, 3000);
      fetch(req).then(res => {
        clearTimeout(timer);
        if (res.ok) put('/', res.clone());
        if (!done) { done = true; resolve(res); }
      }).catch(() => { clearTimeout(timer); caches.match('/').then(hit => { if (!done) { done = true; resolve(hit || Response.error()); } }); });
    }));
    return;
  }

  // Icons, fonts and other files: answer from the cache, refresh in the background
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
