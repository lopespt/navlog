// Navlog — main React entry. Migrated from the inline <script type="text/babel">
// block in index.html. Loaded via esm.sh/gh which fetches this file from
// raw.githubusercontent.com, compiles JSX server-side, and returns a real ES
// module. The browser's module loader (not babel-standalone) handles dependency
// order, so external .jsx files can be imported reliably.

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  Plane, Settings, Fuel, ChevronRight, ChevronLeft,
  MapPin, Wind, Clock, Gauge, AlertTriangle, CircleCheckBig,
  Play, RotateCcw, Plus, Trash, X, Save, FolderOpen, FileText,
  Pencil, Edit2, Eye, EyeOff, Sun, Moon, Type, Radio, BookOpen,
  Download, Upload, ChevronDown, ChevronUp, GripVertical,
  TrendingUp, TrendingDown, Minus, Map as MapIcon, Navigation,
  Search, Star, ClipboardList, RefreshCw,
  Maximize2, Minimize2
} from "lucide-react";

// Extracted React components — each loaded as a sibling ES module via esm.sh/gh.
import { MapTab } from "./components/map-tab.jsx";
import { WaypointEditor } from "./components/waypoint-editor.jsx";
import { SetupTab } from "./components/setup-tab.jsx";
import { FlightTab } from "./components/flight-tab.jsx";
import { FuelTab } from "./components/fuel-tab.jsx";
import { LogTab } from "./components/log-tab.jsx";
import { PrefsPanel } from "./components/prefs-panel.jsx";
import { Section, Loading, Empty, ErrorState } from "./components/ui-primitives.jsx";
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
    "calcLeg", "gcDist", "gcTC", "gcInterpolate", "projectDest",
    "estimatedPosition",
    "affineFrom3Points", "invertAffine", "applyAffinePt",
    "parseCoordsString", "decDegToStr", "formatCoord", "ddmDigitsToDecDeg",
    "airacGetCurrent", "airacSearch", "airacAirport",
    "savePdfOverlayIdb", "getAllPdfOverlaysIdb",
    "userPtsAll", "userPtsPut", "userPtsDelete",
    "renderPdfToImage", "computeWarpedImage", "applyOverlayCalibration",
    "pickPdfFile", "renderPdfHiRes", "renderPdfFromHandle",
    "rewarpOverlayFromHandle",
    "haptic", "warmUpAudio", "playAlarm",
  ];
  const missing = required.filter((n) => typeof window[n] !== "function");
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

const APP_VERSION = "20260517.1523";

// ================= AERONAVES =================
const FLEET_DEFAULTS = {
  baron58: {
    id: "baron58", isBuiltIn: true,
    name: "Beechcraft Baron 58",
    short: "BE58",
    tasCruise: 190, vy: 105, vDescent: 150,
    rocClimb: 700, rodDescent: 500,
    gphClimb: 32, gphCruise: 26, gphDescent: 18,
    fuelUsable: 166, mtow: 5500, bew: 3700,
    engine: "Pistão IO-550",
  },
  dakota: {
    id: "dakota", isBuiltIn: true,
    name: "Piper PA-28-236 Dakota",
    short: "PA28",
    tasCruise: 142, vy: 76, vDescent: 120,
    rocClimb: 900, rodDescent: 500,
    gphClimb: 16, gphCruise: 13, gphDescent: 9,
    fuelUsable: 72, mtow: 3000, bew: 1700,
    engine: "Pistão O-540",
  },
  dukePiston: {
    id: "dukePiston", isBuiltIn: true,
    name: "Beechcraft Duke B60 (pistão)",
    short: "DUKE-P",
    tasCruise: 220, vy: 110, vDescent: 160,
    rocClimb: 900, rodDescent: 700,
    gphClimb: 50, gphCruise: 38, gphDescent: 25,
    fuelUsable: 232, mtow: 6775, bew: 4423,
    engine: "Pistão TIO-541",
  },
  dukeTurbine: {
    id: "dukeTurbine", isBuiltIn: true,
    name: "Beechcraft Duke Turbine",
    short: "DUKE-T",
    tasCruise: 260, vy: 120, vDescent: 180,
    rocClimb: 1500, rodDescent: 800,
    gphClimb: 55, gphCruise: 42, gphDescent: 28,
    fuelUsable: 230, mtow: 6775, bew: 4500,
    engine: "Turboélice",
  },
  comanche: {
    id: "comanche", isBuiltIn: true,
    name: "Piper PA-24-250 Comanche",
    short: "PA24",
    tasCruise: 160, vy: 85, vDescent: 130,
    rocClimb: 900, rodDescent: 500,
    gphClimb: 16, gphCruise: 12, gphDescent: 9,
    fuelUsable: 60, mtow: 2900, bew: 1690,
    engine: "Pistão O-540",
  },
};

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

// Derive TOC/TOD/BOC/BOD annotation string from a computed checkpoint's portions
// Returns null if single-phase, e.g. "BOC +5nm · TOC +20nm"
function tocTodLabel(portions, dist) {
  if (!portions || portions.length <= 1) return null;
  const labels = [];
  let acc = 0;
  for (let i = 0; i < portions.length - 1; i++) {
    acc += portions[i].dist;
    const cur = portions[i].phase;
    const nxt = portions[i + 1].phase;
    if (cur !== "SUBIDA" && nxt === "SUBIDA") labels.push(`BOC +${acc.toFixed(0)}nm`);
    if (cur === "SUBIDA" && nxt !== "SUBIDA") labels.push(`TOC +${acc.toFixed(0)}nm`);
    if (cur !== "DESCIDA" && nxt === "DESCIDA") labels.push(`TOD +${acc.toFixed(0)}nm`);
    if (cur === "DESCIDA" && nxt !== "DESCIDA") labels.push(`BOD +${acc.toFixed(0)}nm`);
  }
  return labels.length > 0 ? labels.join(" · ") : null;
}


// Per-phase ETE breakdown label, e.g. "↗5 →12 ↘3 min"
// Returns null for single-phase legs
function phaseETELabel(portions, totalETE) {
  if (!portions || portions.length <= 1 || !totalETE) return null;
  const totalDist = portions.reduce((s, p) => s + p.dist, 0);
  if (totalDist <= 0) return null;
  const icon = { SUBIDA: "↗", DESCIDA: "↘", CRUZEIRO: "→" };
  return portions
    .map((p) => {
      const ete = Math.round((p.dist / totalDist) * totalETE);
      return ete > 0 ? `${icon[p.phase] || "→"}${ete}` : null;
    })
    .filter(Boolean)
    .join(" ") + " min";
}

// Mints a stable per-leg key for a virtual phase marker. Counters are mutated
// in place ({}-bag), so two passes over the same `computed` array always
// agree on the autoKey for a given (label, occurrence) — that's how
// flight.autoWpATAs entries survive across re-renders.
function nextAutoKey(label, counters) {
  const k = label.toLowerCase();
  const n = counters[k] || 0;
  counters[k] = n + 1;
  return `${k}_${n}`;
}

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
const themes = {
  night: {
    name: "Noite",
    bg: "bg-zinc-950",
    panel: "bg-zinc-900",
    panelBorder: "border-zinc-800",
    fg: "text-zinc-100",
    fgMuted: "text-zinc-400",
    fgFaint: "text-zinc-500",
    accent: "text-amber-400",
    accentBg: "bg-amber-500",
    accentBgFg: "text-zinc-950",
    accentBorder: "border-amber-500/50",
    cyan: "text-cyan-400",
    success: "text-green-400",
    danger: "text-red-400",
    inputBg: "bg-zinc-900",
    inputBorder: "border-zinc-700",
    glow: true,
  },
  day: {
    name: "Dia",
    bg: "bg-stone-100",
    panel: "bg-white",
    panelBorder: "border-stone-300",
    fg: "text-stone-900",
    fgMuted: "text-stone-700",
    fgFaint: "text-stone-500",
    accent: "text-amber-700",
    accentBg: "bg-amber-600",
    accentBgFg: "text-white",
    accentBorder: "border-amber-600/60",
    cyan: "text-sky-700",
    success: "text-emerald-700",
    danger: "text-red-700",
    inputBg: "bg-white",
    inputBorder: "border-stone-400",
    glow: false,
  },
  red: {
    name: "Vermelho (visão noturna)",
    bg: "bg-black",
    panel: "bg-black",
    panelBorder: "border-red-900/40",
    fg: "text-red-500",
    fgMuted: "text-red-600",
    fgFaint: "text-red-800",
    accent: "text-red-400",
    accentBg: "bg-red-700",
    accentBgFg: "text-black",
    accentBorder: "border-red-600",
    cyan: "text-red-400",
    success: "text-red-400",
    danger: "text-red-300",
    inputBg: "bg-black",
    inputBorder: "border-red-900",
    glow: true,
  },
};

// Synchronous localStorage read so initial state is correct on the first
// render — avoids the race where the auto-save effect overwrites the saved
// value with the in-memory default before the async load effect resolves.
function loadNavlogLS(key, fallback) {
  try {
    const r = localStorage.getItem("navlog_" + key);
    if (r != null) return JSON.parse(r);
  } catch (e) { _warn('loadNavlogLS:' + key, e); }
  return fallback;
}

