// AircraftEditor / FleetManager — extracted from app/main.jsx (phase B of cleanup).
// See CLAUDE.md "Extrair um componente" for the audit recipe used.

import { useState, useEffect, useMemo, useRef } from "react";
import { useTheme } from "../context/app-context.jsx?v=20260520.0054";
import {
  Plus, X,
} from "lucide-react";

function AircraftEditor({ aircraft, onSave, onClose }) {
  const theme = useTheme();
  const [ac, setAc] = useState({ ...aircraft });
  const setN = (k, v) => setAc((a) => ({ ...a, [k]: v === '' ? 0 : Number(v) }));
  const setS = (k, v) => setAc((a) => ({ ...a, [k]: v }));

  const fieldClass = `w-full ${theme.inputBg} border-2 ${theme.inputBorder} ${theme.fg} px-3 py-2.5 text-base rounded-xl num focus:${theme.accentBorder} focus:outline-none focus:ring-2 focus:ring-amber-500/30`;
  const labelClass = `text-[10px] uppercase tracking-widest ${theme.fgFaint} mb-1 block`;

  const isValid = ac.name?.trim() && ac.short?.trim() && ac.tasCruise > 0 && ac.gphCruise > 0 && ac.fuelUsable > 0;

  return (
    <div className="fixed inset-0 z-40 bg-black/85 flex flex-col" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className={`mt-auto w-full ${theme.panel} border-t ${theme.panelBorder} rounded-t-2xl flex flex-col`}
        style={{ maxHeight: '92vh' }}>
        <div className={`flex items-center justify-between px-4 pt-4 pb-2 border-b ${theme.panelBorder} shrink-0`}>
          <h3 className={`text-sm uppercase tracking-widest font-bold ${theme.accent}`}>
            {aircraft.name ? `Editar · ${aircraft.short}` : 'Nova aeronave'}
          </h3>
          <button onClick={onClose} aria-label="Fechar"><X className={`w-5 h-5 ${theme.fgFaint}`} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-4">
          {/* Identity */}
          <div>
            <div className={`text-[10px] uppercase tracking-widest ${theme.accent} mb-2`}>Identificação</div>
            <div className="space-y-2">
              <div>
                <label className={labelClass}>Nome completo</label>
                <input className={fieldClass} value={ac.name} onChange={(e) => setS('name', e.target.value)} placeholder="Ex: Beechcraft Baron 58" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>Código curto</label>
                  <input className={fieldClass} value={ac.short} onChange={(e) => setS('short', e.target.value.toUpperCase())} placeholder="BE58" maxLength={8} />
                </div>
                <div>
                  <label className={labelClass}>Motor</label>
                  <input className={fieldClass} value={ac.engine} onChange={(e) => setS('engine', e.target.value)} placeholder="Pistão IO-550" />
                </div>
              </div>
            </div>
          </div>

          {/* Speeds */}
          <div>
            <div className={`text-[10px] uppercase tracking-widest ${theme.accent} mb-2`}>Velocidades (kt)</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={labelClass}>TAS Cruzeiro</label>
                <input className={fieldClass} type="number" value={ac.tasCruise || ''} onChange={(e) => setN('tasCruise', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Vy Subida</label>
                <input className={fieldClass} type="number" value={ac.vy || ''} onChange={(e) => setN('vy', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>V Descida</label>
                <input className={fieldClass} type="number" value={ac.vDescent || ''} onChange={(e) => setN('vDescent', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Rates */}
          <div>
            <div className={`text-[10px] uppercase tracking-widest ${theme.accent} mb-2`}>Razões (ft/min)</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>ROC Subida</label>
                <input className={fieldClass} type="number" value={ac.rocClimb || ''} onChange={(e) => setN('rocClimb', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>ROD Descida</label>
                <input className={fieldClass} type="number" value={ac.rodDescent || ''} onChange={(e) => setN('rodDescent', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Fuel burn */}
          <div>
            <div className={`text-[10px] uppercase tracking-widest ${theme.accent} mb-2`}>Consumo (GPH)</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={labelClass}>Subida</label>
                <input className={fieldClass} type="number" value={ac.gphClimb || ''} onChange={(e) => setN('gphClimb', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Cruzeiro</label>
                <input className={fieldClass} type="number" value={ac.gphCruise || ''} onChange={(e) => setN('gphCruise', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Descida</label>
                <input className={fieldClass} type="number" value={ac.gphDescent || ''} onChange={(e) => setN('gphDescent', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Capacity */}
          <div>
            <div className={`text-[10px] uppercase tracking-widest ${theme.accent} mb-2`}>Capacidade</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={labelClass}>Fuel (gal)</label>
                <input className={fieldClass} type="number" value={ac.fuelUsable || ''} onChange={(e) => setN('fuelUsable', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>MTOW (lbs)</label>
                <input className={fieldClass} type="number" value={ac.mtow || ''} onChange={(e) => setN('mtow', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>BEW (lbs)</label>
                <input className={fieldClass} type="number" value={ac.bew || ''} onChange={(e) => setN('bew', e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div className={`px-4 py-3 border-t ${theme.panelBorder} shrink-0`}>
          <button
            onClick={() => isValid && onSave(ac)}
            className={`w-full rounded-xl py-3 text-sm font-bold uppercase tracking-widest ${
              isValid ? `${theme.accentBg} text-black` : 'bg-zinc-800 text-zinc-500'
            }`}
          >
            Salvar aeronave
          </button>
        </div>
      </div>
    </div>
  );
}

function FleetManager({ fleet, onEdit, onDelete, onReset, onAdd, onClose }) {
  const theme = useTheme();
  return (
    <div className="fixed inset-0 z-30 bg-black/80 flex flex-col" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className={`mt-auto w-full ${theme.panel} border-t ${theme.panelBorder} rounded-t-2xl flex flex-col`}
        style={{ maxHeight: '90vh' }}>
        <div className={`flex items-center justify-between px-4 pt-4 pb-2 border-b ${theme.panelBorder}`}>
          <h3 className={`text-sm uppercase tracking-widest font-bold ${theme.accent}`}>Frota</h3>
          <button onClick={onClose} aria-label="Fechar"><X className={`w-5 h-5 ${theme.fgFaint}`} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
          {Object.entries(fleet).map(([id, ac]) => (
            <div key={id} className={`${theme.panel} border ${theme.panelBorder} rounded-xl px-3 py-3`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className={`font-bold text-sm ${theme.fg}`}>{ac.name}</div>
                  <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>{ac.short} · {ac.engine}</div>
                  <div className={`text-[10px] ${theme.fgMuted} mt-0.5`}>
                    TAS {ac.tasCruise}kt · Vy {ac.vy}kt · {ac.fuelUsable}gal
                  </div>
                </div>
                <div className="flex gap-2 shrink-0 ml-2">
                  {ac.isBuiltIn && FLEET_DEFAULTS[id] && (
                    <button onClick={() => onReset(id)}
                      className={`text-[10px] uppercase ${theme.fgFaint} border ${theme.panelBorder} rounded-lg px-2 py-1`}>
                      Reset
                    </button>
                  )}
                  {!ac.isBuiltIn && (
                    <button onClick={() => onDelete(id)}
                      className="text-[10px] uppercase text-red-400 border border-red-900 rounded-lg px-2 py-1">
                      Remover
                    </button>
                  )}
                  <button onClick={() => onEdit(ac)}
                    className={`text-[10px] uppercase ${theme.accent} border ${theme.accentBorder} rounded-lg px-2 py-1`}>
                    Editar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className={`px-4 py-3 border-t ${theme.panelBorder}`}>
          <button onClick={onAdd}
            className={`w-full ${theme.accentBg} text-black font-bold rounded-xl py-3 text-sm uppercase tracking-widest flex items-center justify-center gap-2`}>
            <Plus className="w-4 h-4" /> Nova aeronave
          </button>
        </div>
      </div>
    </div>
  );
}
export { AircraftEditor, FleetManager };
