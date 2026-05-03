// Shared fixtures for the navlog test suite.
//
// Defaults mirror a typical light single (PA-28 class) with round numbers so
// expected values are easy to compute by hand: ROC=500 fpm, ROD=500 fpm,
// vy=80 kt, vDescent=90 kt, tasCruise=110 kt.

const P = require("../lib/planning.js");

function makeAC(overrides) {
  return Object.assign({
    tasCruise: 110,
    vy: 80,
    vDescent: 90,
    rocClimb: 500,
    rodDescent: 500,
    gphCruise: 12,
    gphClimb: 15,
    gphDescent: 8,
    fuelUsable: 50,
  }, overrides || {});
}

function makeFlight(overrides) {
  return Object.assign({
    cruiseAlt: 7000,
    windDir: 0,
    windVel: 0,
    isaDevC: 0,
    variation: 0,
  }, overrides || {});
}

// Minimal checkpoint fixture. `tc` defaults to 90° east, `dist` 10 NM.
function makeCP(overrides) {
  return Object.assign({
    name: "WP",
    tc: 90,
    dist: 10,
    alt: null,
    useCruiseAlt: false,
    windMode: "route",
  }, overrides || {});
}

// Origin checkpoint helper.
function makeOrigin(overrides) {
  return Object.assign({
    isOrigin: true,
    name: "ORIG",
    tc: null,
    dist: 0,
    alt: 0,
    useCruiseAlt: false,
  }, overrides || {});
}

// Floating-point matcher with absolute tolerance (default 0.5).
function nearly(actual, expected, eps) {
  const e = eps == null ? 0.5 : eps;
  return Math.abs(actual - expected) <= e;
}

// Sum of dist for portions matching a phase ("SUBIDA" | "DESCIDA" | "CRUZEIRO").
function phaseDistSum(portions, phase) {
  return (portions || []).reduce(function(s, p) {
    return p.phase === phase ? s + (p.dist || 0) : s;
  }, 0);
}

// Total dist across all portions.
function totalDist(portions) {
  return (portions || []).reduce(function(s, p) {
    return s + (p.dist || 0);
  }, 0);
}

module.exports = {
  P,
  makeAC,
  makeFlight,
  makeCP,
  makeOrigin,
  nearly,
  phaseDistSum,
  totalDist,
};
