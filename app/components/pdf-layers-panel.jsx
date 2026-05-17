// PDF chart overlays — list / reorder / rename / opacity / visibility / delete
// / recalibrate panel + global zoom-fade prefs. Extracted from app/main.jsx.
// Uses React.* fully qualified for hooks (legacy pattern from the original
// inline definition). Consumes window globals from lib/storage.js and
// lib/pdf.js: getPdfHandle / savePdfHandle for the "Recarregar" path and
// renderPdfFromHandle to actually rasterize the PDF.

import React from "react";


import { useTheme, usePrefs } from "../context/app-context.jsx?v=20260517.2347";
// ── PdfLayersPanel ────────────────────────────────────────────────────────────
function PdfLayersPanel({ overlays, setOverlays, mapZoom, onAddNew, onStartCalibration, onClose }) {
  const { prefs, savePrefs } = usePrefs();
  const theme = useTheme();
  const fadeStart = (prefs && prefs.overlayFadeZoom != null) ? prefs.overlayFadeZoom : 12;
  const fadeEnd = (prefs && prefs.overlayFadeEndZoom != null) ? prefs.overlayFadeEndZoom : 15;
  function setFadeStart(v) {
    var n = Number(v);
    var nextEnd = Math.max(fadeEnd, n + 0.5);
    if (savePrefs) savePrefs({ ...prefs, overlayFadeZoom: n, overlayFadeEndZoom: nextEnd });
  }
  function setFadeEnd(v) {
    var n = Number(v);
    var nextStart = Math.min(fadeStart, n - 0.5);
    if (savePrefs) savePrefs({ ...prefs, overlayFadeEndZoom: n, overlayFadeZoom: nextStart });
  }
  const zoomReadout = mapZoom != null ? mapZoom.toFixed(1) : "—";

  // Reorder via Pointer Events — works for mouse AND touch (HTML5 drag-and-drop
  // doesn't fire on touch). Canonical state array: index 0 = bottom of z-stack,
  // index N-1 = top. UI lists in reverse so top of the list = top of map ("most
  // preferred" wins visually). On drop we splice in the displayed (reversed)
  // frame, re-reverse, then assign sequential `order` values.
  const [draggingId, setDraggingId] = React.useState(null);
  const [dragOverId, setDragOverId] = React.useState(null);
  const displayed = React.useMemo(() => overlays.slice().reverse(), [overlays]);
  // Refs mirror state so pointermove (fires many times per render) reads fresh
  // values without depending on closure.
  const draggingIdRef = React.useRef(null);
  const dragOverIdRef = React.useRef(null);
  React.useEffect(() => { draggingIdRef.current = draggingId; }, [draggingId]);
  React.useEffect(() => { dragOverIdRef.current = dragOverId; }, [dragOverId]);
  // Map of overlay id → row DOM element for hit-testing during drag.
  const rowRefs = React.useRef(new Map());
  function setRowRef(id, el) {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  }
  function hitTestY(y) {
    for (var entry of rowRefs.current) {
      var rect = entry[1].getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) return entry[0];
    }
    return null;
  }
  function handlePointerDown(e, id) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    setDraggingId(id);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
  }
  function handlePointerMove(e) {
    if (draggingIdRef.current == null) return;
    var hit = hitTestY(e.clientY);
    if (hit !== dragOverIdRef.current) setDragOverId(hit);
  }
  function handlePointerUp(e) {
    var srcId = draggingIdRef.current;
    var tgtId = dragOverIdRef.current;
    setDraggingId(null);
    setDragOverId(null);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
    if (srcId == null || tgtId == null || srcId === tgtId) return;
    setOverlays(prev => {
      var disp = prev.slice().reverse();
      var srcIdx = disp.findIndex(o => o.id === srcId);
      var tgtIdx = disp.findIndex(o => o.id === tgtId);
      if (srcIdx < 0 || tgtIdx < 0) return prev;
      var moved = disp.splice(srcIdx, 1)[0];
      disp.splice(tgtIdx, 0, moved);
      var canonical = disp.reverse();
      return canonical.map((o, i) => ({ ...o, order: i }));
    });
  }
  function handlePointerCancel() { setDraggingId(null); setDragOverId(null); }

  return (
    <div className="absolute inset-0 z-[8000] flex flex-col" style={{ background: 'rgba(0,0,0,0.92)' }}>
      {/* Header com botão de adicionar */}
      <div className={`flex items-center gap-2 px-3 py-3 border-b ${theme.panelBorder} ${theme.panel} shrink-0`}>
        <div className={`font-bold ${theme.fg} flex-1`}>🗺 Cartas PDF</div>
        <button onClick={onAddNew}
          className="px-4 py-2 bg-amber-500 text-black rounded-xl font-bold text-sm active:scale-95 transition-transform duration-100">
          + Adicionar
        </button>
        <button onClick={onClose} className="text-zinc-400 text-xl px-2 leading-none">✕</button>
      </div>

      {/* Global zoom-fade controls — apply to every overlay */}
      {savePrefs && (
        <div className={`px-3 py-3 border-b ${theme.panelBorder} ${theme.panel} shrink-0 space-y-2`}>
          <div className="flex items-center justify-between">
            <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>
              Esmaecer ao aproximar zoom
            </div>
            <div className={`text-[10px] num ${theme.cyan}`}>zoom actual {zoomReadout}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] ${theme.fgFaint} w-24`}>Inicia (100%)</span>
            <input type="range" min="5" max="18" step="0.5"
              value={fadeStart}
              onChange={e => setFadeStart(e.target.value)}
              className="flex-1" />
            <span className={`text-[10px] num ${theme.fg} w-10 text-right`}>z {fadeStart}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] ${theme.fgFaint} w-24`}>Termina (0%)</span>
            <input type="range" min="5" max="18" step="0.5"
              value={fadeEnd}
              onChange={e => setFadeEnd(e.target.value)}
              className="flex-1" />
            <span className={`text-[10px] num ${theme.fg} w-10 text-right`}>z {fadeEnd}</span>
          </div>
          <div className={`text-[10px] num ${theme.fgFaint} text-right`}>
            {fadeEnd <= fadeStart
              ? "desligado (inicia ≥ termina)"
              : `linear de z ${fadeStart} a z ${fadeEnd}`}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {overlays.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-12">
            <div className="text-sm text-zinc-400 text-center">Nenhuma carta adicionada.</div>
            <button onClick={onAddNew}
              className="px-8 py-4 bg-amber-500 text-black rounded-2xl font-bold text-base active:scale-95 transition-transform duration-100 shadow-lg">
              + Adicionar carta PDF
            </button>
          </div>
        )}
        {displayed.map(ov => (
          <div
            key={ov.id}
            ref={el => setRowRef(ov.id, el)}
            className={`${theme.panel} border rounded-xl p-3 transition-all duration-100 ${
              dragOverId === ov.id && draggingId !== ov.id ? 'border-amber-400 ring-2 ring-amber-400/40'
              : draggingId === ov.id ? 'border-amber-500/40 opacity-50'
              : theme.panelBorder
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                onPointerDown={e => handlePointerDown(e, ov.id)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                title="Arrastar para reordenar"
                aria-label="Arrastar para reordenar"
                className={`select-none ${theme.fgFaint} text-base leading-none px-1 py-2`}
                style={{ cursor: 'grab', touchAction: 'none' }}
              >⋮⋮</span>
              {ov.dataUrl
                ? <img src={ov.dataUrl} alt="" style={{ width: 48, height: 36, objectFit: 'contain',
                    background: '#222', borderRadius: 4, flexShrink: 0 }} />
                : <div style={{ width: 48, height: 36, background: '#333', borderRadius: 4,
                    flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18 }}>📄</div>
              }
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={ov.name != null ? ov.name : ""}
                  placeholder={`Carta ${new Date(ov.id).toLocaleDateString()} ${new Date(ov.id).toLocaleTimeString()}`}
                  onChange={e => setOverlays(os => os.map(o => o.id === ov.id ? { ...o, name: e.target.value } : o))}
                  className={`w-full bg-transparent text-sm font-bold ${theme.fg} truncate focus:outline-none focus:ring-1 focus:ring-amber-500/40 rounded px-1 -mx-1`}
                />
                {ov.dataUrl
                  ? <div className={`text-[10px] ${theme.fgFaint}`}>{ov.pdfPts.length} pts PDF · {ov.mapPts.length} pts mapa</div>
                  : <div className="text-[10px] text-amber-400">PDF não disponível</div>
                }
              </div>
              {!ov.dataUrl && (
                <button onClick={async () => {
                  var handle = await getPdfHandle(ov.id);
                  var imgData = handle ? await renderPdfFromHandle(handle) : null;
                  if (!imgData) {
                    // Try pick a new file
                    if (window.showOpenFilePicker) {
                      try {
                        var [h] = await window.showOpenFilePicker({ types: [{ accept: { 'application/pdf': ['.pdf'] } }] });
                        await savePdfHandle(ov.id, h);
                        imgData = await renderPdfFromHandle(h);
                      } catch(e) {}
                    }
                  }
                  if (imgData) setOverlays(os => os.map(o => o.id === ov.id ? {...o, ...imgData} : o));
                }} className="text-xs px-2 py-1 rounded border border-amber-500 text-amber-400">
                  Recarregar
                </button>
              )}
              {ov.dataUrl && (
                <button onClick={() => setOverlays(os => os.map(o => o.id === ov.id ? {...o, visible: !o.visible} : o))}
                  className={`text-xs px-2 py-1 rounded border ${ov.visible ? 'border-amber-500 text-amber-400' : 'border-zinc-600 text-zinc-500'}`}>
                  {ov.visible ? 'ON' : 'OFF'}
                </button>
              )}
              {ov.dataUrl && onStartCalibration && (
                <button onClick={() => onStartCalibration(ov.id)}
                  title="Calibrar no mapa"
                  className={`text-xs px-2 py-1 rounded border border-amber-500 text-amber-400`}>
                  Calibrar
                </button>
              )}
              <button onClick={() => setOverlays(os => os.filter(o => o.id !== ov.id))}
                className="text-red-500 text-lg px-1">✕</button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className={`text-[10px] ${theme.fgFaint}`}>Opac.</span>
              <input type="range" min="0" max="1" step="0.05"
                value={ov.opacity}
                onChange={e => setOverlays(os => os.map(o => o.id === ov.id ? {...o, opacity: parseFloat(e.target.value)} : o))}
                className="flex-1" />
              <span className={`text-[10px] ${theme.fgFaint} w-8 text-right`}>{Math.round(ov.opacity*100)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { PdfLayersPanel };
