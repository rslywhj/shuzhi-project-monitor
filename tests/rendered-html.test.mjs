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

  for (const label of ["项目组合总览", "周度进度填报", "PMO 管理中心", "基线变更审批", "重新打开第"]) {
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
  const [hosting, schema, reportRoute, baselineRoute, baselineRequestRoute, baselineRejectRoute, snapshotRoute, snapshotReopenRoute, migration] =
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
      readFile(
        new URL("app/api/baseline-changes/route.ts", templateRoot),
        "utf8",
      ),
      readFile(
        new URL("app/api/baseline-changes/[id]/reject/route.ts", templateRoot),
        "utf8",
      ),
      readFile(new URL("app/api/snapshots/lock/route.ts", templateRoot), "utf8"),
      readFile(
        new URL("app/api/snapshots/[id]/reopen/route.ts", templateRoot),
        "utf8",
      ),
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
  assert.match(baselineRequestRoute, /baseline_change\.request/);
  assert.match(baselineRejectRoute, /baseline_change\.reject/);
  assert.match(snapshotRoute, /snapshot\.lock/);
  assert.match(snapshotRoute, /dashboardAlerts/);
  assert.match(snapshotRoute, /risk\.status !== "closed"/);
  assert.match(snapshotRoute, /action\.status === "overdue"/);
  assert.match(snapshotRoute, /请先填写原因并重新打开/);
  assert.match(snapshotReopenRoute, /snapshot\.reopen/);
  assert.match(snapshotReopenRoute, /只能重新打开该周期的最新快照版本/);
});

test("secures public access and exposes real administration workflows", async () => {
  const [auth, projectRoute, userRoute, ruleRoute, page] = await Promise.all([
    readFile(new URL("lib/server-auth.ts", templateRoot), "utf8"),
    readFile(new URL("app/api/projects/route.ts", templateRoot), "utf8"),
    readFile(new URL("app/api/users/[email]/route.ts", templateRoot), "utf8"),
    readFile(new URL("app/api/rule-configs/route.ts", templateRoot), "utf8"),
    readFile(new URL("app/page.tsx", templateRoot), "utf8"),
  ]);

  assert.match(auth, /APP_ADMIN_EMAILS/);
  assert.doesNotMatch(auth, /userCount === 0/);
  assert.match(projectRoute, /节点权重合计必须为100%/);
  assert.match(projectRoute, /project\.create/);
  assert.match(userRoute, /canAdministerUsers/);
  assert.match(userRoute, /不能停用或降级当前登录的管理员账号/);
  assert.match(ruleRoute, /rule_config\.publish/);
  assert.match(page, /新建统建项目/);
  assert.match(page, /用户与角色/);
  assert.match(page, /预警规则配置/);
});

test("implements risk and corrective-action closure with explainable health scoring", async () => {
  const [schema, riskRoute, actionRoute, health, page, migration] =
    await Promise.all([
      readFile(new URL("db/schema.ts", templateRoot), "utf8"),
      readFile(
        new URL("app/api/projects/[id]/risks/route.ts", templateRoot),
        "utf8",
      ),
      readFile(
        new URL("app/api/projects/[id]/actions/route.ts", templateRoot),
        "utf8",
      ),
      readFile(new URL("lib/health.ts", templateRoot), "utf8"),
      readFile(new URL("app/page.tsx", templateRoot), "utf8"),
      readFile(
        new URL("drizzle/0001_deep_peter_parker.sql", templateRoot),
        "utf8",
      ),
    ]);

  assert.match(schema, /export const risks/);
  assert.match(schema, /riskId: integer/);
  assert.match(riskRoute, /risk\.create/);
  assert.match(actionRoute, /corrective_action\.create/);
  assert.match(health, /schedulePenalty/);
  assert.match(health, /forcedRed/);
  assert.match(page, /风险与纠偏措施/);
  assert.match(migration, /CREATE TABLE `risks`/);
});