// ================= APP =================
function NavlogApp() {
  const [tab, setTab] = useState("setup"); // setup | flight | fuel | log
  const [flight, setFlight] = useState(() => {
    const loaded = loadNavlogLS("flight", null);
    if (!loaded) return DEFAULT_FLIGHT;
    if (loaded.checkpoints) loaded.checkpoints = loaded.checkpoints.filter(cp => !cp.isAuto);
    return { ...DEFAULT_FLIGHT, ...loaded };
  });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);
  const [insertAfterIdx, setInsertAfterIdx] = useState(null);
  const [insertCoords, setInsertCoords] = useState(null); // [lat, lon] from map click
  const [pdfOverlays, setPdfOverlays] = useState([]); // PDF map overlays
  const [pdfLoaded, setPdfLoaded] = useState(false);    // gates IDB cleanup until initial load is done
  const [routesOpen, setRoutesOpen] = useState(false);
  const [savedRoutes, setSavedRoutes] = useState(() => loadNavlogLS("routes", []));
  const [ataEditOpen, setAtaEditOpen] = useState(false);
  const [ataEditIdx, setAtaEditIdx] = useState(null);
  const [virtualAtaEditKey, setVirtualAtaEditKey] = useState(null);
  const [atdEditOpen, setAtdEditOpen] = useState(false);
  const [prefs, setPrefs] = useState(() => {
    const loaded = loadNavlogLS("prefs", null);
    return loaded ? { ...DEFAULT_PREFS, ...loaded } : DEFAULT_PREFS;
  });
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [viewMode, setViewMode] = useState("leg");
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesIdx, setNotesIdx] = useState(null);
  const [legTimerStart, setLegTimerStart] = useState(null); // timestamp em ms
  const [deviationOpen, setDeviationOpen] = useState(false);
  const [userPoints, setUserPoints] = useState([]);
  // Map center+zoom is preserved across tab switches (Leaflet otherwise
  // re-initialises and re-fits-bounds whenever the MapTab remounts).
  const [mapView, setMapView] = useState(null);
  const [pointFinderOpen, setPointFinderOpen] = useState(false);
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
  const [fleet, setFleet] = useState(() => {
    try {
      const saved = localStorage.getItem('navlog_fleet');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Object.keys(parsed).length > 0) return parsed;
      }
    } catch (e) { _warn('load fleet', e); }
    return Object.fromEntries(
      Object.entries(FLEET_DEFAULTS).map(([k, v]) => [k, { ...v, id: k, isBuiltIn: true }])
    );
  });
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
  const theme = useMemo(() => themes[prefs.theme] || themes.night, [prefs.theme]);
  const fontScale = { s: 0.9, m: 1, l: 1.15 }[prefs.fontSize] || 1;

  // Computa dados de cada checkpoint (perna ATÉ ele)
  const computed = useMemo(() => {
    // Lat/lon is source of truth: for consecutive pairs with explicit coords,
    // always derive TC and dist from geometry (overrides any manually stored value).
    var resolvedCps = flight.checkpoints.map(function(cp, i) {
      if (i === 0 || cp.isOrigin) return cp;
      var prev = flight.checkpoints[i - 1];
      if (prev.lat != null && prev.lon != null && cp.lat != null && cp.lon != null) {
        return Object.assign({}, cp, {
          tc:   Math.round(gcTC(prev.lat, prev.lon, cp.lat, cp.lon)),
          dist: Math.round(gcDist(prev.lat, prev.lon, cp.lat, cp.lon) * 10) / 10
        });
      }
      return cp;
    });

    // Resolve altitude profile — handles inherited altitudes and multi-leg climbs
    var _altRes = resolveAltitudeProfile(resolvedCps, ac, flight);
    var altProfile     = _altRes.profile;
    var altProfileWarn = _altRes.altWarnings;
    var altLegPlans    = _altRes.legPlans || {};

    const eobtMin = parseHHMM(flight.eobt) ?? 0;
    const fuelStart = flight.fuelInitial ?? ac.fuelUsable;
    let etaPlanned = eobtMin;
    let fuelRem = fuelStart;
    let cumDist = 0;
    let cumTime = 0;
    var _res = resolvedCps.map((cp, i) => {
      if (cp.isOrigin) {
        const originAlt = altProfile[i];
        return {
          ...cp,
          alt: originAlt,
          tas: null, wca: null, th: null, mc: null, mh: null, ch: null,
          gsPlanned: null, etePlanned: 0,
          etaPlanned: eobtMin,
          fuelLeg: 0,
          fuelRemPlanned: fuelStart,
          gphEffective: ac.gphCruise,
          portions: [],
          cumDist: 0,
          cumTime: 0,
          windDirUsed: flight.windDir,
          windVelUsed: flight.windVel,
        };
      }

      // Altitude-per-fix: use pre-resolved profile (handles inherited / multi-leg climbs)
      const prevAlt = altProfile[i - 1];
      const thisAlt = altProfile[i];

      // Vento: windMode = null/undefined → padrão da rota
      //                   "none"          → sem vento (vel=0)
      //                   "custom"        → windDir/windVel do checkpoint
      let wDir, wVel;
      if (cp.windMode === "none") {
        wDir = 0; wVel = 0;
      } else if (cp.windMode === "custom" && cp.windDir != null) {
        wDir = Number(cp.windDir);
        wVel = Number(cp.windVel ?? 0);
      } else {
        wDir = flight.windDir;
        wVel = flight.windVel;
      }

      // Phase split: prefer the resolver's segment-aware plan (continuous
      // climb/descent across inherit WPs ⇒ middle legs are single-phase, only
      // the boundary legs carry TOC/TOD virtuals). Fall back to per-leg
      // computeLegPhases when the resolver didn't pre-plan this leg.
      let portions, avgTas;
      if (altLegPlans[i]) {
        portions = altLegPlans[i];
        const _tt = portions.reduce((s, p) => s + (p.timeMin || 0), 0);
        const _td = portions.reduce((s, p) => s + (p.dist || 0), 0);
        avgTas = _tt > 0 ? (_td / _tt) * 60 : (ac.tasCruise || 100);
      } else {
        const _r = computeLegPhases(
          prevAlt, thisAlt, cp.dist || 0, cp, ac, flight.isaDevC || 0,
          wDir, wVel, flight.variation
        );
        portions = _r.portions;
        avgTas = _r.avgTas;
      }

      // Per-leg magnetic variation from WMM (if library loaded and coords known)
      // Falls back to flight.variation when unavailable
      var legVar = getDecl(cp.lat, cp.lon, thisAlt) ?? (flight.variation ?? 0);

      // ETE = sum of timeMin per portion (climb/descent time is fixed by altitude/ROC, not distance)
      // Fuel = sum of (timeMin/60) × gph per portion
      let totalETE = 0;
      let fuelLeg = 0;
      let displayResult = null; // use cruise phase for MH/WCA/heading display
      portions.forEach((p) => {
        totalETE += p.timeMin ?? 0;
        fuelLeg += ((p.timeMin ?? 0) / 60) * p.gph;
        // For heading/WCA display, prefer the cruise phase
        const pr = calcLeg(cp.tc, 1, p.tas, wDir, wVel, legVar, 0);
        if (p.phase === "CRUZEIRO" || displayResult == null) displayResult = pr;
      });
      if (!displayResult) displayResult = calcLeg(cp.tc, 1, avgTas, wDir, wVel, legVar, 0);

      const totalDist = cp.dist || 0;
      // Effective GS = total distance / total time
      const totalGS = totalETE > 0 ? (totalDist / totalETE) * 60 : displayResult.gs;
      etaPlanned += totalETE;
      cumDist += totalDist;
      cumTime += totalETE;

      const gphEffective = totalETE > 0 ? fuelLeg / (totalETE / 60) : ac.gphCruise;
      fuelRem -= fuelLeg;

      return {
        ...cp,
        alt: thisAlt,   // effective altitude (resolved useCruiseAlt)
        tas: avgTas, ...displayResult,
        variation: legVar, // per-leg magnetic variation (WMM or fallback)
        gs: totalGS,
        ete: totalETE,
        gsPlanned: totalGS,
        etePlanned: totalETE,
        etaPlanned,
        fuelLeg,
        fuelRemPlanned: fuelRem,
        gphEffective,
        portions,
        cumDist,
        cumTime,
        windDirUsed: wDir,
        windVelUsed: wVel,
        windOverride: cp.windMode === "none" || cp.windMode === "custom",
        warnings: [...validateLeg(cp, { gs: totalGS }), ...(altProfileWarn[i] ? [altProfileWarn[i]] : [])],
        notes: cp.notes || "",
      };
    });

    // Detect cross-leg phase transitions at user WPs: when the climb (or
    // descent) completes exactly at a fix instead of mid-leg, no virtual
    // marker is emitted by liveRoute (the leg is single-phase). Tag the WP
    // itself so the views can render a TOC/TOD/BOC/BOD badge inline.
    for (var _ph = 0; _ph < _res.length; _ph++) {
      var _here = _res[_ph];
      var _next = _res[_ph + 1];
      if (!_here || _here.isOrigin || !_here.portions || _here.portions.length === 0) continue;
      if (!_next || !_next.portions || _next.portions.length === 0) continue;
      var _lastPhase = _here.portions[_here.portions.length - 1].phase;
      var _nextFirst = _next.portions[0].phase;
      if (_lastPhase === "SUBIDA" && _nextFirst !== "SUBIDA") _here.phaseHint = "TOC";
      else if (_lastPhase === "DESCIDA" && _nextFirst !== "DESCIDA") _here.phaseHint = "BOD";
      else if (_lastPhase !== "SUBIDA" && _nextFirst === "SUBIDA") _here.phaseHint = "BOC";
      else if (_lastPhase !== "DESCIDA" && _nextFirst === "DESCIDA") _here.phaseHint = "TOD";
    }

    // Project lat/lon for waypoints without explicit coords using TC + dist
    // Forward pass: project from each known coord to subsequent unknown waypoints
    for (var _fi = 1; _fi < _res.length; _fi++) {
      if (_res[_fi].lat == null && _res[_fi-1].lat != null
          && _res[_fi].tc != null && (_res[_fi].dist ?? 0) > 0) {
        var _fp = projectDest(_res[_fi-1].lat, _res[_fi-1].lon, _res[_fi].tc, _res[_fi].dist);
        _res[_fi] = Object.assign({}, _res[_fi], { lat: _fp[0], lon: _fp[1], coordProjected: true });
      }
    }
    // Backward pass: project from each known coord back through unknown predecessors
    for (var _bi = _res.length - 2; _bi >= 0; _bi--) {
      if (_res[_bi].lat == null && _res[_bi+1].lat != null
          && _res[_bi+1].tc != null && (_res[_bi+1].dist ?? 0) > 0) {
        var _bp = projectSource(_res[_bi+1].lat, _res[_bi+1].lon, _res[_bi+1].tc, _res[_bi+1].dist);
        _res[_bi] = Object.assign({}, _res[_bi], { lat: _bp[0], lon: _bp[1], coordProjected: true });
      }
    }
    return _res;
  }, [flight, ac, geomagReady]);

  // Próximo checkpoint não cruzado
  const nextIdx = useMemo(() => {
    const idx = computed.findIndex((cp) => !cp.isOrigin && cp.ata == null);
    return idx === -1 ? computed.length : idx;
  }, [computed]);

  // ETA em voo: último ATA (ou ATD) + ETE das pernas seguintes
  // Se temos GS real do último ponto cruzado, recomputa ETE futuro com esse GS
  // Map: legIdx -> [{ label, autoKey, dist (planned, NM into the leg), time (planned, min into the leg) }]
  // Mirrors the autoKey numbering used by liveRoute below so we can look up virtual ATAs per leg.
  const legVirtualsMap = useMemo(() => {
    const map = {};
    const counters = {};
    computed.forEach((cp, i) => {
      if (cp.isOrigin || !cp.portions || cp.portions.length <= 1) return;
      const list = [];
      let accDist = 0, accTime = 0;
      for (let p = 0; p < cp.portions.length - 1; p++) {
        accDist += cp.portions[p].dist || 0;
        accTime += cp.portions[p].timeMin || 0;
        const label = portionTransitionLabel(cp.portions[p].phase, cp.portions[p + 1].phase);
        if (!label) continue;
        list.push({ label, autoKey: nextAutoKey(label, counters), dist: accDist, time: accTime });
      }
      if (list.length > 0) map[i] = list;
    });
    return map;
  }, [computed]);

  const liveETAs = useMemo(() => {
    const etas = computed.map(() => null);
    let lastCrossed = null;
    for (let i = computed.length - 1; i >= 0; i--) {
      if (computed[i].ata != null) { lastCrossed = i; break; }
    }
    let baseMin, baseIdx;
    if (lastCrossed != null) {
      baseMin = parseHHMM(computed[lastCrossed].ata);
      baseIdx = lastCrossed;
      etas[lastCrossed] = baseMin;
    } else if (flight.atd) {
      baseMin = parseHHMM(flight.atd);
      baseIdx = 0;
    } else {
      return etas;
    }
    let cumMin = baseMin;
    for (let i = baseIdx + 1; i < computed.length; i++) {
      const cp = computed[i];
      // Bypassed WPs (skipped via direct-to) don't consume time and don't
      // belong in the live sequence — the deviation override on the target
      // leg already accounts for the actual flown distance.
      if (cp.bypassed) { etas[i] = null; continue; }
      const legStartMin = cumMin;
      let legETE = cp.etePlanned;

      // Active deviation override: if this leg is the deviation target, replace
      // the planned ETE with one computed from the pilot's current position +
      // current TAS (wind-corrected). Cascades downstream legs naturally.
      const dev = flight.activeDeviation;
      if (dev && dev.targetIdx === i && dev.fromLat != null && dev.fromLon != null
          && cp.lat != null && cp.lon != null) {
        const devDist = gcDist(dev.fromLat, dev.fromLon, cp.lat, cp.lon);
        const devTas  = Number(dev.currentTas) || (ac && ac.tasCruise) || 100;
        const devTC   = gcTC(dev.fromLat, dev.fromLon, cp.lat, cp.lon);
        const r = calcLeg(devTC, devDist, devTas, flight.windDir, flight.windVel, flight.variation, 0);
        legETE = r.ete;
        const devStartMin = parseHHMM(dev.startedAt);
        if (devStartMin != null) {
          cumMin = devStartMin + legETE;
          etas[i] = cumMin;
          continue;
        }
        // Fall through: cumMin += legETE below
      }

      // Adjust ETE based on the latest marked virtual (TOC/TOD/BOD) on this leg.
      // Model: actual_GS in the climb/descent phase equals planned_GS, so reaching
      // TOC X minutes off plan means we covered planned_dist * (X / planned_time).
      // The remaining distance after the virtual runs at the planned post-virtual GS.
      const virtuals = legVirtualsMap[i];
      if (virtuals && virtuals.length > 0 && (cp.dist || 0) > 0 && (cp.etePlanned || 0) > 0) {
        const marked = [];
        for (const v of virtuals) {
          const ata = parseHHMM(flight.autoWpATAs?.[v.autoKey]);
          if (ata != null) marked.push({ ...v, ata });
        }
        if (marked.length > 0) {
          const last = marked[marked.length - 1];
          const actualTimeToVirtual = last.ata - legStartMin;
          if (actualTimeToVirtual > 0 && last.time > 0) {
            const actualDistToVirtual = last.dist * (actualTimeToVirtual / last.time);
            const remPlannedDist = cp.dist - last.dist;
            const remPlannedTime = cp.etePlanned - last.time;
            const remDist = cp.dist - actualDistToVirtual;
            const remGS = remPlannedDist > 0 && remPlannedTime > 0 ? remPlannedDist / remPlannedTime : null;
            const remTime = (remGS && remDist > 0) ? remDist / remGS : remPlannedTime;
            legETE = actualTimeToVirtual + Math.max(0, remTime);
          }
        }
      }

      cumMin = legStartMin + legETE;
      etas[i] = cumMin;
    }
    return etas;
  }, [computed, flight.atd, flight.autoWpATAs, flight.activeDeviation, flight.windDir, flight.windVel, flight.variation, ac, legVirtualsMap]);

  // Rota expandida com TOC/TOD/BOD virtuais interpolados entre as pernas
  const liveRoute = useMemo(() => {
    const result = [];
    const counters = {};
    computed.forEach((cp, i) => {
      if (cp.isOrigin) { result.push({ ...cp, userIdx: i }); return; }
      const prevEta = i > 0 ? computed[i - 1].etaPlanned : (parseHHMM(flight.eobt) ?? 0);
      const prevAlt = i > 0 ? computed[i - 1].alt : 0;
      const prevLat  = i > 0 ? computed[i - 1].lat  : null;
      const prevLon  = i > 0 ? computed[i - 1].lon  : null;
      // Actual leg-start time: prefer the ATA of the previous fix when it has been crossed.
      const prevAtaStr = i > 0 ? computed[i - 1].ata : null;
      const legStartActual = prevAtaStr ? parseHHMM(prevAtaStr) : prevEta;
      // Bypassed legs are not flown — emit the WP itself (so it still renders
      // greyed-out in the route list) but skip the TOC/TOD/BOD interpolation.
      if (cp.portions?.length > 1 && !cp.bypassed) {
        let accDist = 0, accETE = 0;
        let prevVirtETE = 0, prevVirtDist = 0;
        // Total leg time from portions (sum of timeMin), used to distribute etePlanned by phase
        const totalLegTime = cp.portions.reduce((s, p) => s + (p.timeMin ?? 0), 0);
        for (let p = 0; p < cp.portions.length - 1; p++) {
          const por = cp.portions[p];
          // Time fraction: portion's timeMin share of total leg time
          const timeFrac = totalLegTime > 0 && (por.timeMin ?? 0) > 0
            ? por.timeMin / totalLegTime
            : (cp.dist > 0 ? por.dist / cp.dist : 0);
          accDist += por.dist;
          accETE += timeFrac * cp.etePlanned;
          const label = portionTransitionLabel(por.phase, cp.portions[p + 1].phase);
          if (label) {
            const autoKey = nextAutoKey(label, counters);
            const ataStr = flight.autoWpATAs?.[autoKey] ?? null;
            const ataMin = parseHHMM(ataStr);
            const eteLeg = accETE - prevVirtETE;
            const distLeg = accDist - prevVirtDist;
            // Visual position: when the virtual has been marked, shift it along the leg to the
            // distance the user actually covered (assuming planned phase GS).
            let displayDist = accDist;
            if (ataMin != null && accETE > 0) {
              const actualTime = ataMin - legStartActual;
              if (actualTime > 0) {
                const actualDist = accDist * (actualTime / accETE);
                displayDist = Math.max(0, Math.min(cp.dist || actualDist, actualDist));
              }
            }
            const vFrac = cp.dist > 0 ? displayDist / cp.dist : 0;
            const [vLat, vLon] = (prevLat != null && cp.lat != null)
              ? gcInterpolate(prevLat, prevLon, cp.lat, cp.lon, Math.max(0, Math.min(1, vFrac))) : [null, null];
            result.push({
              name: label, isVirtual: true, autoKey, userIdx: i,
              // TOC/BOD = leveled at dest alt; BOC/TOD = still at src alt
              alt: (label === "TOC" || label === "BOD") ? cp.alt : (prevAlt ?? cp.alt),
              lat: vLat, lon: vLon,
              tc: cp.tc, mh: cp.mh, mc: cp.mc, wca: cp.wca,
              windMode: cp.windMode, windDirUsed: cp.windDirUsed, windVelUsed: cp.windVelUsed,
              dist: Math.round(displayDist * 10) / 10,
              distToNext: Math.round(((cp.dist || 0) - displayDist) * 10) / 10,
              etePlanned: accETE,
              eteLeg: Math.round(eteLeg * 10) / 10,
              distLeg: Math.round(distLeg * 100) / 100,
              etaPlanned: prevEta + accETE,
              ata: ataStr,
              gsActual: null, portions: [], warnings: [], notes: "",
            });
            prevVirtETE = accETE;
            prevVirtDist = accDist;
          }
        }
        // User waypoint gets the remaining segment after the last virtual point
        const eteLeg = cp.etePlanned - prevVirtETE;
        const distLeg = cp.dist - prevVirtDist;
        result.push({ ...cp, userIdx: i, eteLeg, distLeg });
      } else {
        result.push({ ...cp, userIdx: i });
      }
    });
    return result;
  }, [computed, flight.autoWpATAs, flight.eobt]);

  // Próximo item não cruzado na liveRoute (inclui TOC/TOD virtuais)
  const nextLiveIdx = useMemo(() => {
    for (let i = 0; i < liveRoute.length; i++) {
      const item = liveRoute[i];
      if (item.isOrigin || item.ata != null) continue;
      // Direct-to bypass: a WP marked as bypassed is no longer in the active
      // sequence — the live "next" must skip over to the deviation target.
      if (item.bypassed) continue;
      if (item.isVirtual) {
        // Pular se o próximo waypoint de usuário já foi cruzado
        const nextUser = liveRoute.slice(i + 1).find(x => !x.isVirtual && !x.isOrigin);
        if (nextUser?.ata != null) continue;
      }
      return i;
    }
    return liveRoute.length;
  }, [liveRoute]);

  function markVirtual(key) {
    haptic([40]); warmUpAudio();
    const now = nowHHMM();
    setFlight((f) => ({ ...f, autoWpATAs: { ...(f.autoWpATAs || {}), [key]: formatHHMMSS(now) } }));
    setLegTimerStart(Date.now());
  }
  function unmarkVirtual(key) {
    setFlight((f) => { const m = { ...(f.autoWpATAs || {}) }; delete m[key]; return { ...f, autoWpATAs: m }; });
  }
  function setVirtualAta(key, ataStr) {
    setFlight((f) => ({ ...f, autoWpATAs: { ...(f.autoWpATAs || {}), [key]: ataStr } }));
  }

  // Combustível restante real (baseado em ATAs reais consumindo no GPH planejado)
  const liveFuel = useMemo(() => {
    const fuelStart = flight.fuelInitial ?? ac.fuelUsable;
    let fuel = fuelStart;
    return computed.map((cp, i) => {
      if (cp.isOrigin) return fuel;
      // Se tem ATA real, usa tempo real
      if (cp.ata != null && i > 0) {
        const prevAta = computed[i - 1].ata != null
          ? parseHHMM(computed[i - 1].ata)
          : (i - 1 === 0 ? parseHHMM(flight.atd ?? flight.eobt) : null);
        if (prevAta != null) {
          const ataMin = parseHHMM(cp.ata);
          let elapsed = ataMin - prevAta;
          if (elapsed < 0) elapsed += 1440;
          fuel -= (elapsed / 60) * (cp.gphEffective || ac.gphCruise);
          return fuel;
        }
      }
      return null; // não cruzado ainda
    });
  }, [computed, flight, ac]);

  // Marca checkpoint como cruzado (registra ATA = agora UTC, calcula GS real)
  function markCrossed(i) {
    haptic([60]); warmUpAudio();
    const now = nowHHMM();
    setAta(i, formatHHMMSS(now));
    setLegTimerStart(Date.now()); // inicia cronômetro de perna
  }

  // Salvar nota de um waypoint
  function saveNote(i, text) {
    setFlight((f) => {
      const cps = [...f.checkpoints];
      cps[i] = { ...cps[i], notes: text };
      return { ...f, checkpoints: cps };
    });
  }

  // Define ATA manualmente (string "hh:mm"); calcula GS real automaticamente
  function setAta(i, ataStr) {
    setFlight((f) => {
      const cps = [...f.checkpoints];
      const ataMin = parseHHMM(ataStr);
      if (ataMin == null) {
        cps[i] = { ...cps[i], ata: null, gsActual: null };
        return { ...f, checkpoints: cps };
      }
      // Acha tempo do checkpoint anterior (ATA real, ou ATD/EOBT se for o primeiro depois da origem)
      const prev = cps[i - 1];
      let prevTime;
      if (prev.isOrigin) {
        prevTime = parseHHMM(f.atd ?? f.eobt);
      } else {
        prevTime = prev.ata != null ? parseHHMM(prev.ata) : null;
      }
      let gsActual = null;
      if (prevTime != null && cps[i].dist > 0) {
        let elapsed = ataMin - prevTime;
        if (elapsed < 0) elapsed += 1440;
        if (elapsed > 0) gsActual = (cps[i].dist / elapsed) * 60;
      }
      cps[i] = { ...cps[i], ata: ataStr, gsActual };
      // Auto-clear an active deviation when its target gets a real ATA — the
      // adjustment leg has been consumed and the original plan resumes.
      var nextDev = f.activeDeviation;
      if (ataStr != null && nextDev && nextDev.targetIdx === i) nextDev = null;
      return { ...f, checkpoints: cps, activeDeviation: nextDev };
    });
  }

  function setDeviation(dev) {
    setFlight(function(f) {
      var cps = (dev && dev.targetIdx != null)
        ? applyDirectTo(f.checkpoints, dev.targetIdx)
        : f.checkpoints;
      return Object.assign({}, f, { checkpoints: cps, activeDeviation: dev });
    });
  }
  // One-tap direct-to from the FlightTab route list. Uses the live estimated
  // position as the deviation anchor so the pilot doesn't have to drop a pin.
  function directToWp(targetIdx) {
    setFlight(function(f) {
      var target = f.checkpoints[targetIdx];
      if (!target || target.lat == null || target.lon == null) return f;
      // Compute estimated position on the same selector the map / big-mode
      // already use, so all three views agree on "where we are now".
      var est = estimatedPosition({
        liveRoute, liveETAs, flight: f,
        nowMin: nowHHMM(),
        eobtMin: parseHHMM(f.eobt) ?? 0,
      });
      if (!est) {
        // Fall back to opening the full deviation panel — pilot can drop a pin.
        return Object.assign({}, f, {});
      }
      if (typeof window !== "undefined" && typeof window.confirm === "function") {
        var ok = window.confirm("Direct to " + (target.name || ("WP " + targetIdx)) + " a partir da posição estimada?");
        if (!ok) return f;
      }
      var dev = {
        fromLat: Math.round(est.lat * 1e6) / 1e6,
        fromLon: Math.round(est.lon * 1e6) / 1e6,
        targetIdx: Number(targetIdx),
        currentAlt: target.alt != null ? Number(target.alt) : (f.cruiseAlt ?? 7000),
        currentTas: ac && ac.tasCruise ? ac.tasCruise : 100,
        startedAt: formatHHMMSS(nowHHMM()),
      };
      return Object.assign({}, f, {
        checkpoints: applyDirectTo(f.checkpoints, targetIdx),
        activeDeviation: dev,
      });
    });
  }
  // Manual "Voltar à rota": pilot is reinstating the original plan, so the
  // bypassed WPs come back into the live sequence. (The auto-clear in setAta
  // when target ATA is recorded keeps the bypassed flags — at that point those
  // WPs are genuinely behind the aircraft.)
  function clearDeviation() {
    setFlight(function(f) {
      var c = Object.assign({}, f, { checkpoints: clearDirectTo(f.checkpoints) });
      delete c.activeDeviation;
      return c;
    });
  }

  function unmark(i) {
    setFlight((f) => {
      const cps = [...f.checkpoints];
      cps[i] = { ...cps[i], ata: null, gsActual: null };
      return { ...f, checkpoints: cps };
    });
  }

  function moveUp(i) {
    if (i <= 1) return;
    setFlight((f) => {
      const cps = [...f.checkpoints];
      [cps[i - 1], cps[i]] = [cps[i], cps[i - 1]];
      return { ...f, checkpoints: cps };
    });
  }

  function reorder(fromIdx, toIdx) {
    if (fromIdx === toIdx || fromIdx <= 0 || toIdx <= 0) return;
    setFlight((f) => {
      const cps = [...f.checkpoints];
      const [item] = cps.splice(fromIdx, 1);
      cps.splice(toIdx, 0, item);
      return { ...f, checkpoints: cps };
    });
  }

  function moveDown(i) {
    setFlight((f) => {
      if (i >= f.checkpoints.length - 1) return f;
      if (i === 0) return f;
      const cps = [...f.checkpoints];
      [cps[i], cps[i + 1]] = [cps[i + 1], cps[i]];
      return { ...f, checkpoints: cps };
    });
  }

  function resetFlight() {
    setFlight((f) => ({
      ...f,
      atd: null,
      autoWpATAs: {},
      windVel: 0,
      checkpoints: f.checkpoints.map((cp) =>
        cp.isOrigin ? cp : { ...cp, ata: null, gsActual: null }
      ),
    }));
    setLegTimerStart(null);
  }

  function depart() {
    haptic([50, 30, 50, 30, 80]); warmUpAudio();
    const now = nowHHMM();
    setFlight((f) => ({ ...f, atd: formatHHMMSS(now) }));
    setLegTimerStart(Date.now());
  }

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

  // ----- Calcular TOC/TOD automaticamente -----
  function calcTOCTOD() {
    setFlight((f) => {
      const cps = [...f.checkpoints];

      // ── 1. Reconstruir rota limpa ──────────────────────────────────────────
      // Remove TOC/TOD e colapsa as pernas que foram divididas na iteração anterior.
      // Uma perna foi dividida se dois checkpoints consecutivos têm o mesmo TC.
      // Estratégia: primeiro filtrar TOC/TOD, depois fundir consecutivos com TC igual.
      const noTOCTOD = cps.filter((cp, i) => i === 0 || (cp.name !== "TOC" && cp.name !== "TOD"));

      // Fundir consecutivos com TC igual (fragmentos de perna dividida)
      const merged = [noTOCTOD[0]];
      for (let i = 1; i < noTOCTOD.length; i++) {
        const prev = merged[merged.length - 1];
        const cur = noTOCTOD[i];
        // Dois fragmentos têm o mesmo TC e um deles foi a "segunda metade" (não tem nome especial)
        if (
          !prev.isOrigin &&
          prev.tc === cur.tc &&
          prev.name !== cur.name // nomes diferentes = dois WP reais, não fundir
        ) {
          // Fundir: o ponto "real" é o cur (tem o nome original), dist somada
          merged[merged.length - 1] = {
            ...cur,
            dist: Math.round((prev.dist + cur.dist) * 10) / 10,
          };
        } else {
          merged.push(cur);
        }
      }

      const cleaned = merged;
      if (cleaned.length < 2) {
        alert("Adicione pelo menos um waypoint além da origem antes de calcular TOC/TOD.");
        return f;
      }

      // ── 2. Calcular distâncias de subida e descida ─────────────────────────
      const origElev = Number(f.freqs?.origin?.elev) || 0;
      const destElev = Number(f.freqs?.destination?.elev) || 0;
      const cruiseAlt = Number(f.cruiseAlt) || 7000;
      const ac = FLEET_DEFAULTS[f.aircraftKey];

      const climbDist = Math.round(
        ((ac.vy + 10) / 60) * ((cruiseAlt - origElev) / ac.rocClimb) * 10
      ) / 10;
      const descDist = Math.round(
        (ac.vDescent / 60) * ((cruiseAlt - destElev) / ac.rodDescent) * 10
      ) / 10;

      const routeDist = cleaned.slice(1).reduce((s, cp) => s + (cp.dist || 0), 0);

      if (climbDist + descDist > routeDist) {
        alert(
          `Rota muito curta para subir até ${cruiseAlt} ft.\n` +
          `Subida: ${climbDist.toFixed(1)} NM · Descida: ${descDist.toFixed(1)} NM\n` +
          `Total necessário: ${(climbDist + descDist).toFixed(1)} NM · Rota: ${routeDist.toFixed(1)} NM`
        );
        return f;
      }

      // ── 3. Inserir TOC e TOD na rota limpa ────────────────────────────────
      const todAt = routeDist - descDist; // dist acumulada onde TOD ocorre
      const out = [cleaned[0]];
      let acc = 0;
      let tocInserted = false;
      let todInserted = false;

      for (let i = 1; i < cleaned.length; i++) {
        const cp = cleaned[i];
        const legStart = acc;
        const legEnd = acc + (cp.dist || 0);
        const SNAP = 0.5; // NM mínimos para inserir ponto separado

        // TOC cai nesta perna?
        if (!tocInserted && climbDist > legStart && climbDist <= legEnd) {
          const dToTOC   = Math.round((climbDist - legStart) * 10) / 10;
          const dFromTOC = Math.round((legEnd - climbDist) * 10) / 10;
          if (dToTOC >= SNAP && dFromTOC >= SNAP) {
            out.push({ name: "TOC", phase: "SUBIDA",   tc: cp.tc, dist: dToTOC,   ata: null, gsActual: null });
            out.push({ ...cp,       phase: "CRUZEIRO",             dist: dFromTOC });
          } else {
            // Muito próximo de um extremo: sobe TOC para o WP vizinho mais próximo
            out.push({ ...cp, phase: dToTOC < SNAP ? "SUBIDA" : "CRUZEIRO" });
          }
          tocInserted = true;
          acc = legEnd;
          continue;
        }

        // TOD cai nesta perna?
        if (tocInserted && !todInserted && todAt > legStart && todAt <= legEnd) {
          const dToTOD   = Math.round((todAt - legStart) * 10) / 10;
          const dFromTOD = Math.round((legEnd - todAt) * 10) / 10;
          if (dToTOD >= SNAP && dFromTOD >= SNAP) {
            out.push({ name: "TOD", phase: "CRUZEIRO", tc: cp.tc, dist: dToTOD,   ata: null, gsActual: null });
            out.push({ ...cp,       phase: "DESCIDA",              dist: dFromTOD });
          } else {
            out.push({ ...cp, phase: dToTOD < SNAP ? "CRUZEIRO" : "DESCIDA" });
          }
          todInserted = true;
          acc = legEnd;
          continue;
        }

        // Waypoint normal: atribui fase pelo posicionamento
        const phase = !tocInserted ? "SUBIDA" : !todInserted ? "CRUZEIRO" : "DESCIDA";
        out.push({ ...cp, phase });
        acc = legEnd;
      }

      return { ...f, checkpoints: out };
    });
  }

  // ----- Preferências -----
  function savePrefs(p) {
    setPrefs(p);
    try { if (window.storage) window.storage.set("prefs", JSON.stringify(p)); } catch (e) { _warn('savePrefs:storage', e); }
    try { localStorage.setItem("navlog_prefs", JSON.stringify(p)); } catch (e) { _warn('savePrefs:localStorage', e); }
  }

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

  // Persistência — storage do artifact + fallback localStorage
  const store = {
    async get(key) {
      try {
        if (window.storage) {
          const r = await window.storage.get(key);
          if (r?.value) return r.value;
        }
      } catch (e) { _warn('store.get:storage:' + key, e); }
      try { return localStorage.getItem("navlog_" + key); } catch (e) { _warn('store.get:localStorage:' + key, e); }
      return null;
    },
    async set(key, value) {
      try { if (window.storage) await window.storage.set(key, value); } catch (e) { _warn('store.set:storage:' + key, e); }
      try { localStorage.setItem("navlog_" + key, value); } catch (e) { _warn('store.set:localStorage:' + key, e); }
    },
  };

  useEffect(() => {
    (async () => {
      try {
        const r = await store.get("flight");
        if (r) {
          const loaded = JSON.parse(r);
          // Strip legacy isAuto waypoints from previous deploy
          if (loaded.checkpoints) loaded.checkpoints = loaded.checkpoints.filter(cp => !cp.isAuto);
          setFlight({ ...DEFAULT_FLIGHT, ...loaded });
        }
        const rr = await store.get("routes");
        if (rr) setSavedRoutes(JSON.parse(rr));
        const pp = await store.get("prefs");
        if (pp) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(pp) });
        // Load PDF overlays from IndexedDB (stores warped dataUrl + bounds)
        var idbOverlays = await getAllPdfOverlaysIdb();
        if (idbOverlays.length > 0) {
          // Filter to records with usable warped data + bounds.
          var valid = idbOverlays.filter(function(r) { return r.dataUrl && r.bounds; });
          // Sort by stored `order` ASC (bottom-to-top in z-stack); fall back to
          // `id` (creation timestamp) for legacy records without `order`. Mixed
          // datasets (some new, some legacy) get re-normalized below so values
          // can't end up comparing 0..N against billion-scale timestamps.
          valid.sort(function(a, b) {
            var ao = (a.order != null) ? a.order : a.id;
            var bo = (b.order != null) ? b.order : b.id;
            return ao - bo;
          });
          // Re-assign sequential orders so the canonical array index always
          // matches the persisted `order` after load. Sync effect writes back.
          setPdfOverlays(valid.map(function(o, i) { return Object.assign({}, o, { order: i }); }));
        }
      } catch (e) { _warn('initial load (flight/routes/prefs/overlays)', e); }
      // Mark the initial load as complete so the cleanup effect can run safely.
      setPdfLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!pdfLoaded) return; // skip until async load completes — avoids overwriting artifact storage with the in-memory default
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
      savePdfOverlayIdb(o, null); // handle was saved separately on creation
    });
    // Clean up deleted overlays
    var ids = new Set(pdfOverlays.map(function(o) { return o.id; }));
    getAllPdfOverlaysIdb().then(function(all) {
      all.forEach(function(rec) { if (!ids.has(rec.id)) deletePdfHandle(rec.id); });
    }).catch(function() {});
  }, [pdfOverlays, pdfLoaded]);

  useEffect(() => {
    try { localStorage.setItem('navlog_fleet', JSON.stringify(fleet)); } catch (e) { _warn('save fleet', e); }
  }, [fleet]);

  const glowStyle = theme.glow ? "text-shadow: 0 0 8px currentColor;" : "";

  // Estilos compartilhados — paleta cockpit dark
  return (
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
        )}
        {tab === "flight" && (
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
        )}
        {tab === "fuel" && (
          <FuelTab flight={flight} computed={computed} liveFuel={liveFuel} ac={ac} theme={theme} />
        )}
        {tab === "log" && (
          <LogTab flight={flight} computed={computed} liveFuel={liveFuel} ac={ac} theme={theme} />
        )}
        {tab === "map" && (
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
  );
}

