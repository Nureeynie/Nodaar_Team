// Nodaar Team Hub — Service Worker (PWA)
const CACHE_NAME = 'nodaar-hub-v4.2';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/app.html',
  '/manifest.json',
  '/css/ds.css?v=4.2',
  '/js/ds.core.js?v=4.2',
  '/js/ds.member.js?v=4.2',
  '/js/ds.admin.js?v=4.2',
  '/js/ds.boot.js?v=4.2',
  '/js/supabase-sdk.js',
  '/assets/favicon.png',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/icon_small.png',
  '/assets/apple-touch-icon.png',
  '/assets/logo.png',
  '/assets/logo-wordmark.png',
  '/assets/logo-wordmark-light.png'
];

// Install: precache essential shell assets and activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Some precache assets failed:', err);
      });
    })
  );
});

// Activate: remove old caches cleanly and take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      })
    )).then(() => self.clients.claim())
  );
});

function networkFirst(req, fallbackUrl) {
  return fetch(req, { cache: 'no-cache' })
    .then((res) => {
      if (res && res.status === 200 && res.type === 'basic') {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
      }
      return res;
    })
    .catch(() => caches.match(req).then((hit) => hit || (fallbackUrl ? caches.match(fallbackUrl) : undefined)));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET' || url.protocol.startsWith('ws')) return;
  if (url.hostname.includes('supabase.co') || url.pathname.startsWith('/auth/')) return;
  if (url.origin !== self.location.origin) return;

  // HTML documents: Network-first with offline index fallback
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, '/index.html'));
    return;
  }

  // App shell CSS, JS, and manifest: always Network-first so deploys never mix old JS with new CSS
  if (url.pathname.endsWith('.css') || url.pathname.endsWith('.js') || url.pathname.endsWith('/manifest.json')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Static images/icons: Cache-first with background refresh
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      });
    })
  );
});
