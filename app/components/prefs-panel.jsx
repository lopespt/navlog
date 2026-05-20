// PrefsPanel — extracted from app/main.jsx. See CLAUDE.md "Extrair um
// componente de app/main.jsx" for the audit recipe used to verify the
// imports below match every JSX element + bare-identifier call.

import { useState, useEffect, useMemo, useRef } from "react";
import { useTheme, usePrefs } from "../context/app-context.jsx?v=20260520.0054";
import {
  Eye, Moon, Sun, Type, X, RefreshCw,
} from "lucide-react";

// Nuclear cache reset: unregister every Service Worker for this scope,
// delete every Cache Storage entry, then bounce the page with a unique
// query string so the browser HTTP cache layer also misses. Useful when
// GH Pages has deployed a new APP_VERSION but the user's still seeing
// the previous build because some intermediate cache (SW, HTTP, or
// esm.sh edge) is being sticky.
async function forceUpdate() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
    }
  } catch (_) {
    // Best effort — even if something throws, fall through to the reload.
  }
  // Cache-buster reload — bypasses the browser HTTP cache because the URL
  // is unique. location.reload(true) is non-standard / deprecated.
  const sep = location.pathname.includes("?") ? "&" : "?";
  location.href = location.pathname + sep + "_=" + Date.now();
}

function PrefsPanel({ appVersion, onClose }) {
  const { prefs, savePrefs } = usePrefs();
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const onForceUpdate = async () => {
    if (busy) return;
    if (!confirm("Forçar atualização?\n\nIsso vai desregistrar o Service Worker, limpar todos os caches do app e recarregar do servidor. As rotas e preferências salvas (localStorage) ficam.")) return;
    setBusy(true);
    await forceUpdate();
  };

  return (
    <div className="fixed inset-0 z-30 bg-black/80 flex items-end" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className={`w-full ${theme.panel} border-t ${theme.panelBorder} rounded-t-2xl p-4 space-y-4 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between">
          <h3 className={`text-sm uppercase tracking-widest ${theme.accent} font-bold`}>Preferências</h3>
          <button onClick={onClose} aria-label="Fechar"><X className={`w-5 h-5 ${theme.fgFaint}`} /></button>
        </div>

        {/* Tema */}
        <div>
          <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint} mb-2`}>Tema</div>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(themes).map(([key, t]) => (
              <button key={key}
                onClick={() => savePrefs({ ...prefs, theme: key })}
                className={`py-3 px-2 rounded-xl border-2 text-xs font-bold uppercase tracking-wider ${
                  prefs.theme === key ? `${theme.accentBorder} ${theme.accent}` : `${theme.panelBorder} ${theme.fgFaint}`
                }`}>
                {key === "day"   && <Sun  className="w-4 h-4 mx-auto mb-1" />}
                {key === "night" && <Moon className="w-4 h-4 mx-auto mb-1" />}
                {key === "red"   && <Eye  className="w-4 h-4 mx-auto mb-1" />}
                {t.name}
              </button>
            ))}
          </div>
        </div>

        {/* Fonte */}
        <div>
          <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint} mb-2`}>Tamanho da fonte</div>
          <div className="grid grid-cols-3 gap-2">
            {[["s","Pequena"],["m","Média"],["l","Grande"]].map(([k, label]) => (
              <button key={k}
                onClick={() => savePrefs({ ...prefs, fontSize: k })}
                className={`py-3 px-2 rounded-xl border-2 text-xs font-bold uppercase tracking-wider ${
                  prefs.fontSize === k ? `${theme.accentBorder} ${theme.accent}` : `${theme.panelBorder} ${theme.fgFaint}`
                }`}>
                <Type className="w-4 h-4 mx-auto mb-1" style={{ transform: `scale(${k==="s"?0.8:k==="l"?1.2:1})` }} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Alerta de desvio de ETA */}
        <div>
          <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint} mb-2`}>
            Alerta de desvio de ETA — threshold (min)
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[2, 5, 10, 15].map((v) => (
              <button key={v}
                onClick={() => savePrefs({ ...prefs, alertEtaDeltaMin: v })}
                className={`py-3 rounded-xl border-2 text-sm font-bold num ${
                  prefs.alertEtaDeltaMin === v
                    ? `${theme.accentBorder} ${theme.accent}`
                    : `${theme.panelBorder} ${theme.fgFaint}`
                }`}>
                {v} min
              </button>
            ))}
          </div>
          <div className={`text-[10px] ${theme.fgFaint} mt-1`}>
            O card do próximo waypoint acende vermelho quando o desvio superar este valor.
          </div>
        </div>

        {/* Wake lock */}
        <div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={prefs.wakeLock}
              onChange={(e) => savePrefs({ ...prefs, wakeLock: e.target.checked })}
              className="accent-amber-500 w-5 h-5" />
            <div>
              <div className={`text-sm font-bold ${theme.fg}`}>Manter tela ligada</div>
              <div className={`text-[10px] ${theme.fgFaint}`}>Impede que o S24+ apague durante o voo (Wake Lock API)</div>
            </div>
          </label>
        </div>

        <button onClick={onClose}
          className={`w-full ${theme.panel} border ${theme.panelBorder} ${theme.fgMuted} rounded-xl py-3 text-sm font-bold`}>
          Fechar
        </button>
        <div className={`pt-2 border-t ${theme.panelBorder} flex items-center justify-between gap-3`}>
          <div className={`text-[10px] ${theme.fgFaint}`}>
            Navlog v{appVersion}
          </div>
          <button onClick={onForceUpdate} disabled={busy}
            className={`text-[10px] uppercase tracking-widest px-3 py-1.5 rounded border ${theme.panelBorder} ${theme.fgMuted} inline-flex items-center gap-1.5 active:scale-95 disabled:opacity-50`}
            title="Desregistra Service Worker, limpa caches, recarrega do servidor">
            <RefreshCw className={`w-3 h-3 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Atualizando…" : "Forçar atualização"}
          </button>
        </div>
      </div>
    </div>
  );
}

export { PrefsPanel };