test("serves management views from locked snapshots rather than mutable live rows", async () => {
  const [bootstrap, heatmap, trends, snapshotRead, page] = await Promise.all([
    readFile(new URL("app/api/bootstrap/route.ts", templateRoot), "utf8"),
    readFile(
      new URL("app/api/dashboard/heatmap/route.ts", templateRoot),
      "utf8",
    ),
    readFile(
      new URL("app/api/dashboard/trends/route.ts", templateRoot),
      "utf8",
    ),
    readFile(new URL("app/api/snapshots/[id]/route.ts", templateRoot), "utf8"),
    readFile(new URL("app/page.tsx", templateRoot), "utf8"),
  ]);

  assert.match(bootstrap, /dashboardProjects/);
  assert.match(bootstrap, /lockedSnapshot/);
  assert.match(heatmap, /snapshots\.status, "locked"/);
  assert.match(trends, /latestByWeek/);
  assert.match(snapshotRead, /payload: JSON\.parse/);
  assert.match(page, /dashboardSnapshot/);
  assert.match(page, /当前锁定快照口径/);
});

test("persists the twelve-node standard template and project-level milestone governance", async () => {
  const [schema, seed, templatesRoute, projectMilestonesRoute, projectRoute, page, css, migration] =
    await Promise.all([
      readFile(new URL("db/schema.ts", templateRoot), "utf8"),
      readFile(new URL("lib/seed.ts", templateRoot), "utf8"),
      readFile(
        new URL("app/api/milestone-templates/route.ts", templateRoot),
        "utf8",
      ),
      readFile(
        new URL("app/api/projects/[id]/milestones/route.ts", templateRoot),
        "utf8",
      ),
      readFile(new URL("app/api/projects/route.ts", templateRoot), "utf8"),
      readFile(new URL("app/page.tsx", templateRoot), "utf8"),
      readFile(new URL("app/globals.css", templateRoot), "utf8"),
      readFile(
        new URL("drizzle/0004_square_justin_hammer.sql", templateRoot),
        "utf8",
      ),
    ]);

  assert.match(schema, /export const milestoneTemplates/);
  assert.match(schema, /baseline_changes_one_pending_project_idx/);
  assert.match(seed, /M12/);
  assert.match(seed, /结项移交/);
  assert.match(templatesRoute, /milestone_template\.publish/);
  assert.match(projectMilestonesRoute, /project_milestones\.update/);
  assert.match(projectMilestonesRoute, /project_milestone\.create_custom/);
  assert.match(projectRoute, /milestoneChunks/);
  assert.match(page, /项目节点治理/);
  assert.match(page, /启用权重/);
  assert.match(css, /--milestone-count/);
  assert.match(migration, /CREATE TABLE `milestone_templates`/);
});

test("supports dynamic weekly drafts, immutable baselines and real project activity", async () => {
  const [schema, migration, reportRoute, activityRoute, snapshotRoute, health, trends, page] =
    await Promise.all([
      readFile(new URL("db/schema.ts", templateRoot), "utf8"),
      readFile(new URL("drizzle/0005_lethal_ogun.sql", templateRoot), "utf8"),
      readFile(
        new URL("app/api/projects/[id]/weekly-reports/route.ts", templateRoot),
        "utf8",
      ),
      readFile(
        new URL("app/api/projects/[id]/activity/route.ts", templateRoot),
        "utf8",
      ),
      readFile(new URL("app/api/snapshots/lock/route.ts", templateRoot), "utf8"),
      readFile(new URL("lib/health.ts", templateRoot), "utf8"),
      readFile(new URL("app/api/dashboard/trends/route.ts", templateRoot), "utf8"),
      readFile(new URL("app/page.tsx", templateRoot), "utf8"),
    ]);

  assert.match(schema, /export const baselineVersions/);
  assert.match(schema, /draftJson/);
  assert.match(migration, /CREATE TABLE `baseline_versions`/);
  assert.match(migration, /ALTER TABLE `weekly_reports` ADD `draft_json`/);
  assert.match(reportRoute, /weekly_report\.save_draft/);
  assert.match(reportRoute, /submitMode === "draft"/);
  assert.match(activityRoute, /baselineVersions/);
  assert.match(activityRoute, /auditLogs/);
  assert.match(snapshotRoute, /ne\(weeklyReports\.status, "draft"\)/);
  assert.match(health, /ne\(weeklyReports\.status, "draft"\)/);
  assert.match(trends, /\.slice\(0, 12\)/);
  assert.match(page, /已自动切换到下一填报周期/);
  assert.match(page, /已恢复本周服务器草稿/);
  assert.match(page, /暂无已锁定周度快照/);
  assert.match(page, /ProjectActivityPanel/);
  assert.match(page, /function WeeklyProgressChart/);
  assert.match(page, /周度系统计算进度与项目经理申报进度曲线/);
  assert.match(page, /report\.status !== "draft"/);
  assert.match(page, /\.slice\(-12\)/);
});

