const { test } = require("node:test");
const assert = require("node:assert/strict");
const { P, nearly } = require("./helpers.js");

test("parseHHMM: 'HH:MM' → minutes", () => {
  assert.equal(P.parseHHMM("12:34"), 12 * 60 + 34);
  assert.equal(P.parseHHMM("00:00"), 0);
  assert.equal(P.parseHHMM("23:59"), 23 * 60 + 59);
});

test("parseHHMM: 'HH:MM:SS' → fractional minutes", () => {
  assert.equal(P.parseHHMM("12:34:30"), 12 * 60 + 34 + 0.5);
  assert.equal(P.parseHHMM("00:00:30"), 0.5);
});

test("parseHHMM: empty / null returns null", () => {
  assert.equal(P.parseHHMM(""), null);
  assert.equal(P.parseHHMM(null), null);
});

test("parseHHMM: malformed returns null", () => {
  assert.equal(P.parseHHMM("12"), null);
  assert.equal(P.parseHHMM("not:time"), null);
});

test("formatHHMM: minutes → 'HH:MM'", () => {
  assert.equal(P.formatHHMM(12 * 60 + 34), "12:34");
  assert.equal(P.formatHHMM(0), "00:00");
});

test("formatHHMM: drops seconds (display only)", () => {
  assert.equal(P.formatHHMM(12 * 60 + 34 + 0.5), "12:34");
});

test("formatHHMM: handles 24h+ wrap", () => {
  assert.equal(P.formatHHMM(25 * 60), "01:00");
});

test("formatHHMM: null/Infinity → '--:--'", () => {
  assert.equal(P.formatHHMM(null), "--:--");
  assert.equal(P.formatHHMM(Infinity), "--:--");
});

test("formatHHMMSS: full precision", () => {
  assert.equal(P.formatHHMMSS(12 * 60 + 34 + 0.5), "12:34:30");
  assert.equal(P.formatHHMMSS(0), "00:00:00");
});

test("formatHHMMSS: 24h+ wrap", () => {
  assert.equal(P.formatHHMMSS(25 * 60), "01:00:00");
});

test("round-trip: parseHHMM(formatHHMMSS(x)) ≈ x", () => {
  for (const x of [0, 1, 60, 720.5, 1234.75, 1439.99]) {
    const back = P.parseHHMM(P.formatHHMMSS(x));
    assert.ok(nearly(back, x % 1440, 0.02),
      `x=${x}, back=${back}, expected≈${x % 1440}`);
  }
});
