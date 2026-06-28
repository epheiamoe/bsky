// Bluesky Client PWA — Service Worker
// SW_COMMIT: __COMMIT_HASH__
const CACHE_NAME = 'bsky-v3';
const IMG_CACHE = 'bsky-img-v1';
const FONT_CACHE = 'bsky-font-v1';

// ── Install: cache static shell ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(['./', './index.html', './manifest.json']).catch(() => {})
    )
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== IMG_CACHE && k !== FONT_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: routing ──
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle standard HTTP(S) requests. Browser extensions, file://, etc.
  // cannot be stored in the Cache API and will throw if we try.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // API requests: network-only (never cache). Chat, notifications, and feed
  // data must always be fresh; caching these can cause stale/empty lists.
  if (
    url.hostname === 'bsky.social' ||
    url.hostname === 'public.api.bsky.app' ||
    url.hostname === 'api.deepseek.com' ||
    url.hostname.includes('api.')
  ) {
    event.respondWith(fetch(request));
    return;
  }

  // Bluesky CDN images: cache-first (content-addressed, immutable)
  if (url.hostname === 'cdn.bsky.app') {
    event.respondWith(cachedMatch(request, IMG_CACHE));
    return;
  }

  // Google Fonts files: cache-first (rarely change)
  if (url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cachedMatch(request, FONT_CACHE));
    return;
  }

  // Google Fonts CSS: stale-while-revalidate
  if (url.hostname === 'fonts.googleapis.com') {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }

  // Vite-built assets (.js, .css) and icons: cache-first (hashed filenames)
  if (url.pathname.includes('/assets/') || url.pathname.includes('/icons/')) {
    event.respondWith(cachedMatch(request, CACHE_NAME));
    return;
  }

  // HTML / root: stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request, CACHE_NAME));
});

// ── Strategies ──

// Cache-first: serve from cache, fall back to network and cache response
async function cachedMatch(request, cacheName) {
  if (request.method !== 'GET') return fetch(request);
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

// Stale-while-revalidate: serve from cache first, update in background
async function staleWhileRevalidate(request, cacheName) {
  if (request.method !== 'GET') return fetch(request);
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}
