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
import { MapTab } from "./components/map-tab.jsx?v=20260517.1627";
import { WaypointEditor } from "./components/waypoint-editor.jsx?v=20260517.1627";
import { SetupTab } from "./components/setup-tab.jsx?v=20260517.1627";
import { FlightTab } from "./components/flight-tab.jsx?v=20260517.1627";
import { FuelTab } from "./components/fuel-tab.jsx?v=20260517.1627";
import { LogTab } from "./components/log-tab.jsx?v=20260517.1627";
import { PrefsPanel } from "./components/prefs-panel.jsx?v=20260517.1627";
import { Section, Loading, Empty, ErrorState, TabButton, LiveClock } from "./components/ui-primitives.jsx?v=20260517.1627";
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

const APP_VERSION = "20260517.1627";

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
// themes moved to lib/themes.js (UMD, sets window.themes).

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
  
