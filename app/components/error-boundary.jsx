// ErrorBoundary — wraps each tab so a render failure in one tab does not
// take down the whole app. React requires a class for componentDidCatch /
// getDerivedStateFromError; the rest of the codebase is hooks-only.
//
// The bootstrap diagnostic banner in index.html still catches errors that
// happen before React mounts or outside the boundary tree. This component
// covers the in-tree case: tab content throws → user sees a localized
// fallback with retry, the tab bar keeps working, the user can switch to
// another tab.

import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    try {
      console.error(
        "[navlog ErrorBoundary]",
        this.props.name || "(unknown)",
        error,
        info && info.componentStack,
      );
    } catch (_) {}
  }

  reset() {
    this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;

    const theme = this.props.theme || {};
    const name = this.props.name || "esta aba";
    const err = this.state.error;
    const msg = (err && (err.message || String(err))) || "erro desconhecido";

    return (
      <div
        role="alert"
        className={`p-4 ${theme.panel || "bg-zinc-900"} ${theme.fg || "text-zinc-100"}`}
      >
        <div className={`rounded-lg border ${theme.panelBorder || "border-zinc-800"} p-4`}>
          <h2 className={`text-lg font-bold mb-2 ${theme.danger || "text-red-400"}`}>
            Falha em {name}
          </h2>
          <p className={`text-sm mb-3 ${theme.fgMuted || "text-zinc-400"}`}>
            As outras abas continuam funcionando. Tente reabrir esta aba ou recarregue o app.
          </p>
          <pre className="text-xs bg-black/30 p-2 rounded overflow-auto max-h-40 mb-3 whitespace-pre-wrap break-words">
            {msg}
          </pre>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.reset}
              className={`px-3 py-2 rounded text-sm font-medium ${theme.accentBg || "bg-amber-500"} ${theme.accentBgFg || "text-zinc-950"}`}
            >
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={() => location.reload()}
              className={`px-3 py-2 rounded text-sm ${theme.inputBg || "bg-zinc-800"} ${theme.fg || "text-zinc-100"} border ${theme.inputBorder || "border-zinc-700"}`}
            >
              Recarregar app
            </button>
          </div>
        </div>
      </div>
    );
  }
}
