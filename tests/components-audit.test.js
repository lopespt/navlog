// Static audit of every app/components/*.jsx — catches the failure modes
// that bit us repeatedly during the esm.sh migration:
//
//   1. JSX element `<Foo />` used but Foo never imported / defined locally
//      → "Foo is not defined" at first render of the component
//   2. bare function call `foo()` that's not in imports / locals / lib/*
//      window globals → "foo is not defined" deeper in the call stack
//   3. cross-module reference to a `main.jsx` top-level identifier (data
//      const like APP_VERSION, helper like phaseETELabel) — works in
//      main.jsx scope but throws once the component lives in its own
//      ES module
//
// The audit is intentionally regex-based (no npm parser dep). It strips
// line + block comments only — leaving string contents intact — because
// the earlier "smart" stripping with quote/JSX-text regexes mis-identified
// unbalanced apostrophes inside JSX text and ate real function declarations
// (see waypoint-editor.jsx false positive at commit 3da0f5f).

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const COMPONENTS_DIR = path.join(__dirname, "..", "app", "components");
const HOOKS_DIR = path.join(__dirname, "..", "app", "hooks");
const CONTEXT_DIR = path.join(__dirname, "..", "app", "context");
const UI_DIR = path.join(__dirname, "..", "app", "ui");
const LIB_DIR = path.join(__dirname, "..", "lib");
const MAIN_JSX = path.join(__dirname, "..", "app", "main.jsx");

// Browser / JS-built-in globals every module gets for free.
const BROWSER_GLOBALS = new Set([
  "window", "document", "navigator", "console", "location",
  "localStorage", "sessionStorage", "fetch", "URL", "URLSearchParams",
  "Blob", "File", "FileReader", "Image", "Audio", "Event", "CustomEvent",
  "MutationObserver", "HTMLScriptElement", "TextEncoder", "TextDecoder",
  "IntersectionObserver", "ResizeObserver", "AbortController",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "requestAnimationFrame", "cancelAnimationFrame", "requestIdleCallback",
  "alert", "confirm", "prompt",
  "isNaN", "isFinite", "parseFloat", "parseInt",
  "Math", "Object", "Array", "JSON", "Date", "Promise", "Error",
  "Number", "String", "Boolean", "Map", "Set", "WeakMap", "WeakSet",
  "RegExp", "Symbol", "Proxy", "Reflect", "BigInt",
  "globalThis", "undefined", "NaN", "Infinity",
  // browser-loaded globals our app uses via <script src>
  "L", "pdfjsLib", "geomagnetism", "_geomagnetism",
  // The React default (always imported as `React`)
  "React",
]);

const JS_KEYWORDS = new Set([
  "true", "false", "null", "undefined", "this", "new", "typeof", "instanceof",
  "function", "return", "if", "else", "for", "while", "const", "let", "var",
  "try", "catch", "throw", "await", "async", "of", "in", "case", "switch",
  "break", "default", "continue", "do", "class", "extends", "super", "yield",
  "from", "import", "export", "as", "delete", "void", "with", "finally",
  "debugger", "arguments", "static", "get", "set",
]);

function stripComments(code) {
  // Strip //-line comments FIRST. Order matters: doing block comments first
  // means a stray `lib/*` token inside a `//`-line comment would be read as
  // an opening `/*` and the regex would gobble everything up to the next
  // legit `*/` (which might be a JSX comment hundreds of lines later).
  return code
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

function collectImports(code) {
  const out = new Set();
  // `import Foo from "..."`  /  `import Foo, { a, b } from "..."` /
  // `import { a, b as c } from "..."`  /  `import * as Foo from "..."`
  const re = /import\s+(?:(\w+)\s*,?\s*)?(?:\*\s+as\s+(\w+))?(?:\{([^}]+)\})?\s*from/g;
  let m;
  while ((m = re.exec(code))) {
    if (m[1]) out.add(m[1]);
    if (m[2]) out.add(m[2]);
    if (m[3]) {
      for (const name of m[3].split(",")) {
        const tok = name.trim().split(/\s+as\s+/).pop().trim();
        if (tok) out.add(tok);
      }
    }
  }
  return out;
}

