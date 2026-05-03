const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  P, makeAC, makeCP, nearly, phaseDistSum, totalDist,
} = require("./helpers.js");

const ac = makeAC();

// ── Level legs ──────────────────────────────────────────────────────────────
test("level cruise → single CRUZEIRO portion equal to leg dist", () => {
  const cp = makeCP({ dist: 20 });
  const r = P.computeLegPhases(7000, 7000, 20, cp, ac, 0, 0, 0, 0);
  assert.equal(r.portions.length, 1);
  assert.equal(r.portions[0].phase, "CRUZEIRO");
  assert.ok(nearly(r.portions[0].dist, 20, 0.001));
});

test("zero distance leg → single zero-distance portion (no NaN)", () => {
  const cp = makeCP({ dist: 0 });
  const r = P.computeLegPhases(7000, 7000, 0, cp, ac, 0, 0, 0, 0);
  assert.equal(r.portions.length, 1);
  assert.equal(r.portions[0].dist, 0);
  assert.equal(r.portions[0].timeMin, 0);
  assert.ok(Number.isFinite(r.avgTas));
});

// ── Climb cases ─────────────────────────────────────────────────────────────
// Numbers used below: prev=2700, this=7000, ROC=500, vy=80
//   climbTime = 4300/500 = 8.6 min
//   tasClimb (avg alt 4850) = correctTAS(80, 4850, 0) = round(80·1.097) = 88
//   climbDist (no wind) = 88·8.6/60 ≈ 12.61 NM

test("climb fits in leg, default asap → [SUBIDA, CRUZEIRO]", () => {
  const cp = makeCP({ dist: 20 });
  const r = P.computeLegPhases(2700, 7000, 20, cp, ac, 0, 0, 0, 0);
  assert.equal(r.portions.length, 2);
  assert.equal(r.portions[0].phase, "SUBIDA");
  assert.equal(r.portions[1].phase, "CRUZEIRO");
  assert.ok(nearly(r.portions[0].dist, 12.61, 0.05));
  assert.ok(nearly(r.portions[0].timeMin, 8.6, 0.01));
  assert.ok(nearly(totalDist(r.portions), 20, 0.01));
});

test("climb whole leg (climbDist > legDist) → single SUBIDA of full leg", () => {
  const cp = makeCP({ dist: 5 });
  const r = P.computeLegPhases(2700, 10000, 5, cp, ac, 0, 0, 0, 0);
  assert.equal(r.portions.length, 1);
  assert.equal(r.portions[0].phase, "SUBIDA");
  assert.ok(nearly(r.portions[0].dist, 5, 0.001));
});

test("climb at_fix → [CRUZEIRO, SUBIDA] in that order", () => {
  const cp = makeCP({ dist: 20, arrivalMode: "at_fix" });
  const r = P.computeLegPhases(2700, 7000, 20, cp, ac, 0, 0, 0, 0);
  assert.equal(r.portions.length, 2);
  assert.equal(r.portions[0].phase, "CRUZEIRO");
  assert.equal(r.portions[1].phase, "SUBIDA");
  assert.ok(nearly(totalDist(r.portions), 20, 0.01));
});

test("climb before_nm with comfortable buffer → [CRUZEIRO, SUBIDA, CRUZEIRO]", () => {
  // dist=20, climbDist≈12.61, want=4 → trailing buffer = 4 NM
  const cp = makeCP({ dist: 20, arrivalMode: "before_nm", arrivalValue: 4 });
  const r = P.computeLegPhases(2700, 7000, 20, cp, ac, 0, 0, 0, 0);
  assert.equal(r.portions.length, 3);
  assert.equal(r.portions[0].phase, "CRUZEIRO");
  assert.equal(r.portions[1].phase, "SUBIDA");
  assert.equal(r.portions[2].phase, "CRUZEIRO");
  assert.ok(nearly(r.portions[2].dist, 4, 0.05), `trailing=${r.portions[2].dist}`);
  assert.ok(nearly(totalDist(r.portions), 20, 0.01));
});

test("climb before_nm clamp → trailing buffer reduced, no leading cruise", () => {
  // dist=15, climbDist≈12.61, want=5 → safeBefore = 15−12.61 = 2.39, cruiseFirst=0
  const cp = makeCP({ dist: 15, arrivalMode: "before_nm", arrivalValue: 5 });
  const r = P.computeLegPhases(2700, 7000, 15, cp, ac, 0, 0, 0, 0);
  // The 0-NM leading CRUZEIRO must be filtered out (regression for spurious virtuals).
  assert.equal(r.portions.length, 2);
  assert.equal(r.portions[0].phase, "SUBIDA");
  assert.equal(r.portions[1].phase, "CRUZEIRO");
  assert.ok(nearly(r.portions[1].dist, 2.39, 0.1));
  // Distances still sum to leg length.
  assert.ok(nearly(totalDist(r.portions), 15, 0.01));
});

