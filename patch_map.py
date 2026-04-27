"""Patch index.html to add coordinate input + Leaflet map tab."""
import re

with open('C:/Users/cmtew/Downloads/NavAPP/index.html', 'r', encoding='utf-8') as f:
    s = f.read()

# ── 1. Leaflet CSS in <head> ─────────────────────────────────────────────────
s = s.replace(
    '  </style>\n</head>',
    '  </style>\n  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />\n  <style>.leaflet-container{background:#1c1c1e}.leaflet-tile-pane{filter:brightness(0.85)}</style>\n</head>'
)

# ── 2. Leaflet JS before babel script ───────────────────────────────────────
s = s.replace(
    '  <script type="text/babel" data-presets="react">',
    '  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>\n\n  <script type="text/babel" data-presets="react">'
)

# ── 3. Add Map to Lucide destructure ────────────────────────────────────────
s = s.replace(
    'TrendingUp, TrendingDown, Minus',
    'TrendingUp, TrendingDown, Minus, Map'
)

# ── 4. Great-circle + coord utility functions (after toDeg) ─────────────────
GC_UTILS = r"""
// ── Great-circle navigation ─────────────────────────────────────────────────
function gcDist(lat1, lon1, lat2, lon2) {
  // Haversine → NM
  const R = 3440.065;
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1), Δλ = toRad(lon2 - lon1);
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function gcTC(lat1, lon1, lat2, lon2) {
  // Initial true course
  const φ1 = toRad(lat1), φ2 = toRad(lat2), Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
function gcInterpolate(lat1, lon1, lat2, lon2, frac) {
  // Linear interpolation (accurate for legs < 300 NM)
  return [lat1 + (lat2 - lat1) * frac, lon1 + (lon2 - lon1) * frac];
}
// Decimal degrees → DDM string "DD°MM.MMM'N"
function decDegToStr(dd, isLat) {
  const hem = isLat ? (dd >= 0 ? 'N' : 'S') : (dd >= 0 ? 'E' : 'W');
  const abs = Math.abs(dd);
  const deg = Math.floor(abs);
  const min = ((abs - deg) * 60).toFixed(3);
  const degStr = isLat ? String(deg).padStart(2,'0') : String(deg).padStart(3,'0');
  return `${degStr}°${min}'${hem}`;
}
function formatCoord(lat, lon) {
  if (lat == null || lon == null) return null;
  return `${decDegToStr(lat, true)} ${decDegToStr(lon, false)}`;
}
// Parse DDM digit array → decimal degrees
// latDigits: 6 digits [D,D,M,M,m,m] → DD°MM.mm'
// lonDigits: 7 digits [D,D,D,M,M,m,m] → DDD°MM.mm'
function ddmDigitsToDecDeg(digits, isLon, hem) {
  const dc = isLon ? 3 : 2;
  const deg = parseInt(digits.slice(0, dc).join('') || '0');
  const minInt = parseInt((digits[dc] ?? '0').toString() + (digits[dc+1] ?? '0').toString());
  const minDec = parseInt((digits[dc+2] ?? '0').toString() + (digits[dc+3] ?? '0').toString());
  const min = minInt + minDec / 100;
  if (min >= 60 || (isLon ? deg > 179 : deg > 89)) return null;
  const val = deg + min / 60;
  return (hem === 'S' || hem === 'W') ? -val : val;
}
"""
s = s.replace(
    'const toRad = (d) => (d * Math.PI) / 180;\nconst toDeg = (r) => (r * 180) / Math.PI;',
    'const toRad = (d) => (d * Math.PI) / 180;\nconst toDeg = (r) => (r * 180) / Math.PI;\n' + GC_UTILS
)

# ── 5. liveRoute: propagate lat/lon to virtual waypoints ────────────────────
OLD_LROUTE = "      const prevAlt = i > 0 ? computed[i - 1].alt : 0;"
NEW_LROUTE = ("      const prevAlt = i > 0 ? computed[i - 1].alt : 0;\n"
              "      const prevLat  = i > 0 ? computed[i - 1].lat  : null;\n"
              "      const prevLon  = i > 0 ? computed[i - 1].lon  : null;")
s = s.replace(OLD_LROUTE, NEW_LROUTE)

