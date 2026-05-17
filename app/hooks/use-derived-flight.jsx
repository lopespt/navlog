// useDerivedFlight — pure derivations from (flight, ac, prefs, geomagReady).
//
// Extracted from app/main.jsx as part of the god-component break-up. All
// eight derivations are useMemos: theme, computed (the big per-checkpoint
// table), nextIdx, legVirtualsMap, liveETAs, liveRoute, nextLiveIdx,
// liveFuel. Nothing here mutates flight — actions stay in main.jsx (and
// move into useFlightActions in a later commit).
//
// Bare-identifier dependencies (resolved via window globals from lib/*):
//   themes, gcDist, gcTC, gcInterpolate, projectDest, projectSource,
//   resolveAltitudeProfile, computeLegPhases, calcLeg, validateLeg,
//   getDecl, parseHHMM, portionTransitionLabel, nextAutoKey.
// These come from lib/planning.js + lib/themes.js (UMD), guarded by the
// required-globals check in main.jsx.

import { useMemo } from "react";

export function useDerivedFlight({ flight, ac, prefs, geomagReady }) {
  const theme = useMemo(() => themes[prefs.theme] || themes.night, [prefs.theme]);

  // Computa dados de cada checkpoint (perna ATÉ ele)
  const computed = useMemo(() => {
    // Lat/lon is source of truth: for consecutive pairs with explicit coords,
    // always derive TC and dist from geometry (overrides any manually stored value).
    var resolvedCps = flight.checkpoints.map(function(cp, i) {
      if (i === 0 || cp.isOrigin) return cp;
      var prev = flight.checkpoints[i - 1];
      if (prev.lat != null && prev.lon != null && cp.lat != null && cp.lon != null) {
        return Object.assign({}, cp, {
          tc:   Math.round(gcTC(prev.lat, prev.lon, cp.lat, cp.lon)),
          dist: Math.round(gcDist(prev.lat, prev.lon, cp.lat, cp.lon) * 10) / 10
        });
      }
      return cp;
    });

    // Resolve altitude profile — handles inherited altitudes and multi-leg climbs
    var _altRes = resolveAltitudeProfile(resolvedCps, ac, flight);
    var altProfile     = _altRes.profile;
    var altProfileWarn = _altRes.altWarnings;
    var altLegPlans    = _altRes.legPlans || {};

    const eobtMin = parseHHMM(flight.eobt) ?? 0;
    const fuelStart = flight.fuelInitial ?? ac.fuelUsable;
    let etaPlanned = eobtMin;
    let fuelRem = fuelStart;
    let cumDist = 0;
    let cumTime = 0;
    var _res = resolvedCps.map((cp, i) => {
      if (cp.isOrigin) {
        const originAlt = altProfile[i];
        return {
          ...cp,
          alt: originAlt,
          tas: null, wca: null, th: null, mc: null, mh: null, ch: null,
          gsPlanned: null, etePlanned: 0,
          etaPlanned: eobtMin,
          fuelLeg: 0,
          fuelRemPlanned: fuelStart,
          gphEffective: ac.gphCruise,
          portions: [],
          cumDist: 0,
          cumTime: 0,
          windDirUsed: flight.windDir,
          windVelUsed: flight.windVel,
        };
      }

      // Altitude-per-fix: use pre-resolved profile (handles inherited / multi-leg climbs)
      const prevAlt = altProfile[i - 1];
      const thisAlt = altProfile[i];

      // Vento: windMode = null/undefined → padrão da rota
      //                   "none"          → sem vento (vel=0)
      //                   "custom"        → windDir/windVel do checkpoint
      let wDir, wVel;
      if (cp.windMode === "none") {
        wDir = 0; wVel = 0;
      } else if (cp.windMode === "custom" && cp.windDir != null) {
        wDir = Number(cp.windDir);
        wVel = Number(cp.windVel ?? 0);
      } else {
        wDir = flight.windDir;
        wVel = flight.windVel;
      }

      // Phase split: prefer the resolver's segment-aware plan (continuous
      // climb/descent across inherit WPs ⇒ middle legs are single-phase, only
      // the boundary legs carry TOC/TOD virtuals). Fall back to per-leg
      // computeLegPhases when the resolver didn't pre-plan this leg.
      let portions, avgTas;
      if (altLegPlans[i]) {
        portions = altLegPlans[i];
        const _tt = portions.reduce((s, p) => s + (p.timeMin || 0), 0);
        const _td = portions.reduce((s, p) => s + (p.dist || 0), 0);
        avgTas = _tt > 0 ? (_td / _tt) * 60 : (ac.tasCruise || 100);
      } else {
        const _r = computeLegPhases(
          prevAlt, thisAlt, cp.dist || 0, cp, ac, flight.isaDevC || 0,
          wDir, wVel, flight.variation
        );
        portions = _r.portions;
        avgTas = _r.avgTas;
      }

      // Per-leg magnetic variation from WMM (if library loaded and coords known)
      // Falls back to flight.variation when unavailable
      var legVar = getDecl(cp.lat, cp.lon, thisAlt) ?? (flight.variation ?? 0);

      // ETE = sum of timeMin per portion (climb/descent time is fixed by altitude/ROC, not distance)
      // Fuel = sum of (timeMin/60) × gph per portion
      let totalETE = 0;
      let fuelLeg = 0;
      let displayResult = null; // use cruise phase for MH/WCA/heading display
      portions.forEach((p) => {
        totalETE += p.timeMin ?? 0;
        fuelLeg += ((p.timeMin ?? 0) / 60) * p.gph;
        // For heading/WCA display, prefer the cruise phase
        const pr = calcLeg(cp.tc, 1, p.tas, wDir, wVel, legVar, 0);
        if (p.phase === "CRUZEIRO" || displayResult == null) displayResult = pr;
      });
      if (!displayResult) displayResult = calcLeg(cp.tc, 1, avgTas, wDir, wVel, legVar, 0);

      const totalDist = cp.dist || 0;
      // Effective GS = total distance / total time
      const totalGS = totalETE > 0 ? (totalDist / totalETE) * 60 : displayResult.gs;
      etaPlanned += totalETE;
      cumDist += totalDist;
      cumTime += totalETE;

      const gphEffective = totalETE > 0 ? fuelLeg / (totalETE / 60) : ac.gphCruise;
      fuelRem -= fuelLeg;

      return {
        ...cp,
        alt: thisAlt,
        tas: avgTas, ...displayResult,
        variation: legVar,
        gs: totalGS,
        ete: totalETE,
        gsPlanned: totalGS,
        etePlanned: totalETE,
        etaPlanned,
        fuelLeg,
        fuelRemPlanned: fuelRem,
        gphEffective,
        portions,
        cumDist,
        cumTime,
        windDirUsed: wDir,
        windVelUsed: wVel,
        windOverride: cp.windMode === "none" || cp.windMode === "custom",
        warnings: [...validateLeg(cp, { gs: totalGS }), ...(altProfileWarn[i] ? [altProfileWarn[i]] : [])],
        notes: cp.notes || "",
      };
    });

    // Detect cross-leg phase transitions at user WPs: when the climb (or
    // descent) completes exactly at a fix instead of mid-leg, no virtual
    // marker is emitted by liveRoute (the leg is single-phase). Tag the WP
    // itself so the views can render a TOC/TOD/BOC/BOD badge inline.
    for (var _ph = 0; _ph < _res.length; _ph++) {
      var _here = _res[_ph];
      var _next = _res[_ph + 1];
      if (!_here || _here.isOrigin || !_here.portions || _here.portions.length === 0) continue;
      if (!_next || !_next.portions || _next.portions.length === 0) continue;
      var _lastPhase = _here.portions[_here.portions.length - 1].phase;
      var _nextFirst = _next.portions[0].phase;
      if (_lastPhase === "SUBIDA" && _nextFirst !== "SUBIDA") _here.phaseHint = "TOC";
      else if (_lastPhase === "DESCIDA" && _nextFirst !== "DESCIDA") _here.phaseHint = "BOD";
      else if (_lastPhase !== "SUBIDA" && _nextFirst === "SUBIDA") _here.phaseHint = "BOC";
      else if (_lastPhase !== "DESCIDA" && _nextFirst === "DESCIDA") _here.phaseHint = "TOD";
    }

    // Project lat/lon for waypoints without explicit coords using TC + dist
    for (var _fi = 1; _fi < _res.length; _fi++) {
      if (_res[_fi].lat == null && _res[_fi-1].lat != null
          && _res[_fi].tc != null && (_res[_fi].dist ?? 0) > 0) {
        var _fp = projectDest(_res[_fi-1].lat, _res[_fi-1].lon, _res[_fi].tc, _res[_fi].dist);
        _res[_fi] = Object.assign({}, _res[_fi], { lat: _fp[0], lon: _fp[1], coordProjected: true });
      }
    }
    for (var _bi = _res.length - 2; _bi >= 0; _bi--) {
      if (_res[_bi].lat == null && _res[_bi+1].lat != null
          && _res[_bi+1].tc != null && (_res[_bi+1].dist ?? 0) > 0) {
        var _bp = projectSource(_res[_bi+1].lat, _res[_bi+1].lon, _res[_bi+1].tc, _res[_bi+1].dist);
        _res[_bi] = Object.assign({}, _res[_bi], { lat: _bp[0], lon: _bp[1], coordProjected: true });
      }
    }
    return _res;
  }, [flight, ac, geomagReady]);

  // Próximo checkpoint não cruzado
  const nextIdx = useMemo(() => {
    const idx = computed.findIndex((cp) => !cp.isOrigin && cp.ata == null);
    return idx === -1 ? computed.length : idx;
  }, [computed]);

  // legIdx -> [{ label, autoKey, dist, time }] — autoKey numbering mirrors liveRoute.
  const legVirtualsMap = useMemo(() => {
    const map = {};
    const counters = {};
    computed.forEach((cp, i) => {
      if (cp.isOrigin || !cp.portions || cp.portions.length <= 1) return;
      const list = [];
      let accDist = 0, accTime = 0;
      for (let p = 0; p < cp.portions.length - 1; p++) {
        accDist += cp.portions[p].dist || 0;
        accTime += cp.portions[p].timeMin || 0;
        const label = portionTransitionLabel(cp.portions[p].phase, cp.portions[p + 1].phase);
        if (!label) continue;
        list.push({ label, autoKey: nextAutoKey(label, counters), dist: accDist, time: accTime });
      }
      if (list.length > 0) map[i] = list;
    });
    return map;
  }, [computed]);

  const liveETAs = useMemo(() => {
    const etas = computed.map(() => null);
    let lastCrossed = null;
    for (let i = computed.length - 1; i >= 0; i--) {
      if (computed[i].ata != null) { lastCrossed = i; break; }
    }
    let baseMin, baseIdx;
    if (lastCrossed != null) {
      baseMin = parseHHMM(computed[lastCrossed].ata);
      baseIdx = lastCrossed;
      etas[lastCrossed] = baseMin;
    } else if (flight.atd) {
      baseMin = parseHHMM(flight.atd);
      baseIdx = 0;
    } else {
      return etas;
    }
    let cumMin = baseMin;
    for (let i = baseIdx + 1; i < computed.length; i++) {
      const cp = computed[i];
      if (cp.bypassed) { etas[i] = null; continue; }
      const legStartMin = cumMin;
      let legETE = cp.etePlanned;

      const dev = flight.activeDeviation;
      if (dev && dev.targetIdx === i && dev.fromLat != null && dev.fromLon != null
          && cp.lat != null && cp.lon != null) {
        const devDist = gcDist(dev.fromLat, dev.fromLon, cp.lat, cp.lon);
        const devTas  = Number(dev.currentTas) || (ac && ac.tasCruise) || 100;
        const devTC   = gcTC(dev.fromLat, dev.fromLon, cp.lat, cp.lon);
        const r = calcLeg(devTC, devDist, devTas, flight.windDir, flight.windVel, flight.variation, 0);
        legETE = r.ete;
        const devStartMin = parseHHMM(dev.startedAt);
        if (devStartMin != null) {
          cumMin = devStartMin + legETE;
          etas[i] = cumMin;
          continue;
        }
      }

      // Adjust ETE based on the latest marked virtual on this leg.
      const virtuals = legVirtualsMap[i];
      if (virtuals && virtuals.length > 0 && (cp.dist || 0) > 0 && (cp.etePlanned || 0) > 0) {
        const marked = [];
        for (const v of virtuals) {
          const ata = parseHHMM(flight.autoWpATAs?.[v.autoKey]);
          if (ata != null) marked.push({ ...v, ata });
        }
        if (marked.length > 0) {
          const last = marked[marked.length - 1];
          const actualTimeToVirtual = last.ata - legStartMin;
          if (actualTimeToVirtual > 0 && last.time > 0) {
            const actualDistToVirtual = last.dist * (actualTimeToVirtual / last.time);
            const remPlannedDist = cp.dist - last.dist;
            const remPlannedTime = cp.etePlanned - last.time;
            const remDist = cp.dist - actualDistToVirtual;
            const remGS = remPlannedDist > 0 && remPlannedTime > 0 ? remPlannedDist / remPlannedTime : null;
            const remTime = (remGS && remDist > 0) ? remDist / remGS : remPlannedTime;
            legETE = actualTimeToVirtual + Math.max(0, remTime);
          }
        }
      }

      cumMin = legStartMin + legETE;
      etas[i] = cumMin;
    }
    return etas;
  }, [computed, flight.atd, flight.autoWpATAs, flight.activeDeviation, flight.windDir, flight.windVel, flight.variation, ac, legVirtualsMap]);

  // Rota expandida com TOC/TOD/BOD virtuais interpolados entre as pernas
  const liveRoute = useMemo(() => {
    const result = [];
    const counters = {};
    computed.forEach((cp, i) => {
      if (cp.isOrigin) { result.push({ ...cp, userIdx: i }); return; }
      const prevEta = i > 0 ? computed[i - 1].etaPlanned : (parseHHMM(flight.eobt) ?? 0);
      const prevAlt = i > 0 ? computed[i - 1].alt : 0;
      const prevLat  = i > 0 ? computed[i - 1].lat  : null;
      const prevLon  = i > 0 ? computed[i - 1].lon  : null;
      const prevAtaStr = i > 0 ? computed[i - 1].ata : null;
      const legStartActual = prevAtaStr ? parseHHMM(prevAtaStr) : prevEta;
      if (cp.portions?.length > 1 && !cp.bypassed) {
        let accDist = 0, accETE = 0;
        let prevVirtETE = 0, prevVirtDist = 0;
        const totalLegTime = cp.portions.reduce((s, p) => s + (p.timeMin ?? 0), 0);
        for (let p = 0; p < cp.portions.length - 1; p++) {
          const por = cp.portions[p];
          const timeFrac = totalLegTime > 0 && (por.timeMin ?? 0) > 0
            ? por.timeMin / totalLegTime
            : (cp.dist > 0 ? por.dist / cp.dist : 0);
          accDist += por.dist;
          accETE += timeFrac * cp.etePlanned;
          const label = portionTransitionLabel(por.phase, cp.portions[p + 1].phase);
          if (label) {
            const autoKey = nextAutoKey(label, counters);
            const ataStr = flight.autoWpATAs?.[autoKey] ?? null;
            const ataMin = parseHHMM(ataStr);
            const eteLeg = accETE - prevVirtETE;
            const distLeg = accDist - prevVirtDist;
            let displayDist = accDist;
            if (ataMin != null && accETE > 0) {
              const actualTime = ataMin - legStartActual;
              if (actualTime > 0) {
                const actualDist = accDist * (actualTime / accETE);
                displayDist = Math.max(0, Math.min(cp.dist || actualDist, actualDist));
              }
            }
            const vFrac = cp.dist > 0 ? displayDist / cp.dist : 0;
            const [vLat, vLon] = (prevLat != null && cp.lat != null)
              ? gcInterpolate(prevLat, prevLon, cp.lat, cp.lon, Math.max(0, Math.min(1, vFrac))) : [null, null];
            result.push({
              name: label, isVirtual: true, autoKey, userIdx: i,
              alt: (label === "TOC" || label === "BOD") ? cp.alt : (prevAlt ?? cp.alt),
              lat: vLat, lon: vLon,
              tc: cp.tc, mh: cp.mh, mc: cp.mc, wca: cp.wca,
              windMode: cp.windMode, windDirUsed: cp.windDirUsed, windVelUsed: cp.windVelUsed,
              dist: Math.round(displayDist * 10) / 10,
              distToNext: Math.round(((cp.dist || 0) - displayDist) * 10) / 10,
              etePlanned: accETE,
              eteLeg: Math.round(eteLeg * 10) / 10,
              distLeg: Math.round(distLeg * 100) / 100,
              etaPlanned: prevEta + accETE,
              ata: ataStr,
              gsActual: null, portions: [], warnings: [], notes: "",
            });
            prevVirtETE = accETE;
            prevVirtDist = accDist;
          }
        }
        const eteLeg = cp.etePlanned - prevVirtETE;
        const distLeg = cp.dist - prevVirtDist;
        result.push({ ...cp, userIdx: i, eteLeg, distLeg });
      } else {
        result.push({ ...cp, userIdx: i });
      }
    });
    return result;
  }, [computed, flight.autoWpATAs, flight.eobt]);

  // Próximo item não cruzado na liveRoute (inclui TOC/TOD virtuais)
  const nextLiveIdx = useMemo(() => {
    for (let i = 0; i < liveRoute.length; i++) {
      const item = liveRoute[i];
      if (item.isOrigin || item.ata != null) continue;
      if (item.bypassed) continue;
      if (item.isVirtual) {
        const nextUser = liveRoute.slice(i + 1).find(x => !x.isVirtual && !x.isOrigin);
        if (nextUser?.ata != null) continue;
      }
      return i;
    }
    return liveRoute.length;
  }, [liveRoute]);

  // Combustível restante real (baseado em ATAs reais consumindo no GPH planejado)
  const liveFuel = useMemo(() => {
    const fuelStart = flight.fuelInitial ?? ac.fuelUsable;
    let fuel = fuelStart;
    return computed.map((cp, i) => {
      if (cp.isOrigin) return fuel;
      if (cp.ata != null && i > 0) {
        const prevAta = computed[i - 1].ata != null
          ? parseHHMM(computed[i - 1].ata)
          : (i - 1 === 0 ? parseHHMM(flight.atd ?? flight.eobt) : null);
        if (prevAta != null) {
          const ataMin = parseHHMM(cp.ata);
          let elapsed = ataMin - prevAta;
          if (elapsed < 0) elapsed += 1440;
          fuel -= (elapsed / 60) * (cp.gphEffective || ac.gphCruise);
          return fuel;
        }
      }
      return null;
    });
  }, [computed, flight, ac]);

  return {
    theme,
    computed,
    nextIdx,
    legVirtualsMap,
    liveETAs,
    liveRoute,
    nextLiveIdx,
    liveFuel,
  };
}
