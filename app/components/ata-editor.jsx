// AtaEditor — extracted from app/main.jsx (phase B of cleanup).
// See CLAUDE.md "Extrair um componente" for the audit recipe used.

import { useState, useEffect, useMemo, useRef } from "react";
import { useTheme } from "../context/app-context.jsx?v=20260520.0108";
import { Button } from "../ui/button.jsx?v=20260520.0108";
import {
  ChevronLeft, Clock, X,
} from "lucide-react";

function AtaEditor({ checkpoint, eobt, prevAta, etaPlanned, etaLive, onSave, onClear, onClose, onUseNow, fieldLabel, confirmLabel, clearLabel }) {
  const theme = useTheme();
  // Representação interna: string de dígitos puros, máx 6 (HHMMSS)
  const initialDigits = checkpoint.ata
    ? checkpoint.ata.replace(/:/g, "").slice(0, 6)
    : "";
  const [digits, setDigits] = useState(initialDigits);

  // Formata dígitos → "HH:MM:SS" para armazenamento
  function digitsToHHMMSS(d) {
    return `${d[0]||"0"}${d[1]||"0"}:${d[2]||"0"}${d[3]||"0"}:${d[4]||"0"}${d[5]||"0"}`;
  }

  // Valida: 6 dígitos, HH 00-23, MM 00-59, SS 00-59
  function isValid(d) {
    if (d.length !== 6) return false;
    const hh = parseInt(d.slice(0, 2), 10);
    const mm = parseInt(d.slice(2, 4), 10);
    const ss = parseInt(d.slice(4, 6), 10);
    return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59 && ss >= 0 && ss <= 59;
  }

  function pressDigit(n) {
    setDigits((prev) => (prev.length < 6 ? prev + String(n) : prev));
  }
  function backspace() {
    setDigits((prev) => prev.slice(0, -1));
  }
  function useNow() {
    setDigits(formatHHMMSS(nowHHMM()).replace(/:/g, ""));
  }

  const valid = isValid(digits);

  // Delta entre ATA digitada e ETA planejada
  const deltaMin = useMemo(() => {
    if (!valid || etaPlanned == null) return null;
    const hh = parseInt(digits.slice(0, 2), 10);
    const mm = parseInt(digits.slice(2, 4), 10);
    const ss = parseInt(digits.slice(4, 6), 10);
    const ataMin = hh * 60 + mm + ss / 60;
    let d = ataMin - etaPlanned;
    // Ajusta crossing de meia-noite
    if (d > 720) d -= MINUTES_PER_DAY;
    if (d < -720) d += MINUTES_PER_DAY;
    return d;
  }, [digits, valid, etaPlanned]);

  const deltaColor =
    deltaMin == null ? theme.fgFaint :
    deltaMin > 2  ? theme.danger :
    deltaMin < -2 ? theme.success :
    theme.fgFaint;

  const sign = deltaMin == null ? "" : deltaMin >= 0 ? "+" : "−";
  const absD = deltaMin == null ? null : Math.abs(Math.round(deltaMin));

  // Layout do teclado numérico: linhas [1,2,3], [4,5,6], [7,8,9], [⌫,0,↩]
  const keys = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ];

  return (
    <div className="fixed inset-0 z-30 bg-black/85 flex items-end" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className={`w-full ${theme.panel} border-t ${theme.panelBorder} rounded-t-2xl p-4 space-y-3`}>

        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className={`text-sm uppercase tracking-widest ${theme.accent} font-bold`}>
            {checkpoint.ata ? (fieldLabel ? `Editar ${fieldLabel}` : "Editar passagem") : (fieldLabel ? `Registrar ${fieldLabel}` : "Marcar passagem")}
          </h3>
          <button onClick={onClose} aria-label="Fechar"><X className={`w-5 h-5 ${theme.fgFaint}`} /></button>
        </div>

        {/* Waypoint + ETAs */}
        <div className={`${theme.panel} border ${theme.panelBorder} rounded-lg px-4 py-3`}>
          <div className="flex items-center justify-between">
            {/* Nome do waypoint */}
            <div>
              <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint}`}>Waypoint</div>
              <div className={`text-2xl font-black ${theme.accent} cockpit-glow`}>{checkpoint.name}</div>
            </div>

            {/* ETA planejada e atualizada */}
            <div className="text-right space-y-1">
              <div className="flex items-center justify-end gap-3">
                <div>
                  <div className={`text-[10px] uppercase ${theme.fgFaint}`}>ETA plan.</div>
                  <div className={`text-lg font-bold num ${theme.fgMuted}`}>
                    {etaPlanned != null ? formatHHMM(etaPlanned) : "--:--"}
                  </div>
                </div>
                {etaLive != null && (
                  <div>
                    <div className={`text-[10px] uppercase ${theme.cyan}`}>ETA atual.</div>
                    <div className={`text-lg font-bold num ${theme.cyan}`}>
                      {formatHHMM(etaLive)}
                    </div>
                  </div>
                )}
              </div>
              {prevAta && (
                <div className={`text-[10px] num ${theme.fgFaint} text-right`}>
                  Checkpoint anterior: <span className={theme.fgMuted}>{prevAta}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Display do horário digitado */}
        <div className="text-center">
          <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint} mb-1`}>{fieldLabel ?? "ATA"} (UTC)</div>
          <div className={`text-4xl font-black num tracking-widest cockpit-glow transition-colors ${
            digits.length === 0 ? theme.fgFaint :
            valid ? theme.accent : theme.fgMuted
          }`}>
            {/* HH : MM : SS — renderiza dígito a dígito */}
            {[0,1,null,2,3,null,4,5].map((dIdx, i) => {
              if (dIdx === null) return <span key={`sep${i}`} className={`${theme.fgFaint} mx-0.5 text-3xl`}>:</span>;
              const ch = digits[dIdx];
              const ph = dIdx < 2 ? "H" : dIdx < 4 ? "M" : "S";
              return <span key={i} className={ch ? "" : "opacity-20"}>{ch || ph}</span>;
            })}
          </div>
          {/* Delta */}
          <div className={`text-sm font-bold num mt-1 h-5 ${deltaColor}`}>
            {deltaMin != null && absD > 0
              ? `${sign}${absD} min em relação à ETA`
              : deltaMin != null && absD === 0
              ? "No horário"
              : ""}
          </div>
        </div>

        {/* Teclado numérico */}
        <div className="space-y-2">
          {keys.map((row, ri) => (
            <div key={ri} className="grid grid-cols-3 gap-2">
              {row.map((n) => (
                <button
                  key={n}
                  onClick={() => pressDigit(n)}
                  className={`${theme.panel} border ${theme.panelBorder} rounded-xl py-4 text-2xl font-bold num ${theme.fg} active:scale-95 active:${theme.accentBg} active:${theme.accentBgFg} transition-all duration-150`}
                >
                  {n}
                </button>
              ))}
            </div>
          ))}
          {/* Última linha: CLR, 0, ⌫, Agora */}
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => setDigits("")}
              className={`${theme.panel} border ${theme.panelBorder} rounded-xl py-4 text-sm font-bold ${theme.fgMuted} active:scale-95 transition-transform duration-100`}
            >
              CLR
            </button>
            <button
              onClick={() => pressDigit(0)}
              className={`${theme.panel} border ${theme.panelBorder} rounded-xl py-4 text-2xl font-bold num ${theme.fg} active:scale-95 transition-transform duration-100`}
            >
              0
            </button>
            <button
              onClick={backspace}
              className={`${theme.panel} border ${theme.panelBorder} rounded-xl py-4 flex items-center justify-center ${theme.fgMuted} active:scale-95 transition-transform duration-100`}
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={useNow}
              className={`${theme.panel} border ${theme.accentBorder} rounded-xl py-4 text-sm font-bold ${theme.accent} flex items-center justify-center gap-1 active:scale-95 transition-transform duration-100`}
            >
              <Clock className="w-4 h-4" /> Agora
            </button>
          </div>
        </div>

        {/* Ações */}
        <div className="space-y-2 pt-1">
          <Button variant="primary" size="xl" disabled={!valid} onClick={() => onSave(digitsToHHMMSS(digits))}>
            {confirmLabel ?? "Confirmar passagem"}
          </Button>
          {checkpoint.ata && (
            <Button variant="danger" size="md" onClick={onClear}>
              <X className="w-4 h-4" /> {clearLabel ?? "Limpar passagem registrada"}
            </Button>
          )}
          <Button variant="secondary" size="md" onClick={onClose}>
            Cancelar
          </Button>
        </div>

      </div>
    </div>
  );
}
export { AtaEditor };
