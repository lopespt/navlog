// main.jsx component-import audit. Pega o caso "<Foo /> usado mas Foo
// não importado nem definido localmente" — exatamente o bug em que
// RoutesManager e 5 outros modais eram referenciados em JSX mas o
// import sumiu na extração, e os erros só apareciam quando o usuário
// abria o modal.
//
// O components-audit.test.js cobre app/components/, app/hooks/ e
// app/context/ — mas não main.jsx (porque main.jsx é considerado o
// "ground truth" para os outros). Este teste fecha o gap só pra main.jsx.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const MAIN_JSX = path.join(__dirname, "..", "app", "main.jsx");

// JSX tags que são builtins do React (capitalizadas).
const REACT_BUILTINS = new Set(["Fragment"]);

function stripComments(code) {
  return code.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function collectImports(code) {
  const out = new Set();
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

function collectLocalFunctions(code) {
  const out = new Set();
  for (const m of code.matchAll(/^function\s+([A-Z]\w*)/gm)) out.add(m[1]);
  for (const m of code.matchAll(/^const\s+([A-Z]\w*)\s*=/gm)) out.add(m[1]);
  return out;
}

test("main.jsx: every <Component /> is imported or defined locally", () => {
  const code = fs.readFileSync(MAIN_JSX, "utf8");
  const clean = stripComments(code);
  const imports = collectImports(clean);
  const locals = collectLocalFunctions(clean);

  const used = new Set();
  for (const m of clean.matchAll(/<([A-Z]\w*)/g)) {
    used.add(m[1]);
  }

  const missing = [];
  for (const name of used) {
    if (REACT_BUILTINS.has(name)) continue;
    if (imports.has(name)) continue;
    if (locals.has(name)) continue;
    missing.push(name);
  }

  assert.deepEqual(
    missing.sort(),
    [],
    "main.jsx: JSX components used but not imported or defined locally:\n  " +
      missing.join("\n  "),
  );
});