// ================= COMPONENTES =================
function LiveClock({ theme }) {
  const [t, setT] = useState(nowHHMM());
  useEffect(() => {
    const id = setInterval(() => setT(nowHHMM()), 1000 * 10);
    return () => clearInterval(id);
  }, []);
  return <div className={`text-sm font-bold num ${theme?.cyan || "text-cyan-400"} cockpit-glow`}>{formatHHMM(t)}</div>;
}

function TabButton({ active, onClick, icon, label, theme }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center py-3 gap-1 transition-colors ${
        active ? (theme?.accent || "text-amber-400") : (theme?.fgFaint || "text-zinc-500")
      }`}
    >
      {icon}
      <span className="text-[10px] uppercase tracking-wider font-bold">{label}</span>
    </button>
  );
}


function DeviationPanel({ flight, ac, theme, defaultTargetIdx, pdfOverlays, onApply, onClear, onClose }) {
  const dev = flight.activeDeviation || null;
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const posMarkerRef = useRef(null);
  const previewLineRef = useRef(null);
  const targetMarkerRef = useRef(null);
  const pdfLayerRefs = useRef({});

  const [pos, setPos] = useState(dev ? [dev.fromLat, dev.fromLon] : null);
  const [alt, setAlt] = useState(dev != null && dev.currentAlt != null ? dev.currentAlt : (flight.cruiseAlt ?? 7000));
  const [tas, setTas] = useState(dev != null && dev.currentTas != null ? dev.currentTas : (ac && ac.tasCruise ? ac.tasCruise : 100));
  const [targetIdx, setTargetIdx] = useState(dev && dev.targetIdx != null ? dev.targetIdx : (defaultTargetIdx != null ? defaultTargetIdx : null));

  const targetOptions = (flight.checkpoints || [])
    .map((cp, i) => ({ cp, i }))
    .filter(x => x.cp && !x.cp.isOrigin && x.cp.lat != null && x.cp.lon != null
      && (x.cp.ata == null || (dev && dev.targetIdx === x.i))
      && (!x.cp.bypassed || (dev && dev.targetIdx === x.i)));

  // Init map
  useEffect(() => {
    if (!window.L || !mapDivRef.current || mapRef.current) return;
    const map = window.L.map(mapDivRef.current, { zoomControl: true, zoomSnap: 0, zoomDelta: 0.25, wheelPxPerZoomLevel: 90 });
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 18, keepBuffer: 4,
    }).addTo(map);
    map.createPane('devRoute');
    map.getPane('devRoute').style.zIndex = 500;
    map.getPane('devRoute').style.pointerEvents = 'none';

    const wps = (flight.checkpoints || []).filter(cp => cp.lat != null && cp.lon != null);
    if (wps.length >= 2) {
      const coords = wps.map(cp => [cp.lat, cp.lon]);
      window.L.polyline(coords, { color: '#f59e0b', weight: 2, opacity: 0.65, dashArray: '4,4', pane: 'devRoute' }).addTo(map);
      wps.forEach(cp => {
        const html = `<div style="background:#a855f7;border-radius:50%;width:10px;height:10px;border:2px solid #fff;box-shadow:0 1px 3px #000"></div>`;
        const icon = window.L.divIcon({ html, className: '', iconSize: [10,10], iconAnchor: [5,5] });
        window.L.marker([cp.lat, cp.lon], { icon, pane: 'devRoute' }).addTo(map).bindPopup(cp.name || '');
      });
      map.fitBounds(window.L.latLngBounds(coords), { padding: [60,60] });
    } else if (wps.length === 1) {
      map.setView([wps[0].lat, wps[0].lon], 9);
    } else {
      map.setView([39.5, -8.0], 6);
    }

    map.on('click', (e) => setPos([e.latlng.lat, e.latlng.lng]));

    mapRef.current = map;
    const t = setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 50);
    return () => { clearTimeout(t); map.remove(); mapRef.current = null; };
  }, []);

  // Render PDF overlays
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L || !pdfOverlays) return;
    Object.keys(pdfLayerRefs.current).forEach(id => { try { pdfLayerRefs.current[id].remove(); } catch (_) {} });
    pdfLayerRefs.current = {};
    pdfOverlays.forEach(ov => {
      if (!ov.visible || !ov.dataUrl || !ov.bounds) return;
      const layer = window.L.imageOverlay(ov.dataUrl, ov.bounds, {
        opacity: ov.opacity != null ? ov.opacity : 0.7, interactive: false, zIndex: 450,
      }).addTo(map);
      pdfLayerRefs.current[ov.id] = layer;
    });
    return () => {
      Object.keys(pdfLayerRefs.current).forEach(id => { try { pdfLayerRefs.current[id].remove(); } catch (_) {} });
      pdfLayerRefs.current = {};
    };
  }, [pdfOverlays]);

  // Target waypoint marker (cyan)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L) return;
    if (targetMarkerRef.current) { map.removeLayer(targetMarkerRef.current); targetMarkerRef.current = null; }
    const target = targetIdx != null ? flight.checkpoints[targetIdx] : null;
    if (target && target.lat != null && target.lon != null) {
      const html = `<div style="background:#22d3ee;border-radius:50%;width:14px;height:14px;border:3px solid #fff;box-shadow:0 0 6px rgba(34,211,238,0.7)"></div>`;
      const icon = window.L.divIcon({ html, className: '', iconSize: [14,14], iconAnchor: [7,7] });
      targetMarkerRef.current = window.L.marker([target.lat, target.lon], { icon, pane: 'devRoute', zIndexOffset: 800 }).addTo(map);
      targetMarkerRef.current.bindPopup('Alvo · ' + (target.name || ''));
    }
  }, [targetIdx]);

  // Picked position marker + preview line to target
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L) return;
    if (posMarkerRef.current) { map.removeLayer(posMarkerRef.current); posMarkerRef.current = null; }
    if (previewLineRef.current) { map.removeLayer(previewLineRef.current); previewLineRef.current = null; }
    if (!pos) return;
    const html = `<div style="background:#22c55e;border-radius:50%;width:18px;height:18px;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.9)"></div>`;
    const icon = window.L.divIcon({ html, className: '', iconSize: [18,18], iconAnchor: [9,9] });
    posMarkerRef.current = window.L.marker(pos, { icon, zIndexOffset: 900 }).addTo(map);

    const target = targetIdx != null ? flight.checkpoints[targetIdx] : null;
    if (target && target.lat != null && target.lon != null) {
      previewLineRef.current = window.L.polyline([pos, [target.lat, target.lon]], {
        color: '#22d3ee', weight: 3, opacity: 0.95, dashArray: '8,6', pane: 'devRoute',
      }).addTo(map);
    }
  }, [pos, targetIdx]);

  // Compute preview metrics
  const target = targetIdx != null ? flight.checkpoints[targetIdx] : null;
  let pDist = null, pMC = null, pETE = null, pETA = null;
  if (pos && target && target.lat != null && target.lon != null) {
    pDist = gcDist(pos[0], pos[1], target.lat, target.lon);
    const tc = gcTC(pos[0], pos[1], target.lat, target.lon);
    const variation = flight.variation ?? 0;
    pMC = Math.round(((tc - variation) % 360 + 360) % 360);
    const tasN = Number(tas) || 100;
    const r = calcLeg(tc, pDist, tasN, flight.windDir, flight.windVel, variation, 0);
    pETE = r.ete;
    const startMin = nowHHMM();
    pETA = startMin + (r.ete || 0);
  }

  function handleApply() {
    if (pos == null || targetIdx == null) return;
    onApply({
      fromLat: Math.round(pos[0] * 1e6) / 1e6,
      fromLon: Math.round(pos[1] * 1e6) / 1e6,
      targetIdx: Number(targetIdx),
      currentAlt: Number(alt) || 0,
      currentTas: Number(tas) || 0,
      startedAt: formatHHMMSS(nowHHMM()),
    });
    onClose();
  }
  function handleClear() {
    onClear();
    onClose();
  }

  return (
    <div onClick={(e) => e.stopPropagation()}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', isolation: 'isolate' }}
      className={theme.bg}>
      <div className={`flex items-center gap-2 p-3 shrink-0 ${theme.panel} border-b ${theme.panelBorder}`}>
        <button onClick={onClose}
          className={`px-3 py-1.5 rounded-lg border text-sm ${theme.panelBorder} ${theme.fgFaint}`}>
          Cancelar
        </button>
        <span className={`flex-1 text-center text-sm font-bold ${theme.cyan}`}>
          {dev ? "Editar desvio" : "Reposicionar — toque na sua posição"}
        </span>
        {dev && (
          <button onClick={handleClear}
            className="px-3 py-1.5 rounded-lg border border-red-500 text-red-400 text-sm font-bold">
            Voltar à rota
          </button>
        )}
      </div>
      <div ref={mapDivRef} style={{ flex: 1, minHeight: 0 }} />
      <div className={`p-3 shrink-0 ${theme.panel} border-t ${theme.panelBorder} space-y-2`}>
        <div className="grid grid-cols-3 gap-2">
          <label className="space-y-0.5 block">
            <span className={`text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>Altitude (ft)</span>
            <input type="number" inputMode="numeric" value={alt}
              onChange={(e) => setAlt(e.target.value === '' ? '' : Number(e.target.value))}
              className={`w-full ${theme.inputBg} border ${theme.inputBorder} ${theme.fg} px-2 py-1.5 text-sm rounded num focus:outline-none focus:ring-2 focus:ring-amber-500/30`} />
          </label>
          <label className="space-y-0.5 block">
            <span className={`text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>TAS (kt)</span>
            <input type="number" inputMode="numeric" value={tas}
              onChange={(e) => setTas(e.target.value === '' ? '' : Number(e.target.value))}
              className={`w-full ${theme.inputBg} border ${theme.inputBorder} ${theme.fg} px-2 py-1.5 text-sm rounded num focus:outline-none focus:ring-2 focus:ring-amber-500/30`} />
          </label>
          <label className="space-y-0.5 block">
            <span className={`text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>Alvo</span>
            <select value={targetIdx ?? ''}
              onChange={(e) => setTargetIdx(e.target.value === '' ? null : Number(e.target.value))}
              className={`w-full ${theme.inputBg} border ${theme.inputBorder} ${theme.fg} px-2 py-1.5 text-sm rounded focus:outline-none focus:ring-2 focus:ring-amber-500/30`}>
              {targetIdx == null && <option value="">—</option>}
              {targetOptions.map(({ cp, i }) => (
                <option key={i} value={i}>{cp.name || ('WP ' + i)}</option>
              ))}
            </select>
          </label>
        </div>
        {pDist != null && (
          <div className={`text-center text-xs num ${theme.cyan}`}>
            {String(pMC).padStart(3, '0')}°M · {pDist.toFixed(1)} NM · {pETE.toFixed(1)} min · ETA {formatHHMM(pETA)}
          </div>
        )}
        <button onClick={handleApply}
          disabled={pos == null || targetIdx == null}
          className={`w-full py-3 rounded-xl font-bold text-base ${
            pos != null && targetIdx != null
              ? `${theme.accentBg} ${theme.accentBgFg ?? 'text-black'}`
              : `${theme.panel} ${theme.fgFaint} opacity-40`
          }`}>
          {dev ? "Atualizar desvio" : "Aplicar desvio"}
        </button>
      </div>
    </div>
  );
}



