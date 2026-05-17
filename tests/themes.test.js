// Structural tests for lib/themes.js. The palettes are pure data, but every
// component reads specific keys (theme.panel, theme.fgFaint, theme.accent...)
// so a dropped key would surface as a black background or unstyled text in
// production. These tests assert the shape.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { themes } = require("../lib/themes.js");

test("themes: three palettes exist", () => {
  assert.deepEqual(Object.keys(themes).sort(), ["day", "night", "red"]);
});

// Every theme must expose the same keys — extracted components rely on
// theme.X resolving consistently across switching themes.
const REQUIRED_KEYS = [
  "name", "bg", "panel", "panelBorder",
  "fg", "fgMuted", "fgFaint",
  "accent", "accentBg", "accentBgFg", "accentBorder",
  "cyan", "success", "danger",
  "inputBg", "inputBorder",
  "glow",
];

for (const key of ["night", "day", "red"]) {
  test(`themes.${key}: has every required key`, () => {
    const t = themes[key];
    for (const k of REQUIRED_KEYS) {
      assert.ok(k in t, `themes.${key}.${k} missing`);
    }
  });

  test(`themes.${key}: tailwind class strings, not empty`, () => {
    const t = themes[key];
    for (const k of REQUIRED_KEYS) {
      if (k === "glow") continue; // boolean
      assert.equal(typeof t[k], "string", `themes.${key}.${k} should be string`);
      assert.ok(t[k].length > 0, `themes.${key}.${k} should not be empty`);
    }
    assert.equal(typeof t.glow, "boolean");
  });
}

test("themes.red: black background for night-vision use", () => {
  assert.equal(themes.red.bg, "bg-black");
  assert.equal(themes.red.panel, "bg-black");
});

test("themes.day: light background for daytime use", () => {
  assert.ok(themes.day.bg.includes("stone") || themes.day.bg.includes("white"));
  assert.ok(themes.day.fg.includes("stone-900") || themes.day.fg.includes("zinc-900"));
});
