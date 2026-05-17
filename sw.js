// Navlog Service Worker — offline-first cache
const CACHE_NAME = "navlog-v37";
const STATIC = [
  "/navlog/",
  "/navlog/index.html",
  "/navlog/lib/planning.js",
  "/navlog/lib/coords.js",
  "/navlog/lib/airac.js",
  "/navlog/lib/storage.js",
  "/navlog/lib/pdf.js",
  "/navlog/lib/feedback.js",
  "/navlog/lib/themes.js",
  "/navlog/lib/fleet.js",
  "/navlog/app/main.jsx",
  "/navlog/app/components/map-tab.jsx",
  "/navlog/app/components/pdf-georeferencer.jsx",
  "/navlog/app/components/pdf-layers-panel.jsx",
  "/navlog/app/components/waypoint-editor.jsx",
  "/navlog/app/components/setup-tab.jsx",
  "/navlog/app/components/flight-tab.jsx",
  "/navlog/app/components/fuel-tab.jsx",
  "/navlog/app/components/log-tab.jsx",
  "/navlog/app/components/prefs-panel.jsx",
  "/navlog/app/components/ata-editor.jsx",
  "/navlog/app/components/notes-editor.jsx",
  "/navlog/app/components/deviation-panel.jsx",
  "/navlog/app/components/fleet-manager.jsx",
  "/navlog/app/components/routes-manager.jsx",
  "/navlog/app/components/fpl-importer.jsx",
  "/navlog/app/components/ui-primitives.jsx",
  "/navlog/app/components/leaflet-mini-map.jsx",
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
  "https://esm.sh/gh/lopespt/navlog@main/app/main.jsx?deps=react@18.3.1,react-dom@18.3.1&v=20260517.1921",
  "https://esm.sh/gh/lopespt/navlog@main/app/components/map-tab.jsx",
  "https://esm.sh/gh/lopespt/navlog@main/app/components/pdf-georeferencer.jsx",
  "https://esm.sh/gh/lopespt/navlog@main/app/components/pdf-layers-panel.jsx",
  "https://esm.sh/gh/lopespt/navlog@main/app/components/waypoint-editor.jsx",
  "https://esm.sh/gh/lopespt/navlog@main/app/components/setup-tab.jsx",
  "https://esm.sh/gh/lopespt/navlog@main/app/components/flight-tab.jsx",
  "https://esm.sh/gh/lopespt/navlog@main/app/components/fuel-tab.jsx",
  "https://esm.sh/gh/lopespt/navlog@main/app/components/log-tab.jsx",
  "https://esm.sh/gh/lopespt/navlog@main/app/components/prefs-panel.jsx",
  "https://esm.sh/gh/lopespt/navlog@main/app/components/ata-editor.jsx",
  "https://esm.sh/gh/lopespt/navlog@main/app/components/notes-editor.jsx",
  "https://esm.sh/gh/lopespt/navlog@main/app/components/deviation-panel.jsx",
  "https://esm.sh/gh/lopespt/navlog@main/app/components/fleet-manager.jsx",
  "https://esm.sh/gh/lopespt/navlog@main/app/components/routes-manager.jsx",
  "https://esm.sh/gh/lopespt/navlog@main/app/components/fpl-importer.jsx",
  "https://esm.sh/gh/lopespt/navlog@main/app/components/ui-primitives.jsx",
  "https://esm.sh/gh/lopespt/navlog@main/app/components/leaflet-mini-map.jsx",
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

// Fetch strategy splits our own code from CDN assets:
//   - same-origin (lib/, app/, index.html, manifest): NETWORK-FIRST so a push
//     to main propagates on the next reload without waiting for a SW cycle.
//     Falls back to cache when offline.
//   - everything else (esm.sh, unpkg, cdnjs, tailwind): CACHE-FIRST so CDN
//     hits are instant and offline works. CDN assets are pinned by version
//     in the URL, so staleness isn't a concern there.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin) {
    // Network-first for our own JS/HTML — eliminates the "old planning.js
    // cached by previous SW version" failure mode that caused MapTab to
    // black-screen after the nowHHMM move (commit 3674ece).
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for CDN (esm.sh / unpkg / cdnjs / tailwind).
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const networkFetch = fetch(e.request)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
