const { test } = require("node:test");
const assert = require("node:assert/strict");
const { P, nearly } = require("./helpers.js");

test("calcLeg: no-wind level leg", () => {
  const r = P.calcLeg(90, 10, 110, 0, 0, 0, 0);
  assert.equal(Math.abs(r.wca), 0); // can be -0 from atan2 sign
  assert.equal(r.gs, 110);
  assert.ok(nearly(r.ete, 5.45, 0.05), `ete=${r.ete}`);
  assert.equal(r.mc, 90);
  assert.equal(r.mh, 90);
  assert.equal(r.ch, 90);
});

test("calcLeg: direct headwind reduces GS, no wind correction angle", () => {
  // TC north, wind from north — pure headwind.
  const r = P.calcLeg(0, 10, 100, 0, 20, 0, 0);
  assert.ok(nearly(r.wca, 0, 0.001), `wca=${r.wca}`);
  assert.equal(r.gs, 80);
});

test("calcLeg: direct tailwind increases GS", () => {
  // TC north, wind from south — pure tailwind.
  const r = P.calcLeg(0, 10, 100, 180, 20, 0, 0);
  assert.ok(nearly(r.wca, 0, 0.001));
  assert.equal(r.gs, 120);
});

test("calcLeg: 90° crosswind needs WCA, slight GS reduction", () => {
  // TC north, wind from east — pure crosswind.
  const r = P.calcLeg(0, 10, 100, 90, 20, 0, 0);
  // WCA ≈ asin(20/100) = 11.54°
  assert.ok(nearly(r.wca, 11.54, 0.05), `wca=${r.wca}`);
  // GS = TAS·cos(WCA) − wind·cos(90°) = 100·cos(11.54°) ≈ 97.98
  assert.ok(nearly(r.gs, 97.98, 0.1), `gs=${r.gs}`);
});

test("calcLeg: variation converts TC to MC", () => {
  // West variation of −20° (e.g. Brazil): MC = TC − var = 90 − (−20) = 110°.
  const r = P.calcLeg(90, 10, 110, 0, 0, -20, 0);
  assert.equal(r.mc, 110);
  assert.equal(r.mh, 110);
});

test("calcLeg: deviation adds to MH for CH", () => {
  const r = P.calcLeg(90, 10, 110, 0, 0, 0, 5);
  assert.equal(r.ch, 95);
});

test("calcLeg: zero TAS returns zero GS/ETE without NaN", () => {
  const r = P.calcLeg(90, 10, 0, 0, 0, 0, 0);
  assert.equal(r.gs, 0);
  assert.equal(r.ete, 0);
  assert.ok(Number.isFinite(r.gs));
  assert.ok(Number.isFinite(r.ete));
});

test("calcLeg: negative TAS treated as zero", () => {
  const r = P.calcLeg(90, 10, -10, 0, 0, 0, 0);
  assert.equal(r.gs, 0);
});
