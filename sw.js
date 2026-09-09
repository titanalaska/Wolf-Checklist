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

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `wolf-shell-${CACHE_VERSION}`;

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
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.filter(n => n.startsWith('wolf-') && n !== SHELL_CACHE)
             .map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

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

  event.respondWith(networkFirst(req));
});
