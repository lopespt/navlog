// Roda `python3 bump.py --check` para garantir que todos os
// cache-busters (`?v=` e `&v=`) na árvore casam com APP_VERSION em
// main.jsx. Se um futuro refactor mudar a estrutura de arquivos e o
// regex do bump.py deixar algum import para trás, esse teste pega antes
// do deploy — não depois (que é quando dá black screen no mobile).

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const REPO = path.join(__dirname, "..");

test("bump.py --check: all v-tags match APP_VERSION", () => {
  try {
    const out = execFileSync("python3", ["bump.py", "--check"], {
      cwd: REPO,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    assert.match(out, /✓ all v-tags match APP_VERSION/);
  } catch (err) {
    // execFileSync throws on non-zero exit — surface the stderr so the
    // failure list shows up directly in the test output.
    const stderr = err.stderr ? err.stderr.toString() : "";
    const stdout = err.stdout ? err.stdout.toString() : "";
    assert.fail(
      "bump.py --check failed:\n" + stdout + stderr,
    );
  }
});
