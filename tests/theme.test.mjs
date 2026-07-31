import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
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
});

test("wires one persistent theme control into both product surfaces", async () => {
  const [provider, page, timeline, layout, css] = await Promise.all([
    readFile(new URL("../app/theme-provider.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/timeline-cockpit.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(provider, /matchMedia\("\(prefers-color-scheme: dark\)"\)/);
  assert.match(provider, /if \(!ready\) return/);
  assert.match(provider, /window\.localStorage\.setItem\(THEME_STORAGE_KEY/);
  assert.match(provider, /跟随系统/);
  assert.match(provider, /浅色/);
  assert.match(provider, /深色/);
  assert.match(page, /<ThemeControl surface="cockpit" \/>/);
  assert.match(page, /<ThemeControl surface="workspace" \/>/);
  assert.match(timeline, /<ThemeControl surface="cockpit" \/>/);
  assert.match(layout, /themeBootstrapScript/);
  assert.match(css, /html\[data-theme="light"\] \.cockpit/);
  assert.match(css, /html\[data-theme="dark"\] \.app-shell/);
});
