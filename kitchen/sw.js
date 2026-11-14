// Simmer's background helper. Two jobs:
// 1. Keeps a copy of the app on the phone, so it opens with no signal (in the back of a grocery store, say).
// 2. Shows a notification when the server nudges this phone. The nudge carries no words; the helper asks the server for them.
const q = new URL(self.location).searchParams;
const API = q.get('api'), HOUSE = q.get('house');
const CACHE = 'simmer-app';
const HOME = new URL('./', self.location).href;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// Files that carry a version stamp never change, so the phone's copy is used straight away.
async function versioned(href) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(href);
  if (hit) return hit;
  const res = await fetch(href);
  if (res.ok) {
    await cache.put(href, res.clone());
    const url = new URL(href);
    for (const old of await cache.keys()) {            // drop older versions of the same file
      const u = new URL(old.url);
      if (u.pathname === url.pathname && u.search !== url.search) await cache.delete(old);
    }
  }
  return res;
}
// Everything else (the page itself, the loader, the version stamp) is fetched fresh; the saved copy is the fallback
// when there is no signal or a very weak one.
async function fresh(href, key = href) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(href, { cache: 'no-store', signal: AbortSignal.timeout(2500) });
    if (res.ok) await cache.put(key, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(key);
    if (hit) return hit;
    throw err;
  }
}
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(HOME)) return;
  if (/\/sw\.js$/.test(url.pathname)) return;
  if (e.request.mode === 'navigate') return e.respondWith(fresh(url.origin + url.pathname + url.search, HOME));
  if (url.searchParams.has('v')) return e.respondWith(versioned(url.href));
  e.respondWith(fresh(url.origin + url.pathname));
});
// The page tells the helper which version it is running, so the helper can save a full copy the first time.
self.addEventListener('message', e => {
  const v = e.data && typeof e.data.warm === 'string' && /^\?v=[\w.%-]{1,40}$/.test(e.data.warm) ? e.data.warm : '';
  if (!v) return;
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const f of ['app.js', 'app.css', 'data.js', 'config.js', 'art.js']) await versioned(HOME + f + v).catch(() => {});
    for (const [href, key] of [[HOME, HOME], [HOME + 'boot.js'], [HOME + 'version.txt'], [HOME + 'manifest.webmanifest'], [HOME + 'icon-180.png']]) {
      if (!(await cache.match(key || href))) await fresh(href, key || href).catch(() => {});
    }
  })());
});

self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let n = { title: 'Simmer', body: 'Open Simmer to see tonight\'s dinner.', tag: 'simmer' };
    try {
      const got = await (await fetch(`${API}/push/now/${HOUSE}`)).json();
      if (got && got.body) n = { ...n, ...got };
    } catch { /* offline: show the plain message */ }
    await self.registration.showNotification(String(n.title).slice(0, 60), { body: String(n.body).slice(0, 400), icon: 'icon-180.png', badge: 'icon-180.png', tag: String(n.tag).slice(0, 60) });
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => (list[0] ? list[0].focus() : self.clients.openWindow('./'))));
});
