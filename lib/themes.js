// Navlog themes — Tailwind class bundles for the night / day / red night-vision
// palettes. Pure data, no logic. UMD-style: Node tests can require() this and
// the browser sees `window.themes` so app/main.jsx and the extracted component
// modules (prefs-panel.jsx, etc.) can read it as a bare identifier.

const themes = {
  night: {
    name: "Noite",
    bg: "bg-zinc-950",
    panel: "bg-zinc-900",
    panelBorder: "border-zinc-800",
    fg: "text-zinc-100",
    fgMuted: "text-zinc-400",
    fgFaint: "text-zinc-500",
    accent: "text-amber-400",
    accentBg: "bg-amber-500",
    accentBgFg: "text-zinc-950",
    accentBorder: "border-amber-500/50",
    cyan: "text-cyan-400",
    success: "text-green-400",
    danger: "text-red-400",
    inputBg: "bg-zinc-900",
    inputBorder: "border-zinc-700",
    glow: true,
  },
  day: {
    name: "Dia",
    bg: "bg-stone-100",
    panel: "bg-white",
    panelBorder: "border-stone-300",
    fg: "text-stone-900",
    fgMuted: "text-stone-700",
    fgFaint: "text-stone-500",
    accent: "text-amber-700",
    accentBg: "bg-amber-600",
    accentBgFg: "text-white",
    accentBorder: "border-amber-600/60",
    cyan: "text-sky-700",
    success: "text-emerald-700",
    danger: "text-red-700",
    inputBg: "bg-white",
    inputBorder: "border-stone-400",
    glow: false,
  },
  red: {
    name: "Vermelho (visão noturna)",
    bg: "bg-black",
    panel: "bg-black",
    panelBorder: "border-red-900/40",
    fg: "text-red-500",
    fgMuted: "text-red-600",
    fgFaint: "text-red-800",
    accent: "text-red-400",
    accentBg: "bg-red-700",
    accentBgFg: "text-black",
    accentBorder: "border-red-600",
    cyan: "text-red-400",
    success: "text-red-400",
    danger: "text-red-300",
    inputBg: "bg-black",
    inputBorder: "border-red-900",
    glow: true,
  },
};

const __NAVLOG_THEMES__ = { themes };
if (typeof module !== "undefined" && module.exports) {
  module.exports = __NAVLOG_THEMES__;
}
if (typeof window !== "undefined") {
  Object.assign(window, __NAVLOG_THEMES__);
}
