// ============================================================
// SOKOHAI SERVICE WORKER  [R15 2026-11-13]
// Updates first, offline second, private data never:
//  - only same-origin GET requests are handled; everything else (Firebase, payments,
//    Cloudinary, /__fn callables, POST) goes straight to the network and is never cached;
//  - pages: network-first; offline -> the last good copy of the app shell, else offline.html;
//  - static files (js/css/fonts/images/manifest): network-first, the cache is only a fallback,
//    so a deploy is picked up on the next load (no stale app);
//  - a new version waits until the page asks (SKIP_WAITING) and old caches are deleted on activate.
// ============================================================
const VERSION = 'sokohai-r21-20261123-brand1';   // [BRAND 2026-11-23] new master icon set   // [SEO 2026-11-21] static public pages are not stored as the app shell
const CACHE = VERSION + '-static';
const SHELL = ['./', './index.html', './offline.html', './sokohai-manifest.json', './assets/img/brand/sokohai-icon-192.png', './assets/img/brand/sokohai-icon-512.png', './favicon.ico'];
const STATIC_RE = /\.(?:js|mjs|css|woff2?|ttf|png|jpe?g|webp|svg|gif|ico|json)$/i;
const NEVER_RE = /^\/admin(?:\/|$)|\/__fn|\/api\/|pesapal|token|auth|checkout|wallet/i;   // [ADMIN PORTAL 2026-11-22] /admin/ is never served from the marketplace cache

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isAppShell(p) { return p === '/' || p === '/index.html' || /^\/(p|s|d|post)\//.test(p); }
function cacheable(res) { return res && res.ok && res.type === 'basic' && !/no-store|private/i.test(res.headers.get('Cache-Control') || ''); }

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || NEVER_RE.test(url.pathname + url.search)) return;   // network only
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        // [SEO 2026-11-21] only the APP SHELL is stored as ./index.html. Static public pages (/privacy.html, /bidhaa/...,
        // /soko/...) are separate documents; storing them as index.html would replace the offline app with that page.
        if (cacheable(res) && isAppShell(url.pathname)) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => {}); }
        return res;
      }).catch(() => caches.match('./index.html').then((r) => r || caches.match('./offline.html')))
    );
    return;
  }
  if (!STATIC_RE.test(url.pathname)) return;
  event.respondWith(
    fetch(req).then((res) => {
      if (cacheable(res)) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || Response.error()))
  );
});

// [R15] Web push (FCM). The payload is the server's short title/body + a link to the notice; nothing private.
self.addEventListener('push', (event) => {
  let p = {};
  try { p = event.data ? event.data.json() : {}; } catch (e) { p = {}; }
  const n = p.notification || {}, d = p.data || {};
  const link = (p.fcmOptions && p.fcmOptions.link) || d.url || './';
  event.waitUntil(self.registration.showNotification(String(n.title || 'SokoHai').slice(0, 80), {
    body: String(n.body || '').slice(0, 160), icon: './assets/img/brand/sokohai-icon-192.png', badge: './assets/img/brand/sokohai-icon-96.png',
    tag: 'skh-' + String(d.category || 'general'), data: { url: link }
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || './';
  const url = new URL(raw, self.location.origin);
  if (url.origin !== self.location.origin) return; // never open another site from a push
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if (c.url.startsWith(self.location.origin) && 'focus' in c) { c.navigate(url.href).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url.href);
  }));
});
