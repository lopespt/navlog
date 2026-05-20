// Shared Button primitives. Substitui 36+ ocorrências de botões com
// classes Tailwind duplicadas em app/components/*.jsx.
//
// Três famílias de botão eram repetidas literalmente:
//
//   primary   — CTA accent (Confirmar passagem, Aplicar desvio, Marcar agora,
//               Salvar rota). Fundo accentBg, texto accentBgFg, py grande.
//   secondary — Cancelar, Fechar, voltar — discreto. Fundo panel, border
//               panelBorder, texto fgMuted.
//   danger    — Limpar passagem, Remover rota, deletar aeronave. Fundo
//               red-900/40, border red-800, texto red-300.
//
// Tamanhos:
//   sm  — py-1.5 text-xs           (toolbar / inline)
//   md  — py-2.5 text-sm           (padrão de modal)
//   lg  — py-3 text-base           (CTA padrão)
//   xl  — py-4 text-lg             (CTA destacado — única ação de modal full-screen)
//
// API:
//   <Button variant="primary" size="lg" disabled fullWidth onClick={...}>texto</Button>
//   <Button variant="danger" size="md"><Trash /> Apagar</Button>
//   <IconButton icon={<Eye />} active onClick={...} aria-label="Manter tela acesa" />
//
// fullWidth default = true (a maioria dos botões no app é w-full).
// IconButton é um componente próprio porque a semântica é diferente
// (ícone + aria-label obrigatório em vez de children).

import React from "react";
import { useTheme } from "../context/app-context.jsx?v=20260520.1003";

const SIZE = {
  sm: "py-1.5 text-xs",
  md: "py-2.5 text-sm",
  lg: "py-3 text-base",
  xl: "py-4 text-lg",
};

function variantClasses(variant, theme) {
  switch (variant) {
    case "primary":
      return `${theme.accentBg} ${theme.accentBgFg ?? "text-black"} font-bold`;
    case "secondary":
      return `${theme.panel} border ${theme.panelBorder} ${theme.fgMuted} font-bold`;
    case "danger":
      return "bg-red-900/40 border border-red-800 text-red-300 font-bold";
    case "ghost":
      return `${theme.fgMuted}`;
    default:
      return `${theme.panel} ${theme.fgMuted}`;
  }
}

function Button({
  variant = "primary",
  size = "lg",
  fullWidth = true,
  disabled = false,
  type = "button",
  className = "",
  onClick,
  children,
  ...rest
}) {
  const theme = useTheme();
  const cls = [
    fullWidth ? "w-full" : "",
    SIZE[size] || SIZE.lg,
    variantClasses(variant, theme),
    "rounded-xl active:scale-95 transition-transform duration-100",
    disabled ? "disabled:opacity-40" : "",
    "flex items-center justify-center gap-2",
    className,
  ].filter(Boolean).join(" ");
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cls}
      {...rest}
    >
      {children}
    </button>
  );
}

// IconButton — botão só com ícone, usado em headers/toolbars (wake lock,
// open prefs, open routes, big-mode toggle). `aria-label` é obrigatório
// para a11y já que não há texto visível.
function IconButton({
  icon,
  active = false,
  disabled = false,
  onClick,
  className = "",
  "aria-label": ariaLabel,
  ...rest
}) {
  const theme = useTheme();
  const cls = [
    "p-2 rounded active:scale-90 transition",
    active ? (theme.accent || "text-amber-400") : (theme.fgMuted || "text-zinc-400"),
    disabled ? "opacity-40" : "",
    className,
  ].filter(Boolean).join(" ");
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      className={cls}
      {...rest}
    >
      {icon}
    </button>
  );
}

export { Button, IconButton };
