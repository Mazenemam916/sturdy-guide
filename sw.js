/* =========================================================
   خدمات بلدي | Mazen AI — Service Worker v1.0.0
   Strategies:
   - HTML navigation → Network-first + offline fallback
   - Static assets  → Cache-first + size limit
   - Fonts/CDN      → Stale-while-revalidate
   - Images         → Cache-first (LRU 80 entries)
   ========================================================= */

const VERSION      = 'mb-mazen-v1.0.0';
const SHELL_CACHE  = VERSION + '-shell';
const ASSET_CACHE  = VERSION + '-assets';
const IMG_CACHE    = VERSION + '-img';
const FONT_CACHE   = VERSION + '-fonts';

const LIMITS = { assets: 60, images: 80 };

const SHELL = ['./', './index.html', './offline.html'];

/* ---------- INSTALL ---------- */
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.allSettled(
      SHELL.map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => null))
    );
    await self.skipWaiting();
  })());
});

/* ---------- ACTIVATE ---------- */
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

/* ---------- LIMIT ---------- */
async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

/* ---------- FETCH ---------- */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // API: never cache
  if (url.pathname.startsWith('/api/')) return;

  // Navigation → network-first
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(SHELL_CACHE);
        cache.put(request, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        const offline = await caches.match('./offline.html');
        if (offline) return offline;
        return new Response('<h1>أنت غير متصل بالإنترنت</h1>', {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }
    })());
    return;
  }

  // Fonts
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE, 40));
    return;
  }

  // Images
  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request, IMG_CACHE, LIMITS.images));
    return;
  }

  // Same-origin assets
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, ASSET_CACHE, LIMITS.assets));
    return;
  }

  // Default
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

/* ---------- STRATEGIES ---------- */
async function cacheFirst(request, name, max) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      const cache = await caches.open(name);
      cache.put(request, fresh.clone());
      trim(name, max);
    }
    return fresh;
  } catch {
    return new Response('', { status: 504 });
  }
}

async function staleWhileRevalidate(request, name, max) {
  const cache = await caches.open(name);
  const cached = await cache.match(request);
  const network = fetch(request).then(r => {
    if (r && r.ok) { cache.put(request, r.clone()); trim(name, max); }
    return r;
  }).catch(() => null);
  return cached || (await network) || new Response('', { status: 504 });
}

/* ---------- MESSAGES ---------- */
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'CLEAR_CACHES') {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))));
  }
});

/* ---------- PUSH ---------- */
self.addEventListener('push', (event) => {
  let payload = { title: 'خدمات بلدي', body: 'لديك تحديث جديد' };
  try { if (event.data) payload = { ...payload, ...event.data.json() }; } catch {}
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    dir: 'rtl',
    lang: 'ar'
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then((clients) => {
    if (clients.length) return clients[0].focus();
    return self.clients.openWindow('./');
  }));
});
