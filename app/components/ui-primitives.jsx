// Shared UI primitives — small, presentational components used by multiple
// app/components/*.jsx files and by app/main.jsx itself. Extracted so each
// consumer can import what it needs without bundling a 6 000-line entry.
//
//   Section     — collapsible card with title + icon, optional defaultOpen
//   Loading     — centered spinner with a label
//   Empty       — empty-state placeholder with icon + title + hint
//   ErrorState  — error display with optional retry button
//   TabButton   — bottom-bar tab toggle (used 6× by NavlogApp)
//   LiveClock   — current UTC time, ticks every 10 s

import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, RefreshCw, MapPin, AlertTriangle } from "lucide-react";

import { useTheme } from "../context/app-context.jsx?v=20260517.2310";
function Section({ icon, title, children, collapsible, defaultOpen }) {
  const theme = useTheme();
  const [open, setOpen] = useState(defaultOpen != null ? defaultOpen : true);
  if (!collapsible) {
    return (
      <section>
        <h2 className={`flex items-center gap-2 text-[10px] uppercase tracking-widest ${theme?.fgMuted || "text-zinc-400"} mb-2`}>
          {icon}{title}
        </h2>
        {children}
      </section>
    );
  }
  return (
    <section>
      <button onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-2 text-[10px] uppercase tracking-widest ${theme?.fgMuted || "text-zinc-400"} mb-2 active:opacity-70`}>
        <span className="flex items-center gap-2">{icon}{title}</span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && children}
    </section>
  );
}

function Loading({ label }) {
  const theme = useTheme();
  return (
    <div className={`flex items-center justify-center gap-2 py-4 text-[10px] uppercase tracking-widest ${theme?.fgFaint || "text-zinc-500"}`}
      role="status" aria-live="polite">
      <RefreshCw className="w-4 h-4 animate-spin" />
      <span>{label || "A carregar…"}</span>
    </div>
  );
}

function Empty({ icon, title, hint }) {
  const theme = useTheme();
  const Ico = icon || MapPin;
  return (
    <div className="flex flex-col items-center text-center py-6 px-4 gap-2">
      <Ico className={`w-8 h-8 ${theme?.fgFaint || "text-zinc-600"} opacity-70`} />
      {title && <div className={`text-sm font-bold ${theme?.fg || "text-zinc-200"}`}>{title}</div>}
      {hint && <div className={`text-xs ${theme?.fgFaint || "text-zinc-500"}`}>{hint}</div>}
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  const theme = useTheme();
  return (
    <div className="flex flex-col items-center text-center py-4 px-4 gap-2"
      role="alert">
      <AlertTriangle className="w-6 h-6 text-red-400" />
      <div className={`text-xs text-red-400`}>{message || "Algo correu mal."}</div>
      {onRetry && (
        <button onClick={onRetry}
          className={`text-[10px] uppercase tracking-widest px-3 py-1.5 rounded border border-red-500/40 text-red-300 active:scale-95`}>
          Tentar de novo
        </button>
      )}
    </div>
  );
}




function TabButton({ active, onClick, icon, label }) {
  const theme = useTheme();
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center py-3 gap-1 transition-colors ${
        active ? (theme?.accent || "text-amber-400") : (theme?.fgFaint || "text-zinc-500")
      }`}
    >
      {icon}
      <span className="text-[10px] uppercase tracking-wider font-bold">{label}</span>
    </button>
  );
}

function LiveClock() {
  const theme = useTheme();
  const [t, setT] = useState(nowHHMM());
  useEffect(() => {
    const id = setInterval(() => setT(nowHHMM()), 1000 * 10);
    return () => clearInterval(id);
  }, []);
  return <div className={`text-sm font-bold num ${theme?.cyan || "text-cyan-400"} cockpit-glow`}>{formatHHMM(t)}</div>;
}

export { Section, Loading, Empty, ErrorState, TabButton, LiveClock };
