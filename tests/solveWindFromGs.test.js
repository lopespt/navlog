const { test } = require("node:test");
const assert = require("node:assert/strict");
const { P, nearly } = require("./helpers.js");

// Direction comparison is wrap-aware: 359.9° and 0° are the "same" direction.
function dirNear(a, b, eps) {
  const e = eps == null ? 0.5 : eps;
  let d = ((a - b + 540) % 360) - 180;
  return Math.abs(d) <= e;
}

// Round-trip: build a leg with known wind via calcLeg, take its GS + TH,
// and confirm solveWindFromGs recovers (windDir, windVel) within tolerance.
function roundTrip(tc, tas, windDir, windVel) {
  const r = P.calcLeg(tc, 10, tas, windDir, windVel, 0, 0);
  // calcLeg returns th already — that's what the pilot is "flying".
  return P.solveWindFromGs({ tc, tas, gs: r.gs, th: r.th });
}

test("solveWindFromGs: tailwind on east heading recovers wind", () => {
  const w = roundTrip(90, 100, 270, 15);
  assert.ok(w);
  assert.ok(dirNear(w.windDir, 270, 0.5), `dir=${w.windDir}`);
  assert.ok(nearly(w.windVel, 15, 0.05), `vel=${w.windVel}`);
});

test("solveWindFromGs: headwind on east heading", () => {
  const w = roundTrip(90, 100, 90, 20);
  assert.ok(w);
  assert.ok(dirNear(w.windDir, 90, 0.5), `dir=${w.windDir}`);
  assert.ok(nearly(w.windVel, 20, 0.05));
});

test("solveWindFromGs: crosswind from north on east heading", () => {
  const w = roundTrip(90, 100, 0, 25);
  assert.ok(w);
  assert.ok(dirNear(w.windDir, 0, 0.5), `dir=${w.windDir}`);
  assert.ok(nearly(w.windVel, 25, 0.05));
});

test("solveWindFromGs: arbitrary cases round-trip cleanly", () => {
  const cases = [
    [180, 110, 30, 18],
    [45, 90, 220, 12],
    [330, 130, 110, 22],
  ];
  for (const [tc, tas, wd, wv] of cases) {
    const w = roundTrip(tc, tas, wd, wv);
    assert.ok(w, `case ${[tc, tas, wd, wv]}`);
    assert.ok(dirNear(w.windDir, wd, 0.5), `dir got=${w.windDir} exp=${wd}`);
    assert.ok(nearly(w.windVel, wv, 0.05), `vel got=${w.windVel} exp=${wv}`);
  }
});

test("solveWindFromGs: zero wind → 0 magnitude", () => {
  const w = roundTrip(90, 100, 0, 0);
  assert.ok(w);
  assert.equal(w.windVel, 0);
});

test("solveWindFromGs: invalid input → null", () => {
  assert.equal(P.solveWindFromGs(null), null);
  assert.equal(P.solveWindFromGs({ tc: 90, tas: 0, gs: 100, th: 90 }), null);
  assert.equal(P.solveWindFromGs({ tc: 90, tas: 100, gs: null, th: 90 }), null);
});

test("bingoCheck: predicted above reserve → not bingo", () => {
  const r = P.bingoCheck({ liveFuel: [50, 40, 30, 20], fuelInitial: 50, gphCruise: 10, reserveMin: 30 });
  assert.equal(r.isBingo, false);
  assert.equal(r.predictedAtDest, 20);
  assert.equal(r.requiredAtDest, 5); // 30/60 × 10
  assert.equal(r.deficitGal, 0);
});

test("bingoCheck: predicted below reserve → bingo", () => {
  const r = P.bingoCheck({ liveFuel: [50, 40, 30, 4], fuelInitial: 50, gphCruise: 10, reserveMin: 30 });
  assert.equal(r.isBingo, true);
  assert.equal(r.predictedAtDest, 4);
  assert.equal(r.requiredAtDest, 5);
  assert.equal(r.deficitGal, 1);
});

test("bingoCheck: empty liveFuel → falls back to fuelInitial", () => {
  const r = P.bingoCheck({ liveFuel: [], fuelInitial: 50, gphCruise: 10, reserveMin: 30 });
  assert.equal(r.predictedAtDest, 50);
  assert.equal(r.isBingo, false);
});

test("bingoCheck: nulls in liveFuel are skipped (uses last non-null)", () => {
  const r = P.bingoCheck({ liveFuel: [50, 40, null, null], fuelInitial: 50, gphCruise: 10, reserveMin: 30 });
  assert.equal(r.predictedAtDest, 40);
});
