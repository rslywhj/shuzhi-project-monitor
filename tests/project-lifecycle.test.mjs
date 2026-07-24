import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("persists and audits the complete project lifecycle", async () => {
  const [schema, migration, route, lifecycle] = await Promise.all([
    read("db/schema.ts"),
    read("drizzle/0011_fine_human_torch.sql"),
    read("app/api/projects/[id]/lifecycle/route.ts"),
    read("lib/project-lifecycle.ts"),
  ]);

  assert.match(schema, /lifecycleStatus: text\("lifecycle_status"/);
  assert.match(schema, /lifecycleReason: text\("lifecycle_reason"/);
  assert.match(schema, /completedAt: text\("completed_at"/);
  assert.match(schema, /archivedAt: text\("archived_at"/);
  assert.match(schema, /projects_lifecycle_status_idx/);
  assert.match(migration, /ADD `lifecycle_status` text DEFAULT 'active' NOT NULL/);
  assert.match(migration, /CREATE INDEX `projects_lifecycle_status_idx`/);
  assert.match(route, /project\.lifecycle_change/);
  assert.match(route, /只有已结项项目可以归档/);
  assert.match(route, /只有在建项目可以标记结项/);
  assert.match(route, /overrideOpenItems/);
  assert.match(route, /notExists/);
  assert.match(lifecycle, /incompleteMilestoneCount/);
  assert.match(lifecycle, /openRiskCount/);
  assert.match(lifecycle, /openActionCount/);
  assert.match(lifecycle, /pendingBaselineCount/);
});

test("locks closed projects and excludes them from live monitoring", async () => {
  const [
    reportRoute,
    projectRoute,
    milestoneRoute,
    riskRoute,
    actionRoute,
    baselineApproveRoute,
    baselineRejectRoute,
    snapshotService,
    healthRefresh,
    automation,
    reminders,
  ] = await Promise.all([
    read("app/api/projects/[id]/weekly-reports/route.ts"),
    read("app/api/projects/[id]/route.ts"),
    read("app/api/projects/[id]/milestones/route.ts"),
    read("app/api/projects/[id]/risks/route.ts"),
    read("app/api/projects/[id]/actions/route.ts"),
    read("app/api/baseline-changes/[id]/approve/route.ts"),
    read("app/api/baseline-changes/[id]/reject/route.ts"),
    read("lib/snapshot-service.ts"),
    read("lib/portfolio-health-refresh.ts"),
    read("lib/portfolio-automation.ts"),
    read("app/api/notifications/reminders/route.ts"),
  ]);

  for (const route of [
    reportRoute,
    projectRoute,
    milestoneRoute,
    riskRoute,
    actionRoute,
    baselineApproveRoute,
    baselineRejectRoute,
  ]) {
    assert.match(route, /projectLifecycleLocked/);
    assert.match(route, /lifecycleLockedResponse/);
  }
  for (const source of [
    snapshotService,
    healthRefresh,
    automation,
    reminders,
  ]) {
    assert.match(source, /lifecycleStatus/);
    assert.match(source, /"active"/);
  }
  assert.match(snapshotService, /projectCount:\s*projectRows\.length/);
  assert.match(snapshotService, /activeProjectIds/);
});

test("exposes lifecycle filtering, closure checks and read-only UX", async () => {
  const [page, bootstrap] = await Promise.all([
    read("app/page.tsx"),
    read("app/api/bootstrap/route.ts"),
  ]);

  assert.match(bootstrap, /lifecycleStatus/);
  assert.match(bootstrap, /lifecycleReason/);
  assert.match(page, /生命周期筛选/);
  assert.match(page, /在建项目/);
  assert.match(page, /项目状态管理/);
  assert.match(page, /确认带未闭环事项结项/);
  assert.match(page, /project\.lifecycle_change/);
  assert.match(page, /周报只读/);
  assert.match(page, /lifecycleLocked \|\| submitting/);
  assert.match(page, /activeProjects\.filter/);
});
