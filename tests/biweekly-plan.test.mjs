import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildRollingWeeks,
  buildRollingWeeksFromWeekKey,
  listHistoricalWeekKeys,
  paginatePrintRows,
  validateTaskDates,
} from "../lib/biweekly-plan.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("builds current and next natural weeks in UTC+8 including year rollover", () => {
  const weeks = buildRollingWeeks(new Date("2025-12-31T16:30:00.000Z"));
  assert.deepEqual(
    weeks.map((week) => week.weekKey),
    ["2026-W01", "2026-W02"],
  );
  assert.equal(weeks[0].startDate, "2025-12-29");
  assert.equal(weeks[0].endDate, "2026-01-04");
  assert.equal(weeks[1].startDate, "2026-01-05");
  assert.equal(weeks[1].endDate, "2026-01-11");
});

test("validates dates against the selected rolling week", () => {
  const weeks = buildRollingWeeks(new Date("2026-08-03T03:00:00.000Z"));
  assert.doesNotThrow(() =>
    validateTaskDates("2026-W32", "2026-08-03", "2026-08-07", weeks),
  );
  assert.throws(
    () => validateTaskDates("2026-W32", "2026-08-03", "2026-08-12", weeks),
    /本周/,
  );
  assert.throws(
    () => validateTaskDates("2026-W32", "2026-08-07", "2026-08-03", weeks),
    /不能早于/,
  );
});

test("rebuilds and orders read-only historical rolling windows", () => {
  const weeks = buildRollingWeeksFromWeekKey("2025-W52");
  assert.deepEqual(
    weeks.map((week) => week.weekKey),
    ["2025-W52", "2026-W01"],
  );
  assert.equal(weeks[0].startDate, "2025-12-22");
  assert.equal(weeks[1].startDate, "2025-12-29");
  assert.deepEqual(weeks.map((week) => week.label), ["本周", "下周"]);
  assert.deepEqual(
    listHistoricalWeekKeys(
      ["2026-W31", "2026-W30", "2026-W31", "2026-W32", "invalid"],
      "2026-W32",
    ),
    ["2026-W31", "2026-W30"],
  );
  assert.throws(() => buildRollingWeeksFromWeekKey("2021-W53"), /不存在/);
});

test("paginates all filtered rows for A4 landscape reports", () => {
  assert.deepEqual(
    paginatePrintRows(Array.from({ length: 21 }, (_, index) => index + 1), 10),
    [
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      [21],
    ],
  );
  assert.deepEqual(paginatePrintRows([], 8), [[]]);
});

test("persists, authorizes and audits biweekly plan tasks", async () => {
  const [schema, migration, projectRoute, taskRoute, page, component, print, css] =
    await Promise.all([
      read("db/schema.ts"),
      read("drizzle/0017_biweekly_plan_tasks.sql"),
      read("app/api/projects/[id]/biweekly-plans/route.ts"),
      read("app/api/biweekly-plan-tasks/[id]/route.ts"),
      read("app/page.tsx"),
      read("app/biweekly-plan.tsx"),
      read("app/cockpit-print-report.tsx"),
      read("app/globals.css"),
    ]);
  assert.match(schema, /export const biweeklyPlanTasks = sqliteTable/);
  assert.match(migration, /CREATE TABLE `biweekly_plan_tasks`/);
  for (const route of [projectRoute, taskRoute]) {
    assert.match(route, /canWriteProject/);
    assert.match(route, /projectLifecycleLocked/);
    assert.match(route, /auditLogs/);
  }
  assert.match(projectRoute, /export async function GET/);
  assert.match(projectRoute, /export async function POST/);
  assert.match(projectRoute, /scope === "history"/);
  assert.match(projectRoute, /availablePlanWeeks/);
  assert.match(projectRoute, /exportAllTasks/);
  assert.match(taskRoute, /export async function PATCH/);
  assert.match(taskRoute, /export async function DELETE/);
  assert.match(page, /"biweekly-plan"/);
  assert.match(component, /\{week\.label\}计划及完成情况/);
  assert.match(component, /"本周" \| "下周"/);
  assert.match(component, /biweekly-mobile-list/);
  assert.match(component, /滚动周期/);
  assert.doesNotMatch(component, /统一按“本周＋下周”查看/);
  assert.doesNotMatch(component, />当前双周</);
  assert.match(component, /导出全量计划/);
  assert.match(print, /paginateTimelinePrintRows\(rows, fontScale\)/);
  assert.match(print, /paginateMatrixPrintRows\(rows, fontScale\)/);
  assert.match(css, /@page\{size:A4 landscape;margin:8mm\}/);
  assert.match(css, /break-after:page/);
});
