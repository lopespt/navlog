const { test } = require("node:test");
const assert = require("node:assert/strict");
const { P } = require("./helpers.js");

test("applyHolds: no holds → returns a copy of etas unchanged", () => {
  const etas = [null, 60, 120, 180];
  const out = P.applyHolds(etas, []);
  assert.deepEqual(out, etas);
  assert.notEqual(out, etas, "should be a new array, not the same reference");
});

test("applyHolds: single hold at WP1 delays WP2, WP3 by durationMin", () => {
  const etas = [null, 60, 120, 180];
  const out = P.applyHolds(etas, [{ atIdx: 1, durationMin: 10 }]);
  assert.deepEqual(out, [null, 60, 130, 190]);
});

test("applyHolds: hold at WP2 delays only WP3 (and beyond)", () => {
  const etas = [null, 60, 120, 180, 240];
  const out = P.applyHolds(etas, [{ atIdx: 2, durationMin: 5 }]);
  assert.deepEqual(out, [null, 60, 120, 185, 245]);
});

test("applyHolds: two holds → cumulative delays", () => {
  const etas = [null, 60, 120, 180, 240];
  const out = P.applyHolds(etas, [
    { atIdx: 1, durationMin: 10 },
    { atIdx: 3, durationMin: 5 },
  ]);
  // WP2: +10 (only WP1 hold applies, atIdx=1 < 2)
  // WP3: +10 (only WP1 hold applies, atIdx=3 < 3 is false)
  // WP4: +15 (both apply, 1<4 and 3<4)
  assert.deepEqual(out, [null, 60, 130, 190, 255]);
});

test("applyHolds: null entries preserved", () => {
  const etas = [null, 60, null, 180];
  const out = P.applyHolds(etas, [{ atIdx: 1, durationMin: 10 }]);
  assert.deepEqual(out, [null, 60, null, 190]);
});

test("applyHolds: hold without durationMin is ignored", () => {
  const etas = [null, 60, 120];
  const out = P.applyHolds(etas, [{ atIdx: 1 }]);
  assert.deepEqual(out, [null, 60, 120]);
});

test("applyHolds: invalid input → returns input as-is", () => {
  assert.equal(P.applyHolds(null, [{ atIdx: 1, durationMin: 10 }]), null);
  // Non-array holds: returns a clone of etas (no holds applied).
  const etas = [60, 120];
  const out = P.applyHolds(etas, null);
  assert.deepEqual(out, etas);
});
