# navlog — unit tests

Pure-math validation for the flight-planning pipeline. Covers the same
functions used in `index.html` (now relocated to `lib/planning.js`).

## Run

```sh
node --test tests/*.test.js
```

For verbose output:

```sh
node --test --test-reporter=spec tests/*.test.js
```

No npm dependencies — uses Node's built-in `node:test` runner (Node 18+).

## Coverage

- `calcLeg.test.js` — wind triangle: head/tailwind, crosswind, variation,
  deviation, zero-TAS edge.
- `correctTAS.test.js` — sea-level identity, altitude scaling, ISA dev.
- `computeLegPhases.test.js` — every climb/descent mode (`asap`, `at_fix`,
  `before_nm`, `before_min`), boundary cases, sum invariant
  (`Σ portions[i].dist === leg dist`), 0-NM portion filter.
- `resolveAltitudeProfile.test.js` — explicit regressions for PRs:
  - **#42** descent push-back across inherit WPs.
  - **#43** continuous-phase profile (single TOD across an inherit chain,
    monotonic alt, no DESCIDA after buffer cruise).
  - **#45** resolver `phaseDist` matches sum of per-leg `DESCIDA.dist`
    (alt-corrected `vDescent`).
  - `before_min` buffer uses `gsLevel(segToAlt)`, not segFromAlt.
  - Impossible descent / clamped buffer warnings.
- `validateLeg.test.js` — semantic checks (TC range, dist ≤ 0, GS bounds, ETE).
- `geo.test.js` — `gcDist`/`gcTC`/`projectDest` round-trips, `gcInterpolate`,
  `gcIntersection`.
- `time.test.js` — `parseHHMM`/`formatHHMM`/`formatHHMMSS` round-trips,
  24h wrap, malformed input.
- `affine.test.js` — calibration transform identity, scale+translate,
  inverse, collinear/degenerate edge cases.
- `themes.test.js` — structural shape of the night/day/red palettes
  (every theme exposes the same Tailwind-class keys).
- `fleet.test.js` — structural shape of the five built-in aircraft
  profiles (perf and fuel numbers present, positive, ordered).
- `feedback.test.js` — `haptic`/`warmUpAudio`/`playAlarm` no-op
  cleanly under Node's missing `navigator.vibrate` / `AudioContext`.
- `components-audit.test.js` — static audit of every
  `app/components/*.jsx`. Catches the failure modes that recurred
  through the esm.sh migration:
    1. JSX element `<Foo />` referenced but not imported / local
    2. bare call to a `main.jsx` top-level helper that's invisible
       once the component lives in its own ES module
    3. data reference (`themes`, `FLEET_DEFAULTS`, `APP_VERSION`,
       …) that crosses module scope
    4. top-level reassignment (`Foo = React.memo(Foo)`) whose
       function moved out but the wrapper got left behind
  Pure regex, zero npm deps. Strips line comments first so a stray
  `lib/*` token doesn't trick the block-comment matcher.

## Adding tests

The functions under test live in `../lib/planning.js` (CommonJS export).
Use `tests/helpers.js` for `makeAC()`, `makeFlight()`, `makeCP()`, `nearly()`,
`phaseDistSum()`, `totalDist()`. Aircraft defaults are PA-28-class with round
numbers (ROC=500, ROD=500, vy=80, vDescent=90, tasCruise=110) so expected
values are easy to compute by hand.
