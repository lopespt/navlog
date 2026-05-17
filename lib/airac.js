// AIRAC.NET client — public navigation database.
// CORS open, no auth, BunnyCDN in front. All responses include AIRAC cycle
// headers; data is immutable per cycle (28 days), so we cache aggressively in
// localStorage. Functions are pure HTTP/JSON — no React, no DOM.
//
// Loaded as <script src="lib/airac.js"> in index.html (UMD: exports on window)
// and via require() in tests.

const AIRAC_BASE = "https://airac.net/api/v1";
const AIRAC_LS_PREFIX = "airac_v1_";

// Local copy of the diagnostic helper from index.html — keeps the module
// self-contained (no cross-script dependency on a global `_warn`).
function _airacWarn(label, err) {
  try { console.warn('[navlog]', label, err); } catch (_) {}
}

function _airacCacheGet(key) {
  try {
    const raw = localStorage.getItem(AIRAC_LS_PREFIX + key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj.expiresAt && obj.expiresAt < Date.now()) return null;
    return obj.data;
  } catch (e) { _airacWarn('_airacCacheGet:' + key, e); return null; }
}
function _airacCacheSet(key, data, ttlMs) {
  try {
    localStorage.setItem(AIRAC_LS_PREFIX + key, JSON.stringify({
      data,
      expiresAt: Date.now() + (ttlMs != null ? ttlMs : 14 * 86_400_000),
    }));
  } catch (e) { _airacWarn('_airacCacheSet:' + key, e); }
}

