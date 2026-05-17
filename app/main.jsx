// Navlog — main React entry. Migrated from the inline <script type="text/babel">
// block in index.html. Loaded via esm.sh/gh which fetches this file from
// raw.githubusercontent.com, compiles JSX server-side, and returns a real ES
// module. The browser's module loader (not babel-standalone) handles dependency
// order, so external .jsx files can be imported reliably.

import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Plane, Settings, Fuel, Gauge, FolderOpen,
  Eye, EyeOff, BookOpen, Map as MapIcon,
} from "lucide-react";

// Extracted React components — each loaded as a sibling ES module via esm.sh/gh.
import { MapTab } from "./components/map-tab.jsx?v=20260517.2256";
import { WaypointEditor } from "./components/waypoint-editor.jsx?v=20260517.2256";
import { SetupTab } from "./components/setup-tab.jsx?v=20260517.2256";
import { FlightTab } from "./components/flight-tab.jsx?v=20260517.2256";
import { FuelTab } from "./components/fuel-tab.jsx?v=20260517.2256";
import { LogTab } from "./components/log-tab.jsx?v=20260517.2256";
import { PrefsPanel } from "./components/prefs-panel.jsx?v=20260517.2256";
import { ErrorBoundary } from "./components/error-boundary.jsx?v=20260517.2256";
import { useDerivedFlight } from "./hooks/use-derived-flight.jsx?v=20260517.2256";
import { useFlightActions } from "./hooks/use-flight-actions.jsx?v=20260517.2256";
import { useFlightPersistence } from "./hooks/use-flight-persistence.jsx?v=20260517.2256";
import { AppProvider } from "./context/app-context.jsx?v=20260517.2256";
import { TabButton, LiveClock } from "./components/ui-primitives.jsx?v=20260517.2256";
// PdfGeoreferencer + PdfLayersPanel were extracted alongside this commit but
// are no longer referenced directly from main.jsx — only MapTab uses them,
// and MapTab now imports them as siblings (app/components/*.jsx).

// ── Required-globals guard ────────────────────────────────────────────────
// Each lib/*.js UMD module calls Object.assign(window, …) to expose its
// helpers. main.jsx and the extracted component modules reference those as
// bare identifiers. When we extract a component AND simultaneously move a
// helper from main.jsx into lib/planning.js (as for getDecl in this commit),
// users on the prior SW version see a stale lib/planning.js while esm.sh
// serves the new main.jsx — bare identifier resolution then throws deep
// inside a React render, surfacing as "X is not defined" with a useless
// react-dom file path.
//
// This guard fixes the UX: at module-init time we check every helper the
// app uses; if anything is missing we auto-reload once (a single
// sessionStorage flag prevents loops) so the new SW's network-first fetch
// picks up the fresh lib/*. A persistent miss after the reload — meaning
// the deploy itself is broken — throws a clear actionable message that
// lands on the boot diagnostic banner.
(function _requiredGlobalsGuard() {
  const required = [
    "getDecl", "nowHHMM", "parseHHMM", "formatHHMM", "formatHHMMSS", "displayTime",
    "calcLeg", "gcDist", "gcTC", "gcInterpolate", "projectDest", "projectSource",
    "estimatedPosition", "nextAutoKey", "portionTransitionLabel",
    "resolveAltitudeProfile", "computeLegPhases", "validateLeg",
    "applyDirectTo", "clearDirectTo",
    "affineFrom3Points", "invertAffine", "applyAffinePt",
    "parseCoordsString", "decDegToStr", "formatCoord", "ddmDigitsToDecDeg",
    "airacGetCurrent", "airacSearch", "airacAirport",
    "savePdfOverlayIdb", "getAllPdfOverlaysIdb", "getPdfHandle", "savePdfHandle", "deletePdfHandle",
    "userPtsAll", "userPtsPut", "userPtsDelete",
    "renderPdfToImage", "computeWarpedImage", "applyOverlayCalibration",
    "pickPdfFile", "renderPdfHiRes", "renderPdfFromHandle",
    "rewarpOverlayFromHandle",
    "haptic", "warmUpAudio", "playAlarm",
    "themes", "FLEET_DEFAULTS",
  ];
  // Accept any non-null value — most entries are functions (lib/* exports),
  // but `themes` is a plain data object. The lib UMD modules use
  // Object.assign(window, …) so missing means undefined.
  const missing = required.filter((n) => window[n] == null);
  if (missing.length === 0) {
    // Clear any prior guard flag on a successful run so a future race is
    // still auto-recoverable.
    try { sessionStorage.removeItem("navlog_globals_guard"); } catch (_) {}
    return;
  }
  const flagged = (function() {
    try { return sessionStorage.getItem("navlog_globals_guard"); } catch (_) { return null; }
  })();
  if (!flagged) {
    try { sessionStorage.setItem("navlog_globals_guard", "1"); } catch (_) {}
    location.reload();
    throw new Error("navlog: auto-reloading; missing window.* helpers: " + missing.join(", "));
  }
  try { sessionStorage.removeItem("navlog_globals_guard"); } catch (_) {}
  throw new Error(
    "navlog: lib/* still missing window helpers after reload (" + missing.join(", ") +
    "). Check that lib/planning.js + lib/storage.js + lib/pdf.js + lib/airac.js + lib/coords.js are deployed and the SW cache for /navlog/lib/ was bypassed."
  );
})();

