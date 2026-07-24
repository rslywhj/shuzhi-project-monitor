import { env } from "cloudflare:workers";
import { and, count, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  baselineChanges,
  baselineVersions,
  milestoneTemplates,
  milestones,
  projects,
  ruleConfigs,
  users,
} from "@/db/schema";

async function ensureBaselineVersionRows(db: ReturnType<typeof getDb>) {
  const [projectRows, versionRows] = await Promise.all([
    db.select().from(projects),
    db
      .select({
        projectId: baselineVersions.projectId,
        version: baselineVersions.version,
      })
      .from(baselineVersions),
  ]);
  const existingKeys = new Set(
    versionRows.map((row) => `${row.projectId}:${row.version}`),
  );
  const projectsWithMissingVersions = projectRows.filter(
    (project) =>
      !existingKeys.has(`${project.id}:1`) ||
      !existingKeys.has(`${project.id}:${project.currentBaselineVersion}`),
  );
  if (!projectsWithMissingVersions.length) return;
  const milestoneRows = await db.select().from(milestones);
  for (const project of projectsWithMissingVersions) {
    const projectMilestones = milestoneRows
      .filter((milestone) => milestone.projectId === project.id)
      .sort((left, right) => left.sequence - right.sequence)
      .map((milestone) => ({
        milestoneId: milestone.id,
        templateId: milestone.templateId,
        name: milestone.name,
        sequence: milestone.sequence,
        plannedStart: milestone.plannedStart,
        plannedFinish: milestone.plannedFinish,
        weight: milestone.weight,
        critical: milestone.critical,
        applicable: milestone.applicable,
      }));
    const versions =
      project.currentBaselineVersion === 1
        ? [1]
        : [1, project.currentBaselineVersion];
    for (const version of versions) {
      const key = `${project.id}:${version}`;
      if (existingKeys.has(key)) continue;
      await db
        .insert(baselineVersions)
        .values({
          projectId: project.id,
          version,
          kind:
            project.currentBaselineVersion === 1
              ? "original"
              : "legacy",
          milestoneJson: JSON.stringify(projectMilestones),
          createdBy: "system",
        })
        .onConflictDoNothing();
      existingKeys.add(key);
    }
  }
}

const standardMilestoneTemplates = [
  ["M01", "立项启动", 5, false, "完成项目立项、组织与治理机制确认"],
  ["M02", "需求调研", 5, false, "完成业务现状、用户旅程与需求素材收集"],
  ["M03", "需求确认", 8, false, "冻结首期范围并完成需求签字确认"],
  ["M04", "方案设计", 7, false, "完成业务、应用、数据与技术方案设计"],
  ["M05", "方案评审", 10, false, "通过架构、安全及业务联合评审"],
  ["M06", "开发完成", 15, true, "完成约定范围开发并达到提测条件"],
  ["M07", "测试验证", 10, false, "完成系统、性能及安全测试"],
  ["M08", "联调测试", 10, false, "完成上下游系统联调与问题闭环"],
  ["M09", "试运行", 5, false, "完成试运行验证与上线准备"],
  ["M10", "用户验收", 10, true, "完成用户验收及遗留问题确认"],
  ["M11", "上线切换", 10, true, "完成生产上线、切换和运行观察"],
  ["M12", "结项移交", 5, false, "完成项目结项、资料归档和运维移交"],
] as const;

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

function demoSeedEnabled() {
  return (
    String(
      (env as unknown as Record<string, unknown>).SEED_DEMO_DATA ?? "",
    ).toLowerCase() === "true"
  );
}

async function ensureDemoProjectManagers(db: ReturnType<typeof getDb>) {
  if (!demoSeedEnabled()) return;
  const projectRows = await db
    .select({
      email: projects.ownerEmail,
      displayName: projects.ownerName,
    })
    .from(projects);
  const managerRows = [
    ...new Map(projectRows.map((row) => [row.email, row])).values(),
  ].map((row) => ({
    ...row,
    role: "manager" as const,
    active: true,
  }));
  for (const rows of chunks(managerRows, 20)) {
    await db.insert(users).values(rows).onConflictDoNothing();
  }
}

export async function ensureSeeded() {
  const db = getDb();
  await db
    .insert(milestoneTemplates)
    .values(
      standardMilestoneTemplates.map(
        ([code, name, defaultWeight, critical, description], index) => ({
          code,
          name,
          sequence: index + 1,
          defaultWeight,
          critical,
          description,
          createdBy: "system",
        }),
      ),
    )
    .onConflictDoNothing();
  const templateRows = await db.select().from(milestoneTemplates);
  const [{ value: unlinkedMilestones }] = await db
    .select({ value: count() })
    .from(milestones)
    .where(isNull(milestones.templateId));
  if (unlinkedMilestones > 0) {
    for (const template of templateRows) {
      await db
        .update(milestones)
        .set({ templateId: template.id })
        .where(
          and(
            isNull(milestones.templateId),
            eq(milestones.name, template.name),
          ),
        );
    }
  }
  await db
    .insert(ruleConfigs)
    .values({
      version: 1,
      createdBy: "system",
    })
    .onConflictDoNothing();
  const [{ value }] = await db.select({ value: count() }).from(projects);
  if (value > 0) {
    await ensureDemoProjectManagers(db);
    await ensureBaselineVersionRows(db);
    return;
  }
  if (!demoSeedEnabled()) return;

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
  await ensureDemoProjectManagers(db);

  const templateByName = new Map(
    templateRows.map((template) => [template.name, template.id]),
  );
  const milestoneRows = seedProjects.flatMap((project, projectIndex) =>
    milestoneNames.map((name, index) => {
      const status = project[11][index];
      const deviationDays = status === "red" ? index + 3 : status === "yellow" ? index + 1 : 0;
      const completion = status === "na" ? 0 : Math.min(100, 28 + index * 14);
      const finishMonth = 3 + index;
      const finishDay = 10 + index;
      return {
        projectId: project[0],
        templateId: templateByName.get(name) ?? null,
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
  await ensureBaselineVersionRows(db);
}
