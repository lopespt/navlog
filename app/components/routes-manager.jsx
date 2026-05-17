// RoutesManager — extracted from app/main.jsx (phase B of cleanup).
// See CLAUDE.md "Extrair um componente" for the audit recipe used.

import { useState, useEffect, useMemo, useRef } from "react";
import {
  FolderOpen, Save, Trash, X,
} from "lucide-react";

function RoutesManager({ routes, currentFlight, onLoad, onDelete, onSaveCurrent, onClose }) {
  const sorted = [...routes].sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
  return (
    <div className="fixed inset-0 z-30 bg-zinc-950/95 flex items-end" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-h-[85vh] bg-zinc-900 border-t border-zinc-700 rounded-t-2xl flex flex-col">
        <div className="px-4 py-3 flex items-center justify-between border-b border-zinc-800">
          <h3 className="text-sm uppercase tracking-widest text-amber-400 font-bold flex items-center gap-2">
            <FolderOpen className="w-4 h-4" /> Rotas salvas
          </h3>
          <button onClick={onClose} aria-label="Fechar"><X className="w-5 h-5 text-zinc-500" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {sorted.length === 0 && (
            <div className="text-center py-8 text-zinc-500 text-sm">
              Nenhuma rota salva ainda.
              <div className="text-xs mt-1">Use o botão Salvar no topo para guardar a rota atual.</div>
            </div>
          )}
          {sorted.map((route) => (
            <div key={route.id} className="bg-zinc-950 border border-zinc-800 rounded p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-amber-400 truncate">{route.name}</div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">
                    {route.flight.origin} → {route.flight.destination}
                    {route.flight.alternate ? ` · ALTN ${route.flight.alternate}` : ""}
                  </div>
                  <div className="text-[10px] text-zinc-600 num mt-0.5">
                    {route.flight.checkpoints.length} pontos · {FLEET_DEFAULTS[route.flight.aircraftKey]?.short || "—"}
                  </div>
                </div>
                <button
                  onClick={() => onDelete(route.id)}
                  className="text-zinc-600 hover:text-red-400 p-1 active:scale-90 transition"
                  aria-label="Excluir rota"
                >
                  <Trash className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={() => onLoad(route)}
                className="w-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded py-2 text-xs uppercase tracking-wider font-bold transition-colors"
              >
                Carregar esta rota
              </button>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-zinc-800">
          <button
            onClick={onSaveCurrent}
            className="w-full bg-amber-500 text-zinc-950 rounded py-3 font-bold text-sm flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" /> Salvar rota atual
          </button>
        </div>
      </div>
    </div>
  );
}
export { RoutesManager };
