/*
 * App-shell service worker.
 *
 * PRIVACY-CRITICAL: this caches the application shell and nothing else.
 *
 * Card data never passes through here — it lives in IndexedDB and is never
 * fetched over HTTP. Recognition requests are POSTs to Cloud Functions, and
 * non-GET requests are passed straight through, untouched and uncached, so a
 * model response can never land in the cache storage of a shared device.
 *
 * Do not add a catch-all caching strategy to this file.
 */

const CACHE = "newcard-shell-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Anything that carries data (POST to the recognition function, Firestore
  // listen channels) is none of this worker's business.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Hashed build assets and the font chunks: both are immutable static files
  // that carry no personal data, so they are safe to keep. Serve from cache,
  // fill on first use. These two prefixes are the whole allow-list.
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/fonts/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Navigations: network first so a deploy is picked up, cache as the offline
  // fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/index.html").then((hit) => hit ?? Response.error())),
    );
  }
});
