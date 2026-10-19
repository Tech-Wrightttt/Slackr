// Cache names must stay in sync with src/services/offlineService.ts (OFFLINE_CACHES)
const APP_CACHE = 'slackr-app-v7';
const DATA_CACHE = 'slackr-data-v3';
const IMAGE_CACHE = 'slackr-images-v2';
const FONT_CACHE = 'slackr-fonts-v1';
const KEEP_CACHES = [APP_CACHE, DATA_CACHE, IMAGE_CACHE, FONT_CACHE];
const LEGACY_IMAGE_CACHES = ['slackr-images-v1'];

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/brand/logo-light.png',
  '/brand/logo-dark.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-192.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-48.png',
  '/image-list.json',
];

const DATA_ASSETS = [
  '/data/metadata_summary.json',
  '/data/questions_index.json',
  '/data/learning_resources.json',
  '/data/analytical_breakdowns.json',
];

// User-editable JSON: prefer the network so edits from other devices show up
const NETWORK_FIRST_DATA = ['/data/learning_resources.json', '/data/analytical_breakdowns.json'];

const NETWORK_TIMEOUT_MS = 3000;

async function cacheEach(cacheName, urls) {
  const cache = await caches.open(cacheName);
  // One missing file must not abort the whole install (cache.addAll is all-or-nothing)
  await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'reload' });
        if (res.ok) await cache.put(url, res);
      } catch (_) {}
    })
  );
}

async function precacheBuildAssets() {
  try {
    const res = await fetch('/asset-manifest.json', { cache: 'no-store' });
    if (!res.ok) return;
    const { assets = [] } = await res.json();
    await cacheEach(APP_CACHE, assets.filter((a) => a !== '/asset-manifest.json'));
  } catch (_) {}
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      cacheEach(APP_CACHE, SHELL_ASSETS),
      cacheEach(DATA_CACHE, DATA_ASSETS),
      precacheBuildAssets(),
    ]).then(() => self.skipWaiting())
  );
});

async function migrateLegacyImages() {
  const target = await caches.open(IMAGE_CACHE);
  for (const legacyName of LEGACY_IMAGE_CACHES) {
    if (!(await caches.has(legacyName))) continue;
    const legacy = await caches.open(legacyName);
    for (const req of await legacy.keys()) {
      if (!(await target.match(req))) {
        const res = await legacy.match(req);
        if (res) await target.put(req, res);
      }
    }
    await caches.delete(legacyName);
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Move diagrams downloaded by older builds instead of throwing them away
      await migrateLegacyImages();
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !KEEP_CACHES.includes(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function fetchWithTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function cacheFirst(request, cacheName, { allowOpaque = false } = {}) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok || (allowOpaque && res.type === 'opaque')) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  if (cached) return cached;
  const res = await network;
  return res || new Response('', { status: 504, statusText: 'Offline' });
}

async function networkFirst(request, cacheName, cacheKey) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
    if (res.ok) cache.put(cacheKey || request, res.clone());
    return res;
  } catch (_) {
    const cached = await cache.match(cacheKey || request, { ignoreSearch: true });
    if (cached) return cached;
    throw _;
  }
}

const OFFLINE_DIAGRAM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
  <rect width="400" height="200" fill="#090D16" rx="12"/>
  <text x="200" y="90" fill="#9ed67c" font-family="monospace" font-size="14" font-weight="bold" text-anchor="middle">[SLACKR DIAGRAM]</text>
  <text x="200" y="120" fill="#94a3b8" font-family="sans-serif" font-size="12" text-anchor="middle">Use "Download offline" to save diagrams</text>
</svg>`;

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Google Fonts + Material Symbols: cache-first. Stylesheet requests are no-cors (opaque),
  // so opaque responses must be allowed or the icon font never works offline.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, FONT_CACHE, { allowOpaque: true }));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Vite dev server / HMR passthrough
  if (
    url.port === '5173' ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/@') ||
    url.pathname.includes('hot-update')
  ) {
    return;
  }

  // Live API is never cached: stale API data would mask real save failures
  if (url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/files/')) {
    event.respondWith(
      cacheFirst(request, IMAGE_CACHE).catch(
        () => new Response(OFFLINE_DIAGRAM_SVG, { headers: { 'Content-Type': 'image/svg+xml' } })
      )
    );
    return;
  }

  if (NETWORK_FIRST_DATA.includes(url.pathname)) {
    event.respondWith(networkFirst(request, DATA_CACHE, url.pathname));
    return;
  }

  if (url.pathname.startsWith('/data/') || url.pathname === '/image-list.json') {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, APP_CACHE, '/index.html').catch(async () => {
        const cache = await caches.open(APP_CACHE);
        return (
          (await cache.match('/index.html')) ||
          (await cache.match('/')) ||
          new Response('SLACKR is offline and the app shell is not cached yet.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          })
        );
      })
    );
    return;
  }

  // Hashed build output never changes: cache-first
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, APP_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, APP_CACHE));
});