test("closes project maintenance, account lifecycle and dynamic PMO operations", async () => {
  const [page, projectRoute, userRoute, snapshotRead] = await Promise.all([
    readFile(new URL("app/page.tsx", templateRoot), "utf8"),
    readFile(new URL("app/api/projects/[id]/route.ts", templateRoot), "utf8"),
    readFile(new URL("app/api/users/[email]/route.ts", templateRoot), "utf8"),
    readFile(new URL("app/api/snapshots/[id]/route.ts", templateRoot), "utf8"),
  ]);

  assert.match(page, /编辑项目基本信息/);
  assert.match(page, /saveProject/);
  assert.match(projectRoute, /project\.update/);
  assert.match(page, /toggleUser/);
  assert.match(page, /已停用/);
  assert.match(userRoute, /typeof payload\.active === "boolean"/);
  assert.match(page, /reportingPeriod\.weekKey/);
  assert.doesNotMatch(page, /body: JSON\.stringify\(\{ weekKey: "2026-W30" \}\)/);
  assert.match(page, /由当前周报、红灯状态、差异校验和审批队列实时生成/);
  assert.match(page, /项目进度快照-/);
  assert.match(snapshotRead, /payload: JSON\.parse/);
});

test("persists weekly report attachments in R2 and removes dead prototype controls", async () => {
  const [hosting, schema, migration, uploadRoute, fileRoute, activityRoute, page] =
    await Promise.all([
      readFile(new URL(".openai/hosting.json", templateRoot), "utf8"),
      readFile(new URL("db/schema.ts", templateRoot), "utf8"),
      readFile(
        new URL("drizzle/0006_faithful_black_cat.sql", templateRoot),
        "utf8",
      ),
      readFile(
        new URL("app/api/projects/[id]/attachments/route.ts", templateRoot),
        "utf8",
      ),
      readFile(
        new URL("app/api/attachments/[id]/route.ts", templateRoot),
        "utf8",
      ),
      readFile(
        new URL("app/api/projects/[id]/activity/route.ts", templateRoot),
        "utf8",
      ),
      readFile(new URL("app/page.tsx", templateRoot), "utf8"),
    ]);

  assert.match(hosting, /"r2":\s*"FILES"/);
  assert.match(schema, /export const attachments/);
  assert.match(migration, /CREATE TABLE `attachments`/);
  assert.match(uploadRoute, /MAX_FILE_SIZE/);
  assert.match(uploadRoute, /canWriteProject/);
  assert.match(uploadRoute, /bucket\.put/);
  assert.match(uploadRoute, /该周期快照已经锁定，不能新增附件/);
  assert.match(uploadRoute, /attachment\.upload/);
  assert.match(fileRoute, /content-disposition/);
  assert.match(fileRoute, /attachment\.delete/);
  assert.match(fileRoute, /该周期快照已经锁定，不能删除附件/);
  assert.match(activityRoute, /attachmentRows/);
  assert.match(page, /支撑附件/);
  assert.match(page, /uploadAttachment/);
  assert.match(page, /查看历史版本（/);
  assert.doesNotMatch(page, /支撑附件（后续开放）/);
  assert.doesNotMatch(page, /<strong>95\.5%<\/strong>/);
  assert.doesNotMatch(page, /退出演示账号/);
});

