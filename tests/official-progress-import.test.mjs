import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the 36-node official baseline and 74-project source catalog", async () => {
  const standard = await readFile(
    new URL("lib/official-progress-standard.ts", root),
    "utf8",
  );
  const nodeCodes = [...standard.matchAll(/"code": "N(\d{2})"/g)].map(
    (match) => Number(match[1]),
  );
  const projectSequences = [
    ...standard.matchAll(/"sourceSequence": (\d+)/g),
  ].map((match) => Number(match[1]));
  const weights = [
    ...standard.matchAll(/"defaultWeight": ([\d.]+)/g),
  ].map((match) => Number(match[1]));

  assert.deepEqual(nodeCodes, Array.from({ length: 36 }, (_, index) => index + 1));
  assert.deepEqual(
    projectSequences,
    Array.from({ length: 74 }, (_, index) => index + 1),
  );
  assert.equal(Number(weights.reduce((sum, value) => sum + value, 0).toFixed(2)), 100);
  assert.equal((standard.match(/"critical": true/g) ?? []).length, 3);
  assert.match(standard, /"stage": "立项阶段"/);
  assert.match(standard, /"stage": "运营阶段"/);
  assert.match(standard, /"name": "8\.3 项目后评价"/);
});

test("parses, previews and commits repeatable official progress workbook sync", async () => {
  const [parser, route, page, css, schema, migration, workflow, seed] =
    await Promise.all([
      readFile(new URL("lib/official-progress-import.ts", root), "utf8"),
      readFile(
        new URL("app/api/projects/progress-import/route.ts", root),
        "utf8",
      ),
      readFile(new URL("app/page.tsx", root), "utf8"),
      readFile(new URL("app/globals.css", root), "utf8"),
      readFile(new URL("db/schema.ts", root), "utf8"),
      readFile(
        new URL("drizzle/0019_official_progress_import.sql", root),
        "utf8",
      ),
      readFile(new URL(".github/workflows/ci.yml", root), "utf8"),
      readFile(new URL("lib/seed.ts", root), "utf8"),
    ]);

  assert.match(parser, /parseOfficialProgressWorkbook/);
  assert.match(parser, /当前识别到\$\{milestoneRows\.length\}个/);
  assert.match(parser, /officialExcelDate/);
  assert.match(parser, /executionStatus/);
  assert.match(route, /canManagePortfolio/);
  assert.match(route, /baselineConflicts/);
  assert.match(route, /scheduleWarnings/);
  assert.match(route, /已按Excel原值保留/);
  assert.match(route, /milestones\.schedule_confirmed = 0/);
  assert.match(route, /project\.progress_excel_import/);
  assert.match(route, /ON CONFLICT\(project_id, sequence\) DO UPDATE/);
  assert.match(page, /同步三级进度表/);
  assert.match(page, /OfficialProgressImportModal/);
  assert.match(page, /保留现基线/);
  assert.match(css, /official-progress-import-modal/);
  assert.match(schema, /sourceSequence: integer\("source_sequence"\)/);
  assert.match(schema, /scheduleConfirmed: integer\("schedule_confirmed"/);
  assert.match(migration, /INSERT INTO milestone_templates/);
  assert.match(migration, /'N36', '8\.3 项目后评价'/);
  assert.match(workflow, /wrangler d1 migrations apply DB --remote/);
  assert.match(seed, /chunks\(officialTemplateRows, 4\)/);
});
