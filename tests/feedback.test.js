// Tests for lib/feedback.js. The module is intentionally a thin wrapper
// over browser-only APIs (navigator.vibrate, AudioContext), so the meat of
// the contract is "doesn't throw in environments where those APIs are
// missing" — exactly the Node test environment we're in here.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { haptic, warmUpAudio, playAlarm } = require("../lib/feedback.js");

test("feedback: three exported functions", () => {
  assert.equal(typeof haptic, "function");
  assert.equal(typeof warmUpAudio, "function");
  assert.equal(typeof playAlarm, "function");
});

test("haptic: no-op when navigator is undefined (Node)", () => {
  assert.doesNotThrow(() => haptic([100]));
  assert.doesNotThrow(() => haptic(50));
  assert.doesNotThrow(() => haptic([200, 100, 200]));
});

test("haptic: no-op when navigator.vibrate is missing", () => {
  const prev = globalThis.navigator;
  globalThis.navigator = {}; // no vibrate
  try {
    assert.doesNotThrow(() => haptic([100]));
  } finally {
    if (prev === undefined) delete globalThis.navigator;
    else globalThis.navigator = prev;
  }
});

// Node 20+ defines `navigator` as a non-configurable built-in without
// `vibrate`, so we can't override it to stub. The no-op behaviour is
// what matters in production (catches calls on devices without the
// Vibration API); confirmed by the previous test.

test("warmUpAudio: no-op when window/AudioContext are absent", () => {
  assert.doesNotThrow(() => warmUpAudio());
});

test("playAlarm: no-op when window/AudioContext are absent", () => {
  assert.doesNotThrow(() => playAlarm("waypoint"));
  assert.doesNotThrow(() => playAlarm("virtual"));
  assert.doesNotThrow(() => playAlarm()); // default type
});
