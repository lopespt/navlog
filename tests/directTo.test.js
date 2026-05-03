const { test } = require("node:test");
const assert = require("node:assert/strict");
const { P } = require("./helpers.js");

// Route fixture: origin + 4 user WPs.
function makeCps(opts) {
  opts = opts || {};
  return [
    { isOrigin: true, name: "ORIG", ata: opts.ataOrigin || null, dist: 0 },
    { name: "WP1", ata: opts.ata1 || null, dist: 10 },
    { name: "WP2", ata: opts.ata2 || null, dist: 10 },
    { name: "WP3", ata: opts.ata3 || null, dist: 10 },
    { name: "WP4", ata: opts.ata4 || null, dist: 10 },
  ];
}

test("applyDirectTo: target=4, none crossed → bypasses 1,2,3", () => {
  const cps = makeCps();
  const out = P.applyDirectTo(cps, 4);
  assert.equal(out[0].bypassed, undefined);
  assert.equal(out[1].bypassed, true);
  assert.equal(out[2].bypassed, true);
  assert.equal(out[3].bypassed, true);
  assert.equal(out[4].bypassed, undefined);
});

test("applyDirectTo: target=4, WP1 already crossed → bypasses 2,3", () => {
  const cps = makeCps({ ata1: "01:00" });
  const out = P.applyDirectTo(cps, 4);
  assert.equal(out[1].bypassed, undefined, "crossed WP1 untouched");
  assert.equal(out[2].bypassed, true);
  assert.equal(out[3].bypassed, true);
  assert.equal(out[4].bypassed, undefined);
});

test("applyDirectTo: target equal to next-uncrossed → no bypass", () => {
  const cps = makeCps({ ata1: "01:00" });
  const out = P.applyDirectTo(cps, 2);
  assert.equal(out[2].bypassed, undefined);
  assert.equal(out[3].bypassed, undefined);
});

test("applyDirectTo: does not mutate input", () => {
  const cps = makeCps();
  const out = P.applyDirectTo(cps, 4);
  assert.notEqual(out, cps);
  assert.equal(cps[1].bypassed, undefined, "input WP1 untouched");
  assert.equal(out[1].bypassed, true, "output WP1 bypassed");
});

test("applyDirectTo: invalid targetIdx → returns unchanged", () => {
  const cps = makeCps();
  assert.deepEqual(P.applyDirectTo(cps, null), cps);
  assert.deepEqual(P.applyDirectTo(cps, -1), cps);
  assert.deepEqual(P.applyDirectTo(cps, 99), cps);
});

test("clearDirectTo: removes bypassed flag everywhere", () => {
  const cps = P.applyDirectTo(makeCps(), 4);
  const out = P.clearDirectTo(cps);
  for (const cp of out) assert.equal(cp.bypassed, undefined);
});

test("clearDirectTo: idempotent on cps without bypass", () => {
  const cps = makeCps();
  const out = P.clearDirectTo(cps);
  assert.deepEqual(out.map(c => c.bypassed), [undefined, undefined, undefined, undefined, undefined]);
});

test("applyDirectTo + clearDirectTo: round-trip preserves shape", () => {
  const cps = makeCps({ ata1: "01:00" });
  const after = P.clearDirectTo(P.applyDirectTo(cps, 4));
  assert.equal(after.length, cps.length);
  for (let i = 0; i < cps.length; i++) {
    assert.equal(after[i].name, cps[i].name);
    assert.equal(after[i].ata, cps[i].ata);
    assert.equal(after[i].bypassed, undefined);
  }
});
