// Provider/component props smoke test — pega regressões onde a assinatura
// de um componente (especialmente um Context Provider) ganha props que
// nenhum call site passa.
//
// Por que isto existe: na refatoração para Context API o regex de strip
// removeu theme={theme}, prefs={prefs}, flight={flight} etc. dos JSX call
// sites — incluindo, por engano, do próprio <AppProvider>. O Provider
// passou a entregar value={undefined} a cada context e os hooks
// dispararam "missing <AppProvider> ancestor" no primeiro render. Os
// testes em `node:test` não rodam JSX, então o bug escapou — apareceu
// só em produção.
//
// Estratégia: parse estático. Para cada componente listado abaixo,
// extrai a lista de props da assinatura `function Foo({ ... })` e
// confere que cada call site `<Foo ... >` passa todas elas (exceto
// `children`, que vem implícito como JSX content).
//
// Limitações conhecidas:
//   - regex-based; não cobre destructure aninhado nem rest (`...x`)
//   - não valida tipos/valores; só presença
//   - cobre call sites na mesma classe de arquivos (app/**/*.jsx)

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPO = path.join(__dirname, "..");
const APP_DIR = path.join(REPO, "app");

function readAllJsx() {
  const out = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".jsx")) {
        out.push({ path: full, code: fs.readFileSync(full, "utf8") });
      }
    }
  }
  walk(APP_DIR);
  return out;
}

function stripComments(code) {
  return code.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

// Replace string literals with empty placeholders so a `<Foo>` inside a
// JS string ("missing <Foo>") doesn't get parsed as a JSX tag. Doesn't
// need to be parse-correct — just preserves length so positions don't
// drift if we later report line numbers.
function stripStrings(code) {
  return code
    .replace(/"(?:\\.|[^"\\])*"/g, (m) => '"' + " ".repeat(Math.max(0, m.length - 2)) + '"')
    .replace(/'(?:\\.|[^'\\])*'/g, (m) => "'" + " ".repeat(Math.max(0, m.length - 2)) + "'")
    .replace(/`(?:\\.|[^`\\])*`/g, (m) => "`" + " ".repeat(Math.max(0, m.length - 2)) + "`");
}

// Extract the destructured prop names from `function Name({ a, b, c }) {`
// or `export function Name({ a, b, c }) {`.
function extractSignatureProps(code, fnName) {
  const clean = stripComments(stripStrings(code));
  const re = new RegExp(
    "(?:export\\s+)?function\\s+" + fnName + "\\s*\\(\\s*\\{([^}]*)\\}\\s*\\)\\s*\\{",
    "m",
  );
  const m = re.exec(clean);
  if (!m) return null;
  const names = [];
  for (const part of m[1].split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("...")) continue; // rest — caller can omit
    // strip default value (`a = 5`) and rename alias (`a: x`)
    const name = trimmed.split("=")[0].split(":")[0].trim();
    if (/^[A-Za-z_]\w*$/.test(name)) names.push(name);
  }
  return names;
}

// Find every `<Name ... />` or `<Name ... >` opening tag. Returns each
// open-tag text so we can match props.
function findOpeningTags(code, name) {
  const clean = stripComments(stripStrings(code));
  const tags = [];
  // Walk through every `<Name` occurrence and read until the matching `>`
  // that closes the open tag, balancing `{` for inline expressions.
  const start = new RegExp("<" + name + "(?=[\\s/>])", "g");
  let m;
  while ((m = start.exec(clean))) {
    let i = m.index;
    let depth = 0;
    let end = -1;
    for (let j = i; j < clean.length; j++) {
      const ch = clean[j];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) { end = j; break; }
    }
    if (end > 0) tags.push(clean.slice(i, end + 1));
  }
  return tags;
}

// Extract `key={...}` style attribute names from a JSX opening tag.
function extractCallProps(tag) {
  const names = new Set();
  // `name=` boundary: preceded by whitespace, followed by `=`
  const re = /\s([a-zA-Z_]\w*)\s*=/g;
  let m;
  while ((m = re.exec(tag))) names.add(m[1]);
  // Also `{...spread}` — caller forwards an object; treat as wildcard.
  if (/\{\s*\.\.\./.test(tag)) names.add("__spread__");
  return names;
}

// Components to audit. Add to this list when introducing a new Provider
// or a component whose missing props would break the app silently.
const COMPONENTS = [
  // { defFile, name, ignore: ["children"] }
  { defFile: "context/app-context.jsx", name: "AppProvider", ignore: ["children"] },
];

const files = readAllJsx();

for (const c of COMPONENTS) {
  test(`<${c.name}> call sites pass every signature prop`, () => {
    const def = files.find((f) => f.path.endsWith(c.defFile));
    assert.ok(def, `definition file not found: ${c.defFile}`);
    const sigProps = extractSignatureProps(def.code, c.name);
    assert.ok(sigProps, `could not parse signature of ${c.name} in ${c.defFile}`);
    const required = sigProps.filter((p) => !c.ignore.includes(p));

    // Find every call site in any .jsx under app/
    const callSites = [];
    for (const f of files) {
      for (const tag of findOpeningTags(f.code, c.name)) {
        callSites.push({ file: path.relative(REPO, f.path), tag });
      }
    }
    assert.ok(
      callSites.length > 0,
      `expected at least one <${c.name}> call site; found zero`,
    );

    for (const cs of callSites) {
      const passed = extractCallProps(cs.tag);
      if (passed.has("__spread__")) continue; // spread covers everything
      const missing = required.filter((p) => !passed.has(p));
      assert.deepEqual(
        missing,
        [],
        `<${c.name}> in ${cs.file} is missing props: ${missing.join(", ")}\n  tag: ${cs.tag.slice(0, 200)}`,
      );
    }
  });
}
