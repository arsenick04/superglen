// Superglen PWA Service Worker:
// - Never caches version.json (VersionGuard must always see fresh builds).
// - Never caches MP4 cinematics (preserves iOS Safari range requests).
// - Network-first for HTML navigations so deploys take effect immediately, with offline fallback.
// - Cache-first (lazy) for static bundles, 3D models, audio clips, portraits, and icons.
const CACHE = 'superglen-pwa-v1';
const CACHEABLE = /\.(?:js|css|webp|png|jpg|svg|mp3|glb|hdr|woff2?|json|webmanifest)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(['./', './manifest.webmanifest', './img/logo.webp', './icons/icon-192.png']))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/version.json') || url.pathname.endsWith('/sw.js')) return;
  if (url.pathname.endsWith('.mp4')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
          }
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./'))),
    );
    return;
  }

  if (!CACHEABLE.test(url.pathname)) return;
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
        }
        return res;
      });
    }),
  );
});
