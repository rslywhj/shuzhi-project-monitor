import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps the management cockpit scrollable in shorter desktop viewports", async () => {
  const css = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  const responsiveBlock = css.match(
    /@media \(min-width:1500px\) and \(min-height:900px\) and \(max-height:1100px\)\{([\s\S]*?)\n\}/,
  )?.[1];

  assert.ok(responsiveBlock, "the desktop cockpit viewport rule must exist");
  assert.match(responsiveBlock, /\.cockpit\{height:auto;/);
  assert.match(responsiveBlock, /min-height:100vh/);
  assert.match(responsiveBlock, /overflow-y:auto/);
  assert.doesNotMatch(responsiveBlock, /overflow:hidden/);
});

test("keeps timeline month navigation arrows centered at enlarged font scales", async () => {
  const css = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(
    css,
    /\.timeline-window-nav button\{[^}]*height:calc\(26px \* var\(--ui-font-scale,1\)\)[^}]*display:inline-grid[^}]*place-items:center[^}]*line-height:1/,
  );
  assert.match(
    css,
    /\.timeline-window-nav button:first-child,.timeline-window-nav button:nth-child\(3\)\{[^}]*width:calc\(27px \* var\(--ui-font-scale,1\)\)[^}]*font-size:calc\(17px \* var\(--ui-font-scale,1\)\)/,
  );
});
