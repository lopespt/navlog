const { test } = require("node:test");
const assert = require("node:assert/strict");
const { P, nearly } = require("./helpers.js");

test("gcDist: 1° of longitude at the equator ≈ 60 NM", () => {
  // 1° lon at lat 0 = 60 NM (great-circle, since longitudes are great circles).
  const d = P.gcDist(0, 0, 0, 1);
  assert.ok(nearly(d, 60, 0.5), `dist=${d}`);
});

test("gcDist: same point → 0", () => {
  const d = P.gcDist(38.7169, -9.1395, 38.7169, -9.1395);
  assert.ok(d < 0.001);
});

test("gcTC: due east", () => {
  const tc = P.gcTC(0, 0, 0, 1);
  assert.ok(nearly(tc, 90, 0.001), `tc=${tc}`);
});

test("gcTC: due north", () => {
  const tc = P.gcTC(0, 0, 1, 0);
  assert.ok(nearly(tc, 0, 0.001), `tc=${tc}`);
});

test("gcTC: due south wraps to 180", () => {
  const tc = P.gcTC(1, 0, 0, 0);
  assert.ok(nearly(tc, 180, 0.001), `tc=${tc}`);
});

test("projectDest + gcDist: round-trip recovers distance", () => {
  const cases = [
    [0, 0, 90, 60],
    [38.7169, -9.1395, 270, 100],
    [-23.5, -46.6, 45, 50],
  ];
  for (const [lat, lon, tc, d] of cases) {
    const [lat2, lon2] = P.projectDest(lat, lon, tc, d);
    const back = P.gcDist(lat, lon, lat2, lon2);
    assert.ok(nearly(back, d, 0.05),
      `expected ${d} NM, got ${back.toFixed(3)} (case=${[lat, lon, tc, d]})`);
  }
});

test("projectSource: starting from dest, reverse course recovers origin", () => {
  const [lat2, lon2] = P.projectDest(0, 0, 90, 60);
  const [lat0, lon0] = P.projectSource(lat2, lon2, 90, 60);
  assert.ok(nearly(lat0, 0, 0.0001));
  assert.ok(nearly(lon0, 0, 0.0001));
});

test("gcInterpolate(0.5) is the midpoint of the linear segment", () => {
  const [lat, lon] = P.gcInterpolate(0, 0, 0, 1, 0.5);
  assert.ok(nearly(lat, 0, 1e-6));
  assert.ok(nearly(lon, 0.5, 1e-6));
});

test("gcIntersection: two perpendicular tracks meet at expected point", () => {
  // Track A: from (0, 0) heading north (0°).
  // Track B: from (0, 1) heading west (270°).
  // They cross at (0, 0)? No — track A goes (0,0)→up; track B goes (0,1)→(0,0).
  // Both pass through (0, 0).
  const r = P.gcIntersection(0, 0, 0, 0, 1, 270);
  assert.ok(r != null, "should find intersection");
  // Intersection should be near (0, 0).
  assert.ok(nearly(r[0], 0, 0.5), `lat=${r[0]}`);
  assert.ok(nearly(r[1], 0, 0.5), `lon=${r[1]}`);
});

test("gcIntersection: same point input → null (no intersection defined)", () => {
  const r = P.gcIntersection(0, 0, 0, 0, 0, 90);
  assert.equal(r, null);
});
