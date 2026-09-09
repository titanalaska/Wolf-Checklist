/* Wolf checklist service worker.
 *
 * Why this exists: the counting happens in the yard, and the yard has no signal.
 * Without a worker the page simply fails to load out there — the counts are safe
 * in localStorage, but you can't reach the page that reads them, which is the
 * same thing as losing them for the day.
 *
 * There is no backend here. Everything the app needs is the shell: one HTML file,
 * the manifest and the icons. So there is exactly one rule.
 *
 *   app shell   network-first  — a push to Pages shows up on the next open when
 *                                there's signal, and the last good copy opens
 *                                when there isn't.
 *
 * Counts are never the worker's business: they live in localStorage, which is
 * unaffected by anything cached here.
 *
 * Bump CACHE_VERSION on deploy; old caches are dropped on activate.
 */

const CACHE_VERSION = 'v2';
const SHELL_CACHE = `wolf-shell-${CACHE_VERSION}`;

// Bed crops and the site map: ~6 MB across 45 files. Too much to force on every
// visitor up front, so they are cached as they are viewed, and the app's
// "Save all bed maps for offline" button warms the whole set in one go.
const BED_CACHE = `wolf-beds-${CACHE_VERSION}`;
const MAX_BEDS = 60;

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // addAll is all-or-nothing; one 404 would leave the app with no offline
      // copy at all, so each entry is allowed to fail on its own.
      .then(cache => Promise.all(SHELL.map(url => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const keep = [SHELL_CACHE, BED_CACHE];
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.filter(n => n.startsWith('wolf-') && !keep.includes(n))
             .map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

// Oldest-first eviction. Cache API keys come back in insertion order.
async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map(k => cache.delete(k)));
}

// Bed pictures are cut from one fixed drawing, so they never change under a
// given filename -- revalidating them would just burn cell data in the yard.
async function cacheFirst(request) {
  const cache = await caches.open(BED_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && res.status === 200 && res.type !== 'opaque') {
    await cache.put(request, res.clone());
    trimCache(BED_CACHE, MAX_BEDS);
  }
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(request);
    if (res && res.status === 200) cache.put(request, res.clone());
    return res;
  } catch (e) {
    // A navigation that misses falls back to the shell rather than the browser's
    // offline page — opening to yesterday's counts beats opening to nothing.
    const hit = await cache.match(request) ||
                (request.mode === 'navigate' ? await cache.match('./index.html') : null);
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (url.origin !== self.location.origin) return;

  if (url.pathname.indexOf('/beds/') !== -1) {
    event.respondWith(cacheFirst(req).catch(() => Response.error()));
    return;
  }

  event.respondWith(networkFirst(req));
});
