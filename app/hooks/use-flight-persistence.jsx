// useFlightPersistence — toda a camada de persistência num lugar.
//
// Mantém 5 estados (flight, savedRoutes, prefs, fleet, pdfOverlays) e o
// flag `pdfLoaded` que coordena: até a carga async completar, os 4
// auto-saves ficam suspensos para o estado em memória não atropelar o
// storage. Esse era o jeito mais sutil de perder a rota — auto-save
// disparava com o default antes do load assíncrono resolver.
//
// Camadas:
//   1. Read síncrono no init (loadNavlogLS via localStorage) — UI já
//      monta com a rota correta no primeiro render.
//   2. Re-load assíncrono via window.storage (preferido) + fallback
//      localStorage, e sobrescreve se houver dado mais novo.
//   3. Auto-save em useEffect a cada mudança de estado, após pdfLoaded.
//
// PDF overlays vivem em IndexedDB (não em localStorage) com cleanup de
// órfãos no mesmo effect.
//
// Bare-identifier dependencies (window globals via lib/*):
//   FLEET_DEFAULTS, savePdfOverlayIdb, getAllPdfOverlaysIdb,
//   deletePdfHandle. Tudo em lib/fleet.js e lib/storage.js.

import { useState, useEffect } from "react";

function warn(label, err) {
  try { console.warn("[navlog persistence]", label, err); } catch (_) {}
}

// Synchronous localStorage read so initial state is correct on first render.
function loadNavlogLS(key, fallback) {
  try {
    const r = localStorage.getItem("navlog_" + key);
    if (r != null) return JSON.parse(r);
  } catch (e) { warn("loadNavlogLS:" + key, e); }
  return fallback;
}

// Async store with window.storage preference + localStorage fallback.
const store = {
  async get(key) {
    try {
      if (typeof window !== "undefined" && window.storage) {
        const r = await window.storage.get(key);
        if (r?.value) return r.value;
      }
    } catch (e) { warn("store.get:storage:" + key, e); }
    try { return localStorage.getItem("navlog_" + key); } catch (e) { warn("store.get:localStorage:" + key, e); }
    return null;
  },
  async set(key, value) {
    try { if (typeof window !== "undefined" && window.storage) await window.storage.set(key, value); } catch (e) { warn("store.set:storage:" + key, e); }
    try { localStorage.setItem("navlog_" + key, value); } catch (e) { warn("store.set:localStorage:" + key, e); }
  },
};

export function useFlightPersistence({ defaultFlight, defaultPrefs }) {
  const [flight, setFlight] = useState(() => {
    const loaded = loadNavlogLS("flight", null);
    if (!loaded) return defaultFlight;
    if (loaded.checkpoints) loaded.checkpoints = loaded.checkpoints.filter(cp => !cp.isAuto);
    return { ...defaultFlight, ...loaded };
  });

  const [savedRoutes, setSavedRoutes] = useState(() => loadNavlogLS("routes", []));

  const [prefs, setPrefs] = useState(() => {
    const loaded = loadNavlogLS("prefs", null);
    return loaded ? { ...defaultPrefs, ...loaded } : defaultPrefs;
  });

  const [fleet, setFleet] = useState(() => {
    try {
      const saved = localStorage.getItem("navlog_fleet");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Object.keys(parsed).length > 0) return parsed;
      }
    } catch (e) { warn("load fleet", e); }
    return Object.fromEntries(
      Object.entries(FLEET_DEFAULTS).map(([k, v]) => [k, { ...v, id: k, isBuiltIn: true }])
    );
  });

  const [pdfOverlays, setPdfOverlays] = useState([]);
  // Gates auto-save: until initial async load resolves, do nothing.
  const [pdfLoaded, setPdfLoaded] = useState(false);

  // ── Initial async load ──────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const r = await store.get("flight");
        if (r) {
          const loaded = JSON.parse(r);
          if (loaded.checkpoints) loaded.checkpoints = loaded.checkpoints.filter(cp => !cp.isAuto);
          setFlight({ ...defaultFlight, ...loaded });
        }
        const rr = await store.get("routes");
        if (rr) setSavedRoutes(JSON.parse(rr));
        const pp = await store.get("prefs");
        if (pp) setPrefs({ ...defaultPrefs, ...JSON.parse(pp) });
        var idbOverlays = await getAllPdfOverlaysIdb();
        if (idbOverlays.length > 0) {
          var valid = idbOverlays.filter(function(r) { return r.dataUrl && r.bounds; });
          valid.sort(function(a, b) {
            var ao = (a.order != null) ? a.order : a.id;
            var bo = (b.order != null) ? b.order : b.id;
            return ao - bo;
          });
          setPdfOverlays(valid.map(function(o, i) { return Object.assign({}, o, { order: i }); }));
        }
      } catch (e) { warn("initial load (flight/routes/prefs/overlays)", e); }
      setPdfLoaded(true);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-save (gated) ───────────────────────────────────────────────
  useEffect(() => {
    if (!pdfLoaded) return;
    store.set("flight", JSON.stringify(flight));
  }, [flight, pdfLoaded]);

  useEffect(() => {
    if (!pdfLoaded) return;
    store.set("routes", JSON.stringify(savedRoutes));
  }, [savedRoutes, pdfLoaded]);

  useEffect(() => {
    // Don't sync to IDB until the initial load has populated pdfOverlays —
    // otherwise the empty initial state would mark every stored overlay as
    // an orphan and delete them all on app start (losing all charts).
    if (!pdfLoaded) return;
    pdfOverlays.forEach(function(o) {
      savePdfOverlayIdb(o, null);
    });
    var ids = new Set(pdfOverlays.map(function(o) { return o.id; }));
    getAllPdfOverlaysIdb().then(function(all) {
      all.forEach(function(rec) { if (!ids.has(rec.id)) deletePdfHandle(rec.id); });
    }).catch(function() {});
  }, [pdfOverlays, pdfLoaded]);

  useEffect(() => {
    try { localStorage.setItem("navlog_fleet", JSON.stringify(fleet)); } catch (e) { warn("save fleet", e); }
  }, [fleet]);

  // Manual setter used by PrefsPanel (UI-driven save, not just a useState).
  function savePrefs(p) {
    setPrefs(p);
    try { if (window.storage) window.storage.set("prefs", JSON.stringify(p)); } catch (e) { warn("savePrefs:storage", e); }
    try { localStorage.setItem("navlog_prefs", JSON.stringify(p)); } catch (e) { warn("savePrefs:localStorage", e); }
  }

  return {
    flight, setFlight,
    savedRoutes, setSavedRoutes,
    prefs, setPrefs, savePrefs,
    fleet, setFleet,
    pdfOverlays, setPdfOverlays,
    pdfLoaded,
  };
}
