// Navlog Service Worker — offline-first cache
const CACHE_NAME = "navlog-v18";
const STATIC = [
  "/navlog/",
  "/navlog/index.html",
  "/navlog/lib/planning.js",
  "/navlog/lib/coords.js",
  "/navlog/lib/airac.js",
  "/navlog/lib/storage.js",
  "/navlog/lib/pdf.js",
  "/navlog/app/main.jsx",
  "/navlog/app/components/map-tab.jsx",
  "/navlog/app/components/pdf-georeferencer.jsx",
  "/navlog/app/components/pdf-layers-panel.jsx",
  "/navlog/manifest.json",
  // CDN assets — esm.sh hosts the JS modules now (no more babel-standalone).
  "https://cdn.tailwindcss.com",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  "https://esm.sh/react@18.3.1",
  "https://esm.sh/react-dom@18.3.1/client",
  "https://esm.sh/react@18.3.1/jsx-runtime",
  "https://esm.sh/lucide-react@0.383.0?deps=react@18.3.1,react-dom@18.3.1",
  "https://esm.sh/gh/lopespt/navlog@main/app/main.jsx?deps=react@18.3.1,react-dom@18.3.1",
  "https://esm.sh/gh/lopespt/navlog@main/app/components/map-tab.jsx",
  "https://esm.sh/gh/lopespt/navlog@main/app/components/pdf-georeferencer.jsx",
  "https://esm.sh/gh/lopespt/navlog@main/app/components/pdf-layers-panel.jsx",
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
