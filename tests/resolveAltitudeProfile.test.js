// Tests for resolveAltitudeProfile — the multi-leg / inherit-altitude
// distributor. Includes explicit regressions for the recent PRs:
//   - #42: descent must "push back" across inherit WPs when the last leg
//          alone can't fit phase + buffer
//   - #43: continuous-phase profile (single TOD/BOC across an inherit chain,
//          not one per leg)
//   - #45: resolver phaseDist uses correctTAS so the per-leg sum matches
//          the segment allocation (no spurious "perna curta")

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  P, makeAC, makeFlight, makeCP, makeOrigin, nearly, phaseDistSum, totalDist,
} = require("./helpers.js");

const ac = makeAC();

test("origin only / level → profile is identity, no warnings", () => {
  const flight = makeFlight();
  const cps = [makeOrigin({ alt: 2700 }), makeCP({ alt: 2700, dist: 10 })];
  const r = P.resolveAltitudeProfile(cps, ac, flight);
  assert.deepEqual(r.profile, [2700, 2700]);
  assert.equal(r.altWarnings[1], null);
});

test("single-leg climb (no inherit) → profile is just the anchors", () => {
  const flight = makeFlight({ cruiseAlt: 7000 });
  const cps = [
    makeOrigin({ alt: 2700 }),
    makeCP({ useCruiseAlt: true, dist: 25 }),
  ];
  const r = P.resolveAltitudeProfile(cps, ac, flight);
  assert.deepEqual(r.profile, [2700, 7000]);
  // No legPlans entry: single-leg segments fall through to computeLegPhases.
  assert.equal(Object.keys(r.legPlans).length, 0);
});

test("single inherit between anchors (climb) → mid-leg altitude on gradient", () => {
  // origin 2700 → WP1 inherit → WP2 7000, dist 10+10. ROC=500, vy=80.
  // Segment-level avgAlt=4850, phaseTas=correctTAS(80,4850)=88.
  // phaseDist = 88·(4300/500)/60 ≈ 12.61 NM.
  // Default arrivalMode for climb is "asap" → cruiseFirst=0,
  // phaseEnd = 12.61, total=20. WP1 distFromSeg=10 < 12.61 → in-phase.
  // phaseFrac = 10/12.61 = 0.793 → profile = 2700 + 0.793·4300 = 6109.
  const flight = makeFlight({ cruiseAlt: 7000 });
  const cps = [
    makeOrigin({ alt: 2700 }),
    makeCP({ name: "WP1", alt: null, useCruiseAlt: false, dist: 10 }),
    makeCP({ name: "WP2", useCruiseAlt: true, dist: 10 }),
  ];
  const r = P.resolveAltitudeProfile(cps, ac, flight);
  assert.equal(r.profile[0], 2700);
  assert.equal(r.profile[2], 7000);
  assert.ok(r.profile[1] > 5500 && r.profile[1] < 7000,
    `WP1 should be mid-climb, got ${r.profile[1]}`);
});

// ── Regression for PR #42: multi-leg descent push ─────────────────────────
test("descent pushed back across inherit WP when last leg alone can't fit", () => {
  // origin 7000 → WP1 inherit → WP2 1500 (descent at_fix), dist 5+5 = 10 NM.
  // altDiff=5500, ROD=500. avg alt 4250, descTas≈98. descDist≈98·11/60=18.0.
  // Last leg alone (5 NM) cannot contain that much descent.
  // Expectation: WP1's resolved alt is BELOW 7000 (descent already started).
  const flight = makeFlight({ cruiseAlt: 7000 });
  const cps = [
    makeOrigin({ useCruiseAlt: true }),
    makeCP({ name: "WP1", alt: null, useCruiseAlt: false, dist: 5 }),
    makeCP({ name: "WP2", alt: 1500, useCruiseAlt: false, dist: 5 }),
  ];
  const r = P.resolveAltitudeProfile(cps, ac, flight);
  assert.equal(r.profile[2], 1500);
  assert.ok(r.profile[1] < 6500,
    `descent should have started in leg 1, profile[1]=${r.profile[1]}`);
});

