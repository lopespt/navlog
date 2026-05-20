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
// Constantes nomeadas — referenciadas nas conversões abaixo. Documentam
// as unidades implícitas + permitem reuso sem o leitor ter de adivinhar
// "3440.065 é raio da Terra? ft? km? NM?".
const EARTH_RADIUS_NM = 3440.065;   // raio médio da Terra em NM
const FT_PER_KM       = 3280.84;    // pés por km (NOAA WMM usa km)
const MINUTES_PER_DAY = 1440;       // 24 × 60
const TAS_ALT_FACTOR  = 0.02;       // +2% TAS por 1000 ft (correção GA)
const TAS_ISA_FACTOR  = 0.002;      // +0.2% TAS por °C de desvio ISA

const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

// ── Great-circle navigation ─────────────────────────────────────────────────
/**
 * Great-circle distance between two coordinates.
 * @param {number} lat1 - Latitude do ponto 1 em graus decimais.
 * @param {number} lon1 - Longitude do ponto 1 em graus decimais.
 * @param {number} lat2 - Latitude do ponto 2 em graus decimais.
 * @param {number} lon2 - Longitude do ponto 2 em graus decimais.
 * @returns {number} Distância em milhas náuticas (NM).
 */
function gcDist(lat1, lon1, lat2, lon2) {
  var r1 = toRad(lat1), r2 = toRad(lat2);
  var dr = toRad(lat2 - lat1), dl = toRad(lon2 - lon1);
  var sinDr = Math.sin(dr/2), sinDl = Math.sin(dl/2);
  var a = sinDr*sinDr + Math.cos(r1)*Math.cos(r2)*sinDl*sinDl;
  return EARTH_RADIUS_NM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
/**
 * True course (initial bearing) do ponto 1 para o ponto 2 ao longo do
 * círculo máximo.
 * @param {number} lat1 - Latitude inicial em graus.
 * @param {number} lon1 - Longitude inicial em graus.
 * @param {number} lat2 - Latitude destino em graus.
 * @param {number} lon2 - Longitude destino em graus.
 * @returns {number} TC em graus [0..360).
 */
function gcTC(lat1, lon1, lat2, lon2) {
  var r1 = toRad(lat1), r2 = toRad(lat2), dl = toRad(lon2 - lon1);
  var y = Math.sin(dl) * Math.cos(r2);
  var x = Math.cos(r1)*Math.sin(r2) - Math.sin(r1)*Math.cos(r2)*Math.cos(dl);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
/**
 * Interpolação linear simples (não great-circle) entre duas coordenadas.
 * Para distâncias curtas o erro é desprezível; usar gcInterpolate-real
 * quando precisar de precisão em legs longas.
 * @param {number} lat1 - Latitude inicial.
 * @param {number} lon1 - Longitude inicial.
 * @param {number} lat2 - Latitude final.
 * @param {number} lon2 - Longitude final.
 * @param {number} frac - Fração [0..1] do caminho.
 * @returns {[number, number]} Par [lat, lon] em graus.
 */
function gcInterpolate(lat1, lon1, lat2, lon2, frac) {
  return [lat1 + (lat2 - lat1) * frac, lon1 + (lon2 - lon1) * frac];
}
/**
 * Projeta destino a partir de um ponto, true course e distância.
 * @param {number} lat - Latitude inicial em graus.
 * @param {number} lon - Longitude inicial em graus.
 * @param {number} tc - True course em graus.
 * @param {number} distNM - Distância em milhas náuticas.
 * @returns {[number, number]} Par [lat, lon] do destino em graus.
 */
function projectDest(lat, lon, tc, distNM) {
  // Great circle: given start point, true course, distance → destination
  var d = distNM / EARTH_RADIUS_NM;
  var tcR = toRad(tc), lat1 = toRad(lat), lon1 = toRad(lon);
  var lat2 = Math.asin(Math.sin(lat1)*Math.cos(d) + Math.cos(lat1)*Math.sin(d)*Math.cos(tcR));
  var lon2 = lon1 + Math.atan2(Math.sin(tcR)*Math.sin(d)*Math.cos(lat1), Math.cos(d)-Math.sin(lat1)*Math.sin(lat2));
  return [toDeg(lat2), ((toDeg(lon2) + 540) % 360) - 180];
}
/**
 * Inverso de projectDest: dado um destino, course que parte da origem e
 * distância, retorna a origem.
 * @param {number} lat2 - Latitude do destino em graus.
 * @param {number} lon2 - Longitude do destino em graus.
 * @param {number} tc - True course (da origem) em graus.
 * @param {number} distNM - Distância em milhas náuticas.
 * @returns {[number, number]} Par [lat, lon] da origem em graus.
 */
function projectSource(lat2, lon2, tc, distNM) {
  // Reverse: given destination, course from source, distance → source
  var reverseTc = (tc + 180) % 360;
  return projectDest(lat2, lon2, reverseTc, distNM);
}

/**
 * Interseção great-circle de duas radials a partir de dois pontos âncora.
 * Aviation Formulary V1.46 — "Intersection of two radials".
 * @param {number} lat1 - Latitude do âncora 1 em graus.
 * @param {number} lon1 - Longitude do âncora 1 em graus.
 * @param {number} brg1 - Bearing (true) saindo do âncora 1 em graus.
 * @param {number} lat2 - Latitude do âncora 2 em graus.
 * @param {number} lon2 - Longitude do âncora 2 em graus.
 * @param {number} brg2 - Bearing (true) saindo do âncora 2 em graus.
 * @returns {[number, number]|null} Par [lat, lon] do ponto de interseção,
 *   ou null quando as radials não se encontram (paralelas/divergentes).
 */
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

/**
 * Triângulo de vento: a partir de TC + TAS + vento + variação magnética
 * + desvio da bússola, calcula WCA, headings e ground speed.
 * Convenção: vento "de onde vem" (windDir é o rumo de onde sopra).
 * @param {number} tc - True course em graus.
 * @param {number} dist - Distância da perna em NM.
 * @param {number} tas - True airspeed em kt.
 * @param {number} windDir - Direção do vento em graus (de onde sopra).
 * @param {number} windVel - Velocidade do vento em kt.
 * @param {number} variation - Declinação magnética em graus (oeste positivo).
 * @param {number} dev - Desvio da bússola em graus.
 * @returns {{wca:number, th:number, mc:number, mh:number, ch:number, gs:number, ete:number}}
 *   wca/th/mc/mh/ch em graus, gs em kt, ete em minutos.
 */
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

/**
 * TAS corrigida pela altitude e desvio ISA. Aproximação para GA:
 * TAS ≈ baseTAS × (1 + 0.02 × alt/1000) × (1 + ISA × 0.002).
 * @param {number} baseTAS - TAS de referência em kt (nível do mar, ISA).
 * @param {number} altFt - Altitude em pés.
 * @param {number} isaDevC - Desvio ISA em °C (+ = mais quente).
 * @returns {number} TAS corrigida em kt, arredondado.
 */
function correctTAS(baseTAS, altFt, isaDevC) {
  const altFactor = 1 + TAS_ALT_FACTOR * (altFt / 1000);
  const isaFactor = 1 + (isaDevC || 0) * TAS_ISA_FACTOR;
  return Math.round(baseTAS * altFactor * isaFactor);
}

// Validação semântica de uma perna
/**
 * Validações sanity-check de uma perna. Retorna lista de avisos em pt-BR.
 * @param {{tc?:number, dist?:number}} cp - Checkpoint com TC e distância.
 * @param {{gs?:number, ete?:number}} [result] - Resultado de calcLeg.
 * @returns {string[]} Lista de mensagens de aviso (vazia = leg OK).
 */
function validateLeg(cp, result) {
  const w = [];
  if (cp.tc != null && (cp.tc < 0 || cp.tc > 359)) w.push("TC inválido (0–359°)");
  if (cp.dist != null && cp.dist <= 0) w.push("Distância deve ser > 0 NM");
  if (result && result.gs < 30) w.push("GS muito baixo — checar vento/TAS");
  if (result && result.gs > 500) w.push("GS muito alto — checar dados");
  if (result && result.ete > 300) w.push("ETE > 5 h — checar distância");
  return w;
}

// Build the portions list for a climbing or descending leg from the parameters
// the climb and descent branches of computeLegPhases used to compute by hand.
// Same code path for both directions; the only difference between climb and
// descent is the TAS used by the post-phase cruise (climb: tasCruise (HIGH);
// descent: tasCruiseLow (LOW)), so cruisePre* and cruisePost* are passed
// separately. The before_min buffer time→dist conversion uses cruisePostGs in
// both cases (matches the existing per-branch implementations).
function _buildPhasedLegPortions(a) {
  if (a.phaseDist >= a.dist - 0.1) {
    // Whole leg is in-phase — may not complete the climb/descent but that's OK.
    return [{ phase: a.phaseLabel, dist: a.dist, tas: a.phaseTas, gph: a.phaseGph, timeMin: a.dist / a.phaseGs * 60 }];
  }
  if (a.mode === "asap") {
    const cD = a.dist - a.phaseDist;
    return [
      { phase: a.phaseLabel, dist: a.phaseDist, tas: a.phaseTas,      gph: a.phaseGph, timeMin: a.phaseTimeMin },
      { phase: "CRUZEIRO",   dist: cD,          tas: a.cruisePostTas, gph: a.gphR,     timeMin: cD / a.cruisePostGs * 60 },
    ];
  }
  if (a.mode === "at_fix") {
    const cD = a.dist - a.phaseDist;
    return [
      { phase: "CRUZEIRO",   dist: cD,          tas: a.cruisePreTas, gph: a.gphR,     timeMin: cD / a.cruisePreGs * 60 },
      { phase: a.phaseLabel, dist: a.phaseDist, tas: a.phaseTas,     gph: a.phaseGph, timeMin: a.phaseTimeMin },
    ];
  }
  // before_nm / before_min: cruise → phase → cruise(buffer). Always emits the
  // 3-portion structure so BOC/BOD is recorded; either cruise side may collapse
  // to dist=0 / time=0 when the leg is too short to honour the full intent.
  const wantBefore = a.mode === "before_nm"
    ? (a.arrivalValue ?? 5)
    : (a.arrivalValue ?? 5) * a.cruisePostGs / 60;
  // Best-effort: shrink the buffer if the leg can't fit the full request.
  const safeBefore = Math.max(0, Math.min(wantBefore, a.dist - a.phaseDist));
  const cruiseFirst = Math.max(0, a.dist - a.phaseDist - safeBefore);
  return [
    { phase: "CRUZEIRO",   dist: cruiseFirst,  tas: a.cruisePreTas,  gph: a.gphR,     timeMin: cruiseFirst > 0 ? cruiseFirst / a.cruisePreGs * 60  : 0 },
    { phase: a.phaseLabel, dist: a.phaseDist,  tas: a.phaseTas,      gph: a.phaseGph, timeMin: a.phaseTimeMin },
    { phase: "CRUZEIRO",   dist: safeBefore,   tas: a.cruisePostTas, gph: a.gphR,     timeMin: safeBefore  > 0 ? safeBefore  / a.cruisePostGs * 60 : 0 },
  ];
}

/**
 * Decompõe uma perna em fases (SUBIDA / CRUZEIRO / DESCIDA) baseado nas
 * altitudes do fix anterior e do atual + parâmetros do voo. Climb/descent
 * têm tempo fixo (alt/ROC); cruise é o que sobra da distância.
 *
 * @param {number|null} prevAlt - Altitude no fix anterior em ft.
 * @param {number|null} thisAlt - Altitude no fix atual em ft.
 * @param {number} dist - Distância horizontal da perna em NM.
 * @param {Object} cp - Checkpoint (pode carregar overrides tasClimbOvr,
 *   tasCruiseOvr, tasDescentOvr, gphClimbOvr, gphCruiseOvr, gphDescentOvr,
 *   roClimbOvr, roDescentOvr, arrivalMode "asap" | "abeam").
 * @param {Object} ac - Perfil da aeronave (vy, vDescent, tasCruise, gphClimb,
 *   gphCruise, gphDescent, roClimb, roDescent).
 * @param {number} isaDevC - Desvio ISA em °C.
 * @param {number} wDir - Direção do vento em graus.
 * @param {number} wVel - Velocidade do vento em kt.
 * @param {number} variation - Declinação magnética em graus.
 * @returns {{portions: Array<{phase:string, dist:number, tas:number, gph:number, timeMin:number}>, avgTas:number}}
 *   `portions` em ordem cronológica; `dist` em NM, `tas` em kt, `gph` em
 *   galões/h, `timeMin` em minutos.
 */
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
    portions = _buildPhasedLegPortions({
      dist, mode: cp.arrivalMode ?? "asap", arrivalValue: cp.arrivalValue,
      phaseLabel: "SUBIDA",
      phaseDist: climbDist, phaseTimeMin: climbTimeMin,
      phaseTas: tasClimb, phaseGph: gphC, phaseGs: gsClimb,
      // Climbing: both pre- and post-climb cruise sit at the same `cruiseAlt`
      // (Math.max(pAlt, tAlt) == tAlt) — a known approximation: the pre-climb
      // cruise is actually at pAlt, but the existing branch always used the
      // HIGH TAS, so preserve that.
      cruisePreTas:  tasCruise, cruisePreGs:  gsCruise,
      cruisePostTas: tasCruise, cruisePostGs: gsCruise,
      gphR,
    });
  } else if (altDiff < -50) { // descending
    // Descent time fixed by physics: altitude loss / descent rate
    const descentTimeMin = -altDiff / rod;
    const tasCruiseLow = correctTAS(ac.tasCruise, tAlt, isaDevC);
    const gsCruiseLow = gs(tasCruiseLow);
    const descDist = gsDescent * descentTimeMin / 60;
    portions = _buildPhasedLegPortions({
      dist, mode: cp.arrivalMode ?? "at_fix", arrivalValue: cp.arrivalValue,
      phaseLabel: "DESCIDA",
      phaseDist: descDist, phaseTimeMin: descentTimeMin,
      phaseTas: tasDescent, phaseGph: gphD, phaseGs: gsDescent,
      // Descending: pre-descent cruise sits at the HIGH alt (`cruiseAlt` =
      // pAlt), post-descent buffer cruise sits at the LOW alt (`tAlt`).
      cruisePreTas:  tasCruise,    cruisePreGs:  gsCruise,
      cruisePostTas: tasCruiseLow, cruisePostGs: gsCruiseLow,
      gphR,
    });
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
/**
 * Resolve o perfil de altitude para uma sequência de checkpoints, tratando
 * "inherit" WPs como parte do mesmo segmento — para um climb/descent
 * contínuo emitir um único TOC/TOD em vez de um por leg.
 *
 * @param {Array<Object>} cps - Checkpoints da rota (com `alt`,
 *   `useCruiseAlt`, `arrivalMode`, etc.).
 * @param {Object} ac - Perfil da aeronave.
 * @param {{cruiseAlt?:number, variation?:number, isaDevC?:number,
 *   windDir?:number, windVel?:number}} flight - Parâmetros de voo.
 * @returns {{profile:number[], altWarnings:(string|null)[], legPlans:Object<number, Array<{phase:string, dist:number, tas:number, gph:number, timeMin:number}>>}}
 *   `profile` em ft por índice de cp; `altWarnings` mensagens por cp ou null;
 *   `legPlans` portions pré-computadas para legs de segmentos multi-âncora.
 */
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

/**
 * Classifica a transição entre duas fases adjacentes para emitir um WP
 * virtual (TOC/TOD/BOC/BOD).
 *
 *   level/descent → climb   ⇒ "BOC" (begin climb)
 *   climb         → other   ⇒ "TOC" (top of climb)
 *   level/climb   → descent ⇒ "TOD" (top of descent)
 *   descent       → other   ⇒ "BOD" (bottom of descent)
 *
 * @param {"SUBIDA"|"CRUZEIRO"|"DESCIDA"} from - Fase anterior.
 * @param {"SUBIDA"|"CRUZEIRO"|"DESCIDA"} to - Próxima fase.
 * @returns {"BOC"|"TOC"|"TOD"|"BOD"|null} Label do marcador, ou null
 *   quando não há transição relevante (ex.: cruzeiro → cruzeiro).
 */
function portionTransitionLabel(from, to) {
  if (from !== "SUBIDA"  && to === "SUBIDA")  return "BOC";
  if (from === "SUBIDA"  && to !== "SUBIDA")  return "TOC";
  if (from !== "DESCIDA" && to === "DESCIDA") return "TOD";
  if (from === "DESCIDA" && to !== "DESCIDA") return "BOD";
  return null;
}

// Stable per-leg key for a virtual phase marker. `counters` is a mutable
// bag ({}-shape) so two passes over the same `computed` array always agree
// on the autoKey for a given (label, occurrence). This is how
// flight.autoWpATAs entries survive across re-renders.
function nextAutoKey(label, counters) {
  const k = label.toLowerCase();
  const n = counters[k] || 0;
  counters[k] = n + 1;
  return `${k}_${n}`;
}

/**
 * Label de breakdown ETE por fase, ex.: "↗5 →12 ↘3 min". Retorna null
 * para legs single-phase ou sem totalETE válido. ETE de cada fase é
 * distribuído proporcionalmente à distância (dist/totalDist × totalETE)
 * e arredondado para minutos inteiros; fases com 0 min são omitidas.
 *
 * @param {Array<{phase:string, dist:number}>} portions
 * @param {number} totalETE - Tempo total da perna em minutos.
 * @returns {string|null}
 */
function phaseETELabel(portions, totalETE) {
  if (!portions || portions.length <= 1 || !totalETE) return null;
  const totalDist = portions.reduce((s, p) => s + p.dist, 0);
  if (totalDist <= 0) return null;
  const icon = { SUBIDA: "↗", DESCIDA: "↘", CRUZEIRO: "→" };
  return portions
    .map((p) => {
      const ete = Math.round((p.dist / totalDist) * totalETE);
      return ete > 0 ? `${icon[p.phase] || "→"}${ete}` : null;
    })
    .filter(Boolean)
    .join(" ") + " min";
}

/**
 * Distância flat-earth (aproximada) de um ponto P ao segmento A→B, em
 * graus. Para distâncias curtas (típico de hit-testing em mapas) o erro
 * vs great-circle é desprezível. Quando o ponto cai fora do segmento,
 * retorna a distância ao endpoint mais próximo.
 *
 * @param {number} px - X do ponto (longitude em graus, ou pixel).
 * @param {number} py - Y do ponto (latitude em graus, ou pixel).
 * @param {number} ax - X do início do segmento.
 * @param {number} ay - Y do início do segmento.
 * @param {number} bx - X do fim do segmento.
 * @param {number} by - Y do fim do segmento.
 * @returns {number} Distância na mesma unidade da entrada.
 */
function ptSegDist(px, py, ax, ay, bx, by) {
  var dx = bx - ax, dy = by - ay;
  var len2 = dx*dx + dy*dy;
  if (len2 === 0) return Math.sqrt((px-ax)*(px-ax)+(py-ay)*(py-ay));
  var t = Math.max(0, Math.min(1, ((px-ax)*dx+(py-ay)*dy)/len2));
  var cx = ax+t*dx, cy = ay+t*dy;
  return Math.sqrt((px-cx)*(px-cx)+(py-cy)*(py-cy));
}

/**
 * Parser de "HH:MM" ou "HH:MM:SS" para minutos desde meia-noite (UTC,
 * fracionário para segundos). Retorna null para entrada inválida.
 * @param {string|null|undefined} s
 * @returns {number|null} Minutos fracionários.
 */
function parseHHMM(s) {
  if (!s) return null;
  const parts = s.split(":").map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
  const sec = parts.length >= 3 && !isNaN(parts[2]) ? parts[2] : 0;
  return parts[0] * 60 + parts[1] + sec / 60;
}
/**
 * Formata minutos desde meia-noite como "HH:MM" (descarta segundos).
 * Wrap em 24h. Retorna "--:--" para entrada inválida.
 * @param {number|null|undefined} totalMin
 * @returns {string}
 */
function formatHHMM(totalMin) {
  if (totalMin == null || !isFinite(totalMin)) return "--:--";
  const t = ((totalMin % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(t / 60);
  const m = Math.floor(t % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
const _declCache = new Map();
/**
 * Declinação magnética via NOAA WMM (carregado em
 * `window._geomagnetism` por index.html). Cache em memória bucketed por
 * décimos de grau + milhares de pés mantém lookups durante um render
 * praticamente gratis.
 * @param {number|null|undefined} lat - Latitude em graus.
 * @param {number|null|undefined} lon - Longitude em graus.
 * @param {number} [altFt=0] - Altitude em pés.
 * @returns {number|null} Declinação em graus (oeste positivo), ou null
 *   quando a biblioteca WMM ainda não carregou ou lat/lon faltam.
 *   Callers devem fallback para `flight.variation` quando null.
 */
function getDecl(lat, lon, altFt) {
  if (typeof window === "undefined" || window._geomagnetism == null) return null;
  if (lat == null || lon == null) return null;
  const key = Math.round(lat * 10) + '_' + Math.round(lon * 10) + '_' + Math.round((altFt || 0) / 1000);
  const cached = _declCache.get(key);
  if (cached !== undefined) return cached;
  try {
    var altKm = (altFt ?? 0) / FT_PER_KM;
    var result = window._geomagnetism.model().point([lat, lon, altKm]);
    var decl = result.decl ?? 0;
    _declCache.set(key, decl);
    return decl;
  } catch(e) {
    try { console.warn('[navlog]', 'getDecl', e); } catch (_) {}
  }
  return null;
}

/**
 * Strip seconds para display: "HH:MM:SS" ou "HH:MM" → "HH:MM". Não
 * altera o valor armazenado, só o renderizado.
 * @param {string|null|undefined} str
 * @returns {string|null}
 */
function displayTime(str) {
  if (!str) return null;
  return str.slice(0, 5);
}

/**
 * Hora UTC atual em minutos desde meia-noite (fracionário para segundos).
 * Mesma unidade que parseHHMM retorna.
 * @returns {number}
 */
function nowHHMM() {
  const d = new Date();
  return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
}
/**
 * Formata minutos desde meia-noite com precisão de segundos
 * ("HH:MM:SS"). Usado para gravar ATAs com precisão.
 * @param {number|null|undefined} totalMin
 * @returns {string}
 */
function formatHHMMSS(totalMin) {
  if (totalMin == null || !isFinite(totalMin)) return "--:--:--";
  const t = ((totalMin % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const totalSec = Math.round(t * 60);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

/**
 * Estima a posição atual da aeronave por dead-reckoning ao longo de
 * `liveRoute`. Single source of truth usado por map-tab, flight-tab e
 * directToWp para que todas as views concordem sobre "onde estamos".
 *
 * Comportamento:
 *   1. Acha prev (último cruzado ou origem@ATD) e next.
 *   2. Se há hold ativo em prev (startMin ≤ nowMin < startMin+dur),
 *      retorna o âncora de prev (sem avançar).
 *   3. Se activeDeviation aponta para next.userIdx, substitui prev pelo
 *      from-point do desvio (marker corre a perna ciano de correção).
 *   4. Senão, dead-reckon: frac = (nowMin - prevTime) / legDuration ao
 *      longo de gcInterpolate(prev, next, frac).
 *
 * @param {{liveRoute: Array<Object>, liveETAs?: Array<number>,
 *          flight?: Object, nowMin?: number, eobtMin?: number}} args
 *   `nowMin` é injetado para que testes pinem o relógio. `flight` precisa
 *   de atd, eobt, activeDeviation, holds (opcional).
 * @returns {{lat:number, lon:number, course?:number, frac:number,
 *           segment?:{from:Object, to:Object}, devActive?:boolean,
 *           holding?:boolean, parked?:boolean} | null}
 *   null quando não há informação suficiente (ex.: antes do ATD).
 */
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
  // hold anchor (prevWp position) for the hold's duration.
  var holds = flight.holds || [];
  if (prevWp && holds.length > 0) {
    var pIdx = prevWp.userIdx;
    for (var hi = 0; hi < holds.length; hi++) {
      var h = holds[hi];
      if (h && h.atIdx === pIdx
          && h.startMin != null && h.durationMin != null
          && nowMin >= h.startMin && nowMin < h.startMin + h.durationMin) {
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

/**
 * Verifica se a previsão de combustível ao chegar no destino fica abaixo
 * da reserva legal exigida.
 *
 *   predictedAtDest = último valor não-null em liveFuel (ou fuelInitial).
 *   requiredAtDest  = (reserveMin / 60) × gphCruise.
 *   isBingo         = predictedAtDest < requiredAtDest.
 *
 * @param {{liveFuel: Array<number|null>, fuelInitial?: number,
 *          gphCruise?: number, reserveMin?: number}} args
 *   `reserveMin` default = 30 (VFR).
 * @returns {{isBingo:boolean, predictedAtDest:number,
 *           requiredAtDest:number, deficitGal:number} | null}
 */
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

/**
 * Aplica "direct to FIX X" — marca WPs intermediários (entre o último
 * cruzado e o target) com `bypassed: true`. Não toca ATA, alt, dist nem
 * outros dados — só o flag. `clearDirectTo` é o inverso limpo.
 *
 * @param {Array<Object>} cps - Checkpoints (mesma shape que flight.checkpoints).
 * @param {number} targetIdx - Índice do destino do direct-to.
 * @returns {Array<Object>} Novo array (input nunca é mutado). WPs com
 *   ATA não são tocados (já são história).
 */
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

/**
 * Inverso de applyDirectTo — limpa `bypassed` de todos os WPs, usado
 * quando ATC reinstaura a rota original ("resume own nav").
 * @param {Array<Object>} cps
 * @returns {Array<Object>} Novo array (input nunca é mutado).
 */
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

/**
 * Transformação afim que mapeia 3 pares de pixels do PDF para 3 pares
 * em coordenadas mercator — usado na calibração de overlays.
 * Mapeia pdf (u, v) → mercator (mx, my).
 * @param {Array<[number, number]>} pdfPts - 3 pontos em pixels do PDF.
 * @param {Array<{x:number, y:number}>} mercPts - 3 pontos mercator
 *   correspondentes.
 * @returns {{a:number, b:number, c:number, d:number, tx:number, ty:number}|null}
 *   Coeficientes da afim, ou null se os pontos forem (quase) colineares.
 */
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
/**
 * Inverso de uma transformação afim 2D.
 * @param {{a:number, b:number, c:number, d:number, tx:number, ty:number}|null} t
 * @returns {{a:number, b:number, c:number, d:number, tx:number, ty:number}|null}
 *   null se a transformação é degenerada (det ≈ 0).
 */
function invertAffine(t) {
  if (!t) return null;
  var det = t.a * t.d - t.b * t.c;
  if (Math.abs(det) < 1e-9) return null;
  return {
    a:  t.d / det, c: -t.c / det, tx: (t.c * t.ty - t.d * t.tx) / det,
    b: -t.b / det, d:  t.a / det, ty: (t.b * t.tx - t.a * t.ty) / det,
  };
}
/**
 * Aplica uma transformação afim 2D a um ponto.
 * @param {{a:number, b:number, c:number, d:number, tx:number, ty:number}} t
 * @param {number} u - Coordenada u (entrada).
 * @param {number} v - Coordenada v (entrada).
 * @returns {[number, number]} Par [x, y] transformado.
 */
function applyAffinePt(t, u, v) {
  return [t.a * u + t.c * v + t.tx, t.b * u + t.d * v + t.ty];
}

// ── UMD-style export ────────────────────────────────────────────────────────
// Exposed on `window` so the babel block in index.html can keep referencing
// these names as bare globals (after the duplicated definitions are removed).
// Also exported as a CommonJS module for Node tests.
const __NAVLOG_PLANNING__ = {
  EARTH_RADIUS_NM, FT_PER_KM, MINUTES_PER_DAY, TAS_ALT_FACTOR, TAS_ISA_FACTOR,
  toRad, toDeg, mod360,
  gcDist, gcTC, gcInterpolate, projectDest, projectSource, gcIntersection,
  correctTAS, calcLeg, validateLeg,
  computeLegPhases, resolveAltitudeProfile, portionTransitionLabel, nextAutoKey,
  phaseETELabel, ptSegDist,
  estimatedPosition, applyDirectTo, clearDirectTo,
  bingoCheck,
  parseHHMM, formatHHMM, formatHHMMSS, nowHHMM, displayTime, getDecl,
  affineFrom3Points, invertAffine, applyAffinePt,
};
if (typeof module !== "undefined" && module.exports) {
  module.exports = __NAVLOG_PLANNING__;
}
if (typeof window !== "undefined") {
  Object.assign(window, __NAVLOG_PLANNING__);
}
