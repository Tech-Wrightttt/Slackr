const APP_CACHE_NAME = 'slackr-app-v4';
const IMAGE_CACHE_NAME = 'slackr-images-v2';
const DATA_CACHE_NAME = 'slackr-data-v1';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/slackr-logo.svg',
  '/koala-mascot.png',
  '/koala-mascot-light.png',
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
          if (key !== APP_CACHE_NAME && key !== IMAGE_CACHE_NAME && key !== DATA_CACHE_NAME) {
            console.log('[SLACKR SW] Purging legacy cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass Service Worker only for active Vite HMR development server paths
  if (
    url.port === '5173' ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/@') ||
    url.search.includes('t=') ||
    url.pathname.includes('vite') ||
    url.pathname.includes('hot-update')
  ) {
    return;
  }

  // 1. Diagram Screenshots & Exam Assets (/files/*)
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
            const contentType = networkResponse.headers.get('content-type') || '';
            if (contentType.includes('image')) {
              cache.put(event.request, networkResponse.clone());
            }
          }
          return networkResponse;
        } catch (err) {
          // If offline and diagram isn't cached, return clean SVG placeholder
          return new Response(
            `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
              <rect width="400" height="200" fill="#090D16" rx="12"/>
              <text x="200" y="90" fill="#38bdf8" font-family="monospace" font-size="14" font-weight="bold" text-anchor="middle">
                [SLACKR DIAGRAM]
              </text>
              <text x="200" y="120" fill="#94a3b8" font-family="sans-serif" font-size="12" text-anchor="middle">
                Diagram available online or sync in Settings
              </text>
            </svg>`,
            { headers: { 'Content-Type': 'image/svg+xml' } }
          );
        }
      })()
    );
    return;
  }

  // 2. Large Static Questions JSON Dataset (/data/questions_index.json)
  if (url.pathname.includes('questions_index.json')) {
    event.respondWith(
      caches.open(DATA_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) {
          // Background revalidation
          fetch(event.request).then((fresh) => {
            if (fresh && fresh.status === 200) cache.put(event.request, fresh);
          }).catch(() => {});
          return cached;
        }
        return fetch(event.request).then((fresh) => {
          if (fresh && fresh.status === 200) cache.put(event.request, fresh.clone());
          return fresh;
        });
      })
    );
    return;
  }

  // 3. Navigation Requests (SPA Routes e.g. /quiz/year, /analytics, /settings)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2500);
          const networkResponse = await fetch(event.request, { signal: controller.signal });
          clearTimeout(timeoutId);
          return networkResponse;
        } catch (err) {
          const cache = await caches.open(APP_CACHE_NAME);
          const cachedIndex = await cache.match('/index.html');
          if (cachedIndex) return cachedIndex;
          return new Response('SLACKR Offline: Application shell loaded from storage.', { status: 200 });
        }
      })()
    );
    return;
  }

  // 4. General Assets, JavaScript Chunks, CSS, and Fonts (Stale-While-Revalidate)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(APP_CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
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
