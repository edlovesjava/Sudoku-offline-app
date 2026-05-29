const APP_SHELL_CACHE = "sudoku-app-shell-v1";
const APP_SHELL_URLS = [
  "/",
  "/static/manifest.webmanifest",
  "/static/js/app.js",
  "/static/js/config.js",
  "/static/js/generator.js",
  "/static/js/input.js",
  "/static/js/providers.js",
  "/static/js/rules.js",
  "/static/js/schemas.js",
  "/static/js/storage.js",
  "/static/packs/default-pack.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_URLS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== APP_SHELL_CACHE)
          .map((cacheName) => caches.delete(cacheName)),
      )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request);
    }),
  );
});
