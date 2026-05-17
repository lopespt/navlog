// Structural tests for lib/fleet.js. FLEET_DEFAULTS is the catalog of
// built-in aircraft profiles; main.jsx seeds the user's fleet from it on
// first launch and FleetManager uses it for the "Restaurar valores padrão"
// reset. Missing or malformed keys would silently break the planner because
// downstream math reads ac.tasCruise / ac.rocClimb / ac.gphCruise without
// defensive defaults.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { FLEET_DEFAULTS } = require("../lib/fleet.js");

test("FLEET_DEFAULTS: five built-in aircraft", () => {
  assert.deepEqual(
    Object.keys(FLEET_DEFAULTS).sort(),
    ["baron58", "comanche", "dakota", "dukePiston", "dukeTurbine"],
  );
});

const REQUIRED_NUMERIC = [
  "tasCruise", "vy", "vDescent",
  "rocClimb", "rodDescent",
  "gphClimb", "gphCruise", "gphDescent",
  "fuelUsable", "mtow", "bew",
];
const REQUIRED_STRING = ["id", "name", "short", "engine"];

for (const key of Object.keys(FLEET_DEFAULTS)) {
  const ac = FLEET_DEFAULTS[key];

  test(`FLEET_DEFAULTS.${key}: id matches key`, () => {
    assert.equal(ac.id, key);
  });

  test(`FLEET_DEFAULTS.${key}: marked isBuiltIn`, () => {
    assert.equal(ac.isBuiltIn, true);
  });

  test(`FLEET_DEFAULTS.${key}: numeric perf/fuel fields are positive`, () => {
    for (const f of REQUIRED_NUMERIC) {
      assert.equal(typeof ac[f], "number", `${key}.${f} not a number`);
      assert.ok(ac[f] > 0, `${key}.${f} should be > 0 (got ${ac[f]})`);
    }
  });

  test(`FLEET_DEFAULTS.${key}: text fields are non-empty strings`, () => {
    for (const f of REQUIRED_STRING) {
      assert.equal(typeof ac[f], "string", `${key}.${f} not a string`);
      assert.ok(ac[f].length > 0, `${key}.${f} should not be empty`);
    }
  });

  test(`FLEET_DEFAULTS.${key}: vy < tasCruise (climb slower than cruise)`, () => {
    assert.ok(ac.vy < ac.tasCruise, `${key}: vy=${ac.vy} >= tasCruise=${ac.tasCruise}`);
  });

  test(`FLEET_DEFAULTS.${key}: gphClimb >= gphCruise >= gphDescent`, () => {
    assert.ok(ac.gphClimb >= ac.gphCruise, `${key}: climb burn < cruise burn`);
    assert.ok(ac.gphCruise >= ac.gphDescent, `${key}: cruise burn < descent burn`);
  });
}
