# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Navlog is a single-page PWA navlog (navigation log) for general-aviation pilots,
written in pt-BR. There is **no build step**: `index.html` is served as-is and
compiles its inline JSX in the browser via Babel standalone. Deployed to GitHub
Pages under `/navlog/`.

## Commands

```sh
# Run the full unit-test suite (Node 18+, no npm install needed)
node --test tests/*.test.js

# Verbose / pinpoint a single file
node --test --test-reporter=spec tests/calcLeg.test.js

# Local "dev server" — anything that serves the directory works
python3 -m http.server 8000     # then open http://localhost:8000
```

No `package.json`, no bundler, no linter. The test runner is Node's built-in
`node:test`. Tests import the planning module via `require("../lib/planning.js")`.

## Architecture

### The two-file split (and why)

- **`index.html`** (~9k lines) — the entire React app as one `<script type="text/babel">`
  block. Contains `NavlogApp`, all tab components (Setup / Em Voo / Combustível /
  Diário / Mapa), the waypoint editor wizard, the Leaflet map tab, PDF chart
  overlays, the AIRAC.net client, and the storage glue.
- **`lib/planning.js`** — *pure* flight-planning math: great-circle nav, wind
  triangle (`calcLeg`), TAS altitude correction, `computeLegPhases`,
  `resolveAltitudeProfile`, `estimatedPosition`, `applyDirectTo`/`clearDirectTo`,
  `bingoCheck`, time parsers, affine calibration helpers.
- **`lib/coords.js`** — pure coord parsing/formatting (DD, DDM, DMS, compact DDM).

`lib/*.js` files use a **UMD-style footer** so the same source is loaded
synchronously via `<script src="lib/planning.js">` (exposing every function as a
`window` global the Babel block consumes as bare names) **and** via
`require()` in Node tests. Do not break this dual-export pattern — keep the
files free of DOM, React, and JSX.

The Babel block in `index.html` documents which globals come from `lib/` with
comments like `// gcDist/gcTC/... are now defined in lib/planning.js`. When you
add or rename anything in `lib/`, update the `__NAVLOG_PLANNING__` /
`__NAVLOG_COORDS__` export object at the bottom and the matching comment in
`index.html`.

### Flight-planning pipeline (read this before touching `lib/planning.js`)

For each render, `NavlogApp.computed` (in `index.html`) runs this chain over
`flight.checkpoints`:

1. **Resolve TC/dist from coords** — when both endpoints have lat/lon, geometry
   overrides any stored `tc`/`dist`. Lat/lon is the source of truth.
2. **`resolveAltitudeProfile(cps, ac, flight)`** — assigns an altitude to every
   waypoint. WPs with `alt==null && !useCruiseAlt` *inherit* from the previous
   anchor. Multi-leg climbs/descents are treated as **one continuous profile**
   (segment regions: cruise → phase → buffer cruise), and the resolver
   pre-computes per-leg `portions` in `legPlans[legIdx]` so middle legs of a
   continuous descent stay single-phase (only the boundary legs carry TOC/TOD).
3. **`computeLegPhases(...)`** — used as a fallback when the resolver did not
   pre-plan that leg. Splits a single leg into SUBIDA/CRUZEIRO/DESCIDA portions
   honouring `cp.arrivalMode` (`asap` | `at_fix` | `before_nm` | `before_min`).
   Invariant: `Σ portions[i].dist === leg.dist`; 0-NM portions are filtered.
4. **`calcLeg`** — wind triangle (WCA, TH, MH, CH, GS, ETE) for each phase.
   `correctTAS` is applied per phase using the phase's average altitude.
5. **`liveRoute`** — expands `computed` by injecting virtual TOC/TOD/BOC/BOD
   waypoints at portion boundaries (with interpolated lat/lon). Virtuals have
   `isVirtual: true` and an `autoKey`.
6. **`estimatedPosition`** — single source of truth for the "where am I now"
   marker on the map. Walks `liveRoute` to find prev (ATA-marked) and next WP,
   handles **holds** (parks at hold anchor for the hold duration) and
   **active deviation / direct-to** (rides the corrected leg instead of the
   planned one). `bypassed` flags from `applyDirectTo` are respected.

Phase labels are Portuguese: **SUBIDA** (climb), **CRUZEIRO** (cruise),
**DESCIDA** (descent). Virtual WPs use English aviation conventions: **TOC**
(top of climb), **TOD** (top of descent), **BOC** (beginning of climb), **BOD**
(beginning of descent).

### State, storage, external services

- All persistent state is in `localStorage` under `navlog_*` keys (flight,
  routes, prefs, fleet). AIRAC responses cache under `airac_v1_*`.
- IndexedDB stores: `navlog_pdf_handles` (File System Access handles for PDF
  charts) and `navlog_userpts` (user-defined waypoint library).
- **AIRAC.net** (`https://airac.net/api/v1`) is queried for airport/procedure
  data; CORS open, no auth, cached aggressively per AIRAC cycle.
- **NOAA WMM** (`geomagnetism` from esm.sh) loads async; `getDecl()` returns
  null until `geomagready` fires, and the app falls back to `flight.variation`.
- External CDN deps (React 18, Tailwind, lucide-react, Babel standalone,
  Leaflet, PDF.js) are pre-cached by `sw.js`.

### Service worker

`sw.js` is cache-first for assets and lists every URL it pre-caches in `STATIC`.
**Bump `CACHE_NAME` (e.g. `navlog-v7` → `navlog-v8`) whenever you change any
cached file** (HTML, `lib/*.js`, manifest, or the pinned CDN versions) —
otherwise installed PWAs keep serving the old bundle.

## Conventions

- Commit messages follow conventional-commits style: `feat(scope): …`,
  `fix(scope): …`, `refactor(scope): …`, `perf(scope): …`, `chore(scope): …`,
  `revert: …`. PR numbers are referenced inline (`(#42)`).
- New planning math goes in `lib/planning.js` and gets a unit test in `tests/`.
  Use `tests/helpers.js` (`makeAC`, `makeFlight`, `makeCP`, `makeOrigin`,
  `nearly`, `phaseDistSum`, `totalDist`) — its PA-28-class defaults
  (ROC=500, ROD=500, vy=80, vDescent=90, tasCruise=110) are picked so expected
  values are hand-computable.
- The resolver's `phaseDist` and per-leg `DESCIDA.dist` must stay in lockstep
  (regression covered by `resolveAltitudeProfile.test.js`, see PR #45). When
  altering altitude-corrected TAS in one place, mirror it in the other.
- UI strings are in Brazilian Portuguese. Keep new copy consistent.
- The repo ships `navlog.jsx` and `patch_map.py` for historical reasons. They
  are **not** part of the running app — `index.html` is self-contained. Do not
  edit them expecting a runtime effect.
