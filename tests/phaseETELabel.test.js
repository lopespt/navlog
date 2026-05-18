const { test } = require("node:test");
const assert = require("node:assert/strict");
const { phaseETELabel } = require("../lib/planning.js");

test("phaseETELabel: single-phase leg returns null", () => {
  assert.equal(phaseETELabel([{ phase: "CRUZEIRO", dist: 50 }], 30), null);
});

test("phaseETELabel: missing/empty portions returns null", () => {
  assert.equal(phaseETELabel(null, 30), null);
  assert.equal(phaseETELabel([], 30), null);
  assert.equal(phaseETELabel(undefined, 30), null);
});

test("phaseETELabel: missing/zero totalETE returns null", () => {
  const p = [{ phase: "SUBIDA", dist: 10 }, { phase: "CRUZEIRO", dist: 40 }];
  assert.equal(phaseETELabel(p, 0), null);
  assert.equal(phaseETELabel(p, null), null);
  assert.equal(phaseETELabel(p, undefined), null);
});

test("phaseETELabel: zero totalDist returns null", () => {
  const p = [{ phase: "SUBIDA", dist: 0 }, { phase: "CRUZEIRO", dist: 0 }];
  assert.equal(phaseETELabel(p, 30), null);
});

test("phaseETELabel: typical 3-phase leg", () => {
  // 10 NM climb + 40 NM cruise + 10 NM descent = 60 NM total
  // total ETE = 30 min; proportional → climb 5, cruise 20, descent 5
  const p = [
    { phase: "SUBIDA",   dist: 10 },
    { phase: "CRUZEIRO", dist: 40 },
    { phase: "DESCIDA",  dist: 10 },
  ];
  assert.equal(phaseETELabel(p, 30), "↗5 →20 ↘5 min");
});

test("phaseETELabel: phase with 0 rounded ETE is omitted", () => {
  // tiny climb (1 NM) on a 99 NM leg → rounds to 0 min for climb at 30 min total
  const p = [
    { phase: "SUBIDA",   dist: 1 },
    { phase: "CRUZEIRO", dist: 99 },
  ];
  // climb ete ≈ 0.3 → rounds to 0 → omitted
  assert.equal(phaseETELabel(p, 30), "→30 min");
});

test("phaseETELabel: unknown phase falls back to → icon", () => {
  const p = [
    { phase: "UNKNOWN",  dist: 10 },
    { phase: "CRUZEIRO", dist: 40 },
  ];
  assert.equal(phaseETELabel(p, 30), "→6 →24 min");
});