// =========================================================================
// WAYPOINT EDITOR — wizard em passos com teclados especializados
// =========================================================================
// Passos: NOME → ALT → TC → DIST → VENTO → PERF (overrides) → RESUMO
const WP_STEPS = ["nome", "coord", "alt", "tcdist", "vento", "override", "resumo"];

// -------- PASSO 1: NOME (teclado alfanumérico) --------
const ALPHA_ROWS = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["Z","X","C","V","B","N","M"],
];
const DIGIT_ROW = ["1","2","3","4","5","6","7","8","9","0"];


// ── Coordinate entry step ────────────────────────────────────────────────────
function StepCoord({ cp, setCp, prevCp, theme, onNext, allWps }) {
  // Pre-fill from existing cp coords
  const [showMapPicker, setShowMapPicker] = useState(false);

  function toDigits(dd, isLon) {
    if (dd == null) return [];
    const abs = Math.abs(dd);
    const deg = Math.floor(abs);
    const minTotal = (abs - deg) * 60;
    const minInt = Math.floor(minTotal);
    const minDec = Math.round((minTotal - minInt) * 100);
    const dc = isLon ? 3 : 2;
    return [
      ...String(deg).padStart(dc, '0').split('').map(Number),
      ...String(minInt).padStart(2, '0').split('').map(Number),
      ...String(minDec).padStart(2, '0').split('').map(Number),
    ];
  }

  const LAT_MAX = 6, LON_MAX = 7;
  const [latDigs, setLatDigs] = useState(() => cp.lat != null ? toDigits(cp.lat, false) : []);
  const [lonDigs, setLonDigs] = useState(() => cp.lon != null ? toDigits(cp.lon, true)  : []);
  const [latHem,  setLatHem]  = useState(() => cp.lat != null ? (cp.lat >= 0 ? 'N' : 'S') : 'N');
  const [lonHem,  setLonHem]  = useState(() => cp.lon != null ? (cp.lon >= 0 ? 'E' : 'W') : 'W');
  const editing = latDigs.length < LAT_MAX ? 'lat' : 'lon';

  function press(d) {
    if (editing === 'lat' && latDigs.length < LAT_MAX) {
      setLatDigs(p => [...p, d]);
    } else if (editing === 'lon' && lonDigs.length < LON_MAX) {
      setLonDigs(p => [...p, d]);
    }
  }
  function del() {
    if (editing === 'lon' && lonDigs.length === 0) setLatDigs(p => p.slice(0,-1));
    else if (editing === 'lon') setLonDigs(p => p.slice(0,-1));
    else setLatDigs(p => p.slice(0,-1));
  }
  function clear() { setLatDigs([]); setLonDigs([]); }

  const latVal = latDigs.length === LAT_MAX ? ddmDigitsToDecDeg(latDigs, false, latHem) : null;
  const lonVal = lonDigs.length === LON_MAX ? ddmDigitsToDecDeg(lonDigs, true,  lonHem) : null;
  const isValid = latVal != null && lonVal != null;

  function setFromLatLon(lat, lon) {
    setLatDigs(toDigits(lat, false));
    setLonDigs(toDigits(lon, true));
    setLatHem(lat >= 0 ? 'N' : 'S');
    setLonHem(lon >= 0 ? 'E' : 'W');
    setShowMapPicker(false);
  }

  // Display: fill placeholders as digits come in
  function renderField(digs, isLon, hem, active) {
    const dc = isLon ? 3 : 2;
    const p = (i) => digs[i] != null ? String(digs[i]) : '_';
    const degStr = isLon
      ? `${p(0)}${p(1)}${p(2)}`
      : `${p(0)}${p(1)}`;
    const minStr = `${p(dc)}${p(dc+1)}.${p(dc+2)}${p(dc+3)}`;
    return (
      <div className={`flex items-center justify-center gap-1 px-4 py-2 rounded-xl border ${
        active ? theme.accentBorder : theme.panelBorder
      } ${theme.panel}`}>
        <span className={`text-[10px] uppercase tracking-widest w-8 ${active ? theme.accent : theme.fgFaint}`}>
          {isLon ? 'LON' : 'LAT'}
        </span>
        <span className={`font-black num text-xl tracking-wider ${active ? theme.fg : theme.fgMuted}`}>
          {degStr}°{minStr}'
        </span>
        <button
          onClick={() => isLon ? setLonHem(h => h === 'E' ? 'W' : 'E') : setLatHem(h => h === 'N' ? 'S' : 'N')}
          className={`w-8 h-8 rounded-lg border font-bold text-sm ${theme.panelBorder} ${
            active ? `${theme.accentBg} text-black` : `${theme.panel} ${theme.fgFaint}`
          }`}>
          {hem}
        </button>
      </div>
    );
  }

  function confirm() {
    if (!isValid) return;
    const updates = { lat: latVal, lon: lonVal };
    if (prevCp?.lat != null && prevCp?.lon != null) {
      updates.tc   = Math.round(gcTC(prevCp.lat, prevCp.lon, latVal, lonVal));
      updates.dist = Math.round(gcDist(prevCp.lat, prevCp.lon, latVal, lonVal) * 10) / 10;
    }
    setCp(p => ({ ...p, ...updates }));
    onNext();
  }

  const numRows = [['7','8','9'],['4','5','6'],['1','2','3']];
  const keyBase = `${theme.panel} border ${theme.panelBorder} rounded-xl flex items-center justify-center font-bold text-xl active:scale-95 transition-transform duration-100 select-none`;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {renderField(latDigs, false, latHem, editing === 'lat')}
        {renderField(lonDigs, true,  lonHem, editing === 'lon')}
      </div>

      {prevCp?.lat != null && isValid && (
        <div className={`text-[10px] ${theme.cyan} text-center`}>
          TC {Math.round(gcTC(prevCp.lat, prevCp.lon, latVal, lonVal))}° ·{' '}
          {Math.round(gcDist(prevCp.lat, prevCp.lon, latVal, lonVal) * 10) / 10} NM (calculado)
        </div>
      )}

      {/* Map picker button */}
      <button onClick={() => setShowMapPicker(true)}
        className={`w-full py-2.5 rounded-xl border flex items-center justify-center gap-2 text-sm font-bold ${theme.panelBorder} ${theme.fgMuted}`}>
        <MapIcon className="w-4 h-4" /> Selecionar no mapa
      </button>

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-1.5">
        {numRows.map(row => row.map(k => (
          <button key={k} onClick={() => press(Number(k))}
            className={`${keyBase} h-12`}>{k}</button>
        )))}
        <button onClick={clear} className={`${keyBase} h-12 text-sm`}>CLR</button>
        <button onClick={() => press(0)} className={`${keyBase} h-12`}>0</button>
        <button onClick={del}  className={`${keyBase} h-12 text-sm`}>⌫</button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={onNext}
          className={`py-3 rounded-xl border ${theme.panelBorder} ${theme.fgFaint} font-bold text-sm`}>
          Pular →
        </button>
        <button onClick={confirm} disabled={!isValid}
          className={`py-3 rounded-xl font-bold text-sm ${
            isValid ? `${theme.accentBg} ${theme.accentBgFg ?? 'text-black'}` : `${theme.panel} ${theme.fgFaint} opacity-40`
          }`}>
          Confirmar →
        </button>
      </div>

      {showMapPicker && (
        <MapPicker
          allWps={allWps ?? []}
          initialPos={cp.lat != null ? [cp.lat, cp.lon] : null}
          onConfirm={setFromLatLon}
          onCancel={() => setShowMapPicker(false)}
          theme={theme}
        />
      )}
    </div>
  );
}

