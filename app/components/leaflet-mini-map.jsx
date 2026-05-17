// Leaflet helpers shared by the three mini-maps in the app: DeviationPanel
// (reposition / deviation editor), PointFinderMapTab (search → pick), and
// MapPicker (waypoint coordinate picker). All three replicated ~50 lines
// of Leaflet boilerplate (create map + OSM tile + custom pane + route
// polyline + WP markers + initial bounds + invalidateSize timeout) plus a
// PDF overlay sync effect that was literally identical in every site.
//
// NOT used by app/components/map-tab.jsx — the main tab has tile mode
// toggle, hi-res PDF rasterization, fade-on-zoom, calibration mode, and
// other behavior that doesn't fit the simple "show route + click to pick"
// pattern. Forcing it through this hook would inflate the API surface
// more than the dedup saves.
//
// Both hooks read window.L (Leaflet UMD) directly — same as the call
// sites used to. No props for the lib, no fallback if L is absent
// beyond an early return.

import { useEffect, useRef } from "react";

const DEFAULT_CENTER = [39.5, -8.0]; // Portugal — same fallback every prior call site used
const DEFAULT_ZOOM = 6;
const SINGLE_WP_ZOOM = 9;

// Common Leaflet map options used by every mini-map (route-pick experience,
// quarter-step zoom for finger-pinch precision).
const MINI_MAP_OPTS = { zoomControl: true, zoomSnap: 0, zoomDelta: 0.25, wheelPxPerZoomLevel: 90 };

