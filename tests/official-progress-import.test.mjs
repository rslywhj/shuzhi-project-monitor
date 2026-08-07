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
  assert.match(route, /if \(!canManagePortfolio\(identity\)\) return forbidden\(\)/);
  assert.match(route, /baselineConflicts/);
  assert.match(route, /scheduleWarnings/);
  assert.match(route, /已按Excel原值保留/);
  assert.match(route, /current_baseline_version = CASE WHEN \? > 0/);
  assert.match(route, /baselineVersionFrom \+ 1/);
  assert.match(route, /baselineKind = progressProject && baselineConflicts\.length/);
  assert.match(route, /WHEN excluded\.schedule_confirmed = 1/);
  assert.match(route, /project\.progress_excel_import/);
  assert.match(route, /ON CONFLICT\(project_id, sequence\) DO UPDATE/);
  assert.match(page, /同步三级进度表/);
  assert.match(page, /OfficialProgressImportModal/);
  assert.match(page, /canManagePortfolio && <div className="portfolio-import-actions">/);
  assert.match(page, /生成新的批准基线版本/);
  assert.match(page, /原始V1和既有版本永久保留/);
  assert.match(css, /official-progress-import-modal/);
  assert.match(schema, /sourceSequence: integer\("source_sequence"\)/);
  assert.match(schema, /scheduleConfirmed: integer\("schedule_confirmed"/);
  assert.match(migration, /INSERT INTO milestone_templates/);
  assert.match(migration, /'N36', '8\.3 项目后评价'/);
  assert.match(workflow, /wrangler d1 migrations apply DB --remote/);
  assert.match(seed, /chunks\(officialTemplateRows, 4\)/);
});

test("provides an explicitly local-only history reset command", async () => {
  const [packageJson, resetScript, manual] = await Promise.all([
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL("scripts/reset-local-data.mjs", root), "utf8"),
    readFile(new URL("docs/按角色用户使用手册.md", root), "utf8"),
  ]);

  assert.match(packageJson, /"db:local:reset"/);
  assert.match(resetScript, /resolve\(workspace, "\.wrangler", "state"\)/);
  assert.match(resetScript, /拒绝清理工作区以外的目录/);
  assert.match(manual, /优先执行“结项 → 归档”/);
  assert.match(manual, /正式环境硬删除/);
});