function StepNome({ cp, setCp, theme, onNext }) {
  const [name, setName] = useState(cp.name || "");
  const MAX = 10;

  function press(ch) {
    setName((prev) => {
      if (prev.length >= MAX) return prev;
      const next = prev + ch;
      setCp((p) => ({ ...p, name: next })); // sync immediately
      return next;
    });
  }
  function del() {
    setName((prev) => {
      const next = prev.slice(0, -1);
      setCp((p) => ({ ...p, name: next }));
      return next;
    });
  }
  function confirm() {
    if (!name) return;
    onNext(); // cp.name already synced on every keypress
  }

  const keyBase = `${theme.panel} border ${theme.panelBorder} rounded-lg flex items-center justify-center font-bold active:scale-95 transition-transform duration-100 select-none`;

  return (
    <div className="space-y-3">
      <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint} mb-1`}>Nome do Fix / Waypoint</div>

      {/* Display */}
      <div className={`${theme.panel} border-2 ${name ? theme.accentBorder : theme.panelBorder} rounded-xl px-4 py-3 flex items-center justify-between`}>
        <span className={`text-3xl font-black tracking-widest ${name ? theme.accent : theme.fgFaint} cockpit-glow`}>
          {name || "______"}
        </span>
        <span className={`text-xs ${theme.fgFaint} num`}>{name.length}/{MAX}</span>
      </div>

      {/* Teclado alfanumérico */}
      <div className="space-y-1.5">
        {/* Linha de dígitos */}
        <div className="grid grid-cols-10 gap-1">
          {DIGIT_ROW.map((ch) => (
            <button key={ch} onClick={() => press(ch)}
              className={`${keyBase} py-2.5 text-sm ${theme.fgMuted}`}>
              {ch}
            </button>
          ))}
        </div>
        {/* Linhas de letras */}
        {ALPHA_ROWS.map((row, ri) => (
          <div key={ri} className={`flex gap-1 ${ri === 1 ? "px-3" : ri === 2 ? "px-7" : ""}`}>
            {row.map((ch) => (
              <button key={ch} onClick={() => press(ch)}
                className={`${keyBase} flex-1 py-3 text-base ${theme.fg}`}>
                {ch}
              </button>
            ))}
          </div>
        ))}
        {/* Linha de ação */}
        <div className="grid grid-cols-3 gap-1.5 mt-1">
          <button onClick={del}
            className={`${keyBase} py-3 col-span-1 ${theme.fgMuted}`}>
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            disabled={!name}
            onClick={confirm}
            className={`col-span-2 ${theme.accentBg} disabled:opacity-40 ${theme.accentBgFg} rounded-xl py-3 font-bold text-base active:scale-95 transition-transform duration-100`}>
            Confirmar →
          </button>
        </div>
      </div>
    </div>
  );
}

// -------- PASSO: ALTITUDE --------
function StepAlt({ cp, setCp, cruiseAlt, prevAlt, isOrigin, theme, onNext }) {
  const useCruise = cp.useCruiseAlt ?? false;
  // "inherit" = no explicit altitude, no cruise flag → use previous anchor
  const useInherit = !useCruise && cp.alt == null && !isOrigin;

  function toggleCruise() {
    const next = !useCruise;
    setCp((p) => ({ ...p, useCruiseAlt: next, alt: next ? cruiseAlt : p.alt }));
  }
  function setInherit() {
    setCp((p) => ({ ...p, alt: null, useCruiseAlt: false }));
    onNext();
  }

  return (
    <div className="space-y-3">
      {/* Herdar altitude — only for non-origin waypoints */}
      {!isOrigin && (
        <button onClick={setInherit}
          className={`w-full flex items-center justify-between px-4 py-3 border-2 rounded-xl transition-colors ${
            useInherit ? `${theme.accentBorder} bg-amber-500/10` : `${theme.panelBorder} ${theme.panel}`
          }`}>
          <div className="text-left">
            <div className={`text-sm font-bold ${useInherit ? theme.accent : theme.fgMuted}`}>Herdar altitude</div>
            <div className={`text-[10px] ${theme.fgFaint}`}>Usa a altitude do segmento anterior</div>
          </div>
          <div className={`text-2xl font-black num cockpit-glow ${useInherit ? theme.accent : theme.fgFaint}`}>
            {prevAlt != null ? `${prevAlt} ft` : "—"}
          </div>
        </button>
      )}

      {/* Toggle: usar altitude de cruzeiro */}
      <button onClick={toggleCruise}
        className={`w-full flex items-center justify-between px-4 py-3 border-2 rounded-xl transition-colors ${
          useCruise ? `${theme.accentBorder} bg-amber-500/10` : `${theme.panelBorder} ${theme.panel}`
        }`}>
        <div className="text-left">
          <div className={`text-sm font-bold ${useCruise ? theme.accent : theme.fgMuted}`}>Altitude de cruzeiro</div>
          <div className={`text-[10px] ${theme.fgFaint}`}>Segue a alt. de cruzeiro do plano</div>
        </div>
        <div className={`text-2xl font-black num cockpit-glow ${useCruise ? theme.accent : theme.fgFaint}`}>
          {cruiseAlt} ft
        </div>
      </button>

      {useCruise ? (
        <button onClick={onNext}
          className={`w-full ${theme.accentBg} ${theme.accentBgFg ?? "text-black"} rounded-xl py-4 font-bold text-base active:scale-95 transition-transform duration-100`}>
          Confirmar → ({cruiseAlt} ft)
        </button>
      ) : (
        <StepNumerico
          theme={theme}
          label="Altitude Alvo"
          unit="ft"
          hint="Altitude de chegada neste fix — ex: 7000"
          maxDigits={5}
          allowDecimal={false}
          validate={(v) => v >= 0 && v <= 60000}
          initial={cp.alt != null ? String(cp.alt) : ""}
          onConfirm={(v) => { setCp((p) => ({ ...p, alt: Number(v), useCruiseAlt: false })); onNext(); }}
        />
      )}
    </div>
  );
}

// -------- PASSO: TC/MC + DISTÂNCIA (combinado) --------
function StepTCDist({ theme, variation, cp, setCp, onNext }) {
  const mod360 = (x) => ((x % 360) + 360) % 360;
  const [field, setField] = useState("tc"); // "tc" | "dist"
  const [tcMode, setTcMode] = useState("mh"); // "tc" | "mh"

  const initialTCDisplay = cp.tc != null
    ? String(Math.round(mod360(cp.tc - (variation ?? 0))))
    : "";
  const [tcDigits, setTcDigits] = useState(initialTCDisplay);
  const [distDigits, setDistDigits] = useState(cp.dist != null ? String(cp.dist) : "");

  const tcNum = parseFloat(tcDigits);
  const tcInputValid = tcDigits !== "" && !isNaN(tcNum) && tcNum >= 0 && tcNum <= 359;
  const tcVal = tcInputValid ? (tcMode === "mh" ? mod360(tcNum + (variation ?? 0)) : tcNum) : null;

  const distNum = parseFloat(distDigits);
  const distValid = distDigits !== "" && !isNaN(distNum) && distNum > 0 && distNum < 10000;
  const distVal = distValid ? distNum : null;

  function press(ch) {
    if (field === "tc") {
      if (ch === ".") return;
      setTcDigits(p => p.length < 3 ? p + ch : p);
    } else {
      if (ch === "." && distDigits.includes(".")) return;
      const next = distDigits + ch;
      if (next.replace(".", "").length <= 5) setDistDigits(next);
    }
  }
  function del() {
    if (field === "tc") setTcDigits(p => p.slice(0, -1));
    else setDistDigits(p => p.slice(0, -1));
  }
  function clear() {
    if (field === "tc") setTcDigits("");
    else setDistDigits("");
  }

  function confirm() {
    const updates = { _tcDistEdited: true };
    if (tcVal != null) updates.tc = Math.round(tcVal);
    if (distVal != null) updates.dist = distVal;
    setCp(p => ({ ...p, ...updates }));
    onNext();
  }

  const canConfirm = tcVal != null || distVal != null;
  const keyBase = `${theme.panel} border ${theme.panelBorder} rounded-xl flex items-center justify-center font-bold text-xl active:scale-95 transition-transform duration-100 select-none`;
  const numRows = [["7","8","9"],["4","5","6"],["1","2","3"]];

  return (
    <div className="space-y-3">
      {/* TC/MC mode toggle */}
      <div className={`flex rounded-xl overflow-hidden border ${theme.panelBorder}`}>
        {[["mh","MC (Mag. Course)"],["tc","TC (True Course)"]].map(([m, label]) => (
          <button key={m} onClick={() => {
              setTcMode(m);
              setTcDigits(prev => {
                const v = parseFloat(prev);
                if (isNaN(v)) return "";
                if (m === "mh" && tcMode === "tc") return String(Math.round(mod360(v - (variation ?? 0))));
                if (m === "tc" && tcMode === "mh") return String(Math.round(mod360(v + (variation ?? 0))));
                return prev;
              });
            }}
            className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
              tcMode === m ? `${theme.accentBg} text-black` : theme.fgFaint
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Two fields */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setField("tc")}
          className={`${theme.panel} border-2 ${field === "tc" ? theme.accentBorder : theme.panelBorder} rounded-xl px-3 py-3 flex flex-col items-center gap-0.5`}>
          <div className={`text-[10px] uppercase tracking-widest ${field === "tc" ? theme.accent : theme.fgFaint}`}>
            {tcMode === "mh" ? "MC" : "TC"}
          </div>
          <div className={`text-3xl font-black num ${field === "tc" ? (tcInputValid ? theme.accent : "text-red-400") : (tcInputValid ? theme.fg : theme.fgFaint)}`}>
            {tcDigits || "—"}°
          </div>
          {tcMode === "mh" && tcVal != null && (
            <div className={`text-[10px] ${theme.fgFaint}`}>TC {String(Math.round(tcVal)).padStart(3,"0")}°</div>
          )}
        </button>

        <button onClick={() => setField("dist")}
          className={`${theme.panel} border-2 ${field === "dist" ? theme.accentBorder : theme.panelBorder} rounded-xl px-3 py-3 flex flex-col items-center gap-0.5`}>
          <div className={`text-[10px] uppercase tracking-widest ${field === "dist" ? theme.accent : theme.fgFaint}`}>
            DIST
          </div>
          <div className={`text-3xl font-black num ${field === "dist" ? (distValid ? theme.accent : "text-red-400") : (distValid ? theme.fg : theme.fgFaint)}`}>
            {distDigits || "—"}
          </div>
          <div className={`text-[10px] ${theme.fgFaint}`}>NM</div>
        </button>
      </div>

      {/* Numpad */}
      <div className="space-y-1.5">
        {numRows.map((row, ri) => (
          <div key={ri} className="grid grid-cols-3 gap-1.5">
            {row.map(n => (
              <button key={n} onClick={() => press(n)} className={`${keyBase} py-3.5 ${theme.fg}`}>{n}</button>
            ))}
          </div>
        ))}
        <div className="grid grid-cols-4 gap-1.5">
          <button onClick={clear} className={`${keyBase} py-3.5 text-sm ${theme.fgMuted}`}>CLR</button>
          <button onClick={() => press("0")} className={`${keyBase} py-3.5 ${theme.fg}`}>0</button>
          <button onClick={() => press(".")}
            className={`${keyBase} py-3.5 ${field === "dist" ? theme.fg : `${theme.fgFaint} opacity-30`}`}>.</button>
          <button onClick={del} className={`${keyBase} py-3.5 ${theme.fgMuted}`}>
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={onNext}
          className={`py-3 rounded-xl border ${theme.panelBorder} ${theme.fgFaint} font-bold text-sm`}>
          Pular →
        </button>
        <button onClick={confirm} disabled={!canConfirm}
          className={`py-3 rounded-xl font-bold text-sm ${
            canConfirm ? `${theme.accentBg} text-black` : `${theme.panel} ${theme.fgFaint} opacity-40`
          }`}>
          Confirmar →
        </button>
      </div>
    </div>
  );
}

// -------- PASSO 2: TC/MH --------
function StepTC({ theme, variation, initial, onConfirm }) {
  const mod360 = (x) => ((x % 360) + 360) % 360;
  const [mode, setMode] = useState("mh"); // "tc" | "mh"
  // Pre-fill: convert stored TC to MH for display (MH = TC - variation)
  const initialDisplay = initial != null
    ? String(Math.round(mod360(initial - (variation ?? 0))))
    : "";
  const [digits, setDigits] = useState(initialDisplay);

  // Convert displayed value to TC based on mode
  const numVal = parseFloat(digits);
  const isValidInput = digits !== "" && !isNaN(numVal) && numVal >= 0 && numVal <= 359;
  const tc = isValidInput
    ? (mode === "mh" ? mod360(numVal + (variation ?? 0)) : numVal)
    : null;

  function press(ch) {
    setDigits((prev) => prev.length < 3 ? prev + ch : prev);
  }
  function del() { setDigits((prev) => prev.slice(0, -1)); }
  function clear() { setDigits(""); }

  const keyBase = `${theme.panel} border ${theme.panelBorder} rounded-xl flex items-center justify-center font-bold text-xl active:scale-95 transition-transform duration-100 select-none`;
  const numKeys = [["1","2","3"],["4","5","6"],["7","8","9"]];

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className={`flex rounded-xl overflow-hidden border ${theme.panelBorder}`}>
        {[["tc","TC (True Course)"],["mh","MC (Mag. Course)"]].map(([m, label]) => (
          <button key={m} onClick={() => {
              setMode(m);
              setDigits((prev) => {
                const v = parseFloat(prev);
                if (isNaN(v)) return "";
                if (m === "mh" && mode === "tc") return String(Math.round(mod360(v - (variation ?? 0))));
                if (m === "tc" && mode === "mh") return String(Math.round(mod360(v + (variation ?? 0))));
                return prev;
              });
            }}
            className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-widest transition-colors ${
              mode === m ? `${theme.accentBg} text-black` : `${theme.fgFaint}`
            }`}>
            {label}
          </button>
        ))}
      </div>

      <div>
        <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>
          {mode === "tc" ? "True Course" : "Magnetic Course"}
        </div>
        {mode === "mh" && variation != null && (
          <div className={`text-[10px] ${theme.fgFaint} mt-0.5`}>
            Var. {variation >= 0 ? "+" : ""}{variation}° → TC = MC {variation >= 0 ? "−" : "+"}{Math.abs(variation)}°
          </div>
        )}
      </div>

      {/* Display */}
      <div className={`${theme.panel} border-2 ${isValidInput ? theme.accentBorder : theme.panelBorder} rounded-xl px-4 py-4 flex flex-col items-center gap-1`}>
        <div className="flex items-baseline gap-2 justify-center">
          <span className={`text-5xl font-black num cockpit-glow tracking-wide ${
            digits ? (isValidInput ? theme.accent : "text-red-400") : theme.fgFaint
          }`}>{digits || "—"}</span>
          <span className={`text-xl ${theme.fgFaint}`}>°</span>
        </div>
        {mode === "mh" && tc != null && (
          <div className={`text-xs ${theme.fgFaint}`}>
            → TC: <span className={`font-bold ${theme.accent}`}>{String(Math.round(tc)).padStart(3,"0")}°</span>
          </div>
        )}
      </div>

      {/* Keypad */}
      <div className="space-y-2">
        {numKeys.map((row, ri) => (
          <div key={ri} className="grid grid-cols-3 gap-2">
            {row.map((n) => (
              <button key={n} onClick={() => press(n)}
                className={`${keyBase} py-4 ${theme.fg}`}>{n}</button>
            ))}
          </div>
        ))}
        <div className="grid grid-cols-3 gap-2">
          <button onClick={clear} className={`${keyBase} py-4 text-sm ${theme.fgMuted}`}>CLR</button>
          <button onClick={() => press("0")} className={`${keyBase} py-4 ${theme.fg}`}>0</button>
          <button onClick={del} className={`${keyBase} py-4 ${theme.fgMuted}`}>
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>
      </div>

      <button
        disabled={!isValidInput}
        onClick={() => onConfirm(tc)}
        className={`w-full ${theme.accentBg} disabled:opacity-40 text-black rounded-xl py-4 font-bold text-base active:scale-95 transition-transform duration-100`}
      >
        Confirmar →
      </button>
    </div>
  );
}