# Add lat/lon to virtual waypoint push (inside liveRoute result.push for virtual WPs)
OLD_VIRT_PUSH = (
    "            result.push({\n"
    "              name: label, isVirtual: true, autoKey, userIdx: i,\n"
    "              // TOC = leveled at dest alt; TOD = still at src alt; BOD = leveled at dest alt\n"
    "              alt: (label === \"TOC\" || label === \"BOD\") ? cp.alt : (prevAlt ?? cp.alt),\n"
    "              tc: cp.tc, mh: cp.mh, mc: cp.mc, wca: cp.wca,"
)
NEW_VIRT_PUSH = (
    "            const vFrac = cp.dist > 0 ? accDist / cp.dist : 0;\n"
    "            const [vLat, vLon] = (prevLat != null && cp.lat != null)\n"
    "              ? gcInterpolate(prevLat, prevLon, cp.lat, cp.lon, vFrac) : [null, null];\n"
    "            result.push({\n"
    "              name: label, isVirtual: true, autoKey, userIdx: i,\n"
    "              // TOC = leveled at dest alt; TOD = still at src alt; BOD = leveled at dest alt\n"
    "              alt: (label === \"TOC\" || label === \"BOD\") ? cp.alt : (prevAlt ?? cp.alt),\n"
    "              lat: vLat, lon: vLon,\n"
    "              tc: cp.tc, mh: cp.mh, mc: cp.mc, wca: cp.wca,"
)
s = s.replace(OLD_VIRT_PUSH, NEW_VIRT_PUSH)

# ── 6. WP_STEPS: insert "coord" ──────────────────────────────────────────────
s = s.replace(
    'const WP_STEPS = ["nome", "alt", "tc", "dist", "vento", "override", "resumo"];',
    'const WP_STEPS = ["nome", "coord", "alt", "tc", "dist", "vento", "override", "resumo"];'
)

# ── 7. WaypointEditor: add coord step block (after the alt block) ────────────
COORD_STEP_BLOCK = """          {step === "coord" && (() => {
            const prevCpIdx = isNew
              ? flight.checkpoints.length - 1
              : (editingIdx ?? 0) - 1;
            const prevCpCoord = prevCpIdx >= 0 ? flight.checkpoints[prevCpIdx] : null;
            return (
              <StepCoord
                cp={cp} setCp={setCp}
                prevCp={prevCpCoord}
                theme={theme}
                onNext={next}
              />
            );
          })()}
"""
# Insert before the alt block
s = s.replace(
    '          {step === "alt" && (() => {',
    COORD_STEP_BLOCK + '          {step === "alt" && (() => {'
)

# ── 8. StepResumo: add coord row ─────────────────────────────────────────────
# Find the rows array and add coord row
OLD_ROWS = "      { label: \"TC / MH\", value: `TC "
NEW_ROWS = ("      cp.lat != null ? { label: \"Coordenadas\", value: formatCoord(cp.lat, cp.lon) ?? \"—\", step: \"coord\" } : null,\n"
            "      ")
s = s.replace(OLD_ROWS, NEW_ROWS + "{ label: \"TC / MH\", value: `TC ")
# Filter null rows (add .filter(Boolean) after rows array)
s = s.replace(
    '      {rows.map(({ label, value, step }, i) => (',
    '      {rows.filter(Boolean).map(({ label, value, step }, i) => ('
)

# ── 9. Tab bar: grid-cols-5, add Map button ──────────────────────────────────
s = s.replace(
    '<div class="grid grid-cols-4">',
    '<div class="grid grid-cols-5">'
)
s = s.replace(
    '          <TabButton theme={theme} active={tab === "log"} onClick={() => setTab("log")}\n            icon={<BookOpen className="w-5 h-5" />} label="Diário" />',
    '          <TabButton theme={theme} active={tab === "log"} onClick={() => setTab("log")}\n            icon={<BookOpen className="w-5 h-5" />} label="Diário" />\n          <TabButton theme={theme} active={tab === "map"} onClick={() => setTab("map")}\n            icon={<Map className="w-5 h-5" />} label="Mapa" />'
)

