// Tests for the pure helpers in lib/airac.js:
//   - syncAirportCheckpoint  → pin ORIG/DEST waypoint to an AIRAC airport
//   - pickProcedureLegs      → build ordered leg list for a SID/STAR/APP
//   - legToCheckpoint        → AIRAC leg → navlog checkpoint shape
//
// The HTTP entry points (airacGetCurrent / airacSearch / airacAirport /
// airacProcedures / airacProcedureDetail) are not exercised here — they
// hit fetch() and localStorage, both unavailable in node:test without
// shims. Keep this file pure.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const A = require("../lib/airac.js");

// ── syncAirportCheckpoint ────────────────────────────────────────────────────

test("syncAirportCheckpoint origin: empty checkpoints → adds an origin CP", () => {
  const flight = { checkpoints: [] };
  const ap = { latitude: 38.7813, longitude: -9.1359, elevation_ft: 374 };
  const out = A.syncAirportCheckpoint(flight, "origin", "LPPT", ap);

  assert.equal(out.origin, "LPPT");
  assert.equal(out.checkpoints.length, 1);
  const cp = out.checkpoints[0];
  assert.equal(cp.name, "LPPT");
  assert.equal(cp.isOrigin, true);
  assert.equal(cp.lat, 38.7813);
  assert.equal(cp.lon, -9.1359);
  assert.equal(cp.alt, 374);
  assert.equal(cp.dist, 0);
});

test("syncAirportCheckpoint origin: with existing CPs updates cps[0] in place", () => {
  const flight = {
    checkpoints: [
      { name: "OLD", lat: 0, lon: 0, alt: 100, isOrigin: true },
      { name: "WP1", lat: 38, lon: -9 },
    ],
  };
  const ap = { latitude: 38.78, longitude: -9.13, elevation_ft: 374 };
  const out = A.syncAirportCheckpoint(flight, "origin", "LPPT", ap);

  assert.equal(out.checkpoints.length, 2);
  assert.equal(out.checkpoints[0].name, "LPPT");
  assert.equal(out.checkpoints[0].lat, 38.78);
  assert.equal(out.checkpoints[0].lon, -9.13);
  assert.equal(out.checkpoints[0].alt, 374);
  assert.equal(out.checkpoints[1].name, "WP1");
});

test("syncAirportCheckpoint origin: ap=null clears coords but keeps name", () => {
  const flight = { checkpoints: [{ name: "OLD", lat: 1, lon: 2, alt: 50, isOrigin: true }] };
  const out = A.syncAirportCheckpoint(flight, "origin", "ZZZZ", null);

  assert.equal(out.checkpoints[0].name, "ZZZZ");
  assert.equal(out.checkpoints[0].lat, null);
  assert.equal(out.checkpoints[0].lon, null);
  // alt preserved because elevation_ft is missing (no ap)
  assert.equal(out.checkpoints[0].alt, 50);
});

test("syncAirportCheckpoint origin: ap without elevation_ft preserves existing alt", () => {
  const flight = { checkpoints: [{ name: "X", lat: 0, lon: 0, alt: 222, isOrigin: true }] };
  const ap = { latitude: 10, longitude: 20 }; // no elevation_ft
  const out = A.syncAirportCheckpoint(flight, "origin", "AAAA", ap);

  assert.equal(out.checkpoints[0].alt, 222);
  assert.equal(out.checkpoints[0].lat, 10);
});

test("syncAirportCheckpoint destination: empty CPs pushes new dest", () => {
  const flight = { checkpoints: [] };
  const ap = { latitude: 41, longitude: -8, elevation_ft: 250 };
  const out = A.syncAirportCheckpoint(flight, "destination", "LPPR", ap);

  assert.equal(out.destination, "LPPR");
  assert.equal(out.checkpoints.length, 1);
  assert.equal(out.checkpoints[0].name, "LPPR");
  assert.equal(out.checkpoints[0].alt, 250);
  assert.equal(out.checkpoints[0].lat, 41);
});

