// FuelTab — extracted from app/main.jsx. See CLAUDE.md "Extrair um
// componente de app/main.jsx" for the audit recipe used to verify the
// imports below match every JSX element + bare-identifier call.

import { useState, useEffect, useMemo, useRef } from "react";
import {
  AlertTriangle, CircleCheckBig, Fuel,
} from "lucide-react";
import { Section } from "./ui-primitives.jsx?v=20260517.2347";

import { useTheme, useDerived, useFlight } from "../context/app-context.jsx?v=20260517.2347";
function FuelRow({ label, time, fuel, bold, accent }) {
  const theme = useTheme();
  return (
    <div className={`flex items-center justify-between px-3 py-2 ${bold ? "bg-black/20" : ""}`}>
      <div className={`${bold ? "font-bold" : ""} ${accent ? theme.accent : theme.fgMuted} text-sm`}>
        {label}
      </div>
      <div className="flex items-center gap-3 text-sm num">
        {time != null && <span className={`${theme.fgFaint} text-xs`}>{time.toFixed(0)} min</span>}
        <span className={`${bold ? "font-bold" : ""} ${accent ? theme.accent : theme.fg}`}>
          {fuel.toFixed(1)} gal
        </span>
      </div>
    </div>
  );
}

function FuelTab({  }) {
  const { flight, ac } = useFlight();
  const { computed, liveFuel } = useDerived();
  const theme = useTheme();
  const fuelStart = flight.fuelInitial ?? ac.fuelUsable;

  const tripByPhase = useMemo(() => {
    const acc = { SUBIDA: { time: 0, fuel: 0 }, CRUZEIRO: { time: 0, fuel: 0 }, DESCIDA: { time: 0, fuel: 0 } };
    computed.forEach((cp) => {
      if (cp.isOrigin || !cp.portions || !cp.portions.length) return;
      const totalDist = cp.dist || 0;
      if (totalDist <= 0) return;
      cp.portions.forEach((p) => {
        const portionETE = (p.dist / totalDist) * (cp.etePlanned || 0);
        const portionFuel = (portionETE / 60) * p.gph;
        if (acc[p.phase]) {
          acc[p.phase].time += portionETE;
          acc[p.phase].fuel += portionFuel;
        }
      });
    });
    return acc;
  }, [computed]);

  const taxi = { time: 5, gph: ac.gphCruise / 2, fuel: (5 / 60) * (ac.gphCruise / 2) };
  const approach = { time: 5, gph: ac.gphCruise, fuel: (5 / 60) * ac.gphCruise };
  const tripTotal =
    tripByPhase.SUBIDA.fuel + tripByPhase.CRUZEIRO.fuel + tripByPhase.DESCIDA.fuel
    + taxi.fuel + approach.fuel;
  const altn = 12;
  const reserve = flight.rules === "IFR"
    ? (45 / 60) * ac.gphCruise
    : (30 / 60) * ac.gphCruise;
  const cont = tripTotal * 0.05;
  const totalReq = tripTotal + altn + reserve + cont;
  const margin = fuelStart - totalReq;
  const ok = margin >= 0;

  const lastFuel = useMemo(() => {
    for (let i = liveFuel.length - 1; i >= 0; i--) {
      if (liveFuel[i] != null) return liveFuel[i];
    }
    return fuelStart;
  }, [liveFuel, fuelStart]);

  const pct = Math.max(0, Math.min(100, (lastFuel / fuelStart) * 100));

  return (
    <div className="px-3 py-3 space-y-3">
      <div className={`${theme.panel} border ${theme.panelBorder} rounded-lg p-4`}>
        <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint} mb-2`}>Combustível atual</div>
        <div className="flex items-baseline gap-2 mb-3">
          <span className={`text-5xl font-black num ${theme.accent} cockpit-glow`}>{Math.round(lastFuel)}</span>
          <span className={`${theme.fgFaint} text-sm`}>/ {fuelStart} gal</span>
        </div>
        <div className="h-3 bg-black/40 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-150 ${
              pct < 25 ? "bg-red-500" : pct < 50 ? "bg-amber-500" : "bg-green-500"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className={`flex justify-between mt-1 text-[10px] num ${theme.fgFaint}`}>
          <span>0</span><span>{Math.round(fuelStart / 2)}</span><span>{fuelStart}</span>
        </div>
      </div>

      <Section icon={<Fuel className="w-4 h-4" />} title="Cálculo de combustível">
        <div className={`${theme.panel} border ${theme.panelBorder} rounded divide-y ${theme.panelBorder} text-sm`}>
          <FuelRow label="Taxi e decolagem" time={taxi.time} fuel={taxi.fuel} />
          <FuelRow label="Subida" time={tripByPhase.SUBIDA.time} fuel={tripByPhase.SUBIDA.fuel} />
          <FuelRow label="Cruzeiro" time={tripByPhase.CRUZEIRO.time} fuel={tripByPhase.CRUZEIRO.fuel} />
          <FuelRow label="Descida" time={tripByPhase.DESCIDA.time} fuel={tripByPhase.DESCIDA.fuel} />
          <FuelRow label="Aproximação e pouso" time={approach.time} fuel={approach.fuel} />
          <FuelRow label="Trip Fuel" fuel={tripTotal} bold />
          <FuelRow label="Alternado" fuel={altn} />
          <FuelRow label={`Reserva ${flight.rules}`} fuel={reserve} />
          <FuelRow label="Contingência (5%)" fuel={cont} />
          <FuelRow label="Total Requerido" fuel={totalReq} bold accent />
        </div>
      </Section>

      <div className={`border-2 rounded-lg p-4 ${
        ok ? "bg-green-500/10 border-green-500/40" : "bg-red-500/10 border-red-500/40"
      }`}>
        <div className="flex items-center gap-3">
          {ok ? (
            <CircleCheckBig className={`w-8 h-8 ${theme.success}`} />
          ) : (
            <AlertTriangle className={`w-8 h-8 ${theme.danger}`} />
          )}
          <div>
            <div className={`text-base font-bold ${ok ? theme.success : theme.danger}`}>
              {ok ? "OK" : "INSUFICIENTE"}
            </div>
            <div className={`text-xs ${theme.fgMuted} num`}>
              Margem: {margin > 0 ? "+" : ""}{margin.toFixed(1)} gal
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { FuelTab };
