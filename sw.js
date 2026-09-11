/* Wolf checklist service worker.
 *
 * Why this exists: the counting happens in the yard, and the yard has no signal.
 * Without a worker the page simply fails to load out there.
 *
 * === What went wrong on 2026-09-10, and what changed ===
 *
 * The previous version bricked the installed app in the field. The chain was:
 *
 *   1. CACHE_VERSION was bumped v1 -> v2.
 *   2. install() cached each shell file with `.catch(() => null)`, so EVERY
 *      fetch could fail and the install still reported success.
 *   3. skipWaiting() then activated it immediately.
 *   4. activate() deleted every cache not in the keep list -- destroying the
 *      known-good v1 shell.
 *   5. Net result on a weak connection: an empty new cache, no old cache, and
 *      a page that cannot be served at all once the signal goes. Black screen.
 *
 * Three rules now prevent that:
 *
 *   - A shell install is ATOMIC on the files that matter. If the page itself
 *     cannot be cached, the install FAILS, the new worker never activates, and
 *     the old worker and its cache stay in charge. A stale app beats no app.
 *   - Old caches are deleted only AFTER the new shell is verified to hold the
 *     page. No verification, no cleanup.
 *   - If the current shell cache ever misses, every other wolf-shell-* cache is
 *     tried before giving up. Belt and braces.
 *
 * Bump CACHE_VERSION on deploy.
 */

const CACHE_VERSION = 'v3';
const SHELL_CACHE = `wolf-shell-${CACHE_VERSION}`;

// Bed crops and the site map: ~17 MB across 45 files. Cached as they are viewed,
// and warmed in bulk by the app's "Save all bed maps for offline" button.
const BED_CACHE = `wolf-beds-${CACHE_VERSION}`;
const MAX_BEDS = 60;

// Without these the app cannot open at all. Cached all-or-nothing.
const CRITICAL = ['./', './index.html'];
// Nice to have. Allowed to fail individually without failing the install.
const EXTRA = [
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // addAll rejects as a unit. That is the point: a half-cached shell is how
    // the app ended up unopenable, so a failure here must abort the install.
    await cache.addAll(CRITICAL);
    await Promise.all(EXTRA.map(url => cache.add(url).catch(() => null)));
    await self.skipWaiting();
  })());
});

async function shellIsUsable() {
  const cache = await caches.open(SHELL_CACHE);
  for (const url of CRITICAL) {
    if (await cache.match(url)) return true;
  }
  return false;
}

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Only tidy up once there is a proven replacement. If the new shell is not
    // usable, leave every old cache exactly where it is.
    if (await shellIsUsable()) {
      const keep = [SHELL_CACHE, BED_CACHE];
      const names = await caches.keys();
      await Promise.all(
        names.filter(n => n.startsWith('wolf-') && !keep.includes(n))
             .map(n => caches.delete(n))
      );
    }
    await self.clients.claim();
  })());
});

// Last resort: look through every shell cache this origin has ever written,
// newest name last, so an older copy still opens the app when the current one
// is empty for any reason.
async function anyShellMatch(request) {
  const names = (await caches.keys()).filter(n => n.startsWith('wolf-shell-'));
  for (const n of names.reverse()) {
    const c = await caches.open(n);
    const hit = await c.match(request) || await c.match('./index.html') || await c.match('./');
    if (hit) return hit;
  }
  return null;
}

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map(k => cache.delete(k)));
}

// Bed pictures are cut from one fixed drawing and never change under a given
// filename, so revalidating them would only burn cell data in the yard.
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
    const hit = await cache.match(request) ||
                (request.mode === 'navigate' ? await cache.match('./index.html') : null);
    if (hit) return hit;
    const fallback = await anyShellMatch(request);
    if (fallback) return fallback;
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
