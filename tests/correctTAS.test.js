const { test } = require("node:test");
const assert = require("node:assert/strict");
const { P } = require("./helpers.js");

test("correctTAS: sea level ISA = base", () => {
  assert.equal(P.correctTAS(110, 0, 0), 110);
});

test("correctTAS: 10000 ft adds 20% (rounded)", () => {
  // 110 × (1 + 0.02 × 10) = 132
  assert.equal(P.correctTAS(110, 10000, 0), 132);
});

test("correctTAS: ISA dev compounds with altitude factor", () => {
  // 110 × (1 + 0.02·5) × (1 + 0.002·20) = 110 × 1.10 × 1.04 = 125.84 → 126
  assert.equal(P.correctTAS(110, 5000, 20), 126);
});

test("correctTAS: rounds to nearest integer", () => {
  // 100 × (1 + 0.02·1) = 102 (exact)
  assert.equal(P.correctTAS(100, 1000, 0), 102);
  // 100 × (1 + 0.02·2) = 104 (exact)
  assert.equal(P.correctTAS(100, 2000, 0), 104);
  // Ties land within ±1 of the mathematical round (FP gives 102.4999… not 102.5)
  const v = P.correctTAS(100, 1250, 0);
  assert.ok(v === 102 || v === 103, `expected 102 or 103, got ${v}`);
});

test("correctTAS: undefined isaDev treated as 0", () => {
  assert.equal(P.correctTAS(110, 5000, undefined), 121);
});

test("correctTAS: negative ISA dev (cold) reduces TAS", () => {
  // 110 × 1.10 × (1 − 0.04) = 116.16 → 116
  assert.equal(P.correctTAS(110, 5000, -20), 116);
});
