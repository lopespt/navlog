// Child component — exercised by main.jsx to prove cross-file ES module imports
// resolve correctly when both files are served via esm.sh/gh.
import React from "react";

export function Hello({ name }) {
  const [count, setCount] = React.useState(0);
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-zinc-900 p-6 max-w-md">
      <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
        Child component (hello.jsx)
      </div>
      <div className="text-3xl font-bold text-amber-400 mb-4">
        Olá, {name}!
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setCount(c => c + 1)}
          className="px-4 py-2 bg-amber-500 text-black rounded-xl font-bold text-sm active:scale-95 transition-transform"
        >
          Cliques: {count}
        </button>
        <div className="text-xs text-zinc-400">
          {count === 0 ? "estado funciona?" : "estado OK"}
        </div>
      </div>
    </div>
  );
}
