// App-shell service worker (production builds only; see src/main.jsx).
// - Page loads: network first, cached shell only when offline. Cache-first
//   here served a stale index.html after every redeploy, pointing at asset
//   files the new deployment no longer has (blank page).
// - /assets/*: cache first (file names are content-hashed, never change).
// - /api/*: never intercepted.
const CACHE = 'nawi-shell-v4';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest'])));
});

self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
);

const remember = (request, response) => {
  if (response.ok) {
    const copy = response.clone();
    caches.open(CACHE).then((c) => c.put(request, copy));
  }
  return response;
};

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((response) => remember('/', response))
        .catch(() => caches.match('/'))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((response) => remember(e.request, response)))
  );
});
