// Tests for bingoCheck — the fuel reserve check displayed on the Fuel tab.
// Safety-critical (it tells the pilot whether the trip is legal under
// reserves), so even the simple arithmetic should be pinned.
//
// Reads the last non-null entry of liveFuel as the "predicted at dest"
// fuel quantity; compares against reserveMin × gphCruise. Returns a
// breakdown plus an `isBingo` flag (true = NOT enough reserve).

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { nearly } = require("./helpers.js");
const P = require("../lib/planning.js");

test("bingoCheck: null args → null", () => {
  assert.equal(P.bingoCheck(null), null);
  assert.equal(P.bingoCheck(undefined), null);
});

test("bingoCheck: no liveFuel data → uses fuelInitial as predicted", () => {
  const r = P.bingoCheck({ liveFuel: [], fuelInitial: 50, gphCruise: 12, reserveMin: 30 });
  assert.equal(r.predictedAtDest, 50);
  // required = 30/60 * 12 = 6 gal
  assert.ok(nearly(r.requiredAtDest, 6, 1e-9));
  assert.equal(r.deficitGal, 0);
  assert.equal(r.isBingo, false);
});

test("bingoCheck: last non-null liveFuel entry is the predicted value", () => {
  const r = P.bingoCheck({
    liveFuel: [50, 40, null, 30, null, null],
    fuelInitial: 50,
    gphCruise: 12,
    reserveMin: 30,
  });
  assert.equal(r.predictedAtDest, 30);
});

test("bingoCheck: all-null liveFuel → falls back to fuelInitial", () => {
  const r = P.bingoCheck({
    liveFuel: [null, null, null],
    fuelInitial: 42,
    gphCruise: 10,
  });
  assert.equal(r.predictedAtDest, 42);
});

test("bingoCheck: predicted < required flags isBingo and reports deficit", () => {
  // 30 min @ 12 gph = 6 gal required. Predicted is 5 gal → 1 gal short.
  const r = P.bingoCheck({
    liveFuel: [5],
    fuelInitial: 50, // ignored once liveFuel has data
    gphCruise: 12,
    reserveMin: 30,
  });
  assert.equal(r.predictedAtDest, 5);
  assert.ok(nearly(r.requiredAtDest, 6, 1e-9));
  assert.ok(nearly(r.deficitGal, 1, 1e-9));
  assert.equal(r.isBingo, true);
});

test("bingoCheck: predicted == required is NOT bingo (margin of zero is legal)", () => {
  const r = P.bingoCheck({
    liveFuel: [6],
    fuelInitial: 50,
    gphCruise: 12,
    reserveMin: 30,
  });
  assert.equal(r.predictedAtDest, 6);
  assert.equal(r.isBingo, false);
  assert.equal(r.deficitGal, 0);
});

test("bingoCheck: reserveMin defaults to 30 when omitted", () => {
  const r = P.bingoCheck({ liveFuel: [10], gphCruise: 12 });
  // 30/60 * 12 = 6
  assert.ok(nearly(r.requiredAtDest, 6, 1e-9));
});

test("bingoCheck: IFR 45-min reserve scales linearly", () => {
  const r = P.bingoCheck({ liveFuel: [10], gphCruise: 12, reserveMin: 45 });
  // 45/60 * 12 = 9
  assert.ok(nearly(r.requiredAtDest, 9, 1e-9));
  assert.equal(r.predictedAtDest, 10);
  assert.equal(r.isBingo, false);
});

test("bingoCheck: missing gphCruise → required = 0 (always legal)", () => {
  const r = P.bingoCheck({ liveFuel: [5], reserveMin: 30 });
  assert.equal(r.requiredAtDest, 0);
  assert.equal(r.isBingo, false);
});

test("bingoCheck: deficitGal clamped to 0 even when predicted > required", () => {
  const r = P.bingoCheck({ liveFuel: [50], gphCruise: 12, reserveMin: 30 });
  // predicted 50, required 6 → "deficit" would be negative; must report 0
  assert.equal(r.deficitGal, 0);
});
