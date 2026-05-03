const { test } = require("node:test");
const assert = require("node:assert/strict");
const { P, nearly } = require("./helpers.js");

// liveRoute fixture: an origin at (0,0), a WP1 at (0,1) (60 NM east), and a
// WP2 at (0,2) (another 60 NM east). At 60 kt GS each leg takes 60 minutes.
function makeRoute() {
  return [
    { isOrigin: true,  isVirtual: false, name: "ORIG", lat: 0, lon: 0, userIdx: 0, ata: null, etaPlanned: 0,  tc: null, dist: 0  },
    { isOrigin: false, isVirtual: false, name: "WP1",  lat: 0, lon: 1, userIdx: 1, ata: null, etaPlanned: 60, tc: 90,   dist: 60 },
    { isOrigin: false, isVirtual: false, name: "WP2",  lat: 0, lon: 2, userIdx: 2, ata: null, etaPlanned: 120,tc: 90,   dist: 60 },
  ];
}

test("estimatedPosition: no ATD and no ATAs → null", () => {
  const r = P.estimatedPosition({
    liveRoute: makeRoute(),
    liveETAs: [null, null, null],
    flight: { eobt: "00:00" },
    nowMin: 30,
  });
  assert.equal(r, null);
});

test("estimatedPosition: with ATD, mid first leg → midpoint of leg 1", () => {
  const route = makeRoute();
  const r = P.estimatedPosition({
    liveRoute: route,
    liveETAs: [null, 60, 120],
    flight: { atd: "00:00", eobt: "00:00" },
    nowMin: 30, // half of 60 min leg
  });
  assert.ok(r, "expected a position");
  assert.ok(nearly(r.lat, 0, 1e-6), `lat=${r.lat}`);
  assert.ok(nearly(r.lon, 0.5, 1e-6), `lon=${r.lon}`);
  assert.ok(nearly(r.frac, 0.5, 1e-6), `frac=${r.frac}`);
  assert.equal(r.segment.from.name, "ORIG");
  assert.equal(r.segment.to.name, "WP1");
  assert.equal(r.devActive, false);
  assert.equal(r.holding, false);
});

test("estimatedPosition: with ATA on WP1 + half second leg → midpoint of leg 2", () => {
  const route = makeRoute();
  route[1].ata = "01:00";
  const r = P.estimatedPosition({
    liveRoute: route,
    liveETAs: [null, 60, 120],
    flight: { atd: "00:00", eobt: "00:00" },
    nowMin: 90, // 30 min into a 60 min leg
  });
  assert.ok(r);
  assert.ok(nearly(r.lon, 1.5, 1e-6), `lon=${r.lon}`);
  assert.ok(nearly(r.frac, 0.5, 1e-6), `frac=${r.frac}`);
  assert.equal(r.segment.from.name, "WP1");
  assert.equal(r.segment.to.name, "WP2");
});

test("estimatedPosition: clamps frac to [0, 1] (running late)", () => {
  const r = P.estimatedPosition({
    liveRoute: makeRoute(),
    liveETAs: [null, 60, 120],
    flight: { atd: "00:00", eobt: "00:00" },
    nowMin: 90, // would be frac=1.5 on first leg
  });
  assert.ok(r);
  assert.equal(r.frac, 1, "frac should clamp to 1");
});

test("estimatedPosition: activeDeviation overrides segment when targeting next WP", () => {
  // After WP1 crossed, deviation south of route to WP2.
  const route = makeRoute();
  route[1].ata = "01:00";
  const r = P.estimatedPosition({
    liveRoute: route,
    liveETAs: [null, 60, 90], // dev: WP2 ETA pushed to t=90
    flight: {
      atd: "00:00", eobt: "00:00",
      activeDeviation: {
        fromLat: -0.5, fromLon: 1.5, targetIdx: 2,
        startedAt: "01:15",
      },
    },
    nowMin: 82.5, // halfway through deviation leg (75 → 90 ⇒ 7.5 min in of 15)
  });
  assert.ok(r);
  assert.equal(r.devActive, true, "devActive should flip true");
  // Halfway between (-0.5, 1.5) and (0, 2): (-0.25, 1.75)
  assert.ok(nearly(r.lat, -0.25, 1e-6), `lat=${r.lat}`);
  assert.ok(nearly(r.lon, 1.75, 1e-6), `lon=${r.lon}`);
});

test("estimatedPosition: hold active at WP1 → parked at WP1, not advancing", () => {
  const route = makeRoute();
  route[1].ata = "01:00";
  // Hold for 10 min starting at t=60.
  const r = P.estimatedPosition({
    liveRoute: route,
    liveETAs: [null, 60, 120],
    flight: {
      atd: "00:00", eobt: "00:00",
      holds: [{ atIdx: 1, startMin: 60, durationMin: 10 }],
    },
    nowMin: 65, // mid-hold
  });
  assert.ok(r);
  assert.equal(r.holding, true);
  assert.ok(nearly(r.lat, 0, 1e-6));
  assert.ok(nearly(r.lon, 1, 1e-6), `lon=${r.lon} (should be parked at WP1)`);
});

test("estimatedPosition: hold expired → resumes interpolation on next leg", () => {
  const route = makeRoute();
  route[1].ata = "01:00";
  const r = P.estimatedPosition({
    liveRoute: route,
    liveETAs: [null, 60, 120],
    flight: {
      atd: "00:00", eobt: "00:00",
      holds: [{ atIdx: 1, startMin: 60, durationMin: 10 }],
    },
    nowMin: 90, // hold ended at t=70; now mid leg 2
  });
  assert.ok(r);
  assert.equal(r.holding, false);
  assert.equal(r.segment.to.name, "WP2");
  // Without hold-aware ETA shift this is still the simple midpoint estimate.
});

test("estimatedPosition: all WPs crossed → parked at last", () => {
  const route = makeRoute();
  route[1].ata = "01:00";
  route[2].ata = "02:00";
  const r = P.estimatedPosition({
    liveRoute: route,
    liveETAs: [null, 60, 120],
    flight: { atd: "00:00", eobt: "00:00" },
    nowMin: 130,
  });
  assert.ok(r);
  assert.equal(r.parked, true);
  assert.ok(nearly(r.lon, 2, 1e-6));
});

test("estimatedPosition: bypassed WP is skipped from prev/next scan", () => {
  // Route: ORIG → WP1 (bypassed) → WP2.  After ATD, with no ATAs, prevWp
  // should fall back to origin and nextWp should be WP2 (skipping bypassed).
  const route = makeRoute();
  route[1].bypassed = true;
  const r = P.estimatedPosition({
    liveRoute: route,
    liveETAs: [null, null, 60],
    flight: {
      atd: "00:00", eobt: "00:00",
      activeDeviation: { fromLat: 0, fromLon: 0, targetIdx: 2, startedAt: "00:00" },
    },
    nowMin: 30, // half of 60-min direct leg from origin to WP2
  });
  assert.ok(r);
  assert.equal(r.devActive, true);
  assert.equal(r.segment.to.name, "WP2");
});

test("estimatedPosition: empty / null inputs → null", () => {
  assert.equal(P.estimatedPosition(null), null);
  assert.equal(P.estimatedPosition({ liveRoute: [], nowMin: 0 }), null);
  assert.equal(P.estimatedPosition({ liveRoute: makeRoute(), nowMin: null }), null);
});
