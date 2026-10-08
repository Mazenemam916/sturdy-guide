/* خدمات بلدي | Mazen AI — Real Service Worker */

const VERSION = "balady-shell-v6.0.0";

const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;
const IMAGE = `${VERSION}-image`;
const FONT = `${VERSION}-font`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./offline.html",
  "./icon-192.png",
  "./icon-512.png"
];

const MAX_RUNTIME = 80;
const MAX_IMAGES = 80;

/* Install */
self.addEventListener("install", event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);

      await Promise.all(
        APP_SHELL.map(url =>
          cache
            .add(new Request(url, { cache: "reload" }))
            .catch(() => null)
        )
      );

      await self.skipWaiting();
    })()
  );
});

/* Activate */
self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();

      await Promise.all(
        names
          .filter(
            name =>
              ![
                SHELL,
                RUNTIME,
                IMAGE,
                FONT
              ].includes(name)
          )
          .map(name => caches.delete(name))
      );

      await self.clients.claim();
    })()
  );
});

/* Limit cache size */
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();

  if (keys.length <= maxItems) {
    return;
  }

  const oldKeys = keys.slice(
    0,
    keys.length - maxItems
  );

  await Promise.all(
    oldKeys.map(key =>
      cache.delete(key)
    )
  );
}

/* Cache first */
async function cacheFirst(
  request,
  cacheName,
  maxItems
) {
  const cached = await caches.match(request);

  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);

    if (
      response.ok ||
      response.type === "opaque"
    ) {
      const cache =
        await caches.open(cacheName);

      await cache.put(
        request,
        response.clone()
      );

      await trimCache(
        cacheName,
        maxItems
      );
    }

    return response;
  } catch {
    return Response.error();
  }
}

/* Stale while revalidate */
async function staleWhileRevalidate(
  request,
  cacheName
) {
  const cached =
    await caches.match(request);

  const network =
    fetch(request)
      .then(async response => {
        if (response.ok) {
          const cache =
            await caches.open(cacheName);

          await cache.put(
            request,
            response.clone()
          );
        }

        return response;
      })
      .catch(() => null);

  return (
    cached ||
    (await network) ||
    Response.error()
  );
}

/* Fetch */
self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url =
    new URL(request.url);

  /*
    لا تقم بتخزين API calls.
    البيانات الحساسة يجب أن تأتي من الخادم.
  */
  if (
    url.pathname.includes("/api/")
  ) {
    return;
  }

  /*
    Navigation:
    Network First
    ثم Cache
    ثم Offline fallback
  */
  if (
    request.mode === "navigate"
  ) {
    event.respondWith(
      (async () => {
        try {
          const response =
            await fetch(request);

          const cache =
            await caches.open(SHELL);

          await cache.put(
            request,
            response.clone()
          );

          return response;
        } catch {
          const cached =
            await caches.match(request) ||
            await caches.match(
              "./index.html"
            );

          return (
            cached ||
            await caches.match(
              "./offline.html"
            ) ||
            new Response(
              `
              <!doctype html>
              <html lang="ar" dir="rtl">
              <head>
                <meta charset="utf-8">
                <meta name="viewport"
                  content="width=device-width,initial-scale=1">
                <title>غير متصل</title>
              </head>
              <body
                style="
                  font-family:system-ui;
                  padding:40px;
                  text-align:center;
                "
              >
                <h1>
                  أنت غير متصل بالإنترنت
                </h1>
                <p>
                  حاول الاتصال بالإنترنت ثم أعد المحاولة.
                </p>
              </body>
              </html>
              `,
              {
                headers: {
                  "Content-Type":
                    "text/html;charset=utf-8"
                }
              }
            )
          );
        }
      })()
    );

    return;
  }

  /*
    Google Fonts:
    Stale While Revalidate
  */
  if (
    url.hostname ===
      "fonts.googleapis.com" ||
    url.hostname ===
      "fonts.gstatic.com"
  ) {
    event.respondWith(
      staleWhileRevalidate(
        request,
        FONT
      )
    );

    return;
  }

  /*
    Images:
    Cache First
  */
  if (
    request.destination === "image"
  ) {
    event.respondWith(
      cacheFirst(
        request,
        IMAGE,
        MAX_IMAGES
      )
    );

    return;
  }

  /*
    Same-origin assets:
    Cache First
  */
  if (
    url.origin ===
    self.location.origin
  ) {
    event.respondWith(
      cacheFirst(
        request,
        RUNTIME,
        MAX_RUNTIME
      )
    );
  }
});

/*
  يسمح للواجهة بإجبار
  Service Worker القديم على التحديث.
*/
self.addEventListener(
  "message",
  event => {
    if (
      event.data?.type ===
      "SKIP_WAITING"
    ) {
      self.skipWaiting();
    }
  }
);

/*
  Background Sync hook
  جاهز للطلبات المؤجلة في المستقبل.
*/
self.addEventListener(
  "sync",
  event => {
    if (
      event.tag ===
      "balady-order-sync"
    ) {
      event.waitUntil(
        Promise.resolve()
      );
    }
  }
);
