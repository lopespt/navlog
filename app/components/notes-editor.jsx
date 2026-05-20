// NotesEditor — extracted from app/main.jsx (phase B of cleanup).
// See CLAUDE.md "Extrair um componente" for the audit recipe used.

import { useState, useEffect, useMemo, useRef } from "react";
import { useTheme } from "../context/app-context.jsx?v=20260520.1003";
import { Button } from "../ui/button.jsx?v=20260520.1003";
import { TextArea } from "../ui/text-field.jsx?v=20260520.1003";
import { BottomSheet } from "../ui/bottom-sheet.jsx?v=20260520.1003";
import { FileText } from "lucide-react";

function NotesEditor({ checkpoint, onSave, onClose }) {
  const theme = useTheme();
  const [text, setText] = useState(checkpoint.notes || "");
  return (
    <BottomSheet
      title={`${checkpoint.name} — Notas`}
      icon={<FileText className="w-4 h-4" />}
      onClose={onClose}
    >
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
    </BottomSheet>
  );
}
export { NotesEditor };
