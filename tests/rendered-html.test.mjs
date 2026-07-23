import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

test("build emits the project monitoring application", async () => {
  const [page, layout, serverEntry] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../dist/server/index.js", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /数智军团 · 统建项目进度监控平台/);
  assert.match(page, /管理数智军团统建项目进度监控/);
  assert.match(page, /项目节点态势矩阵/);
  assert.match(page, /智慧采购平台/);
  assert.match(page, /周报完成率/);
  assert.match(serverEntry, /worker/);
  assert.doesNotMatch(page + layout, /codex-preview|Your site is taking shape|SkeletonPreview/i);
});

test("ships the complete prototype flow without starter artifacts", async () => {
  const [page, layout, css, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  for (const label of ["项目组合总览", "周度进度填报", "PMO 管理中心", "基线变更审批", "立即锁定快照"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /statusSymbol/);
  assert.match(page, /预测完成日期/);
  assert.match(layout, /openGraph/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("app/_sites-preview", templateRoot)));
  await access(new URL("public/og.png", templateRoot));
});

test("defines durable, authorized and auditable workflow APIs", async () => {
  const [hosting, schema, reportRoute, baselineRoute, snapshotRoute, migration] =
    await Promise.all([
      readFile(new URL(".openai/hosting.json", templateRoot), "utf8"),
      readFile(new URL("db/schema.ts", templateRoot), "utf8"),
      readFile(
        new URL("app/api/projects/[id]/weekly-reports/route.ts", templateRoot),
        "utf8",
      ),
      readFile(
        new URL("app/api/baseline-changes/[id]/approve/route.ts", templateRoot),
        "utf8",
      ),
      readFile(new URL("app/api/snapshots/lock/route.ts", templateRoot), "utf8"),
      readFile(new URL("drizzle/0000_married_elektra.sql", templateRoot), "utf8"),
    ]);

  assert.match(hosting, /"d1":\s*"DB"/);
  for (const table of [
    "projects",
    "milestones",
    "weekly_reports",
    "baseline_changes",
    "snapshots",
    "audit_logs",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE \\\`${table}\\\``));
  }
  assert.match(schema, /weekly_reports_project_week_idx/);
  assert.match(schema, /snapshots_week_version_idx/);
  assert.match(reportRoute, /canWriteProject/);
  assert.match(reportRoute, /weekly_report\.submit/);
  assert.match(reportRoute, /该周期快照已经锁定/);
  assert.match(baselineRoute, /canManagePortfolio/);
  assert.match(baselineRoute, /baseline_change\.approve/);
  assert.match(snapshotRoute, /snapshot\.lock/);
  assert.match(snapshotRoute, /重新锁定必须填写重新打开原因/);
});
