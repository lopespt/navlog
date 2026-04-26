// Navlog Service Worker — offline-first cache
const CACHE_NAME = "navlog-v5";
const STATIC = [
  "/navlog/",
  "/navlog/index.html",
  "/navlog/manifest.json",
  // CDN assets
  "https://cdn.tailwindcss.com",
  "https://unpkg.com/react@18/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js",
  "https://unpkg.com/lucide-react@0.383.0/dist/umd/lucide-react.js",
  "https://unpkg.com/@babel/standalone@7.23.9/babel.min.js",
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