// ── Regression for PR #45: resolver phaseDist matches per-leg sum ─────────
test("resolver safePhase ≈ Σ legPlans DESCIDA dist (alt-corrected)", () => {
  // Multi-leg descent through two inherit WPs.
  const flight = makeFlight({ cruiseAlt: 7000 });
  const cps = [
    makeOrigin({ useCruiseAlt: true }),
    makeCP({ name: "WP1", alt: null, useCruiseAlt: false, dist: 8 }),
    makeCP({ name: "WP2", alt: null, useCruiseAlt: false, dist: 8 }),
    makeCP({ name: "WP3", alt: 2000, useCruiseAlt: false, dist: 14 }),
  ];
  const r = P.resolveAltitudeProfile(cps, ac, flight);
  // Sum DESCIDA across all leg plans.
  let descSum = 0;
  for (const k of Object.keys(r.legPlans)) {
    descSum += phaseDistSum(r.legPlans[k], "DESCIDA");
  }
  // Compute the segment's expected phaseDist the same way the resolver does.
  // altDiff=5000, avgAlt=4500, descTas=correctTAS(90, 4500)=99 → phaseDist
  // = 99·(5000/500)/60 = 16.5 NM. The realised sum should match within 0.1.
  assert.ok(descSum > 14 && descSum < 19,
    `sum of DESCIDA = ${descSum.toFixed(2)} (expected ~16.5)`);
  // And no spurious altWarnings since the segment fits comfortably.
  assert.equal(r.altWarnings[3], null);
});

// ── Regression for PR #43: single TOD across inherit chain ────────────────
test("inherit chain of 3 WPs → monotonic descent, contiguous phase regions", () => {
  // origin 7000 → 3 inherit WPs → terminal 1500.
  const flight = makeFlight({ cruiseAlt: 7000 });
  const cps = [
    makeOrigin({ useCruiseAlt: true }),
    makeCP({ name: "A", alt: null, useCruiseAlt: false, dist: 5 }),
    makeCP({ name: "B", alt: null, useCruiseAlt: false, dist: 5 }),
    makeCP({ name: "C", alt: null, useCruiseAlt: false, dist: 5 }),
    makeCP({ name: "D", alt: 1500, useCruiseAlt: false, dist: 5 }),
  ];
  const r = P.resolveAltitudeProfile(cps, ac, flight);
  assert.equal(r.profile[0], 7000);
  assert.equal(r.profile[4], 1500);
  // Strictly non-increasing (no zig-zag).
  for (let i = 1; i < r.profile.length; i++) {
    assert.ok(r.profile[i] <= r.profile[i - 1] + 1,
      `profile not monotonic at i=${i}: ${r.profile[i]} > ${r.profile[i-1]}`);
  }
  // Region B (DESCIDA) appears in legPlans contiguously: once a leg has only
  // CRUZEIRO portions (region C, trailing buffer), every subsequent leg in
  // the segment must also be C-only — i.e. no DESCIDA after a buffer cruise.
  let sawTrailingOnly = false;
  for (let lk = 1; lk <= 4; lk++) {
    const lp = r.legPlans[lk];
    if (!lp) continue;
    const hasDescent = lp.some((p) => p.phase === "DESCIDA");
    if (sawTrailingOnly) {
      assert.ok(!hasDescent,
        `leg ${lk} re-enters DESCIDA after buffer started`);
    }
    if (!hasDescent && lp.every((p) => p.phase === "CRUZEIRO")) {
      sawTrailingOnly = true;
    }
  }
});