function collectLocals(code) {
  const out = new Set();
  // function declarations (top-level OR nested)
  for (const m of code.matchAll(/\bfunction\s+(\w+)/g)) out.add(m[1]);
  // const/let/var bindings
  for (const m of code.matchAll(/\b(?:const|let|var)\s+(\w+)\s*=/g)) out.add(m[1]);
  // class declarations
  for (const m of code.matchAll(/\bclass\s+(\w+)/g)) out.add(m[1]);
  // destructured const/let/var arrays — `const [a, b] = ...`
  for (const m of code.matchAll(/\b(?:const|let|var)\s+\[([^\]]+)\]/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().replace(/^\.\.\./, "").split("=")[0].trim();
      if (/^[A-Za-z_]\w*$/.test(name)) out.add(name);
    }
  }
  // destructured const/let/var objects — `const { a, b: c, d = 0 } = ...`
  for (const m of code.matchAll(/\b(?:const|let|var)\s+\{([^}]+)\}/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().replace(/^\.\.\./, "")
        .split(":").pop().split("=")[0].trim();
      if (/^[A-Za-z_]\w*$/.test(name)) out.add(name);
    }
  }
  // function parameters (including arrow) — best-effort. Covers `function fn(a, b)` and `(a, b) => ...`
  for (const m of code.matchAll(/function\s+\w*\s*\(([^)]*)\)/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().replace(/^\.\.\./, "").split("=")[0].trim().split(":").pop().trim();
      if (/^[A-Za-z_]\w*$/.test(name)) out.add(name);
    }
  }
  for (const m of code.matchAll(/\(([^()]*)\)\s*=>/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().replace(/^\.\.\./, "").split("=")[0].trim();
      if (/^[A-Za-z_]\w*$/.test(name)) out.add(name);
    }
  }
  // single-param arrows without parens: `x => ...`
  for (const m of code.matchAll(/(?<![\w.])(\w+)\s*=>/g)) {
    out.add(m[1]);
  }
  return out;
}

function collectLibGlobals() {
  // Each lib/*.js declares `const __NAVLOG_X__ = { fn1, fn2, ... };`
  // and Object.assigns it to window. Those are the bare identifiers
  // components are allowed to use without importing.
  const out = new Set();
  for (const file of fs.readdirSync(LIB_DIR)) {
    if (!file.endsWith(".js")) continue;
    const src = fs.readFileSync(path.join(LIB_DIR, file), "utf8");
    const re = /const\s+__NAVLOG_[A-Z]+__\s*=\s*\{([^}]+)\}/gs;
    let m;
    while ((m = re.exec(src))) {
      for (const tok of m[1].match(/[A-Za-z_]\w*/g) || []) out.add(tok);
    }
  }
  return out;
}

function collectMainScope() {
  // Top-level (column 0) declarations only — same scoping rule as
  // "would this be visible to an extracted component if it ever moved out
  // of main.jsx?".
  const out = new Set();
  const src = fs.readFileSync(MAIN_JSX, "utf8");
  for (const m of src.matchAll(/^function\s+(\w+)/gm)) out.add(m[1]);
  for (const m of src.matchAll(/^(?:const|let|var)\s+(\w+)\s*=/gm)) out.add(m[1]);
  return out;
}

const LIB_GLOBALS = collectLibGlobals();
const MAIN_SCOPE = collectMainScope();

