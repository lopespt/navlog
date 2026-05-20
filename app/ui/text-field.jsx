// Shared form primitives. Substitui ~19 ocorrências de inputs com
// classes Tailwind duplicadas em app/components/*.jsx.
//
// Padrão repetido era:
//   w-full ${theme.inputBg} border ${theme.inputBorder} ${theme.fg}
//   px-3 py-2 text-sm rounded-xl focus:outline-none
//   focus:ring-2 focus:ring-amber-500/30
//
// Com microvariações de border (1 vs 2), padding, text-size, e
// `num` (font-variant-numeric) para campos numéricos.
//
// API:
//   <TextField label="Origem" value={x} onChange={setX} numeric />
//   <TextArea value={x} onChange={setX} rows={5} />
//   <SelectField value={x} onChange={setX} options={[{value, label}]} />
//   <ToggleRow label="Manter tela acesa" checked={x} onChange={setX} hint="..." />
//
// `onChange` recebe o valor diretamente (string ou bool), não o evento —
// elimina o boilerplate `(e) => setX(e.target.value)` em cada caller.

import React from "react";
import { useTheme } from "../context/app-context.jsx?v=20260520.0128";

const SIZE = {
  sm: "px-2 py-1.5 text-xs",
  md: "px-3 py-2 text-sm",
  lg: "px-3 py-2.5 text-base",
  xl: "px-4 py-3 text-2xl font-black tracking-widest",
};

function fieldClass(theme, { size, thick, numeric, accentWhen, className }) {
  const border = thick ? "border-2" : "border";
  const accent = accentWhen ? theme.accentBorder : theme.inputBorder;
  return [
    "w-full rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30",
    theme.inputBg, border, accent, theme.fg,
    SIZE[size] || SIZE.md,
    numeric ? "num" : "",
    `focus:${theme.accentBorder}`,
    className || "",
  ].filter(Boolean).join(" ");
}

function Label({ children }) {
  const theme = useTheme();
  if (!children) return null;
  return (
    <label className={`text-[10px] uppercase tracking-widest ${theme.fgFaint} mb-1 block`}>
      {children}
    </label>
  );
}

function Hint({ children, error }) {
  const theme = useTheme();
  if (!children) return null;
  return (
    <div className={`text-[10px] mt-1 ${error ? theme.danger : theme.fgFaint}`}>
      {children}
    </div>
  );
}

function TextField({
  label,
  hint,
  error,
  value,
  onChange,
  onBlur,
  onKeyDown,
  type = "text",
  placeholder,
  size = "md",
  thick = false,
  numeric = false,
  accentWhen = false,
  disabled = false,
  inputMode,
  autoComplete,
  autoFocus,
  className,
  inputClassName,
  ...rest
}) {
  const theme = useTheme();
  return (
    <div className={className}>
      {label && <Label>{label}</Label>}
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange && onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        inputMode={inputMode}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        className={fieldClass(theme, { size, thick, numeric, accentWhen, className: inputClassName })}
        {...rest}
      />
      <Hint error={error}>{hint}</Hint>
    </div>
  );
}

function TextArea({
  label,
  hint,
  error,
  value,
  onChange,
  rows = 4,
  placeholder,
  size = "md",
  numeric = false,
  autoFocus,
  className,
  ...rest
}) {
  const theme = useTheme();
  const cls = fieldClass(theme, { size, thick: false, numeric, accentWhen: false });
  return (
    <div className={className}>
      {label && <Label>{label}</Label>}
      <textarea
        value={value ?? ""}
        onChange={(e) => onChange && onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={`${cls} resize-none`}
        {...rest}
      />
      <Hint error={error}>{hint}</Hint>
    </div>
  );
}

function SelectField({
  label,
  hint,
  value,
  onChange,
  options = [], // [{ value, label }]
  size = "md",
  thick = false,
  disabled = false,
  className,
  ...rest
}) {
  const theme = useTheme();
  return (
    <div className={className}>
      {label && <Label>{label}</Label>}
      <select
        value={value ?? ""}
        onChange={(e) => onChange && onChange(e.target.value)}
        disabled={disabled}
        className={fieldClass(theme, { size, thick, numeric: false, accentWhen: false })}
        {...rest}
      >
        {options.map((opt) => (
          <option key={String(opt.value)} value={opt.value}>{opt.label ?? opt.value}</option>
        ))}
      </select>
      <Hint>{hint}</Hint>
    </div>
  );
}

// Row com label clicável + toggle (checkbox semantically). Útil em
// PrefsPanel ("Manter tela ligada", "Mostrar combustível em voo").
function ToggleRow({ label, hint, checked, onChange, disabled = false, className }) {
  const theme = useTheme();
  return (
    <label className={`flex items-start gap-3 cursor-pointer ${className || ""}`}>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange && onChange(e.target.checked)}
        disabled={disabled}
        className="mt-1 w-4 h-4 accent-amber-500"
      />
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-bold ${theme.fg}`}>{label}</div>
        {hint && <div className={`text-[10px] ${theme.fgFaint} mt-0.5`}>{hint}</div>}
      </div>
    </label>
  );
}

export { TextField, TextArea, SelectField, ToggleRow };
