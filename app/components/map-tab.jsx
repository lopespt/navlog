// Map tab — Leaflet-based route display, simulated aircraft, PDF chart
// overlays. Extracted from app/main.jsx (commit 564b270). Imported via
// relative ES module path in app/main.jsx; esm.sh/gh handles the relative
// resolution and compiles JSX on the edge.
//
// Imports PdfGeoreferencer and PdfLayersPanel directly as sibling ES
// modules (sibling .jsx files in the same folder).
//
// Window globals consumed (loaded by index.html before any module):
//   window.L            Leaflet
//   window.pdfjsLib     PDF.js (indirectly, via the props' helpers)
// Module-scope globals consumed (from lib/* UMD modules — already on window):
//   estimatedPosition, parseHHMM, nowHHMM, gcInterpolate,
//   affineFrom3Points, invertAffine, applyAffinePt,
//   applyOverlayCalibration, rewarpOverlayFromHandle,
//   pickPdfFile, renderPdfHiRes, savePdfOverlayIdb

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Map as MapIcon } from "lucide-react";
import { PdfGeoreferencer } from "./pdf-georeferencer.jsx?v=20260520.0108";
import { PdfLayersPanel } from "./pdf-layers-panel.jsx?v=20260520.0108";

import { useTheme, usePrefs, useDerived, useFlight } from "../context/app-context.jsx?v=20260520.0108";
// ── Map tab ───────────────────────────────────────────────────────────────────
// ptSegDist moved to lib/planning.js (pure flat-earth helper, tested in Node).

