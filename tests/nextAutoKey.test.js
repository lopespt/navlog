const { test } = require("node:test");
const assert = require("node:assert/strict");
const { nextAutoKey } = require("../lib/planning.js");

test("nextAutoKey: sequential keys per label", () => {
  const counters = {};
  assert.equal(nextAutoKey("TOC", counters), "toc_0");
  assert.equal(nextAutoKey("TOC", counters), "toc_1");
  assert.equal(nextAutoKey("TOC", counters), "toc_2");
});

test("nextAutoKey: independent counters per label", () => {
  const counters = {};
  assert.equal(nextAutoKey("TOC", counters), "toc_0");
  assert.equal(nextAutoKey("TOD", counters), "tod_0");
  assert.equal(nextAutoKey("TOC", counters), "toc_1");
  assert.equal(nextAutoKey("BOD", counters), "bod_0");
  assert.equal(nextAutoKey("TOD", counters), "tod_1");
});

test("nextAutoKey: case-insensitive (normalized to lower)", () => {
  const counters = {};
  assert.equal(nextAutoKey("toc", counters), "toc_0");
  assert.equal(nextAutoKey("TOC", counters), "toc_1");
  assert.equal(nextAutoKey("Toc", counters), "toc_2");
});

test("nextAutoKey: two passes agree on key for same occurrence", () => {
  // The whole point: a re-render must mint identical keys so
  // flight.autoWpATAs entries survive.
  const labels = ["TOC", "TOD", "TOC", "BOD"];
  const pass1 = [];
  const c1 = {};
  for (const l of labels) pass1.push(nextAutoKey(l, c1));
  const pass2 = [];
  const c2 = {};
  for (const l of labels) pass2.push(nextAutoKey(l, c2));
  assert.deepEqual(pass1, pass2);
});
