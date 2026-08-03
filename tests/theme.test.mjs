import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_FONT_SCALE,
  FONT_SCALE_STORAGE_KEY,
  MAX_FONT_SCALE,
  MIN_FONT_SCALE,
  normalizeFontScale,
  normalizeThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
} from "../lib/theme.ts";

test("resolves manual and system color-scheme preferences", () => {
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(normalizeThemePreference("light"), "light");
  assert.equal(normalizeThemePreference("dark"), "dark");
  assert.equal(normalizeThemePreference("system"), "system");
  assert.equal(normalizeThemePreference("invalid"), "system");
  assert.equal(THEME_STORAGE_KEY, "shuzhi-color-scheme-v1");
  assert.equal(normalizeFontScale("1.2"), 1.2);
  assert.equal(normalizeFontScale("2"), 2);
  assert.equal(normalizeFontScale("1.46"), 1.5);
  assert.equal(normalizeFontScale("3"), MAX_FONT_SCALE);
  assert.equal(normalizeFontScale("0.4"), MIN_FONT_SCALE);
  assert.equal(normalizeFontScale("invalid"), DEFAULT_FONT_SCALE);
  assert.equal(DEFAULT_FONT_SCALE, 1.1);
  assert.equal(MIN_FONT_SCALE, 1);
  assert.equal(MAX_FONT_SCALE, 2);
  assert.equal(FONT_SCALE_STORAGE_KEY, "shuzhi-font-scale-v1");
});

test("wires one persistent theme control into both product surfaces", async () => {
  const [provider, page, timeline, layout, css, postcss, fontScalePlugin] = await Promise.all([
    readFile(new URL("../app/theme-provider.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/timeline-cockpit.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../postcss.config.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/postcss-font-scale.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(provider, /matchMedia\("\(prefers-color-scheme: dark\)"\)/);
  assert.match(provider, /if \(!ready\) return/);
  assert.match(provider, /window\.localStorage\.setItem\(THEME_STORAGE_KEY/);
  assert.match(provider, /跟随系统/);
  assert.match(provider, /浅色/);
  assert.match(provider, /深色/);
  assert.match(provider, /文字大小/);
  assert.match(provider, /type="range"/);
  assert.match(provider, /MAX_FONT_SCALE/);
  assert.match(provider, /onInput=/);
  assert.match(provider, /--font-scale-progress/);
  assert.match(provider, /--ui-font-scale/);
  assert.match(page, /<ThemeControl surface="cockpit" \/>/);
  assert.match(page, /<ThemeControl surface="workspace" \/>/);
  assert.match(timeline, /<ThemeControl surface="cockpit" \/>/);
  assert.match(layout, /themeBootstrapScript/);
  assert.match(css, /html\[data-theme="light"\] \.cockpit/);
  assert.match(css, /html\[data-theme="dark"\] \.app-shell/);
  assert.match(css, /display-settings-popover/);
  assert.match(postcss, /fontScalePlugin/);
  assert.match(fontScalePlugin, /shuzhi-runtime-font-scale/);

  const assetDirectory = new URL("../dist/client/assets/", import.meta.url);
  const builtCss = (
    await Promise.all(
      (await readdir(assetDirectory))
        .filter((name) => name.endsWith(".css"))
        .map((name) => readFile(new URL(name, assetDirectory), "utf8")),
    )
  ).join("\n");
  assert.match(builtCss, /calc\(30px \* var\(--ui-font-scale,1\)\)/);
});
