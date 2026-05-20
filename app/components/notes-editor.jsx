// NotesEditor — extracted from app/main.jsx (phase B of cleanup).
// See CLAUDE.md "Extrair um componente" for the audit recipe used.

import { useState, useEffect, useMemo, useRef } from "react";
import { useTheme } from "../context/app-context.jsx?v=20260520.0128";
import { Button, IconButton } from "../ui/button.jsx?v=20260520.0128";
import { TextArea } from "../ui/text-field.jsx?v=20260520.0128";
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
          <IconButton onClick={onClose} aria-label="Fechar" icon={<X className="w-5 h-5" />} />
        </div>
        <div className={`text-[10px] ${theme.fgFaint}`}>
          Anote frequências, QNH, instruções ATC, pista em uso ou qualquer observação relevante.
        </div>
        <TextArea
          value={text}
          onChange={setText}
          placeholder="Ex: QNH 1008, pista 28R, espere 3000ft até RIPLI..."
          autoFocus
          rows={5}
          size="lg"
        />
        <div className="grid grid-cols-2 gap-2">
          {text && (
            <Button variant="danger" size="md" onClick={() => { setText(""); onSave(""); }}>
              Limpar nota
            </Button>
          )}
          <Button variant="primary" size="md" className={text ? "" : "col-span-2"} onClick={() => onSave(text)}>
            Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}
export { NotesEditor };
