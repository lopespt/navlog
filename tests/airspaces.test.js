// Tests for lib/airspaces.js — WFS URL, mapper, and fetch wiring.

const test = require("node:test");
const assert = require("node:assert");

const A = require("../lib/airspaces.js");

// Sample feature copied verbatim from a GEOAISWEB WFS GetFeature response
// (ICA:eac_p, count=1) — kept here so we don't need network in tests.
const sampleP = {
  type: "Feature",
  id: "eac_p.161",
  geometry: {
    type: "Polygon",
    coordinates: [[
      [-44.6595, -22.4995],
      [-44.6476, -22.501],
      [-44.6357, -22.5025],
      [-44.6358, -22.5085],
      [-44.6475, -22.5081],
      [-44.6592, -22.5077],
      [-44.6595, -22.4995],
    ]],
  },
  geometry_name: "geom",
  properties: {
    gid: 161,
    pk: 158,
    efetivacao: "2025-10-30Z",
    tipo: "P",
    id: "SBP303",
    nome: "ENGENHEIRO PASSOS",
    uom_ulimit: "FT",
    uom_llimit: "FT",
    upperlimit: 1500,
    lowerlimit: 0,
    perigo: null,
    observacao: null,
    designador: null,
    fir: "SBCW",
  },
};

const sampleR = {
  type: "Feature",
  id: "eac_r.138",
  geometry: { type: "Polygon", coordinates: [[[-51, -29], [-51, -30], [-50, -30], [-50, -29], [-51, -29]]] },
  properties: {
    tipo: "R", id: "SBR569", nome: "COPESUL 1",
    upperlimit: 1000, lowerlimit: 0,
    efetivacao: "2025-10-30Z", fir: "SBCW",
    perigo: null, observacao: null,
  },
};

test("wfsGetFeatureUrl produces a valid WFS query for the eac_p layer", () => {
  const url = A.wfsGetFeatureUrl("ICA:eac_p");
  assert.match(url, /service=WFS/);
  assert.match(url, /request=GetFeature/);
  assert.match(url, /outputFormat=application%2Fjson/);
  assert.match(url, /srsName=EPSG%3A4326/);
  assert.match(url, /typeNames=ICA%3Aeac_p/);
});

test("wfsGetFeatureUrl honours optional count", () => {
  const url = A.wfsGetFeatureUrl("ICA:eac_d", { count: 1 });
  assert.match(url, /count=1/);
});

test("WFS_LAYERS maps P/R/D to the confirmed GEOAISWEB typeNames", () => {
  assert.deepStrictEqual(A.WFS_LAYERS, {
    P: "ICA:eac_p",
    R: "ICA:eac_r",
    D: "ICA:eac_d",
  });
});

test("airspaceFromGeoJsonFeature maps the documented properties", () => {
  const a = A.airspaceFromGeoJsonFeature(sampleP);
  assert.strictEqual(a.id, "SBP303");
  assert.strictEqual(a.type, "P");
  assert.strictEqual(a.name, "ENGENHEIRO PASSOS");
  assert.strictEqual(a.upperFt, 1500);
  assert.strictEqual(a.lowerFt, 0);
  assert.strictEqual(a.fir, "SBCW");
  assert.strictEqual(a.efetivacao, "2025-10-30");
  assert.strictEqual(a.geometry.type, "Polygon");
  assert.strictEqual(a.geometry.coordinates[0].length, 7);
});

test("airspaceFromGeoJsonFeature returns null for unusable features", () => {
  assert.strictEqual(A.airspaceFromGeoJsonFeature(null), null);
  assert.strictEqual(A.airspaceFromGeoJsonFeature({ properties: {} }), null);
  assert.strictEqual(
    A.airspaceFromGeoJsonFeature({ properties: { id: "X" } }), // no geometry
    null
  );
});

test("fetchAirspacesFromWFS hits all 3 layers and flattens with source tagged", async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    let layer = "?";
    if (url.includes("eac_p")) layer = "P";
    else if (url.includes("eac_r")) layer = "R";
    else if (url.includes("eac_d")) layer = "D";
    const fc = { type: "FeatureCollection", features: layer === "P" ? [sampleP] : layer === "R" ? [sampleR] : [] };
    return { ok: true, status: 200, json: async () => fc };
  };
  const out = await A.fetchAirspacesFromWFS({ fetch: fakeFetch });
  assert.strictEqual(out.items.length, 2);
  assert.ok(out.fetchedAt);
  assert.strictEqual(calls.length, 3);
  const ids = out.items.map((a) => a.id).sort();
  assert.deepStrictEqual(ids, ["SBP303", "SBR569"]);
  for (const a of out.items) {
    assert.ok(a.source.wfs.startsWith("ICA:eac_"));
    assert.strictEqual(a.source.fetchedAt, out.fetchedAt);
  }
});

test("fetchAirspacesFromWFS rejects when any layer returns non-OK", async () => {
  const fakeFetch = async (url) => {
    if (url.includes("eac_r")) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ features: [] }) };
  };
  await assert.rejects(
    () => A.fetchAirspacesFromWFS({ fetch: fakeFetch }),
    /HTTP 500/
  );
});
