// FPLImporter — extracted from app/main.jsx (phase B of cleanup).
// See CLAUDE.md "Extrair um componente" for the audit recipe used.

import { useState, useEffect, useMemo, useRef } from "react";
import { useTheme } from "../context/app-context.jsx?v=20260520.0128";
import { Button, IconButton } from "../ui/button.jsx?v=20260520.0128";
import { TextArea } from "../ui/text-field.jsx?v=20260520.0128";
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
          <IconButton onClick={onClose} aria-label="Fechar" icon={<X className="w-5 h-5" />} />
        </div>
        <div className={`text-[10px] ${theme.fgFaint}`}>
          Cole o campo 15 do FPL ICAO (ou só a sequência de waypoints).
          O app extrai os fixos e adiciona à rota — você ajusta TC e distância depois.
        </div>
        <TextArea
          value={text}
          onChange={setText}
          placeholder="Ex: DCT EMBOI UZ23 RIPLI DCT TOD"
          rows={4}
          numeric
        />
        <Button variant="primary" size="md" disabled={!text.trim()} onClick={() => onImport(text)}>
          Importar
        </Button>
      </div>
    </div>
  );
}
export { FPLImporter };
