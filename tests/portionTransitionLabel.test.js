const { test } = require("node:test");
const assert = require("node:assert/strict");
const { P } = require("./helpers.js");

test("portionTransitionLabel: cruise → climb = BOC", () => {
  assert.equal(P.portionTransitionLabel("CRUZEIRO", "SUBIDA"), "BOC");
});

test("portionTransitionLabel: descent → climb = BOC", () => {
  assert.equal(P.portionTransitionLabel("DESCIDA", "SUBIDA"), "BOC");
});

test("portionTransitionLabel: climb → cruise = TOC", () => {
  assert.equal(P.portionTransitionLabel("SUBIDA", "CRUZEIRO"), "TOC");
});

test("portionTransitionLabel: climb → descent = TOC", () => {
  // TOC always wins over TOD when climb ends — the descent label is emitted
  // on the next transition.
  assert.equal(P.portionTransitionLabel("SUBIDA", "DESCIDA"), "TOC");
});

test("portionTransitionLabel: cruise → descent = TOD", () => {
  assert.equal(P.portionTransitionLabel("CRUZEIRO", "DESCIDA"), "TOD");
});

test("portionTransitionLabel: descent → cruise = BOD", () => {
  assert.equal(P.portionTransitionLabel("DESCIDA", "CRUZEIRO"), "BOD");
});

test("portionTransitionLabel: same phase → null", () => {
  assert.equal(P.portionTransitionLabel("CRUZEIRO", "CRUZEIRO"), null);
  assert.equal(P.portionTransitionLabel("SUBIDA", "SUBIDA"), null);
  assert.equal(P.portionTransitionLabel("DESCIDA", "DESCIDA"), null);
});
