const { test } = require("node:test");
const assert = require("node:assert/strict");
const { P, nearly } = require("./helpers.js");

// 1° of longitude at lat 0 ≈ 60 NM. With heading 090° true, no wind, TAS 60 kt
// the ground speed equals TAS so the maths line up cleanly with degrees.
function baseVector(over) {
  return Object.assign({
    heading: 90,
    headingType: "T",
    mode: "open",
    fromLat: 0,
    fromLon: 0,
    startedAt: "12:00",
    currentTas: 60,
  }, over || {});
}

test("vectorPosition: open mode, no wind → advances along heading at TAS", () => {
  const r = P.vectorPosition({
    vector: baseVector(),
    nowMin: 12 * 60 + 30, // 30 min after start
    windDir: 0, windVel: 0,
  });
  assert.ok(r);
  assert.equal(r.limitReached, false);
  assert.ok(nearly(r.gs, 60, 0.01));
  assert.ok(nearly(r.distFlown, 30, 0.01));
  assert.ok(nearly(r.timeFlown, 30, 0.001));
  assert.ok(nearly(r.lat, 0, 0.0005));
  assert.ok(nearly(r.lon, 0.5, 0.005)); // 30 NM east of (0,0)
});

test("vectorPosition: MAG input + variation → TH = heading + variation", () => {
  const r = P.vectorPosition({
    vector: baseVector({ heading: 90, headingType: "M" }),
    nowMin: 12 * 60 + 0,
    variation: 5,
  });
  assert.ok(r);
  assert.ok(nearly(r.th, 95, 0.001));
});

test("vectorPosition: distance limit not yet reached", () => {
  const r = P.vectorPosition({
    vector: baseVector({ mode: "distance", limitDist: 50 }),
    nowMin: 12 * 60 + 30, // 30 min × 60 kt = 30 NM, still under 50 NM
  });
  assert.ok(r);
  assert.equal(r.limitReached, false);
  assert.ok(nearly(r.distFlown, 30, 0.01));
  assert.ok(nearly(r.distRemaining, 20, 0.01));
});

test("vectorPosition: distance limit reached → clamps to limit", () => {
  const r = P.vectorPosition({
    vector: baseVector({ mode: "distance", limitDist: 20 }),
    nowMin: 12 * 60 + 30, // would have flown 30 NM, clamps at 20
  });
  assert.ok(r);
  assert.equal(r.limitReached, true);
  assert.ok(nearly(r.distFlown, 20, 0.01));
  assert.ok(nearly(r.timeFlown, 20, 0.01)); // 20 NM at 60 kt = 20 min
  assert.ok(nearly(r.lon, 20 / 60, 0.005));
});

test("vectorPosition: time limit not yet reached", () => {
  const r = P.vectorPosition({
    vector: baseVector({ mode: "time", limitMin: 45 }),
    nowMin: 12 * 60 + 30,
  });
  assert.ok(r);
  assert.equal(r.limitReached, false);
  assert.ok(nearly(r.timeRemaining, 15, 0.001));
});

test("vectorPosition: time limit reached → clamps to limit", () => {
  const r = P.vectorPosition({
    vector: baseVector({ mode: "time", limitMin: 20 }),
    nowMin: 12 * 60 + 30,
  });
  assert.ok(r);
  assert.equal(r.limitReached, true);
  assert.ok(nearly(r.timeFlown, 20, 0.001));
  assert.ok(nearly(r.distFlown, 20, 0.01));
});

test("vectorPosition: wind from north @ 30 kt + heading 090° → TC slightly south of east", () => {
  // Wind FROM 360 means wind blows toward 180 (south). Aircraft heading 090
  // gets pushed south, so the resulting track is ~ 100° (south of east) and
  // the GS equals sqrt(60² + 30²) ≈ 67 kt.
  const r = P.vectorPosition({
    vector: baseVector(),
    nowMin: 12 * 60 + 60,
    windDir: 360, windVel: 30,
  });
  assert.ok(r);
  assert.ok(nearly(r.gs, Math.sqrt(60 * 60 + 30 * 30), 0.5));
  assert.ok(r.course > 90 && r.course < 180);
});

test("vectorPosition: nowMin === startedAt → frac 0, position at fromLat/Lon", () => {
  const r = P.vectorPosition({
    vector: baseVector(),
    nowMin: 12 * 60,
  });
  assert.ok(r);
  assert.equal(r.distFlown, 0);
  assert.ok(nearly(r.lat, 0, 1e-9));
  assert.ok(nearly(r.lon, 0, 1e-9));
});

test("vectorPosition: missing fromLat/Lon → null", () => {
  const r = P.vectorPosition({
    vector: { heading: 90, mode: "open", startedAt: "12:00" },
    nowMin: 12 * 60 + 5,
  });
  assert.equal(r, null);
});

test("vectorPosition: missing nowMin → null", () => {
  const r = P.vectorPosition({ vector: baseVector() });
  assert.equal(r, null);
});

test("estimatedPosition: with activeVector → returns vector position, ignores route", () => {
  const liveRoute = [
    { isOrigin: true, isVirtual: false, name: "ORIG", lat: 0, lon: 0, userIdx: 0, ata: null, etaPlanned: 0, tc: null, dist: 0 },
    { isOrigin: false, isVirtual: false, name: "WP1", lat: 0, lon: 1, userIdx: 1, ata: null, etaPlanned: 60, tc: 90, dist: 60 },
  ];
  const r = P.estimatedPosition({
    liveRoute,
    liveETAs: [null, 60],
    flight: {
      eobt: "12:00",
      atd: "12:00",
      windDir: 0, windVel: 0, variation: 0,
      activeVector: baseVector({ heading: 360 }), // due north
    },
    nowMin: 12 * 60 + 30,
  });
  assert.ok(r);
  assert.equal(r.vectoring, true);
  // Heading 360° true, 30 min @ 60 kt = 30 NM north → lat ≈ 0.5
  assert.ok(nearly(r.lat, 0.5, 0.005));
  assert.ok(nearly(r.lon, 0, 0.005));
});