// Mount-once Leaflet map with optional route polyline + WP markers + click
// handler. Returns a stable mapRef. Effect is intentionally [] — every
// caller used to do exactly that, and we don't want to re-create the map
// when the route changes (the caller manages route updates separately if
// needed, but the existing mini-maps treat the route as immutable for
// their lifetime).
//
// Variable bits parameterized by props:
//   - routePane: { name, zIndex, pointerEvents? } — at least one pane is
//                created and used for the route polyline + WP markers.
//   - extraPanes: [{ name, zIndex }] — created after routePane. Caller can
//                 use them in setupExtras (e.g. library-points layer).
//   - wps: array of { lat, lon, name? } — drawn as a dashed polyline
//          plus purple markers. Falsy lat/lon entries are filtered.
//   - routeStyle: { color, opacity, dashArray } — overrides the polyline
//                 default of amber 2px dashed.
//   - initialPos: [lat, lon] — used when wps is empty (MapPicker uses
//                 this to centre on the editor's seed coords).
//   - onMapClick: (latlng) => void — wired to map.on('click', ...).
//   - setupExtras: (map) => void — runs after the route layer is drawn,
//                  before the invalidateSize timeout. Use this for any
//                  extra markers / panes / behaviour specific to one
//                  caller (e.g. library star markers in PointFinderMapTab).
function useLeafletMiniMap({
  mapDivRef,
  routePane,
  extraPanes,
  wps,
  routeStyle,
  initialPos,
  onMapClick,
  setupExtras,
}) {
  const mapRef = useRef(null);

  useEffect(() => {
    if (!window.L || !mapDivRef.current || mapRef.current) return;
    const map = window.L.map(mapDivRef.current, MINI_MAP_OPTS);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 18, keepBuffer: 4,
    }).addTo(map);

    // Route + any caller-defined extras share their own pane(s) so the
    // PDF overlay (z:400, default Leaflet overlayPane) sits below them.
    if (routePane) {
      map.createPane(routePane.name);
      const p = map.getPane(routePane.name);
      p.style.zIndex = String(routePane.zIndex);
      if (routePane.pointerEvents) p.style.pointerEvents = routePane.pointerEvents;
    }
    (extraPanes || []).forEach(ep => {
      map.createPane(ep.name);
      const p = map.getPane(ep.name);
      p.style.zIndex = String(ep.zIndex);
      if (ep.pointerEvents) p.style.pointerEvents = ep.pointerEvents;
    });

    const filtered = (wps || []).filter(cp => cp && cp.lat != null && cp.lon != null);
    const style = Object.assign({ color: '#f59e0b', weight: 2, opacity: 0.7, dashArray: '4,4' }, routeStyle || {});
    if (routePane) style.pane = routePane.name;
    if (filtered.length >= 2) {
      const coords = filtered.map(cp => [cp.lat, cp.lon]);
      window.L.polyline(coords, style).addTo(map);
      filtered.forEach(cp => {
        const html = `<div style="background:#a855f7;border-radius:50%;width:10px;height:10px;border:2px solid #fff;box-shadow:0 1px 3px #000"></div>`;
        const icon = window.L.divIcon({ html, className: '', iconSize: [10,10], iconAnchor: [5,5] });
        const opts = routePane ? { icon, pane: routePane.name } : { icon };
        window.L.marker([cp.lat, cp.lon], opts).addTo(map).bindPopup(cp.name || '');
      });
      map.fitBounds(window.L.latLngBounds(coords), { padding: [50, 50] });
    } else if (filtered.length === 1) {
      const onlyWp = filtered[0];
      // Single anchor — fitBounds with padding chokes on a degenerate box,
      // so centre + drop the marker manually (matching the previous MapPicker
      // behaviour; the other two callers' single-wp branch had no marker but
      // adding one is harmless and visually consistent).
      const html = `<div style="background:#a855f7;border-radius:50%;width:10px;height:10px;border:2px solid #fff;box-shadow:0 1px 3px #000"></div>`;
      const icon = window.L.divIcon({ html, className: '', iconSize: [10,10], iconAnchor: [5,5] });
      const opts = routePane ? { icon, pane: routePane.name } : { icon };
      window.L.marker([onlyWp.lat, onlyWp.lon], opts).addTo(map).bindPopup(onlyWp.name || '');
      map.setView([onlyWp.lat, onlyWp.lon], SINGLE_WP_ZOOM);
    } else if (initialPos) {
      map.setView(initialPos, 10);
    } else {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    }

    if (typeof setupExtras === 'function') setupExtras(map);
    if (typeof onMapClick === 'function') map.on('click', (e) => onMapClick(e.latlng));

    mapRef.current = map;
    // Container is mounted inside a flex column whose final size is
    // settled after the modal animation; force a tile re-layout once the
    // box is stable. Matches the prior call sites' 50 ms timeout.
    const t = setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 50);
    return () => { clearTimeout(t); map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { mapRef };
}

// Sync PDF chart overlays as L.imageOverlay layers on a mini-map. Removes
// every previous layer and re-adds the currently-visible ones each time
// pdfOverlays changes. Map-tab does something more elaborate (per-id
// reuse + hi-res switching + fade-on-zoom) — this is the bare-bones
// version every mini-map already had inlined.
function useLeafletPdfOverlays(mapRef, pdfOverlays) {
  const pdfLayerRefs = useRef({});
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L || !pdfOverlays) return;
    Object.keys(pdfLayerRefs.current).forEach(id => {
      try { pdfLayerRefs.current[id].remove(); } catch (_) {}
    });
    pdfLayerRefs.current = {};
    pdfOverlays.forEach(ov => {
      if (!ov.visible || !ov.dataUrl || !ov.bounds) return;
      const layer = window.L.imageOverlay(ov.dataUrl, ov.bounds, {
        opacity: ov.opacity != null ? ov.opacity : 0.7, interactive: false, zIndex: 450,
      }).addTo(map);
      pdfLayerRefs.current[ov.id] = layer;
    });
    return () => {
      Object.keys(pdfLayerRefs.current).forEach(id => {
        try { pdfLayerRefs.current[id].remove(); } catch (_) {}
      });
      pdfLayerRefs.current = {};
    };
  }, [pdfOverlays]);
}

export { useLeafletMiniMap, useLeafletPdfOverlays };