function MapTab({ onInsertWaypoint, pdfOverlays, setPdfOverlays, initialView, onViewChange }) {
  const { flight } = useFlight();
  const { computed, liveETAs, liveRoute } = useDerived();
  const { prefs, savePrefs } = usePrefs();
  const theme = useTheme();
  const mapDivRef = useRef(null);
  const mapRef    = useRef(null);
  const overlayRef = useRef({ route: null, markers: [], simMarker: null, deviation: null });
  const [tileMode, setTileMode] = useState('osm'); // 'osm' | 'sat'
  const [pickMode, setPickMode] = useState(false); // waiting for user to tap map to place WP
  const [layersOpen, setLayersOpen] = useState(false);
  const [georefActive, setGeorefActive] = useState(false);
  const [mapZoom, setMapZoom] = useState(8);
  // Leaflet layers for PDF overlays — keyed by overlay id
  const pdfLayerRefs = useRef({});
  // Track in-flight hi-res renders to avoid duplicates per overlay
  const hiRenderingRef = useRef(new Set());
  // Updater for leg-label visibility (recomputed on zoom)
  const legLabelUpdaterRef = useRef(function() {});
  // Threshold above which we want the hi-res rasterization
  const HIRES_ZOOM = 12;
  // True once the map has been restored from a saved view — suppresses the
  // default fitBounds on the route effect so the user's pan/zoom is preserved
  // when switching tabs.
  const restoredViewRef = useRef(false);
  // Stable ref so map listeners always call the latest reporter
  const onViewChangeRef = useRef(onViewChange);
  useEffect(() => { onViewChangeRef.current = onViewChange; }, [onViewChange]);
  // Last reported view kept in a ref instead of state — moveend / zoomend
  // would otherwise trigger setState on every pan and re-render App + every
  // tab content. We only push the view back to App on unmount (tab switch).
  const lastViewRef = useRef(null);

  // Calibration: replace one of the existing 3 control points by clicking on
  // the chart (where the user sees the feature) and then on the map (where the
  // feature actually lives). Closest existing pdfPt is replaced. Re-warps via
  // the saved file handle.
  const [calibratingId, setCalibratingId] = useState(null);
  const [calibStep, setCalibStep] = useState("idle"); // idle | pickChart | pickMap | applying
  const calibratingIdRef = useRef(null);
  const calibStepRef = useRef("idle");
  const calibChartLLRef = useRef(null);
  useEffect(() => { calibratingIdRef.current = calibratingId; }, [calibratingId]);
  useEffect(() => { calibStepRef.current = calibStep; }, [calibStep]);
  function startCalibration(id) {
    calibChartLLRef.current = null;
    setLayersOpen(false);
    setCalibratingId(id);
    setCalibStep("pickChart");
  }
  function cancelCalibration() {
    calibChartLLRef.current = null;
    setCalibratingId(null);
    setCalibStep("idle");
  }
  async function applyCalibPair(chartLL, mapLL) {
    var map = mapRef.current;
    var ov = (pdfOverlays || []).find(function(o) { return o.id === calibratingIdRef.current; });
    if (!map || !ov || !ov.pdfPts || !ov.mapPts || ov.pdfPts.length < 3) {
      cancelCalibration(); return;
    }
    setCalibStep("applying");
    try {
      var REF_ZOOM = 14;
      var mercPts = ov.mapPts.map(function(m) { return map.project(window.L.latLng(m[0], m[1]), REF_ZOOM); });
      var aff = affineFrom3Points(ov.pdfPts.slice(0, 3), mercPts.slice(0, 3));
      var inv = invertAffine(aff);
      if (!inv) throw new Error("Afim inválida (pontos colineares?)");
      var chartMerc = map.project(window.L.latLng(chartLL[0], chartLL[1]), REF_ZOOM);
      var newPdfPair = applyAffinePt(inv, chartMerc.x, chartMerc.y);
      var u = Math.round(newPdfPair[0]);
      var v = Math.round(newPdfPair[1]);
      // Replace closest existing pdfPt
      var bestIdx = 0; var bestDist = Infinity;
      for (var i = 0; i < ov.pdfPts.length; i++) {
        var du = ov.pdfPts[i][0] - u, dv = ov.pdfPts[i][1] - v;
        var d = du*du + dv*dv;
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      var newPdfPts = ov.pdfPts.slice();
      var newMapPts = ov.mapPts.slice();
      newPdfPts[bestIdx] = [u, v];
      newMapPts[bestIdx] = [mapLL[0], mapLL[1]];
      // Re-warp: try the saved file handle first, then fall back to asking the
      // user to re-select the PDF.
      var rew = await rewarpOverlayFromHandle(ov.id, newPdfPts.slice(0, 3), newMapPts.slice(0, 3), map, { scale: 4 });
      var newHandle = null;
      if (!rew) {
        var picked = await pickPdfFile();
        if (!picked) {
          // user cancelled → just abort, keep old warp
          cancelCalibration(); return;
        }
        rew = await rewarpOverlayFromFile(picked.file, newPdfPts.slice(0, 3), newMapPts.slice(0, 3), map, { scale: 4 });
        newHandle = picked.handle || null;
      }
      if (!rew) {
        alert("Re-warp falhou — verifica que escolheste o PDF correto.");
        cancelCalibration(); return;
      }
      setPdfOverlays(function(os) {
        return os.map(function(o) {
          if (o.id !== ov.id) return o;
          return Object.assign({}, o, {
            dataUrl: rew.dataUrl,
            dataUrlHi: null,           // invalidate; will be re-rendered on next zoom-in
            width: rew.width,
            height: rew.height,
            bounds: rew.bounds,
            pdfPts: newPdfPts.slice(0, 3),
            mapPts: newMapPts.slice(0, 3),
            calibration: null,         // legacy nudge fields no longer apply
          });
        });
      });
      // Persist a fresh handle if the user had to re-pick the file, so future
      // calibrations go through without prompting again.
      if (newHandle) {
        try {
          var refreshed = (pdfOverlays || []).find(function(o) { return o.id === ov.id; });
          if (refreshed) await savePdfOverlayIdb(Object.assign({}, refreshed, { dataUrl: rew.dataUrl, dataUrlHi: null, bounds: rew.bounds, width: rew.width, height: rew.height, pdfPts: newPdfPts.slice(0, 3), mapPts: newMapPts.slice(0, 3), calibration: null }), newHandle);
        } catch (_) {}
      }
    } catch (e) {
      alert("Calibração falhou: " + (e && e.message ? e.message : e));
    }
    cancelCalibration();
  }

  const flightRef = useRef(flight);
  useEffect(() => { flightRef.current = flight; }, [flight]);

  // Latest live data, kept in refs so the imperative 1 Hz sim-marker updater
  // (effect below) can read fresh values without re-binding the interval and
  // without forcing the whole MapTab subtree to re-render every second.
  const liveRouteRef = useRef(liveRoute);
  const liveETAsRef = useRef(liveETAs);
  useEffect(() => { liveRouteRef.current = liveRoute; }, [liveRoute]);
  useEffect(() => { liveETAsRef.current = liveETAs; }, [liveETAs]);

  // When pickMode is active, the next Leaflet click places the waypoint
  const pickModeRef = useRef(false);
  pickModeRef.current = pickMode;

  // Init Leaflet map once
  useEffect(() => {
    if (!window.L || !mapDivRef.current || mapRef.current) return;
    const map = window.L.map(mapDivRef.current, { zoomControl: true, attributionControl: true, zoomSnap: 0, zoomDelta: 0.25, wheelPxPerZoomLevel: 90 });

    // Custom pane for route — sits above overlayPane (z:400) where imageOverlays live
    map.createPane('routePane');
    map.getPane('routePane').style.zIndex = 500;
    map.getPane('routePane').style.pointerEvents = 'none';

    // Pane for per-leg labels — above routePane so they render in front of the route line
    map.createPane('legLabelPane');
    map.getPane('legLabelPane').style.zIndex = 520;
    map.getPane('legLabelPane').style.pointerEvents = 'none';

    map.on('click', function(e) {
      // Calibration takes precedence over WP pick mode
      if (calibratingIdRef.current != null) {
        var ll = [e.latlng.lat, e.latlng.lng];
        if (calibStepRef.current === "pickChart") {
          calibChartLLRef.current = ll;
          setCalibStep("pickMap");
        } else if (calibStepRef.current === "pickMap" && calibChartLLRef.current) {
          // Schedule the async work outside the Leaflet click handler
          setTimeout(function() { applyCalibPairRef.current(calibChartLLRef.current, ll); }, 0);
        }
        return;
      }
      if (!pickModeRef.current) return;
      setPickMode(false);
      var lat = e.latlng.lat, lon = e.latlng.lng;
      var cps = flightRef.current.checkpoints;
      var bestIdx = null, bestDist = Infinity;
      for (var ci = 0; ci + 1 < cps.length; ci++) {
        var a = cps[ci], b = cps[ci + 1];
        if (a.lat == null || b.lat == null) continue;
        var d = ptSegDist(lat, lon, a.lat, a.lon, b.lat, b.lon);
        if (d < bestDist) { bestDist = d; bestIdx = ci; }
      }
      if (bestIdx == null && cps.length > 0) bestIdx = cps.length - 1;
      if (bestIdx == null) return;
      onInsertWaypointRef.current(bestIdx, lat, lon);
    });

    function reportView() {
      try {
        var c = map.getCenter();
        lastViewRef.current = { center: [c.lat, c.lng], zoom: map.getZoom() };
      } catch (_) {}
    }

    // Debounce zoomend so rapid pinch / wheel gestures only kick the heavy
    // pipeline (label visibility + hi-res scheduler + overlay re-sync) once
    // after the user settles.
    var zoomDebounce = null;
    map.on('zoomend', function() {
      if (zoomDebounce) clearTimeout(zoomDebounce);
      zoomDebounce = setTimeout(function() {
        try {
          legLabelUpdaterRef.current();
          setMapZoom(map.getZoom());
          reportView();
        } catch (_) {}
        zoomDebounce = null;
      }, 80);
    });

    var moveDebounce = null;
    map.on('moveend', function() {
      if (moveDebounce) clearTimeout(moveDebounce);
      moveDebounce = setTimeout(function() {
        reportView();
        moveDebounce = null;
      }, 120);
    });

    mapRef.current = map;
    try { setMapZoom(map.getZoom()); } catch (_) {}

    // Restore the last viewed center/zoom if we have one (tab switch). When
    // restored, the route effect should NOT fit-bounds back to the route.
    if (initialView && initialView.center && typeof initialView.zoom === 'number') {
      try {
        map.setView(initialView.center, initialView.zoom, { animate: false });
        restoredViewRef.current = true;
      } catch (_) {}
    }

    return () => {
      if (zoomDebounce) clearTimeout(zoomDebounce);
      if (moveDebounce) clearTimeout(moveDebounce);
      // Flush the last view to App so tab-switch restores correctly.
      if (lastViewRef.current && onViewChangeRef.current) {
        try { onViewChangeRef.current(lastViewRef.current); } catch (_) {}
      }
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Stable ref so the Leaflet click handler always calls the current callback
  const onInsertWaypointRef = useRef(onInsertWaypoint);
  useEffect(() => { onInsertWaypointRef.current = onInsertWaypoint; }, [onInsertWaypoint]);
  // Same trick for the calibration applier — re-bound on every render so the
  // click handler always sees the latest pdfOverlays and setPdfOverlays.
  const applyCalibPairRef = useRef(function() {});
  useEffect(() => { applyCalibPairRef.current = applyCalibPair; });

  // Swap tile layer when tileMode changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L) return;
    if (overlayRef.current.tileLayer) map.removeLayer(overlayRef.current.tileLayer);
    const url = tileMode === 'sat'
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    const attr = tileMode === 'sat' ? '© Esri' : '© OpenStreetMap';
    const layer = window.L.tileLayer(url, { attribution: attr, maxZoom: 18, keepBuffer: 4 }).addTo(map);
    overlayRef.current.tileLayer = layer;
  }, [tileMode]);

  // Sync PDF overlay layers — warped image pre-computed at creation,
  // L.imageOverlay for display. Re-runs on overlay state change AND on zoom
  // change so we can swap to the hi-res image when the user is zoomed in.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L) return;
    const useHi = mapZoom >= HIRES_ZOOM;

    function chooseUrl(ov) {
      return (useHi && ov.dataUrlHi) ? ov.dataUrlHi : ov.dataUrl;
    }
    function chooseBounds(ov) {
      return applyOverlayCalibration(ov.bounds, ov.calibration);
    }
    function chooseOpacity(ov) {
      // While the user is picking the "real" map location, fade the chart so they
      // can see what is underneath without losing it altogether.
      if (calibratingId === ov.id && calibStep === "pickMap") return 0.25;
      var base = ov.opacity != null ? ov.opacity : 0.7;
      // Zoom-IN fade: from `start` (full base opacity) linearly to `end`
      // (fully transparent). Below `start` overlay shows at base; above `end`
      // it's invisible. start >= end disables the fade entirely.
      var start = (prefs && prefs.overlayFadeZoom != null) ? prefs.overlayFadeZoom : 12;
      var end = (prefs && prefs.overlayFadeEndZoom != null) ? prefs.overlayFadeEndZoom : 15;
      if (end <= start || mapZoom <= start) return base;
      if (mapZoom >= end) return 0;
      return base * (1 - (mapZoom - start) / (end - start));
    }

    function makeLayer(ov) {
      const url = chooseUrl(ov);
      const bounds = chooseBounds(ov);
      if (!url || !bounds) return { remove: function(){}, setOverlay: function(){} };
      var layer = window.L.imageOverlay(url, bounds, {
        opacity: chooseOpacity(ov), interactive: false, zIndex: 450
      });
      if (ov.visible) layer.addTo(map);
      var currentUrl = url;
      var currentBounds = bounds;
      return {
        remove: function() { layer.remove(); },
        // Pass the freshly-computed opacity in from the caller — the closure
        // here would otherwise capture the FIRST mount's `mapZoom`/`prefs` and
        // never honour live zoom changes (#fade not updating until tab swap).
        setOverlay: function(newOv, opacityValue) {
          var nu = chooseUrl(newOv);
          var nb = chooseBounds(newOv);
          if (nu && nu !== currentUrl) { try { layer.setUrl(nu); } catch (_) {} currentUrl = nu; }
          if (nb && (!currentBounds
              || nb[0][0] !== currentBounds[0][0] || nb[0][1] !== currentBounds[0][1]
              || nb[1][0] !== currentBounds[1][0] || nb[1][1] !== currentBounds[1][1])) {
            try { layer.setBounds(window.L.latLngBounds(nb[0], nb[1])); } catch (_) {}
            currentBounds = nb;
          }
          layer.setOpacity(opacityValue != null ? opacityValue : chooseOpacity(newOv));
          if (newOv.visible) layer.addTo(map); else layer.remove();
        }
      };
    }

    var ids = new Set(pdfOverlays.map(function(o) { return o.id; }));
    Object.keys(pdfLayerRefs.current).forEach(function(id) {
      if (!ids.has(Number(id))) {
        pdfLayerRefs.current[id].remove();
        delete pdfLayerRefs.current[id];
      }
    });
    pdfOverlays.forEach(function(ov) {
      if (pdfLayerRefs.current[ov.id]) {
        pdfLayerRefs.current[ov.id].setOverlay(ov, chooseOpacity(ov));
      } else {
        pdfLayerRefs.current[ov.id] = makeLayer(ov);
      }
    });
  }, [pdfOverlays, mapZoom, calibratingId, calibStep, prefs && prefs.overlayFadeZoom, prefs && prefs.overlayFadeEndZoom]);

  // Lazy hi-res rendering: when the user zooms past HIRES_ZOOM, schedule a
  // background re-render of every visible overlay that doesn't yet have
  // dataUrlHi. Each overlay is rendered at most once at a time; the result
  // gets pushed back into the overlay state and the layer-sync effect picks it
  // up automatically.
  // Hi-res rendering is heavy (PDF re-render @ scale 5 + warp). Wait until the
  // user has settled — defer the work 400 ms after the last zoom or overlay
  // change, and abort if another change comes in. The base resolution shows
  // meanwhile; the hi-res quietly arrives once the gesture stops.
  useEffect(() => {
    if (!mapRef.current) return;
    if (mapZoom < HIRES_ZOOM) return;
    var timer = setTimeout(function() {
      pdfOverlays.forEach(function(ov) {
        if (!ov || !ov.visible || ov.dataUrlHi) return;
        if (hiRenderingRef.current.has(ov.id)) return;
        hiRenderingRef.current.add(ov.id);
        renderPdfHiRes(ov, mapRef.current, { scale: 5 }).then(function(hiUrl) {
          hiRenderingRef.current.delete(ov.id);
          if (!hiUrl) return;
          setPdfOverlays(function(os) {
            return os.map(function(o) { return o.id === ov.id ? Object.assign({}, o, { dataUrlHi: hiUrl }) : o; });
          });
        }).catch(function() { hiRenderingRef.current.delete(ov.id); });
      });
    }, 400);
    return function() { clearTimeout(timer); };
  }, [mapZoom, pdfOverlays]);

  // Custom icon factory
  function makeIcon(color, label, small) {
    const size = small ? 20 : 26;
    const html = `<div style="background:${color};border-radius:50%;width:${size}px;height:${size}px;
      border:2px solid #fff;display:flex;align-items:center;justify-content:center;
      font-size:${small?7:9}px;font-weight:bold;color:#000;white-space:nowrap;overflow:hidden;
      box-shadow:0 1px 4px rgba(0,0,0,.6)">${label}</div>`;
    return window.L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size/2, size/2] });
  }
  function planeIcon(heading) {
    // ✈ emoji points East (90°) by default — subtract 90° to normalize to North=0°
    const html = `<div style="transform:rotate(${heading - 90}deg);font-size:22px;filter:drop-shadow(0 1px 3px #000);line-height:1">✈</div>`;
    return window.L.divIcon({ html, className: '', iconSize: [26,26], iconAnchor: [13,13] });
  }

  // Redraw route + markers when liveRoute changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L) return;
    const ov = overlayRef.current;
    if (ov.route)   map.removeLayer(ov.route);
    ov.markers.forEach(m => map.removeLayer(m));
    ov.markers = [];

    const userWps = liveRoute.filter(cp => !cp.isVirtual && cp.lat != null && cp.lon != null);
    const virtWps = liveRoute.filter(cp =>  cp.isVirtual && cp.lat != null && cp.lon != null);

    if (userWps.length === 0) return;

    // Route polyline through user waypoints — in routePane (z:500) above PDF overlays (z:450)
    const coords = userWps.map(cp => [cp.lat, cp.lon]);
    ov.route = window.L.polyline(coords, { color: '#f59e0b', weight: 2.5, opacity: 0.9, pane: 'routePane' }).addTo(map);
    // Only auto-fit on the first render. After that, preserve the user's
    // current pan/zoom (also when restored from a saved view across tabs).
    if (!restoredViewRef.current) {
      map.fitBounds(ov.route.getBounds(), { padding: [50, 50] });
      restoredViewRef.current = true;
    }

    // User waypoint markers
    userWps.forEach((cp, i) => {
      const color = cp.isOrigin ? '#22c55e' : cp.coordProjected ? '#fbbf24' : '#f59e0b';
      const label = cp.name?.slice(0,4) ?? String(i);
      const m = window.L.marker([cp.lat, cp.lon], { icon: makeIcon(color, label, false) }).addTo(map);
      const etaStr = liveETAs[cp.userIdx] != null
        ? `<br/>ETA ${Math.floor(liveETAs[cp.userIdx]/60).toString().padStart(2,'0')}:${Math.round(liveETAs[cp.userIdx]%60).toString().padStart(2,'0')}`
        : '';
      m.bindPopup(`<b>${cp.name}</b>${cp.alt != null ? `<br/>${cp.alt} ft` : ''}${etaStr}`);
      ov.markers.push(m);
    });

    // Per-leg MC + distance labels (Jeppesen-style) at midpoint of each leg
    const LABEL_W = 110;
    const legLabels = []; // { marker, a, b, width }
    for (let i = 1; i < userWps.length; i++) {
      const a = userWps[i - 1], b = userWps[i];
      if (a.lat == null || b.lat == null) continue;
      const tc = b.tc != null ? b.tc : 0;
      const mc = b.mc != null ? Math.round(((b.mc % 360) + 360) % 360) : null;
      const dist = b.dist != null ? b.dist : null;
      if (mc == null && dist == null) continue;
      const [mlat, mlon] = gcInterpolate(a.lat, a.lon, b.lat, b.lon, 0.5);
      // Align text along the leg's TC; flip 180 deg when it would render upside-down.
      // CSS rotate is clockwise from "up". Text is upside-down when rot in (90, 270).
      const tcNorm = ((tc % 360) + 360) % 360;
      const baseRot = ((tcNorm - 90) % 360 + 360) % 360;
      const flipped = baseRot > 90 && baseRot < 270;
      const rot = flipped ? (baseRot + 180) % 360 : baseRot;
      const mcStr = mc != null ? String(mc).padStart(3, '0') + '°M' : '';
      const distStr = dist != null ? (dist < 10 ? dist.toFixed(1) : Math.round(dist)) + ' NM' : '';
      const body = [mcStr, distStr].filter(Boolean).join(' · ');
      // Arrow on the side that matches the flight direction. When the label
      // was flipped, "forward" along the leg points to the DOM-left side.
      const text = flipped ? ('◀ ' + body) : (body + ' ▶');
      const html =
        '<div style="' +
        'transform: rotate(' + rot + 'deg);' +
        'transform-origin: 50% 50%;' +
        'background: rgba(255,255,255,0.94);' +
        'color: #1f2937;' +
        'border: 1px solid #4c1d95;' +
        'border-radius: 4px;' +
        'padding: 1px 6px;' +
        'font-size: 10px;' +
        'font-weight: 700;' +
        'font-family: ui-monospace, SFMono-Regular, Menlo, monospace;' +
        'white-space: nowrap;' +
        'line-height: 14px;' +
        'box-shadow: 0 1px 3px rgba(0,0,0,.5);' +
        'pointer-events: none;' +
        'text-align: center;' +
        '">' + text + '</div>';
      const icon = window.L.divIcon({ html, className: '', iconSize: [LABEL_W, 18], iconAnchor: [LABEL_W / 2, 9] });
      const lbl = window.L.marker([mlat, mlon], { icon, pane: 'legLabelPane', interactive: false, keyboard: false }).addTo(map);
      ov.markers.push(lbl);
      legLabels.push({ marker: lbl, a: a, b: b, width: LABEL_W });
    }

    // Hide any leg label whose leg is shorter on screen than the label.
    // Re-runs on zoom (see legLabelUpdaterRef wired in init effect).
    function updateLegLabelVisibility() {
      const PAD = 12; // minimum slack so the label does not touch the endpoints
      legLabels.forEach(({ marker, a, b, width }) => {
        const pa = map.latLngToLayerPoint([a.lat, a.lon]);
        const pb = map.latLngToLayerPoint([b.lat, b.lon]);
        const legPx = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        const fits = legPx >= width + PAD;
        const el = marker.getElement();
        if (el) el.style.display = fits ? '' : 'none';
      });
    }
    updateLegLabelVisibility();
    legLabelUpdaterRef.current = updateLegLabelVisibility;

    // Virtual waypoint markers (TOC/TOD/BOD/BOC) — small dots on the route.
    // Pale amber so cyan stays reserved for "agora / em voo" indicators
    // (deviation overlay, simulated aircraft, DESVIO ATIVO chip).
    virtWps.forEach(cp => {
      const color = '#fde68a';
      const m = window.L.marker([cp.lat, cp.lon], { icon: makeIcon(color, cp.name, true) }).addTo(map);
      m.bindPopup(`<b>${cp.name}</b><br/>${cp.alt} ft`);
      ov.markers.push(m);
    });
  }, [liveRoute]);

  // Active deviation overlay (cyan dashed line from current position to target)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L) return;
    const ov = overlayRef.current;
    if (ov.deviation) { map.removeLayer(ov.deviation); ov.deviation = null; }
    const dev = flight.activeDeviation;
    if (!dev || dev.fromLat == null || dev.fromLon == null || dev.targetIdx == null) return;
    const target = (flight.checkpoints || [])[dev.targetIdx];
    if (!target || target.lat == null || target.lon == null) return;
    ov.deviation = window.L.polyline(
      [[dev.fromLat, dev.fromLon], [target.lat, target.lon]],
      { color: '#22d3ee', weight: 4, opacity: 0.95, dashArray: '10,8', pane: 'routePane' }
    ).addTo(map);
  }, [flight.activeDeviation, flight.checkpoints]);

  // Simulated aircraft position — single source of truth lives in
  // lib/planning.js (estimatedPosition). Runs imperatively (setLatLng/
  // setIcon on the existing Leaflet marker) so the 1 Hz update doesn't
  // re-render the whole MapTab subtree. Triggered by:
  //   (a) the 1 Hz wall-clock timer (so the marker drifts smoothly along the
  //       leg between React state changes), and
  //   (b) React deps below (so it reacts immediately to ATA marks, deviations,
  //       route edits — without waiting up to a second for the next tick).
  const updateSimMarker = useCallback(() => {
    const map = mapRef.current;
    if (!map || !window.L) return;
    const ov = overlayRef.current;

    const f = flightRef.current;
    const est = estimatedPosition({
      liveRoute: liveRouteRef.current,
      liveETAs: liveETAsRef.current,
      flight: f,
      nowMin: nowHHMM(),
      eobtMin: parseHHMM(f.eobt) ?? 0,
    });
    if (!est) {
      if (ov.simMarker) { map.removeLayer(ov.simMarker); ov.simMarker = null; }
      return;
    }

    const label = est.holding ? 'Posição estimada (hold)'
      : est.devActive ? 'Posição estimada (desvio)'
      : 'Posição estimada';
    const icon = planeIcon(est.course || 0);

    if (!ov.simMarker) {
      ov.simMarker = window.L.marker([est.lat, est.lon], {
        icon, zIndexOffset: 1000,
      }).addTo(map);
      ov.simMarker.bindPopup(label);
    } else {
      ov.simMarker.setLatLng([est.lat, est.lon]);
      ov.simMarker.setIcon(icon);
      ov.simMarker.setPopupContent(label);
    }
  }, []);

  // 1 Hz drift updater — no React state involved, no re-render triggered.
  useEffect(() => {
    const id = setInterval(updateSimMarker, 1000);
    return () => clearInterval(id);
  }, [updateSimMarker]);

  // Re-run on React data changes (ATA marks, deviations, route edits) so the
  // marker doesn't lag behind by up to one second waiting for the next tick.
  useEffect(() => {
    updateSimMarker();
  }, [liveRoute, liveETAs, flight.atd, flight.activeDeviation, updateSimMarker]);

  const hasCoords = liveRoute.some(cp => cp.lat != null && cp.lon != null);

  return (
    <div className="flex flex-col overflow-hidden" style={{ position: "relative", isolation: "isolate", height: "calc(100dvh - 8rem)" }}>
      {/* Tile switcher + add WP + layers buttons */}
      <div className={`flex gap-1 p-2 ${theme.panel} border-b ${theme.panelBorder} shrink-0`}>
        {[['osm','OSM'],['sat','Satélite']].map(([key, label]) => (
          <button key={key} onClick={() => setTileMode(key)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
              tileMode === key ? `${theme.accentBorder} ${theme.accent} bg-amber-500/10` : `${theme.panelBorder} ${theme.fgFaint}`
            }`}>
            {label}
          </button>
        ))}
        <div className="ml-auto flex gap-1">
          <button
            onClick={() => setPickMode(p => !p)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
              pickMode ? `border-amber-500 text-amber-400 bg-amber-500/20` : `${theme.panelBorder} ${theme.fgFaint}`
            }`}>
            {pickMode ? '✕' : '+ WP'}
          </button>
          <button
            onClick={() => setLayersOpen(true)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
              pdfOverlays.length > 0 ? `border-amber-500 text-amber-400 bg-amber-500/20` : `border-sky-600 text-sky-400`
            }`}>
            🗺 Cartas{pdfOverlays.length > 0 ? ` (${pdfOverlays.length})` : ''}
          </button>
        </div>
      </div>

      {/* Pick mode instruction banner */}
      {pickMode && (
        <div className="absolute top-12 left-0 right-0 z-50 flex justify-center pointer-events-none">
          <div className="bg-amber-500 text-black text-xs font-bold px-4 py-2 rounded-full shadow-lg mt-1">
            Toque no mapa para adicionar waypoint
          </div>
        </div>
      )}

      {/* Calibration banner (replaces or co-exists with pickMode) */}
      {calibratingId && (
        <div className="absolute top-12 left-0 right-0 z-50 flex justify-center px-3 pointer-events-none">
          <div className="bg-amber-600 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-lg mt-1 flex items-center gap-2 max-w-full pointer-events-auto">
            <span>
              {calibStep === "pickChart" && "Calibrar (1/2): toque na CARTA num ponto reconhecível"}
              {calibStep === "pickMap"   && "Calibrar (2/2): toque no MAPA onde esse ponto realmente fica"}
              {calibStep === "applying"  && "Re-warpeando a carta…"}
            </span>
            <button onClick={cancelCalibration}
              disabled={calibStep === "applying"}
              className="px-2 py-0.5 rounded border border-white/60 text-[10px]">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Map container */}
      <div ref={mapDivRef} className="flex-1" />

      {!hasCoords && (
        <div className={`absolute inset-0 flex items-center justify-center pointer-events-none`}
          style={{ top: '120px' }}>
          <div className={`${theme.panel} border ${theme.panelBorder} rounded-2xl p-6 text-center mx-8`}>
            <MapIcon className={`w-10 h-10 ${theme.fgFaint} mx-auto mb-3`} />
            <div className={`font-bold ${theme.fg} mb-1`}>Sem coordenadas</div>
            <div className={`text-[11px] ${theme.fgFaint}`}>
              Edite os waypoints no Setup e adicione coordenadas (lat/lon) para ver a rota no mapa.
            </div>
          </div>
        </div>
      )}

      {layersOpen && (
        <PdfLayersPanel
          overlays={pdfOverlays}
          setOverlays={setPdfOverlays}
          mapZoom={mapZoom}
          onAddNew={() => { setLayersOpen(false); setGeorefActive(true); }}
          onStartCalibration={startCalibration}
          onClose={() => setLayersOpen(false)}
        />
      )}

      {georefActive && (
        <PdfGeoreferencer
          mapRef={mapRef}
          pdfOverlays={pdfOverlays}
          setPdfOverlays={setPdfOverlays}
          onDone={(overlay, handle) => {
            // New overlay lands on top of the z-stack — `order` = current count
            // means it's last in the canonical (ASC) array, addedTo last in
            // Leaflet, and shows first in the reversed UI list.
            var withOrder = { ...overlay, order: pdfOverlays.length };
            setPdfOverlays(os => [...os, withOrder]);
            savePdfOverlayIdb(withOrder, handle || null).catch(() => {});
            setGeorefActive(false);
          }}
          onCancel={() => setGeorefActive(false)}
        />
      )}

    </div>
  );
}

export { MapTab };
