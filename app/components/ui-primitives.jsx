// Shared UI primitives — small, presentational components used by multiple
// app/components/*.jsx files and by app/main.jsx itself. Extracted so each
// consumer can import what it needs without bundling a 6 000-line entry.
//
//   Section     — collapsible card with title + icon, optional defaultOpen
//   Loading     — centered spinner with a label
//   Empty       — empty-state placeholder with icon + title + hint
//   ErrorState  — error display with optional retry button

import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

function Section({ icon, title, children, theme, collapsible, defaultOpen }) {
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

function Loading({ theme, label }) {
  return (
    <div className={`flex items-center justify-center gap-2 py-4 text-[10px] uppercase tracking-widest ${theme?.fgFaint || "text-zinc-500"}`}
      role="status" aria-live="polite">
      <RefreshCw className="w-4 h-4 animate-spin" />
      <span>{label || "A carregar…"}</span>
    </div>
  );
}

function Empty({ theme, icon, title, hint }) {
  const Ico = icon || MapPin;
  return (
    <div className="flex flex-col items-center text-center py-6 px-4 gap-2">
      <Ico className={`w-8 h-8 ${theme?.fgFaint || "text-zinc-600"} opacity-70`} />
      {title && <div className={`text-sm font-bold ${theme?.fg || "text-zinc-200"}`}>{title}</div>}
      {hint && <div className={`text-xs ${theme?.fgFaint || "text-zinc-500"}`}>{hint}</div>}
    </div>
  );
}

function ErrorState({ theme, message, onRetry }) {
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


export { Section, Loading, Empty, ErrorState };
