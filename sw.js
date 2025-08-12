const CACHE_NAME = 'habit-tracker-cache-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/base.css',
  '/light.css',
  '/dark.css',
  '/app.js',
  '/pwa.js',
  '/manifest.json',
  // external libs we use via CDN (cache them)
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.5.1/dist/confetti.browser.min.js'
];

// On install, cache app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Remove old caches on activate
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// Fetch handler: cache-first for our assets, fallback to network
self.addEventListener('fetch', event => {
  const req = event.request;
  // For navigation requests serve index.html (SPA)
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then(resp => resp || fetch('/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        // optionally cache fetched responses for same-origin requests
        if (req.url.startsWith(self.location.origin)) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(req, copy);
          });
        }
        return res;
      }).catch(() => {
        // fallback could be a simple Response or offline placeholder
        return new Response('', {status: 503, statusText: 'offline'});
      });
    })
  );
});
