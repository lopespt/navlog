// Entry — proves that (a) cross-file JSX imports work via esm.sh/gh and (b)
// React renders normally with the importmap-pinned versions.
import React from "react";
import { createRoot } from "react-dom/client";
import { Hello } from "./hello.jsx";

function App() {
  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-widest text-zinc-500">
          Navlog — esm.sh proof of concept
        </div>
        <div className="text-2xl font-bold text-zinc-100 mt-1">
          Multi-file JSX no GitHub Pages, sem build
        </div>
      </header>

      <Hello name="Mundo" />

      <div className="text-xs text-zinc-500 max-w-md leading-relaxed">
        Este painel é renderizado por <code className="text-cyan-400">main.jsx</code>{" "}
        que importa <code className="text-cyan-400">hello.jsx</code> como ES module
        nativo. JSX é compilado no edge da esm.sh CDN; React vem do importmap.
        Se o contador funciona e o estilo está aplicado, o padrão está OK para
        migrar o app principal.
      </div>
    </div>
  );
}

// Exported so the entry HTML can mount this — keeps the wiring explicit and
// makes it possible to wrap with strict mode / providers later without
// touching index.html.
export function mount(rootEl) {
  createRoot(rootEl).render(<App />);
}
