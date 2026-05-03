// navlog — pure flight-planning math.
//
// Extracted from index.html so the same functions can be unit-tested in Node
// (via `node --test tests/`) and reused by the browser bundle. No JSX, no
// React, no DOM access — keep it that way.
//
// Loaded by index.html via a plain <script src="lib/planning.js"> BEFORE the
// <script type="text/babel"> block so the babel block can reference these as
// bare globals. Also exported as a CommonJS module for Node tests.

// ================= MATEMÁTICA =================
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

// ── Great-circle navigation ─────────────────────────────────────────────────
function gcDist(lat1, lon1, lat2, lon2) {
  var R = 3440.065;
  var r1 = toRad(lat1), r2 = toRad(lat2);
  var dr = toRad(lat2 - lat1), dl = toRad(lon2 - lon1);
  var sinDr = Math.sin(dr/2), sinDl = Math.sin(dl/2);
  var a = sinDr*sinDr + Math.cos(r1)*Math.cos(r2)*sinDl*sinDl;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function gcTC(lat1, lon1, lat2, lon2) {
  var r1 = toRad(lat1), r2 = toRad(lat2), dl = toRad(lon2 - lon1);
  var y = Math.sin(dl) * Math.cos(r2);
  var x = Math.cos(r1)*Math.sin(r2) - Math.sin(r1)*Math.cos(r2)*Math.cos(dl);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
function gcInterpolate(lat1, lon1, lat2, lon2, frac) {
  return [lat1 + (lat2 - lat1) * frac, lon1 + (lon2 - lon1) * frac];
}
function projectDest(lat, lon, tc, distNM) {
  // Great circle: given start point, true course, distance → destination
  var d = distNM / 3440.065;
  var tcR = toRad(tc), lat1 = toRad(lat), lon1 = toRad(lon);
  var lat2 = Math.asin(Math.sin(lat1)*Math.cos(d) + Math.cos(lat1)*Math.sin(d)*Math.cos(tcR));
  var lon2 = lon1 + Math.atan2(Math.sin(tcR)*Math.sin(d)*Math.cos(lat1), Math.cos(d)-Math.sin(lat1)*Math.sin(lat2));
  return [toDeg(lat2), ((toDeg(lon2) + 540) % 360) - 180];
}
function projectSource(lat2, lon2, tc, distNM) {
  // Reverse: given destination, course from source, distance → source
  var reverseTc = (tc + 180) % 360;
  return projectDest(lat2, lon2, reverseTc, distNM);
}

// Great-circle intersection of two true-course rays from two anchor points.
// Returns [lat, lon] or null when the rays don't meet (parallel / divergent).
// Aviation Formulary V1.46 — "Intersection of two radials".
function gcIntersection(lat1, lon1, brg1, lat2, lon2, brg2) {
  var phi1 = toRad(lat1), lam1 = toRad(lon1);
  var phi2 = toRad(lat2), lam2 = toRad(lon2);
  var t13 = toRad(brg1), t23 = toRad(brg2);
  var dphi = phi2 - phi1, dlam = lam2 - lam1;
  var d12 = 2 * Math.asin(Math.sqrt(
    Math.sin(dphi/2) * Math.sin(dphi/2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlam/2) * Math.sin(dlam/2)
  ));
  if (Math.abs(d12) < 1e-12) return null;
  var cosTa = (Math.sin(phi2) - Math.sin(phi1)*Math.cos(d12)) / (Math.sin(d12) * Math.cos(phi1));
  var cosTb = (Math.sin(phi1) - Math.sin(phi2)*Math.cos(d12)) / (Math.sin(d12) * Math.cos(phi2));
  cosTa = Math.min(Math.max(cosTa, -1), 1);
  cosTb = Math.min(Math.max(cosTb, -1), 1);
  var ta = Math.acos(cosTa);
  var tb = Math.acos(cosTb);
  var t12 = Math.sin(lam2 - lam1) > 0 ? ta : (2 * Math.PI - ta);
  var t21 = Math.sin(lam2 - lam1) > 0 ? (2 * Math.PI - tb) : tb;
  var a1 = t13 - t12;
  var a2 = t21 - t23;
  if (Math.sin(a1) === 0 && Math.sin(a2) === 0) return null; // infinite solutions
  if (Math.sin(a1) * Math.sin(a2) < 0) return null;          // ambiguous / divergent
  var a3 = Math.acos(-Math.cos(a1) * Math.cos(a2) + Math.sin(a1) * Math.sin(a2) * Math.cos(d12));
  var d13 = Math.atan2(Math.sin(d12) * Math.sin(a1) * Math.sin(a2), Math.cos(a2) + Math.cos(a1) * Math.cos(a3));
  var phi3 = Math.asin(Math.sin(phi1) * Math.cos(d13) + Math.cos(phi1) * Math.sin(d13) * Math.cos(t13));
  var dlam13 = Math.atan2(Math.sin(t13) * Math.sin(d13) * Math.cos(phi1), Math.cos(d13) - Math.sin(phi1) * Math.sin(phi3));
  var lam3 = lam1 + dlam13;
  return [toDeg(phi3), ((toDeg(lam3) + 540) % 360) - 180];
}

const mod360 = (x) => ((x % 360) + 360) % 360;

function calcLeg(tc, dist, tas, windDir, windVel, variation, dev) {
  const mc = mod360((tc || 0) - variation); // Magnetic Course (no wind)
  if (!tas || tas <= 0) return { wca: 0, th: tc || 0, mc, mh: mc, ch: mc, gs: 0, ete: 0 };
  const sinWCA = (windVel * Math.sin(toRad(windDir - tc))) / tas;
  const wcaRad = Math.asin(Math.max(-1, Math.min(1, sinWCA)));
  const wca = toDeg(wcaRad);
  const th = mod360(tc + wca);
  const mh = mod360(th - variation); // Magnetic Heading (with wind correction)
  const ch = mod360(mh + dev);
  const gs = Math.max(1, tas * Math.cos(wcaRad) - windVel * Math.cos(toRad(windDir - tc)));
  const ete = dist > 0 && gs > 0 ? (dist / gs) * 60 : 0;
  return { wca, th, mc, mh, ch, gs, ete };
}

// TAS corrigida pela altitude e desvio ISA (aproximação GA)
function correctTAS(baseTAS, altFt, isaDevC) {
  const altFactor = 1 + 0.02 * (altFt / 1000);
  const isaFactor = 1 + (isaDevC || 0) * 0.002;
  return Math.round(baseTAS * altFactor * isaFactor);
}

// Validação semântica de uma perna
function validateLeg(cp, result) {
  const w = [];
  if (cp.tc != null && (cp.tc < 0 || cp.tc > 359)) w.push("TC inválido (0–359°)");
  if (cp.dist != null && cp.dist <= 0) w.push("Distância deve ser > 0 NM");
  if (result && result.gs < 30) w.push("GS muito baixo — checar vento/TAS");
  if (result && result.gs > 500) w.push("GS muito alto — checar dados");
  if (result && result.ete > 300) w.push("ETE > 5 h — checar distância");
  return w;
}

// Compute phase portions for a leg given altitude at prev fix → this fix
// wDir/wVel/variation are wind params needed to compute wind-corrected GS per phase.
// Returns { portions: [{phase, dist, tas, gph, timeMin}], avgTas }
// timeMin: actual flight time for that phase (climb/descent time is fixed by alt/ROC;
//          cruise time derived from remaining dist / wind-corrected GS)
// dist:    horizontal distance covered during that phase (climb/descent = GS × timeMin/60)
function computeLegPhases(prevAlt, thisAlt, dist, cp, ac, isaDevC, wDir, wVel, variation) {
  const tc = cp.tc ?? 0;
  const wd = wDir ?? 0, wv = wVel ?? 0, va = variation ?? 0;

  const tasCr0 = cp.tasCruiseOvr ?? correctTAS(ac.tasCruise, thisAlt ?? 0, isaDevC);
  const gphCr0 = cp.gphCruiseOvr ?? ac.gphCruise;
  // Helper: wind-corrected GS for a given TAS
  function gs(tas) { return Math.max(1, calcLeg(tc, 1, tas, wd, wv, va, 0).gs); }

  if (!dist || dist <= 0) {
    const tMin = 0;
    return { portions: [{ phase: "CRUZEIRO", dist: 0, tas: tasCr0, gph: gphCr0, timeMin: tMin }], avgTas: tasCr0 };
  }

  const pAlt = prevAlt ?? 0;
  const tAlt = thisAlt ?? pAlt;
  const altDiff = tAlt - pAlt;
  const cruiseAlt = Math.max(pAlt, tAlt);

  const tasClimb   = cp.tasClimbOvr   ?? correctTAS(ac.vy,        (pAlt + cruiseAlt) / 2, isaDevC);
  const tasCruise  = cp.tasCruiseOvr  ?? correctTAS(ac.tasCruise,  cruiseAlt,             isaDevC);
  const tasDescent = cp.tasDescentOvr ?? correctTAS(ac.vDescent,  (pAlt + tAlt) / 2,     isaDevC);

  const gphC = cp.gphClimbOvr   ?? ac.gphClimb;
  const gphR = cp.gphCruiseOvr  ?? ac.gphCruise;
  const gphD = cp.gphDescentOvr ?? ac.gphDescent;

  const gsClimb   = gs(tasClimb);
  const gsCruise  = gs(tasCruise);
  const gsDescent = gs(tasDescent);

  let portions;
  const roc = cp.rocClimbOvr   ?? ac.rocClimb   ?? 500;
  const rod = cp.rodDescentOvr ?? ac.rodDescent ?? 500;

  if (altDiff > 50) { // climbing
    // Climb time fixed by physics: altitude gain / climb rate
    const climbTimeMin = altDiff / roc;
    // Actual horizontal distance covered while climbing (wind-corrected)
    const climbDist = gsClimb * climbTimeMin / 60;
    const mode = cp.arrivalMode ?? "asap"; // default: start climbing right away

    if (climbDist >= dist - 0.1) {
      // Whole leg is climbing — may not complete the climb but that's OK
      const t = dist / gsClimb * 60;
      portions = [{ phase: "SUBIDA", dist, tas: tasClimb, gph: gphC, timeMin: t }];
    } else if (mode === "asap") {
      const cruiseDist = dist - climbDist;
      const cruiseTime = cruiseDist / gsCruise * 60;
      portions = [
        { phase: "SUBIDA",   dist: climbDist,  tas: tasClimb,  gph: gphC, timeMin: climbTimeMin },
        { phase: "CRUZEIRO", dist: cruiseDist, tas: tasCruise, gph: gphR, timeMin: cruiseTime   },
      ];
    } else if (mode === "at_fix") {
      // Late climb: cruise first, TOC at the fix
      const cruiseDist = dist - climbDist;
      const cruiseTime = cruiseDist / gsCruise * 60;
      portions = [
        { phase: "CRUZEIRO", dist: cruiseDist, tas: tasCruise, gph: gphR, timeMin: cruiseTime   },
        { phase: "SUBIDA",   dist: climbDist,  tas: tasClimb,  gph: gphC, timeMin: climbTimeMin },
      ];
    } else {
      // before_nm / before_min: cruise → climb → cruise(buffer)
      const wantBefore = mode === "before_nm"
        ? (cp.arrivalValue ?? 5)
        : (cp.arrivalValue ?? 5) * gsCruise / 60;
      // Best-effort: shrink the buffer if the leg can't fit the full request.
      const safeBefore = Math.max(0, Math.min(wantBefore, dist - climbDist));
      const cruiseFirst = Math.max(0, dist - climbDist - safeBefore);
      // Always emit the 3-portion structure so BOC is recorded; either side may
      // collapse to dist=0 / time=0 when the leg is too short to honour the full intent.
      portions = [
        { phase: "CRUZEIRO", dist: cruiseFirst, tas: tasCruise, gph: gphR, timeMin: cruiseFirst > 0 ? cruiseFirst / gsCruise * 60 : 0 },
        { phase: "SUBIDA",   dist: climbDist,   tas: tasClimb,  gph: gphC, timeMin: climbTimeMin },
        { phase: "CRUZEIRO", dist: safeBefore,  tas: tasCruise, gph: gphR, timeMin: safeBefore > 0 ? safeBefore / gsCruise * 60 : 0 },
      ];
    }
  } else if (altDiff < -50) { // descending
    // Descent time fixed by physics: altitude loss / descent rate
    const descentTimeMin = -altDiff / rod;
    const tasCruiseLow = correctTAS(ac.tasCruise, tAlt, isaDevC);
    const gsCruiseLow = gs(tasCruiseLow);
    const descDist = gsDescent * descentTimeMin / 60;
    const mode = cp.arrivalMode ?? "at_fix"; // default: arrive at altitude right at the fix

    if (descDist >= dist - 0.1) {
      const t = dist / gsDescent * 60;
      portions = [{ phase: "DESCIDA", dist, tas: tasDescent, gph: gphD, timeMin: t }];
    } else if (mode === "at_fix") {
      const cruiseDist = dist - descDist;
      const cruiseTime = cruiseDist / gsCruise * 60;
      portions = [
        { phase: "CRUZEIRO", dist: cruiseDist, tas: tasCruise,  gph: gphR, timeMin: cruiseTime    },
        { phase: "DESCIDA",  dist: descDist,   tas: tasDescent, gph: gphD, timeMin: descentTimeMin },
      ];
    } else if (mode === "asap") {
      const cruiseDist = dist - descDist;
      const cruiseTime = cruiseDist / gsCruiseLow * 60;
      portions = [
        { phase: "DESCIDA",  dist: descDist,   tas: tasDescent,   gph: gphD, timeMin: descentTimeMin },
        { phase: "CRUZEIRO", dist: cruiseDist, tas: tasCruiseLow, gph: gphR, timeMin: cruiseTime     },
      ];
    } else {
      // before_nm / before_min: cruise → descent → cruise(buffer)
      const wantBefore = mode === "before_nm"
        ? (cp.arrivalValue ?? 5)
        : (cp.arrivalValue ?? 5) * gsCruiseLow / 60;
      const safeBefore = Math.max(0, Math.min(wantBefore, dist - descDist));
      const cruiseFirst = Math.max(0, dist - descDist - safeBefore);
      portions = [
        { phase: "CRUZEIRO", dist: cruiseFirst, tas: tasCruise,    gph: gphR, timeMin: cruiseFirst > 0 ? cruiseFirst / gsCruise * 60    : 0 },
        { phase: "DESCIDA",  dist: descDist,    tas: tasDescent,   gph: gphD, timeMin: descentTimeMin                 },
        { phase: "CRUZEIRO", dist: safeBefore,  tas: tasCruiseLow, gph: gphR, timeMin: safeBefore > 0 ? safeBefore / gsCruiseLow * 60 : 0 },
      ];
    }
  } else { // level
    const t = gsCruise > 0 ? dist / gsCruise * 60 : 0;
    portions = [{ phase: "CRUZEIRO", dist, tas: tasCruise, gph: gphR, timeMin: t }];
  }

  // Drop empty portions (e.g. before_* with cruiseFirst=0 or safeBefore=0 leave
  // a spurious 0-NM CRUZEIRO that would otherwise emit virtuals at the WP).
  portions = portions.filter(p => (p.dist ?? 0) > 0.001);
  if (portions.length === 0) {
    portions = [{ phase: "CRUZEIRO", dist: 0, tas: tasCr0, gph: gphCr0, timeMin: 0 }];
  }

  // avgTas: display TAS (cruise phase preferred)
  const totalTime = portions.reduce((s, p) => s + (p.timeMin ?? 0), 0);
  const totalD    = portions.reduce((s, p) => s + p.dist, 0);
  const avgTas = totalTime > 0 ? (totalD / totalTime) * 60 : tasCruise;

  return { portions, avgTas };
}

// resolveAltitudeProfile — assigns an effective altitude to every checkpoint.
// Waypoints with cp.alt == null && !cp.useCruiseAlt inherit altitude from the
// previous anchor; multi-leg climbs/descents distribute intermediate altitudes
// proportionally so computeLegPhases sees a smooth profile.
// Returns { profile: number[], altWarnings: (string|null)[], legPlans: { [legIdx]: portions[] } }
//
// legPlans contains pre-computed portions for each leg in a multi-anchor
// segment containing inherit WPs. The segment is treated as ONE continuous
// climb/descent profile (cruise → phase → buffer), and each leg receives only
// the slice of phases it actually overlaps. This produces a single TOD/BOD per
// profile instead of one per leg, no matter how many inherit WPs are crossed.
function resolveAltitudeProfile(cps, ac, flight) {
  var n = cps.length;
  var profile = new Array(n).fill(0);
  var altWarnings = new Array(n).fill(null);
  var legPlans = {};
  var cruiseAlt = flight.cruiseAlt ?? 7000;
  var variation = flight.variation ?? 0;
  var isaDev = flight.isaDevC || 0;

  // Anchor altitude: explicit value or useCruiseAlt; null means "inherit"
  var anchorAlt = new Array(n).fill(null);
  for (var ai = 0; ai < n; ai++) {
    var cpA = cps[ai];
    if (cpA.isOrigin) {
      anchorAlt[ai] = cpA.useCruiseAlt ? cruiseAlt : (cpA.alt ?? 0);
    } else if (cpA.useCruiseAlt) {
      anchorAlt[ai] = cruiseAlt;
    } else if (cpA.alt != null) {
      anchorAlt[ai] = cpA.alt;
    }
    // else anchorAlt[ai] stays null → inherit
  }

  // First anchor must exist (origin); fall back to 0
  profile[0] = anchorAlt[0] ?? 0;
  var lastAnchorIdx = 0;
  var lastAnchorAlt = profile[0];

  for (var si = 1; si < n; si++) {
    if (anchorAlt[si] == null) continue; // skip non-anchors; will fill after loop

    var segFromAlt = lastAnchorAlt;
    var segToAlt   = anchorAlt[si];
    profile[si]    = segToAlt;

    if (segFromAlt !== segToAlt) {
      // Compute total segment distance
      var totalSegDist = 0;
      for (var di = lastAnchorIdx + 1; di <= si; di++) totalSegDist += (cps[di].dist ?? 0);

      if (totalSegDist > 0) {
        var altDiff   = Math.abs(segToAlt - segFromAlt);
        var isClimb   = segToAlt > segFromAlt;
        // Use the destination WP to pick TAS / ROC for the segment
        var cpTo = cps[si];
        var wDir2 = cpTo.windMode === "none"   ? 0 :
                    cpTo.windMode === "custom"  ? (cpTo.windDir ?? 0) :
                    (flight.windDir ?? 0);
        var wVel2 = cpTo.windMode === "none"   ? 0 :
                    cpTo.windMode === "custom"  ? (cpTo.windVel ?? 0) :
                    (flight.windVel ?? 0);
        // Altitude-correct the climb/descent TAS using the segment's average
        // altitude — matches what computeLegPhases will use per leg, so the
        // resolver's phaseDist stays consistent with the sum of per-leg
        // descDist/climbDist (otherwise the trailing buffer ends up shorter
        // than the resolver allocated, causing spurious "perna curta" warnings).
        var avgSegAlt = (segFromAlt + segToAlt) / 2;
        var acTas2 = isClimb
          ? (cpTo.tasClimbOvr   ?? correctTAS(ac.vy ?? 100, avgSegAlt, flight.isaDevC || 0))
          : (cpTo.tasDescentOvr ?? correctTAS(ac.vDescent ?? 90, avgSegAlt, flight.isaDevC || 0));
        var acRoc2 = isClimb
          ? (cpTo.rocClimbOvr   ?? ac.rocClimb   ?? 500)
          : (cpTo.rodDescentOvr ?? ac.rodDescent ?? 500);
        var legRes2 = calcLeg(cpTo.tc ?? 0, 1, acTas2, wDir2, wVel2, variation, 0);
        var gsPhase2 = Math.max(1, legRes2.gs);
        var phaseDist = gsPhase2 * (altDiff / acRoc2) / 60;

        // Honour the destination anchor's arrivalMode/arrivalValue so the
        // resolver pushes the descent (or climb) earlier into prior legs when
        // the last leg alone can't fit "phase + buffer". This way an inherit
        // WP between two anchors gets an altitude consistent with the actual
        // planned phase distribution.
        var defaultMode = isClimb ? "asap" : "at_fix";
        var mode = cpTo.arrivalMode ?? defaultMode;
        var wantBefore = 0;
        if (mode === "before_nm") {
          wantBefore = cpTo.arrivalValue ?? 5;
        } else if (mode === "before_min") {
          // Buffer cruise sits AT segToAlt (after climb or after descent)
          var tasLevel = correctTAS(ac.tasCruise, segToAlt, flight.isaDevC || 0);
          var gsLevel = Math.max(1, calcLeg(cpTo.tc ?? 0, 1, tasLevel, wDir2, wVel2, variation, 0).gs);
          wantBefore = (cpTo.arrivalValue ?? 5) * gsLevel / 60;
        }
        // Clamp the buffer if the segment can't fit the whole intent.
        var safePhase  = Math.min(phaseDist, totalSegDist);
        var safeBefore = Math.max(0, Math.min(wantBefore, totalSegDist - safePhase));
        var cruiseFirst;
        if (mode === "asap")        cruiseFirst = 0;
        else if (mode === "at_fix") cruiseFirst = Math.max(0, totalSegDist - safePhase);
        else /* before_* */          cruiseFirst = Math.max(0, totalSegDist - safePhase - safeBefore);
        var phaseEnd = cruiseFirst + safePhase;

        if (phaseDist > totalSegDist) {
          var verb = isClimb ? 'Subir' : 'Descer';
          var phaseLabel0 = isClimb ? 'subida' : 'descida';
          var deficitNM = (phaseDist - totalSegDist).toFixed(1);
          var bufferNote = (mode === 'before_min' || mode === 'before_nm')
            ? (' + buffer ' + (cpTo.arrivalValue ?? 5) + (mode === 'before_min' ? ' min' : ' NM'))
            : '';
          altWarnings[si] = verb + ' para ' + segToAlt + ' ft em ' + totalSegDist.toFixed(1) +
            ' NM impossível: ' + phaseLabel0 + ' precisa ' + phaseDist.toFixed(1) + ' NM' + bufferNote +
            ' (faltam ' + deficitNM + ' NM). Marque WPs intermédios como "Herdar" para distribuir o perfil.';
        } else if (mode !== 'asap' && mode !== 'at_fix' && safeBefore < wantBefore - 0.1) {
          // Phase fits but the requested buffer was clamped — surface that too.
          altWarnings[si] = 'Buffer reduzido para ' + safeBefore.toFixed(1) + ' NM (pediu ' +
            wantBefore.toFixed(1) + ' NM): perna não comporta ' + (isClimb ? 'subida' : 'descida') +
            ' + nivelamento completo.';
        }

        // Assign intermediate altitudes AND build per-leg portions by slicing
        // the segment regions:
        //   A: [0, cruiseFirst]               — CRUZEIRO at segFromAlt
        //   B: [cruiseFirst, phaseEnd]        — phase (CLIMB or DESCEND)
        //   C: [phaseEnd, totalSegDist]       — CRUZEIRO at segToAlt (buffer)
        // Each leg gets portions = its overlap with each region. Continuous
        // descent/climb across inherit WPs ⇒ middle legs are single-phase.
        if (si > lastAnchorIdx + 1) {
          var distFromSeg = 0;
          for (var ij = lastAnchorIdx + 1; ij < si; ij++) {
            distFromSeg += (cps[ij].dist ?? 0);
            if (distFromSeg <= cruiseFirst + 0.001) {
              profile[ij] = segFromAlt;
            } else if (distFromSeg >= phaseEnd - 0.001) {
              profile[ij] = segToAlt;
            } else {
              var phaseFrac = safePhase > 0 ? (distFromSeg - cruiseFirst) / safePhase : 0;
              profile[ij] = Math.round(segFromAlt + phaseFrac * (segToAlt - segFromAlt));
            }
          }

          // Pre-compute speeds/fuels for each region (uses the segment's wind
          // and the destination anchor's overrides — a known simplification but
          // consistent with the resolver's altDiff/phaseDist math above).
          var tasCruiseHigh = correctTAS(ac.tasCruise, segFromAlt, isaDev);
          var tasCruiseLowR = correctTAS(ac.tasCruise, segToAlt, isaDev);
          var phaseTas = correctTAS(acTas2, (segFromAlt + segToAlt) / 2, isaDev);
          var gsCruiseHigh = Math.max(1, calcLeg(cpTo.tc ?? 0, 1, tasCruiseHigh, wDir2, wVel2, variation, 0).gs);
          var gsCruiseLowR = Math.max(1, calcLeg(cpTo.tc ?? 0, 1, tasCruiseLowR, wDir2, wVel2, variation, 0).gs);
          var gsPhaseR = Math.max(1, calcLeg(cpTo.tc ?? 0, 1, phaseTas, wDir2, wVel2, variation, 0).gs);
          var gphCruiseR = ac.gphCruise || 12;
          var gphPhaseR = isClimb ? (ac.gphClimb || gphCruiseR) : (ac.gphDescent || gphCruiseR);
          var phaseLabel = isClimb ? "SUBIDA" : "DESCIDA";

          var runDist = 0;
          for (var lk = lastAnchorIdx + 1; lk <= si; lk++) {
            var legD = cps[lk].dist || 0;
            var lStart = runDist;
            var lEnd = runDist + legD;
            runDist = lEnd;
            var lp = [];
            // Region A overlap (cruise high)
            var aD = Math.max(0, Math.min(lEnd, cruiseFirst) - lStart);
            if (aD > 0.001) lp.push({
              phase: "CRUZEIRO", dist: aD,
              tas: tasCruiseHigh, gph: gphCruiseR,
              timeMin: aD / gsCruiseHigh * 60,
            });
            // Region B overlap (phase)
            var bD = Math.max(0, Math.min(lEnd, phaseEnd) - Math.max(lStart, cruiseFirst));
            if (bD > 0.001) lp.push({
              phase: phaseLabel, dist: bD,
              tas: phaseTas, gph: gphPhaseR,
              timeMin: bD / gsPhaseR * 60,
            });
            // Region C overlap (buffer cruise low)
            var cD = Math.max(0, lEnd - Math.max(lStart, phaseEnd));
            if (cD > 0.001) lp.push({
              phase: "CRUZEIRO", dist: cD,
              tas: tasCruiseLowR, gph: gphCruiseR,
              timeMin: cD / gsCruiseLowR * 60,
            });
            if (lp.length === 0) lp.push({
              phase: "CRUZEIRO", dist: 0, tas: tasCruiseLowR, gph: gphCruiseR, timeMin: 0,
            });
            legPlans[lk] = lp;
          }
        }
      } else {
        // Zero-distance segment — just fill at previous altitude
        for (var fj = lastAnchorIdx + 1; fj < si; fj++) profile[fj] = segFromAlt;
      }
    } else {
      // Level segment — fill intermediates at same altitude
      for (var lj = lastAnchorIdx + 1; lj < si; lj++) profile[lj] = segFromAlt;
    }

    lastAnchorIdx = si;
    lastAnchorAlt = segToAlt;
  }

  // Trailing waypoints after the last anchor inherit its altitude
  for (var ri = lastAnchorIdx + 1; ri < n; ri++) profile[ri] = lastAnchorAlt;

  return { profile: profile, altWarnings: altWarnings, legPlans: legPlans };
}

// hh:mm:ss parser/formatter
// parseHHMM accepts "HH:MM" or "HH:MM:SS" → returns fractional minutes
function parseHHMM(s) {
  if (!s) return null;
  const parts = s.split(":").map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
  const sec = parts.length >= 3 && !isNaN(parts[2]) ? parts[2] : 0;
  return parts[0] * 60 + parts[1] + sec / 60;
}
// Display only: strips seconds → "HH:MM"
function formatHHMM(totalMin) {
  if (totalMin == null || !isFinite(totalMin)) return "--:--";
  const t = ((totalMin % 1440) + 1440) % 1440;
  const h = Math.floor(t / 60);
  const m = Math.floor(t % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
// Storage: full precision → "HH:MM:SS"
function formatHHMMSS(totalMin) {
  if (totalMin == null || !isFinite(totalMin)) return "--:--:--";
  const t = ((totalMin % 1440) + 1440) % 1440;
  const totalSec = Math.round(t * 60);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

// estimatedPosition — single source of truth for "where the aircraft is now".
//
// Inputs:
//   liveRoute  — expanded route with virtual TOC/TOD/BOD/BOC; each item has
//                lat/lon, isOrigin, isVirtual, userIdx, ata, etaPlanned, tc.
//   liveETAs   — array indexed by userIdx; minutes-of-day for each real WP.
//   flight     — needs atd, eobt, activeDeviation, holds (optional).
//   nowMin     — fractional minutes-of-day; injected so tests can pin the clock.
//
// Returns { lat, lon, course, frac, segment: { from, to }, devActive, holding,
// parked } or null if no info is available (e.g. before ATD with no origin).
//
// Behaviour:
//   1. Walks liveRoute to find prev (last crossed or origin@ATD) and next.
//   2. If a hold is active at prev's userIdx (startMin ≤ nowMin < startMin+dur),
//      returns prev's anchor (no advance).
//   3. If activeDeviation targets next.userIdx, replaces prev with the
//      deviation's from-point so the marker rides the cyan correction leg.
//   4. Otherwise, dead-reckons frac = (nowMin - prevTime) / legDuration along
//      gcInterpolate(prev, next, frac).
function estimatedPosition(args) {
  if (!args) return null;
  var liveRoute = args.liveRoute;
  var liveETAs = args.liveETAs || [];
  var flight = args.flight || {};
  var nowMin = args.nowMin;
  var eobtMin = args.eobtMin;
  if (!liveRoute || liveRoute.length === 0 || nowMin == null) return null;

  if (eobtMin == null && flight.eobt) eobtMin = parseHHMM(flight.eobt);
  if (eobtMin == null) eobtMin = 0;

  var atdMin = flight.atd ? parseHHMM(flight.atd) : null;
  var origin = null;
  for (var oi = 0; oi < liveRoute.length; oi++) {
    if (liveRoute[oi].isOrigin && liveRoute[oi].lat != null) { origin = liveRoute[oi]; break; }
  }

  var prevWp = null, prevTime = null, nextWp = null;
  if (origin && atdMin != null) { prevWp = origin; prevTime = atdMin; }

  for (var wi = 0; wi < liveRoute.length; wi++) {
    var wp = liveRoute[wi];
    if (wp.lat == null || wp.lon == null || wp.isOrigin) continue;
    // A WP bypassed by an active direct-to is no longer on the flown path:
    // skip it as both prev and next candidate.
    if (wp.bypassed) continue;
    if (wp.ata != null) {
      prevWp = wp;
      prevTime = parseHHMM(wp.ata);
      nextWp = null;
    } else if (!nextWp && prevWp != null) {
      nextWp = wp;
    }
  }

  // Hold check: if a hold is active at prev's userIdx, park the marker at the
  // hold anchor (prevWp position) for the hold's duration. Effective start is
  // max(h.startMin, prevTime) so a future hold scheduled before the pilot got
  // there only kicks in once the WP is crossed (its ATA dominates).
  var holds = flight.holds || [];
  if (prevWp && holds.length > 0 && prevTime != null) {
    var pIdx = prevWp.userIdx;
    for (var hi = 0; hi < holds.length; hi++) {
      var h = holds[hi];
      if (h && h.atIdx === pIdx && h.durationMin != null) {
        var hStart = h.startMin != null ? h.startMin : prevTime;
        var effStart = hStart > prevTime ? hStart : prevTime;
        if (nowMin >= effStart && nowMin < effStart + h.durationMin) {
          return {
            lat: prevWp.lat, lon: prevWp.lon,
            course: prevWp.tc != null ? prevWp.tc : 0,
            frac: 0,
            segment: { from: prevWp, to: prevWp },
            devActive: false,
            holding: true,
            parked: false,
          };
        }
      }
    }
  }

  // Direct-to override: when activeDeviation targets nextWp, swap prevWp for
  // the deviation's anchor so we ride the corrected leg, not the planned one.
  var dev = flight.activeDeviation;
  var devActiveForLeg = false;
  if (dev && dev.fromLat != null && dev.fromLon != null && dev.targetIdx != null
      && nextWp && nextWp.userIdx === dev.targetIdx) {
    var devStartMin = parseHHMM(dev.startedAt);
    if (devStartMin != null) {
      prevWp = { lat: dev.fromLat, lon: dev.fromLon, tc: 0, isOrigin: false, etaPlanned: devStartMin };
      prevTime = devStartMin;
      devActiveForLeg = true;
    }
  }

  if (!nextWp) {
    if (prevWp && !prevWp.isOrigin) {
      return {
        lat: prevWp.lat, lon: prevWp.lon,
        course: prevWp.tc != null ? prevWp.tc : 0,
        frac: 1,
        segment: { from: prevWp, to: prevWp },
        devActive: false,
        holding: false,
        parked: true,
      };
    }
    return null;
  }

  if (prevWp != null && prevTime != null) {
    var prevPlanned = prevWp.isOrigin ? eobtMin : (prevWp.etaPlanned != null ? prevWp.etaPlanned : eobtMin);
    var targetEta = devActiveForLeg
      ? (liveETAs[nextWp.userIdx] != null ? liveETAs[nextWp.userIdx] : prevPlanned)
      : (nextWp.etaPlanned != null ? nextWp.etaPlanned : 0);
    var legDuration = targetEta - prevPlanned;
    if (legDuration > 0) {
      var frac = Math.min(1, Math.max(0, (nowMin - prevTime) / legDuration));
      var pos = gcInterpolate(prevWp.lat, prevWp.lon, nextWp.lat, nextWp.lon, frac);
      var course = devActiveForLeg
        ? gcTC(prevWp.lat, prevWp.lon, nextWp.lat, nextWp.lon)
        : (nextWp.tc != null ? nextWp.tc : 0);
      return {
        lat: pos[0], lon: pos[1], course: course, frac: frac,
        segment: { from: prevWp, to: nextWp },
        devActive: devActiveForLeg,
        holding: false,
        parked: false,
      };
    }
  }

  return null;
}

// solveWindFromGs — inverse of calcLeg's wind triangle. Given TC, TAS, the
// observed GS, and the actual true heading flown (TH), recovers the implied
// wind vector { windDir, windVel } so the rest of the route can be re-computed
// against the real conditions.
//
// Math (matches calcLeg in this file):
//   TAS·sin(WCA) = Vw·sin(WD − TC)         (cross-track component)
//   GS           = TAS·cos(WCA) − Vw·cos(WD − TC)
// ⇒ y = TAS·sin(WCA), x = TAS·cos(WCA) − GS
//   WD − TC = atan2(y, x); Vw = sqrt(x² + y²).
// "windDir" is the direction the wind is FROM, in degrees true.
//
// Returns null on bad inputs.
function solveWindFromGs(args) {
  if (!args) return null;
  var tc = args.tc, tas = args.tas, gs = args.gs, th = args.th;
  if (tc == null || tas == null || gs == null || th == null) return null;
  if (tas <= 0) return null;
  var wcaDeg = ((th - tc + 540) % 360) - 180; // signed WCA
  var wcaR = toRad(wcaDeg);
  var y = tas * Math.sin(wcaR);
  var x = tas * Math.cos(wcaR) - gs;
  var windVel = Math.sqrt(x * x + y * y);
  if (windVel < 0.01) return { windDir: mod360(tc), windVel: 0 };
  var rel = toDeg(Math.atan2(y, x));
  var windDir = mod360(tc + rel);
  return { windDir: windDir, windVel: windVel };
}

// bingoCheck — returns { isBingo, predictedAtDest, requiredAtDest, deficitGal }
// from the existing liveFuel cascade plus a legal reserve.
//
// predictedAtDest = liveFuel[lastWp] (or fuelInitial if no prediction yet).
// requiredAtDest  = (reserveMin / 60) × gphCruise.
// isBingo = predictedAtDest < requiredAtDest.
function bingoCheck(args) {
  if (!args) return null;
  var liveFuel = args.liveFuel || [];
  var fuelInitial = args.fuelInitial != null ? args.fuelInitial : 0;
  var gphCruise = args.gphCruise != null ? args.gphCruise : 0;
  var reserveMin = args.reserveMin != null ? args.reserveMin : 30;
  var predicted = fuelInitial;
  for (var i = liveFuel.length - 1; i >= 0; i--) {
    if (liveFuel[i] != null) { predicted = liveFuel[i]; break; }
  }
  var required = (reserveMin / 60) * gphCruise;
  return {
    predictedAtDest: predicted,
    requiredAtDest: required,
    deficitGal: Math.max(0, required - predicted),
    isBingo: predicted < required,
  };
}

// applyHolds — delays the live ETA cascade by the cumulative duration of any
// holds upstream of each waypoint.
//
// A hold at idx N (last-crossed for "hold here", or any future WP for "hold
// at WP") adds h.durationMin to every WP i > N. Hold at WP N itself is
// unaffected because the hold starts upon arrival.
//
// Inputs:
//   etas  — number|null array indexed by userIdx (typically the existing
//           liveETAs).
//   holds — array of { atIdx, durationMin } objects (other fields ignored).
//
// Returns a new array of the same shape; null entries are preserved.
function applyHolds(etas, holds) {
  if (!Array.isArray(etas)) return etas;
  if (!Array.isArray(holds) || holds.length === 0) return etas.slice();
  return etas.map(function(eta, i) {
    if (eta == null) return null;
    var add = 0;
    for (var hi = 0; hi < holds.length; hi++) {
      var h = holds[hi];
      if (h && h.atIdx != null && h.durationMin != null && h.atIdx < i) {
        add += h.durationMin;
      }
    }
    return eta + add;
  });
}

// applyDirectTo — when ATC clears "direct to FIX X", returns a new checkpoints
// array with the intermediate WPs (between the last crossed fix and the
// target) marked as cp.bypassed = true. The helper does NOT touch ATA, alt,
// dist, or any planned data — it only flips the bypass flag, so reverting via
// clearDirectTo is a clean inverse.
//
// Inputs:
//   cps       — array of checkpoints (the same shape as flight.checkpoints).
//   targetIdx — index of the direct-to target.
//
// Returns a NEW array (never mutates the input) with bypassed flags set.
// WPs that already have an ATA are not touched (they're history).
function applyDirectTo(cps, targetIdx) {
  if (!Array.isArray(cps) || cps.length === 0) return cps;
  if (targetIdx == null || targetIdx < 0 || targetIdx >= cps.length) return cps;

  // Find the last crossed (ATA != null) checkpoint. If none, start right
  // after origin (idx 0) so the origin itself never gets bypassed.
  var lastCrossed = 0;
  for (var i = cps.length - 1; i >= 0; i--) {
    if (cps[i] && cps[i].ata != null) { lastCrossed = i; break; }
  }

  return cps.map(function(cp, i) {
    if (!cp || cp.isOrigin) return cp;
    if (i > lastCrossed && i < targetIdx && cp.ata == null) {
      return Object.assign({}, cp, { bypassed: true });
    }
    return cp;
  });
}

// clearDirectTo — strips cp.bypassed from any uncrossed checkpoint, so the
// pilot can "resume own nav" when ATC reinstates the original route.
function clearDirectTo(cps) {
  if (!Array.isArray(cps)) return cps;
  return cps.map(function(cp) {
    if (cp && cp.bypassed) {
      var c = Object.assign({}, cp);
      delete c.bypassed;
      return c;
    }
    return cp;
  });
}

// Affine transform from 3 PDF pixel pairs → 3 mercator pairs (calibration).
// Result maps pdf pixel (u, v) to mercator (mx, my). Returns null if the
// points are (near-)collinear.
function affineFrom3Points(pdfPts, mercPts) {
  var u1=pdfPts[0][0],v1=pdfPts[0][1], u2=pdfPts[1][0],v2=pdfPts[1][1], u3=pdfPts[2][0],v3=pdfPts[2][1];
  var det = u1*(v2-v3) - v1*(u2-u3) + (u2*v3-u3*v2);
  if (Math.abs(det) < 0.5) return null;
  function sol(x1,x2,x3) {
    return [
      (x1*(v2-v3) - v1*(x2-x3) + (x2*v3-x3*v2)) / det,
      (u1*(x2-x3) - x1*(u2-u3) + (u2*x3-u3*x2)) / det,
      (u1*(v2*x3-v3*x2) - v1*(u2*x3-u3*x2) + x1*(u2*v3-u3*v2)) / det
    ];
  }
  var rx = sol(mercPts[0].x, mercPts[1].x, mercPts[2].x);
  var ry = sol(mercPts[0].y, mercPts[1].y, mercPts[2].y);
  return { a: rx[0], c: rx[1], tx: rx[2], b: ry[0], d: ry[1], ty: ry[2] };
}
// Inverse of a 2D affine transform; returns null when degenerate.
function invertAffine(t) {
  if (!t) return null;
  var det = t.a * t.d - t.b * t.c;
  if (Math.abs(det) < 1e-9) return null;
  return {
    a:  t.d / det, c: -t.c / det, tx: (t.c * t.ty - t.d * t.tx) / det,
    b: -t.b / det, d:  t.a / det, ty: (t.b * t.tx - t.a * t.ty) / det,
  };
}
function applyAffinePt(t, u, v) {
  return [t.a * u + t.c * v + t.tx, t.b * u + t.d * v + t.ty];
}

// ── UMD-style export ────────────────────────────────────────────────────────
// Exposed on `window` so the babel block in index.html can keep referencing
// these names as bare globals (after the duplicated definitions are removed).
// Also exported as a CommonJS module for Node tests.
const __NAVLOG_PLANNING__ = {
  toRad, toDeg, mod360,
  gcDist, gcTC, gcInterpolate, projectDest, projectSource, gcIntersection,
  correctTAS, calcLeg, validateLeg,
  computeLegPhases, resolveAltitudeProfile,
  estimatedPosition, applyDirectTo, clearDirectTo, applyHolds,
  solveWindFromGs, bingoCheck,
  parseHHMM, formatHHMM, formatHHMMSS,
  affineFrom3Points, invertAffine, applyAffinePt,
};
if (typeof module !== "undefined" && module.exports) {
  module.exports = __NAVLOG_PLANNING__;
}
if (typeof window !== "undefined") {
  Object.assign(window, __NAVLOG_PLANNING__);
}