function auditFile(filename, code) {
  const clean = stripComments(code);
  const imports = collectImports(clean);
  const locals = collectLocals(clean);
  const known = new Set([
    ...imports, ...locals, ...BROWSER_GLOBALS, ...JS_KEYWORDS, ...LIB_GLOBALS,
  ]);

  const issues = [];

  // 1. JSX elements `<Foo>` — including single-letter `<X>`. The `\w*`
  //    (zero or more) lets us catch one-letter names like the Lucide
  //    close icon `<X />`, which we missed at commit f37846f.
  const jsxUsed = new Set();
  for (const m of clean.matchAll(/<([A-Z]\w*)\b/g)) jsxUsed.add(m[1]);
  for (const name of jsxUsed) {
    if (!known.has(name)) issues.push(`<${name}/> not imported or local`);
  }

  // 2. Bare lowercase function calls — if not in scope AND defined at
  //    main.jsx top level, that's a cross-module reference and would throw.
  //    We deliberately don't enforce "every call must be in lib/* or
  //    locals" here because there are too many false positives from
  //    method names in template strings and comments we didn't strip.
  for (const m of clean.matchAll(/(?<![\w.])([a-z]\w*)\s*\(/g)) {
    const name = m[1];
    if (JS_KEYWORDS.has(name)) continue;
    if (known.has(name)) continue;
    if (MAIN_SCOPE.has(name)) {
      issues.push(`call ${name}() references main.jsx top-level scope`);
    }
  }

  // 3. Bare capitalized identifier reads — same cross-module check for
  //    data constants (FLEET_DEFAULTS, themes, APP_VERSION, etc.).
  for (const m of clean.matchAll(/(?<![\w.])([A-Z]\w*)/g)) {
    const name = m[1];
    if (known.has(name)) continue;
    if (jsxUsed.has(name)) continue; // already counted
    if (MAIN_SCOPE.has(name)) {
      issues.push(`read ${name} references main.jsx top-level scope`);
    }
  }

  // 4. Top-level reassignments like `Foo = React.memo(Foo)` — these
  //    pattern only assigns to a SINGLE bare identifier at column 0.
  //    Catches the bug from commit 48c8941 where the React.memo wrapper
  //    was left behind in main.jsx after the function moved out.
  for (const m of code.matchAll(/^([A-Z]\w*)\s*=\s/gm)) {
    const name = m[1];
    if (locals.has(name) || imports.has(name)) continue;
    issues.push(`top-level reassignment of '${name}' but never declared`);
  }

  return issues;
}

// One test per component file.
const files = fs.readdirSync(COMPONENTS_DIR).filter((f) => f.endsWith(".jsx"));
for (const file of files) {
  test(`components/${file}: passes static audit`, () => {
    const code = fs.readFileSync(path.join(COMPONENTS_DIR, file), "utf8");
    const issues = auditFile(file, code);
    assert.deepEqual(issues, [], `audit issues in ${file}:\n  ${issues.join("\n  ")}`);
  });
}

// Same audit on app/hooks/*.jsx — custom hooks reference the same window
// globals from lib/* and would break the same way if an identifier moved.
const hookFiles = fs.existsSync(HOOKS_DIR)
  ? fs.readdirSync(HOOKS_DIR).filter((f) => f.endsWith(".jsx"))
  : [];
for (const file of hookFiles) {
  test(`hooks/${file}: passes static audit`, () => {
    const code = fs.readFileSync(path.join(HOOKS_DIR, file), "utf8");
    const issues = auditFile(file, code);
    assert.deepEqual(issues, [], `audit issues in ${file}:\n  ${issues.join("\n  ")}`);
  });
}

// And on app/context/*.jsx — same reasoning.
const contextFiles = fs.existsSync(CONTEXT_DIR)
  ? fs.readdirSync(CONTEXT_DIR).filter((f) => f.endsWith(".jsx"))
  : [];
for (const file of contextFiles) {
  test(`context/${file}: passes static audit`, () => {
    const code = fs.readFileSync(path.join(CONTEXT_DIR, file), "utf8");
    const issues = auditFile(file, code);
    assert.deepEqual(issues, [], `audit issues in ${file}:\n  ${issues.join("\n  ")}`);
  });
}

// And on app/ui/*.jsx — shared UI primitives.
const uiFiles = fs.existsSync(UI_DIR)
  ? fs.readdirSync(UI_DIR).filter((f) => f.endsWith(".jsx"))
  : [];
for (const file of uiFiles) {
  test(`ui/${file}: passes static audit`, () => {
    const code = fs.readFileSync(path.join(UI_DIR, file), "utf8");
    const issues = auditFile(file, code);
    assert.deepEqual(issues, [], `audit issues in ${file}:\n  ${issues.join("\n  ")}`);
  });
}

test("components-audit: discovered at least the 16 known modules", () => {
  // Guard against silently skipping files if the components dir is empty
  // for some reason.
  assert.ok(files.length >= 10, `expected ≥10 component files, found ${files.length}`);
});
