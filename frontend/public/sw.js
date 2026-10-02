const APP_CACHE_NAME = 'slackr-app-v3';
const IMAGE_CACHE_NAME = 'slackr-images-v2';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/data/metadata_summary.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== APP_CACHE_NAME && key !== IMAGE_CACHE_NAME) {
            console.log('Purging legacy cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass Service Worker completely for local development, Vite HMR, and unbundled modules
  if (
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.port === '5173' ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/@') ||
    url.search.includes('t=')
  ) {
    return;
  }

  // 1. Diagram Images Cache (/files/*)
  if (url.pathname.startsWith('/files/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(IMAGE_CACHE_NAME);
        const cached = await cache.match(event.request);
        if (cached) {
          return cached;
        }

        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.status === 200) {
            // Only cache if it's a real image
            const contentType = networkResponse.headers.get('content-type') || '';
            if (contentType.includes('image')) {
              cache.put(event.request, networkResponse.clone());
            }
          }
          return networkResponse;
        } catch (err) {
          // If offline and image not cached, return graceful fallback SVG
          return new Response(
            `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
              <rect width="400" height="200" fill="#0f172a" rx="12"/>
              <text x="200" y="100" fill="#94a3b8" font-family="sans-serif" font-size="13" text-anchor="middle">
                Diagram not cached for offline. Connect to internet or sync in Settings.
              </text>
            </svg>`,
            { headers: { 'Content-Type': 'image/svg+xml' } }
          );
        }
      })()
    );
    return;
  }

  // 2. Navigation Requests (SPA Routes e.g. /quiz/year, /analytics)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          const networkResponse = await fetch(event.request, { signal: controller.signal });
          clearTimeout(timeoutId);
          return networkResponse;
        } catch (err) {
          const cache = await caches.open(APP_CACHE_NAME);
          const cachedIndex = await cache.match('/index.html');
          if (cachedIndex) return cachedIndex;
          return new Response('Offline: App shell unavailable', { status: 503 });
        }
      })()
    );
    return;
  }

  // 3. Static assets & API / Data
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(APP_CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(APP_CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      });
    })
  );
});
