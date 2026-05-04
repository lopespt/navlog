const { test } = require("node:test");
const assert = require("node:assert/strict");
const { P, makeAC, nearly } = require("./helpers.js");

function aa(over) {
  return Object.assign({
    targetAlt: 8000,
    fromAlt: 5000,
    startedAt: "12:00",
  }, over || {});
}

test("altTransitionState: climb mid-transition → linear interpolation at ROC", () => {
  // 5000 → 8000 = 3000 ft. ROC 500 fpm → 6 min total. 2 min in → 1000 ft up.
  const r = P.altTransitionState({
    activeAlt: aa(),
    nowMin: 12 * 60 + 2,
    ac: makeAC({ rocClimb: 500 }),
  });
  assert.ok(r);
  assert.equal(r.phase, "climb");
  assert.ok(nearly(r.currentAlt, 6000, 5));
  assert.equal(r.reached, false);
  assert.ok(nearly(r.totalSeconds, 360, 0.1));
  assert.ok(nearly(r.secondsRemaining, 240, 0.1));
});

test("altTransitionState: descent mid-transition", () => {
  // 8000 → 5000 = -3000 ft. ROD 500 fpm → 6 min total. 4 min in → 6000 ft.
  const r = P.altTransitionState({
    activeAlt: aa({ fromAlt: 8000, targetAlt: 5000 }),
    nowMin: 12 * 60 + 4,
    ac: makeAC({ rodDescent: 500 }),
  });
  assert.ok(r);
  assert.equal(r.phase, "descent");
  assert.ok(nearly(r.currentAlt, 6000, 5));
  assert.equal(r.reached, false);
});

test("altTransitionState: target reached → phase level, currentAlt = targetAlt", () => {
  const r = P.altTransitionState({
    activeAlt: aa(),
    nowMin: 12 * 60 + 30, // way past 6 min total
    ac: makeAC({ rocClimb: 500 }),
  });
  assert.ok(r);
  assert.equal(r.phase, "level");
  assert.equal(r.currentAlt, 8000);
  assert.equal(r.reached, true);
  assert.equal(r.secondsRemaining, 0);
});

test("altTransitionState: same fromAlt and targetAlt → level immediately", () => {
  const r = P.altTransitionState({
    activeAlt: aa({ fromAlt: 5000, targetAlt: 5000 }),
    nowMin: 12 * 60 + 5,
    ac: makeAC(),
  });
  assert.ok(r);
  assert.equal(r.phase, "level");
  assert.equal(r.reached, true);
});

test("altTransitionState: nowMin === startedAt → currentAlt = fromAlt", () => {
  const r = P.altTransitionState({
    activeAlt: aa(),
    nowMin: 12 * 60,
    ac: makeAC({ rocClimb: 500 }),
  });
  assert.ok(r);
  assert.equal(r.currentAlt, 5000);
  assert.equal(r.reached, false);
});

test("altTransitionState: missing activeAlt → null", () => {
  assert.equal(P.altTransitionState({ nowMin: 720 }), null);
  assert.equal(P.altTransitionState({}), null);
});

test("altTransitionState: missing nowMin → null", () => {
  assert.equal(P.altTransitionState({ activeAlt: aa() }), null);
});

test("altTransitionState: faster ROC reduces total time", () => {
  // 3000 ft @ 1000 fpm = 3 min total
  const r = P.altTransitionState({
    activeAlt: aa(),
    nowMin: 12 * 60 + 1.5,
    ac: makeAC({ rocClimb: 1000 }),
  });
  assert.ok(r);
  assert.ok(nearly(r.totalSeconds, 180, 0.1));
  assert.ok(nearly(r.currentAlt, 6500, 5));
});