// ── before_min uses gsLevel at segToAlt ───────────────────────────────────
test("before_min buffer NM uses cruise GS at segToAlt, not segFromAlt", () => {
  // No wind so gsLevel = correctTAS(110, segToAlt).
  // segToAlt=1500 → tasLevel = round(110·1.03) = 113. wantBefore = 5·113/60 = 9.42.
  // segFromAlt=7000 → tasLevel would have been correctTAS(110, 7000) = 125,
  //   giving wantBefore = 10.42 (wrong). The resolver must use segToAlt.
  const flight = makeFlight({ cruiseAlt: 7000 });
  const cps = [
    makeOrigin({ useCruiseAlt: true }),
    makeCP({ name: "MID", alt: null, useCruiseAlt: false, dist: 20 }),
    makeCP({
      name: "DEST",
      alt: 1500,
      useCruiseAlt: false,
      dist: 20,
      arrivalMode: "before_min",
      arrivalValue: 5,
    }),
  ];
  const r = P.resolveAltitudeProfile(cps, ac, flight);
  // The trailing buffer must end up with at least one leg having CRUZEIRO
  // dist > 8 (close to 9.4) and not 10+. Sum of trailing CRUZEIRO across the
  // last leg(s) should be near 9.4.
  let trailingCruise = 0;
  for (const k of Object.keys(r.legPlans)) {
    // Trailing buffer = last contiguous CRUZEIRO portions in the leg.
    const lp = r.legPlans[k];
    for (let i = lp.length - 1; i >= 0; i--) {
      if (lp[i].phase === "CRUZEIRO") trailingCruise += lp[i].dist;
      else break;
    }
  }
  assert.ok(nearly(trailingCruise, 9.4, 0.5),
    `trailing buffer = ${trailingCruise.toFixed(2)}, expected ~9.4`);
});

// ── Impossible descent emits warning ──────────────────────────────────────
test("impossible descent → altWarnings flags the deficit", () => {
  // 10000→1500 in 5 NM is impossible at 500 fpm + ~98 kt.
  const flight = makeFlight({ cruiseAlt: 10000 });
  const cps = [
    makeOrigin({ useCruiseAlt: true }),
    makeCP({ alt: 1500, useCruiseAlt: false, dist: 5 }),
  ];
  const r = P.resolveAltitudeProfile(cps, ac, flight);
  assert.ok(r.altWarnings[1], "expected an altWarning");
  assert.match(r.altWarnings[1], /impossível/);
});

// ── Buffer reduced (clamped) → "Buffer reduzido" warning, NOT "impossível" ─
test("clamped buffer → 'Buffer reduzido' warning, not 'impossível'", () => {
  // altDiff=2500 from 4500→2000, avg 3250 → phaseDist≈8.0 NM ≤ totalSegDist=10.
  // arrivalValue=5 min × gsLevel(2000)≈114 → wantBefore≈9.5 NM > 10−8 = 2 NM.
  // Expect: phase fits, but buffer is clamped → "Buffer reduzido" warning.
  const flight = makeFlight({ cruiseAlt: 4500 });
  const cps = [
    makeOrigin({ useCruiseAlt: true }),
    makeCP({ name: "MID", alt: null, useCruiseAlt: false, dist: 5 }),
    makeCP({
      name: "DEST",
      alt: 2000,
      useCruiseAlt: false,
      dist: 5,
      arrivalMode: "before_min",
      arrivalValue: 5,
    }),
  ];
  const r = P.resolveAltitudeProfile(cps, ac, flight);
  assert.ok(r.altWarnings[2], "expected a Buffer reduzido warning");
  assert.match(r.altWarnings[2], /Buffer reduzido/);
  assert.doesNotMatch(r.altWarnings[2], /impossível/);
});

// ── Trailing inherit after the last anchor inherits ahead ─────────────────
test("trailing inherit WPs after last anchor get the last anchor's alt", () => {
  // No anchor after the last inherit WP — should fill with previous alt.
  const flight = makeFlight({ cruiseAlt: 7000 });
  const cps = [
    makeOrigin({ alt: 2700 }),
    makeCP({ name: "X", alt: 4000, useCruiseAlt: false, dist: 10 }),
    makeCP({ name: "TRAIL", alt: null, useCruiseAlt: false, dist: 10 }),
  ];
  const r = P.resolveAltitudeProfile(cps, ac, flight);
  assert.equal(r.profile[2], 4000);
});