test("delivers recipient-scoped notifications, report reminders and red escalation", async () => {
  const [
    schema,
    migration,
    notificationRoute,
    notificationItemRoute,
    reminderRoute,
    baselineApproveRoute,
    baselineRejectRoute,
    page,
  ] = await Promise.all([
    readFile(new URL("db/schema.ts", templateRoot), "utf8"),
    readFile(new URL("drizzle/0007_soft_scream.sql", templateRoot), "utf8"),
    readFile(new URL("app/api/notifications/route.ts", templateRoot), "utf8"),
    readFile(
      new URL("app/api/notifications/[id]/route.ts", templateRoot),
      "utf8",
    ),
    readFile(
      new URL("app/api/notifications/reminders/route.ts", templateRoot),
      "utf8",
    ),
    readFile(
      new URL("app/api/baseline-changes/[id]/approve/route.ts", templateRoot),
      "utf8",
    ),
    readFile(
      new URL("app/api/baseline-changes/[id]/reject/route.ts", templateRoot),
      "utf8",
    ),
    readFile(new URL("app/page.tsx", templateRoot), "utf8"),
  ]);

  assert.match(schema, /export const notifications/);
  assert.match(schema, /notifications_dedup_idx/);
  assert.match(migration, /CREATE TABLE `notifications`/);
  assert.match(notificationRoute, /eq\(notifications\.recipientEmail, identity\.email\)/);
  assert.match(notificationItemRoute, /eq\(notifications\.recipientEmail, identity\.email\)/);
  assert.match(reminderRoute, /canManagePortfolio/);
  assert.match(reminderRoute, /project\.status !== "red"/);
  assert.match(reminderRoute, /notification\.remind_report/);
  assert.match(reminderRoute, /notification\.escalate_red/);
  assert.match(baselineApproveRoute, /type: "baseline_decision"/);
  assert.match(baselineRejectRoute, /type: "baseline_decision"/);
  assert.match(page, /通知中心/);
  assert.match(page, /全部已读/);
  assert.match(page, /催报缺报/);
  assert.match(page, /升级红灯/);
});

test("supports all required management heatmap filter dimensions", async () => {
  const page = await readFile(new URL("app/page.tsx", templateRoot), "utf8");

  assert.match(page, /全部组织/);
  assert.match(page, /全部负责人/);
  assert.match(page, /全部类型/);
  assert.match(page, /全部状态/);
  assert.match(page, /project\.owner === owner/);
  assert.match(page, /project\.type === projectType/);
  assert.match(page, /setPage\(0\)/);
});

test("shows a real authentication boundary instead of unauthenticated demo data", async () => {
  const [page, auth] = await Promise.all([
    readFile(new URL("app/page.tsx", templateRoot), "utf8"),
    readFile(new URL("app/chatgpt-auth.ts", templateRoot), "utf8"),
  ]);

  assert.match(page, /function LoginScreen/);
  assert.match(page, /response\.status === 401/);
  assert.match(page, /setDataState\("unauthenticated"\)/);
  assert.match(page, /\/signin-with-chatgpt\?return_to=%2F/);
  assert.match(page, /\/signout-with-chatgpt\?return_to=%2F/);
  assert.match(page, /身份由登录服务验证/);
  assert.match(auth, /safeRelativeReturnPath/);
  assert.match(auth, /isReservedAuthPath/);
});

test("freezes high risks and overdue actions into the management snapshot", async () => {
  const [snapshotRoute, bootstrap, page] = await Promise.all([
    readFile(new URL("app/api/snapshots/lock/route.ts", templateRoot), "utf8"),
    readFile(new URL("app/api/bootstrap/route.ts", templateRoot), "utf8"),
    readFile(new URL("app/page.tsx", templateRoot), "utf8"),
  ]);

  assert.match(snapshotRoute, /highRisks/);
  assert.match(snapshotRoute, /overdueActions/);
  assert.match(snapshotRoute, /capturedDate/);
  assert.match(bootstrap, /payload\.dashboardAlerts/);
  assert.match(bootstrap, /dashboardAlerts,/);
  assert.match(page, /开放高风险/);
  assert.match(page, /逾期措施/);
  assert.match(page, /alerts\.highRisks/);
  assert.match(page, /alerts\.overdueActions/);
});
