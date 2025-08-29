const PRECACHE = "bhh-precache-v1";
const RUNTIME  = "bhh-runtime-v1";
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css",
  "https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js",
  "https://unpkg.com/suncalc@1.9.0/suncalc.js"
];

// Install: pre-cache shell
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(PRECACHE).then((c) => c.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

// Activate: cleanup old caches
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== PRECACHE && k !== RUNTIME) ? caches.delete(k) : null))
    )
  );
  self.clients.claim();
});

// Helper: simple LRU-ish cap
async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await cache.delete(keys[0]);
  await trimCache(cacheName, max);
}

// Fetch: network-first for same-origin docs; stale-while-revalidate for tiles/radar
self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Map tiles & radar: cache-first with revalidate
  const isTile =
    url.hostname.includes("api.maptiler.com") ||
    url.hostname.includes("tilecache.rainviewer.com") ||
    url.hostname.includes("opengeo.ncep.noaa.gov");

  if (isTile) {
    e.respondWith(
      caches.open(RUNTIME).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request).then((resp) => {
          if (resp.ok) cache.put(request, resp.clone());
          trimCache(RUNTIME, 120);
          return resp;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Same-origin app shell: network-first
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(PRECACHE).then((c) => c.put(request, copy));
          return resp;
        })
        .catch(() => caches.match(request))
    );
    return;
  }
});
