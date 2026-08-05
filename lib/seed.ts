import { env } from "cloudflare:workers";
import { and, count, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  baselineChanges,
  baselineVersions,
  biweeklyPlanTasks,
  correctiveActions,
  milestoneTemplates,
  milestones,
  notifications,
  projects,
  resourceAllocations,
  resources,
  risks,
  ruleConfigs,
  users,
  weeklyReports,
} from "@/db/schema";
import { buildRollingWeeks } from "@/lib/biweekly-plan";
import { shanghaiDateIso } from "@/lib/date-time";
import { isoWeekKeyForDate } from "@/lib/reporting-period";
import {
  DEMO_MILESTONE_CADENCE_DAYS,
  seedProjects,
} from "@/lib/demo-seed-data";

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

function demoDateAt(days: number) {
  const value = new Date(`${shanghaiDateIso()}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function demoWeekKeyAt(days: number) {
  const [year, month, day] = demoDateAt(days).split("-").map(Number);
  return isoWeekKeyForDate(year, month, day);
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
  await db
    .insert(users)
    .values([
      {
        email: "executive.demo@projects.internal",
        displayName: "管理层演示用户",
        role: "executive",
        active: true,
      },
      {
        email: "pmo.demo@projects.internal",
        displayName: "PMO演示用户",
        role: "pmo",
        active: true,
      },
      {
        email: "inactive.demo@projects.internal",
        displayName: "已停用项目经理",
        role: "manager",
        active: false,
      },
    ])
    .onConflictDoNothing();
}

async function ensureDemoResourcePlanning(db: ReturnType<typeof getDb>) {
  if (!demoSeedEnabled()) return;
  const resourceSeeds = [
    ["共享架构师", "person", "技术平台组", 40],
    ["数据治理专家组", "team", "数据治理组", 80],
    ["集成测试团队", "team", "质量保障组", 80],
    ["核心供应商A", "vendor", "供应商协同组", 60],
    ["UAT共享环境", "environment", "基础设施组", 40],
    ["生产切换窗口", "environment", "运维保障组", 24],
  ] as const;
  for (const [name, resourceType, org, capacityHoursPerWeek] of resourceSeeds) {
    await db
      .insert(resources)
      .values({
        name,
        resourceType,
        org,
        capacityHoursPerWeek,
        active: true,
        createdBy: "system",
      })
      .onConflictDoNothing();
  }
  const [{ value: allocationCount }] = await db
    .select({ value: count() })
    .from(resourceAllocations);
  if (allocationCount > 0) return;
  const [resourceRows, projectRows, milestoneRows] = await Promise.all([
    db.select().from(resources),
    db.select().from(projects),
    db.select().from(milestones),
  ]);
  const resourceByName = new Map(
    resourceRows.map((resource) => [resource.name, resource]),
  );
  const projectIds = new Set(projectRows.map((project) => project.id));
  const firstMilestoneByProject = new Map<string, number>();
  for (const milestone of milestoneRows
    .filter((milestone) => milestone.applicable)
    .sort((left, right) => left.sequence - right.sequence)) {
    if (!firstMilestoneByProject.has(milestone.projectId)) {
      firstMilestoneByProject.set(milestone.projectId, milestone.id);
    }
  }
  const dateAt = (days: number) => {
    const value = new Date();
    value.setUTCHours(0, 0, 0, 0);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  };
  const allocationSeeds = [
    ["共享架构师", "P02", "总体架构与接口治理", -7, 55, 28, "confirmed"],
    ["共享架构师", "P06", "数据架构评审", 0, 48, 20, "planned"],
    ["数据治理专家组", "P06", "主数据规则梳理", -14, 70, 52, "confirmed"],
    ["数据治理专家组", "P09", "标准与质量核验", 7, 63, 36, "planned"],
    ["集成测试团队", "P05", "集成测试执行", -7, 42, 50, "confirmed"],
    ["集成测试团队", "P10", "回归与性能测试", 7, 56, 40, "planned"],
    ["集成测试团队", "P14", "数据中台专项测试", 7, 56, 46, "confirmed"],
    ["核心供应商A", "P02", "核心模块交付", -14, 49, 42, "confirmed"],
    ["核心供应商A", "P13", "供应商门户交付", 0, 42, 30, "planned"],
    ["UAT共享环境", "P02", "采购业务验收", 14, 42, 30, "confirmed"],
    ["UAT共享环境", "P08", "审计场景验收", 14, 42, 20, "planned"],
    ["生产切换窗口", "P05", "生产切换保障", 49, 63, 16, "planned"],
    ["生产切换窗口", "P10", "门户升级切换", 49, 63, 12, "planned"],
    ["生产切换窗口", "P16", "权限治理切换", 49, 63, 10, "planned"],
  ] as const;
  const rows = allocationSeeds.flatMap(
    ([
      resourceName,
      projectId,
      role,
      startOffset,
      endOffset,
      hoursPerWeek,
      status,
    ]) => {
      const resource = resourceByName.get(resourceName);
      if (!resource || !projectIds.has(projectId)) return [];
      return [
        {
          resourceId: resource.id,
          projectId,
          milestoneId: firstMilestoneByProject.get(projectId) ?? null,
          role,
          startDate: dateAt(startOffset),
          endDate: dateAt(endOffset),
          hoursPerWeek,
          status,
          note: "演示资源计划，可在资源工作台中调整。",
          createdBy: "system",
        },
      ];
    },
  );
  for (const rowsChunk of chunks(rows, 8)) {
    await db.insert(resourceAllocations).values(rowsChunk);
  }
}

async function ensureDemoScenarioData(db: ReturnType<typeof getDb>) {
  if (!demoSeedEnabled()) return;
  const [projectRows, milestoneRows] = await Promise.all([
    db.select().from(projects),
    db.select().from(milestones),
  ]);
  const projectById = new Map(projectRows.map((project) => [project.id, project]));
  const milestoneByProjectAndSequence = new Map(
    milestoneRows.map((milestone) => [
      `${milestone.projectId}:${milestone.sequence}`,
      milestone,
    ]),
  );

  const [{ value: rollingPlanCount }] = await db
    .select({ value: count() })
    .from(biweeklyPlanTasks);
  if (rollingPlanCount === 0) {
    const weeks = buildRollingWeeks();
    const activeProjects = projectRows.filter(
      (project) => (project.lifecycleStatus ?? "active") === "active",
    );
    const dayAt = (startDate: string, offset: number) => {
      const date = new Date(`${startDate}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + offset);
      return date.toISOString().slice(0, 10);
    };
    const taskRows = activeProjects.flatMap((project, projectIndex) => {
      const owner = project.ownerName;
      const currentStatus = ([
        "completed",
        "in_progress",
        "delayed",
        "cancelled",
      ] as const)[projectIndex % 4];
      const current = weeks[0];
      const next = weeks[1];
      return [
        {
          projectId: project.id,
          weekKey: current.weekKey,
          taskDescription:
            projectIndex % 3 === 0
              ? "完成本阶段方案评审意见闭环"
              : projectIndex % 3 === 1
                ? "推进核心功能开发与联调验证"
                : "组织业务数据核验并输出问题清单",
          owner,
          participants:
            projectIndex % 2 === 0 ? "业务负责人、架构师" : "产品经理、测试经理",
          plannedStart: dayAt(current.startDate, 0),
          plannedFinish: dayAt(current.startDate, 3),
          workdays: 4,
          actualFinish:
            currentStatus === "completed" ? dayAt(current.startDate, 2) : null,
          status: currentStatus,
          tracking:
            currentStatus === "completed"
              ? "交付物已完成复核并归档。"
              : currentStatus === "delayed"
                ? "依赖接口交付晚于计划，已安排每日跟踪并升级协调。"
                : currentStatus === "cancelled"
                  ? "需求范围调整，经专题会确认取消本项任务。"
                  : "按日跟踪任务清单，当前整体受控。",
          remark: projectIndex % 5 === 0 ? "管理例会重点跟踪" : "",
          sequence: 1,
          createdBy: "pmo.demo@projects.internal",
        },
        {
          projectId: project.id,
          weekKey: current.weekKey,
          taskDescription: "更新项目风险、问题及纠偏措施台账",
          owner,
          participants: "项目核心组",
          plannedStart: dayAt(current.startDate, 4),
          plannedFinish: dayAt(current.startDate, 4),
          workdays: 1,
          actualFinish: projectIndex % 2 === 0 ? dayAt(current.startDate, 4) : null,
          status: projectIndex % 2 === 0 ? ("completed" as const) : ("in_progress" as const),
          tracking: projectIndex % 2 === 0 ? "本周台账已更新。" : "等待责任人补充恢复日期。",
          remark: "",
          sequence: 2,
          createdBy: "pmo.demo@projects.internal",
        },
        {
          projectId: project.id,
          weekKey: next.weekKey,
          taskDescription:
            projectIndex % 2 === 0
              ? "开展下一阶段用户场景验证"
              : "完成下阶段迭代开发并准备提测",
          owner,
          participants: "业务代表、实施团队",
          plannedStart: dayAt(next.startDate, 0),
          plannedFinish: dayAt(next.startDate, 4),
          workdays: 5,
          actualFinish: null,
          status: "pending" as const,
          tracking: "已确认参与人员与会议窗口。",
          remark: projectIndex % 4 === 0 ? "与共享测试资源计划联动" : "",
          sequence: 1,
          createdBy: "pmo.demo@projects.internal",
        },
      ];
    });
    for (const rowsChunk of chunks(taskRows, 4)) {
      await db.insert(biweeklyPlanTasks).values(rowsChunk);
    }
  }

  const existingPlanWeeks = await db
    .select({ projectId: biweeklyPlanTasks.projectId, weekKey: biweeklyPlanTasks.weekKey })
    .from(biweeklyPlanTasks);
  const existingPlanWindows = new Set(
    existingPlanWeeks.map((row) => `${row.projectId}:${row.weekKey}`),
  );
  {
    const historicalProjects = projectRows.filter(
      (project) => (project.lifecycleStatus ?? "active") !== "archived",
    );
    const dayAt = (startDate: string, offset: number) => {
      const date = new Date(`${startDate}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + offset);
      return date.toISOString().slice(0, 10);
    };
    const historicalWeeks = [-28, -21, -14, -7].map(
      (dayOffset) =>
        buildRollingWeeks(new Date(Date.now() + dayOffset * 86_400_000))[0],
    );
    const historicalRows = historicalProjects.flatMap((project, projectIndex) =>
      historicalWeeks.flatMap((week, weekIndex) => {
        if (existingPlanWindows.has(`${project.id}:${week.weekKey}`)) return [];
        const status = (["completed", "completed", "delayed", "cancelled"] as const)[
          (projectIndex + weekIndex) % 4
        ];
        return [{
          projectId: project.id,
          weekKey: week.weekKey,
          taskDescription: [
            "完成阶段成果评审与意见闭环",
            "推进核心模块开发及接口联调",
            "开展业务数据核验并关闭遗留问题",
            "组织用户验证并形成复盘清单",
          ][weekIndex],
          owner: project.ownerName,
          participants:
            projectIndex % 2 === 0 ? "业务负责人、产品经理" : "架构师、测试经理",
          plannedStart: week.startDate,
          plannedFinish: dayAt(week.startDate, 4),
          workdays: 5,
          actualFinish:
            status === "completed" ? dayAt(week.startDate, projectIndex % 3 + 2) : null,
          status,
          tracking:
            status === "completed"
              ? "任务已按计划完成，成果已归档。"
              : status === "delayed"
                ? "受跨部门依赖影响未按期完成，已纳入后续周期持续跟踪。"
                : "因范围调整取消，已完成变更确认。",
          remark: weekIndex === 2 && projectIndex % 3 === 0 ? "历史延期样例" : "",
          sequence: 1,
          createdBy: "pmo.demo@projects.internal",
        }];
      }),
    );
    for (const rowsChunk of chunks(historicalRows, 4)) {
      await db.insert(biweeklyPlanTasks).values(rowsChunk);
    }
  }

  const [{ value: reportCount }] = await db
    .select({ value: count() })
    .from(weeklyReports);
  if (reportCount === 0) {
    const reportRows = seedProjects.flatMap((seed) => {
      const project = projectById.get(seed.id);
      if (!project) return [];
      const active = (project.lifecycleStatus ?? "active") === "active";
      const weekOffsets =
        seed.id === "P08"
          ? [-28]
          : seed.id === "P15"
            ? [-21, 0]
            : active
              ? [-14, -7, 0]
              : [-28, -21, -14, -7];
      const currentProgress = Math.min(
        100,
        Number(
          (
            (seed.completeThrough / 12) * 100 +
            seed.partialCompletion / 12
          ).toFixed(1),
        ),
      );
      return weekOffsets.map((offset, index) => {
        const isDraft = seed.id === "P15" && offset === 0;
        const currentMilestone = milestoneByProjectAndSequence.get(
          `${seed.id}:${seed.completeThrough + 1}`,
        );
        const systemProgress = Math.max(
          0,
          Number(
            (
              currentProgress -
              (weekOffsets.length - index - 1) * (seed.id === "P07" ? 6 : 4)
            ).toFixed(1),
          ),
        );
        const declaredGap =
          seed.id === "P05" ? 12 : seed.id === "P03" ? 6 : seed.id === "P07" ? 2 : 0;
        return {
          projectId: seed.id,
          weekKey: demoWeekKeyAt(offset),
          systemProgress,
          declaredProgress: Math.min(100, systemProgress + declaredGap),
          variance: declaredGap,
          reason:
            declaredGap > 10
              ? "经理申报值包含已完成但尚待验收的交付物，已补充口径说明。"
              : declaredGap > 5
                ? "部分成果已提交业务确认，申报进度略高于系统权重计算值。"
                : seed.id === "P07"
                  ? "关键分析模型提前交付，本周进展好于计划。"
                  : "本周按批准基线推进，节点状态已完成核验。",
          forecastFinish: demoDateAt(
            seed.startOffset +
              12 * DEMO_MILESTONE_CADENCE_DAYS +
              seed.forecastDelay,
          ),
          primaryMilestoneId:
            !isDraft &&
            seed.id !== "P16" &&
            currentMilestone?.executionStatus !== "not_started"
              ? currentMilestone?.id ?? null
              : null,
          milestoneUpdatesJson: JSON.stringify(
            offset === 0 && currentMilestone
              ? [
                  {
                    id: currentMilestone.id,
                    executionStatus: currentMilestone.executionStatus,
                    completion: currentMilestone.completion,
                    actualStart: currentMilestone.actualStart,
                    forecastFinish: currentMilestone.forecastFinish,
                    actualFinish: currentMilestone.actualFinish,
                    pausedReason: currentMilestone.pausedReason,
                    reason: currentMilestone.reason,
                    deviationDays: currentMilestone.deviationDays,
                  },
                ]
              : [],
          ),
          draftJson: JSON.stringify(
            isDraft
              ? {
                  submitMode: "draft",
                  weekKey: demoWeekKeyAt(offset),
                  declaredProgress: systemProgress,
                  reason: "演示中的未提交草稿，等待项目经理补充。",
                }
              : {},
          ),
          status: isDraft ? ("draft" as const) : ("submitted" as const),
          submittedBy: `${seed.id.toLowerCase()}@projects.internal`,
          submittedAt: `${demoDateAt(offset + 4)}T09:30:00.000Z`,
        };
      });
    });
    // Keep below D1's local/production bind-variable ceiling. Each report has
    // enough columns that eight rows can exceed the SQLite parameter limit.
    for (const rowsChunk of chunks(reportRows, 4)) {
      await db.insert(weeklyReports).values(rowsChunk).onConflictDoNothing();
    }
  }
  const reportsWithoutPrimary = await db
    .select()
    .from(weeklyReports)
    .where(isNull(weeklyReports.primaryMilestoneId));
  for (const report of reportsWithoutPrimary) {
    if (report.status === "draft") continue;
    const projectSeed = seedProjects.find((seed) => seed.id === report.projectId);
    if (!projectSeed) continue;
    const currentMilestone = milestoneByProjectAndSequence.get(
      `${report.projectId}:${projectSeed.completeThrough + 1}`,
    );
    if (
      !currentMilestone ||
      report.projectId === "P16" ||
      currentMilestone.executionStatus === "not_started" ||
      currentMilestone.executionStatus === "completed"
    ) {
      continue;
    }
    await db
      .update(weeklyReports)
      .set({ primaryMilestoneId: currentMilestone.id })
      .where(eq(weeklyReports.id, report.id));
  }

  const [{ value: riskCount }] = await db
    .select({ value: count() })
    .from(risks);
  if (riskCount === 0) {
    const riskSeeds = [
      { projectId: "P02", title: "核心供应商接口交付延迟", category: "供应商", level: "high", status: "open", description: "核心接口规范多次调整，可能影响开发完成与联调窗口。", mitigation: "安排驻场联合攻关，每日跟踪接口完成清单。", owner: "李程", dueDate: demoDateAt(12) },
      { projectId: "P03", title: "历史人事数据质量波动", category: "数据", level: "high", status: "monitoring", description: "历史组织和人员主数据存在重复及缺失，若未及时清洗将影响迁移与验收。", mitigation: "建立清洗规则并分批完成业务复核。", owner: "陈路", dueDate: demoDateAt(25) },
      { projectId: "P05", title: "月结窗口与上线切换冲突", category: "进度", level: "high", status: "open", description: "财务月结冻结窗口压缩生产切换时间。", mitigation: "拆分切换批次并准备双轨回退方案。", owner: "赵敏", dueDate: demoDateAt(-5) },
      { projectId: "P13", title: "供应商账号同步范围争议", category: "范围", level: "low", status: "closed", description: "外部账号同步边界曾存在分歧。", mitigation: "已通过专题会确认首期范围并完成签字。", owner: "徐宁", dueDate: demoDateAt(-12) },
      { projectId: "P14", title: "集成测试团队并行项目超配", category: "资源", level: "medium", status: "open", description: "共享测试团队在同一窗口承担多个项目任务。", mitigation: "调整测试批次并补充供应商测试人员。", owner: "叶川", dueDate: demoDateAt(18) },
      { projectId: "P16", title: "存量权限回收确认周期偏长", category: "合规", level: "medium", status: "monitoring", description: "部分组织尚未完成高权限账号复核。", mitigation: "按组织发布待确认清单并升级超期事项。", owner: "唐宇", dueDate: demoDateAt(20) },
    ] as const;
    const riskIds = new Map<string, number>();
    for (const risk of riskSeeds) {
      const inserted = await db
        .insert(risks)
        .values({
          ...risk,
          createdBy: "pmo.demo@projects.internal",
        })
        .returning({ id: risks.id });
      riskIds.set(risk.projectId, inserted[0].id);
    }

    const actionSeeds = [
      { projectId: "P02", sequence: 6, riskId: riskIds.get("P02") ?? null, name: "接口交付每日清零", owner: "李程", recoveryDate: demoDateAt(10), detail: "供应商驻场、接口分级、每日17点核验未完成项。", status: "in_progress", progress: 55 },
      { projectId: "P03", sequence: 6, riskId: riskIds.get("P03") ?? null, name: "历史数据专项清洗", owner: "陈路", recoveryDate: demoDateAt(14), detail: "完成重复数据合并、缺失字段补录和抽样复核。", status: "pending", progress: 20 },
      { projectId: "P05", sequence: 6, riskId: riskIds.get("P05") ?? null, name: "切换窗口重排与回退演练", owner: "赵敏", recoveryDate: demoDateAt(-3), detail: "原定恢复日期已逾期，需升级协调财务与运维窗口。", status: "overdue", progress: 65 },
      { projectId: "P13", sequence: 4, riskId: riskIds.get("P13") ?? null, name: "账号范围确认", owner: "徐宁", recoveryDate: demoDateAt(-8), detail: "专题会已完成范围确认并归档会议纪要。", status: "completed", progress: 100 },
      { projectId: "P14", sequence: 7, riskId: riskIds.get("P14") ?? null, name: "补充专项测试人力", owner: "叶川", recoveryDate: demoDateAt(-1), detail: "临时测试资源尚未全部到位，当前措施已逾期。", status: "overdue", progress: 40 },
      { projectId: "P16", sequence: 8, riskId: riskIds.get("P16") ?? null, name: "权限确认升级催办", owner: "唐宇", recoveryDate: demoDateAt(15), detail: "按组织每周通报确认率，超期事项升级至分管负责人。", status: "in_progress", progress: 60 },
    ] as const;
    for (const action of actionSeeds) {
      await db.insert(correctiveActions).values({
        projectId: action.projectId,
        milestoneId:
          milestoneByProjectAndSequence.get(
            `${action.projectId}:${action.sequence}`,
          )?.id ?? null,
        riskId: action.riskId,
        name: action.name,
        owner: action.owner,
        recoveryDate: action.recoveryDate,
        detail: action.detail,
        status: action.status,
        progress: action.progress,
        createdBy: "pmo.demo@projects.internal",
      });
    }
  }

  const [{ value: changeCount }] = await db
    .select({ value: count() })
    .from(baselineChanges);
  if (changeCount === 0) {
    const pending = await db
      .insert(baselineChanges)
      .values({
        projectId: "P02",
        versionFrom: 2,
        versionTo: 3,
        reason: "核心供应商接口规范调整，经专题会确认增加开发与联调周期。",
        changesJson: JSON.stringify([
          { milestone: "开发完成", from: demoDateAt(-22), to: demoDateAt(-8), days: 14 },
          { milestone: "联调测试", from: demoDateAt(14), to: demoDateAt(24), days: 10 },
        ]),
        impact: "预计影响联调窗口，但通过分批上线确保年度目标不变。",
        requestedBy: "p02@projects.internal",
      })
      .returning({ id: baselineChanges.id });
    void pending;
    const approved = await db
      .insert(baselineChanges)
      .values({
        projectId: "P09",
        versionFrom: 1,
        versionTo: 2,
        reason: "新增数据标准映射范围，经PMO批准调整阶段计划。",
        changesJson: JSON.stringify([
          { milestone: "开发完成", from: demoDateAt(13), to: demoDateAt(15), days: 2 },
        ]),
        impact: "总体上线目标不变，开发完成节点顺延2天。",
        status: "approved",
        requestedBy: "p09@projects.internal",
        approvedBy: "pmo.demo@projects.internal",
        approvedAt: `${demoDateAt(-9)}T09:00:00.000Z`,
      })
      .returning({ id: baselineChanges.id });
    await db
      .update(baselineVersions)
      .set({ kind: "approved", changeId: approved[0].id })
      .where(
        and(
          eq(baselineVersions.projectId, "P09"),
          eq(baselineVersions.version, 2),
        ),
      );
    await db.insert(baselineChanges).values({
      projectId: "P13",
      versionFrom: 1,
      versionTo: 2,
      reason: "申请扩大外部供应商账号同步范围。",
      changesJson: JSON.stringify([
        { milestone: "用户验收", from: demoDateAt(100), to: demoDateAt(114), days: 14 },
      ]),
      impact: "会增加首期范围和安全评审工作量。",
      status: "rejected",
      requestedBy: "p13@projects.internal",
      rejectedBy: "pmo.demo@projects.internal",
      rejectedAt: `${demoDateAt(-6)}T10:00:00.000Z`,
      rejectionReason: "超出首期批准范围，建议纳入后续迭代。",
    });
  }

  const [{ value: notificationCount }] = await db
    .select({ value: count() })
    .from(notifications);
  if (notificationCount === 0) {
    await db.insert(notifications).values([
      {
        recipientEmail: "local-admin@example.com",
        projectId: "P05",
        type: "red_escalation",
        severity: "critical",
        title: "财务共享中心二期触发红灯升级",
        message: "关键节点延期且高风险纠偏措施逾期，请管理层协调切换窗口。",
        actionView: "project",
        referenceKey: "demo-red-P05",
        createdBy: "system",
      },
      {
        recipientEmail: "local-admin@example.com",
        projectId: "P08",
        type: "report_reminder",
        severity: "warning",
        title: "审计数字化平台连续缺报",
        message: "项目连续多个周期未提交正式周报，请完成催报和责任确认。",
        actionView: "report",
        referenceKey: "demo-report-P08",
        createdBy: "system",
      },
      {
        recipientEmail: "local-admin@example.com",
        projectId: "P09",
        type: "baseline_decision",
        severity: "info",
        title: "主数据治理一期基线变更已批准",
        message: "开发完成节点顺延2天，总体上线目标保持不变。",
        actionView: "project",
        referenceKey: "demo-baseline-P09",
        status: "read",
        createdBy: "pmo.demo@projects.internal",
        readAt: `${demoDateAt(-8)}T11:00:00.000Z`,
      },
      {
        recipientEmail: "local-admin@example.com",
        projectId: "P14",
        type: "system",
        severity: "warning",
        title: "共享测试资源出现超配",
        message: "集成测试团队在未来窗口超过可用容量，请调整资源分配。",
        actionView: "portfolio",
        referenceKey: "demo-resource-P14",
        createdBy: "system",
      },
    ]);
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
    await ensureDemoResourcePlanning(db);
    await ensureDemoScenarioData(db);
    return;
  }
  if (!demoSeedEnabled()) return;

  const projectRows = seedProjects.map((project) => {
    const completed = project.lifecycleStatus === "completed";
    const archived = project.lifecycleStatus === "archived";
    const progress = Math.min(
      100,
      Number(
        (
          (project.completeThrough / 12) * 100 +
          project.partialCompletion / 12
        ).toFixed(1),
      ),
    );
    return {
      id: project.id,
      code: project.id,
      name: project.name,
      ownerEmail: `${project.id.toLowerCase()}@projects.internal`,
      ownerName: project.owner,
      org: project.org,
      type: project.type,
      score: completed || archived ? 100 : 90,
      status: "green" as const,
      planProgress: completed || archived ? 100 : progress,
      actualProgress: completed || archived ? 100 : progress,
      declaredProgress: completed || archived ? 100 : progress,
      riskLevel: project.riskLevel,
      lifecycleStatus: project.lifecycleStatus ?? ("active" as const),
      lifecycleReason: completed
        ? "全部里程碑已完成，已通过结项检查。"
        : archived
          ? "历史项目已完成资料归档，仅保留只读记录。"
          : "",
      completedAt: completed
        ? `${demoDateAt(project.id === "P12" ? -2 : -55)}T09:00:00.000Z`
        : null,
      archivedAt: archived ? `${demoDateAt(-90)}T09:00:00.000Z` : null,
      currentBaselineVersion: project.currentBaselineVersion ?? 1,
    };
  });
  for (const rows of chunks(projectRows, 4)) {
    await db.insert(projects).values(rows).onConflictDoNothing();
  }
  await ensureDemoProjectManagers(db);

  const templateByName = new Map(
    templateRows.map((template) => [template.name, template.id]),
  );
  const milestoneRows = seedProjects.flatMap((project) => {
    const standardRows = standardMilestoneTemplates.map(
      ([, name, defaultWeight, critical], index) => {
        const sequence = index + 1;
        const applicable = !(project.naSequences ?? []).includes(sequence);
        const carryover =
          project.id === "P05" && sequence === project.completeThrough;
        const completed =
          applicable && sequence <= project.completeThrough && !carryover;
        const current =
          applicable && sequence === project.completeThrough + 1;
        const plannedFinishOffset =
          project.startOffset + sequence * DEMO_MILESTONE_CADENCE_DAYS;
        const deviationDays = completed
          ? project.actualDelay
          : current || sequence > project.completeThrough
            ? project.forecastDelay
            : 0;
        const yellowDays = critical ? 1 : 4;
        const redDays = critical ? 4 : 8;
        const status = !applicable
          ? ("na" as const)
          : deviationDays >= redDays
            ? ("red" as const)
            : deviationDays >= yellowDays
              ? ("yellow" as const)
              : ("green" as const);
        return {
          projectId: project.id,
          templateId: templateByName.get(name) ?? null,
          name,
          sequence,
          weight:
            project.id === "P06" && sequence === 12
              ? 0
              : defaultWeight,
          critical,
          applicable,
          custom: false,
          plannedStart: demoDateAt(
            project.startOffset + index * DEMO_MILESTONE_CADENCE_DAYS,
          ),
          plannedFinish: demoDateAt(plannedFinishOffset),
          forecastFinish:
            applicable && !completed
              ? demoDateAt(plannedFinishOffset + project.forecastDelay)
              : null,
          actualFinish:
            completed
              ? demoDateAt(plannedFinishOffset + project.actualDelay)
              : null,
          executionStatus: completed
            ? ("completed" as const)
            : current
              ? project.id === "P04"
                ? ("not_started" as const)
                : project.id === "P03"
                  ? ("paused" as const)
                  : ("in_progress" as const)
              : ("not_started" as const),
          actualStart:
            completed || (current && project.id !== "P04")
              ? demoDateAt(
                  project.startOffset +
                    index * DEMO_MILESTONE_CADENCE_DAYS +
                    1,
                )
              : null,
          pausedReason:
            current && project.id === "P03"
              ? "核心业务代表档期冲突，需求确认会议暂缓。"
              : "",
          completion:
            completed
              ? 100
              : current && project.id !== "P04"
                ? project.partialCompletion
                : 0,
          status,
          deviationDays,
          reason:
            status === "red"
              ? project.id === "P05"
                ? "切换窗口冲突导致关键节点延期，已升级管理层协调。"
                : "接口、资源或交付约束影响节点，已纳入重点纠偏。"
              : status === "yellow"
                ? "预测完成日期晚于批准基线，正在提前干预。"
                : completed && project.actualDelay < 0
                  ? "节点提前完成并已通过成果确认。"
                  : "",
        };
      },
    );
    if (project.id !== "P06") return standardRows;
    return [
      ...standardRows,
      {
        projectId: project.id,
        templateId: null,
        name: "数据分级分类验收",
        sequence: 13,
        weight: 5,
        critical: false,
        applicable: true,
        custom: true,
        plannedStart: demoDateAt(22),
        plannedFinish: demoDateAt(38),
        forecastFinish: demoDateAt(43),
        actualFinish: null,
        executionStatus: "paused" as const,
        actualStart: demoDateAt(24),
        pausedReason: "等待数据治理委员会确认分类边界。",
        completion: 20,
        status: "yellow" as const,
        deviationDays: 5,
        reason: "自定义治理节点，部分业务域分类确认进度偏慢。",
      },
    ];
  });
  for (const rows of chunks(milestoneRows, 4)) {
    await db.insert(milestones).values(rows).onConflictDoNothing();
  }

  await ensureBaselineVersionRows(db);
  await ensureDemoResourcePlanning(db);
  await ensureDemoScenarioData(db);
  await ensureBaselineVersionRows(db);
}
