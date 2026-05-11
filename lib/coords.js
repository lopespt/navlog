// Coordinate parsing and formatting helpers — pure, no DOM access.
// Loaded via <script src="lib/coords.js"> in index.html (global) and via
// require() in tests. UMD footer mirrors lib/planning.js.

// Best-effort coord parser. Accepts:
//   "38.7169 -9.1395"  /  "38.7169, -9.1395"          (decimal degrees)
//   "3843.01N 00908.37W" / "3843.01N00908.37W"         (DDMm.mm)
//   "38°43.01'N 9°08.37'W"                              (DDM with symbols)
//   "38°43'01\"N 9°08'22\"W"                            (DMS with symbols)
function parseCoordsString(text) {
  if (!text) return null;
  var s = String(text).trim();
  // Decimal: "lat[,/space]lon"
  var dd = s.match(/^([+-]?\d+(?:\.\d+)?)\s*[,;\s]\s*([+-]?\d+(?:\.\d+)?)$/);
  if (dd) {
    var lat = parseFloat(dd[1]), lon = parseFloat(dd[2]);
    if (isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return [lat, lon];
  }
  // DDM with symbols: "38°43.01'N 9°08.37'W" (also accepts decimal in seconds slot for DMS)
  var ddmSym = s.match(/(\d+)\s*°\s*(\d+(?:\.\d+)?)\s*['′]?\s*([NSns])\s*[,;\s]\s*(\d+)\s*°\s*(\d+(?:\.\d+)?)\s*['′]?\s*([EWew])/);
  if (ddmSym) {
    var la = parseInt(ddmSym[1], 10) + parseFloat(ddmSym[2]) / 60;
    var lo = parseInt(ddmSym[4], 10) + parseFloat(ddmSym[5]) / 60;
    if (ddmSym[3].toUpperCase() === "S") la = -la;
    if (ddmSym[6].toUpperCase() === "W") lo = -lo;
    if (Math.abs(la) <= 90 && Math.abs(lo) <= 180) return [la, lo];
  }
  // DMS with symbols: "38°43'01\"N 9°08'22\"W"
  var dmsSym = s.match(/(\d+)\s*°\s*(\d+)\s*['′]\s*(\d+(?:\.\d+)?)\s*["″]?\s*([NSns])\s*[,;\s]\s*(\d+)\s*°\s*(\d+)\s*['′]\s*(\d+(?:\.\d+)?)\s*["″]?\s*([EWew])/);
  if (dmsSym) {
    var la2 = parseInt(dmsSym[1], 10) + parseInt(dmsSym[2], 10) / 60 + parseFloat(dmsSym[3]) / 3600;
    var lo2 = parseInt(dmsSym[5], 10) + parseInt(dmsSym[6], 10) / 60 + parseFloat(dmsSym[7]) / 3600;
    if (dmsSym[4].toUpperCase() === "S") la2 = -la2;
    if (dmsSym[8].toUpperCase() === "W") lo2 = -lo2;
    if (Math.abs(la2) <= 90 && Math.abs(lo2) <= 180) return [la2, lo2];
  }
  // Compact DDMm.mm: "3843.01N 00908.37W"
  var compact = s.match(/(\d{2,4})(\d\d(?:\.\d+)?)\s*([NSns])\s*[,;\s]?\s*(\d{3,5})(\d\d(?:\.\d+)?)\s*([EWew])/);
  if (compact) {
    var la3 = parseInt(compact[1], 10) + parseFloat(compact[2]) / 60;
    var lo3 = parseInt(compact[4], 10) + parseFloat(compact[5]) / 60;
    if (compact[3].toUpperCase() === "S") la3 = -la3;
    if (compact[6].toUpperCase() === "W") lo3 = -lo3;
    if (Math.abs(la3) <= 90 && Math.abs(lo3) <= 180) return [la3, lo3];
  }
  return null;
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

const __NAVLOG_COORDS__ = {
  parseCoordsString, decDegToStr, formatCoord, ddmDigitsToDecDeg,
};
if (typeof module !== "undefined" && module.exports) {
  module.exports = __NAVLOG_COORDS__;
}
if (typeof window !== "undefined") {
  Object.assign(window, __NAVLOG_COORDS__);
}
