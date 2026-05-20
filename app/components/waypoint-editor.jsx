// Waypoint editor — modal with three modes: free coordinate entry (DDM
// keypad / decimal / DMS), AIRAC airport search, and pick-from-map. Plus
// the ICAO procedure pickers (SID/STAR/IAP) and saved user-points panel.
// Extracted from app/main.jsx. The body uses several state-machine hooks
// (search query, debounced AIRAC fetches, virtual-route preview) and
// relies on lib/coords.js parsers, lib/airac.js for the AIRAC client, and
// lib/storage.js for user-points persistence — all already on window.

import { useState, useEffect, useMemo, useRef } from "react";
import { Map as MapIcon, MapPin, Plane, Radio, Save, Search, Star, X } from "lucide-react";
import { useLeafletMiniMap, useLeafletPdfOverlays } from "./leaflet-mini-map.jsx?v=20260520.1003";


import { useTheme, useDerived, useFlight } from "../context/app-context.jsx?v=20260520.1003";
import { Button } from "../ui/button.jsx?v=20260520.1003";
function PointFinderMapTab({ pdfOverlays, userPoints, onConfirm, onSave }) {
  const { flight } = useFlight();
  const theme = useTheme();
  const mapDivRef = useRef(null);
  const pickedMarkerRef = useRef(null);
  const [picked, setPicked] = useState(null);
  const [name, setName] = useState("");

  const { mapRef } = useLeafletMiniMap({
    mapDivRef,
    routePane: { name: 'pfRoute', zIndex: 500 },
    extraPanes: [{ name: 'pfLib', zIndex: 510 }],
    wps: flight.checkpoints || [],
    onMapClick: (latlng) => setPicked([latlng.lat, latlng.lng]),
    setupExtras: (map) => {
      (userPoints || []).forEach(pt => {
        if (pt.lat == null || pt.lon == null) return;
        const html = `<div style="background:#f59e0b;border-radius:50%;width:14px;height:14px;border:2px solid #fff;box-shadow:0 1px 3px #000;display:flex;align-items:center;justify-content:center;font-size:9px;color:#000;font-weight:700">★</div>`;
        const icon = window.L.divIcon({ html, className: '', iconSize: [14,14], iconAnchor: [7,7] });
        window.L.marker([pt.lat, pt.lon], { icon, pane: 'pfLib' }).addTo(map).bindPopup(pt.name || '');
      });
    },
  });
  useLeafletPdfOverlays(mapRef, pdfOverlays);

  // Picked marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L) return;
    if (pickedMarkerRef.current) { map.removeLayer(pickedMarkerRef.current); pickedMarkerRef.current = null; }
    if (!picked) return;
    const html = `<div style="background:#22c55e;border-radius:50%;width:18px;height:18px;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.9)"></div>`;
    const icon = window.L.divIcon({ html, className: '', iconSize: [18,18], iconAnchor: [9,9] });
    pickedMarkerRef.current = window.L.marker(picked, { icon, zIndexOffset: 900 }).addTo(map);
  }, [picked]);

  function buildPoint() {
    if (!picked) return null;
    const lat = roundCoord(picked[0]);
    const lon = roundCoord(picked[1]);
    let n = (name || "").trim().slice(0, 10).toUpperCase();
    if (!n) {
      // Auto name: M + abs(lat°)*100 + abs(lon°)*100, e.g., M2350-4664 trimmed
      n = "MAP" + Math.abs(Math.round(lat * 10)).toString().slice(-3) + Math.abs(Math.round(lon * 10)).toString().slice(-3);
      n = n.slice(0, 10);
    }
    return { name: n, kind: "custom", lat, lon, source: { kind: "map", lat, lon } };
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div ref={mapDivRef} style={{ flex: 1, minHeight: 0 }} />
      <div className={`p-3 shrink-0 ${theme.panel} border-t ${theme.panelBorder} space-y-2`}>
        {picked ? (
          <div className={`text-center text-[11px] num ${theme.cyan}`}>
            {picked[0].toFixed(4)}, {picked[1].toFixed(4)}
          </div>
        ) : (
          <div className={`text-center text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>
            Toque no mapa para definir o ponto
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <input type="text" placeholder="Nome (auto)" maxLength={10}
            value={name} onChange={(e) => setName(e.target.value.toUpperCase())}
            className={`${theme.inputBg} border ${theme.inputBorder} ${theme.fg} px-3 py-2 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 num`}
          />
          <button onClick={() => { const p = buildPoint(); if (p) onSave(p); }}
            disabled={!picked}
            className={`px-3 py-2 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1 ${picked ? theme.panelBorder + ' ' + theme.fgMuted : theme.panel + ' ' + theme.fgFaint + ' opacity-40'}`}>
            <Star className="w-3.5 h-3.5" /> Salvar
          </button>
        </div>
        <button onClick={() => { const p = buildPoint(); if (p) onConfirm(p); }}
          disabled={!picked}
          className={`w-full py-3 rounded-xl font-bold text-base ${picked ? theme.accentBg + ' ' + (theme.accentBgFg ?? 'text-black') : theme.panel + ' ' + theme.fgFaint + ' opacity-40'}`}>
          Usar este ponto
        </button>
      </div>
    </div>
  );
}

function PointFinder({ userPoints, onAddUserPoint, onDeleteUserPoint, onConfirm, onCancel, depth = 0, initialQuery = "", pdfOverlays, initialSource = null }) {
  const { flight, ac } = useFlight();
  const theme = useTheme();
  const initialTab = initialSource && initialSource.kind === "radial" ? "radial"
    : initialSource && initialSource.kind === "intersection" ? "intersect"
    : initialSource && initialSource.kind === "map" ? "map"
    : "search";
  const [tab, setTab] = useState(initialTab);
  const [innerOpen, setInnerOpen] = useState(false);
  const [innerSlot, setInnerSlot] = useState(null); // 'anchor' | 'iA' | 'iB'

  // Search tab state
  const [query, setQuery] = useState(initialQuery || "");
  const [airacResults, setAiracResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const abortRef = useRef(null);
  const debounceRef = useRef(null);

  function triggerSearch(q) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) { try { abortRef.current.abort(); } catch (_) {} abortRef.current = null; }
    if (!q || q.length < 2) { setAiracResults(null); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const data = await airacSearch(q, ctrl.signal);
        if (ctrl === abortRef.current) {
          setAiracResults(data || { airports: [], navaids: [], waypoints: [] });
          setSearching(false);
        }
      } catch (_) { /* aborted */ }
    }, 300);
  }
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) { try { abortRef.current.abort(); } catch (_) {} }
    };
  }, []);
  useEffect(() => { if (initialQuery) triggerSearch(initialQuery); }, []); // eslint-disable-line

  // Local matches (substring on name / notes / tags)
  const localMatches = useMemo(() => {
    if (!query || query.length < 1) return [];
    const q = query.toUpperCase();
    return (userPoints || []).filter((pt) => {
      if ((pt.name || "").toUpperCase().includes(q)) return true;
      if ((pt.notes || "").toUpperCase().includes(q)) return true;
      if ((pt.tags || []).some((t) => (t || "").toUpperCase().includes(q))) return true;
      return false;
    });
  }, [userPoints, query]);

  // Radial+distance tab state
  // Pre-fill from initialSource when it's a radial computation, so 'Editar fonte'
  // re-opens with anchor/bearing/distance ready to tweak.
  const _initRadial = initialSource && initialSource.kind === "radial" ? initialSource : null;
  const _initIsect = initialSource && initialSource.kind === "intersection" ? initialSource : null;
  const [anchor, setAnchor] = useState(_initRadial && _initRadial.anchor ? _initRadial.anchor : null);
  const [bearingMode, setBearingMode] = useState(_initRadial && _initRadial.bearingMode ? _initRadial.bearingMode : "mc");
  const [bearing, setBearing] = useState(_initRadial && _initRadial.bearing != null ? String(_initRadial.bearing) : "");
  const [distance, setDistance] = useState(_initRadial && _initRadial.distance != null ? String(_initRadial.distance) : "");

  // Intersection tab state
  const [iAnchorA, setIAnchorA] = useState(_initIsect && _initIsect.anchorA ? _initIsect.anchorA : null);
  const [iAnchorB, setIAnchorB] = useState(_initIsect && _initIsect.anchorB ? _initIsect.anchorB : null);
  const [iBearingMode, setIBearingMode] = useState(_initIsect && _initIsect.bearingMode ? _initIsect.bearingMode : "mc");
  const [iBearingA, setIBearingA] = useState(_initIsect && _initIsect.bearingA != null ? String(_initIsect.bearingA) : "");
  const [iBearingB, setIBearingB] = useState(_initIsect && _initIsect.bearingB != null ? String(_initIsect.bearingB) : "");

  // Coords tab state
  const _initCoords = initialSource && initialSource.kind === "manual" ? initialSource : null;
  const [coordsText, setCoordsText] = useState("");

  const radialResult = (function() {
    if (!anchor || anchor.lat == null || anchor.lon == null) return null;
    const brg = parseFloat(bearing);
    const dist = parseFloat(distance);
    if (isNaN(brg) || isNaN(dist) || dist <= 0) return null;
    const variation = getDecl(anchor.lat, anchor.lon, anchor.alt || 0) ?? (flight.variation ?? 0);
    const tc = bearingMode === "mc" ? (((brg + variation) % 360) + 360) % 360 : brg;
    const proj = projectDest(anchor.lat, anchor.lon, tc, dist);
    return {
      name: ((anchor.name || "PT") + Math.round(brg).toString().padStart(3, "0") + Math.round(dist)).slice(0, 10).toUpperCase(),
      lat: roundCoord(proj[0]),
      lon: roundCoord(proj[1]),
      kind: "computed",
      notes: (anchor.name || "") + " " + bearingMode.toUpperCase() + " " + Math.round(brg) + "° / " + dist + " NM",
      source: {
        kind: "radial",
        anchor: {
          name: anchor.name, kind: anchor.kind || "custom",
          lat: anchor.lat, lon: anchor.lon, alt: anchor.alt ?? null,
          source: anchor.source || { kind: "manual" },
        },
        bearing: brg,
        bearingMode: bearingMode,
        distance: dist,
      },
    };
  })();

  // Intersection result: two anchors, two bearings → great-circle intersection.
  const intersectionResult = (function() {
    if (!iAnchorA || iAnchorA.lat == null || !iAnchorB || iAnchorB.lat == null) return null;
    const ba = parseFloat(iBearingA), bb = parseFloat(iBearingB);
    if (isNaN(ba) || isNaN(bb)) return null;
    const varA = getDecl(iAnchorA.lat, iAnchorA.lon, iAnchorA.alt || 0) ?? (flight.variation ?? 0);
    const varB = getDecl(iAnchorB.lat, iAnchorB.lon, iAnchorB.alt || 0) ?? (flight.variation ?? 0);
    const tcA = iBearingMode === "mc" ? (((ba + varA) % 360) + 360) % 360 : ba;
    const tcB = iBearingMode === "mc" ? (((bb + varB) % 360) + 360) % 360 : bb;
    const out = gcIntersection(iAnchorA.lat, iAnchorA.lon, tcA, iAnchorB.lat, iAnchorB.lon, tcB);
    if (!out) return null;
    return {
      name: ((iAnchorA.name || "A") + "x" + (iAnchorB.name || "B")).slice(0, 10).toUpperCase(),
      kind: "computed",
      lat: roundCoord(out[0]),
      lon: roundCoord(out[1]),
      notes: (iAnchorA.name || "?") + " R" + Math.round(ba) + "° × " + (iAnchorB.name || "?") + " R" + Math.round(bb) + "°",
      source: {
        kind: "intersection",
        anchorA: { name: iAnchorA.name, kind: iAnchorA.kind || "custom",
          lat: iAnchorA.lat, lon: iAnchorA.lon, alt: iAnchorA.alt ?? null,
          source: iAnchorA.source || { kind: "manual" } },
        anchorB: { name: iAnchorB.name, kind: iAnchorB.kind || "custom",
          lat: iAnchorB.lat, lon: iAnchorB.lon, alt: iAnchorB.alt ?? null,
          source: iAnchorB.source || { kind: "manual" } },
        bearingMode: iBearingMode,
        bearingA: ba,
        bearingB: bb,
      },
    };
  })();

  // Coords tab parsed result (best-effort multi-format)
  const coordsResult = (function() {
    if (!coordsText) return null;
    const r = parseCoordsString(coordsText);
    if (!r) return null;
    return {
      name: "PT",
      kind: "custom",
      lat: roundCoord(r[0]),
      lon: roundCoord(r[1]),
      source: { kind: "manual" },
    };
  })();

  function pickFromAirac(item, kind) {
    const lat = item.latitude != null ? Number(item.latitude) : (item.coordinates && item.coordinates.lat);
    const lon = item.longitude != null ? Number(item.longitude) : (item.coordinates && item.coordinates.lon);
    if (lat == null || lon == null) return null;
    const id = (kind === "airport" ? (item.icao || item.iata) : (item.identifier || item.icao)) || "PT";
    return {
      name: id,
      kind,
      lat: roundCoord(Number(lat)),
      lon: roundCoord(Number(lon)),
      alt: kind === "airport" && item.elevation_ft != null ? Number(item.elevation_ft) : null,
      notes: kind === "airport" ? [item.name, item.city].filter(Boolean).join(" · ") : (item.name || ""),
      source: { kind: "search", airacKind: kind, id: id },
    };
  }

  function chooseAndConfirm(pt) {
    if (!pt) return;
    onConfirm(pt);
  }
  async function saveToLib(pt) {
    if (!pt || pt.lat == null || pt.lon == null) return;
    if (!onAddUserPoint) return;
    await onAddUserPoint({
      name: pt.name || "CUSTOM",
      kind: pt.kind || "custom",
      lat: pt.lat, lon: pt.lon,
      alt: pt.alt ?? null,
      notes: pt.notes || "",
      source: pt.source || { kind: "manual" },
    });
  }

  const headerLabel = depth > 0 ? "Escolher ponto · âncora" : "Localizar ponto";
  const inputCls = `w-full ${theme.inputBg} border-2 ${theme.inputBorder} ${theme.fg} px-3 py-2 text-base rounded-xl num focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:${theme.accentBorder}`;

  return (
    <div onClick={(e) => e.stopPropagation()}
      style={{ position: "fixed", inset: 0, zIndex: 9999 + depth * 20, display: "flex", flexDirection: "column", isolation: "isolate" }}
      className={theme.bg}>
      <div className={`flex items-center gap-2 p-3 shrink-0 ${theme.panel} border-b ${theme.panelBorder}`}>
        <button onClick={onCancel} className={`px-3 py-1.5 rounded-lg border text-sm ${theme.panelBorder} ${theme.fgFaint}`}>
          {depth > 0 ? "← Voltar" : "Cancelar"}
        </button>
        <div className="flex-1 text-center">
          <div className={`text-sm font-bold ${theme.cyan}`}>{headerLabel}</div>
          {depth > 0 && (
            <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>nível {depth + 1}</div>
          )}
        </div>
        <div style={{ width: 80 }} />
      </div>

      <div className={`flex shrink-0 border-b ${theme.panelBorder} overflow-x-auto`}>
        {[
          ["search",    "Buscar"],
          ["radial",    "Radial"],
          ["intersect", "Inter."],
          ["coords",    "Coords"],
          ["map",       "Mapa"],
        ].map(function(pair) {
          const key = pair[0], label = pair[1];
          return (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 min-w-[64px] py-3 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                tab === key ? `${theme.accent} border-b-2 border-current` : theme.fgFaint
              }`}>
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {tab === "search" && (
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <input type="text" autoFocus placeholder="Mín. 2 letras (nome / ICAO / fix)"
              value={query}
              onChange={(e) => { const v = e.target.value.toUpperCase(); setQuery(v); triggerSearch(v); }}
              className={inputCls + " text-base font-bold tracking-widest"}
            />
            {localMatches.length > 0 && (
              <div className={`${theme.panel} border ${theme.panelBorder} rounded-xl overflow-hidden`}>
                <div className={`px-3 py-1.5 text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>Meus pontos</div>
                {localMatches.map((pt) => (
                  <button key={pt.id || pt.name}
                    onClick={() => chooseAndConfirm({ name: pt.name, kind: pt.kind || "custom", lat: pt.lat, lon: pt.lon, alt: pt.alt, notes: pt.notes, source: pt.source || { kind: "library", libraryId: pt.id } })}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 text-left active:opacity-70 border-t ${theme.panelBorder}`}>
                    <Star className={`w-4 h-4 ${theme.accent} fill-current shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className={`font-bold truncate ${theme.fg}`}>{pt.name}</div>
                      <div className={`text-xs truncate ${theme.fgFaint} num`}>
                        {pt.lat?.toFixed(4)}, {pt.lon?.toFixed(4)}{pt.notes ? " · " + pt.notes : ""}
                      </div>
                    </div>
                    {pt.alt != null && <span className={`text-[10px] num ${theme.fgFaint}`}>{pt.alt} ft</span>}
                  </button>
                ))}
              </div>
            )}
            {searching && <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint} px-2`}>Buscando AIRAC…</div>}
            {airacResults && (function() {
              const aps = airacResults.airports || [];
              const nvs = airacResults.navaids || [];
              const wps = airacResults.waypoints || [];
              const total = aps.length + nvs.length + wps.length;
              if (total === 0 && !searching) {
                return <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint} px-2`}>Sem resultados em AIRAC</div>;
              }
              const rowBase = "w-full flex items-center gap-2 px-3 py-2.5 text-left active:opacity-70";
              return (
                <div className={`${theme.panel} border ${theme.panelBorder} rounded-xl overflow-hidden`}>
                  <div className={`px-3 py-1.5 text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>AIRAC</div>
                  {aps.map((it, i) => {
                    const pt = pickFromAirac(it, "airport"); if (!pt) return null;
                    return (
                      <button key={"a" + i} onClick={() => chooseAndConfirm(pt)}
                        className={`${rowBase} border-t ${theme.panelBorder}`}>
                        <span className={`text-[10px] font-bold w-10 shrink-0 ${theme.cyan}`}>✈ APT</span>
                        <div className="flex-1 min-w-0">
                          <div className={`font-bold truncate ${theme.fg}`}>{pt.name}</div>
                          <div className={`text-xs truncate ${theme.fgFaint}`}>{pt.notes}</div>
                        </div>
                        {pt.alt != null && <span className={`text-[10px] num shrink-0 ${theme.fgFaint}`}>{pt.alt} ft</span>}
                      </button>
                    );
                  })}
                  {nvs.map((it, i) => {
                    const pt = pickFromAirac(it, "navaid"); if (!pt) return null;
                    return (
                      <button key={"n" + i} onClick={() => chooseAndConfirm(pt)}
                        className={`${rowBase} border-t ${theme.panelBorder}`}>
                        <span className={`text-[10px] font-bold w-10 shrink-0 ${theme.cyan}`}>⊕ NAV</span>
                        <div className="flex-1 min-w-0">
                          <div className={`font-bold truncate ${theme.fg}`}>{pt.name}</div>
                          <div className={`text-xs truncate ${theme.fgFaint}`}>{pt.notes}</div>
                        </div>
                      </button>
                    );
                  })}
                  {wps.map((it, i) => {
                    const pt = pickFromAirac(it, "waypoint"); if (!pt) return null;
                    return (
                      <button key={"w" + i} onClick={() => chooseAndConfirm(pt)}
                        className={`${rowBase} border-t ${theme.panelBorder}`}>
                        <span className={`text-[10px] font-bold w-10 shrink-0 ${theme.cyan}`}>◇ WPT</span>
                        <div className="flex-1 min-w-0">
                          <div className={`font-bold truncate ${theme.fg}`}>{pt.name}</div>
                          <div className={`text-xs truncate ${theme.fgFaint}`}>{pt.notes}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {tab === "radial" && (
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <div>
              <label className={`text-[10px] uppercase tracking-widest ${theme.fgFaint} block mb-1`}>Âncora</label>
              <div className="flex items-center gap-2">
                <div className={`flex-1 ${theme.panel} border ${theme.panelBorder} rounded-xl px-3 py-2 min-h-[44px] flex items-center`}>
                  {anchor ? (
                    <div className="flex-1 min-w-0">
                      <div className={`font-bold truncate ${theme.fg}`}>{anchor.name || "—"}</div>
                      <div className={`text-xs num truncate ${theme.fgFaint}`}>
                        {anchor.lat?.toFixed(4)}, {anchor.lon?.toFixed(4)}
                      </div>
                    </div>
                  ) : (
                    <span className={`text-sm ${theme.fgFaint}`}>Selecione âncora</span>
                  )}
                </div>
                <button onClick={() => { setInnerSlot("anchor"); setInnerOpen(true); }}
                  className={`px-4 py-2 rounded-xl border-2 ${theme.accentBorder} ${theme.accent} text-sm font-bold active:scale-95 inline-flex items-center gap-1`}>
                  <Search className="w-4 h-4" /> Buscar
                </button>
              </div>
            </div>
            <div>
              <label className={`text-[10px] uppercase tracking-widest ${theme.fgFaint} block mb-1`}>Radial</label>
              <div className={`flex rounded-xl overflow-hidden border ${theme.panelBorder} mb-2`}>
                {[["mc", "MC (Mag)"], ["tc", "TC (True)"]].map(function(pair) {
                  const m = pair[0], label = pair[1];
                  return (
                    <button key={m} onClick={() => setBearingMode(m)}
                      className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider ${bearingMode === m ? theme.accentBg + " text-black" : theme.fgFaint}`}>
                      {label}
                    </button>
                  );
                })}
              </div>
              <input type="number" inputMode="numeric" min="0" max="359" placeholder="0–359°"
                value={bearing} onChange={(e) => setBearing(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={`text-[10px] uppercase tracking-widest ${theme.fgFaint} block mb-1`}>Distância (NM)</label>
              <input type="number" inputMode="decimal" min="0" placeholder="ex: 12.5"
                value={distance} onChange={(e) => setDistance(e.target.value)}
                className={inputCls}
              />
            </div>
            {(function() {
              const r = radialResult;
              if (!r) {
                return (
                  <div className={`${theme.panel} border ${theme.panelBorder} rounded-xl p-3 text-center text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>
                    Preencha âncora, radial e distância
                  </div>
                );
              }
              return (
                <div className={`${theme.panel} border ${theme.panelBorder} rounded-xl p-3 space-y-2`}>
                  <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>Resultado</div>
                  <div className={`text-2xl font-black ${theme.cyan} num`}>{r.name}</div>
                  <div className={`text-xs num ${theme.fgMuted}`}>{r.lat.toFixed(4)}, {r.lon.toFixed(4)}</div>
                  <div className={`text-[10px] num ${theme.fgFaint}`}>{r.notes}</div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button onClick={() => saveToLib(r)}
                      className={`px-3 py-2 rounded-lg border text-xs font-bold ${theme.panelBorder} ${theme.fgMuted}`}>
                      <Star className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />Salvar na biblioteca
                    </button>
                    <button onClick={() => chooseAndConfirm(r)}
                      className={`px-3 py-2 rounded-lg ${theme.accentBg} ${theme.accentBgFg} text-xs font-bold`}>
                      Usar este ponto
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {tab === "intersect" && (
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <div>
              <label className={`text-[10px] uppercase tracking-widest ${theme.fgFaint} block mb-1`}>Âncora A</label>
              <div className="flex items-center gap-2">
                <div className={`flex-1 ${theme.panel} border ${theme.panelBorder} rounded-xl px-3 py-2 min-h-[44px] flex items-center`}>
                  {iAnchorA ? (
                    <div className="flex-1 min-w-0">
                      <div className={`font-bold truncate ${theme.fg}`}>{iAnchorA.name || "—"}</div>
                      <div className={`text-xs num truncate ${theme.fgFaint}`}>
                        {iAnchorA.lat?.toFixed(4)}, {iAnchorA.lon?.toFixed(4)}
                      </div>
                    </div>
                  ) : (
                    <span className={`text-sm ${theme.fgFaint}`}>Selecione âncora</span>
                  )}
                </div>
                <button onClick={() => { setInnerSlot("iA"); setInnerOpen(true); }}
                  className={`px-4 py-2 rounded-xl border-2 ${theme.accentBorder} ${theme.accent} text-sm font-bold active:scale-95 inline-flex items-center justify-center`}>
                  <Search className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div>
              <label className={`text-[10px] uppercase tracking-widest ${theme.fgFaint} block mb-1`}>Âncora B</label>
              <div className="flex items-center gap-2">
                <div className={`flex-1 ${theme.panel} border ${theme.panelBorder} rounded-xl px-3 py-2 min-h-[44px] flex items-center`}>
                  {iAnchorB ? (
                    <div className="flex-1 min-w-0">
                      <div className={`font-bold truncate ${theme.fg}`}>{iAnchorB.name || "—"}</div>
                      <div className={`text-xs num truncate ${theme.fgFaint}`}>
                        {iAnchorB.lat?.toFixed(4)}, {iAnchorB.lon?.toFixed(4)}
                      </div>
                    </div>
                  ) : (
                    <span className={`text-sm ${theme.fgFaint}`}>Selecione âncora</span>
                  )}
                </div>
                <button onClick={() => { setInnerSlot("iB"); setInnerOpen(true); }}
                  className={`px-4 py-2 rounded-xl border-2 ${theme.accentBorder} ${theme.accent} text-sm font-bold active:scale-95 inline-flex items-center justify-center`}>
                  <Search className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div>
              <label className={`text-[10px] uppercase tracking-widest ${theme.fgFaint} block mb-1`}>Modo do radial</label>
              <div className={`flex rounded-xl overflow-hidden border ${theme.panelBorder} mb-2`}>
                {[["mc", "MC (Mag)"], ["tc", "TC (True)"]].map(function(pair) {
                  const m = pair[0], label = pair[1];
                  return (
                    <button key={m} onClick={() => setIBearingMode(m)}
                      className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider ${iBearingMode === m ? theme.accentBg + " text-black" : theme.fgFaint}`}>
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className={`text-[10px] ${theme.fgFaint}`}>Radial de A</span>
                  <input type="number" inputMode="numeric" min="0" max="359" placeholder="0–359°"
                    value={iBearingA} onChange={(e) => setIBearingA(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <span className={`text-[10px] ${theme.fgFaint}`}>Radial de B</span>
                  <input type="number" inputMode="numeric" min="0" max="359" placeholder="0–359°"
                    value={iBearingB} onChange={(e) => setIBearingB(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
            </div>
            {(function() {
              const r = intersectionResult;
              if (!r) {
                if (iAnchorA && iAnchorB && iBearingA && iBearingB) {
                  return (
                    <div className={`${theme.panel} border ${theme.panelBorder} rounded-xl p-3 text-center text-[11px] text-red-400`}>
                      ⚠ Radiais paralelos ou divergentes — sem interseção
                    </div>
                  );
                }
                return (
                  <div className={`${theme.panel} border ${theme.panelBorder} rounded-xl p-3 text-center text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>
                    Preencha as duas âncoras e os dois radiais
                  </div>
                );
              }
              return (
                <div className={`${theme.panel} border ${theme.panelBorder} rounded-xl p-3 space-y-2`}>
                  <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>Interseção</div>
                  <div className={`text-2xl font-black ${theme.cyan} num`}>{r.name}</div>
                  <div className={`text-xs num ${theme.fgMuted}`}>{r.lat.toFixed(4)}, {r.lon.toFixed(4)}</div>
                  <div className={`text-[10px] num ${theme.fgFaint}`}>{r.notes}</div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button onClick={() => saveToLib(r)}
                      className={`px-3 py-2 rounded-lg border text-xs font-bold ${theme.panelBorder} ${theme.fgMuted}`}>
                      <Star className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />Salvar na biblioteca
                    </button>
                    <button onClick={() => chooseAndConfirm(r)}
                      className={`px-3 py-2 rounded-lg ${theme.accentBg} ${theme.accentBgFg} text-xs font-bold`}>
                      Usar este ponto
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {tab === "coords" && (
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <div className={`text-[10px] ${theme.fgFaint}`}>
              Cole ou digite as coordenadas. Formatos aceites:<br/>
              · DD: <span className="num">38.7169 -9.1395</span><br/>
              · DDM: <span className="num">38°43.01'N 9°08.37'W</span><br/>
              · DMS: <span className="num">38°43'01"N 9°08'22"W</span><br/>
              · Compacto: <span className="num">3843.01N 00908.37W</span>
            </div>
            <textarea rows={3}
              autoFocus
              placeholder="38°43.01'N 9°08.37'W"
              value={coordsText}
              onChange={(e) => setCoordsText(e.target.value)}
              className={`w-full ${theme.inputBg} border ${theme.inputBorder} ${theme.fg} px-3 py-2 text-base rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 num`}
            />
            {coordsText && (function() {
              const r = coordsResult;
              if (!r) {
                return (
                  <div className={`${theme.panel} border ${theme.panelBorder} rounded-xl p-3 text-center text-[11px] text-red-400`}>
                    ⚠ Não consegui interpretar essas coordenadas
                  </div>
                );
              }
              return (
                <div className={`${theme.panel} border ${theme.panelBorder} rounded-xl p-3 space-y-2`}>
                  <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>Coordenadas</div>
                  <div className={`text-xs num ${theme.fg}`}>{r.lat.toFixed(6)}, {r.lon.toFixed(6)}</div>
                  <div className={`text-[10px] num ${theme.fgFaint}`}>
                    {decDegToStr(r.lat, true)} {decDegToStr(r.lon, false)}
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button onClick={() => saveToLib(r)}
                      className={`px-3 py-2 rounded-lg border text-xs font-bold inline-flex items-center justify-center gap-1 ${theme.panelBorder} ${theme.fgMuted}`}>
                      <Star className="w-3.5 h-3.5" /> Salvar
                    </button>
                    <button onClick={() => chooseAndConfirm(r)}
                      className={`px-3 py-2 rounded-lg ${theme.accentBg} ${theme.accentBgFg} text-xs font-bold`}>
                      Usar este ponto
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {tab === "map" && (
          <PointFinderMapTab pdfOverlays={pdfOverlays}
            userPoints={userPoints}
            onConfirm={chooseAndConfirm}
            onSave={saveToLib}
          />
        )}
      </div>

      {innerOpen && (function() {
        const slotPoint = innerSlot === "anchor" ? anchor
          : innerSlot === "iA" ? iAnchorA
          : innerSlot === "iB" ? iAnchorB : null;
        const slotSource = slotPoint ? slotPoint.source : null;
        const slotInitialQuery = slotSource && slotSource.kind === "search" ? slotSource.id : "";
        return (
          <PointFinder
            userPoints={userPoints}
            onAddUserPoint={onAddUserPoint}
            onDeleteUserPoint={onDeleteUserPoint}
            pdfOverlays={pdfOverlays}
            depth={depth + 1}
            initialSource={slotSource}
            initialQuery={slotInitialQuery}
            onConfirm={(pt) => {
              if (innerSlot === "anchor") setAnchor(pt);
              else if (innerSlot === "iA") setIAnchorA(pt);
              else if (innerSlot === "iB") setIAnchorB(pt);
              setInnerOpen(false);
            }}
            onCancel={() => setInnerOpen(false)}
          />
        );
      })()}
    </div>
  );
}

function MapPicker({ allWps, initialPos, onConfirm, onCancel, pdfOverlays }) {
  const theme = useTheme();
  const mapDivRef = useRef(null);
  const pickedMarkerRef = useRef(null);
  const [picked, setPicked] = useState(initialPos ?? null);

  const { mapRef } = useLeafletMiniMap({
    mapDivRef,
    routePane: { name: 'pickerRoute', zIndex: 500 },
    wps: allWps,
    routeStyle: { opacity: 0.8, dashArray: '5,5' },
    initialPos,
    onMapClick: (latlng) => setPicked([latlng.lat, latlng.lng]),
  });
  useLeafletPdfOverlays(mapRef, pdfOverlays);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L) return;
    if (pickedMarkerRef.current) { map.removeLayer(pickedMarkerRef.current); pickedMarkerRef.current = null; }
    if (picked) {
      const html = `<div style="background:#22c55e;border-radius:50%;width:18px;height:18px;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.9)"></div>`;
      const icon = window.L.divIcon({ html, className: '', iconSize: [18,18], iconAnchor: [9,9] });
      pickedMarkerRef.current = window.L.marker(picked, { icon, zIndexOffset: 500 }).addTo(map);
    }
  }, [picked]);

  const coordStr = picked
    ? (formatCoord(picked[0], picked[1]) || (picked[0].toFixed(5) + ', ' + picked[1].toFixed(5)))
    : null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', isolation: 'isolate' }}
      className={theme.bg}
      onClick={(e) => e.stopPropagation()}>
      <div className={`flex items-center gap-2 p-3 shrink-0 ${theme.panel} border-b ${theme.panelBorder}`}>
        <button onClick={onCancel}
          className={`px-3 py-1.5 rounded-lg border text-sm ${theme.panelBorder} ${theme.fgFaint}`}>
          Cancelar
        </button>
        <span className={`flex-1 text-center text-sm font-bold ${theme.fg}`}>
          Toque no mapa para selecionar
        </span>
        <button onClick={() => { if (picked) onConfirm(picked[0], picked[1]); }}
          disabled={!picked}
          className={`px-3 py-1.5 rounded-lg text-sm font-bold ${
            picked ? `${theme.accentBg} text-black` : `${theme.panel} ${theme.fgFaint} opacity-40`
          }`}>
          Confirmar
        </button>
      </div>
      <div ref={mapDivRef} style={{ flex: 1, minHeight: 0 }} />
      {coordStr && (
        <div className={`p-2 text-center text-xs font-bold shrink-0 ${theme.panel} border-t ${theme.panelBorder} ${theme.cyan}`}>
          {coordStr}
        </div>
      )}
    </div>
  );
}

function StepOverride({ cp, setCp, onNext }) {
  const theme = useTheme();
  const fields = [
    { key: "tasClimbOvr",   label: "TAS Subida",   unit: "kt",    phase: "↗" },
    { key: "tasCruiseOvr",  label: "TAS Cruzeiro", unit: "kt",    phase: "→" },
    { key: "tasDescentOvr", label: "TAS Descida",  unit: "kt",    phase: "↘" },
    { key: "gphClimbOvr",   label: "GPH Subida",   unit: "gal/h", phase: "↗" },
    { key: "gphCruiseOvr",  label: "GPH Cruzeiro", unit: "gal/h", phase: "→" },
    { key: "gphDescentOvr", label: "GPH Descida",  unit: "gal/h", phase: "↘" },
    { key: "rocClimbOvr",   label: "ROC Subida",   unit: "fpm",   phase: "↗" },
    { key: "rodDescentOvr", label: "ROD Descida",  unit: "fpm",   phase: "↘" },
  ];

  const [vals, setVals] = useState(() => {
    const init = {};
    fields.forEach(({ key }) => {
      init[key] = cp[key] != null ? String(cp[key]) : "";
    });
    return init;
  });

  const hasAny = fields.some(({ key }) => vals[key] !== "");

  function apply() {
    setCp((prev) => {
      const upd = { ...prev };
      fields.forEach(({ key }) => {
        if (vals[key] !== "") upd[key] = Number(vals[key]);
        else delete upd[key];
      });
      return upd;
    });
  }

  function clearAll() {
    const empty = {};
    fields.forEach(({ key }) => { empty[key] = ""; });
    setVals(empty);
    setCp((prev) => {
      const upd = { ...prev };
      fields.forEach(({ key }) => { delete upd[key]; });
      return upd;
    });
  }

  const fieldClass = `w-full ${theme.inputBg} border-2 ${theme.inputBorder} ${theme.fg} px-3 py-2 text-base rounded-xl num focus:${theme.accentBorder} focus:outline-none focus:ring-2 focus:ring-amber-500/30`;
  const labelClass = `text-[10px] uppercase tracking-widest ${theme.fgFaint} mb-1 block`;

  return (
    <div className="space-y-4">
      <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>
        Override de performance — <span className={theme.accent}>{cp.name}</span>
      </div>
      <div className={`text-[10px] ${theme.fgFaint}`}>
        Sobrescreve TAS e GPH da aeronave por fase nesta perna. Deixe em branco para usar os valores padrão.
      </div>

      <div className="space-y-3">
        <div className={`text-[10px] uppercase font-bold ${theme.fgMuted}`}>TAS (kt)</div>
        <div className="grid grid-cols-3 gap-2">
          {fields.slice(0, 3).map(({ key, label, unit, phase }) => (
            <div key={key}>
              <label className={labelClass}>{phase} {label.split(" ")[1]}</label>
              <input
                className={fieldClass}
                type="number"
                placeholder="padrão"
                value={vals[key]}
                onChange={(e) => setVals((v) => ({ ...v, [key]: e.target.value }))}
                onBlur={apply}
              />
            </div>
          ))}
        </div>
        <div className={`text-[10px] uppercase font-bold ${theme.fgMuted}`}>GPH (gal/h)</div>
        <div className="grid grid-cols-3 gap-2">
          {fields.slice(3, 6).map(({ key, label, unit, phase }) => (
            <div key={key}>
              <label className={labelClass}>{phase} {label.split(" ")[1]}</label>
              <input
                className={fieldClass}
                type="number"
                placeholder="padrão"
                value={vals[key]}
                onChange={(e) => setVals((v) => ({ ...v, [key]: e.target.value }))}
                onBlur={apply}
              />
            </div>
          ))}
        </div>
        <div className={`text-[10px] uppercase font-bold ${theme.fgMuted}`}>Velocidade vertical (fpm)</div>
        <div className="grid grid-cols-2 gap-2">
          {fields.slice(6).map(({ key, label, unit, phase }) => (
            <div key={key}>
              <label className={labelClass}>{phase} {label.split(" ")[0]}</label>
              <input
                className={fieldClass}
                type="number"
                placeholder="padrão"
                value={vals[key]}
                onChange={(e) => setVals((v) => ({ ...v, [key]: e.target.value }))}
                onBlur={apply}
              />
            </div>
          ))}
        </div>
      </div>

      {hasAny && (
        <button onClick={clearAll} className={`text-xs ${theme.fgFaint} underline`}>
          Limpar todos os overrides
        </button>
      )}

      <Button variant="primary" size="xl" onClick={() => { apply(); onNext(); }}>
        {hasAny ? "Confirmar overrides →" : "Sem overrides →"}
      </Button>
    </div>
  );
}

function WaypointEditor({ editingIdx, insertAfterIdx, initLat, initLon, onClose, pdfOverlays, userPoints, onAddUserPoint, onDeleteUserPoint }) {
  const { flight, setFlight, ac } = useFlight();
  const { computed } = useDerived();
  const theme = useTheme();
  const [finderOpen, setFinderOpen] = useState(false);
  const isNew    = editingIdx == null;
  const isOrigin = !isNew && flight.checkpoints[editingIdx]?.isOrigin;
  const cruiseAlt = flight.cruiseAlt ?? 7000;
  const initial = isNew
    ? { name: "", alt: null,
        // When inserting between existing WPs, default to "inherit" so the
        // new WP follows the climb/descent gradient instead of becoming a
        // cruise-alt anchor that ends the climb at this fix. When appending
        // at the end of the route, default to cruise alt as before.
        useCruiseAlt: insertAfterIdx == null,
        tc: null, dist: null, windDir: null, windVel: null,
        lat: initLat ?? null, lon: initLon ?? null, notes: "" }
    : { ...flight.checkpoints[editingIdx] };

  const [cp, setCp] = useState(initial);
  const [windMode, setWindMode] = useState(
    initial.windMode === "none"    ? "none"
    : initial.windMode === "custom" ? "custom"
    : "route"
  );
  const [tcMode, setTcMode] = useState("mh"); // "mh" | "tc"
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [showPerf, setShowPerf] = useState(false);
  const altDragRef = useRef({ active: false, startY: 0, startVal: 0 });

  // AIRAC.net autocomplete for the name field.
  const [airacSugs, setAiracSugs] = useState(null);
  const [airacSearching, setAiracSearching] = useState(false);
  const airacAbortRef = useRef(null);
  const airacDebounceRef = useRef(null);
  function triggerAiracSearch(q) {
    if (airacDebounceRef.current) clearTimeout(airacDebounceRef.current);
    if (airacAbortRef.current) { try { airacAbortRef.current.abort(); } catch (_) {} airacAbortRef.current = null; }
    if (!q || q.length < 2) { setAiracSugs(null); setAiracSearching(false); return; }
    setAiracSearching(true);
    airacDebounceRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      airacAbortRef.current = ctrl;
      try {
        const data = await airacSearch(q, ctrl.signal);
        if (ctrl === airacAbortRef.current) {
          setAiracSugs(data || { airports: [], navaids: [], waypoints: [] });
          setAiracSearching(false);
        }
      } catch (_) { /* aborted */ }
    }, 300);
  }
  useEffect(() => {
    return () => {
      if (airacDebounceRef.current) clearTimeout(airacDebounceRef.current);
      if (airacAbortRef.current) { try { airacAbortRef.current.abort(); } catch (_) {} }
    };
  }, []);
  function applyAiracSuggestion(item, kind) {
    let name, lat, lon, alt = null, source = null;
    if (kind === "local") {
      name = item.name || "";
      lat = item.lat != null ? Number(item.lat) : null;
      lon = item.lon != null ? Number(item.lon) : null;
      alt = item.alt != null ? Number(item.alt) : null;
      source = item.source || { kind: "library", libraryId: item.id };
    } else {
      name = (kind === "airport" ? (item.icao || item.iata) : (item.identifier || item.icao)) || "";
      lat = item.latitude != null ? Number(item.latitude) : (item.coordinates?.lat != null ? Number(item.coordinates.lat) : null);
      lon = item.longitude != null ? Number(item.longitude) : (item.coordinates?.lon != null ? Number(item.coordinates.lon) : null);
      if (kind === "airport" && item.elevation_ft != null) alt = Number(item.elevation_ft);
      source = { kind: "search", airacKind: kind, id: name };
    }
    setCp(p => {
      const n = Object.assign({}, p, { name: String(name).slice(0, 10).toUpperCase() });
      if (lat != null && lon != null) { n.lat = roundCoord(lat); n.lon = roundCoord(lon); n._tcDistEdited = true; }
      if (alt != null) { n.alt = alt; n.useCruiseAlt = false; }
      if (source) n.source = source;
      return n;
    });
    setAiracSugs(null);
    if (lat != null && lon != null) applyCoords(roundCoord(lat), roundCoord(lon));
  }

  // DDM (degrees + decimal minutes) editing state, kept in sync with cp.lat/cp.lon.
  function decToDdm(dd, isLon) {
    if (dd == null || isNaN(dd)) return { deg: "", min: "", hem: isLon ? "W" : "N" };
    const abs = Math.abs(dd);
    const deg = Math.floor(abs);
    const min = (abs - deg) * 60;
    return {
      deg: String(deg),
      min: min.toFixed(2),
      hem: isLon ? (dd < 0 ? "W" : "E") : (dd < 0 ? "S" : "N"),
    };
  }
  function ddmToDec(parts, isLon) {
    const deg = parts.deg === "" ? null : Math.abs(parseFloat(parts.deg));
    const min = parts.min === "" ? 0 : Math.abs(parseFloat(parts.min));
    if (deg == null || isNaN(deg) || isNaN(min) || min >= 60) return null;
    if (isLon ? deg > 180 : deg > 90) return null;
    const v = deg + min / 60;
    return (parts.hem === "S" || parts.hem === "W") ? -v : v;
  }
  const [latParts, setLatParts] = useState(() => decToDdm(initial.lat, false));
  const [lonParts, setLonParts] = useState(() => decToDdm(initial.lon, true));
  // When cp.lat/cp.lon change externally (e.g. from MapPicker), refresh the inputs
  // unless they already represent the same value (avoids snapping the user's typing).
  useEffect(() => {
    const local = ddmToDec(latParts, false);
    if (cp.lat == null && (latParts.deg !== "" || latParts.min !== "")) {
      setLatParts({ deg: "", min: "", hem: "N" });
    } else if (cp.lat != null && (local == null || Math.abs(local - cp.lat) > 0.0001)) {
      setLatParts(decToDdm(cp.lat, false));
    }
  }, [cp.lat]);
  useEffect(() => {
    const local = ddmToDec(lonParts, true);
    if (cp.lon == null && (lonParts.deg !== "" || lonParts.min !== "")) {
      setLonParts({ deg: "", min: "", hem: "W" });
    } else if (cp.lon != null && (local == null || Math.abs(local - cp.lon) > 0.0001)) {
      setLonParts(decToDdm(cp.lon, true));
    }
  }, [cp.lon]);

  const prevCp = isNew
    ? (insertAfterIdx != null ? flight.checkpoints[insertAfterIdx] : flight.checkpoints[flight.checkpoints.length - 1])
    : flight.checkpoints[editingIdx - 1];
  // Resolve prev altitude. The leg ending at this WP starts from the immediately
  // previous WP's RESOLVED altitude (not the nearest anchor), so inherit WPs
  // mid-segment yield the correct intermediate altitude — same value
  // computeLegPhases will use, so the preview matches the planning math.
  const prevAlt = (function() {
    const prevIdx = isNew
      ? (insertAfterIdx != null ? insertAfterIdx : flight.checkpoints.length - 1)
      : editingIdx - 1;
    if (prevIdx < 0) return null;
    const resolved = computed && computed[prevIdx] ? computed[prevIdx].alt : null;
    if (resolved != null) return resolved;
    // Fallback: walk back to nearest anchor (only used when computed isn't available)
    for (let k = prevIdx; k >= 0; k--) {
      const wp = flight.checkpoints[k];
      if (!wp) continue;
      if (wp.useCruiseAlt) return cruiseAlt;
      if (wp.alt != null) return wp.alt;
      if (wp.isOrigin) return Number(flight.freqs?.origin?.elev) || 0;
    }
    return null;
  })();
  // Previous *anchor* altitude (walks back skipping inherit WPs) — used to
  // decide whether the QUANDO NIVELAR section is meaningful for this WP. With
  // a chain of inherit WPs in the trailing buffer, the immediate prevAlt may
  // already equal currentAlt (resolver placed them at dest alt) — but the
  // segment as a whole still climbs/descends, so the arrivalMode picker
  // should remain visible for review/edit.
  const prevAnchorAlt = (function() {
    const prevIdx = isNew
      ? (insertAfterIdx != null ? insertAfterIdx : flight.checkpoints.length - 1)
      : editingIdx - 1;
    for (let k = prevIdx; k >= 0; k--) {
      const wp = flight.checkpoints[k];
      if (!wp) continue;
      if (wp.useCruiseAlt) return cruiseAlt;
      if (wp.alt != null) return wp.alt;
      if (wp.isOrigin) return Number(flight.freqs?.origin?.elev) || 0;
    }
    return null;
  })();
  const variation = getDecl(cp.lat ?? prevCp?.lat, cp.lon ?? prevCp?.lon, cp.alt ?? cruiseAlt) ?? (flight.variation ?? 0);
  const mod360 = function(x) { return ((x % 360) + 360) % 360; };

  const altMode = cp.useCruiseAlt ? "cruise" : (cp.alt == null && !isOrigin ? "inherit" : "custom");

  function applyCoords(lat, lon) {
    var updates = { lat: lat, lon: lon };
    if (prevCp != null && prevCp.lat != null && prevCp.lon != null && lat != null && lon != null) {
      updates.tc   = Math.round(gcTC(prevCp.lat, prevCp.lon, lat, lon));
      updates.dist = Math.round(gcDist(prevCp.lat, prevCp.lon, lat, lon) * 10) / 10;
    }
    setCp(function(p) { return Object.assign({}, p, updates); });
    setShowMapPicker(false);
  }

  function save() {
    setFlight((f) => {
      const cps = [...f.checkpoints];
      const saved = { ...cp, windMode };
      if (windMode !== "custom") { delete saved.windDir; delete saved.windVel; }
      if (isNew) {
        if (insertAfterIdx != null) {
          // Insert at a specific position (from map click)
          cps.splice(insertAfterIdx + 1, 0, { ...saved, ata: null, gsActual: null });
        } else {
          cps.push({ ...saved, ata: null, gsActual: null });
        }
      } else {
        cps[editingIdx] = { ...saved };
      }
      // Pass 1 — project lat/lon from TC+dist for the edited waypoint only.
      // Reprojects if: (a) lat is null, OR (b) user explicitly edited TC/dist this session.
      var _editIdx = isNew ? (insertAfterIdx != null ? insertAfterIdx + 1 : cps.length - 1) : editingIdx;
      var _editCp = cps[_editIdx];
      var _editPrev = _editIdx > 0 ? cps[_editIdx - 1] : null;
      if (_editCp != null
          && (_editCp.lat == null || _editCp._tcDistEdited)
          && _editPrev != null && _editPrev.lat != null && _editPrev.lon != null
          && _editCp.tc != null && (_editCp.dist ?? 0) > 0) {
        var _proj = projectDest(_editPrev.lat, _editPrev.lon, _editCp.tc, _editCp.dist);
        cps[_editIdx] = Object.assign({}, cps[_editIdx], { lat: _proj[0], lon: _proj[1], _tcDistEdited: undefined });
      }
      // Pass 1b — project forward chain: keep projecting subsequent waypoints from the
      // most recently positioned one, while they still have TC+dist but no coords.
      var _projIdx = _editIdx + 1;
      var _projAnchor = cps[_editIdx];
      while (_projIdx < cps.length && _projAnchor != null && _projAnchor.lat != null && _projAnchor.lon != null) {
        var _projCp = cps[_projIdx];
        if (_projCp.lat == null && _projCp.tc != null && (_projCp.dist ?? 0) > 0) {
          var _projOut = projectDest(_projAnchor.lat, _projAnchor.lon, _projCp.tc, _projCp.dist);
          cps[_projIdx] = Object.assign({}, cps[_projIdx], { lat: _projOut[0], lon: _projOut[1] });
          _projAnchor = cps[_projIdx];
          _projIdx++;
        } else {
          break; // missing TC/dist or already positioned — can't project further down the chain
        }
      }
      // Pass 2 — recompute TC and dist for every consecutive pair with known coords.
      // Now covers all waypoints since Pass 1 filled in projected positions.
      for (var _i = 1; _i < cps.length; _i++) {
        var _prev = cps[_i - 1], _cur = cps[_i];
        if (_prev.lat != null && _prev.lon != null && _cur.lat != null && _cur.lon != null) {
          cps[_i] = Object.assign({}, cps[_i], {
            tc:   Math.round(gcTC(_prev.lat, _prev.lon, _cur.lat, _cur.lon)),
            dist: Math.round(gcDist(_prev.lat, _prev.lon, _cur.lat, _cur.lon) * 10) / 10
          });
        }
      }
      return { ...f, checkpoints: cps };
    });
    onClose();
  }

  function remove() {
    if (!confirm(`Remover ${cp.name}?`)) return;
    setFlight((f) => {
      const cps = [...f.checkpoints];
      cps.splice(editingIdx, 1);
      return { ...f, checkpoints: cps };
    });
    onClose();
  }

  const fld  = `w-full ${theme.inputBg} border-2 ${theme.inputBorder} ${theme.fg} px-3 py-2.5 text-base rounded-xl num focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:${theme.accentBorder}`;
  const lbl  = `text-[10px] uppercase tracking-widest ${theme.fgFaint} mb-1 block`;
  const sect = `space-y-2`;

  return (
    <div className="fixed inset-0 z-30 bg-black/85 flex flex-col" onClick={onClose}>
      <div onClick={function(e) { e.stopPropagation(); }}
        className={`mt-auto w-full ${theme.panel} border-t ${theme.panelBorder} rounded-t-2xl flex flex-col`}
        style={{ maxHeight: "92vh" }}>

        {/* Header */}
        <div className={`flex items-center px-4 pt-3 pb-2 border-b ${theme.panelBorder} shrink-0`}>
          <div className="flex-1 flex items-baseline gap-2">
            <span className={`text-base font-black tracking-widest ${theme.accent} cockpit-glow`}>
              {isNew ? "NOVO" : (cp.name || "—")}
            </span>
            <span className={`text-[10px] ${theme.fgFaint} uppercase tracking-widest`}>
              {isNew ? "waypoint" : "editar waypoint"}
            </span>
          </div>
          <button onClick={onClose} aria-label="Fechar" className={`p-1.5 ${theme.fgFaint}`}><X className="w-4 h-4" /></button>
        </div>

        {/* Formulário único rolável */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">

          {/* NOME */}
          <div className={sect}>
            <label className={lbl}>Nome (max 10)</label>
            <input type="text" autoCapitalize="characters" maxLength={10}
              value={cp.name || ""}
              onChange={function(e) {
                var v = e.target.value.toUpperCase().slice(0, 10);
                setCp(function(p) { return Object.assign({}, p, { name: v }); });
                triggerAiracSearch(v);
              }}
              onBlur={function() {
                // Delay so a click on a suggestion is registered before we hide.
                setTimeout(function() { setAiracSugs(null); }, 150);
              }}
              placeholder="LPPT"
              className={`w-full ${theme.inputBg} border-2 ${cp.name ? theme.accentBorder : theme.inputBorder} ${theme.fg} px-4 py-3 text-2xl font-black tracking-widest rounded-xl num focus:outline-none focus:ring-2 focus:ring-amber-500/30`}
            />
            {(function() {
              var q = (cp.name || "").toUpperCase();
              var locals = (userPoints || []).filter(function(pt) {
                if (!q || q.length < 1) return false;
                if ((pt.name || "").toUpperCase().indexOf(q) >= 0) return true;
                if ((pt.notes || "").toUpperCase().indexOf(q) >= 0) return true;
                return false;
              });
              var hasAny = airacSearching || airacSugs || locals.length > 0;
              if (!hasAny) return null;
              var aps = (airacSugs && airacSugs.airports)  || [];
              var nvs = (airacSugs && airacSugs.navaids)   || [];
              var wps = (airacSugs && airacSugs.waypoints) || [];
              var total = aps.length + nvs.length + wps.length + locals.length;
              if (!airacSearching && total === 0 && airacSugs != null) {
                return (
                  <div className={`mt-1 ${theme.panel} border ${theme.panelBorder} rounded-xl px-3 py-2 text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>
                    Sem resultados
                  </div>
                );
              }
              var rowBase = "w-full text-left px-3 py-2 active:opacity-70 grid items-center gap-2";
              var rowGrid = { gridTemplateColumns: "3.5rem minmax(0, 1fr) auto" };
              function rowIcon(kind) {
                if (kind === "airport") return <Plane className="w-3.5 h-3.5" />;
                if (kind === "navaid")  return <Radio className="w-3.5 h-3.5" />;
                if (kind === "local")   return <Star className="w-3.5 h-3.5 fill-current" />;
                return <MapPin className="w-3.5 h-3.5" />;
              }
              function rowKindLabel(kind) {
                if (kind === "airport") return "APT";
                if (kind === "navaid")  return "NAV";
                if (kind === "local")   return "MEU";
                return "WPT";
              }
              function row(key, kind, item, label, sub, right) {
                return (
                  <button key={key} type="button"
                    onMouseDown={function(e) { e.preventDefault(); }}
                    onClick={function() { applyAiracSuggestion(item, kind); }}
                    style={rowGrid}
                    className={`${rowBase} border-b ${theme.panelBorder} last:border-b-0`}>
                    <span className={`text-[10px] font-bold inline-flex items-center gap-1 ${kind === "local" ? theme.accent : theme.fgMuted}`}>
                      {rowIcon(kind)} {rowKindLabel(kind)}
                    </span>
                    <div className="min-w-0">
                      <div className={`font-bold truncate ${theme.fg}`}>{label}</div>
                      {sub && <div className={`text-xs truncate ${theme.fgFaint}`}>{sub}</div>}
                    </div>
                    {right ? <span className={`text-[10px] num ${theme.fgFaint} text-right`}>{right}</span> : <span />}
                  </button>
                );
              }
              return (
                <div className={`mt-1 ${theme.panel} border ${theme.panelBorder} rounded-xl overflow-hidden max-h-72 overflow-y-auto`}>
                  {locals.slice(0, 5).map(function(pt) {
                    var sub = [pt.lat != null ? pt.lat.toFixed(3) + "," + pt.lon.toFixed(3) : null, pt.notes].filter(Boolean).join(" · ");
                    var right = pt.alt != null ? `${pt.alt} ft` : null;
                    return row("l-" + (pt.id || pt.name), "local", pt, pt.name || "—", sub, right);
                  })}
                  {airacSearching && (
                    <div className={`px-3 py-2 text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>
                      Buscando AIRAC…
                    </div>
                  )}
                  {aps.slice(0, 5).map(function(it) {
                    var sub = [it.name, it.city, it.country].filter(Boolean).join(" · ");
                    var right = it.elevation_ft != null ? `${it.elevation_ft} ft` : null;
                    return row("a-" + it.icao, "airport", it, it.icao || it.iata || "—", sub, right);
                  })}
                  {nvs.slice(0, 5).map(function(it, i) {
                    var label = it.identifier || it.icao || ("NAV " + i);
                    var sub = [it.name, it.type, it.country, it.region].filter(Boolean).join(" · ");
                    return row("n-" + label + "-" + i, "navaid", it, label, sub, null);
                  })}
                  {wps.slice(0, 5).map(function(it, i) {
                    var label = it.identifier || ("WPT " + i);
                    var sub = [it.region, it.country].filter(Boolean).join(" · ");
                    return row("w-" + label + "-" + i, "waypoint", it, label, sub, null);
                  })}
                </div>
              );
            })()}
          </div>

          {/* POSIÇÃO */}
          <div className={sect}>
            <label className={lbl}>Posição (graus + minutos)</label>
            {(function() {
              const subFld = `${theme.inputBg} border-2 ${theme.inputBorder} ${theme.fg} px-2 py-2 text-base rounded-xl num focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:${theme.accentBorder} w-full text-center`;
              const unit  = `text-base font-bold ${theme.fgMuted} px-1`;
              const hemBtn = function(active) {
                return `w-12 px-0 py-2 rounded-xl border-2 text-base font-black ${active ? theme.accentBorder + " " + theme.accent : theme.panelBorder + " " + theme.fgFaint} active:scale-95`;
              };
              function pushLat(parts) {
                setLatParts(parts);
                const dd = ddmToDec(parts, false);
                if (dd != null) applyCoords(dd, cp.lon);
                else if (parts.deg === "" && parts.min === "") applyCoords(null, cp.lon);
              }
              function pushLon(parts) {
                setLonParts(parts);
                const dd = ddmToDec(parts, true);
                if (dd != null) applyCoords(cp.lat, dd);
                else if (parts.deg === "" && parts.min === "") applyCoords(cp.lat, null);
              }
              return (
                <div className="space-y-2">
                  {/* LAT */}
                  <div>
                    <span className={`text-[10px] ${theme.fgFaint} mb-0.5 block`}>LAT</span>
                    <div className="flex items-center gap-1">
                      <input type="number" inputMode="numeric" min="0" max="90" step="1" placeholder="38"
                        value={latParts.deg}
                        onChange={(e) => pushLat({ ...latParts, deg: e.target.value })}
                        className={subFld} style={{ flex: "0 0 4.5rem" }}
                      />
                      <span className={unit}>°</span>
                      <input type="number" inputMode="decimal" min="0" max="59.99" step="0.01" placeholder="43.01"
                        value={latParts.min}
                        onChange={(e) => pushLat({ ...latParts, min: e.target.value })}
                        className={subFld} style={{ flex: "1 1 auto" }}
                      />
                      <span className={unit}>'</span>
                      <button type="button"
                        onClick={() => pushLat({ ...latParts, hem: latParts.hem === "N" ? "S" : "N" })}
                        title="Toggle N/S"
                        className={hemBtn(true)}>
                        {latParts.hem || "N"}
                      </button>
                    </div>
                  </div>
                  {/* LON */}
                  <div>
                    <span className={`text-[10px] ${theme.fgFaint} mb-0.5 block`}>LON</span>
                    <div className="flex items-center gap-1">
                      <input type="number" inputMode="numeric" min="0" max="180" step="1" placeholder="9"
                        value={lonParts.deg}
                        onChange={(e) => pushLon({ ...lonParts, deg: e.target.value })}
                        className={subFld} style={{ flex: "0 0 4.5rem" }}
                      />
                      <span className={unit}>°</span>
                      <input type="number" inputMode="decimal" min="0" max="59.99" step="0.01" placeholder="08.37"
                        value={lonParts.min}
                        onChange={(e) => pushLon({ ...lonParts, min: e.target.value })}
                        className={subFld} style={{ flex: "1 1 auto" }}
                      />
                      <span className={unit}>'</span>
                      <button type="button"
                        onClick={() => pushLon({ ...lonParts, hem: lonParts.hem === "E" ? "W" : "E" })}
                        title="Toggle E/W"
                        className={hemBtn(true)}>
                        {lonParts.hem || "W"}
                      </button>
                    </div>
                  </div>
                  {(cp.lat != null && cp.lon != null) && (
                    <div className={`text-[10px] ${theme.fgFaint} text-center num`}>
                      {(cp.lat).toFixed(4)}, {(cp.lon).toFixed(4)} (decimal)
                    </div>
                  )}
                </div>
              );
            })()}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={function() { setShowMapPicker(true); }}
                className={`py-2.5 rounded-xl border flex items-center justify-center gap-2 text-sm font-bold ${theme.panelBorder} ${theme.fgMuted}`}>
                <MapIcon className="w-4 h-4" /> No mapa
              </button>
              <button onClick={function() { setFinderOpen(true); }}
                className={`py-2.5 rounded-xl border-2 ${theme.accentBorder} ${theme.accent} flex items-center justify-center gap-2 text-sm font-bold`}>
                <Search className="w-4 h-4" />
                {cp.source && cp.source.kind && cp.source.kind !== "manual" ? "Editar fonte" : "Buscar / Calcular"}
              </button>
            </div>
            {/* Origem do ponto (quando criado via search/radial/map/library) */}
            {cp.source && cp.source.kind && cp.source.kind !== "manual" && (function() {
              var s = cp.source;
              var icon = null, label = "—";
              if (s.kind === "search") {
                icon = s.airacKind === "airport" ? <Plane className="w-3 h-3" />
                  : s.airacKind === "navaid"   ? <Radio className="w-3 h-3" />
                  : <MapPin className="w-3 h-3" />;
                label = s.id || "AIRAC";
              } else if (s.kind === "radial") {
                var aName = (s.anchor && s.anchor.name) || "?";
                var brg = s.bearing != null ? Math.round(s.bearing) : "?";
                var dist = s.distance != null ? s.distance : "?";
                var mode = (s.bearingMode || "mc").toUpperCase();
                icon = <Radio className="w-3 h-3" />;
                label = "Radial · " + aName + " " + mode + " " + brg + "° / " + dist + " NM";
              } else if (s.kind === "map") {
                icon = <MapPin className="w-3 h-3" />;
                label = "Selecionado no mapa";
              } else if (s.kind === "library") {
                icon = <Star className="w-3 h-3 fill-current" />;
                label = "Da biblioteca";
              }
              return (
                <button type="button" onClick={function() { setFinderOpen(true); }}
                  className={`w-full text-left text-[10px] ${theme.accent} truncate active:opacity-70 inline-flex items-center gap-1`}
                  title="Editar origem">
                  <span className={theme.fgFaint}>Origem:</span> {icon} {label}
                </button>
              );
            })()}
            {prevCp != null && prevCp.lat != null && cp.lat != null && cp.lon != null && (
              <div className={`text-[10px] ${theme.cyan} text-center`}>
                TC {cp.tc ?? "—"}° · {cp.dist ?? "—"} NM (calculado)
              </div>
            )}
          </div>

          {/* ALTITUDE */}
          <div className={sect}>
            <label className={lbl}>Altitude</label>
            <div className={`grid gap-2 ${isOrigin ? "grid-cols-2" : "grid-cols-3"}`}>
              {!isOrigin && (
                <button onClick={function() { setCp(function(p) { return Object.assign({}, p, { alt: null, useCruiseAlt: false }); }); }}
                  className={`py-2.5 rounded-xl border-2 text-xs font-bold flex flex-col items-center gap-0.5 ${altMode === "inherit" ? theme.accentBorder + " " + theme.accent : theme.panelBorder + " " + theme.fgFaint}`}>
                  Herdar
                  <span className="text-[10px] font-normal opacity-70">{prevAlt != null ? prevAlt + " ft" : "—"}</span>
                </button>
              )}
              <button onClick={function() { setCp(function(p) { return Object.assign({}, p, { useCruiseAlt: true, alt: cruiseAlt }); }); }}
                className={`py-2.5 rounded-xl border-2 text-xs font-bold flex flex-col items-center gap-0.5 ${altMode === "cruise" ? theme.accentBorder + " " + theme.accent : theme.panelBorder + " " + theme.fgFaint}`}>
                CRZ
                <span className="text-[10px] font-normal opacity-70">{cruiseAlt} ft</span>
              </button>
              <button onClick={function() { setCp(function(p) { return Object.assign({}, p, { useCruiseAlt: false, alt: p.alt != null ? p.alt : cruiseAlt }); }); }}
                className={`py-2.5 rounded-xl border-2 text-xs font-bold ${altMode === "custom" ? theme.accentBorder + " " + theme.accent : theme.panelBorder + " " + theme.fgFaint}`}>
                Valor
              </button>
            </div>
            {altMode === "custom" && (function() {
              function clamp(v) { return Math.max(0, Math.min(60000, Math.round(v))); }
              function setAlt(v) {
                var n = clamp(v);
                setCp(function(p) { return Object.assign({}, p, { alt: n, useCruiseAlt: false }); });
              }
              function onPD(e, step, pxPer) {
                altDragRef.current = {
                  active: true,
                  startY: e.clientY,
                  startVal: cp.alt != null ? cp.alt : (cruiseAlt || 7000),
                  step: step,
                  pxPer: pxPer
                };
                try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
              }
              function onPM(e) {
                var s = altDragRef.current;
                if (!s.active) return;
                var dy = s.startY - e.clientY; // up = positive
                var inc = Math.round(dy / s.pxPer);
                setAlt(s.startVal + inc * s.step);
              }
              function onPU() { altDragRef.current.active = false; }
              var handleCls = "w-11 flex flex-col items-center justify-center select-none text-[10px] font-black uppercase tracking-wider active:scale-95 transition-transform duration-100";
              return (
                <div className={`flex items-stretch ${theme.inputBg} border ${theme.inputBorder} rounded-xl overflow-hidden mt-2`}>
                  <input type="number" inputMode="numeric" placeholder="7000" min="0" max="60000" step="100"
                    value={cp.alt != null ? cp.alt : ""}
                    onChange={function(e) { setCp(function(p) { return Object.assign({}, p, { alt: e.target.value === "" ? null : Number(e.target.value), useCruiseAlt: false }); }); }}
                    className={`flex-1 min-w-0 bg-transparent ${theme.fg} px-3 py-2.5 text-base num focus:outline-none focus:ring-2 focus:ring-amber-500/30`}
                  />
                  <span className={`self-center text-xs ${theme.fgFaint} px-1`}>ft</span>
                  <button
                    onPointerDown={function(e) { onPD(e, 1000, 25); }}
                    onPointerMove={onPM} onPointerUp={onPU} onPointerCancel={onPU}
                    style={{ touchAction: "none" }}
                    className={`${handleCls} border-l ${theme.inputBorder} ${theme.fgMuted}`}>
                    <span className="text-[10px] opacity-60 leading-none">↕</span>
                    <span className="leading-tight mt-0.5">1k</span>
                  </button>
                  <button
                    onPointerDown={function(e) { onPD(e, 100, 12); }}
                    onPointerMove={onPM} onPointerUp={onPU} onPointerCancel={onPU}
                    style={{ touchAction: "none" }}
                    className={`${handleCls} border-l ${theme.inputBorder} ${theme.fgMuted}`}>
                    <span className="text-[10px] opacity-60 leading-none">↕</span>
                    <span className="leading-tight mt-0.5">100</span>
                  </button>
                </div>
              );
            })()}
          </div>

          {/* QUANDO NIVELAR — quando há variação de altitude no segmento, OU
              quando o usuário já configurou um modo (mesmo que a perna imediata
              esteja level por causa do buffer pós-descida). */}
          {!isOrigin && (function() {
            var currentAlt = cp.useCruiseAlt ? cruiseAlt : cp.alt;
            // Use prevAnchorAlt (segment-wide) so the picker stays visible when
            // the immediate previous WP is in the trailing buffer at the same
            // alt as this destination — the arrivalMode still applies to the
            // segment as a whole.
            var refAlt = prevAnchorAlt;
            var isClimbing   = refAlt != null && currentAlt != null && currentAlt - refAlt > 50;
            var isDescending = refAlt != null && currentAlt != null && refAlt - currentAlt > 50;
            // Keep visible if the user has already configured arrivalMode, so
            // they can review/edit it even after surrounding WPs change.
            if (!isClimbing && !isDescending && !cp.arrivalMode) return null;
            var contextDefault = isDescending ? "at_fix" : "asap";
            var arrivalMode  = cp.arrivalMode ?? null;
            var arrivalValue = cp.arrivalValue ?? 5;
            var modeOpts = [
              { key: "asap",       label: "ASAP" },
              { key: "at_fix",     label: "No fix" },
              { key: "before_nm",  label: "−NM" },
              { key: "before_min", label: "−min" },
            ];
            function setMode(key) {
              setCp(function(p) {
                var nextMode = p.arrivalMode === key ? null : key;
                var updates = { arrivalMode: nextMode };
                // Persist a sensible default when activating a "before_*" mode so the
                // computeLegPhases math matches what the picker shows on screen.
                if ((nextMode === "before_nm" || nextMode === "before_min") && p.arrivalValue == null) {
                  updates.arrivalValue = 5;
                }
                return Object.assign({}, p, updates);
              });
            }
            function adjustValue(delta) {
              setCp(function(p) { return Object.assign({}, p, { arrivalValue: Math.max(1, Math.min(60, (p.arrivalValue ?? 5) + delta)) }); });
            }
            return (
              <div className={sect}>
                <label className={lbl}>
                  {isClimbing ? "↗ Subida" : "↘ Descida"} · quando nivelar
                  {arrivalMode == null && <span className={`ml-1 ${theme.cyan} normal-case tracking-normal`}>(padrão: {contextDefault === "asap" ? "ASAP" : "no fix"})</span>}
                </label>
                <div className="flex gap-1">
                  {modeOpts.map(function(opt) {
                    var key = opt.key, label = opt.label;
                    var active = arrivalMode === key || (arrivalMode == null && key === contextDefault);
                    return (
                      <button key={key} onClick={function() { setMode(key); }}
                        className={`flex-1 py-2.5 rounded-lg border-2 text-xs font-bold transition-colors active:scale-95 ${
                          active ? `${theme.accentBorder} ${theme.accent}` : `${theme.panelBorder} ${theme.fgFaint}`
                        }`}>
                        {label}
                      </button>
                    );
                  })}
                </div>
                {(arrivalMode === "before_nm" || arrivalMode === "before_min") && (
                  <div className="flex items-center gap-3 mt-2">
                    <button onClick={function() { adjustValue(-1); }}
                      className={`w-12 h-12 rounded-lg border ${theme.panelBorder} ${theme.fg} text-xl font-black flex items-center justify-center active:scale-95`}>−</button>
                    <div className="flex-1 text-center">
                      <span className={`text-3xl font-black num cockpit-glow ${theme.accent}`}>{arrivalValue}</span>
                      <span className={`ml-1 text-sm ${theme.fgFaint}`}>{arrivalMode === "before_nm" ? "NM" : "min"}</span>
                    </div>
                    <button onClick={function() { adjustValue(1); }}
                      className={`w-12 h-12 rounded-lg border ${theme.panelBorder} ${theme.fg} text-xl font-black flex items-center justify-center active:scale-95`}>+</button>
                  </div>
                )}
                {(function() {
                  // Plan preview: delegates to computeLegPhases so it matches
                  // the actual planning math exactly (wind correction, altitude
                  // correction, inherit-resolved prevAlt).
                  var distLeg = Number(cp.dist);
                  if (!distLeg || distLeg <= 0) return null;
                  var altDiff = Math.abs((currentAlt ?? 0) - (prevAlt ?? 0));
                  if (altDiff <= 50) return null;
                  // Resolve wind for this cp (matches NavlogApp logic)
                  var wDir, wVel;
                  if (cp.windMode === "none") { wDir = 0; wVel = 0; }
                  else if (cp.windMode === "custom" && cp.windDir != null) {
                    wDir = Number(cp.windDir);
                    wVel = Number(cp.windVel ?? 0);
                  } else {
                    wDir = flight.windDir;
                    wVel = flight.windVel;
                  }
                  var effMode = arrivalMode || contextDefault;
                  // Build a synthetic cp with the editor's currently-selected
                  // arrivalMode applied (computeLegPhases reads cp.arrivalMode).
                  var syntheticCp = Object.assign({}, cp, {
                    arrivalMode: effMode,
                    arrivalValue: arrivalValue,
                  });
                  var legRes = computeLegPhases(
                    prevAlt ?? 0, currentAlt ?? 0, distLeg, syntheticCp, ac,
                    flight.isaDevC || 0, wDir, wVel, flight.variation
                  );
                  var portions = legRes.portions || [];
                  // Find the climb/descent portion to compute "wanted vs got" buffer
                  var phaseKey = isClimbing ? "SUBIDA" : "DESCIDA";
                  var phaseDist = portions.reduce(function(s, p) { return p.phase === phaseKey ? s + p.dist : s; }, 0);
                  // Buffer = trailing CRUZEIRO portion (the leveled cruise after
                  // the climb/descent reaches the target altitude before the fix)
                  var trailingCruise = 0;
                  for (var pi = portions.length - 1; pi >= 0; pi--) {
                    if (portions[pi].phase === "CRUZEIRO") trailingCruise = portions[pi].dist;
                    else break;
                  }
                  var leadingCruise = 0;
                  for (var pj = 0; pj < portions.length; pj++) {
                    if (portions[pj].phase === "CRUZEIRO") leadingCruise = portions[pj].dist;
                    else break;
                  }
                  var wantBefore;
                  if (effMode === "before_nm") wantBefore = arrivalValue;
                  else if (effMode === "before_min") {
                    // Match computeLegPhases: tas at the level-off altitude
                    // (cruise tas at currentAlt for descent, at thisAlt for climb)
                    var tasCorr = correctTAS(ac.tasCruise, currentAlt ?? 0, flight.isaDevC || 0);
                    var gsLow = Math.max(1, calcLeg(cp.tc ?? 0, 1, tasCorr, wDir, wVel, flight.variation || 0, 0).gs);
                    wantBefore = arrivalValue * gsLow / 60;
                  }
                  else if (effMode === "at_fix") wantBefore = 0;
                  else wantBefore = trailingCruise; // asap = whatever cruise comes after the phase
                  // Severity:
                  //   • Severe (red): the climb/descent itself doesn't fit in
                  //     this leg — phase fills the whole leg, no buffer at all.
                  //   • Info (faint): phase fits with positive trailing cruise,
                  //     but the buffer is shorter than requested. Profile is
                  //     executable, just tighter than ideal.
                  //   • OK: trailingCruise meets the request.
                  var phaseFitsWithBuffer = trailingCruise >= wantBefore - 0.1;
                  var phaseFits = phaseDist <= distLeg - 0.1;
                  var fmt = function(n) { return n < 10 ? n.toFixed(1) : Math.round(n).toString(); };
                  var phaseLbl = isClimbing ? "subida" : "descida";
                  return (
                    <div className={`mt-2 text-[10px] leading-snug ${phaseFitsWithBuffer || phaseFits ? theme.fgFaint : "text-red-400"}`}>
                      {!phaseFits && (
                        <div className="font-bold mb-0.5">⚠ Perna curta: {phaseLbl} não cabe ({fmt(phaseDist)} NM em perna de {fmt(distLeg)} NM)</div>
                      )}
                      {phaseFits && !phaseFitsWithBuffer && (effMode === "before_nm" || effMode === "before_min") && (
                        <div className="mb-0.5">Buffer reduzido para {fmt(trailingCruise)} NM (pediu {fmt(wantBefore)} NM) — perfil ainda executável.</div>
                      )}
                      <div className="num">
                        Plano: {fmt(leadingCruise)} NM cruzeiro · {fmt(phaseDist)} NM {phaseLbl} · {fmt(trailingCruise)} NM cruzeiro
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* TC / DIST (não origem) */}
          {!isOrigin && (
            <div className={sect}>
              <label className={lbl}>Rumo / Distância</label>
              <div className={`flex rounded-xl overflow-hidden border ${theme.panelBorder} mb-2`}>
                {[["mh","MC (Magnético)"],["tc","TC (Verdadeiro)"]].map(function(pair) {
                  var m = pair[0], label = pair[1];
                  return (
                    <button key={m} onClick={function() { setTcMode(m); }}
                      className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider ${tcMode === m ? theme.accentBg + " text-black" : theme.fgFaint}`}>
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className={`text-[10px] ${theme.fgFaint} mb-0.5 block`}>{tcMode === "mh" ? "MC (°)" : "TC (°)"} 0–359</span>
                  <input type="number" inputMode="numeric" placeholder="270" min="0" max="359"
                    value={cp.tc != null ? (tcMode === "mh" ? String(Math.round(mod360(cp.tc - variation))) : String(cp.tc)) : ""}
                    onChange={function(e) {
                      var v = e.target.value === "" ? null : Number(e.target.value);
                      var tc = v == null ? null : Math.round(tcMode === "mh" ? mod360(v + variation) : mod360(v));
                      setCp(function(p) { return Object.assign({}, p, { tc: tc, _tcDistEdited: true }); });
                    }}
                    className={fld}
                  />
                </div>
                <div>
                  <span className={`text-[10px] ${theme.fgFaint} mb-0.5 block`}>Distância (NM)</span>
                  <input type="number" inputMode="decimal" placeholder="50" min="0"
                    value={cp.dist != null ? cp.dist : ""}
                    onChange={function(e) { setCp(function(p) { return Object.assign({}, p, { dist: e.target.value === "" ? null : parseFloat(e.target.value), _tcDistEdited: true }); }); }}
                    className={fld}
                  />
                </div>
              </div>
            </div>
          )}

          {/* VENTO (não origem) */}
          {!isOrigin && (
            <div className={sect}>
              <label className={lbl}>Vento nesta perna</label>
              <div className="grid grid-cols-3 gap-2">
                {[["route","Rota"],["none","Sem vento"],["custom","Custom"]].map(function(pair) {
                  var m = pair[0], label = pair[1];
                  return (
                    <button key={m} onClick={function() { setWindMode(m); }}
                      className={`py-2.5 rounded-xl border-2 text-xs font-bold ${windMode === m ? theme.accentBorder + " " + theme.accent : theme.panelBorder + " " + theme.fgFaint}`}>
                      {label}
                    </button>
                  );
                })}
              </div>
              {windMode === "custom" && (
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div>
                    <span className={`text-[10px] ${theme.fgFaint} mb-0.5 block`}>Direção (°)</span>
                    <input type="number" inputMode="numeric" placeholder="270" min="0" max="359"
                      value={cp.windDir != null ? cp.windDir : ""}
                      onChange={function(e) { setCp(function(p) { return Object.assign({}, p, { windDir: e.target.value === "" ? null : Number(e.target.value) }); }); }}
                      className={fld}
                    />
                  </div>
                  <div>
                    <span className={`text-[10px] ${theme.fgFaint} mb-0.5 block`}>Velocidade (kt)</span>
                    <input type="number" inputMode="numeric" placeholder="15"
                      value={cp.windVel != null ? cp.windVel : ""}
                      onChange={function(e) { setCp(function(p) { return Object.assign({}, p, { windVel: e.target.value === "" ? null : Number(e.target.value) }); }); }}
                      className={fld}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PERFORMANCE override (colapsável, não origem) */}
          {!isOrigin && (
            <div className={sect}>
              <button onClick={function() { setShowPerf(function(p) { return !p; }); }}
                className={`w-full flex items-center justify-between py-1 text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>
                <span>Override de performance</span>
                <span>{showPerf ? "▲" : "▼"}</span>
              </button>
              {showPerf && <StepOverride cp={cp} setCp={setCp} onNext={function(){}} />}
            </div>
          )}

          {/* NOTAS */}
          <div className={sect}>
            <label className={lbl}>Notas</label>
            <textarea rows={2} placeholder="Freq. TWR, QNH, instruções ATC…"
              value={cp.notes || ""}
              onChange={function(e) { setCp(function(p) { return Object.assign({}, p, { notes: e.target.value }); }); }}
              className={`w-full ${theme.inputBg} border ${theme.inputBorder} ${theme.fg} px-3 py-2 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none`}
            />
          </div>

          <div className="h-2" />
        </div>

        {/* Rodapé com acções */}
        <div className={`px-4 py-3 flex gap-2 border-t ${theme.panelBorder} shrink-0`}>
          {!isNew && !isOrigin && (
            <button onClick={remove}
              className="px-4 py-3 rounded-xl border border-red-500/40 text-red-400 text-sm font-bold active:scale-95">
              Remover
            </button>
          )}
          <button onClick={save} disabled={!cp.name || !cp.name.trim()}
            className={`flex-1 py-3 rounded-xl font-bold text-base active:scale-[0.98] transition-all duration-150 inline-flex items-center justify-center gap-2 ${cp.name && cp.name.trim() ? `${theme.accentBg} ${theme.accentBgFg}` : theme.panel + " " + theme.fgFaint + " opacity-40"}`}
            style={{ minHeight: 56 }}>
            <Save className="w-5 h-5" />
            {isNew ? "Adicionar waypoint" : "Guardar alterações"}
          </button>
        </div>
      </div>

      {showMapPicker && (
        <MapPicker
          allWps={flight.checkpoints}
          initialPos={cp.lat != null ? [cp.lat, cp.lon] : null}
          onConfirm={applyCoords}
          onCancel={function() { setShowMapPicker(false); }}
          pdfOverlays={pdfOverlays}
        />
      )}

      {finderOpen && (
        <PointFinder
          userPoints={userPoints}
          onAddUserPoint={onAddUserPoint}
          onDeleteUserPoint={onDeleteUserPoint}
          pdfOverlays={pdfOverlays}
          initialQuery={cp.name || ""}
          initialSource={cp.source || null}
          onCancel={function() { setFinderOpen(false); }}
          onConfirm={function(pt) {
            setCp(function(p) {
              const out = Object.assign({}, p, { name: (pt.name || "").slice(0, 10).toUpperCase() });
              if (pt.lat != null && pt.lon != null) {
                out.lat = roundCoord(pt.lat);
                out.lon = roundCoord(pt.lon);
                out._tcDistEdited = true;
              }
              if (pt.kind === "airport" && pt.alt != null) {
                out.alt = Number(pt.alt);
                out.useCruiseAlt = false;
              }
              if (pt.source) out.source = pt.source;
              return out;
            });
            if (pt.lat != null && pt.lon != null) applyCoords(pt.lat, pt.lon);
            setFinderOpen(false);
          }}
        />
      )}
    </div>
  );
}

export { WaypointEditor };
