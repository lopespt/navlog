const { test } = require("node:test");
const assert = require("node:assert/strict");
const { P } = require("./helpers.js");

test("validateLeg: TC out of range → warning", () => {
  const w = P.validateLeg({ tc: 400 }, null);
  assert.ok(w.some((s) => /TC inválido/.test(s)));
});

test("validateLeg: TC = 0 is valid (north)", () => {
  const w = P.validateLeg({ tc: 0 }, null);
  assert.equal(w.length, 0);
});

test("validateLeg: dist <= 0 → warning", () => {
  const w = P.validateLeg({ tc: 90, dist: 0 }, null);
  assert.ok(w.some((s) => /Distância/.test(s)));
});

test("validateLeg: low GS → warning", () => {
  const w = P.validateLeg({ tc: 90 }, { gs: 20, ete: 30 });
  assert.ok(w.some((s) => /GS muito baixo/.test(s)));
});

test("validateLeg: high GS → warning", () => {
  const w = P.validateLeg({ tc: 90 }, { gs: 600, ete: 30 });
  assert.ok(w.some((s) => /GS muito alto/.test(s)));
});

test("validateLeg: long ETE → warning", () => {
  const w = P.validateLeg({ tc: 90 }, { gs: 100, ete: 400 });
  assert.ok(w.some((s) => /ETE > 5 h/.test(s)));
});

test("validateLeg: clean leg → no warnings", () => {
  const w = P.validateLeg({ tc: 90, dist: 25 }, { gs: 110, ete: 13 });
  assert.equal(w.length, 0);
});