// -------- PASSO 3 & 4: NUMÉRICO genérico --------
function StepNumerico({ theme, label, unit, hint, maxDigits, allowDecimal, validate, initial, onConfirm }) {
  const [digits, setDigits] = useState(initial || "");
  const [hasDecimal, setHasDecimal] = useState(initial?.includes(".") || false);

  function press(ch) {
    setDigits((prev) => {
      if (ch === "." ) {
        if (!allowDecimal || hasDecimal) return prev;
        setHasDecimal(true);
        return prev + ".";
      }
      if (prev.length >= maxDigits + (hasDecimal ? 2 : 0)) return prev;
      return prev + ch;
    });
  }
  function del() {
    setDigits((prev) => {
      const next = prev.slice(0, -1);
      if (!next.includes(".")) setHasDecimal(false);
      return next;
    });
  }
  function clear() { setDigits(""); setHasDecimal(false); }

  const numVal = parseFloat(digits);
  const valid = digits !== "" && !isNaN(numVal) && validate(numVal);

  const keyBase = `${theme.panel} border ${theme.panelBorder} rounded-xl flex items-center justify-center font-bold text-xl active:scale-95 transition-transform duration-100 select-none`;
  const numKeys = [["1","2","3"],["4","5","6"],["7","8","9"]];

  return (
    <div className="space-y-3">
      <div>
        <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>{label}</div>
        <div className={`text-[10px] ${theme.fgFaint} mt-0.5`}>{hint}</div>
      </div>

      {/* Display */}
      <div className={`${theme.panel} border-2 ${valid ? theme.accentBorder : theme.panelBorder} rounded-xl px-4 py-4 flex items-baseline justify-center gap-2`}>
        <span className={`text-5xl font-black num cockpit-glow tracking-wide ${
          digits ? (valid ? theme.accent : theme.danger) : theme.fgFaint
        }`}>
          {digits || "—"}
        </span>
        <span className={`text-xl ${theme.fgFaint}`}>{unit}</span>
      </div>

      {/* Teclado */}
      <div className="space-y-2">
        {numKeys.map((row, ri) => (
          <div key={ri} className="grid grid-cols-3 gap-2">
            {row.map((n) => (
              <button key={n} onClick={() => press(n)}
                className={`${keyBase} py-4 ${theme.fg}`}>
                {n}
              </button>
            ))}
          </div>
        ))}
        {/* Última linha */}
        <div className="grid grid-cols-3 gap-2">
          {allowDecimal ? (
            <button onClick={() => press(".")}
              disabled={hasDecimal}
              className={`${keyBase} py-4 ${hasDecimal ? theme.fgFaint : theme.fgMuted} disabled:opacity-30`}>
              .
            </button>
          ) : (
            <button onClick={clear}
              className={`${keyBase} py-4 ${theme.fgMuted} text-sm`}>
              CLR
            </button>
          )}
          <button onClick={() => press("0")}
            className={`${keyBase} py-4 ${theme.fg}`}>
            0
          </button>
          <button onClick={del}
            className={`${keyBase} py-4 ${theme.fgMuted}`}>
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>
      </div>

      <button
        disabled={!valid}
        onClick={() => onConfirm(digits)}
        className={`w-full ${theme.accentBg} disabled:opacity-40 ${theme.accentBgFg} rounded-xl py-4 font-bold text-base active:scale-95 transition-transform duration-100`}>
        Confirmar →
      </button>
    </div>
  );
}

// -------- PASSO 5: VENTO --------
function StepVento({ theme, cp, setCp, windMode, setWindMode, defaultDir, defaultVel, onNext }) {
  const [dir, setDir] = useState(cp.windDir != null ? String(Math.round(cp.windDir)) : "");
  const [vel, setVel] = useState(cp.windVel != null ? String(Math.round(cp.windVel)) : "");
  const [field, setField] = useState("dir");

  function press(n) {
    const setFn = field === "dir" ? setDir : setVel;
    const max   = field === "dir" ? 3 : 3;
    setFn((prev) => prev.length < max ? prev + n : prev);
  }
  function del() {
    (field === "dir" ? setDir : setVel)((prev) => prev.slice(0, -1));
  }
  function clr() {
    (field === "dir" ? setDir : setVel)("");
  }

  function confirm() {
    if (windMode === "custom") {
      setCp({ ...cp,
        windDir: dir !== "" ? Number(dir) : null,
        windVel: vel !== "" ? Number(vel) : null,
      });
    } else {
      setCp({ ...cp, windDir: null, windVel: null });
    }
    onNext();
  }

  const customReady = windMode !== "custom" || (dir !== "" && Number(dir) <= 359 && vel !== "");

  const keyBase = `${theme.panel} border ${theme.panelBorder} rounded-xl flex items-center justify-center font-bold text-xl active:scale-95 transition-transform duration-100 select-none`;

  const windOptions = [
    {
      key: "route",
      label: "Vento da rota",
      sub: `${defaultDir}° / ${defaultVel} kt`,
      icon: "→",
    },
    {
      key: "none",
      label: "Sem vento",
      sub: "WCA = 0, GS = TAS",
      icon: "∅",
    },
    {
      key: "custom",
      label: "Vento próprio",
      sub: "Define dir/vel para esta perna",
      icon: "↗",
    },
  ];

  return (
    <div className="space-y-3">
      <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>
        Vento para perna até <span className={theme.accent}>{cp.name}</span>
      </div>

      {/* Seleção do modo */}
      <div className="space-y-2">
        {windOptions.map(({ key, label, sub, icon }) => (
          <button key={key}
            onClick={() => setWindMode(key)}
            className={`w-full ${theme.panel} border-2 rounded-xl px-4 py-3 flex items-center gap-4 active:scale-[0.98] transition-transform duration-100 ${
              windMode === key ? theme.accentBorder : theme.panelBorder
            }`}
          >
            <span className={`text-2xl w-8 text-center ${windMode === key ? theme.accent : theme.fgMuted}`}>
              {icon}
            </span>
            <div className="text-left flex-1">
              <div className={`text-sm font-bold ${windMode === key ? theme.accent : theme.fg}`}>{label}</div>
              <div className={`text-[10px] ${theme.fgFaint}`}>{sub}</div>
            </div>
            {windMode === key && <CircleCheckBig className={`w-5 h-5 ${theme.accent} shrink-0`} />}
          </button>
        ))}
      </div>

      {/* Teclado numérico apenas quando "custom" */}
      {windMode === "custom" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: "dir", label: "Direção", unit: "°",  val: dir },
              { key: "vel", label: "Vel.",    unit: "kt", val: vel },
            ].map(({ key, label, unit, val }) => (
              <button key={key} onClick={() => setField(key)}
                className={`${theme.panel} border-2 rounded-xl px-3 py-3 text-center transition-all duration-150 ${
                  field === key ? theme.accentBorder : theme.panelBorder
                }`}>
                <div className={`text-[10px] uppercase ${field === key ? theme.accent : theme.fgFaint}`}>{label}</div>
                <div className={`text-3xl font-black num ${val ? (field === key ? theme.accent : theme.fg) : theme.fgFaint}`}>
                  {val || "—"}
                </div>
                <div className={`text-[10px] ${theme.fgFaint}`}>{unit}</div>
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {[["1","2","3"],["4","5","6"],["7","8","9"]].map((row, ri) => (
              <div key={ri} className="grid grid-cols-3 gap-2">
                {row.map((n) => (
                  <button key={n} onClick={() => press(n)}
                    className={`${keyBase} py-3.5 ${theme.fg}`}>{n}</button>
                ))}
              </div>
            ))}
            <div className="grid grid-cols-3 gap-2">
              <button onClick={clr} className={`${keyBase} py-3.5 text-sm ${theme.fgMuted}`}>CLR</button>
              <button onClick={() => press("0")} className={`${keyBase} py-3.5 ${theme.fg}`}>0</button>
              <button onClick={del} className={`${keyBase} py-3.5 ${theme.fgMuted}`}>
                <ChevronLeft className="w-5 h-5" />
              </button>
            </div>
          </div>
        </>
      )}

      <button onClick={confirm} disabled={!customReady}
        className={`w-full ${theme.accentBg} disabled:opacity-40 ${theme.accentBgFg} rounded-xl py-4 font-bold text-base active:scale-95 transition-transform duration-100`}>
        Confirmar →
      </button>
    </div>
  );
}