// Lightweight diagnostic for non-fatal failures we still want to recover from.
// Used in persistence paths (localStorage / window.storage / IndexedDB) and
// JSON parsing of saved state — places where a silent catch used to make
// pilots' "I lost my route" reports undebuggable. Intentionally NOT used
// for benign feature-detect paths (vibrate, AudioContext, setPointerCapture,
// Leaflet remount cleanup) where a throw is the expected control flow.
function _warn(label, err) {
  try { console.warn('[navlog]', label, err); } catch (_) {}
}

// haptic / warmUpAudio / playAlarm moved to lib/feedback.js so extracted
// component modules can use them as bare identifiers via window. The audio
// context state stays encapsulated inside the lib (not on window).

const APP_VERSION = "20260517.2256";

// ================= MATEMÁTICA =================
// toRad/toDeg, gcDist/gcTC/gcInterpolate/projectDest/projectSource/gcIntersection
// are now defined in lib/planning.js (loaded synchronously above) and exposed
// as bare globals for this block.

// parseCoordsString, decDegToStr, formatCoord, ddmDigitsToDecDeg are defined
// in lib/coords.js (loaded as <script src> above, exposed as window globals).

// getDecl is defined in lib/planning.js (NOAA WMM lookup with a per-render
// cache bucketed by 0.1° / 1000 ft).

// mod360, calcLeg, correctTAS, validateLeg are defined in lib/planning.js.

// computeLegPhases is defined in lib/planning.js (splits a leg into
// SUBIDA/CRUZEIRO/DESCIDA portions per cp.arrivalMode).

// resolveAltitudeProfile is defined in lib/planning.js (multi-leg / inherit
// altitude distributor that powers the continuous-phase profile).

// phaseETELabel moved into app/components/flight-tab.jsx (its only consumer).

// nextAutoKey moved to lib/planning.js — see comment there.

// parseHHMM, formatHHMM, formatHHMMSS, displayTime, nowHHMM are in lib/planning.js.
// nowHHMM moved to lib/planning.js (alongside parseHHMM / formatHHMM /
// formatHHMMSS) so extracted component modules — which only see window-
// scoped helpers, not main.jsx's module scope — can use it as a bare
// identifier. This bug is exactly what black-screened the Map tab after
// e3b3a96: MapTab references nowHHMM, and ES module isolation made it
// unresolved once MapTab lived in its own file.

// AIRAC.NET client (airacGetCurrent / airacSearch / airacAirport /
// airacProcedures / airacProcedureDetail / syncAirportCheckpoint /
// pickProcedureLegs / legToCheckpoint) is defined in lib/airac.js and
// exposed as window globals so this block can use them as bare names.

// ================= STATE INICIAL =================
const DEFAULT_FREQ = { atis: "", ground: "", tower: "", approach: "", ctaf: "", unicom: "", elev: "" };

const DEFAULT_FLIGHT = {
  aircraftKey: "baron58",
  callsign: "PT-XXX",
  origin: "SBSP",
  destination: "SBRJ",
  alternate: "SBJR",
  rules: "VFR",
  eobt: "13:00",
  cruiseAlt: 7000,
  variation: -22,
  windDir: 90,
  windVel: 15,
  isaDevC: 0,        // desvio ISA em °C (+ = mais quente que padrão)
  fuelInitial: null, // null = usar usable da aeronave
  atd: null,         // Actual Time of Departure (HH:MM) — marcado ao partir
  autoWpATAs: {},    // { "toc_0": "14:23", "tod_0": "16:45" } — ATAs de TOC/TOD virtuais
  freqs: { origin: { ...DEFAULT_FREQ }, destination: { ...DEFAULT_FREQ }, alternate: { ...DEFAULT_FREQ } },
  checkpoints: [
    // origem: dist=0, ATA é o EOBT
    { name: "SBSP",  alt: 2600, tc: null, dist: 0,  ata: null, gsActual: null, isOrigin: true },
    { name: "EMBOI", alt: 7000, tc: 45,   dist: 78, ata: null, gsActual: null, useCruiseAlt: true },
    { name: "RIPLI", alt: 7000, tc: 55,   dist: 90, ata: null, gsActual: null, useCruiseAlt: true },
    { name: "SBRJ",  alt: 10,   tc: 62,   dist: 55, ata: null, gsActual: null },
  ],
};

