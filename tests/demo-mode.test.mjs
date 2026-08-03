import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("automatic demo login is controlled only by deployment environment", async () => {
  const source = await readFile(
    new URL("../lib/server-auth.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /SEED_DEMO_DATA/);
  assert.match(source, /const useDemoIdentity = demoDataEnabled && !cookieEmail/);
  assert.doesNotMatch(source, /url\.hostname|localhost|127\.0\.0\.1/);
  assert.match(source, /demo@local/);
});

test("production explicitly keeps demo mode disabled", async () => {
  const production = await readFile(
    new URL("../wrangler.production.jsonc", import.meta.url),
    "utf8",
  );
  assert.match(production, /"SEED_DEMO_DATA"\s*:\s*"false"/);
});