test("syncAirportCheckpoint destination: only origin existing → pushes new dest", () => {
  const flight = { checkpoints: [{ name: "LPPT", isOrigin: true, lat: 38, lon: -9, alt: 374 }] };
  const ap = { latitude: 41, longitude: -8, elevation_ft: 250 };
  const out = A.syncAirportCheckpoint(flight, "destination", "LPPR", ap);

  assert.equal(out.checkpoints.length, 2);
  assert.equal(out.checkpoints[0].isOrigin, true);
  assert.equal(out.checkpoints[1].name, "LPPR");
  assert.equal(out.checkpoints[1].lat, 41);
});

test("syncAirportCheckpoint destination: multi-CP route updates the last one", () => {
  const flight = {
    checkpoints: [
      { name: "LPPT", isOrigin: true },
      { name: "WP1", lat: 39, lon: -9 },
      { name: "OLD_DEST", lat: 40, lon: -8, alt: 100 },
    ],
  };
  const ap = { latitude: 41, longitude: -8.5, elevation_ft: 250 };
  const out = A.syncAirportCheckpoint(flight, "destination", "LPPR", ap);

  assert.equal(out.checkpoints.length, 3);
  assert.equal(out.checkpoints[2].name, "LPPR");
  assert.equal(out.checkpoints[2].lat, 41);
  assert.equal(out.checkpoints[2].alt, 250);
  // WP1 untouched
  assert.equal(out.checkpoints[1].name, "WP1");
});

test("syncAirportCheckpoint: input flight is not mutated", () => {
  const flight = { checkpoints: [{ name: "OLD", lat: 0, lon: 0, isOrigin: true }] };
  const before = JSON.parse(JSON.stringify(flight));
  A.syncAirportCheckpoint(flight, "origin", "NEW", { latitude: 50, longitude: 5 });
  assert.deepEqual(flight, before);
});

test("syncAirportCheckpoint: input checkpoints array is not mutated", () => {
  const cps = [{ name: "OLD", lat: 0, lon: 0, isOrigin: true }];
  const flight = { checkpoints: cps };
  A.syncAirportCheckpoint(flight, "origin", "NEW", { latitude: 50, longitude: 5 });
  assert.equal(cps[0].name, "OLD");
  assert.equal(cps[0].lat, 0);
});

// ── pickProcedureLegs ────────────────────────────────────────────────────────

function leg(seq, fix, extras) {
  return Object.assign({ sequence: seq, fix_identifier: fix }, extras || {});
}

test("pickProcedureLegs: null detail → empty array", () => {
  assert.deepEqual(A.pickProcedureLegs(null, "X", "SID"), []);
});

test("pickProcedureLegs: SID no transition → just common_route sorted", () => {
  const detail = {
    common_route: [leg(2, "B"), leg(1, "A"), leg(3, "C")],
    transitions: {},
  };
  const out = A.pickProcedureLegs(detail, null, "SID");
  assert.deepEqual(out.map(l => l.fix_identifier), ["A", "B", "C"]);
});

test("pickProcedureLegs: SID with fix transition → common + transition", () => {
  const detail = {
    common_route: [leg(1, "DEP"), leg(2, "FIX1")],
    transitions: { USITO: [leg(1, "USITO"), leg(2, "EXIT")] },
  };
  const out = A.pickProcedureLegs(detail, "USITO", "SID");
  assert.deepEqual(out.map(l => l.fix_identifier), ["DEP", "FIX1", "USITO", "EXIT"]);
});