async function airacGetCurrent() {
  const cached = _airacCacheGet("current");
  if (cached) return cached;
  try {
    const r = await fetch(AIRAC_BASE + "/airac/current", { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const j = await r.json();
    if (j.status !== "success" || !j.data) return null;
    const d = j.data;
    // Re-check at most once a day even if days_remaining is much larger.
    const ttl = Math.min(86_400_000, Math.max(60_000, ((d.days_remaining || 0) + 0.5) * 86_400_000));
    _airacCacheSet("current", d, ttl);
    return d;
  } catch (_) { return null; }
}

async function airacSearch(q, signal) {
  if (!q || q.length < 2) return null;
  try {
    const r = await fetch(AIRAC_BASE + "/search?q=" + encodeURIComponent(q), {
      headers: { Accept: "application/json" }, signal,
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.status === "success" ? j.data : null;
  } catch (e) {
    if (e && e.name === "AbortError") throw e;
    return null;
  }
}

function _normalizeCoords(d) {
  // PHP-style float serialization leaves long binary tails on lat/lon — round to 6 dp.
  if (!d) return d;
  if (d.latitude  != null) d.latitude  = Math.round(Number(d.latitude)  * 1e6) / 1e6;
  if (d.longitude != null) d.longitude = Math.round(Number(d.longitude) * 1e6) / 1e6;
  if (d.coordinates) {
    if (d.coordinates.lat != null) d.coordinates.lat = Math.round(Number(d.coordinates.lat) * 1e6) / 1e6;
    if (d.coordinates.lon != null) d.coordinates.lon = Math.round(Number(d.coordinates.lon) * 1e6) / 1e6;
  }
  return d;
}

async function airacAirport(icao, signal) {
  if (!icao) return null;
  const code = String(icao).toUpperCase().trim();
  if (!/^[A-Z0-9]{3,4}$/.test(code)) return null;
  const cached = _airacCacheGet("ap_" + code);
  if (cached) return cached;
  try {
    const r = await fetch(AIRAC_BASE + "/airports/" + code, { headers: { Accept: "application/json" }, signal });
    if (!r.ok) return null;
    const j = await r.json();
    if (j.status !== "success" || !j.data) return null;
    const d = _normalizeCoords(j.data);
    _airacCacheSet("ap_" + code, d, 14 * 86_400_000);
    return d;
  } catch (e) {
    if (e && e.name === "AbortError") throw e;
    return null;
  }
}

// Pin the first checkpoint to the departure airport / the last one to the
// destination airport. Used by the Identificação inputs (on blur) so the route
// always opens at the typed origin and ends at the typed destination — pilot
// doesn't have to maintain those WPs by hand.
//
// When the ICAO is found in AIRAC the WP picks up coordinates + elevation.
// When it's not found we still update the name and clear coords so the pilot
// can drag the WP into place on the map; per-pilot decision in PR #59.
function syncAirportCheckpoint(flight, role, icao, ap) {
  const cps = (flight.checkpoints || []).slice();
  const lat = ap && ap.latitude  != null ? Number(ap.latitude)  : null;
  const lon = ap && ap.longitude != null ? Number(ap.longitude) : null;
  const elev = ap && ap.elevation_ft != null ? Number(ap.elevation_ft) : null;

  if (role === "origin") {
    if (cps.length === 0) {
      cps.push({
        name: icao || "ORIG",
        alt: elev != null ? elev : 0,
        tc: null, dist: 0, ata: null, gsActual: null,
        isOrigin: true, lat, lon,
      });
    } else {
      cps[0] = Object.assign({}, cps[0], {
        name: icao || cps[0].name,
        lat, lon,
        alt: elev != null ? elev : cps[0].alt,
      });
    }
    return Object.assign({}, flight, { origin: icao, checkpoints: cps });
  }

  // destination
  const lastIdx = cps.length - 1;
  if (lastIdx <= 0 || cps[lastIdx].isOrigin) {
    cps.push({
      name: icao || "DEST",
      alt: elev != null ? elev : 0,
      tc: 0, dist: 0, ata: null, gsActual: null,
      lat, lon,
    });
  } else {
    cps[lastIdx] = Object.assign({}, cps[lastIdx], {
      name: icao || cps[lastIdx].name,
      lat, lon,
      alt: elev != null ? elev : cps[lastIdx].alt,
    });
  }
  return Object.assign({}, flight, { destination: icao, checkpoints: cps });
}

async function airacProcedures(icao) {
  if (!icao) return null;
  const code = String(icao).toUpperCase().trim();
  if (!/^[A-Z0-9]{3,4}$/.test(code)) return null;
  const cached = _airacCacheGet("proc_" + code);
  if (cached) return cached;
  try {
    const r = await fetch(AIRAC_BASE + "/airports/" + code + "/procedures", { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const j = await r.json();
    if (j.status !== "success" || !j.data) return null;
    _airacCacheSet("proc_" + code, j.data, 14 * 86_400_000);
    return j.data;
  } catch (_) { return null; }
}

async function airacProcedureDetail(airport, identifier) {
  if (!airport || !identifier) return null;
  const ap = String(airport).toUpperCase().trim();
  const id = String(identifier).toUpperCase().trim();
  const key = "procd_" + ap + "_" + id;
  const cached = _airacCacheGet(key);
  if (cached) return cached;
  try {
    const r = await fetch(AIRAC_BASE + "/procedures/" + ap + "/" + id, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const j = await r.json();
    if (j.status !== "success" || !j.data) return null;
    _airacCacheSet(key, j.data, 14 * 86_400_000);
    return j.data;
  } catch (_) { return null; }
}

// Build the ordered leg list for a chosen (procedure, transition).
// Resolves runway-transition (key "RW35B" → look up "35B") vs fix-transition (key as-is).
// Concatenation order:
//   APP        : transitionLegs + commonRoute  (you arrive via the IAF, then onto common path)
//   SID / STAR : commonRoute + transitionLegs  (you fly the body, then exit via the transition)
// Consecutive duplicate fix_identifier are collapsed (e.g. transition ends at USITO and
// the common_route also starts at USITO).
function pickProcedureLegs(detail, transitionName, typeCode) {
  if (!detail) return [];
  function bySeq(a, b) { return (a.sequence || 0) - (b.sequence || 0); }
  let transLegs = [];
  if (transitionName) {
    if (/^RW/i.test(transitionName)) {
      const rwy = transitionName.replace(/^RW/i, "");
      transLegs = (detail.runway_transitions && detail.runway_transitions[rwy]) || [];
    } else {
      transLegs = (detail.transitions && detail.transitions[transitionName]) || [];
    }
  }
  transLegs = (transLegs || []).slice().sort(bySeq);
  const commonLegs = (detail.common_route || []).slice().sort(bySeq);
  const combined = String(typeCode).toUpperCase() === "APP"
    ? transLegs.concat(commonLegs)
    : commonLegs.concat(transLegs);
  const out = [];
  for (const leg of combined) {
    const last = out[out.length - 1];
    if (last && last.fix_identifier && leg.fix_identifier && last.fix_identifier === leg.fix_identifier) continue;
    out.push(leg);
  }
  return out;
}

function legToCheckpoint(leg, source, typeCode) {
  if (!leg.fix_coordinates || leg.fix_coordinates.lat == null || leg.fix_coordinates.lon == null) return null;
  const lat = Math.round(Number(leg.fix_coordinates.lat) * 1e6) / 1e6;
  const lon = Math.round(Number(leg.fix_coordinates.lon) * 1e6) / 1e6;
  const cp = {
    name: String(leg.fix_identifier || leg.fix_name || "PT").slice(0, 10).toUpperCase(),
    lat: lat, lon: lon,
    ata: null, gsActual: null,
    source: Object.assign({}, source, { sequence: leg.sequence }),
  };
  if (leg.altitude_ft != null) {
    cp.alt = Number(leg.altitude_ft);
    cp.useCruiseAlt = false;
  }
  const isClimb = String(typeCode).toUpperCase() === "SID";
  if (leg.altitude_restriction === "at_or_above") {
    cp.arrivalMode = "asap";
  } else if (leg.altitude_restriction === "at_or_below") {
    cp.arrivalMode = "at_fix";
  } else if (leg.altitude_ft != null) {
    cp.arrivalMode = isClimb ? "asap" : "at_fix";
  }
  return cp;
}

const __NAVLOG_AIRAC__ = {
  airacGetCurrent, airacSearch, airacAirport, airacProcedures, airacProcedureDetail,
  syncAirportCheckpoint, pickProcedureLegs, legToCheckpoint,
};
if (typeof module !== "undefined" && module.exports) {
  module.exports = __NAVLOG_AIRAC__;
}
if (typeof window !== "undefined") {
  Object.assign(window, __NAVLOG_AIRAC__);
}
