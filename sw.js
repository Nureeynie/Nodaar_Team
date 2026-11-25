// Nodaar Team Hub — Service Worker (PWA)
const CACHE_NAME = 'nodaar-hub-v3.5';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/app.html',
  '/manifest.json',
  '/css/ds.css',
  '/js/ds.core.js',
  '/js/ds.member.js',
  '/js/ds.admin.js',
  '/js/ds.boot.js',
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

// Install: precache essential shell assets
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

// Activate: clean up outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-first for dynamic & API calls, Stale-while-revalidate for local static assets
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignore non-GET requests and Supabase auth/data websocket calls
  if (req.method !== 'GET' || url.protocol.startsWith('ws')) {
    return;
  }

  // Supabase API or external endpoints: Network first, don't cache auth
  if (url.hostname.includes('supabase.co') || url.pathname.startsWith('/auth/')) {
    return;
  }

  // HTML navigation requests: Network first, fall back to cached index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => {
        return caches.match('/index.html') || caches.match('/');
      })
    );
    return;
  }

  // Static assets (CSS, JS, images, fonts): Stale-While-Revalidate
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      const fetchPromise = fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(req, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
