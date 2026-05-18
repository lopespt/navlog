// LogTab — extracted from app/main.jsx. See CLAUDE.md "Extrair um
// componente de app/main.jsx" for the audit recipe used to verify the
// imports below match every JSX element + bare-identifier call.

import { useState, useEffect, useMemo, useRef } from "react";
import {
  BookOpen, Clock,
} from "lucide-react";
import { Section } from "./ui-primitives.jsx?v=20260518.0029";

import { useTheme, useDerived, useFlight } from "../context/app-context.jsx?v=20260518.0029";
function CompareRow({ label, plan, real }) {
  const theme = useTheme();
  return (
    <div className={`grid grid-cols-3 px-3 py-2 text-sm border-b ${theme.panelBorder} last:border-b-0`}>
      <div className={theme.fgMuted}>{label}</div>
      <div className={`text-right num ${theme.fgMuted}`}>{plan}</div>
      <div className={`text-right num font-bold ${theme.accent}`}>{real}</div>
    </div>
  );
}

function LogTab({  }) {
  const { flight, ac } = useFlight();
  const { computed, liveFuel } = useDerived();
  const theme = useTheme();
  const fuelStart = flight.fuelInitial ?? ac.fuelUsable;

  // Estatísticas gerais
  const crossed = computed.filter((cp) => cp.ata != null);
  const last = crossed[crossed.length - 1];

  const planTotalDist = computed[computed.length - 1]?.cumDist || 0;
  const planTotalTime = computed[computed.length - 1]?.cumTime || 0;
  const planTotalFuel = fuelStart - (computed[computed.length - 1]?.fuelRemPlanned || fuelStart);

  // Tempo real total = ATA do último cruzado - EOBT
  const eobt = parseHHMM(flight.eobt);
  let realTotalTime = null;
  let realTotalDist = 0;
  let realFuelUsed = 0;
  if (last && eobt != null) {
    const lastAta = parseHHMM(last.ata);
    realTotalTime = lastAta - eobt;
    if (realTotalTime < 0) realTotalTime += 1440;
    realTotalDist = last.cumDist || 0;
    const lastFuel = liveFuel[computed.indexOf(last)];
    if (lastFuel != null) realFuelUsed = fuelStart - lastFuel;
  }
  const realGsAvg = realTotalTime > 0 ? (realTotalDist / realTotalTime) * 60 : null;

  return (
    <div className="px-3 py-3 space-y-3">
      <div className={`${theme.panel} border ${theme.panelBorder} rounded-lg p-3`}>
        <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint} mb-2`}>Resumo do voo</div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div>
            <div className={`text-[10px] uppercase ${theme.fgFaint}`}>Origem</div>
            <div className={`text-base font-bold ${theme.accent}`}>{flight.origin}</div>
          </div>
          <div>
            <div className={`text-[10px] uppercase ${theme.fgFaint}`}>Destino</div>
            <div className={`text-base font-bold ${theme.accent}`}>{flight.destination}</div>
          </div>
        </div>
      </div>

      {/* Comparação planejado vs real */}
      <Section icon={<BookOpen className="w-4 h-4" />} title="Planejado vs Real">
        <div className={`${theme.panel} border ${theme.panelBorder} rounded overflow-hidden`}>
          <div className={`grid grid-cols-3 px-3 py-2 text-[10px] uppercase ${theme.fgFaint} border-b ${theme.panelBorder}`}>
            <div>Métrica</div><div className="text-right">Plano</div><div className="text-right">Real</div>
          </div>
          <CompareRow label="Distância (NM)"
            plan={planTotalDist.toFixed(0)} real={realTotalDist > 0 ? realTotalDist.toFixed(0) : "—"} />
          <CompareRow label="Tempo (min)"
            plan={planTotalTime.toFixed(0)} real={realTotalTime != null ? realTotalTime.toFixed(0) : "—"} />
          <CompareRow label="GS médio (kt)"
            plan={planTotalDist > 0 && planTotalTime > 0 ? Math.round((planTotalDist / planTotalTime) * 60) : "—"}
            real={realGsAvg != null ? Math.round(realGsAvg) : "—"} />
          <CompareRow label="Combustível (gal)"
            plan={planTotalFuel.toFixed(1)} real={realFuelUsed > 0 ? realFuelUsed.toFixed(1) : "—"} />
        </div>
      </Section>

      {/* Lista de passagens */}
      <Section icon={<Clock className="w-4 h-4" />} title={`Passagens registradas (${crossed.length})`}>
        {crossed.length === 0 ? (
          <div className={`text-center py-6 ${theme.fgFaint} text-sm`}>
            Nenhuma passagem registrada ainda.
          </div>
        ) : (
          <div className="space-y-1">
            {crossed.map((cp) => {
              const eta = formatHHMM(cp.etaPlanned);
              const ataMin = parseHHMM(cp.ata);
              const delta = ataMin - cp.etaPlanned;
              const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
              const absD = Math.abs(Math.round(delta));
              return (
                <div key={cp.name + cp.ata}
                  className={`${theme.panel} border ${theme.panelBorder} rounded px-3 py-2 flex items-center justify-between`}>
                  <div>
                    <div className={`font-bold ${theme.success}`}>{cp.name}</div>
                    <div className={`text-[10px] ${theme.fgFaint} num`}>
                      ETA {eta} → ATA {displayTime(cp.ata)}
                      {absD > 0 && <span> ({sign}{absD} min)</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-[10px] uppercase ${theme.fgFaint}`}>GS real</div>
                    <div className={`text-sm font-bold num ${theme.fg}`}>
                      {cp.gsActual ? Math.round(cp.gsActual) : "—"} kt
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

export { LogTab };
