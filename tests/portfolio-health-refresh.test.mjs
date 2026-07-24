import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("runs one recoverable Shanghai-day health refresh before portfolio automation", async () => {
  const [
    schema,
    migration,
    refreshService,
    automation,
    bootstrap,
    healthRoute,
    page,
    readme,
    healthService,
    snapshotService,
    ruleConfigRoute,
    weeklyReportRoute,
  ] = await Promise.all([
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("drizzle/0009_grey_shen.sql", root), "utf8"),
    readFile(new URL("lib/portfolio-health-refresh.ts", root), "utf8"),
    readFile(new URL("lib/portfolio-automation.ts", root), "utf8"),
    readFile(new URL("app/api/bootstrap/route.ts", root), "utf8"),
    readFile(new URL("app/api/health/route.ts", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("README.md", root), "utf8"),
    readFile(new URL("lib/health.ts", root), "utf8"),
    readFile(new URL("lib/snapshot-service.ts", root), "utf8"),
    readFile(new URL("app/api/rule-configs/route.ts", root), "utf8"),
    readFile(new URL("app/api/projects/[id]/weekly-reports/route.ts", root), "utf8"),
  ]);

  assert.match(schema, /healthCalculatedAt: text\("health_calculated_at"\)/);
  assert.match(schema, /export const portfolioHealthRuns/);
  assert.match(schema, /portfolio_health_runs_key_idx/);
  assert.match(schema, /portfolio_health_runs_status_idx/);
  assert.match(migration, /CREATE TABLE `portfolio_health_runs`/);
  assert.match(migration, /CREATE UNIQUE INDEX `portfolio_health_runs_key_idx`/);
  assert.match(migration, /ALTER TABLE `projects` ADD `health_calculated_at`/);

  assert.match(
    refreshService,
    /runKey = `daily:\$\{options\.asOfDate\}:rule-v\$\{activeRule\?\.version \?\? 1\}`/,
  );
  assert.match(refreshService, /\.onConflictDoNothing\(\)/);
  assert.match(refreshService, /STALE_RUN_MS = 15 \* 60_000/);
  assert.match(refreshService, /eq\(portfolioHealthRuns\.status, "failed"\)/);
  assert.match(refreshService, /lte\(portfolioHealthRuns\.startedAt, staleBefore\)/);
  assert.match(refreshService, /PROJECT_BATCH_SIZE = 5/);
  assert.match(refreshService, /recalculateProjectHealth/);
  assert.match(refreshService, /touchProject: false/);
  assert.match(refreshService, /options\.evaluationWeekKey/);
  assert.match(refreshService, /automation\.health_refresh/);
  assert.match(refreshService, /changedProjectCount/);

  assert.match(automation, /refreshPortfolioHealth/);
  assert.match(automation, /window\.localTimestamp\.slice\(0, 10\)/);
  assert.match(automation, /evaluationWeekKey: window\.currentWeekKey/);
  assert.match(automation, /healthRefresh,/);
  assert.match(bootstrap, /runPortfolioAutomation/);

  assert.match(healthRoute, /portfolioHealthRuns/);
  assert.match(healthRoute, /healthRefresh: latestRefreshRows\[0\] \?\? null/);
  assert.match(page, /"automation\.health_refresh": "每日健康度重算"/);
  assert.match(readme, /每日按上海时区自动刷新全量项目健康度/);

  assert.match(
    healthService,
    /options: \{ touchProject\?: boolean; asOfDate\?: string \} = \{\}/,
  );
  assert.match(healthService, /timeZone: "Asia\/Shanghai"/);
  assert.match(
    healthService,
    /evaluationDate\(evaluationWeekKey, options\.asOfDate\)/,
  );
  assert.match(healthService, /isoWeekKey\(today\)/);
  assert.match(healthService, /isoWeekKey\(asOf\)/);
  assert.match(healthService, /healthCalculatedAt: calculatedAt/);
  assert.match(
    healthService,
    /options\.touchProject === false \? \{\} : \{ updatedAt: calculatedAt \}/,
  );
  assert.match(snapshotService, /touchProject: false/);
  assert.match(ruleConfigRoute, /touchProject: false/);
  assert.match(refreshService, /asOfDate: options\.asOfDate/);
  assert.match(
    weeklyReportRoute,
    /recalculateProjectHealth\(id, weekKey\)/,
  );
});