test("pickProcedureLegs: APP with transition → transition + common (arrival order)", () => {
  const detail = {
    common_route: [leg(1, "IAF"), leg(2, "FAP"), leg(3, "RWY")],
    transitions: { OXLAR: [leg(1, "OXLAR"), leg(2, "IAF")] },
  };
  const out = A.pickProcedureLegs(detail, "OXLAR", "APP");
  // OXLAR + IAF (dup collapsed) → then common's IAF would dup with prior → collapsed
  // transitionLegs: OXLAR, IAF;  commonLegs: IAF, FAP, RWY
  // concat: OXLAR, IAF, IAF, FAP, RWY → after dup collapse: OXLAR, IAF, FAP, RWY
  assert.deepEqual(out.map(l => l.fix_identifier), ["OXLAR", "IAF", "FAP", "RWY"]);
});

test("pickProcedureLegs: STAR uses common-first ordering like SID", () => {
  const detail = {
    common_route: [leg(1, "ENTRY"), leg(2, "FIX")],
    transitions: { CASPER: [leg(1, "TRANS1"), leg(2, "TRANS2")] },
  };
  const out = A.pickProcedureLegs(detail, "CASPER", "STAR");
  assert.deepEqual(out.map(l => l.fix_identifier), ["ENTRY", "FIX", "TRANS1", "TRANS2"]);
});

test("pickProcedureLegs: runway transition 'RW35B' → runway_transitions['35B']", () => {
  const detail = {
    common_route: [leg(1, "C1")],
    runway_transitions: { "35B": [leg(1, "RWY_LEG"), leg(2, "AFTER")] },
    transitions: {},
  };
  const out = A.pickProcedureLegs(detail, "RW35B", "SID");
  assert.deepEqual(out.map(l => l.fix_identifier), ["C1", "RWY_LEG", "AFTER"]);
});

test("pickProcedureLegs: lowercase 'rw' prefix also resolves runway transitions", () => {
  const detail = {
    common_route: [],
    runway_transitions: { "09": [leg(1, "X"), leg(2, "Y")] },
  };
  const out = A.pickProcedureLegs(detail, "rw09", "SID");
  assert.deepEqual(out.map(l => l.fix_identifier), ["X", "Y"]);
});

test("pickProcedureLegs: missing transitions key → falls back to common only", () => {
  const detail = {
    common_route: [leg(1, "X"), leg(2, "Y")],
    // no transitions, no runway_transitions
  };
  const out = A.pickProcedureLegs(detail, "DOESNOTEXIST", "SID");
  assert.deepEqual(out.map(l => l.fix_identifier), ["X", "Y"]);
});

test("pickProcedureLegs: consecutive duplicate fix_identifier collapsed", () => {
  const detail = {
    common_route: [leg(1, "A"), leg(2, "B"), leg(3, "B"), leg(4, "C")],
  };
  const out = A.pickProcedureLegs(detail, null, "SID");
  assert.deepEqual(out.map(l => l.fix_identifier), ["A", "B", "C"]);
});

test("pickProcedureLegs: missing common_route → empty (no transition)", () => {
  assert.deepEqual(A.pickProcedureLegs({}, null, "SID"), []);
});

// ── legToCheckpoint ──────────────────────────────────────────────────────────

test("legToCheckpoint: no fix_coordinates → null", () => {
  assert.equal(A.legToCheckpoint({ fix_identifier: "X", sequence: 1 }, {}, "SID"), null);
});

test("legToCheckpoint: missing lat in fix_coordinates → null", () => {
  assert.equal(
    A.legToCheckpoint({ fix_coordinates: { lon: 0 }, fix_identifier: "X" }, {}, "SID"),
    null,
  );
});

test("legToCheckpoint: coords rounded to 6 decimal places", () => {
  const cp = A.legToCheckpoint({
    fix_identifier: "X",
    fix_coordinates: { lat: 38.123456789, lon: -9.987654321 },
    sequence: 1,
  }, { kind: "sid" }, "SID");
  assert.equal(cp.lat, 38.123457);
  assert.equal(cp.lon, -9.987654);
});