// -------- PASSO FINAL: RESUMO --------
function StepResumo({ theme, cp, setCp, isNew, isOrigin, windMode, cruiseAlt, prevAlt, variation, onEdit, onSave, onRemove }) {
  const windLabel =
    windMode === "none"   ? "Sem vento (GS = TAS)" :
    windMode === "custom" ? `${cp.windDir ?? "—"}° / ${cp.windVel ?? "—"} kt` :
                            "Padrão da rota";

  const overrideKeys = ["tasClimbOvr","tasCruiseOvr","tasDescentOvr","gphClimbOvr","gphCruiseOvr","gphDescentOvr","rocClimbOvr","rodDescentOvr"];
  const overrideLabels = { tasClimbOvr: "TAS↗", tasCruiseOvr: "TAS→", tasDescentOvr: "TAS↘", gphClimbOvr: "GPH↗", gphCruiseOvr: "GPH→", gphDescentOvr: "GPH↘", rocClimbOvr: "ROC↗", rodDescentOvr: "ROD↘" };
  const overrideActive = overrideKeys.filter((k) => cp[k] != null);
  const overrideValue = overrideActive.length > 0
    ? overrideActive.map((k) => `${overrideLabels[k]} ${cp[k]}`).join(" · ")
    : "Padrão da aeronave";

  const rows = [
    { label: "Nome", value: cp.name || "—", step: "nome" },
    { label: isOrigin ? "Alt. de partida" : "Altitude Alvo", value: (() => {
        const altStr = cp.useCruiseAlt ? `CRZ (${cruiseAlt} ft)` : (cp.alt != null ? `${cp.alt} ft` : (!isOrigin ? "Herdar" : "—"));
        const modeStr = cp.arrivalMode === "asap" ? " · ASAP"
          : cp.arrivalMode === "at_fix" ? " · no fix"
          : cp.arrivalMode === "before_nm" ? ` · −${cp.arrivalValue ?? 5} NM`
          : cp.arrivalMode === "before_min" ? ` · −${cp.arrivalValue ?? 5} min`
          : "";
        return altStr + modeStr;
      })(), step: "alt" },
    ...(!isOrigin ? [
      cp.lat != null ? { label: "Coordenadas", value: formatCoord(cp.lat, cp.lon) ?? "—", step: "coord" } : null,
      { label: "TC / MC · Distância", value: (() => {
          const tcStr = cp.tc != null ? (() => {
            const tc = Math.round(cp.tc);
            const mc = Math.round(((cp.tc - (variation ?? 0)) % 360 + 360) % 360);
            return `TC ${String(tc).padStart(3,"0")}° MC ${String(mc).padStart(3,"0")}°`;
          })() : "TC —";
          const distStr = cp.dist != null ? `${cp.dist} NM` : "— NM";
          return `${tcStr} · ${distStr}`;
        })(), step: "tcdist" },
      { label: "Vento",         value: windLabel,                                                 step: "vento"},
      { label: "Performance",   value: overrideValue,                                             step: "override" },
    ] : []),
  ];

  return (
    <div className="space-y-3">
      <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>Resumo</div>

      {/* Card de confirmação */}
      <div className={`${theme.panel} border ${theme.panelBorder} rounded-xl overflow-hidden`}>
        {rows.filter(Boolean).map(({ label, value, step, derived }) => (
          <button key={step}
            onClick={() => !derived && onEdit(step)}
            className={`w-full flex items-center justify-between px-4 py-3 text-left border-b ${theme.panelBorder} last:border-b-0 ${derived ? 'opacity-60 cursor-default' : 'active:opacity-70'}`}>
            <div>
              <div className={`text-[10px] uppercase tracking-wider ${theme.fgFaint} flex items-center gap-1.5`}>
                {label}
                {derived && (
                  <span className={`px-1 py-0.5 rounded text-[10px] font-bold ${theme.accentBg} text-black`}>
                    GPS
                  </span>
                )}
              </div>
              <div className={`text-base font-bold num ${theme.fg}`}>{value}</div>
            </div>
            {derived
              ? <span className={`text-[10px] ${theme.fgFaint} shrink-0`}>auto</span>
              : <Pencil className={`w-4 h-4 ${theme.fgFaint} shrink-0`} />
            }
          </button>
        ))}
      </div>

      {/* Arrival mode — inline no resumo, só para pernas com variação de altitude */}
      {!isOrigin && setCp && (() => {
        const currentAlt = cp.useCruiseAlt ? cruiseAlt : cp.alt;
        const isClimbing  = prevAlt != null && currentAlt != null && currentAlt - prevAlt > 50;
        const isDescending = prevAlt != null && currentAlt != null && prevAlt - currentAlt > 50;
        if (!isClimbing && !isDescending) return null;
        const contextDefault = isDescending ? "at_fix" : "asap";
        const arrivalMode = cp.arrivalMode ?? null;
        const arrivalValue = cp.arrivalValue ?? 5;
        const modeOpts = [
          { key: "asap",       label: "ASAP" },
          { key: "at_fix",     label: "No fix" },
          { key: "before_nm",  label: "−NM" },
          { key: "before_min", label: "−min" },
        ];
        function setMode(key) {
          setCp((p) => ({ ...p, arrivalMode: p.arrivalMode === key ? null : key }));
        }
        function adjustValue(delta) {
          setCp((p) => ({ ...p, arrivalValue: Math.max(1, Math.min(60, (p.arrivalValue ?? 5) + delta)) }));
        }
        return (
          <div className={`${theme.panel} border ${theme.panelBorder} rounded-xl p-3 space-y-2`}>
            <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>
              {isClimbing ? "↗ Subida" : "↘ Descida"} · nivelar
              {arrivalMode == null && <span className={`ml-1 ${theme.cyan}`}>· padrão: {contextDefault === "asap" ? "ASAP" : "no fix"}</span>}
            </div>
            <div className="flex gap-1">
              {modeOpts.map(({ key, label }) => {
                const active = arrivalMode === key || (arrivalMode == null && key === contextDefault);
                return (
                  <button key={key} onClick={() => setMode(key)}
                    className={`flex-1 py-2 rounded-lg border text-[11px] font-bold transition-colors active:scale-95 ${
                      active ? `${theme.accentBorder} bg-amber-500/10 ${theme.accent}` : `${theme.panelBorder} ${theme.fgFaint}`
                    }`}>
                    {label}
                  </button>
                );
              })}
            </div>
            {(arrivalMode === "before_nm" || arrivalMode === "before_min") && (
              <div className="flex items-center gap-3">
                <button onClick={() => adjustValue(-1)}
                  className={`w-10 h-10 rounded-lg border ${theme.panelBorder} ${theme.fg} text-xl font-black flex items-center justify-center active:scale-95`}>−</button>
                <div className="flex-1 text-center">
                  <span className={`text-2xl font-black num cockpit-glow ${theme.accent}`}>{arrivalValue}</span>
                  <span className={`ml-1 text-sm ${theme.fgFaint}`}>{arrivalMode === "before_nm" ? "NM" : "min"}</span>
                </div>
                <button onClick={() => adjustValue(1)}
                  className={`w-10 h-10 rounded-lg border ${theme.panelBorder} ${theme.fg} text-xl font-black flex items-center justify-center active:scale-95`}>+</button>
              </div>
            )}
          </div>
        );
      })()}

      <div className="space-y-2 pt-1">
        <button onClick={onSave}
          className={`w-full ${theme.accentBg} ${theme.accentBgFg} rounded-xl py-4 font-bold text-base active:scale-95 transition-transform duration-100`}>
          {isNew ? "Adicionar waypoint" : "Salvar alterações"}
        </button>
        {onRemove && (
          <button onClick={onRemove}
            className="w-full bg-red-900/40 border border-red-800 text-red-300 rounded-xl py-3 font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform duration-100">
            <Trash className="w-4 h-4" /> Remover waypoint
          </button>
        )}
      </div>
    </div>
  );
}


// --------- TAB EM VOO ---------

function BigStat({ label, value, theme }) {
  return (
    <div className={`bg-black/30 border ${theme?.panelBorder || "border-zinc-800"} rounded px-2 py-2 text-center`}>
      <div className={`text-[10px] uppercase tracking-wider ${theme?.fgFaint || "text-zinc-500"}`}>{label}</div>
      <div className={`text-xl font-bold num ${theme?.fg || "text-zinc-100"}`}>{value}</div>
    </div>
  );
}

function ETACell({ label, value, delta, muted, theme }) {
  const sign = delta == null ? null : delta > 0 ? "+" : delta < 0 ? "−" : "";
  const absDelta = delta == null ? null : Math.abs(Math.round(delta));
  const deltaColor =
    delta == null ? "" :
    delta > 1 ? (theme?.danger || "text-red-400") :
    delta < -1 ? (theme?.success || "text-green-400") : (theme?.fgFaint || "text-zinc-500");
  return (
    <div className={`bg-black/30 border rounded px-2 py-2 ${muted ? (theme?.panelBorder || "border-zinc-800") : "border-cyan-500/40"}`}>
      <div className={`text-[10px] uppercase tracking-wider ${theme?.fgFaint || "text-zinc-500"}`}>{label}</div>
      <div className={`text-xl font-bold num ${muted ? (theme?.fgMuted || "text-zinc-300") : (theme?.cyan || "text-cyan-400")}`}>{value}</div>
      {absDelta != null && absDelta > 0 && (
        <div className={`text-[10px] num ${deltaColor}`}>{sign}{absDelta} min</div>
      )}
    </div>
  );
}
// CheckpointRow + React.memo wrapper moved to app/components/flight-tab.jsx
// alongside FlightTab.

// --------- TAB COMBUSTÍVEL ---------

// --------- TAB DIÁRIO ---------

// --------- PAINEL DE PREFERÊNCIAS ---------

