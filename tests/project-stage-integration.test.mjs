import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("persists milestone execution and multi-node weekly stage confirmation", async () => {
  const [schema, migration, weeklyRoute, executionRoute] = await Promise.all([
    read("db/schema.ts"),
    read("drizzle/0018_project_stage.sql"),
    read("app/api/projects/[id]/weekly-reports/route.ts"),
    read("app/api/projects/[id]/milestones/[milestoneId]/execution/route.ts"),
  ]);

  for (const field of [
    "executionStatus",
    "actualStart",
    "pausedReason",
    "executionUpdatedAt",
    "executionUpdatedBy",
    "primaryMilestoneId",
    "milestoneUpdatesJson",
  ]) {
    assert.match(schema, new RegExp(`${field}:`));
  }
  for (const column of [
    "execution_status",
    "actual_start",
    "paused_reason",
    "execution_updated_at",
    "execution_updated_by",
    "primary_milestone_id",
    "milestone_updates_json",
  ]) {
    assert.match(migration, new RegExp(column));
  }
  assert.match(weeklyRoute, /milestoneUpdates\?: MilestoneExecutionPayload\[\]/);
  assert.match(weeklyRoute, /activeMilestones\.length > 0/);
  assert.match(weeklyRoute, /存在进行中或暂停节点，请确认一个当前主节点后再提交/);
  assert.match(weeklyRoute, /weekly_report\.submit/);
  assert.match(executionRoute, /milestone\.execution_update/);
  assert.match(executionRoute, /normalizeMilestoneExecution/);
  assert.match(executionRoute, /recalculateProjectHealth/);
});

test("freezes project stage and data quality into locked snapshots", async () => {
  const [snapshotService, bootstrap] = await Promise.all([
    read("lib/snapshot-service.ts"),
    read("app/api/bootstrap/route.ts"),
  ]);

  assert.match(snapshotService, /projectStages/);
  assert.match(snapshotService, /stageDataQuality/);
  assert.match(snapshotService, /calculateProjectStage/);
  assert.match(snapshotService, /latestConfirmedPrimary/);
  assert.match(bootstrap, /stageSummary/);
  assert.match(bootstrap, /snapshotStageByProject/);
  assert.match(bootstrap, /formatShanghaiDate\(lockedSnapshot\.lockedAt\)/);
  assert.match(bootstrap, /calculateProjectStage/);
  assert.match(bootstrap, /milestoneUpdatesJson/);
});

test("shows stage roles across workspace cockpits PDF and PMO quality checks", async () => {
  const [page, timeline, printReport, css, manual] = await Promise.all([
    read("app/page.tsx"),
    read("app/timeline-cockpit.tsx"),
    read("app/cockpit-print-report.tsx"),
    read("app/globals.css"),
    read("docs/按角色用户使用手册.md"),
  ]);

  for (const label of ["当前主节点", "并行节点", "前序遗留", "下一节点"])
    assert.match(page, new RegExp(label));
  assert.match(page, /milestoneUpdates/);
  assert.match(page, /确认为当前主节点/);
  assert.match(page, /应启动未启动/);
  assert.match(timeline, /stage-main/);
  assert.match(timeline, /stageSummary/);
  assert.match(printReport, /stageLabel/);
  assert.match(css, /\.project-stage-card/);
  assert.match(css, /\.primary-stage/);
  assert.match(manual, /项目当前阶段/);
  assert.match(manual, /多节点/);
});