test("legToCheckpoint: name uppercased and truncated to 10 chars", () => {
  const cp = A.legToCheckpoint({
    fix_identifier: "longishname_will_truncate",
    fix_coordinates: { lat: 0, lon: 0 },
    sequence: 1,
  }, {}, "SID");
  assert.equal(cp.name, "LONGISHNAM");
});

test("legToCheckpoint: name falls back to fix_name then 'PT'", () => {
  const a = A.legToCheckpoint({
    fix_name: "via_name", fix_coordinates: { lat: 0, lon: 0 }, sequence: 1,
  }, {}, "SID");
  assert.equal(a.name, "VIA_NAME");

  const b = A.legToCheckpoint({
    fix_coordinates: { lat: 0, lon: 0 }, sequence: 1,
  }, {}, "SID");
  assert.equal(b.name, "PT");
});

test("legToCheckpoint: source receives the leg sequence field", () => {
  const src = { kind: "sid", procedure: "LISBON1A" };
  const cp = A.legToCheckpoint({
    fix_identifier: "WP",
    fix_coordinates: { lat: 0, lon: 0 },
    sequence: 42,
  }, src, "SID");
  assert.equal(cp.source.kind, "sid");
  assert.equal(cp.source.procedure, "LISBON1A");
  assert.equal(cp.source.sequence, 42);
});

test("legToCheckpoint: altitude_ft sets cp.alt and unsets useCruiseAlt", () => {
  const cp = A.legToCheckpoint({
    fix_identifier: "WP",
    fix_coordinates: { lat: 0, lon: 0 },
    sequence: 1,
    altitude_ft: 5000,
  }, {}, "STAR");
  assert.equal(cp.alt, 5000);
  assert.equal(cp.useCruiseAlt, false);
});

test("legToCheckpoint: no altitude_ft → no cp.alt", () => {
  const cp = A.legToCheckpoint({
    fix_identifier: "WP",
    fix_coordinates: { lat: 0, lon: 0 },
    sequence: 1,
  }, {}, "SID");
  assert.equal(cp.alt, undefined);
});

test("legToCheckpoint: altitude_restriction='at_or_above' → arrivalMode='asap'", () => {
  const cp = A.legToCheckpoint({
    fix_identifier: "WP",
    fix_coordinates: { lat: 0, lon: 0 },
    sequence: 1,
    altitude_restriction: "at_or_above",
    altitude_ft: 5000,
  }, {}, "STAR");
  assert.equal(cp.arrivalMode, "asap");
});

test("legToCheckpoint: altitude_restriction='at_or_below' → arrivalMode='at_fix'", () => {
  const cp = A.legToCheckpoint({
    fix_identifier: "WP",
    fix_coordinates: { lat: 0, lon: 0 },
    sequence: 1,
    altitude_restriction: "at_or_below",
    altitude_ft: 5000,
  }, {}, "STAR");
  assert.equal(cp.arrivalMode, "at_fix");
});

test("legToCheckpoint: no restriction + altitude_ft on SID → arrivalMode='asap'", () => {
  const cp = A.legToCheckpoint({
    fix_identifier: "WP",
    fix_coordinates: { lat: 0, lon: 0 },
    sequence: 1,
    altitude_ft: 5000,
  }, {}, "SID");
  assert.equal(cp.arrivalMode, "asap");
});

test("legToCheckpoint: no restriction + altitude_ft on STAR → arrivalMode='at_fix'", () => {
  const cp = A.legToCheckpoint({
    fix_identifier: "WP",
    fix_coordinates: { lat: 0, lon: 0 },
    sequence: 1,
    altitude_ft: 5000,
  }, {}, "STAR");
  assert.equal(cp.arrivalMode, "at_fix");
});

test("legToCheckpoint: no restriction + no altitude_ft → no arrivalMode", () => {
  const cp = A.legToCheckpoint({
    fix_identifier: "WP",
    fix_coordinates: { lat: 0, lon: 0 },
    sequence: 1,
  }, {}, "SID");
  assert.equal(cp.arrivalMode, undefined);
});
