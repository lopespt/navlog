// FPLImporter — extracted from app/main.jsx (phase B of cleanup).
// See CLAUDE.md "Extrair um componente" for the audit recipe used.

import { useState, useEffect, useMemo, useRef } from "react";
import { useTheme } from "../context/app-context.jsx?v=20260520.1003";
import { Button } from "../ui/button.jsx?v=20260520.1003";
import { TextArea } from "../ui/text-field.jsx?v=20260520.1003";
import { BottomSheet } from "../ui/bottom-sheet.jsx?v=20260520.1003";

function FPLImporter({ onImport, onClose }) {
  const theme = useTheme();
  const [text, setText] = useState("");
  return (
    <BottomSheet title="Importar rota FPL" onClose={onClose}>
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
    </BottomSheet>
  );
}
export { FPLImporter };
