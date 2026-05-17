// DeviationPanel — extracted from app/main.jsx (phase B of cleanup).
// See CLAUDE.md "Extrair um componente" for the audit recipe used.

import { useState, useEffect, useMemo, useRef } from "react";

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
export { DeviationPanel };