// Per-checkpoint pode ter: windDir, windVel (override), notes
// Se ausentes, usa o vento médio do voo

const DEFAULT_PREFS = {
  theme: "night",
  fontSize: "m",
  wakeLock: false,
  showFuelInFlight: true,
  alertEtaDeltaMin: 5, // minutos de desvio para alertar
  // Map overlay zoom-fade: opacity goes linearly from full at overlayFadeZoom
  // to 0 at overlayFadeEndZoom. start >= end disables the fade.
  overlayFadeZoom: 12,
  overlayFadeEndZoom: 15,
};

// Tokens de tema. Cada um define classes Tailwind para os elementos principais.
// themes moved to lib/themes.js (UMD, sets window.themes).

// loadNavlogLS + the store helpers moved to app/hooks/use-flight-persistence.jsx.

// ================= APP =================
function NavlogApp() {
  // Persistência: flight, savedRoutes, prefs, fleet, pdfOverlays + pdfLoaded
  // gate. Lógica em app/hooks/use-flight-persistence.jsx.
  const {
    flight, setFlight,
    savedRoutes, setSavedRoutes,
    prefs, setPrefs, savePrefs,
    fleet, setFleet,
    pdfOverlays, setPdfOverlays,
  } = useFlightPersistence({ defaultFlight: DEFAULT_FLIGHT, defaultPrefs: DEFAULT_PREFS });

  const [tab, setTab] = useState("setup"); // setup | flight | fuel | log
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);
  const [insertAfterIdx, setInsertAfterIdx] = useState(null);
  const [insertCoords, setInsertCoords] = useState(null); // [lat, lon] from map click
  const [routesOpen, setRoutesOpen] = useState(false);
  const [ataEditOpen, setAtaEditOpen] = useState(false);
  const [ataEditIdx, setAtaEditIdx] = useState(null);
  const [virtualAtaEditKey, setVirtualAtaEditKey] = useState(null);
  const [atdEditOpen, setAtdEditOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [viewMode, setViewMode] = useState("leg");
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesIdx, setNotesIdx] = useState(null);
  const [deviationOpen, setDeviationOpen] = useState(false);
  const [userPoints, setUserPoints] = useState([]);
  // Map center+zoom is preserved across tab switches (Leaflet otherwise
  // re-initialises and re-fits-bounds whenever the MapTab remounts).
  const [mapView, setMapView] = useState(null);
  const wakeLockRef = useRef(null);

  // Load user points library from IndexedDB on mount
  useEffect(() => {
    (async () => {
      const all = await userPtsAll();
      setUserPoints(all || []);
    })();
  }, []);

  async function addUserPoint(pt) {
    const rec = await userPtsPut(pt);
    if (rec) setUserPoints((p) => {
      const filtered = p.filter((x) => x.id !== rec.id);
      return filtered.concat([rec]);
    });
    return rec;
  }
  async function deleteUserPoint(id) {
    await userPtsDelete(id);
    setUserPoints((p) => p.filter((x) => x.id !== id));
  }

  // Auto-fill freqs/elev from AIRAC when an ICAO is entered for origin/destination/alternate.
  // Only fills if the matching freqs slot is empty (never overwrites user input). Refresh
  // button in FreqsSection lets the user re-fetch on demand.
  function _airacFreqKey(type) {
    var t = String(type || "").toLowerCase();
    if (t === "atis") return "atis";
    if (t === "ground") return "ground";
    if (t === "tower") return "tower";
    if (t === "approach" || t === "departure") return "approach";
    if (t === "ctaf") return "ctaf";
    if (t === "unicom") return "unicom";
    return null;
  }
  function airportToFreqs(ap) {
    if (!ap) return null;
    var out = {};
    if (ap.elevation_ft != null) out.elev = String(ap.elevation_ft);
    (ap.frequencies || []).forEach(function(f) {
      var k = _airacFreqKey(f.type);
      if (!k) return;
      if (out[k]) return; // first one wins per type
      var v = Number(f.frequency_mhz);
      if (isFinite(v)) out[k] = (Math.round(v * 1000) / 1000).toFixed(3);
    });
    return out;
  }

  // AbortController per slot so a fast sequence of ICAO edits (e.g. user types
  // SBSP then immediately changes to SBGR) can't have the older fetch land
  // after the newer one and clobber freqs with stale data for a stale ICAO.
  // Slots are independent: refreshing origin never aborts destination.
  const airacRefreshAbortRef = useRef({ origin: null, destination: null, alternate: null });

  async function refreshAirportFreqs(which, overwrite) {
    var icao = flight && flight[which];
    if (!icao || !/^[A-Z0-9]{4}$/.test(String(icao).toUpperCase())) return;
    // Cancel any in-flight fetch for this same slot before starting a new one.
    var prevCtrl = airacRefreshAbortRef.current[which];
    if (prevCtrl) { try { prevCtrl.abort(); } catch (_) {} }
    var ctrl = new AbortController();
    airacRefreshAbortRef.current[which] = ctrl;
    var ap;
    try {
      ap = await airacAirport(icao, ctrl.signal);
    } catch (e) {
      if (e && e.name === "AbortError") return;
      _warn('refreshAirportFreqs:' + which, e);
      return;
    }
    // Bail if we were aborted between the await resolving and now (a newer
    // refresh has taken over for this slot).
    if (ctrl.signal.aborted) return;
    if (airacRefreshAbortRef.current[which] === ctrl) airacRefreshAbortRef.current[which] = null;
    if (!ap) return;
    var derived = airportToFreqs(ap);
    if (!derived) return;
    setFlight(function(f) {
      var prev = (f.freqs && f.freqs[which]) || {};
      var merged = {};
      Object.keys(derived).forEach(function(k) {
        merged[k] = overwrite ? derived[k] : (prev[k] || derived[k]);
      });
      // preserve any user-entered fields not in derived
      Object.keys(prev).forEach(function(k) { if (!(k in merged)) merged[k] = prev[k]; });
      return Object.assign({}, f, { freqs: Object.assign({}, f.freqs || {}, { [which]: merged }) });
    });
  }

  useEffect(function() {
    ["origin", "destination", "alternate"].forEach(function(which) {
      var icao = flight[which];
      if (!icao || !/^[A-Z0-9]{4}$/.test(String(icao).toUpperCase())) return;
      var current = (flight.freqs && flight.freqs[which]) || {};
      var hasAny = Object.keys(current).some(function(k) { return current[k]; });
      if (hasAny) return; // never auto-overwrite
      refreshAirportFreqs(which, false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight.origin, flight.destination, flight.alternate]);
  // fleet state moved to useFlightPersistence (called at top of NavlogApp).
  const [fleetOpen, setFleetOpen] = useState(false);
  const [fleetEditAircraft, setFleetEditAircraft] = useState(null); // null = closed, {} = new, {id,...} = edit

  const ac = fleet[flight.aircraftKey] || Object.values(fleet)[0];

  // Trigger recompute when the WMM library finishes loading
  const [geomagReady, setGeomagReady] = useState(!!window._geomagnetism);
  useEffect(() => {
    if (window._geomagnetism) { setGeomagReady(true); return; }
    var handler = function() { setGeomagReady(true); };
    window.addEventListener('geomagready', handler);
    return function() { window.removeEventListener('geomagready', handler); };
  }, []);

  // Theme tokens
  // Pure derivations from flight/ac/prefs/geomagReady. Lives in
  // app/hooks/use-derived-flight.jsx — see comment there for what's inside.
  const {
    theme, computed, nextIdx, legVirtualsMap,
    liveETAs, liveRoute, nextLiveIdx, liveFuel,
  } = useDerivedFlight({ flight, ac, prefs, geomagReady });
  const fontScale = { s: 0.9, m: 1, l: 1.15 }[prefs.fontSize] || 1;

  // computed, nextIdx, legVirtualsMap, liveETAs, liveRoute, nextLiveIdx
  // are derived in useDerivedFlight (called above).

  // Flight mutations (markCrossed/setAta/moveUp/.../depart) live in
  // app/hooks/use-flight-actions.jsx — destructured below.
  const {
    markVirtual, unmarkVirtual, setVirtualAta,
    setAta, markCrossed, unmark,
    saveNote,
    setDeviation, directToWp, clearDeviation,
    moveUp, moveDown, reorder,
    resetFlight, depart,
  } = useFlightActions({ flight, setFlight, ac, liveRoute, liveETAs });

  // ----- Rotas salvas -----
  function newBlankRoute() {
    if (!confirm("Limpar a rota atual e começar do zero?")) return;
    setFlight({
      ...DEFAULT_FLIGHT,
      callsign: flight.callsign,
      aircraftKey: flight.aircraftKey,
      windVel: 0,
      checkpoints: [
        { name: "ORIG", alt: 0, tc: null, dist: 0, ata: null, gsActual: null, isOrigin: true },
      ],
      origin: "",
      destination: "",
      alternate: "",
    });
  }

  async function saveCurrentRoute() {
    const name = prompt("Nome da rota:", `${flight.origin}-${flight.destination}`);
    if (!name) return;
    const route = {
      id: Date.now().toString(),
      name,
      savedAt: new Date().toISOString(),
      flight: {
        ...flight,
        // limpa ATAs antes de salvar — rota é template
        checkpoints: flight.checkpoints.map((cp) => ({ ...cp, ata: null, gsActual: null })),
      },
    };
    const next = [...savedRoutes.filter((r) => r.name !== name), route];
    setSavedRoutes(next);
    try {
      if (window.storage) await window.storage.set("routes", JSON.stringify(next));
    } catch (e) { _warn('saveCurrentRoute', e); }
  }

  async function loadRoute(route) {
    setFlight(route.flight);
    setRoutesOpen(false);
    setTab("setup");
  }

  async function deleteRoute(id) {
    if (!confirm("Excluir esta rota salva?")) return;
    const next = savedRoutes.filter((r) => r.id !== id);
    setSavedRoutes(next);
    try {
      if (window.storage) await window.storage.set("routes", JSON.stringify(next));
    } catch (e) { _warn('deleteRoute', e); }
  }

  // savePrefs moved to useFlightPersistence (destructured at top of NavlogApp).

  // ----- Wake lock -----
  useEffect(() => {
    let cancelled = false;
    async function acquire() {
      if (!prefs.wakeLock) return;
      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        }
      } catch {}
    }
    async function release() {
      try {
        if (wakeLockRef.current) {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
        }
      } catch {}
    }
    if (prefs.wakeLock) acquire(); else release();
    // re-aquire quando volta visível
    const onVis = () => { if (prefs.wakeLock && document.visibilityState === "visible") acquire(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", onVis); release(); };
  }, [prefs.wakeLock]);

  // ----- Importar rota de string FPL ICAO -----
  function importFPLRoute(rawRoute) {
    // Extrai sequência de tokens que parecem fixos: 5+ letras, ou nome com /altitude
    // FPL típico: "DCT EMBOI UZ23 RIPLI DCT" — separadores: espaços, vírgulas
    const tokens = rawRoute.toUpperCase()
      .replace(/[\n\r,]+/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    // Filtros: descartar DCT, palavras de aerovia (UA/UZ/UB/UM seguidos de número), SID/STAR comuns
    const skip = new Set(["DCT", "DIRECT", "SID", "STAR", "VFR", "IFR"]);
    const isAirway = (t) => /^[UA-Z]{1,2}\d+[A-Z]?$/.test(t);
    const isFix = (t) => /^[A-Z][A-Z0-9]{1,5}$/.test(t) && !skip.has(t) && !isAirway(t);
    const fixes = tokens.filter(isFix);
    if (fixes.length === 0) {
      alert("Nenhum waypoint reconhecido na rota.");
      return;
    }
    setFlight((f) => {
      const origin = f.checkpoints[0];
      const newCps = [origin];
      fixes.forEach((name, i) => {
        // Se já existe (ex.: o destino), preserva
        const existing = f.checkpoints.find((c) => c.name === name && !c.isOrigin);
        if (existing) {
          newCps.push(existing);
        } else {
          newCps.push({
            name, alt: f.cruiseAlt ?? 7000, tc: 0, dist: 0,
            ata: null, gsActual: null,
          });
        }
      });
      return { ...f, checkpoints: newCps, autoWpATAs: {} };
    });
    setImportOpen(false);
  }

  // Persistência (store + load + 4 auto-saves) vive em useFlightPersistence.

  const glowStyle = theme.glow ? "text-shadow: 0 0 8px currentColor;" : "";

  // Estilos compartilhados — paleta cockpit dark
  // Espelha os retornos dos 3 hooks nos 4 contexts. Consumidores ainda
  // recebem via props nesta fase; migração por aba acontece em commits
  // separados. Não muda comportamento hoje, só habilita o canal.
  const actions = {
    markVirtual, unmarkVirtual, setVirtualAta,
    setAta, markCrossed, unmark,
    saveNote,
    setDeviation, directToWp, clearDeviation,
    moveUp, moveDown, reorder,
    resetFlight, depart,
  };
  const derived = { computed, nextIdx, legVirtualsMap, liveETAs, liveRoute, nextLiveIdx, liveFuel };

  return (
    <AppProvider
      theme={theme}
      prefs={prefs} savePrefs={savePrefs}
      flight={flight} setFlight={setFlight} ac={ac}
      actions={actions}
      derived={derived}
    >
    <div className={`min-h-screen ${theme.bg} ${theme.fg} font-mono`}
         style={{ fontSize: `${fontScale}rem` }}>
      <style>{`:root { --amber: #ffb13b; --cyan: #4ddbff; --green: #4ade80; --red: #ef4444; }
        .num { font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }
        .cockpit-glow { ${glowStyle} }
        @media (orientation: landscape) and (max-height: 500px) {
          .landscape-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
          .landscape-sidebar { border-left: 1px solid; overflow-y: auto; max-height: 100vh; }
          .landscape-main { overflow-y: auto; max-height: 100vh; }
        }
      `}</style>

      {/* HEADER */}
      <header className={`sticky top-0 z-20 ${theme.bg}/95 backdrop-blur border-b ${theme.panelBorder}`}>
        <div className="px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Plane className={`w-5 h-5 ${theme.accent} shrink-0`} />
            <div className="leading-tight min-w-0">
              <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>Navlog</div>
              <div className={`text-sm font-bold ${theme.accent} cockpit-glow truncate`}>
                {flight.callsign} · {ac.short}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => savePrefs({ ...prefs, wakeLock: !prefs.wakeLock })}
              className={`p-2 ${prefs.wakeLock ? theme.accent : theme.fgMuted} active:scale-90 transition`}
              aria-label="Manter tela ligada"
              title={prefs.wakeLock ? "Tela travada ligada" : "Permitir desligar tela"}
            >
              {prefs.wakeLock ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
            </button>
            <button
              onClick={() => setRoutesOpen(true)}
              className={`p-2 ${theme.fgMuted} hover:${theme.accent} active:scale-90 transition`}
              aria-label="Rotas salvas"
            >
              <FolderOpen className="w-5 h-5" />
            </button>
            <button
              onClick={() => setPrefsOpen(true)}
              className={`p-2 ${theme.fgMuted} active:scale-90 transition`}
              aria-label="Preferências"
            >
              <Settings className="w-5 h-5" />
            </button>
            <div className="text-right leading-tight ml-1">
              <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>UTC</div>
              <LiveClock theme={theme} />
            </div>
          </div>
        </div>
      </header>

      {/* CONTEÚDO */}
      <main className={tab === 'map' ? 'overflow-hidden' : 'pb-24'}>
        {tab === "setup" && (
          <ErrorBoundary name="Setup" theme={theme}>
            <SetupTab
              flight={flight} setFlight={setFlight} ac={ac} theme={theme}
              onEditCp={(i) => { setEditingIdx(i); setEditorOpen(true); }}
              onAddCp={() => { setEditingIdx(null); setEditorOpen(true); }}
              onNewBlank={newBlankRoute}
              onDeleteCp={(i) => {
                if (!confirm(`Remover ${flight.checkpoints[i].name}?`)) return;
                setFlight((f) => {
                  const cps = [...f.checkpoints];
                  cps.splice(i, 1);
                  return { ...f, checkpoints: cps };
                });
              }}
              onMoveUp={moveUp}
              onMoveDown={moveDown}
              onReorder={reorder}
              onImportFPL={() => setImportOpen(true)}
              fleet={fleet}
              onManageFleet={() => setFleetOpen(true)}
              computed={computed}
              liveRoute={liveRoute}
              userPoints={userPoints}
              onAddUserPoint={addUserPoint}
              onDeleteUserPoint={deleteUserPoint}
            />
          </ErrorBoundary>
        )}
        {tab === "flight" && (
          <ErrorBoundary name="Em Voo" theme={theme}>
            <FlightTab
              flight={flight} computed={computed} liveETAs={liveETAs} liveFuel={liveFuel}
              liveRoute={liveRoute} nextLiveIdx={nextLiveIdx}
              markVirtual={markVirtual} unmarkVirtual={unmarkVirtual}
              nextIdx={nextIdx} markCrossed={markCrossed} unmark={unmark}
              depart={depart}
              resetFlight={resetFlight} ac={ac} theme={theme}
              viewMode={viewMode} setViewMode={setViewMode}
              onEditAta={(i) => { setAtaEditIdx(i); setAtaEditOpen(true); }}
              onEditVirtualAta={(key) => setVirtualAtaEditKey(key)}
              onEditAtd={() => setAtdEditOpen(true)}
              onEditNotes={(i) => { setNotesIdx(i); setNotesOpen(true); }}
              onOpenDeviation={() => setDeviationOpen(true)}
              onClearDeviation={clearDeviation}
              onDirectTo={directToWp}
              prefs={prefs}
            />
          </ErrorBoundary>
        )}
        {tab === "fuel" && (
          <ErrorBoundary name="Combustível" theme={theme}>
            <FuelTab flight={flight} computed={computed} liveFuel={liveFuel} ac={ac} theme={theme} />
          </ErrorBoundary>
        )}
        {tab === "log" && (
          <ErrorBoundary name="Diário" theme={theme}>
            <LogTab flight={flight} computed={computed} liveFuel={liveFuel} ac={ac} theme={theme} />
          </ErrorBoundary>
        )}
        {tab === "map" && (
          <ErrorBoundary name="Mapa" theme={theme}>
            <MapTab
              flight={flight} computed={computed} liveRoute={liveRoute}
              liveETAs={liveETAs} ac={ac} theme={theme}
              pdfOverlays={pdfOverlays} setPdfOverlays={setPdfOverlays}
              prefs={prefs} savePrefs={savePrefs}
              initialView={mapView} onViewChange={setMapView}
              onInsertWaypoint={(afterIdx, lat, lon) => {
                setInsertAfterIdx(afterIdx);
                setInsertCoords([lat, lon]);
                setEditingIdx(null);
                setEditorOpen(true);
              }}
            />
          </ErrorBoundary>
        )}
      </main>

      {/* TAB BAR */}
      <nav className={`fixed bottom-0 left-0 right-0 z-20 ${theme.panel} border-t ${theme.panelBorder}`}>
        <div className="grid grid-cols-5">
          <TabButton theme={theme} active={tab === "setup"} onClick={() => setTab("setup")}
            icon={<Settings className="w-5 h-5" />} label="Setup" />
          <TabButton theme={theme} active={tab === "flight"} onClick={() => setTab("flight")}
            icon={<Gauge className="w-5 h-5" />} label="Em Voo" />
          <TabButton theme={theme} active={tab === "fuel"} onClick={() => setTab("fuel")}
            icon={<Fuel className="w-5 h-5" />} label="Combustível" />
          <TabButton theme={theme} active={tab === "log"} onClick={() => setTab("log")}
            icon={<BookOpen className="w-5 h-5" />} label="Diário" />
          <TabButton theme={theme} active={tab === "map"} onClick={() => setTab("map")}
            icon={<MapIcon className="w-5 h-5" />} label="Mapa" />
        </div>
      </nav>

      {/* EDITOR DE WAYPOINT */}
      {editorOpen && (
        <ErrorBoundary name="Editor de Waypoint" theme={theme}>
          <WaypointEditor
            flight={flight} setFlight={setFlight}
            editingIdx={editingIdx}
            insertAfterIdx={insertAfterIdx}
            initLat={insertCoords?.[0]}
            initLon={insertCoords?.[1]}
            ac={ac}
            computed={computed}
            theme={theme}
            pdfOverlays={pdfOverlays}
            userPoints={userPoints}
            onAddUserPoint={addUserPoint}
            onDeleteUserPoint={deleteUserPoint}
            onClose={() => { setEditorOpen(false); setInsertAfterIdx(null); setInsertCoords(null); }}
          />
        </ErrorBoundary>
      )}

      {/* GERENCIADOR DE ROTAS */}
      {routesOpen && (
        <RoutesManager
          routes={savedRoutes}
          currentFlight={flight}
          onLoad={loadRoute}
          onDelete={deleteRoute}
          onSaveCurrent={saveCurrentRoute}
          onClose={() => setRoutesOpen(false)}
        />
      )}

      {/* EDITOR DE ATA */}
      {ataEditOpen && ataEditIdx != null && (
        <AtaEditor
          checkpoint={flight.checkpoints[ataEditIdx]}
          eobt={flight.eobt}
          prevAta={ataEditIdx > 0
            ? (flight.checkpoints[ataEditIdx - 1].isOrigin
                ? (flight.atd ?? flight.eobt)
                : flight.checkpoints[ataEditIdx - 1].ata)
            : null}
          etaPlanned={computed[ataEditIdx]?.etaPlanned}
          etaLive={liveETAs[ataEditIdx]}
          theme={theme}
          onSave={(ataStr) => { setAta(ataEditIdx, ataStr); setAtaEditOpen(false); }}
          onClear={() => { setAta(ataEditIdx, null); setAtaEditOpen(false); }}
          onClose={() => setAtaEditOpen(false)}
          onUseNow={() => { markCrossed(ataEditIdx); setAtaEditOpen(false); }}
        />
      )}

      {/* EDITOR DE ATA DE PONTO VIRTUAL (TOC/TOD/BOD) */}
      {virtualAtaEditKey != null && (() => {
        const item = liveRoute.find((x) => x.autoKey === virtualAtaEditKey);
        if (!item) return null;
        const currentAta = flight.autoWpATAs?.[virtualAtaEditKey] ?? null;
        return (
          <AtaEditor
            checkpoint={{ name: item.name, ata: currentAta }}
            eobt={flight.eobt}
            prevAta={null}
            etaPlanned={null}
            etaLive={null}
            theme={theme}
            onSave={(ataStr) => { setVirtualAta(virtualAtaEditKey, ataStr); setVirtualAtaEditKey(null); }}
            onClear={() => { unmarkVirtual(virtualAtaEditKey); setVirtualAtaEditKey(null); }}
            onClose={() => setVirtualAtaEditKey(null)}
            onUseNow={() => { markVirtual(virtualAtaEditKey); setVirtualAtaEditKey(null); }}
          />
        );
      })()}

      {/* EDITOR DE ATD */}
      {atdEditOpen && (
        <AtaEditor
          checkpoint={{ name: flight.origin || computed[0]?.name || "Origem", ata: flight.atd }}
          eobt={flight.eobt}
          prevAta={null}
          etaPlanned={flight.eobt ? parseHHMM(flight.eobt) : null}
          etaLive={null}
          theme={theme}
          fieldLabel="ATD"
          confirmLabel="Confirmar ATD"
          clearLabel="Cancelar ATD"
          onSave={(ataStr) => { setFlight((f) => ({ ...f, atd: ataStr })); setAtdEditOpen(false); }}
          onClear={() => { setFlight((f) => ({ ...f, atd: null })); setAtdEditOpen(false); }}
          onClose={() => setAtdEditOpen(false)}
          onUseNow={() => { setFlight((f) => ({ ...f, atd: formatHHMMSS(nowHHMM()) })); setAtdEditOpen(false); }}
        />
      )}

      {/* PREFERÊNCIAS */}
      {prefsOpen && (
        <PrefsPanel
          prefs={prefs} savePrefs={savePrefs} theme={theme}
          appVersion={APP_VERSION}
          onClose={() => setPrefsOpen(false)}
        />
      )}

      {/* DEVIAÇÃO / REPOSICIONAMENTO */}
      {deviationOpen && (
        <DeviationPanel
          flight={flight} ac={ac} theme={theme}
          pdfOverlays={pdfOverlays}
          defaultTargetIdx={(function() {
            // Resolve default to the next user waypoint not yet crossed.
            for (let i = 1; i < flight.checkpoints.length; i++) {
              const c = flight.checkpoints[i];
              if (c && !c.isOrigin && c.lat != null && c.ata == null) return i;
            }
            return null;
          })()}
          onApply={setDeviation}
          onClear={clearDeviation}
          onClose={() => setDeviationOpen(false)}
        />
      )}

      {/* NOTAS DE WAYPOINT */}
      {notesOpen && notesIdx != null && (
        <NotesEditor
          checkpoint={flight.checkpoints[notesIdx]}
          theme={theme}
          onSave={(text) => { saveNote(notesIdx, text); setNotesOpen(false); }}
          onClose={() => setNotesOpen(false)}
        />
      )}

      {/* IMPORTAR FPL */}
      {importOpen && (
        <FPLImporter
          theme={theme}
          onImport={importFPLRoute}
          onClose={() => setImportOpen(false)}
        />
      )}

      {/* GERENCIAR FROTA */}
      {fleetOpen && (
        <FleetManager
          fleet={fleet}
          onEdit={(ac) => setFleetEditAircraft(ac)}
          onDelete={(id) => {
            if (!confirm('Remover aeronave?')) return;
            setFleet((f) => { const n = { ...f }; delete n[id]; return n; });
            if (flight.aircraftKey === id) setFlight((f) => ({ ...f, aircraftKey: Object.keys(fleet).find(k => k !== id) || 'baron58' }));
          }}
          onReset={(id) => {
            if (!confirm('Restaurar valores padrão?')) return;
            setFleet((f) => ({ ...f, [id]: { ...FLEET_DEFAULTS[id], id, isBuiltIn: true } }));
          }}
          onAdd={() => setFleetEditAircraft({ isBuiltIn: false, name: '', short: '', engine: '', tasCruise: 0, vy: 0, vDescent: 0, rocClimb: 0, rodDescent: 0, gphClimb: 0, gphCruise: 0, gphDescent: 0, fuelUsable: 0, mtow: 0, bew: 0 })}
          onClose={() => setFleetOpen(false)}
          theme={theme}
        />
      )}
      {fleetEditAircraft !== null && (
        <AircraftEditor
          aircraft={fleetEditAircraft}
          theme={theme}
          onSave={(updated) => {
            const id = updated.id || ('custom_' + Date.now().toString(36));
            setFleet((f) => ({ ...f, [id]: { ...updated, id } }));
            setFleetEditAircraft(null);
          }}
          onClose={() => setFleetEditAircraft(null)}
        />
      )}
    </div>
    </AppProvider>
  );
}

// ================= COMPONENTES =================



// CheckpointRow + React.memo wrapper moved to app/components/flight-tab.jsx
// alongside FlightTab.

// --------- TAB COMBUSTÍVEL ---------

// --------- TAB DIÁRIO ---------

// --------- PAINEL DE PREFERÊNCIAS ---------

// --------- EDITOR DE NOTAS ---------

// --------- IMPORTADOR DE FPL ICAO ---------

// --------- GERENCIADOR DE FROTA ---------

// --------- EDITOR DE AERONAVE ---------

// --------- GERENCIADOR DE ROTAS ---------

// --------- EDITOR DE ATA ---------

    const _root = createRoot(document.getElementById('root'));
_root.render(React.createElement(NavlogApp));
  
