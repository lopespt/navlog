// NotesEditor — extracted from app/main.jsx (phase B of cleanup).
// See CLAUDE.md "Extrair um componente" for the audit recipe used.

import { useState, useEffect, useMemo, useRef } from "react";
import { useTheme } from "../context/app-context.jsx?v=20260517.2256";
import {
  FileText, X,
} from "lucide-react";

function NotesEditor({ checkpoint, onSave, onClose }) {
  const theme = useTheme();
  const [text, setText] = useState(checkpoint.notes || "");
  return (
    <div className="fixed inset-0 z-30 bg-black/80 flex items-end" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className={`w-full ${theme.panel} border-t ${theme.panelBorder} rounded-t-2xl p-4 space-y-3`}>
        <div className="flex items-center justify-between">
          <h3 className={`text-sm uppercase tracking-widest ${theme.accent} font-bold flex items-center gap-2`}>
            <FileText className="w-4 h-4" /> {checkpoint.name} — Notas
          </h3>
          <button onClick={onClose} aria-label="Fechar"><X className={`w-5 h-5 ${theme.fgFaint}`} /></button>
        </div>
        <div className={`text-[10px] ${theme.fgFaint}`}>
          Anote frequências, QNH, instruções ATC, pista em uso ou qualquer observação relevante.
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ex: QNH 1008, pista 28R, espere 3000ft até RIPLI..."
          autoFocus
          rows={5}
          className={`w-full ${theme.inputBg} border ${theme.inputBorder} ${theme.fg} px-3 py-2.5 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none`}
        />
        <div className="grid grid-cols-2 gap-2">
          {text && (
            <button onClick={() => { setText(""); onSave(""); }}
              className="bg-red-900/40 border border-red-800 text-red-300 rounded-xl py-3 text-sm font-bold active:scale-95">
              Limpar nota
            </button>
          )}
          <button onClick={() => onSave(text)}
            className={`${text ? "" : "col-span-2"} ${theme.accentBg} ${theme.accentBgFg} rounded-xl py-3 font-bold text-sm active:scale-95`}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
export { NotesEditor };
