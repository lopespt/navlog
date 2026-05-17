// FlightTab — extracted from app/main.jsx. See CLAUDE.md "Extrair um
// componente de app/main.jsx" for the audit recipe used to verify the
// imports below match every JSX element + bare-identifier call.

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useTheme, usePrefs, useDerived, useFlight } from "../context/app-context.jsx?v=20260517.2347";
import {
  AlertTriangle, CircleCheckBig, Clock, Edit2, Fuel, Maximize2, Minimize2,
  Navigation, Plane, RotateCcw, Wind,
  ChevronRight, FileText, Minus, Pencil, TrendingDown, TrendingUp,
} from "lucide-react";

// Per-phase ETE breakdown label, e.g. "↗5 →12 ↘3 min". Returns null for
// single-phase legs. Used by CheckpointRow's secondary line.
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

function CheckpointRow({ cp, index, isNext, etaPlanned, etaOriginLabel, etaLive, crossed, isOrigin, isVirtual, hasLiveBase, departDelay, onEditAta, onEditNotes, onUnmarkVirtual, viewMode }) {
  const theme = useTheme();
  const { directToWp } = useFlight();
  const bypassed = cp.bypassed === true;
  const ringClass =
    bypassed             ? "border-zinc-700/40 bg-zinc-900/30 opacity-50" :
    isVirtual && crossed ? "border-cyan-500/30 bg-cyan-500/5" :
    isVirtual && isNext  ? "border-cyan-500/60 bg-cyan-500/5" :
    isVirtual            ? "border-cyan-500/20 bg-transparent" :
    crossed ? "border-green-500/40 bg-green-500/5" :
    isNext  ? `${theme.accentBorder} bg-amber-500/5` :
              `${theme.panelBorder} ${theme.panel}/50`;
  const planAdj = etaPlanned != null ? etaPlanned + (departDelay ?? 0) : null;
  const deltaMin = etaLive != null && !crossed ? etaLive - planAdj : null;
  const sign = deltaMin == null ? null : deltaMin > 0 ? "+" : deltaMin < 0 ? "−" : "";
  const absDelta = deltaMin == null ? null : Math.abs(Math.round(deltaMin));
  const deltaColor = deltaMin == null ? "" :
    deltaMin > 1 ? theme.danger :
    deltaMin < -1 ? theme.success : theme.fgFaint;

  const isAuto = cp.isAuto;
  const isClickable = !isOrigin && !isAuto;
  const Wrapper = isClickable ? "button" : "div";
  const wrapperProps = isClickable ? { onClick: onEditAta } : {};

  // Subtítulo: depende do modo de visualização
  const altLabel = cp.alt != null ? `${cp.alt} ft` : null;
  // Use eteLeg (segment delta) when available; fall back to full etePlanned for single-phase legs
  const displayETE = cp.eteLeg ?? cp.etePlanned;
  const phaseLbl = cp.eteLeg != null ? null : phaseETELabel(cp.portions, cp.etePlanned);
  const eteLabel = phaseLbl ?? (displayETE != null ? `${displayETE.toFixed(1)} min` : null);
  const subtitle = isOrigin ? "Origem"
    : isVirtual ? `+${(cp.distLeg ?? cp.dist)?.toFixed(2)} NM · ${displayETE != null ? displayETE.toFixed(1) : "—"} min · ${cp.alt} ft`
    : isAuto ? `AUTO · ${cp.alt} ft · +${cp.dist?.toFixed(1)} NM da perna`
    : viewMode === "cum"
      ? `Σ ${cp.cumDist?.toFixed(0)} NM · Σ ${cp.cumTime?.toFixed(0)} min${altLabel ? ` · ${altLabel}` : ""} · MC ${Math.round(cp.mc ?? cp.mh).toString().padStart(3, "0")}°`
      : `${(cp.distLeg ?? cp.dist)?.toFixed(2)} NM · ${eteLabel ?? "—"}${altLabel ? ` · ${altLabel}` : ""} · MC ${Math.round(cp.mc ?? cp.mh).toString().padStart(3, "0")}°`;

  return (
    <Wrapper
      {...wrapperProps}
      className={`w-full text-left border rounded px-2 py-2 ${ringClass} ${isVirtual ? "border-dashed opacity-80" : ""} ${isClickable ? "active:scale-[0.99] transition-transform duration-100" : ""}`}
    >
      <div className="flex items-center gap-2">
        {/* Indicador */}
        <div className="w-6 text-center shrink-0">
          {crossed ? (
            <CircleCheckBig className={`w-5 h-5 ${isVirtual ? theme.cyan : theme.success} mx-auto`} />
          ) : isNext ? (
            <ChevronRight className={`w-5 h-5 ${isVirtual ? theme.cyan : theme.accent} mx-auto animate-pulse`} />
          ) : isVirtual ? (
            (cp.name === "BOC" || cp.name === "TOC") ? <TrendingUp  className={`w-4 h-4 ${theme.cyan} opacity-70 mx-auto`} /> :
            (cp.name === "TOD" || cp.name === "BOD") ? <TrendingDown className={`w-4 h-4 ${theme.cyan} opacity-70 mx-auto`} /> :
                                                       <Minus        className={`w-4 h-4 ${theme.cyan} opacity-70 mx-auto`} />
          ) : (
            <span className={`text-[10px] num ${theme.fgFaint}`}>{index + 1}</span>
          )}
        </div>
        {/* Nome + badges */}
        <div className="flex-1 min-w-0">
          <div className={`font-bold truncate ${bypassed ? `${theme.fgFaint} line-through` : crossed ? (isVirtual ? theme.cyan : theme.success) : isNext ? (isVirtual ? theme.cyan : theme.accent) : isVirtual ? theme.cyan : theme.fg}`}>
            {cp.name}
            {bypassed && <span className={`ml-1 text-[10px] ${theme.cyan} border border-current rounded px-1 no-underline`}>DESVIADO</span>}
            {!isVirtual && cp.windMode === "none"   && <span className={`ml-1 text-[10px] ${theme.cyan} border border-current rounded px-1`}>W=0</span>}
            {!isVirtual && cp.windMode === "custom" && <span className={`ml-1 text-[10px] ${theme.cyan} border border-current rounded px-1`}>W↗</span>}
            {!isVirtual && cp.warnings?.length > 0  && <span className="ml-1 text-[10px] text-amber-400 border border-current rounded px-1">⚠</span>}
          </div>
          {!cp.isOrigin && (
            <div className={`text-[10px] ${isVirtual ? theme.cyan : theme.fgFaint} num opacity-70`}>{subtitle}</div>
          )}
          {!isVirtual && cp.notes && (
            <div className={`text-[10px] ${theme.cyan} truncate mt-0.5`}>📝 {cp.notes}</div>
          )}
        </div>
        {/* Tempos + botão nota */}
        <div className="flex items-start gap-1 shrink-0">
          <div className="text-right">
            {cp.isOrigin ? (
              etaPlanned != null ? (
                <div>
                  <div className={`text-[10px] uppercase ${theme.success}`}>{etaOriginLabel ?? "ATD"}</div>
                  <div className={`num font-bold ${theme.success}`}>{formatHHMM(etaPlanned)}</div>
                </div>
              ) : null
            ) : crossed ? (
              <div>
                <div className={`text-[10px] uppercase ${isVirtual ? theme.cyan : theme.success} flex items-center gap-1 justify-end`}>
                  ATA {!isVirtual && <Pencil className="w-2.5 h-2.5 opacity-60" />}
                </div>
                <div className={`num font-bold ${isVirtual ? theme.cyan : theme.success}`}>{displayTime(cp.ata)}</div>
                {!isVirtual && cp.gsActual && (
                  <div className={`text-[10px] num ${theme.fgFaint}`}>GS {Math.round(cp.gsActual)} kt</div>
                )}
              </div>
            ) : hasLiveBase && etaLive != null ? (
              <div>
                <div className={`text-[10px] uppercase ${theme.fgFaint} flex items-center gap-1 justify-end`}>
                  EST {!isVirtual && <Pencil className="w-2.5 h-2.5 opacity-40" />}
                </div>
                <div className={`num font-bold ${isVirtual ? theme.cyan : absDelta != null && absDelta > 0 ? deltaColor : theme.fgMuted}`}>
                  {formatHHMM(etaLive)}
                </div>
                {!isVirtual && absDelta != null && absDelta > 0 && (
                  <div className={`text-[10px] num ${deltaColor}`}>{sign}{absDelta} min</div>
                )}
              </div>
            ) : null}
          </div>
          {/* Atalho direct-to (só WPs upcoming não-cruzados, não-virtuais, não-bypassed) */}
          {!isOrigin && !isAuto && !isVirtual && !crossed && !bypassed && directToWp && (
            <button
              onClick={(e) => { e.stopPropagation(); directToWp(cp.userIdx); }}
              className={`mt-0.5 p-1 rounded ${theme.cyan} opacity-70 hover:opacity-100 active:scale-90`}
              aria-label={`Direct to ${cp.name}`}
              title={`Direct to ${cp.name}`}
            >
              <Navigation className="w-3.5 h-3.5" />
            </button>
          )}
          {/* Botão nota (só waypoints manuais) ou botão desfazer virtual */}
          {isVirtual && crossed && onUnmarkVirtual ? (
            <button
              onClick={(e) => { e.stopPropagation(); onUnmarkVirtual(); }}
              className={`mt-0.5 p-1 rounded ${theme.fgFaint} opacity-60 hover:opacity-100 active:scale-90`}
              aria-label="Desfazer"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          ) : !isOrigin && !isAuto && !isVirtual ? (
            <button
              onClick={(e) => { e.stopPropagation(); onEditNotes(); }}
              className={`mt-0.5 p-1 rounded ${cp.notes ? theme.cyan : theme.fgFaint} opacity-70 hover:opacity-100 active:scale-90`}
              aria-label="Editar nota"
            >
              <FileText className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </Wrapper>
  );
}
// Per-tick re-renders in the parent (every 1 s while ATD is set) only need to
// reach a row whose live ETA / crossed-state actually moved. Skip the rest.
CheckpointRow = React.memo(CheckpointRow, function(a, b) {
  return (
    a.cp === b.cp &&
    a.index === b.index &&
    a.isNext === b.isNext &&
    a.etaPlanned === b.etaPlanned &&
    a.etaLive === b.etaLive &&
    a.crossed === b.crossed &&
    a.isOrigin === b.isOrigin &&
    a.isVirtual === b.isVirtual &&
    a.hasLiveBase === b.hasLiveBase &&
    a.departDelay === b.departDelay &&
    a.viewMode === b.viewMode &&
    a.theme === b.theme &&
    a.etaOriginLabel === b.etaOriginLabel
  );
});

function FlightTab({ onEditAta, onEditVirtualAta, onEditAtd, onEditNotes, viewMode, setViewMode,
    onOpenDeviation }) {
  const {
    flight, ac,
    markVirtual, unmarkVirtual, markCrossed,
    depart, resetFlight, clearDeviation,
  } = useFlight();
  const { computed, nextIdx, liveETAs, liveRoute, nextLiveIdx, liveFuel } = useDerived();
  const { prefs } = usePrefs();
  const theme = useTheme();

  const dev = flight.activeDeviation || null;
  // Recalculate deviation geometry on each render so the banner stays live with TAS edits etc.
  const devTarget = dev && dev.targetIdx != null ? flight.checkpoints[dev.targetIdx] : null;
  let devGeom = null;
  if (dev && devTarget && devTarget.lat != null && devTarget.lon != null && dev.fromLat != null && dev.fromLon != null) {
    const d = gcDist(dev.fromLat, dev.fromLon, devTarget.lat, devTarget.lon);
    const tc = gcTC(dev.fromLat, dev.fromLon, devTarget.lat, devTarget.lon);
    const variation = flight.variation ?? 0;
    const mc = Math.round(((tc - variation) % 360 + 360) % 360);
    const tasN = Number(dev.currentTas) || (ac && ac.tasCruise) || 100;
    const r = calcLeg(tc, d, tasN, flight.windDir, flight.windVel, variation, 0);
    const startMin = parseHHMM(dev.startedAt) ?? nowHHMM();
    devGeom = { dist: d, mc, ete: r.ete, tc, eta: startMin + r.ete, targetIdx: dev.targetIdx, target: devTarget };
  }

  let next = nextLiveIdx < liveRoute.length ? liveRoute[nextLiveIdx] : null;
  // When the active deviation targets the same fix as `next`, swap in the
  // deviation's geometry so the banner shows the *correction* heading,
  // distance, and ETE — not the planned ones.
  if (next && devGeom && next.userIdx === devGeom.targetIdx) {
    next = Object.assign({}, next, {
      tc: devGeom.tc,
      mc: devGeom.mc,
      mh: devGeom.mc,
      dist: devGeom.dist,
      distLeg: devGeom.dist,
      etePlanned: devGeom.ete,
      eteLeg: devGeom.ete,
      _isDeviation: true,
    });
  }
  const planNext = next ? next.etaPlanned : null;

  // ETA live do próximo ponto — para virtuais, interpola entre o ETA do wp anterior e do próximo
  const liveNext = useMemo(() => {
    if (!next) return null;
    if (!next.isVirtual) return liveETAs[next.userIdx] ?? null;
    const userCp = computed[next.userIdx];
    if (!userCp?.etePlanned || userCp.etePlanned <= 0) return null;
    const prevETA = next.userIdx > 1 ? liveETAs[next.userIdx - 1] : (flight.atd ? parseHHMM(flight.atd) : null);
    if (prevETA == null || liveETAs[next.userIdx] == null) return null;
    return prevETA + (next.etePlanned / userCp.etePlanned) * (liveETAs[next.userIdx] - prevETA);
  }, [next, liveETAs, computed, flight.atd]);
  // Desvio calculado em cima do plano ajustado pelo ATD real (não pela EOBT)
  // Se saímos atrasados, isso não gera alerta — só desvios de navegação/velocidade alertam
  const eobtMin = parseHHMM(flight.eobt) ?? 0;
  const atdMin = flight.atd ? (parseHHMM(flight.atd) ?? eobtMin) : eobtMin;
  const departDelay = atdMin - eobtMin;
  const planNextAdj = planNext != null ? planNext + departDelay : null;
  const deltaMin = liveNext != null && planNextAdj != null ? liveNext - planNextAdj : null;
  const alertDelta = prefs?.alertEtaDeltaMin ?? 5;
  const isAlert = deltaMin != null && Math.abs(deltaMin) >= alertDelta;

  // Alerta háptico quando desvio de ETA passa do limiar
  const prevIsAlert = useRef(false);
  useEffect(() => {
    if (isAlert && !prevIsAlert.current) haptic([100, 50, 100]);
    prevIsAlert.current = isAlert;
  }, [isAlert]);

  // Tick a cada segundo para forçar re-render
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Big-mode: head-up minimal display (large readouts only) for in-flight use.
  const [bigMode, setBigMode] = useState(false);

  // Live position (consumes the same selector the map uses, so what the pilot
  // sees in big-mode matches the marker on the map).
  const estPos = useMemo(() => estimatedPosition({
    liveRoute, liveETAs, flight,
    nowMin: nowHHMM(),
    eobtMin: parseHHMM(flight.eobt) ?? 0,
  }), [tick, liveRoute, liveETAs, flight.atd, flight.activeDeviation, flight.eobt]);

  // Bingo fuel check (F2): predicted-arrival fuel below the legal reserve →
  // red banner persists until the situation is resolved.
  const reserveMin = (prefs && prefs.fuelReserveMin) ?? 30;
  const bingo = useMemo(() => bingoCheck({
    liveFuel,
    fuelInitial: flight.fuelInitial ?? ac.fuelUsable,
    gphCruise: ac.gphCruise,
    reserveMin,
  }), [liveFuel, flight.fuelInitial, ac.fuelUsable, ac.gphCruise, reserveMin]);


  // Cronômetro baseado no ATA mais recente (ou ATD) — sobrevive a edições de ATA e recarregamentos
  const lastAtaMs = useMemo(() => {
    const now = new Date();
    const startOfDayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const allAtaMins = [];
    for (const cp of flight.checkpoints) {
      if (cp.ata) { const m = parseHHMM(cp.ata); if (m != null) allAtaMins.push(m); }
    }
    for (const v of Object.values(flight.autoWpATAs || {})) {
      if (v) { const m = parseHHMM(v); if (m != null) allAtaMins.push(m); }
    }
    let latestMin = null;
    if (allAtaMins.length > 0) {
      const nowMin = nowHHMM();
      let bestDiff = Infinity;
      for (const m of allAtaMins) {
        let diff = nowMin - m; if (diff < 0) diff += 1440;
        if (diff < bestDiff) { bestDiff = diff; latestMin = m; }
      }
    } else if (flight.atd) {
      latestMin = parseHHMM(flight.atd);
    }
    if (latestMin == null) return null;
    let ms = startOfDayMs + latestMin * 60 * 1000;
    if (ms > Date.now()) ms -= 24 * 60 * 60 * 1000; // ontem se ATA ainda não chegou
    return ms;
  }, [flight.checkpoints, flight.autoWpATAs, flight.atd, tick]);

  const elapsed = lastAtaMs != null ? Math.max(0, Math.floor((Date.now() - lastAtaMs) / 1000)) : 0;
  const elapsedMin = Math.floor(elapsed / 60);
  const elapsedSec = elapsed % 60;

  // ETA atingida: hora atual >= ETA do próximo waypoint (não cruzado)
  const isEtaPassed = useMemo(() => {
    if (!next || liveNext == null) return false;
    let diff = nowHHMM() - liveNext;
    if (diff > 720) diff -= 1440;
    if (diff < -720) diff += 1440;
    return diff >= 0;
  }, [tick, next, liveNext]); // tick muda a cada segundo → reavalia

  // Alarme sonoro + háptico único quando a ETA do próximo ponto é atingida
  const etaAlarmFiredFor = useRef(null);
  useEffect(() => {
    if (!next) { etaAlarmFiredFor.current = null; return; }
    const key = next.isVirtual ? next.autoKey : next.userIdx;
    if (isEtaPassed && etaAlarmFiredFor.current !== key) {
      etaAlarmFiredFor.current = key;
      const isVirt = next?.isVirtual;
      haptic(isVirt ? [120, 60, 200] : [250, 80, 250, 80, 400]);
      playAlarm(isVirt ? "virtual" : "waypoint");
    }
    if (!isEtaPassed) etaAlarmFiredFor.current = null;
  }, [isEtaPassed, next?.userIdx, next?.autoKey]);

  // Combustível restante atual
  const fuelStart = flight.fuelInitial ?? ac.fuelUsable;
  const currentFuel = useMemo(() => {
    for (let i = liveFuel.length - 1; i >= 0; i--) {
      if (liveFuel[i] != null) return liveFuel[i];
    }
    return fuelStart;
  }, [liveFuel, fuelStart]);
  const fuelPct = Math.max(0, Math.min(100, (currentFuel / fuelStart) * 100));
  const fuelColor = fuelPct < 25 ? theme.danger : fuelPct < 50 ? "text-amber-400" : theme.success;

  const allWarnings = useMemo(() =>
    computed.flatMap((cp) => (cp.warnings || []).map((w) => `${cp.name}: ${w}`)),
    [computed]
  );

  const anyWpCrossed = computed.some(cp => !cp.isOrigin && cp.ata != null);

  // Big-mode: minimal head-up readouts. Replaces the full FlightTab UI with
  // jumbo MH/ETE/ETA so the pilot can glance and look up. Same data sources as
  // the regular mode so numbers stay consistent.
  if (bigMode && next) {
    const accent = next._isDeviation ? theme.cyan : isAlert ? theme.danger : theme.accent;
    const mhStr = next.mh != null ? Math.round(next.mh).toString().padStart(3, "0") + "°" : "—";
    const eteMin = Math.round(next.eteLeg ?? next.etePlanned ?? 0);
    const etaStr = liveNext != null ? formatHHMM(liveNext) : "—";
    const altStr = next.alt != null ? `${next.alt} ft` : "—";
    const fuelStr = `${Math.round(currentFuel)} gal`;
    const posStr = estPos
      ? `${estPos.lat.toFixed(3)}, ${estPos.lon.toFixed(3)}`
      : "—";
    return (
      <div className="px-3 py-3 space-y-3" style={{ minHeight: "calc(100dvh - 8rem)" }}>
        <div className="flex items-center justify-between">
          <span className={`text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>Modo head-up</span>
          <button onClick={() => setBigMode(false)}
            className={`p-2 rounded-lg border ${theme.panelBorder} ${theme.fgMuted} active:scale-95`}
            title="Voltar ao modo normal" aria-label="Sair de modo head-up">
            <Minimize2 className="w-4 h-4" />
          </button>
        </div>

        <div className={`border-2 rounded-lg p-4 ${theme.accentBorder} bg-amber-500/5 text-center`}>
          <div className={`text-[11px] uppercase tracking-widest ${accent} mb-1`}>
            {next._isDeviation ? "Correção" : next.isVirtual ? next.name : "Próximo"}
          </div>
          <div className={`text-7xl font-black cockpit-glow leading-none ${accent}`}
            style={{ letterSpacing: "-0.02em" }}>
            {next.name}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className={`bg-black/30 border-2 ${theme.accentBorder} rounded-lg px-3 py-4 text-center`}>
            <div className={`text-[11px] uppercase tracking-widest ${theme.fgFaint} mb-1`}>MH</div>
            <div className={`text-6xl font-black num cockpit-glow leading-none ${accent}`}>{mhStr}</div>
          </div>
          <div className={`bg-black/30 border-2 ${theme.accentBorder} rounded-lg px-3 py-4 text-center`}>
            <div className={`text-[11px] uppercase tracking-widest ${theme.fgFaint} mb-1`}>ETE</div>
            <div className={`text-6xl font-black num cockpit-glow leading-none ${theme.fg}`}>
              {eteMin}<span className={`text-2xl font-bold ${theme.fgFaint} ml-1`}>min</span>
            </div>
          </div>
        </div>

        <div className={`bg-black/30 border-2 rounded-lg px-3 py-3 text-center ${isAlert ? "border-red-500/60" : "border-cyan-500/40"}`}>
          <div className={`text-[11px] uppercase tracking-widest ${theme.fgFaint} mb-1`}>{isAlert ? "ETA ⚠" : "ETA"}</div>
          <div className={`text-5xl font-black num cockpit-glow leading-none ${accent}`}>{etaStr}</div>
          {deltaMin != null && Math.abs(deltaMin) >= 1 && (
            <div className={`text-sm num mt-1 ${deltaMin > 0 ? theme.danger : theme.success}`}>
              {deltaMin > 0 ? "+" : "−"}{Math.abs(Math.round(deltaMin))} min
            </div>
          )}
        </div>

        <div className={`grid grid-cols-3 gap-2 text-center`}>
          <div className={`bg-black/30 border ${theme.panelBorder} rounded-lg px-2 py-3`}>
            <div className={`text-[10px] uppercase tracking-wider ${theme.fgFaint}`}>ALT</div>
            <div className={`text-2xl font-bold num ${theme.fg}`}>{altStr}</div>
          </div>
          <div className={`bg-black/30 border ${theme.panelBorder} rounded-lg px-2 py-3`}>
            <div className={`text-[10px] uppercase tracking-wider ${theme.fgFaint}`}>FUEL</div>
            <div className={`text-2xl font-bold num ${fuelColor}`}>{fuelStr}</div>
          </div>
          <div className={`bg-black/30 border ${theme.panelBorder} rounded-lg px-2 py-3`}>
            <div className={`text-[10px] uppercase tracking-wider ${theme.fgFaint}`}>POS</div>
            <div className={`text-[11px] font-bold num ${theme.fg} leading-tight mt-1`}>{posStr}</div>
            {estPos?.holding && <div className={`text-[10px] ${theme.cyan}`}>HOLD</div>}
            {estPos?.devActive && <div className={`text-[10px] ${theme.cyan}`}>DESVIO</div>}
          </div>
        </div>

        <button
          onClick={() => next.isVirtual ? markVirtual(next.autoKey) : markCrossed(next.userIdx)}
          className={`w-full ${isEtaPassed ? "bg-amber-500 animate-pulse" : isAlert ? "bg-red-600" : next.isVirtual ? "bg-cyan-700" : theme.accentBg} ${next.isVirtual ? "text-white" : theme.accentBgFg} font-bold py-8 rounded-lg text-2xl flex items-center justify-center gap-3 active:scale-[0.98] transition-all duration-150`}
          style={{ minHeight: 96 }}>
          <CircleCheckBig className="w-7 h-7" /> Agora
        </button>
      </div>
    );
  }

  return (
    <div className="px-3 py-3 space-y-3">

      {/* ---- Card de Partida ---- */}
      {!flight.atd && !anyWpCrossed ? (
        <div className={`border-2 rounded-lg p-4 ${theme.accentBorder} bg-amber-500/5`}>
          <div className={`text-[10px] uppercase tracking-widest ${theme.accent} mb-1`}>Pronto para partir</div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className={`text-[10px] uppercase ${theme.fgFaint}`}>EOBT</div>
              <div className={`text-2xl font-black num cockpit-glow ${theme.accent}`}>{flight.eobt}</div>
            </div>
            <div className="text-right">
              <div className={`text-[10px] uppercase ${theme.fgFaint}`}>Origem</div>
              <div className={`text-2xl font-black ${theme.fg}`}>{flight.origin || computed[0]?.name || "—"}</div>
            </div>
          </div>
          <button onClick={depart}
            className={`w-full ${theme.accentBg} ${theme.accentBgFg} font-bold py-5 rounded-lg text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-all duration-150`}
            style={{ minHeight: 64 }}>
            <Plane className="w-5 h-5" /> Partir agora
          </button>
        </div>
      ) : flight.atd ? (
        <button onClick={onEditAtd}
          className={`w-full ${theme.panel} border ${theme.panelBorder} rounded-lg px-3 py-2 flex items-center justify-between active:scale-[0.98] transition-all duration-150`}>
          <div className="flex items-center gap-2">
            <Plane className={`w-4 h-4 ${theme.success}`} />
            <div className="text-left">
              <div className={`text-[10px] uppercase ${theme.fgFaint}`}>ATD</div>
              <div className={`font-bold num ${theme.success}`}>{displayTime(flight.atd)}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`text-[10px] uppercase ${theme.fgFaint}`}>{flight.origin || computed[0]?.name}</div>
            <Edit2 className={`w-3.5 h-3.5 ${theme.fgFaint}`} />
          </div>
        </button>
      ) : null}

      {allWarnings.length > 0 && (
        <div className="bg-amber-900/30 border border-amber-600/50 rounded-lg px-3 py-2 space-y-0.5">
          {allWarnings.map((w, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {w}
            </div>
          ))}
        </div>
      )}

      {/* Bingo fuel alert (F2): predicted arrival below legal reserve */}
      {flight.atd && bingo && bingo.isBingo && (
        <div className="bg-red-900/40 border-2 border-red-500 rounded-lg px-3 py-2 flex items-center gap-2 animate-pulse">
          <Fuel className="w-5 h-5 text-red-400 shrink-0" />
          <div className="flex-1 text-xs">
            <div className={`font-bold text-red-300`}>BINGO FUEL</div>
            <div className={`num text-red-200/90`}>
              previsto chegada {bingo.predictedAtDest.toFixed(1)} gal — reserva legal exige {bingo.requiredAtDest.toFixed(1)} gal ({reserveMin} min)
            </div>
          </div>
        </div>
      )}


      {/* Strip de Reposicionamento (Desvio) + entrada Big-mode */}
      {flight.atd && (
        <div className={`flex items-center gap-2 ${dev ? "border-cyan-500/60 bg-cyan-500/10 border" : ""} rounded-lg ${dev ? "p-2" : ""}`}>
          {dev ? (
            <>
              <span className={`text-[10px] uppercase tracking-widest font-bold ${theme.cyan}`}>DESVIO ATIVO</span>
              {devGeom && (
                <span className={`text-[10px] num ${theme.fgFaint}`}>
                  → {devGeom.target?.name} · {String(devGeom.mc).padStart(3,"0")}°M · {devGeom.dist.toFixed(1)} NM
                </span>
              )}
              <button onClick={onOpenDeviation}
                className={`ml-auto text-[10px] px-2 py-1 rounded border ${theme.panelBorder} ${theme.fgMuted}`}>
                Editar
              </button>
              <button onClick={clearDeviation}
                className="text-[10px] px-2 py-1 rounded border border-red-500 text-red-400 font-bold">
                Voltar à rota
              </button>
            </>
          ) : (
            <>
              <button onClick={onOpenDeviation}
                className={`flex-1 text-[11px] uppercase tracking-widest font-bold py-2 rounded-lg border ${theme.panelBorder} ${theme.fgMuted} active:scale-[0.99] flex items-center justify-center gap-1.5`}>
                <Navigation className="w-3.5 h-3.5" /> Reposicionar (desvio)
              </button>
              {next && (
                <button onClick={() => setBigMode(true)}
                  className={`px-3 py-2 rounded-lg border ${theme.panelBorder} ${theme.fgMuted} active:scale-95`}
                  title="Modo head-up (head-up minimal)" aria-label="Activar modo head-up">
                  <Maximize2 className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
      )}

      {next ? (
        /* ---- Card de próximo waypoint (regular ou virtual TOC/TOD/BOD) ---- */
        (() => {
          const isDev = next._isDeviation === true;
          const accentColor = isDev ? theme.cyan : next.isVirtual ? theme.cyan : isAlert ? theme.danger : theme.accent;
          const borderClass = isDev
            ? "border-cyan-500/80 bg-cyan-500/10"
            : next.isVirtual
              ? (isAlert ? "border-red-500/80 bg-red-500/10" : "border-cyan-500/60 bg-cyan-500/5")
              : (isAlert ? "border-red-500/80 bg-red-500/10" : `${theme.accentBorder} bg-amber-500/5`);
          const virtLabel = next.name === "BOC" ? "Início da Subida"
            : next.name === "TOC" ? "Topo de Subida"
            : next.name === "TOD" ? "Início de Descida"
            : "Fim de Descida";
          const topLabel = isDev
            ? "Correção · Próximo"
            : next.isVirtual
              ? virtLabel
              : isAlert ? "DESVIO DE ETA" : "Próximo Waypoint";
          return (
        <div className={`border-2 rounded-lg p-4 transition-all duration-150 ${borderClass}`}>
          {/* Linha topo: label + alt */}
          <div className="flex items-center justify-between mb-1">
            <span className={`text-[10px] uppercase tracking-widest ${accentColor}`}>
              {topLabel}
            </span>
            <span className={`text-[10px] ${theme.fgFaint} num`}>
              {next.alt != null ? `${next.alt} ft` : ""}
            </span>
          </div>

          {/* Nome + proa */}
          <div className="flex items-end justify-between mb-3 gap-2">
            <div className={`text-4xl font-black cockpit-glow tracking-tight leading-none ${accentColor}`}>
              {next.name}
            </div>
            {next.mh != null && (
              <div className="text-right">
                <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>MH</div>
                <div className={`text-4xl font-black num cockpit-glow leading-none ${accentColor}`}>
                  {Math.round(next.mh).toString().padStart(3,"0")}°
                </div>
                {next.mc != null && next.wca != null && Math.abs(next.wca) >= 1 && (
                  <div className={`text-[10px] num ${theme.fgFaint} mt-0.5`}>
                    MC {Math.round(next.mc).toString().padStart(3,"0")}°
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ETE, ETA e barra de progresso da perna */}
          {/* ETE + ETA */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className={`bg-black/30 border ${theme.panelBorder} rounded-lg px-3 py-3`}>
              <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint} mb-1`}>ETE</div>
              <div className={`text-3xl font-black num cockpit-glow ${theme.fg}`}>
                {Math.round(next.eteLeg ?? next.etePlanned ?? 0)}<span className={`text-base font-bold ${theme.fgFaint} ml-1`}>min</span>
              </div>
            </div>
            <div className={`bg-black/30 border rounded-lg px-3 py-3 ${isAlert ? "border-red-500/60" : "border-cyan-500/40"}`}>
              <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint} mb-1`}>{isAlert ? "ETA ⚠" : "ETA"}</div>
              {liveNext != null ? (
                <>
                  <div className={`text-3xl font-black num cockpit-glow ${accentColor}`}>
                    {formatHHMM(liveNext)}
                  </div>
                  {deltaMin != null && Math.abs(deltaMin) >= 1 && (
                    <div className={`text-[10px] num mt-0.5 ${deltaMin > 0 ? theme.danger : theme.success}`}>
                      {deltaMin > 0 ? "+" : "−"}{Math.abs(Math.round(deltaMin))} min
                    </div>
                  )}
                </>
              ) : (
                <div className={`text-3xl font-black num ${theme.fgFaint}`}>—</div>
              )}
            </div>
          </div>
          {/* Barra de progresso — fina, sem label (a percentagem é implícita) */}
          {lastAtaMs != null && (next.eteLeg ?? next.etePlanned) > 0 && (() => {
            const legETE = next.eteLeg ?? next.etePlanned;
            const progressPct = Math.min(100, (elapsed / 60) / legETE * 100);
            return (
              <div className="h-1 rounded-full bg-black/40 overflow-hidden mb-3">
                <div
                  className={`h-full rounded-full ${
                    progressPct >= 95 ? "bg-red-500" :
                    progressPct >= 75 ? "bg-amber-400" :
                    isAlert ? "bg-red-500" : "bg-amber-500"
                  }`}
                  style={{ width: `${progressPct}%`, transition: "width 1s linear" }}
                />
              </div>
            );
          })()}

          {/* Dist + alt + vento como info secundária */}
          <div className={`grid grid-cols-3 text-[10px] num ${theme.fgFaint} mb-3 px-1 gap-1`}>
            <span>{(next.distLeg ?? next.dist)?.toFixed(2)} NM</span>
            <span className="text-center">{next.alt != null ? `${next.alt} ft` : "—"}</span>
            <span className="text-right">
              {next.windMode === "none" ? "W=0" : (
                <>
                  <Wind className="w-3 h-3 inline mr-0.5 opacity-70" />
                  {String(Math.round(next.windDirUsed ?? flight.windDir ?? 0)).padStart(3,"0")}°
                  {" / "}
                  {Math.round(next.windVelUsed ?? flight.windVel ?? 0)} kt
                </>
              )}
            </span>
          </div>

          {next.warnings?.length > 0 && (
            <div className="mb-3 space-y-0.5">
              {next.warnings.map((w, i) => (
                <div key={i} className="text-xs text-amber-300 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />{w}
                </div>
              ))}
            </div>
          )}
          {isEtaPassed && (
            <div className="mb-2 bg-amber-500/20 border border-amber-400/60 rounded-lg px-3 py-2 flex items-center gap-2 animate-pulse">
              <Clock className="w-4 h-4 text-amber-300 shrink-0" />
              <span className="text-amber-200 text-sm font-bold">ETA atingida — confirme passagem</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => next.isVirtual ? markVirtual(next.autoKey) : markCrossed(next.userIdx)}
              className={`${isEtaPassed ? "bg-amber-500 animate-pulse" : isAlert ? "bg-red-600" : next.isVirtual ? "bg-cyan-700" : theme.accentBg} ${next.isVirtual ? "text-white" : theme.accentBgFg} font-bold py-5 rounded-lg text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-all duration-150`}
              style={{ minHeight: 64 }}>
              <CircleCheckBig className="w-5 h-5" /> Agora
            </button>
            <button
              onClick={() => next.isVirtual ? onEditVirtualAta(next.autoKey) : onEditAta(next.userIdx)}
              className={`${theme.panel} border-2 ${next.isVirtual ? "border-cyan-600" : theme.accentBorder} ${next.isVirtual ? theme.cyan : theme.accent} font-bold py-5 rounded-lg text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-all duration-150`}
              style={{ minHeight: 64 }}>
              <Clock className="w-5 h-5" /> Registrar hora
            </button>
          </div>
        </div>
          );
        })()
      ) : (
        <div className="bg-green-500/15 border-2 border-green-500/50 rounded-lg p-6 text-center">
          <CircleCheckBig className={`w-10 h-10 mx-auto ${theme.success} mb-2`} />
          <div className={`text-lg font-bold ${theme.success}`}>Voo concluído</div>
          {computed.length > 0 && computed[computed.length-1].ata && (
            <div className={`text-sm ${theme.fgMuted} mt-1 num`}>
              {computed[computed.length-1].name} · ATA {displayTime(computed[computed.length-1].ata)}
              {computed[computed.length-1].gsActual &&
                ` · GS ${Math.round(computed[computed.length-1].gsActual)} kt`}
            </div>
          )}
          <button onClick={resetFlight}
            className={`mt-3 text-xs uppercase tracking-wider ${theme.fgMuted} underline`}>
            Resetar para próximo voo
          </button>
        </div>
      )}

      <div className={`${theme.panel} border ${theme.panelBorder} rounded-lg px-3 py-2 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <Clock className={`w-4 h-4 ${lastAtaMs != null ? theme.accent : theme.fgFaint}`} />
          <div>
            <div className={`text-[10px] uppercase ${theme.fgFaint}`}>Desde último ponto</div>
            <div className={`text-lg font-bold num cockpit-glow ${lastAtaMs != null ? theme.accent : theme.fgFaint}`}>
              {lastAtaMs != null
                ? `${String(elapsedMin).padStart(2,"0")}:${String(elapsedSec).padStart(2,"0")}`
                : "--:--"}
            </div>
          </div>
        </div>
        <div className={`w-px h-10 bg-current opacity-20`} />
        <div className="text-right">
          <div className={`text-[10px] uppercase ${theme.fgFaint}`}>Comb. restante est.</div>
          <div className={`text-lg font-bold num cockpit-glow ${fuelColor}`}>
            {Math.round(currentFuel)} <span className={`text-xs ${theme.fgFaint}`}>gal</span>
          </div>
          <div className={`text-[10px] num ${theme.fgFaint}`}>{fuelPct.toFixed(0)}% de {fuelStart}</div>
        </div>
      </div>

      <div className="space-y-1">
        <div className={`flex items-center justify-between text-[10px] uppercase tracking-widest ${theme.fgFaint} px-1`}>
          <span>Rota</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setViewMode(viewMode === "leg" ? "cum" : "leg")}
              className={`${theme.fgMuted} px-2 py-1 border ${theme.panelBorder} rounded text-[10px]`}>
              {viewMode === "leg" ? "Por Perna" : "Acumulado"}
            </button>
            <button onClick={resetFlight} className={`flex items-center gap-1 ${theme.fgMuted}`}>
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>
        </div>
        {liveRoute.map((item, i) => {
          const hasLiveBase = !!flight.atd || anyWpCrossed;
          const originEta = item.isOrigin ? (flight.atd ? parseHHMM(flight.atd) : null) : null;
          return (
          <CheckpointRow key={item.isVirtual ? item.autoKey : `u${item.userIdx}`}
            cp={item} index={i}
            isNext={i === nextLiveIdx}
            etaPlanned={item.isOrigin ? originEta : item.etaPlanned}
            etaOriginLabel={item.isOrigin ? (flight.atd ? "ATD" : null) : undefined}
            etaLive={(!item.isVirtual && !item.isOrigin && item.userIdx != null) ? liveETAs[item.userIdx] : null}
            crossed={item.ata != null}
            isOrigin={item.isOrigin}
            isVirtual={item.isVirtual}
            hasLiveBase={hasLiveBase}
            departDelay={departDelay}
            viewMode={viewMode}
            onEditAta={() => item.isVirtual ? onEditVirtualAta(item.autoKey) : onEditAta(item.userIdx)}
            onEditNotes={() => !item.isVirtual && onEditNotes(item.userIdx)}

            onUnmarkVirtual={item.isVirtual ? () => unmarkVirtual(item.autoKey) : null}
          />
          );
        })}
      </div>

      <div className={`${theme.panel} border ${theme.panelBorder} rounded-lg p-3 grid grid-cols-3 gap-3 text-center`}>
        <div>
          <div className={`text-[10px] uppercase ${theme.fgFaint}`}>Dist Total</div>
          <div className={`text-base font-bold num ${theme.fg}`}>{computed[computed.length-1]?.cumDist?.toFixed(0)||0} NM</div>
        </div>
        <div>
          <div className={`text-[10px] uppercase ${theme.fgFaint}`}>Tempo Total</div>
          <div className={`text-base font-bold num ${theme.fg}`}>{(computed[computed.length-1]?.cumTime||0).toFixed(0)} min</div>
        </div>
        <div>
          <div className={`text-[10px] uppercase ${theme.fgFaint}`}>Cruzados</div>
          <div className={`text-base font-bold num ${theme.fg}`}>
            {computed.filter(c=>c.ata!=null).length}/{computed.filter(c=>!c.isOrigin).length}
          </div>
        </div>
      </div>
    </div>
  );
}

export { FlightTab };
