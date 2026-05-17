// PDF chart georeferencer — full-screen wizard for picking 3 control points
// on the PDF and 3 on the map, then warping the image to Leaflet bounds.
// Extracted from app/main.jsx. Pure React component; consumes PDF helpers
// from lib/pdf.js as window globals (renderPdfToImage, computeWarpedImage).

import { useState, useEffect, useRef } from "react";




import { useTheme } from "../context/app-context.jsx?v=20260517.2303";
// PDF overlay helpers (renderPdfToImage, computeWarpedImage,
// applyOverlayCalibration, rewarpOverlayFromHandle, rewarpOverlayFromFile,
// pickPdfFile, renderPdfHiRes, renderPdfFromHandle) are defined in lib/pdf.js
// and exposed as window globals. They depend on window.pdfjsLib + window.L,
// plus getPdfOverlayIdb from lib/storage.js.
//
// PDF overlay IndexedDB helpers (savePdfOverlayIdb, getPdfOverlayIdb, etc.)
// are in lib/storage.js. User-points IndexedDB helpers (userPtsAll/Put/Delete)
// are also in lib/storage.js.

// ── PdfGeoreferencer ─────────────────────────────────────────────────────────
// Full-screen wizard: pick 2 pts on PDF, then 2 pts on map
function PdfGeoreferencer({ mapRef, onDone, onCancel, pdfOverlays, setPdfOverlays }) {
  const theme = useTheme();
  const [phase, setPhase] = useState('loading'); // loading | pdf | map | done
  const [imgData, setImgData] = useState(null);  // { dataUrl, width, height }
  const [pdfPts, setPdfPts] = useState([]);       // [[u,v], ...]  (≤2)
  const [mapPts, setMapPts] = useState([]);       // [[lat,lon], ...] (≤2)
  const [zoom, setZoom] = useState(1);
  const [opacity, setOpacity] = useState(0.7);
  const [fileHandle, setFileHandle] = useState(null);
  const [fileName, setFileName] = useState(null);
  const fileRef = useRef(null);
  const canvasRef = useRef(null);
  const pickModeRef = useRef(false); // map pick mode flag
  const scrollRef = useRef(null);
  const prevZoomRef = useRef(1);
  const pinchRef = useRef({ active: false, dist: 0, startZoom: 1 });

  // Keep scroll centered when zoom changes
  useEffect(() => {
    var el = scrollRef.current;
    if (!el) { prevZoomRef.current = zoom; return; }
    var ratio = zoom / prevZoomRef.current;
    var cx = el.scrollLeft + el.clientWidth / 2;
    var cy = el.scrollTop + el.clientHeight / 2;
    el.scrollLeft = cx * ratio - el.clientWidth / 2;
    el.scrollTop = cy * ratio - el.clientHeight / 2;
    prevZoomRef.current = zoom;
  }, [zoom]);

  function getTouchDist(touches) {
    var dx = touches[0].clientX - touches[1].clientX;
    var dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function handleScrollTouchStart(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      pinchRef.current = { active: true, dist: getTouchDist(e.touches), startZoom: zoom };
    }
  }

  function handleScrollTouchMove(e) {
    if (pinchRef.current.active && e.touches.length === 2) {
      e.preventDefault();
      var newDist = getTouchDist(e.touches);
      var scale = newDist / pinchRef.current.dist;
      var newZoom = Math.min(6, Math.max(0.3, pinchRef.current.startZoom * scale));
      setZoom(Math.round(newZoom * 100) / 100);
    }
  }

  function handleScrollTouchEnd(e) {
    if (e.touches.length < 2) pinchRef.current.active = false;
  }

  function changeZoom(delta) {
    setZoom(z => Math.min(6, Math.max(0.3, Math.round((z + delta) * 100) / 100)));
  }

  // Attach/detach map click handler during map phase
  useEffect(() => {
    var map = mapRef.current;
    if (!map || phase !== 'map') return;
    pickModeRef.current = true;
    function handler(e) {
      if (!pickModeRef.current) return;
      var latlng = [e.latlng.lat, e.latlng.lng];
      setMapPts(function(prev) {
        var pts = prev.concat([latlng]);
        if (pts.length >= 3) { pickModeRef.current = false; }
        return pts;
      });
    }
    map.on('click', handler);
    return () => { pickModeRef.current = false; map.off('click', handler); };
  }, [phase]);

  // Auto-finish when 3rd map point is tapped
  useEffect(function() {
    if (phase === 'map' && mapPts.length === 3) {
      var timer = setTimeout(finish, 400);
      return function() { clearTimeout(timer); };
    }
  }, [mapPts.length, phase]);

  async function handlePickFile() {
    var file, handle = null;
    if (window.showOpenFilePicker) {
      try {
        var picks = await window.showOpenFilePicker({
          types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
          multiple: false
        });
        handle = picks[0];
        file = await handle.getFile();
      } catch(e) { return; } // cancelled
    } else {
      fileRef.current.click();
      return; // handled by onChange below
    }
    setFileHandle(handle);
    setFileName(file && file.name ? file.name : null);
    setPhase('loading');
    try {
      var result = await renderPdfToImage(file, 4);
      setImgData(result);
      setPhase('pdf');
    } catch(err) {
      alert('Erro ao carregar PDF: ' + err.message);
      setPhase('loading');
    }
  }

  async function handleFile(e) {
    // fallback for browsers without showOpenFilePicker
    var file = e.target.files[0];
    if (!file) return;
    setFileHandle(null);
    setFileName(file && file.name ? file.name : null);
    setPhase('loading');
    try {
      var result = await renderPdfToImage(file, 4);
      setImgData(result);
      setPhase('pdf');
    } catch(err) {
      alert('Erro ao carregar PDF: ' + err.message);
      setPhase('loading');
    }
  }

  function handleImgClick(e) {
    if (phase !== 'pdf' || pdfPts.length >= 3) return;
    var rect = e.currentTarget.getBoundingClientRect();
    var u = (e.clientX - rect.left) / zoom;
    var v = (e.clientY - rect.top) / zoom;
    var newLen = pdfPts.length + 1;
    setPdfPts(p => p.concat([[Math.round(u), Math.round(v)]]));
    if (newLen >= 3) {
      setTimeout(function() { setMapPts([]); setPhase('map'); }, 400);
    }
  }

  async function finish() {
    if (pdfPts.length < 3 || mapPts.length < 3) return;
    setPhase('loading');
    try {
      var warped = await computeWarpedImage(imgData, { pdfPts, mapPts }, mapRef.current);
      if (!warped) { alert('Pontos colineares — escolhe pontos não alinhados'); setPhase('map'); return; }
      // Default name: PDF filename without extension; falls back to time stamp.
      var defaultName = fileName
        ? fileName.replace(/\.pdf$/i, "")
        : null;
      onDone({
        id: Date.now(),
        name: defaultName,
        dataUrl: warped.dataUrl,
        width: warped.width,
        height: warped.height,
        bounds: warped.bounds,
        pdfPts: pdfPts,
        mapPts: mapPts,
        opacity: opacity,
        visible: true,
      }, fileHandle);
    } catch(e) {
      alert('Erro ao georreferenciar: ' + e.message);
      setPhase('map');
    }
  }

  // ── Render ──
  if (phase === 'loading' && !imgData) {
    return (
      <div className="absolute inset-0 z-[9000] flex flex-col items-center justify-center gap-4"
        style={{ background: 'rgba(0,0,0,0.92)' }}>
        <div className={`text-lg font-bold ${theme.fg}`}>Adicionar overlay de carta</div>
        <div className={`text-sm ${theme.fgMuted} text-center px-8`}>
          Selecione um PDF para georreferenciar e sobrepor ao mapa
        </div>
        <button onClick={handlePickFile}
          className="px-6 py-3 bg-amber-500 text-black rounded-xl font-bold text-sm active:scale-95 transition-transform duration-100">
          Selecionar PDF
        </button>
        <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={handleFile} />
        <button onClick={onCancel} className={`text-sm ${theme.fgFaint} mt-2`}>Cancelar</button>
      </div>
    );
  }

  if (phase === 'loading' && imgData) {
    return (
      <div className="absolute inset-0 z-[9000] flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.92)' }}>
        <div className={`text-sm ${theme.fg}`}>Processando PDF…</div>
      </div>
    );
  }

  if (phase === 'pdf') {
    const ptColors = ['#ef4444','#3b82f6','#22c55e'];
    const ptLabels = ['vermelho','azul','verde'];
    return (
      <div className="absolute inset-0 z-[9000] flex flex-col" style={{ background: '#111' }}>
        <div className="flex items-center gap-2 px-3 py-3 bg-black shrink-0">
          <div className={`text-xs font-bold flex-1 ${pdfPts.length < 3 ? 'text-amber-400' : 'text-green-400'}`}>
            {pdfPts.length < 3
              ? `Passo 1 — toque no ponto ${pdfPts.length + 1} (${ptLabels[pdfPts.length]})`
              : '✓ 3 pontos marcados'}
          </div>
          <button onClick={onCancel} className="text-zinc-400 text-lg px-2 leading-none">✕</button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-auto"
          style={{ cursor: 'crosshair', WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y' }}
          onTouchStart={handleScrollTouchStart}
          onTouchMove={handleScrollTouchMove}
          onTouchEnd={handleScrollTouchEnd}>
          <div style={{ position: 'relative', display: 'inline-block',
            width: imgData.width * zoom, height: imgData.height * zoom }}
            onClick={handleImgClick}>
            <img src={imgData.dataUrl} alt="PDF"
              style={{ width: imgData.width * zoom, height: imgData.height * zoom,
                display: 'block', userSelect: 'none', pointerEvents: 'none' }} />
            {pdfPts.map(([u, v], idx) => (
              <div key={idx} style={{
                position: 'absolute',
                left: u * zoom - 12, top: v * zoom - 12,
                width: 24, height: 24,
                border: `3px solid ${ptColors[idx]}`,
                borderRadius: '50%',
                background: ptColors[idx] + '55',
                pointerEvents: 'none',
              }}>
                <div style={{ position: 'absolute', top: -18, left: 0,
                  color: ptColors[idx], fontSize: 11, fontWeight: 'bold', whiteSpace: 'nowrap',
                  textShadow: '0 1px 3px #000' }}>
                  P{idx+1}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-black border-t border-zinc-800 shrink-0 flex items-center gap-2 px-3 py-3">
          <button onClick={() => changeZoom(-0.25)}
            className="w-12 h-12 bg-zinc-700 text-white rounded-xl text-2xl font-bold active:scale-95 flex items-center justify-center shrink-0">−</button>
          <span className="text-white text-xs w-10 text-center shrink-0">{Math.round(zoom*100)}%</span>
          <button onClick={() => changeZoom(0.25)}
            className="w-12 h-12 bg-zinc-700 text-white rounded-xl text-2xl font-bold active:scale-95 flex items-center justify-center shrink-0">+</button>
          {pdfPts.length > 0 && (
            <button onClick={() => setPdfPts([])}
              className="px-3 h-12 bg-zinc-700 text-white rounded-xl text-xs font-bold active:scale-95 shrink-0">
              Refazer
            </button>
          )}
          <button onClick={() => { setMapPts([]); setPhase('map'); }}
            disabled={pdfPts.length < 3}
            className={`flex-1 h-12 rounded-xl text-sm font-bold active:scale-95 transition-transform duration-100 ${
              pdfPts.length >= 3 ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-600'
            }`}>
            {pdfPts.length >= 3 ? 'Próximo →' : `Faltam ${3 - pdfPts.length} pt`}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'map') {
    const ptColors = ['#ef4444','#3b82f6','#22c55e'];
    const ptLabels = ['vermelho','azul','verde'];
    return (
      <div className="absolute bottom-0 left-0 right-0 z-[9000] pointer-events-none">
        <div className="pointer-events-auto mx-3 mb-2 rounded-2xl overflow-hidden"
          style={{ background: 'rgba(0,0,0,0.88)' }}>

          {/* Overlay visibility toggles — existing cartas visíveis no mapa */}
          {pdfOverlays && pdfOverlays.length > 0 && (
            <div className="flex flex-wrap gap-1 px-3 pt-2">
              <span className="text-zinc-500 text-[10px] w-full mb-0.5">Cartas visíveis:</span>
              {pdfOverlays.map(function(ov, i) {
                return (
                  <button key={ov.id}
                    onClick={function() {
                      setPdfOverlays(function(ovs) {
                        return ovs.map(function(o) { return o.id === ov.id ? Object.assign({}, o, { visible: !o.visible }) : o; });
                      });
                    }}
                    className={'px-2 py-0.5 rounded text-[10px] font-bold border ' + (ov.visible ? 'border-amber-500 text-amber-300' : 'border-zinc-700 text-zinc-600')}>
                    Carta {i + 1}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-start gap-3 p-3">
            <div style={{ position: 'relative', width: 80, height: 60, flexShrink: 0,
              background: '#222', borderRadius: 6, overflow: 'hidden' }}>
              <img src={imgData.dataUrl} alt="ref"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              {pdfPts.map(([u, v], idx) => (
                <div key={idx} style={{
                  position: 'absolute',
                  left: (u / imgData.width) * 100 + '%',
                  top:  (v / imgData.height) * 100 + '%',
                  width: 8, height: 8, borderRadius: '50%',
                  background: ptColors[idx],
                  transform: 'translate(-50%,-50%)',
                  border: '1px solid white',
                }} />
              ))}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white font-bold text-sm">Passo 2: Marcar no mapa</div>
              {mapPts.length < 3 ? (
                <div style={{ color: ptColors[mapPts.length], fontSize: 12, marginTop: 2 }}>
                  Toque onde está o ponto {mapPts.length + 1} ({ptLabels[mapPts.length]})
                </div>
              ) : (
                <div className="text-green-400 text-xs mt-1">Processando… aguarde</div>
              )}
            </div>
          </div>

          {mapPts.length > 0 && mapPts.length < 3 && (
            <div className="text-zinc-400 text-[10px] px-3 pb-1">
              {mapPts.map((p, i) => (
                <span key={i} style={{ color: ptColors[i], marginRight: 8 }}>
                  P{i+1}: {p[0].toFixed(4)}° {p[1].toFixed(4)}°
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2 px-3 pb-3 pt-1">
            <button onClick={() => setMapPts([])}
              className="px-3 py-2 bg-zinc-700 text-white rounded-xl text-xs font-bold active:scale-95">
              Refazer
            </button>
            <button onClick={() => { setPhase('pdf'); setPdfPts([]); setMapPts([]); }}
              className="px-3 py-2 bg-zinc-700 text-white rounded-xl text-xs font-bold active:scale-95">
              ← PDF
            </button>
            <div className={`flex-1 py-2 rounded-xl text-sm font-bold text-center ${
              mapPts.length >= 3 ? 'bg-amber-600/50 text-amber-200' : 'bg-zinc-800 text-zinc-400'
            }`}>
              {mapPts.length >= 3 ? '✓ Auto-adicionando…' : `Faltam ${3 - mapPts.length} toque${3 - mapPts.length > 1 ? 's' : ''}`}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export { PdfGeoreferencer };
