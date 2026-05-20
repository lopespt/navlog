// Modal primitives — substituem 7 bottom-sheets + 3-4 full-screen modais
// com a11y faltando (role="dialog", aria-modal, ESC handler, focus
// restore).
//
// Padrão duplicado era:
//   <div className="fixed inset-0 z-30 bg-black/80 flex items-end" onClick={onClose}>
//     <div onClick={(e) => e.stopPropagation()}
//          className={`w-full ${theme.panel} border-t ${theme.panelBorder} rounded-t-2xl p-4 space-y-3`}>
//       <div flex justify-between>
//         <h3>Title</h3>
//         <button onClick={onClose}><X /></button>
//       </div>
//       {children}
//     </div>
//   </div>
//
// API:
//   <BottomSheet title="Importar rota FPL" onClose={onClose} icon={<X/>}>
//     {children}
//   </BottomSheet>
//
//   <FullScreenModal title="Editor de Waypoint" onClose={onClose}
//     footer={<Button>...</Button>}>
//     {scrollableBody}
//   </FullScreenModal>
//
// A11y:
//   - role="dialog" aria-modal="true"
//   - aria-labelledby aponta para o <h3> do header (id gerado).
//   - ESC fecha.
//   - Foco inicial no body do dialog; restaura foco no elemento ativo
//     ao desmontar. Tab loop (focus trap completo) fica para versão
//     futura — fora do escopo deste PR.

import React, { useEffect, useRef, useId } from "react";
import { useTheme } from "../context/app-context.jsx?v=20260520.1003";
import { IconButton } from "./button.jsx?v=20260520.1003";
import { X } from "lucide-react";

// Z-index constants — eram inconsistentes (30, 40, 9999). Centralizado
// aqui. MODAL_Z é o padrão. NESTED_Z para modal aberto sobre outro modal.
const MODAL_Z = 30;
const NESTED_Z = 40;
const FULLSCREEN_Z = 9999;

function useModalA11y(onClose) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const prevActive = typeof document !== "undefined" ? document.activeElement : null;
    // Foco inicial no dialog (não em algum botão de fechar — evita que
    // ENTER no teclado feche imediatamente).
    if (dialogRef.current && typeof dialogRef.current.focus === "function") {
      dialogRef.current.focus();
    }
    function onKey(e) {
      if (e.key === "Escape" && onClose) {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Restaura foco no elemento que abriu o modal.
      if (prevActive && typeof prevActive.focus === "function") {
        try { prevActive.focus(); } catch (_) {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return dialogRef;
}

// Bottom-sheet modal — overlay escuro + painel deslizante de baixo.
// Caso comum em mobile (PWA Navlog é mobile-first).
function BottomSheet({
  title,
  icon,
  onClose,
  children,
  nested = false,    // true = z-index NESTED_Z (modal sobre modal)
  className,
  maxHeight,         // ex.: "90vh" — usado por PrefsPanel
  dimAmount = "bg-black/80",
}) {
  const theme = useTheme();
  const titleId = useId();
  const dialogRef = useModalA11y(onClose);
  const z = nested ? NESTED_Z : MODAL_Z;

  const bodyCls = [
    `w-full ${theme.panel} border-t ${theme.panelBorder} rounded-t-2xl p-4 space-y-3 outline-none`,
    maxHeight ? "overflow-y-auto" : "",
    className || "",
  ].filter(Boolean).join(" ");
  const bodyStyle = maxHeight ? { maxHeight } : undefined;

  return (
    <div
      className={`fixed inset-0 ${dimAmount} flex items-end`}
      style={{ zIndex: z }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={bodyCls}
        style={bodyStyle}
      >
        {title && (
          <div className="flex items-center justify-between">
            <h3
              id={titleId}
              className={`text-sm uppercase tracking-widest ${theme.accent} font-bold flex items-center gap-2`}
            >
              {icon}{title}
            </h3>
            <IconButton onClick={onClose} aria-label="Fechar" icon={<X className="w-5 h-5" />} />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// Full-screen modal com header sticky + scrollable body + footer fixo.
// Usado em WaypointEditor, Procedures, FleetManager (AircraftEditor),
// DeviationPanel.
//
// `header` substitui o header padrão (com close button via IconButton).
// Quando ausente, é renderizado um header simples com title + close.
function FullScreenModal({
  title,
  icon,
  onClose,
  header,
  children,
  footer,
  nested = false,
  className,
}) {
  const theme = useTheme();
  const titleId = useId();
  const dialogRef = useModalA11y(onClose);
  const z = nested ? FULLSCREEN_Z + 20 : FULLSCREEN_Z;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      ref={dialogRef}
      tabIndex={-1}
      className={`fixed inset-0 ${theme.bg} flex flex-col outline-none ${className || ""}`}
      style={{ zIndex: z, isolation: "isolate" }}
    >
      {header ?? (
        <div className={`shrink-0 px-4 py-3 border-b ${theme.panelBorder} flex items-center justify-between`}>
          <h3
            id={titleId}
            className={`text-sm uppercase tracking-widest ${theme.accent} font-bold flex items-center gap-2`}
          >
            {icon}{title}
          </h3>
          <IconButton onClick={onClose} aria-label="Fechar" icon={<X className="w-5 h-5" />} />
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {children}
      </div>
      {footer && (
        <div className={`shrink-0 px-4 py-3 border-t ${theme.panelBorder}`}>
          {footer}
        </div>
      )}
    </div>
  );
}

export { BottomSheet, FullScreenModal, MODAL_Z, NESTED_Z, FULLSCREEN_Z };
