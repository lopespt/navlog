// FPLImporter — extracted from app/main.jsx (phase B of cleanup).
// See CLAUDE.md "Extrair um componente" for the audit recipe used.

import { useState, useEffect, useMemo, useRef } from "react";
import { useTheme } from "../context/app-context.jsx?v=20260517.2304";
import {
  X,
} from "lucide-react";

function FPLImporter({ onImport, onClose }) {
  const theme = useTheme();
  const [text, setText] = useState("");
  return (
    <div className="fixed inset-0 z-30 bg-black/80 flex items-end" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className={`w-full ${theme.panel} border-t ${theme.panelBorder} rounded-t-2xl p-4 space-y-3`}>
        <div className="flex items-center justify-between">
          <h3 className={`text-sm uppercase tracking-widest ${theme.accent} font-bold`}>Importar rota FPL</h3>
          <button onClick={onClose} aria-label="Fechar"><X className={`w-5 h-5 ${theme.fgFaint}`} /></button>
        </div>
        <div className={`text-[10px] ${theme.fgFaint}`}>
          Cole o campo 15 do FPL ICAO (ou só a sequência de waypoints).
          O app extrai os fixos e adiciona à rota — você ajusta TC e distância depois.
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ex: DCT EMBOI UZ23 RIPLI DCT TOD"
          className={`w-full ${theme.inputBg} border ${theme.inputBorder} ${theme.fg} px-3 py-2 text-sm rounded h-24 num focus:${theme.accentBorder} focus:outline-none focus:ring-2 focus:ring-amber-500/30`}
        />
        <button
          disabled={!text.trim()}
          onClick={() => onImport(text)}
          className={`w-full ${theme.accentBg} disabled:opacity-50 ${theme.accentBgFg} rounded py-3 font-bold text-sm`}
        >
          Importar
        </button>
      </div>
    </div>
  );
}
export { FPLImporter };