# ── 10. Tab content: add map tab ─────────────────────────────────────────────
s = s.replace(
    '        {tab === "log" && (\n          <LogTab flight={flight} computed={computed} liveFuel={liveFuel} ac={ac} theme={theme} />\n        )}',
    '        {tab === "log" && (\n          <LogTab flight={flight} computed={computed} liveFuel={liveFuel} ac={ac} theme={theme} />\n        )}\n        {tab === "map" && (\n          <MapTab\n            flight={flight} computed={computed} liveRoute={liveRoute}\n            liveETAs={liveETAs} ac={ac} theme={theme}\n          />\n        )}'
)

# ── 11. Add StepCoord component (before StepNome) ────────────────────────────
STEP_COORD = r"""
// ── Coordinate entry step ────────────────────────────────────────────────────
function StepCoord({ cp, setCp, prevCp, theme, onNext }) {
  // Pre-fill from existing cp coords
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
  const keyBase = `${theme.panel} border ${theme.panelBorder} rounded-xl flex items-center justify-center font-bold text-xl active:scale-95 transition-transform select-none`;

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
    </div>
  );
}

"""
s = s.replace('function StepNome(', STEP_COORD + 'function StepNome(')

# ── 12. Add MapTab component before ReactDOM.createRoot ──────────────────────
MAP_TAB = r"""
// ── Map tab ───────────────────────────────────────────────────────────────────
function MapTab({ flight, computed, liveRoute, liveETAs, theme }) {
  const mapDivRef = useRef(null);
  const mapRef    = useRef(null);
  const overlayRef = useRef({ route: null, markers: [], simMarker: null });
  const [tileMode, setTileMode] = useState('osm'); // 'osm' | 'sat'
  const [tick, setTick] = useState(0);

  // Re-render simulated position every second
  useEffect(() => {
    const id = setInterval(() => setTick(t => t+1), 1000);
    return () => clearInterval(id);
  }, []);

  // Init Leaflet map once
  useEffect(() => {
    if (!window.L || !mapDivRef.current || mapRef.current) return;
    const map = window.L.map(mapDivRef.current, { zoomControl: true, attributionControl: true });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Swap tile layer when tileMode changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L) return;
    if (overlayRef.current.tileLayer) map.removeLayer(overlayRef.current.tileLayer);
    const url = tileMode === 'sat'
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    const attr = tileMode === 'sat' ? '© Esri' : '© OpenStreetMap';
    const layer = window.L.tileLayer(url, { attribution: attr, maxZoom: 18 }).addTo(map);
    overlayRef.current.tileLayer = layer;
  }, [tileMode]);

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
    const html = `<div style="transform:rotate(${heading}deg);font-size:22px;filter:drop-shadow(0 1px 3px #000)">✈</div>`;
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

    // Route polyline through user waypoints
    const coords = userWps.map(cp => [cp.lat, cp.lon]);
    ov.route = window.L.polyline(coords, { color: '#f59e0b', weight: 2.5, opacity: 0.9 }).addTo(map);
    map.fitBounds(ov.route.getBounds(), { padding: [50, 50] });

    // User waypoint markers
    userWps.forEach((cp, i) => {
      const color = cp.isOrigin ? '#22c55e' : '#f59e0b';
      const label = cp.name?.slice(0,4) ?? String(i);
      const m = window.L.marker([cp.lat, cp.lon], { icon: makeIcon(color, label, false) }).addTo(map);
      const etaStr = liveETAs[cp.userIdx] != null
        ? `<br/>ETA ${Math.floor(liveETAs[cp.userIdx]/60).toString().padStart(2,'0')}:${Math.round(liveETAs[cp.userIdx]%60).toString().padStart(2,'0')}`
        : '';
      m.bindPopup(`<b>${cp.name}</b>${cp.alt != null ? `<br/>${cp.alt} ft` : ''}${etaStr}`);
      ov.markers.push(m);
    });

    // Virtual waypoint markers (TOC/TOD/BOD) — small dots on the route
    virtWps.forEach(cp => {
      const color = '#22d3ee';
      const m = window.L.marker([cp.lat, cp.lon], { icon: makeIcon(color, cp.name, true) }).addTo(map);
      m.bindPopup(`<b>${cp.name}</b><br/>${cp.alt} ft`);
      ov.markers.push(m);
    });
  }, [liveRoute]);

  // Simulated aircraft position
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L) return;
    const ov = overlayRef.current;
    if (ov.simMarker) { map.removeLayer(ov.simMarker); ov.simMarker = null; }

    const nowMin = nowHHMM();

    // Find last crossed WP and next uncrossed WP with coords
    let lastCp = null, nextCp = null;
    for (const wp of liveRoute) {
      if (wp.lat == null || wp.lon == null) continue;
      if (wp.ata != null) lastCp = wp;
      else if (!nextCp) nextCp = wp;
    }

    // Also try ATD at origin
    const origin = liveRoute.find(cp => cp.isOrigin && cp.lat != null);
    const atdMin = flight.atd ? parseHHMM(flight.atd) : null;

    let simLat, simLon, simTC;
    if (!nextCp) {
      // All crossed — show at last WP
      if (lastCp) { simLat = lastCp.lat; simLon = lastCp.lon; simTC = lastCp.tc ?? 0; }
    } else if (!lastCp && atdMin != null && origin) {
      // In flight from origin, not yet crossed any WP
      const eta = nextCp.etaPlanned;
      if (eta != null && eta > atdMin) {
        const frac = Math.min(1, Math.max(0, (nowMin - atdMin) / (eta - atdMin)));
        [simLat, simLon] = gcInterpolate(origin.lat, origin.lon, nextCp.lat, nextCp.lon, frac);
        simTC = nextCp.tc ?? 0;
      }
    } else if (lastCp && nextCp) {
      const lastATA = parseHHMM(lastCp.ata);
      const nextETA = nextCp.etaPlanned;
      if (lastATA != null && nextETA != null && nextETA > lastATA) {
        const frac = Math.min(1, Math.max(0, (nowMin - lastATA) / (nextETA - lastATA)));
        [simLat, simLon] = gcInterpolate(lastCp.lat, lastCp.lon, nextCp.lat, nextCp.lon, frac);
        simTC = nextCp.tc ?? 0;
      }
    }

    if (simLat != null) {
      ov.simMarker = window.L.marker([simLat, simLon], { icon: planeIcon(simTC), zIndexOffset: 1000 }).addTo(map);
      ov.simMarker.bindPopup('Posição estimada');
    }
  }, [tick, liveRoute, flight.atd, liveETAs]);

  const hasCoords = liveRoute.some(cp => cp.lat != null && cp.lon != null);

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
      {/* Tile switcher */}
      <div className={`flex gap-1 p-2 ${theme.panel} border-b ${theme.panelBorder} shrink-0`}>
        {[['osm','OSM'],['sat','Satélite']].map(([key, label]) => (
          <button key={key} onClick={() => setTileMode(key)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
              tileMode === key ? `${theme.accentBorder} ${theme.accent} bg-amber-500/10` : `${theme.panelBorder} ${theme.fgFaint}`
            }`}>
            {label}
          </button>
        ))}
        <div className={`ml-auto text-[10px] ${theme.fgFaint} flex items-center`}>
          {hasCoords ? `${liveRoute.filter(cp=>cp.lat!=null&&!cp.isVirtual).length} pontos` : 'Adicione coordenadas nos waypoints'}
        </div>
      </div>

      {/* Map container */}
      <div ref={mapDivRef} className="flex-1" />

      {!hasCoords && (
        <div className={`absolute inset-0 flex items-center justify-center pointer-events-none`}
          style={{ top: '120px' }}>
          <div className={`${theme.panel} border ${theme.panelBorder} rounded-2xl p-6 text-center mx-8`}>
            <Map className={`w-10 h-10 ${theme.fgFaint} mx-auto mb-3`} />
            <div className={`font-bold ${theme.fg} mb-1`}>Sem coordenadas</div>
            <div className={`text-[11px] ${theme.fgFaint}`}>
              Edite os waypoints no Setup e adicione coordenadas (lat/lon) para ver a rota no mapa.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"""
s = s.replace('    const _root = ReactDOM.createRoot', MAP_TAB + '    const _root = ReactDOM.createRoot')

with open('C:/Users/cmtew/Downloads/NavAPP/index.html', 'w', encoding='utf-8') as f:
    f.write(s)
print("All patches applied.")
