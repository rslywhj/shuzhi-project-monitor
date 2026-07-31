import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("gates production deployment on CI and verifies Cloudflare health", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /pull_request:\s*\n\s+branches: \[main\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /name: Lint, build and test/);
  assert.match(workflow, /run: npm run lint/);
  assert.match(workflow, /run: npm run test/);
  assert.match(workflow, /deploy-production:/);
  assert.match(workflow, /needs: quality/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /secrets\.CLOUDFLARE_API_TOKEN/);
  assert.match(workflow, /secrets\.CLOUDFLARE_ACCOUNT_ID/);
  assert.match(workflow, /https:\/\/itpm\.dougge\.top\/api\/health/);
  assert.match(workflow, /"database":"connected"/);
});
