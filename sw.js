// Navlog Service Worker — offline-first cache
const CACHE_NAME = "navlog-v4";
const STATIC = [
  "/",
  "/index.html",
  "/navlog.js",          // bundle compilado
  "/manifest.json",
  // CDN assets (React, Tailwind, Lucide)
  "https://esm.sh/react@18/",
  "https://esm.sh/react-dom@18/",
  "https://cdn.tailwindcss.com",
];

// Instala: pré-cacheia assets estáticos
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(STATIC.map((url) => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

// Ativa: limpa caches antigos
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first para assets, network-first para dados
self.addEventListener("fetch", (e) => {
  // Ignora POST e requests não-GET
  if (e.request.method !== "GET") return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const networkFetch = fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return res;
        })
        .catch(() => cached); // se offline, usa cache

      // Cache-first: retorna cache imediatamente se disponível
      return cached || networkFetch;
    })
  );
});