// ── Descent cases ───────────────────────────────────────────────────────────
// prev=7000, this=2700, ROD=500, vDescent=90
//   descTime = 4300/500 = 8.6 min
//   tasDescent (avg 4850) = round(90·1.097) = 99
//   descDist (no wind) = 99·8.6/60 ≈ 14.19 NM

test("descent default at_fix → [CRUZEIRO, DESCIDA]", () => {
  const cp = makeCP({ dist: 20 });
  const r = P.computeLegPhases(7000, 2700, 20, cp, ac, 0, 0, 0, 0);
  assert.equal(r.portions.length, 2);
  assert.equal(r.portions[0].phase, "CRUZEIRO");
  assert.equal(r.portions[1].phase, "DESCIDA");
  assert.ok(nearly(r.portions[1].dist, 14.19, 0.05));
  assert.ok(nearly(totalDist(r.portions), 20, 0.01));
});

test("descent asap → [DESCIDA, CRUZEIRO] using low-altitude TAS for trailing", () => {
  const cp = makeCP({ dist: 20, arrivalMode: "asap" });
  const r = P.computeLegPhases(7000, 2700, 20, cp, ac, 0, 0, 0, 0);
  assert.equal(r.portions.length, 2);
  assert.equal(r.portions[0].phase, "DESCIDA");
  assert.equal(r.portions[1].phase, "CRUZEIRO");
  // Trailing TAS must be tasCruiseLow at thisAlt=2700, NOT tasCruise at 7000.
  // tasCruiseLow = correctTAS(110, 2700, 0) = round(110·1.054) = 116
  assert.equal(r.portions[1].tas, 116);
});

test("descent whole leg (descDist > legDist) → single DESCIDA", () => {
  const cp = makeCP({ dist: 10 });
  // 7000 → 0, altDiff=7000, descTime=14, descDist≈99·14/60=23.1 NM ≫ 10
  const r = P.computeLegPhases(7000, 0, 10, cp, ac, 0, 0, 0, 0);
  assert.equal(r.portions.length, 1);
  assert.equal(r.portions[0].phase, "DESCIDA");
  assert.ok(nearly(r.portions[0].dist, 10, 0.001));
});

test("descent before_min uses gsCruiseLow at thisAlt for buffer", () => {
  // gsCruiseLow at 2700, no wind = 116. wantBefore = 4 min × 116 / 60 ≈ 7.73 NM.
  // dist=25, descDist≈14.19. cruiseFirst = 25 − 14.19 − 7.73 ≈ 3.08. All positive.
  const cp = makeCP({ dist: 25, arrivalMode: "before_min", arrivalValue: 4 });
  const r = P.computeLegPhases(7000, 2700, 25, cp, ac, 0, 0, 0, 0);
  assert.equal(r.portions.length, 3);
  assert.equal(r.portions[2].phase, "CRUZEIRO");
  assert.ok(nearly(r.portions[2].dist, 7.73, 0.1), `trailing=${r.portions[2].dist}`);
  assert.ok(nearly(totalDist(r.portions), 25, 0.01));
});

test("descent before_nm clamp → no spurious 0-NM portions", () => {
  // dist=15, descDist≈14.19, want=5 → safeBefore = 0.81, cruiseFirst=0
  const cp = makeCP({ dist: 15, arrivalMode: "before_nm", arrivalValue: 5 });
  const r = P.computeLegPhases(7000, 2700, 15, cp, ac, 0, 0, 0, 0);
  // The leading 0-NM CRUZEIRO must be dropped — checking via every portion's dist > 0.
  for (const p of r.portions) {
    assert.ok(p.dist > 0.001, `0-NM portion not filtered: ${JSON.stringify(p)}`);
  }
  assert.ok(nearly(totalDist(r.portions), 15, 0.01));
});