// --------- EDITOR DE NOTAS ---------
function NotesEditor({ checkpoint, theme, onSave, onClose }) {
  const [text, setText] = useState(checkpoint.notes || "");
  return (
    <div className="fixed inset-0 z-30 bg-black/80 flex items-end" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className={`w-full ${theme.panel} border-t ${theme.panelBorder} rounded-t-2xl p-4 space-y-3`}>
        <div className="flex items-center justify-between">
          <h3 className={`text-sm uppercase tracking-widest ${theme.accent} font-bold flex items-center gap-2`}>
            <FileText className="w-4 h-4" /> {checkpoint.name} — Notas
          </h3>
          <button onClick={onClose} aria-label="Fechar"><X className={`w-5 h-5 ${theme.fgFaint}`} /></button>
        </div>
        <div className={`text-[10px] ${theme.fgFaint}`}>
          Anote frequências, QNH, instruções ATC, pista em uso ou qualquer observação relevante.
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ex: QNH 1008, pista 28R, espere 3000ft até RIPLI..."
          autoFocus
          rows={5}
          className={`w-full ${theme.inputBg} border ${theme.inputBorder} ${theme.fg} px-3 py-2.5 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none`}
        />
        <div className="grid grid-cols-2 gap-2">
          {text && (
            <button onClick={() => { setText(""); onSave(""); }}
              className="bg-red-900/40 border border-red-800 text-red-300 rounded-xl py-3 text-sm font-bold active:scale-95">
              Limpar nota
            </button>
          )}
          <button onClick={() => onSave(text)}
            className={`${text ? "" : "col-span-2"} ${theme.accentBg} ${theme.accentBgFg} rounded-xl py-3 font-bold text-sm active:scale-95`}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// --------- IMPORTADOR DE FPL ICAO ---------
function FPLImporter({ theme, onImport, onClose }) {
  const [text, setText] = useState("");
  return (
    <div className="fixed inset-0 z-30 bg-black/80 flex items-end" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className={`w-full ${theme.panel} border-t ${theme.panelBorder} rounded-t-2xl p-4 space-y-3`}>
        <div className="flex items-center justify-between">
          <h3 className={`text-sm uppercase tracking-widest ${theme.accent} font-bold`}>Importar rota FPL</h3>
          <button onClick={onClose} aria-label="Fechar"><X className={`w-5 h-5 ${theme.fgFaint}`} /></button>
        </div>
        <div className={`text-[10px] ${theme.fgFaint}`}>
          Cole o campo 15 do FPL ICAO (ou só a sequência de waypoints).
          O app extrai os fixos e adiciona à rota — você ajusta TC e distância depois.
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ex: DCT EMBOI UZ23 RIPLI DCT TOD"
          className={`w-full ${theme.inputBg} border ${theme.inputBorder} ${theme.fg} px-3 py-2 text-sm rounded h-24 num focus:${theme.accentBorder} focus:outline-none focus:ring-2 focus:ring-amber-500/30`}
        />
        <button
          disabled={!text.trim()}
          onClick={() => onImport(text)}
          className={`w-full ${theme.accentBg} disabled:opacity-50 ${theme.accentBgFg} rounded py-3 font-bold text-sm`}
        >
          Importar
        </button>
      </div>
    </div>
  );
}

// --------- GERENCIADOR DE FROTA ---------
function FleetManager({ fleet, onEdit, onDelete, onReset, onAdd, onClose, theme }) {
  return (
    <div className="fixed inset-0 z-30 bg-black/80 flex flex-col" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className={`mt-auto w-full ${theme.panel} border-t ${theme.panelBorder} rounded-t-2xl flex flex-col`}
        style={{ maxHeight: '90vh' }}>
        <div className={`flex items-center justify-between px-4 pt-4 pb-2 border-b ${theme.panelBorder}`}>
          <h3 className={`text-sm uppercase tracking-widest font-bold ${theme.accent}`}>Frota</h3>
          <button onClick={onClose} aria-label="Fechar"><X className={`w-5 h-5 ${theme.fgFaint}`} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
          {Object.entries(fleet).map(([id, ac]) => (
            <div key={id} className={`${theme.panel} border ${theme.panelBorder} rounded-xl px-3 py-3`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className={`font-bold text-sm ${theme.fg}`}>{ac.name}</div>
                  <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>{ac.short} · {ac.engine}</div>
                  <div className={`text-[10px] ${theme.fgMuted} mt-0.5`}>
                    TAS {ac.tasCruise}kt · Vy {ac.vy}kt · {ac.fuelUsable}gal
                  </div>
                </div>
                <div className="flex gap-2 shrink-0 ml-2">
                  {ac.isBuiltIn && FLEET_DEFAULTS[id] && (
                    <button onClick={() => onReset(id)}
                      className={`text-[10px] uppercase ${theme.fgFaint} border ${theme.panelBorder} rounded-lg px-2 py-1`}>
                      Reset
                    </button>
                  )}
                  {!ac.isBuiltIn && (
                    <button onClick={() => onDelete(id)}
                      className="text-[10px] uppercase text-red-400 border border-red-900 rounded-lg px-2 py-1">
                      Remover
                    </button>
                  )}
                  <button onClick={() => onEdit(ac)}
                    className={`text-[10px] uppercase ${theme.accent} border ${theme.accentBorder} rounded-lg px-2 py-1`}>
                    Editar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className={`px-4 py-3 border-t ${theme.panelBorder}`}>
          <button onClick={onAdd}
            className={`w-full ${theme.accentBg} text-black font-bold rounded-xl py-3 text-sm uppercase tracking-widest flex items-center justify-center gap-2`}>
            <Plus className="w-4 h-4" /> Nova aeronave
          </button>
        </div>
      </div>
    </div>
  );
}

// --------- EDITOR DE AERONAVE ---------
function AircraftEditor({ aircraft, theme, onSave, onClose }) {
  const [ac, setAc] = useState({ ...aircraft });
  const setN = (k, v) => setAc((a) => ({ ...a, [k]: v === '' ? 0 : Number(v) }));
  const setS = (k, v) => setAc((a) => ({ ...a, [k]: v }));

  const fieldClass = `w-full ${theme.inputBg} border-2 ${theme.inputBorder} ${theme.fg} px-3 py-2.5 text-base rounded-xl num focus:${theme.accentBorder} focus:outline-none focus:ring-2 focus:ring-amber-500/30`;
  const labelClass = `text-[10px] uppercase tracking-widest ${theme.fgFaint} mb-1 block`;

  const isValid = ac.name?.trim() && ac.short?.trim() && ac.tasCruise > 0 && ac.gphCruise > 0 && ac.fuelUsable > 0;

  return (
    <div className="fixed inset-0 z-40 bg-black/85 flex flex-col" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className={`mt-auto w-full ${theme.panel} border-t ${theme.panelBorder} rounded-t-2xl flex flex-col`}
        style={{ maxHeight: '92vh' }}>
        <div className={`flex items-center justify-between px-4 pt-4 pb-2 border-b ${theme.panelBorder} shrink-0`}>
          <h3 className={`text-sm uppercase tracking-widest font-bold ${theme.accent}`}>
            {aircraft.name ? `Editar · ${aircraft.short}` : 'Nova aeronave'}
          </h3>
          <button onClick={onClose} aria-label="Fechar"><X className={`w-5 h-5 ${theme.fgFaint}`} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-4">
          {/* Identity */}
          <div>
            <div className={`text-[10px] uppercase tracking-widest ${theme.accent} mb-2`}>Identificação</div>
            <div className="space-y-2">
              <div>
                <label className={labelClass}>Nome completo</label>
                <input className={fieldClass} value={ac.name} onChange={(e) => setS('name', e.target.value)} placeholder="Ex: Beechcraft Baron 58" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>Código curto</label>
                  <input className={fieldClass} value={ac.short} onChange={(e) => setS('short', e.target.value.toUpperCase())} placeholder="BE58" maxLength={8} />
                </div>
                <div>
                  <label className={labelClass}>Motor</label>
                  <input className={fieldClass} value={ac.engine} onChange={(e) => setS('engine', e.target.value)} placeholder="Pistão IO-550" />
                </div>
              </div>
            </div>
          </div>

          {/* Speeds */}
          <div>
            <div className={`text-[10px] uppercase tracking-widest ${theme.accent} mb-2`}>Velocidades (kt)</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={labelClass}>TAS Cruzeiro</label>
                <input className={fieldClass} type="number" value={ac.tasCruise || ''} onChange={(e) => setN('tasCruise', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Vy Subida</label>
                <input className={fieldClass} type="number" value={ac.vy || ''} onChange={(e) => setN('vy', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>V Descida</label>
                <input className={fieldClass} type="number" value={ac.vDescent || ''} onChange={(e) => setN('vDescent', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Rates */}
          <div>
            <div className={`text-[10px] uppercase tracking-widest ${theme.accent} mb-2`}>Razões (ft/min)</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>ROC Subida</label>
                <input className={fieldClass} type="number" value={ac.rocClimb || ''} onChange={(e) => setN('rocClimb', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>ROD Descida</label>
                <input className={fieldClass} type="number" value={ac.rodDescent || ''} onChange={(e) => setN('rodDescent', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Fuel burn */}
          <div>
            <div className={`text-[10px] uppercase tracking-widest ${theme.accent} mb-2`}>Consumo (GPH)</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={labelClass}>Subida</label>
                <input className={fieldClass} type="number" value={ac.gphClimb || ''} onChange={(e) => setN('gphClimb', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Cruzeiro</label>
                <input className={fieldClass} type="number" value={ac.gphCruise || ''} onChange={(e) => setN('gphCruise', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Descida</label>
                <input className={fieldClass} type="number" value={ac.gphDescent || ''} onChange={(e) => setN('gphDescent', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Capacity */}
          <div>
            <div className={`text-[10px] uppercase tracking-widest ${theme.accent} mb-2`}>Capacidade</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={labelClass}>Fuel (gal)</label>
                <input className={fieldClass} type="number" value={ac.fuelUsable || ''} onChange={(e) => setN('fuelUsable', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>MTOW (lbs)</label>
                <input className={fieldClass} type="number" value={ac.mtow || ''} onChange={(e) => setN('mtow', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>BEW (lbs)</label>
                <input className={fieldClass} type="number" value={ac.bew || ''} onChange={(e) => setN('bew', e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div className={`px-4 py-3 border-t ${theme.panelBorder} shrink-0`}>
          <button
            onClick={() => isValid && onSave(ac)}
            className={`w-full rounded-xl py-3 text-sm font-bold uppercase tracking-widest ${
              isValid ? `${theme.accentBg} text-black` : 'bg-zinc-800 text-zinc-500'
            }`}
          >
            Salvar aeronave
          </button>
        </div>
      </div>
    </div>
  );
}

// --------- GERENCIADOR DE ROTAS ---------
function RoutesManager({ routes, currentFlight, onLoad, onDelete, onSaveCurrent, onClose }) {
  const sorted = [...routes].sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
  return (
    <div className="fixed inset-0 z-30 bg-zinc-950/95 flex items-end" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-h-[85vh] bg-zinc-900 border-t border-zinc-700 rounded-t-2xl flex flex-col">
        <div className="px-4 py-3 flex items-center justify-between border-b border-zinc-800">
          <h3 className="text-sm uppercase tracking-widest text-amber-400 font-bold flex items-center gap-2">
            <FolderOpen className="w-4 h-4" /> Rotas salvas
          </h3>
          <button onClick={onClose} aria-label="Fechar"><X className="w-5 h-5 text-zinc-500" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {sorted.length === 0 && (
            <div className="text-center py-8 text-zinc-500 text-sm">
              Nenhuma rota salva ainda.
              <div className="text-xs mt-1">Use o botão Salvar no topo para guardar a rota atual.</div>
            </div>
          )}
          {sorted.map((route) => (
            <div key={route.id} className="bg-zinc-950 border border-zinc-800 rounded p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-amber-400 truncate">{route.name}</div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">
                    {route.flight.origin} → {route.flight.destination}
                    {route.flight.alternate ? ` · ALTN ${route.flight.alternate}` : ""}
                  </div>
                  <div className="text-[10px] text-zinc-600 num mt-0.5">
                    {route.flight.checkpoints.length} pontos · {FLEET_DEFAULTS[route.flight.aircraftKey]?.short || "—"}
                  </div>
                </div>
                <button
                  onClick={() => onDelete(route.id)}
                  className="text-zinc-600 hover:text-red-400 p-1 active:scale-90 transition"
                  aria-label="Excluir rota"
                >
                  <Trash className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={() => onLoad(route)}
                className="w-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded py-2 text-xs uppercase tracking-wider font-bold transition-colors"
              >
                Carregar esta rota
              </button>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-zinc-800">
          <button
            onClick={onSaveCurrent}
            className="w-full bg-amber-500 text-zinc-950 rounded py-3 font-bold text-sm flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" /> Salvar rota atual
          </button>
        </div>
      </div>
    </div>
  );
}

// --------- EDITOR DE ATA ---------
function AtaEditor({ checkpoint, eobt, prevAta, etaPlanned, etaLive, onSave, onClear, onClose, onUseNow, theme, fieldLabel, confirmLabel, clearLabel }) {
  // Representação interna: string de dígitos puros, máx 6 (HHMMSS)
  const initialDigits = checkpoint.ata
    ? checkpoint.ata.replace(/:/g, "").slice(0, 6)
    : "";
  const [digits, setDigits] = useState(initialDigits);

  // Formata dígitos → "HH:MM:SS" para armazenamento
  function digitsToHHMMSS(d) {
    return `${d[0]||"0"}${d[1]||"0"}:${d[2]||"0"}${d[3]||"0"}:${d[4]||"0"}${d[5]||"0"}`;
  }

  // Valida: 6 dígitos, HH 00-23, MM 00-59, SS 00-59
  function isValid(d) {
    if (d.length !== 6) return false;
    const hh = parseInt(d.slice(0, 2), 10);
    const mm = parseInt(d.slice(2, 4), 10);
    const ss = parseInt(d.slice(4, 6), 10);
    return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59 && ss >= 0 && ss <= 59;
  }

  function pressDigit(n) {
    setDigits((prev) => (prev.length < 6 ? prev + String(n) : prev));
  }
  function backspace() {
    setDigits((prev) => prev.slice(0, -1));
  }
  function useNow() {
    setDigits(formatHHMMSS(nowHHMM()).replace(/:/g, ""));
  }

  const valid = isValid(digits);

  // Delta entre ATA digitada e ETA planejada
  const deltaMin = useMemo(() => {
    if (!valid || etaPlanned == null) return null;
    const hh = parseInt(digits.slice(0, 2), 10);
    const mm = parseInt(digits.slice(2, 4), 10);
    const ss = parseInt(digits.slice(4, 6), 10);
    const ataMin = hh * 60 + mm + ss / 60;
    let d = ataMin - etaPlanned;
    // Ajusta crossing de meia-noite
    if (d > 720) d -= 1440;
    if (d < -720) d += 1440;
    return d;
  }, [digits, valid, etaPlanned]);

  const deltaColor =
    deltaMin == null ? theme.fgFaint :
    deltaMin > 2  ? theme.danger :
    deltaMin < -2 ? theme.success :
    theme.fgFaint;

  const sign = deltaMin == null ? "" : deltaMin >= 0 ? "+" : "−";
  const absD = deltaMin == null ? null : Math.abs(Math.round(deltaMin));

  // Layout do teclado numérico: linhas [1,2,3], [4,5,6], [7,8,9], [⌫,0,↩]
  const keys = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ];

  return (
    <div className="fixed inset-0 z-30 bg-black/85 flex items-end" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className={`w-full ${theme.panel} border-t ${theme.panelBorder} rounded-t-2xl p-4 space-y-3`}>

        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className={`text-sm uppercase tracking-widest ${theme.accent} font-bold`}>
            {checkpoint.ata ? (fieldLabel ? `Editar ${fieldLabel}` : "Editar passagem") : (fieldLabel ? `Registrar ${fieldLabel}` : "Marcar passagem")}
          </h3>
          <button onClick={onClose} aria-label="Fechar"><X className={`w-5 h-5 ${theme.fgFaint}`} /></button>
        </div>

        {/* Waypoint + ETAs */}
        <div className={`${theme.panel} border ${theme.panelBorder} rounded-lg px-4 py-3`}>
          <div className="flex items-center justify-between">
            {/* Nome do waypoint */}
            <div>
              <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>Waypoint</div>
              <div className={`text-2xl font-black ${theme.accent} cockpit-glow`}>{checkpoint.name}</div>
            </div>

            {/* ETA planejada e atualizada */}
            <div className="text-right space-y-1">
              <div className="flex items-center justify-end gap-3">
                <div>
                  <div className={`text-[10px] uppercase ${theme.fgFaint}`}>ETA plan.</div>
                  <div className={`text-lg font-bold num ${theme.fgMuted}`}>
                    {etaPlanned != null ? formatHHMM(etaPlanned) : "--:--"}
                  </div>
                </div>
                {etaLive != null && (
                  <div>
                    <div className={`text-[10px] uppercase ${theme.cyan}`}>ETA atual.</div>
                    <div className={`text-lg font-bold num ${theme.cyan}`}>
                      {formatHHMM(etaLive)}
                    </div>
                  </div>
                )}
              </div>
              {prevAta && (
                <div className={`text-[10px] num ${theme.fgFaint} text-right`}>
                  Checkpoint anterior: <span className={theme.fgMuted}>{prevAta}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Display do horário digitado */}
        <div className="text-center">
          <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint} mb-1`}>{fieldLabel ?? "ATA"} (UTC)</div>
          <div className={`text-4xl font-black num tracking-widest cockpit-glow transition-colors ${
            digits.length === 0 ? theme.fgFaint :
            valid ? theme.accent : theme.fgMuted
          }`}>
            {/* HH : MM : SS — renderiza dígito a dígito */}
            {[0,1,null,2,3,null,4,5].map((dIdx, i) => {
              if (dIdx === null) return <span key={`sep${i}`} className={`${theme.fgFaint} mx-0.5 text-3xl`}>:</span>;
              const ch = digits[dIdx];
              const ph = dIdx < 2 ? "H" : dIdx < 4 ? "M" : "S";
              return <span key={i} className={ch ? "" : "opacity-20"}>{ch || ph}</span>;
            })}
          </div>
          {/* Delta */}
          <div className={`text-sm font-bold num mt-1 h-5 ${deltaColor}`}>
            {deltaMin != null && absD > 0
              ? `${sign}${absD} min em relação à ETA`
              : deltaMin != null && absD === 0
              ? "No horário"
              : ""}
          </div>
        </div>

        {/* Teclado numérico */}
        <div className="space-y-2">
          {keys.map((row, ri) => (
            <div key={ri} className="grid grid-cols-3 gap-2">
              {row.map((n) => (
                <button
                  key={n}
                  onClick={() => pressDigit(n)}
                  className={`${theme.panel} border ${theme.panelBorder} rounded-xl py-4 text-2xl font-bold num ${theme.fg} active:scale-95 active:${theme.accentBg} active:${theme.accentBgFg} transition-all duration-150`}
                >
                  {n}
                </button>
              ))}
            </div>
          ))}
          {/* Última linha: CLR, 0, ⌫, Agora */}
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => setDigits("")}
              className={`${theme.panel} border ${theme.panelBorder} rounded-xl py-4 text-sm font-bold ${theme.fgMuted} active:scale-95 transition-transform duration-100`}
            >
              CLR
            </button>
            <button
              onClick={() => pressDigit(0)}
              className={`${theme.panel} border ${theme.panelBorder} rounded-xl py-4 text-2xl font-bold num ${theme.fg} active:scale-95 transition-transform duration-100`}
            >
              0
            </button>
            <button
              onClick={backspace}
              className={`${theme.panel} border ${theme.panelBorder} rounded-xl py-4 flex items-center justify-center ${theme.fgMuted} active:scale-95 transition-transform duration-100`}
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={useNow}
              className={`${theme.panel} border ${theme.accentBorder} rounded-xl py-4 text-sm font-bold ${theme.accent} flex items-center justify-center gap-1 active:scale-95 transition-transform duration-100`}
            >
              <Clock className="w-4 h-4" /> Agora
            </button>
          </div>
        </div>

        {/* Ações */}
        <div className="space-y-2 pt-1">
          {/* Confirmar — destaque máximo */}
          <button
            disabled={!valid}
            onClick={() => onSave(digitsToHHMMSS(digits))}
            className={`w-full ${theme.accentBg} disabled:opacity-40 ${theme.accentBgFg} rounded-xl py-4 font-bold text-lg active:scale-95 transition-transform duration-100`}
          >
            {confirmLabel ?? "Confirmar passagem"}
          </button>

          {/* Limpar — só aparece quando o ponto já foi marcado */}
          {checkpoint.ata && (
            <button
              onClick={onClear}
              className="w-full bg-red-900/40 border border-red-800 text-red-300 rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform duration-100"
            >
              <X className="w-4 h-4" /> {clearLabel ?? "Limpar passagem registrada"}
            </button>
          )}

          {/* Cancelar — sempre visível, discreto */}
          <button
            onClick={onClose}
            className={`w-full ${theme.panel} border ${theme.panelBorder} ${theme.fgMuted} rounded-xl py-3 text-sm font-bold active:scale-95 transition-transform duration-100`}
          >
            Cancelar
          </button>
        </div>

      </div>
    </div>
  );
}


    const _root = createRoot(document.getElementById('root'));
_root.render(React.createElement(NavlogApp));
  
