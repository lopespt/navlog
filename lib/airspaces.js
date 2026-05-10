// navlog — pure helpers for SBP/SBR/SBD airspace fetch + mapping.
//
// Companion to lib/planning.js. Loaded by index.html as a global script;
// also exported as a CommonJS module for Node tests.
//
// Source: GEOAISWEB (DECEA) WFS, https://geoaisweb.decea.mil.br/geoserver
// Layers `ICA:eac_p` (proibidas, 65), `ICA:eac_r` (restritas, 344) and
// `ICA:eac_d` (perigosas, 110) — total ~519 features. Output is GeoJSON
// (application/json) in EPSG:4326 (lon, lat) — direct Leaflet input.

const WFS_BASE = "https://geoaisweb.decea.mil.br/geoserver/ows";

const WFS_LAYERS = {
  P: "ICA:eac_p",
  R: "ICA:eac_r",
  D: "ICA:eac_d",
};

function wfsGetFeatureUrl(typeName, opts) {
  var p = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: typeName,
    outputFormat: "application/json",
    srsName: "EPSG:4326",
  });
  if (opts && opts.count != null) p.set("count", String(opts.count));
  return WFS_BASE + "?" + p.toString();
}

// Map one GeoJSON Feature from `ICA:eac_*` to the navlog internal schema.
// Returns null if the feature is unrecognisable (no geometry, no id).
function airspaceFromGeoJsonFeature(feature) {
  if (!feature || !feature.properties || !feature.geometry) return null;
  var p = feature.properties;
  var id = p.id || feature.id;
  if (!id) return null;
  return {
    id: String(id),
    type: p.tipo || null,
    name: p.nome || "",
    geometry: feature.geometry,
    upperFt: typeof p.upperlimit === "number" ? p.upperlimit : null,
    lowerFt: typeof p.lowerlimit === "number" ? p.lowerlimit : null,
    perigo: p.perigo || null,
    observacao: p.observacao || null,
    fir: p.fir || null,
    efetivacao: p.efetivacao ? String(p.efetivacao).replace(/Z$/, "") : null,
    source: {
      wfs: null,
      featureId: feature.id || null,
      fetchedAt: null,
    },
  };
}

// Fetch all 3 layers in parallel, parse, and return one flat array of mapped
// airspaces. Throws if any layer fails — caller decides what to show.
//
// `deps.fetch` is injectable for tests; defaults to global `fetch`.
async function fetchAirspacesFromWFS(deps) {
  var f = (deps && deps.fetch) || (typeof fetch !== "undefined" ? fetch : null);
  if (!f) throw new Error("fetch not available");
  var fetchedAt = new Date().toISOString();
  var entries = Object.keys(WFS_LAYERS).map(function(k) { return [k, WFS_LAYERS[k]]; });
  var results = await Promise.all(entries.map(async function(e) {
    var typeName = e[1];
    var url = wfsGetFeatureUrl(typeName);
    var r = await f(url);
    if (!r.ok) throw new Error("WFS " + typeName + " HTTP " + r.status);
    var j = await r.json();
    var features = (j && j.features) || [];
    var mapped = [];
    for (var i = 0; i < features.length; i++) {
      var a = airspaceFromGeoJsonFeature(features[i]);
      if (!a) continue;
      a.source.wfs = typeName;
      a.source.fetchedAt = fetchedAt;
      mapped.push(a);
    }
    return mapped;
  }));
  var flat = [];
  for (var i = 0; i < results.length; i++) flat = flat.concat(results[i]);
  return { items: flat, fetchedAt: fetchedAt };
}

const __NAVLOG_AIRSPACES__ = {
  WFS_BASE, WFS_LAYERS,
  wfsGetFeatureUrl,
  airspaceFromGeoJsonFeature,
  fetchAirspacesFromWFS,
};
if (typeof module !== "undefined" && module.exports) {
  module.exports = __NAVLOG_AIRSPACES__;
}
if (typeof window !== "undefined") {
  Object.assign(window, __NAVLOG_AIRSPACES__);
}
