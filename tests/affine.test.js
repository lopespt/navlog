const { test } = require("node:test");
const assert = require("node:assert/strict");
const { P, nearly } = require("./helpers.js");

test("affineFrom3Points: identity → applying recovers input", () => {
  const pdfPts = [[0, 0], [10, 0], [0, 10]];
  // Mercator points use {x, y} shape per the resolver's expectation.
  const mercPts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
  const t = P.affineFrom3Points(pdfPts, mercPts);
  assert.ok(t, "transform must exist");
  for (const [u, v] of pdfPts) {
    const [x, y] = P.applyAffinePt(t, u, v);
    assert.ok(nearly(x, u, 1e-9), `x=${x}, expected ${u}`);
    assert.ok(nearly(y, v, 1e-9), `y=${y}, expected ${v}`);
  }
});

test("affineFrom3Points: scale + translate", () => {
  // x = 2u + 3, y = 2v + 5
  const pdfPts = [[0, 0], [10, 0], [0, 10]];
  const mercPts = [{ x: 3, y: 5 }, { x: 23, y: 5 }, { x: 3, y: 25 }];
  const t = P.affineFrom3Points(pdfPts, mercPts);
  assert.ok(t);
  // Recover the calibration points.
  for (let i = 0; i < 3; i++) {
    const [x, y] = P.applyAffinePt(t, pdfPts[i][0], pdfPts[i][1]);
    assert.ok(nearly(x, mercPts[i].x, 1e-6));
    assert.ok(nearly(y, mercPts[i].y, 1e-6));
  }
  // And a fourth point: (5, 5) → (13, 15)
  const [x, y] = P.applyAffinePt(t, 5, 5);
  assert.ok(nearly(x, 13, 1e-6));
  assert.ok(nearly(y, 15, 1e-6));
});

test("affineFrom3Points: collinear points → null", () => {
  const pdfPts = [[0, 0], [5, 0], [10, 0]]; // all on y=0
  const mercPts = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
  const t = P.affineFrom3Points(pdfPts, mercPts);
  assert.equal(t, null);
});

test("invertAffine: inverse of identity is identity (on point recovery)", () => {
  const pdfPts = [[0, 0], [10, 0], [0, 10]];
  const mercPts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
  const t = P.affineFrom3Points(pdfPts, mercPts);
  const inv = P.invertAffine(t);
  assert.ok(inv);
  // Apply forward then inverse on a sample point: (7, 3) → (7, 3).
  const [x, y] = P.applyAffinePt(t, 7, 3);
  const [u, v] = P.applyAffinePt(inv, x, y);
  assert.ok(nearly(u, 7, 1e-9));
  assert.ok(nearly(v, 3, 1e-9));
});

test("invertAffine: scale+translate round-trips", () => {
  const pdfPts = [[0, 0], [10, 0], [0, 10]];
  const mercPts = [{ x: 3, y: 5 }, { x: 23, y: 5 }, { x: 3, y: 25 }];
  const t = P.affineFrom3Points(pdfPts, mercPts);
  const inv = P.invertAffine(t);
  for (const [u0, v0] of [[0, 0], [5, 5], [7.5, 3.2], [-2, 8]]) {
    const [x, y] = P.applyAffinePt(t, u0, v0);
    const [u1, v1] = P.applyAffinePt(inv, x, y);
    assert.ok(nearly(u1, u0, 1e-6));
    assert.ok(nearly(v1, v0, 1e-6));
  }
});

test("invertAffine: null input → null", () => {
  assert.equal(P.invertAffine(null), null);
});

test("invertAffine: degenerate (zero determinant) → null", () => {
  // A transform that maps everything to a line: a*d − b*c = 0
  const t = { a: 1, b: 1, c: 1, d: 1, tx: 0, ty: 0 };
  assert.equal(P.invertAffine(t), null);
});
