const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ptSegDist } = require("../lib/planning.js");

const EPS = 1e-9;
const close = (a, b) => Math.abs(a - b) < 1e-6;

test("ptSegDist: degenerate segment (A == B) → distance to point", () => {
  assert.ok(close(ptSegDist(3, 4, 0, 0, 0, 0), 5));
  assert.ok(close(ptSegDist(0, 0, 5, 5, 5, 5), Math.sqrt(50)));
});

test("ptSegDist: point on the segment line, within bounds → 0", () => {
  // Segment (0,0)→(10,0); point (5,0) is on the segment
  assert.ok(close(ptSegDist(5, 0, 0, 0, 10, 0), 0));
});

test("ptSegDist: point perpendicular to mid-segment", () => {
  // Segment (0,0)→(10,0); point (5, 3) is 3 units above the midpoint
  assert.ok(close(ptSegDist(5, 3, 0, 0, 10, 0), 3));
});

test("ptSegDist: point past endpoint A → distance to A", () => {
  // Segment (0,0)→(10,0); point (-3, 4) is past A; nearest is A itself
  assert.ok(close(ptSegDist(-3, 4, 0, 0, 10, 0), 5));
});

test("ptSegDist: point past endpoint B → distance to B", () => {
  // Segment (0,0)→(10,0); point (13, 4) is past B at (10,0)
  assert.ok(close(ptSegDist(13, 4, 0, 0, 10, 0), 5));
});

test("ptSegDist: vertical segment, perpendicular distance", () => {
  // Segment (0,0)→(0,10); point (4, 5) is 4 to the right of midpoint
  assert.ok(close(ptSegDist(4, 5, 0, 0, 0, 10), 4));
});

test("ptSegDist: diagonal segment", () => {
  // Segment (0,0)→(4,3); length 5. Point (4, -1) → check via projection
  // dx=4, dy=3; len2=25; t = ((4)(4)+(-1)(3))/25 = (16-3)/25 = 0.52
  // closest = (2.08, 1.56); dist = sqrt((4-2.08)^2 + (-1-1.56)^2)
  //         = sqrt(3.6864 + 6.5536) = sqrt(10.24) = 3.2
  assert.ok(close(ptSegDist(4, -1, 0, 0, 4, 3), 3.2));
});
