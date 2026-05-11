const { test } = require("node:test");
const assert = require("node:assert/strict");
const { nearly } = require("./helpers.js");
const C = require("../lib/coords.js");

// ── parseCoordsString ────────────────────────────────────────────────────────

test("parseCoordsString: decimal comma-separated", () => {
  const r = C.parseCoordsString("38.7169, -9.1395");
  assert.ok(r);
  assert.ok(nearly(r[0], 38.7169, 1e-6));
  assert.ok(nearly(r[1], -9.1395, 1e-6));
});

test("parseCoordsString: decimal space-separated, no sign", () => {
  const r = C.parseCoordsString("0 0");
  assert.deepEqual(r, [0, 0]);
});

test("parseCoordsString: decimal semicolon-separated", () => {
  const r = C.parseCoordsString("45;90");
  assert.deepEqual(r, [45, 90]);
});

test("parseCoordsString: DDM with degree/minute symbols (N/W)", () => {
  const r = C.parseCoordsString("38°43.01'N 9°08.37'W");
  assert.ok(r);
  // 38°43.01' = 38 + 43.01/60
  assert.ok(nearly(r[0], 38 + 43.01 / 60, 1e-6));
  // 9°08.37' W = -(9 + 8.37/60)
  assert.ok(nearly(r[1], -(9 + 8.37 / 60), 1e-6));
});

test("parseCoordsString: DDM southern hemisphere", () => {
  const r = C.parseCoordsString("22°54.45'S 43°10.50'W");
  assert.ok(r);
  assert.ok(nearly(r[0], -(22 + 54.45 / 60), 1e-6));
  assert.ok(nearly(r[1], -(43 + 10.50 / 60), 1e-6));
});

test("parseCoordsString: DMS with full symbols", () => {
  const r = C.parseCoordsString("38°43'01\"N 9°08'22\"W");
  assert.ok(r);
  assert.ok(nearly(r[0], 38 + 43 / 60 + 1 / 3600, 1e-6));
  assert.ok(nearly(r[1], -(9 + 8 / 60 + 22 / 3600), 1e-6));
});

test("parseCoordsString: compact DDMm.mm format", () => {
  const r = C.parseCoordsString("3843.01N 00908.37W");
  assert.ok(r);
  assert.ok(nearly(r[0], 38 + 43.01 / 60, 1e-6));
  assert.ok(nearly(r[1], -(9 + 8.37 / 60), 1e-6));
});

test("parseCoordsString: null on empty / whitespace / null input", () => {
  assert.equal(C.parseCoordsString(""), null);
  assert.equal(C.parseCoordsString(null), null);
  assert.equal(C.parseCoordsString(undefined), null);
});

test("parseCoordsString: rejects out-of-range decimal", () => {
  assert.equal(C.parseCoordsString("100, 0"), null);    // lat > 90
  assert.equal(C.parseCoordsString("0, 200"), null);    // lon > 180
  assert.equal(C.parseCoordsString("-95, 0"), null);    // lat < -90
});

test("parseCoordsString: returns null on garbage", () => {
  assert.equal(C.parseCoordsString("not a coord"), null);
  assert.equal(C.parseCoordsString("abc, def"), null);
});

// ── decDegToStr ──────────────────────────────────────────────────────────────

test("decDegToStr: lat north pads to 2 digits", () => {
  assert.equal(C.decDegToStr(38.71694, true), "38°43.016'N");
});

test("decDegToStr: lat south flips hemisphere", () => {
  assert.equal(C.decDegToStr(-22.9075, true), "22°54.450'S");
});

test("decDegToStr: lon east pads degree to 3 digits, minute not padded", () => {
  // Current behavior: `.toFixed(3)` on minute leaves integer part unpadded.
  assert.equal(C.decDegToStr(9.13950, false), "009°8.370'E");
});

test("decDegToStr: lon west flips hemisphere", () => {
  assert.equal(C.decDegToStr(-9.13950, false), "009°8.370'W");
});

test("decDegToStr: zero shows as E/N respectively", () => {
  assert.equal(C.decDegToStr(0, true), "00°0.000'N");
  assert.equal(C.decDegToStr(0, false), "000°0.000'E");
});

// ── formatCoord ──────────────────────────────────────────────────────────────

test("formatCoord: full lat+lon string", () => {
  assert.equal(C.formatCoord(38.71694, -9.13950), "38°43.016'N 009°8.370'W");
});

test("formatCoord: null when either coord is missing", () => {
  assert.equal(C.formatCoord(null, 0), null);
  assert.equal(C.formatCoord(0, null), null);
  assert.equal(C.formatCoord(undefined, undefined), null);
});

// ── parse↔format round-trip ──────────────────────────────────────────────────

test("round-trip: formatCoord → parseCoordsString preserves value within 1e-4", () => {
  const lat = 38.7169, lon = -9.1395;
  const formatted = C.formatCoord(lat, lon);
  const reparsed = C.parseCoordsString(formatted);
  assert.ok(reparsed, `expected non-null, got null for ${formatted}`);
  assert.ok(nearly(reparsed[0], lat, 1e-4), `lat ${reparsed[0]} vs ${lat}`);
  assert.ok(nearly(reparsed[1], lon, 1e-4), `lon ${reparsed[1]} vs ${lon}`);
});

// ── ddmDigitsToDecDeg ────────────────────────────────────────────────────────

test("ddmDigitsToDecDeg: lat 38°43.01'N from digits [3,8,4,3,0,1]", () => {
  const v = C.ddmDigitsToDecDeg([3, 8, 4, 3, 0, 1], false, "N");
  assert.ok(nearly(v, 38 + 43.01 / 60, 1e-6), `v=${v}`);
});

test("ddmDigitsToDecDeg: lon 009°08.37'W from digits [0,0,9,0,8,3,7]", () => {
  const v = C.ddmDigitsToDecDeg([0, 0, 9, 0, 8, 3, 7], true, "W");
  assert.ok(nearly(v, -(9 + 8.37 / 60), 1e-6), `v=${v}`);
});

test("ddmDigitsToDecDeg: hemisphere S inverts sign", () => {
  const v = C.ddmDigitsToDecDeg([2, 2, 5, 4, 4, 5], false, "S");
  assert.ok(nearly(v, -(22 + 54.45 / 60), 1e-6), `v=${v}`);
});

test("ddmDigitsToDecDeg: invalid when minute >= 60", () => {
  assert.equal(C.ddmDigitsToDecDeg([3, 8, 6, 0, 0, 0], false, "N"), null);
});

test("ddmDigitsToDecDeg: invalid when lat deg > 89", () => {
  assert.equal(C.ddmDigitsToDecDeg([9, 0, 0, 0, 0, 0], false, "N"), null);
});

test("ddmDigitsToDecDeg: invalid when lon deg > 179", () => {
  assert.equal(C.ddmDigitsToDecDeg([1, 8, 0, 0, 0, 0, 0], true, "E"), null);
});