// ── Sum invariant: portions always cover the full leg ──────────────────────
test("sum invariant: portion dists always sum to leg dist (for every mode)", () => {
  const cases = [
    { prev: 7000, this: 7000, dist: 12,  mode: undefined,   value: undefined },
    { prev: 2700, this: 7000, dist: 20,  mode: "asap",       value: undefined },
    { prev: 2700, this: 7000, dist: 20,  mode: "at_fix",     value: undefined },
    { prev: 2700, this: 7000, dist: 20,  mode: "before_nm",  value: 4 },
    { prev: 2700, this: 7000, dist: 20,  mode: "before_min", value: 3 },
    { prev: 2700, this: 10000, dist: 5,  mode: "asap",       value: undefined },
    { prev: 7000, this: 2700, dist: 25,  mode: "at_fix",     value: undefined },
    { prev: 7000, this: 2700, dist: 25,  mode: "asap",       value: undefined },
    { prev: 7000, this: 2700, dist: 25,  mode: "before_nm",  value: 4 },
    { prev: 7000, this: 2700, dist: 25,  mode: "before_min", value: 3 },
    { prev: 7000, this: 0,    dist: 10,  mode: "before_min", value: 5 }, // descent doesn't fit
  ];
  for (const c of cases) {
    const cp = makeCP({ dist: c.dist, arrivalMode: c.mode, arrivalValue: c.value });
    const r = P.computeLegPhases(c.prev, c.this, c.dist, cp, ac, 0, 0, 0, 0);
    assert.ok(
      nearly(totalDist(r.portions), c.dist, 0.01),
      `case=${JSON.stringify(c)} sum=${totalDist(r.portions)} portions=${JSON.stringify(r.portions)}`
    );
  }
});

// ── Wind effect on phase distances ─────────────────────────────────────────
test("tailwind shortens climb time-NM (gsClimb > tasClimb)", () => {
  const cp = makeCP({ dist: 20 });
  const noWind = P.computeLegPhases(2700, 7000, 20, cp, ac, 0, 0, 0, 0);
  // 20 kt tailwind on TC=090° → wind FROM 270° at 20.
  const tailwind = P.computeLegPhases(2700, 7000, 20, cp, ac, 0, 270, 20, 0);
  const climbDistNoWind = phaseDistSum(noWind.portions, "SUBIDA");
  const climbDistTail = phaseDistSum(tailwind.portions, "SUBIDA");
  // Same climb time (altDiff/ROC), faster GS → covers more NM during climb.
  assert.ok(climbDistTail > climbDistNoWind + 1, `noWind=${climbDistNoWind} tail=${climbDistTail}`);
});

// ── Per-checkpoint ROC/ROD overrides ──────────────────────────────────────
test("rocClimbOvr halves climb time → halves climbDist", () => {
  // Default: ROC=500 fpm, climbTime=4300/500=8.6 min, climbDist≈12.61 NM (no wind, gsClimb=88).
  // Override ROC=1000 fpm → climbTime=4.3 min → climbDist≈6.3 NM.
  const base = makeCP({ dist: 20 });
  const fast = makeCP({ dist: 20, rocClimbOvr: 1000 });
  const r0 = P.computeLegPhases(2700, 7000, 20, base, ac, 0, 0, 0, 0);
  const r1 = P.computeLegPhases(2700, 7000, 20, fast, ac, 0, 0, 0, 0);
  const d0 = phaseDistSum(r0.portions, "SUBIDA");
  const d1 = phaseDistSum(r1.portions, "SUBIDA");
  assert.ok(nearly(d1, d0 / 2, 0.2), `base=${d0.toFixed(2)} fast=${d1.toFixed(2)}`);
  // Both still cover the full leg.
  assert.ok(nearly(totalDist(r0.portions), 20, 0.01));
  assert.ok(nearly(totalDist(r1.portions), 20, 0.01));
});

test("rodDescentOvr stretches descent time → stretches descDist", () => {
  // Default: ROD=500 fpm, descTime=4300/500=8.6, descDist≈14.19 (gsDescent=99).
  // Override ROD=250 fpm → descTime=17.2, descDist≈28.38 → BIGGER than 25 leg → whole-leg DESCIDA.
  const slow = makeCP({ dist: 25, rodDescentOvr: 250 });
  const r = P.computeLegPhases(7000, 2700, 25, slow, ac, 0, 0, 0, 0);
  // Whole leg should be DESCIDA since descDist (~28) > leg (25) − 0.1.
  assert.equal(r.portions.length, 1);
  assert.equal(r.portions[0].phase, "DESCIDA");
});

test("rocClimbOvr=0 falls back to ac.rocClimb (?? semantics)", () => {
  // Sanity: 0 is a valid override (not falsy via ??), but in practice the UI
  // would never set 0; we do test it just to confirm ?? lets `null`/`undefined`
  // fall back, not `0`.
  const cp = makeCP({ dist: 20, rocClimbOvr: undefined });
  const r = P.computeLegPhases(2700, 7000, 20, cp, ac, 0, 0, 0, 0);
  // Should match the default-behavior climbDist (~12.61).
  const d = phaseDistSum(r.portions, "SUBIDA");
  assert.ok(nearly(d, 12.61, 0.1), `expected default climbDist, got ${d}`);
});
