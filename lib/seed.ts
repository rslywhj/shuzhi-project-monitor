import { count } from "drizzle-orm";
import { getDb } from "@/db";
import {
  baselineChanges,
  milestones,
  projects,
  ruleConfigs,
} from "@/db/schema";

const milestoneNames = [
  "立项启动",
  "需求确认",
  "方案评审",
  "开发完成",
  "联调测试",
  "用户验收",
  "上线切换",
];

const seedProjects = [
  ["P01", "司库管理系统", "王嘉", "财务数智组", "核心系统", 92, "green", 72, 74, 74, "low", ["green","green","green","green","green","green","yellow"]],
  ["P02", "智慧采购平台", "李程", "供应链组", "业务平台", 63, "red", 68, 53, 55, "high", ["green","green","yellow","red","red","na","na"]],
  ["P03", "人力资源共享平台", "陈路", "人力数智组", "业务平台", 81, "yellow", 57, 51, 52, "medium", ["green","green","green","yellow","yellow","na","na"]],
  ["P04", "合同全生命周期管理", "周航", "法务数智组", "核心系统", 88, "green", 46, 44, 44, "low", ["green","green","green","green","na","na","na"]],
  ["P05", "财务共享中心二期", "赵敏", "财务数智组", "核心系统", 59, "red", 83, 68, 71, "high", ["green","green","green","yellow","red","red","na"]],
  ["P06", "数据资产管理平台", "孙悦", "数据治理组", "数据平台", 76, "yellow", 64, 56, 57, "medium", ["green","green","yellow","yellow","green","na","na"]],
  ["P07", "经营分析驾驶舱", "何清", "数据治理组", "数据平台", 95, "green", 89, 91, 91, "low", ["green","green","green","green","green","green","green"]],
  ["P08", "审计数字化平台", "刘可", "监督数智组", "业务平台", 84, "yellow", 39, 34, 35, "medium", ["green","green","green","yellow","na","na","na"]],
  ["P09", "主数据治理一期", "林亦", "数据治理组", "数据平台", 90, "green", 76, 75, 75, "low", ["green","green","green","green","green","yellow","na"]],
  ["P10", "统一门户升级项目", "高远", "技术平台组", "技术底座", 67, "red", 94, 81, 82, "high", ["green","green","green","green","yellow","red","red"]],
] as const;

function isoDate(month: number, day: number) {
  return `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function chunks<T>(rows: T[], size: number) {
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, index) =>
    rows.slice(index * size, (index + 1) * size),
  );
}

export async function ensureSeeded() {
  const db = getDb();
  const [{ value }] = await db.select({ value: count() }).from(projects);
  if (value > 0) return;

  const projectRows = seedProjects.map((p) => ({
        id: p[0],
        code: p[0],
        name: p[1],
        ownerEmail: `${p[0].toLowerCase()}@projects.internal`,
        ownerName: p[2],
        org: p[3],
        type: p[4],
        score: p[5],
        status: p[6],
        planProgress: p[7],
        actualProgress: p[8],
        declaredProgress: p[9],
        riskLevel: p[10],
        currentBaselineVersion: p[0] === "P02" ? 2 : 1,
      }));
  for (const rows of chunks(projectRows, 4)) {
    await db.insert(projects).values(rows).onConflictDoNothing();
  }

  const milestoneRows = seedProjects.flatMap((project, projectIndex) =>
    milestoneNames.map((name, index) => {
      const status = project[11][index];
      const deviationDays = status === "red" ? index + 3 : status === "yellow" ? index + 1 : 0;
      const completion = status === "na" ? 0 : Math.min(100, 28 + index * 14);
      const finishMonth = 3 + index;
      const finishDay = 10 + index;
      return {
        projectId: project[0],
        name,
        sequence: index + 1,
        weight: [5, 10, 10, 20, 20, 20, 15][index],
        critical: index === 3 || index === 6,
        applicable: status !== "na",
        plannedStart: isoDate(Math.max(2, finishMonth - 1), 1 + projectIndex),
        plannedFinish: isoDate(finishMonth, finishDay),
        forecastFinish:
          status === "na" ? null : isoDate(finishMonth, Math.min(28, finishDay + deviationDays)),
        actualFinish: completion === 100 ? isoDate(finishMonth, finishDay + deviationDays) : null,
        completion,
        status,
        deviationDays,
        reason:
          status === "red"
            ? "接口或资源约束影响当前节点，已纳入重点纠偏。"
            : status === "yellow"
              ? "预测完成日期晚于批准基线，正在采取提前干预措施。"
              : "",
      };
    }),
  );
  for (const rows of chunks(milestoneRows, 4)) {
    await db.insert(milestones).values(rows).onConflictDoNothing();
  }

  await db.insert(ruleConfigs).values({
    version: 1,
    createdBy: "system",
  }).onConflictDoNothing();

  await db.insert(baselineChanges).values({
    projectId: "P02",
    versionFrom: 2,
    versionTo: 3,
    reason: "核心供应商接口规范调整，经项目专题会确认增加开发与联调周期。",
    changesJson: JSON.stringify([
      { milestone: "开发完成", from: "2026-07-16", to: "2026-07-28", days: 12 },
      { milestone: "联调测试", from: "2026-08-18", to: "2026-08-22", days: 4 },
      { milestone: "上线切换", from: "2026-10-20", to: "2026-10-31", days: 11 },
    ]),
    impact: "较原始基线累计延期23天；不影响年度总体目标；项目成本预计增加3.2%。",
    requestedBy: "p02@projects.internal",
  }).onConflictDoNothing();
}
