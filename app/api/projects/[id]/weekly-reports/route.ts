import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  correctiveActions,
  milestones,
  projects,
  ruleConfigs,
  snapshots,
  weeklyReports,
} from "@/db/schema";
import {
  ApiRequestError,
  apiError,
  requiredIsoDate,
  requiredString,
  requiredWeekKey,
  safeNumber,
} from "@/lib/api-utils";
import { shanghaiDateIso } from "@/lib/date-time";
import { ensureSeeded } from "@/lib/seed";
import { recalculateProjectHealth } from "@/lib/health";
import {
  normalizeMilestoneExecution,
  type MilestoneExecutionPayload,
} from "@/lib/milestone-execution";
import { calculateProjectStage } from "@/lib/project-stage";
import {
  lifecycleLockedResponse,
  projectLifecycleLocked,
} from "@/lib/project-lifecycle";
import {
  canWriteProject,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type WeeklyReportPayload = {
  submitMode?: "draft" | "submitted";
  weekKey?: string;
  systemProgress?: number;
  declaredProgress?: number;
  reason?: string;
  forecastFinish?: string;
  primaryMilestoneId?: number | null;
  milestoneUpdates?: MilestoneExecutionPayload[];
  milestone?: {
    sequence?: number;
    completion?: number;
    forecastFinish?: string;
    actualFinish?: string;
  };
  actions?: Array<{
    milestoneId?: number;
    name?: string;
    owner?: string;
    recoveryDate?: string;
    detail?: string;
  }>;
  action?: {
    name?: string;
    owner?: string;
    recoveryDate?: string;
    detail?: string;
  };
};

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    await ensureSeeded();
    const { id } = await context.params;
    const db = getDb();
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);
    if (!project) {
      return Response.json({ error: "未找到指定项目。" }, { status: 404 });
    }
    const rows = await db
      .select()
      .from(weeklyReports)
      .where(eq(weeklyReports.projectId, id))
      .orderBy(desc(weeklyReports.weekKey))
      .limit(100);
    return Response.json({
      weeklyReports: rows.map((row) => ({
        ...row,
        draft: JSON.parse(row.draftJson) as unknown,
        milestoneUpdates: JSON.parse(row.milestoneUpdatesJson) as unknown,
        draftJson: undefined,
        milestoneUpdatesJson: undefined,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    await ensureSeeded();

    const { id } = await context.params;
    const db = getDb();
    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!project) {
      return Response.json({ error: "未找到指定项目。" }, { status: 404 });
    }
    if (!canWriteProject(identity, project.ownerEmail)) return forbidden();
    if (projectLifecycleLocked(project)) return lifecycleLockedResponse(project);

    const payload = (await request.json()) as WeeklyReportPayload;
    const submitMode =
      payload.submitMode === "draft" ? ("draft" as const) : ("submitted" as const);
    const weekKey = requiredWeekKey(payload.weekKey, "填报周期");
    const [latestSnapshot] = await db
      .select({ id: snapshots.id, status: snapshots.status })
      .from(snapshots)
      .where(eq(snapshots.weekKey, weekKey))
      .orderBy(desc(snapshots.version))
      .limit(1);
    if (latestSnapshot?.status === "locked") {
      return Response.json(
        { error: "该周期快照已经锁定，新的进度更新请提交到下一周期。" },
        { status: 409 },
      );
    }
    const declaredProgress = safeNumber(payload.declaredProgress, "申报进度");
    const reason =
      submitMode === "draft"
        ? payload.reason?.trim() ?? ""
        : requiredString(payload.reason, "偏差原因");
    const milestoneRows = await db
      .select()
      .from(milestones)
      .where(eq(milestones.projectId, id));
    const legacyPayload: MilestoneExecutionPayload[] =
      payload.milestone?.sequence
        ? [
            {
              sequence: payload.milestone.sequence,
              completion: payload.milestone.completion,
              forecastFinish: payload.milestone.forecastFinish,
              actualFinish: payload.milestone.actualFinish,
              reason,
            },
          ]
        : [];
    const requestedUpdates = Array.isArray(payload.milestoneUpdates)
      ? payload.milestoneUpdates
      : legacyPayload;
    if (requestedUpdates.length > 20) {
      return Response.json(
        { error: "单次周报最多更新20个节点。" },
        { status: 400 },
      );
    }
    const normalizedUpdates = requestedUpdates.map((update) => {
      const currentMilestone = milestoneRows.find((row) =>
        update.milestoneId
          ? row.id === Number(update.milestoneId)
          : row.sequence === Number(update.sequence),
      );
      if (!currentMilestone) {
        throw new ApiRequestError("未找到需要更新的项目节点。", 404);
      }
      return normalizeMilestoneExecution(
        currentMilestone,
        { ...update, reason: update.reason ?? reason },
        {
          strict:
            submitMode === "submitted" &&
            Array.isArray(payload.milestoneUpdates),
        },
      );
    });
    if (
      new Set(normalizedUpdates.map((update) => update.id)).size !==
      normalizedUpdates.length
    ) {
      return Response.json(
        { error: "同一节点不能在一份周报中重复更新。" },
        { status: 400 },
      );
    }
    const updateById = new Map(
      normalizedUpdates.map((update) => [update.id, update]),
    );
    const progressRows = milestoneRows.map((row) => {
      const update = updateById.get(row.id);
      return update ? { ...row, ...update } : row;
    });
    const applicableRows = progressRows.filter((row) => row.applicable);
    const applicableWeight = applicableRows.reduce(
      (sum, row) => sum + row.weight,
      0,
    );
    const systemProgress =
      applicableWeight === 0
        ? 0
        : Number(
            (
              applicableRows.reduce(
                (sum, row) => sum + row.weight * row.completion,
                0,
              ) / applicableWeight
            ).toFixed(1),
          );
    const variance = Number((declaredProgress - systemProgress).toFixed(2));
    if (
      submitMode === "submitted" &&
      Math.abs(variance) > 10 &&
      reason.length < 10
    ) {
      return Response.json(
        { error: "申报进度与计算值相差超过10个百分点，请填写完整差异说明。" },
        { status: 400 },
      );
    }

    const requestedActions = Array.isArray(payload.actions)
      ? payload.actions
      : payload.action
        ? [
            {
              ...payload.action,
              milestoneId: normalizedUpdates[0]?.id,
            },
          ]
        : [];
    const actionValues: Array<typeof correctiveActions.$inferInsert> =
      submitMode === "submitted"
        ? requestedActions.map((action) => ({
            projectId: id,
            milestoneId: action.milestoneId ?? normalizedUpdates[0]?.id ?? null,
            name: requiredString(action.name, "措施名称"),
            owner: requiredString(action.owner, "措施责任人"),
            recoveryDate: requiredIsoDate(action.recoveryDate, "预计恢复日期"),
            detail: requiredString(action.detail, "具体行动"),
            createdBy: identity.email,
            updatedAt: new Date().toISOString(),
          }))
        : [];
    const [activeRule] = await db
      .select()
      .from(ruleConfigs)
      .where(eq(ruleConfigs.active, true))
      .orderBy(desc(ruleConfigs.version))
      .limit(1);
    for (const update of normalizedUpdates) {
      const currentMilestone = milestoneRows.find((row) => row.id === update.id)!;
      const yellowDays = currentMilestone.critical
        ? (activeRule?.criticalYellowDays ?? 1)
        : (activeRule?.normalYellowDays ?? 4);
      const overdue =
        update.completion < 100 && currentMilestone.plannedFinish < shanghaiDateIso();
      if (
        submitMode === "submitted" &&
        (overdue || update.deviationDays >= yellowDays) &&
        !actionValues.some((action) => action.milestoneId === update.id)
      ) {
        return Response.json(
          {
            error: `${currentMilestone.name}已触发红黄预警，必须同步填写纠偏措施、责任人和预计恢复日期。`,
          },
          { status: 400 },
        );
      }
    }
    const primaryMilestoneId = payload.primaryMilestoneId
      ? safeNumber(payload.primaryMilestoneId, "当前主节点编号", 1, 1_000_000)
      : normalizedUpdates.length === 1 &&
          (normalizedUpdates[0].executionStatus === "in_progress" ||
            normalizedUpdates[0].executionStatus === "paused")
          ? normalizedUpdates[0].id
          : null;
    const activeMilestones = progressRows.filter(
      (row) =>
        row.applicable &&
        row.completion < 100 &&
        (row.executionStatus === "in_progress" ||
          row.executionStatus === "paused"),
    );
    if (
      submitMode === "submitted" &&
      activeMilestones.length > 0 &&
      !primaryMilestoneId
    ) {
      return Response.json(
        { error: "存在进行中或暂停节点，请确认一个当前主节点后再提交。" },
        { status: 400 },
      );
    }
    if (primaryMilestoneId) {
      const primary = progressRows.find((row) => row.id === primaryMilestoneId);
      if (
        !primary ||
        !primary.applicable ||
        primary.completion >= 100 ||
        (primary.executionStatus !== "in_progress" &&
          primary.executionStatus !== "paused")
      ) {
        return Response.json(
          { error: "当前主节点必须是适用且未完成的进行中或暂停节点。" },
          { status: 400 },
        );
      }
    }

    const [report] = await db
      .insert(weeklyReports)
      .values({
        projectId: id,
        weekKey,
        systemProgress,
        declaredProgress,
        variance,
        reason,
        forecastFinish: payload.forecastFinish
          ? requiredIsoDate(payload.forecastFinish, "项目预测完成日")
          : null,
        primaryMilestoneId,
        milestoneUpdatesJson: JSON.stringify(normalizedUpdates),
        draftJson:
          submitMode === "draft" ? JSON.stringify(payload) : "{}",
        status: submitMode,
        submittedBy: identity.email,
      })
      .onConflictDoUpdate({
        target: [weeklyReports.projectId, weeklyReports.weekKey],
        set: {
          systemProgress,
          declaredProgress,
          variance,
          reason,
          forecastFinish: payload.forecastFinish
            ? requiredIsoDate(payload.forecastFinish, "项目预测完成日")
            : null,
          primaryMilestoneId,
          milestoneUpdatesJson: JSON.stringify(normalizedUpdates),
          draftJson:
            submitMode === "draft" ? JSON.stringify(payload) : "{}",
          status: submitMode,
          submittedBy: identity.email,
          submittedAt: sql`CURRENT_TIMESTAMP`,
        },
      })
      .returning();
    if (submitMode === "draft") {
      await db.insert(auditLogs).values({
        actorEmail: identity.email,
        action: "weekly_report.save_draft",
        entityType: "project",
        entityId: id,
        detailJson: JSON.stringify({ reportId: report.id, weekKey }),
      });
      return Response.json({ report }, { status: 201 });
    }
    for (const milestoneUpdate of normalizedUpdates) {
      await db
        .update(milestones)
        .set({
          executionStatus: milestoneUpdate.executionStatus,
          completion: milestoneUpdate.completion,
          actualStart: milestoneUpdate.actualStart,
          forecastFinish: milestoneUpdate.forecastFinish,
          actualFinish: milestoneUpdate.actualFinish,
          pausedReason: milestoneUpdate.pausedReason,
          deviationDays: milestoneUpdate.deviationDays,
          reason: milestoneUpdate.reason || reason,
          executionUpdatedAt: new Date().toISOString(),
          executionUpdatedBy: identity.email,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(milestones.id, milestoneUpdate.id));
    }
    const actions: Array<typeof correctiveActions.$inferSelect> = [];
    for (const actionValue of actionValues) {
      const [action] = await db
        .insert(correctiveActions)
        .values(actionValue)
        .returning();
      actions.push(action);
    }

    await db
      .update(projects)
      .set({
        actualProgress: systemProgress,
        declaredProgress,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(projects.id, id));
    const health = await recalculateProjectHealth(id, weekKey);
    await db.insert(auditLogs).values({
      actorEmail: identity.email,
      action: "weekly_report.submit",
      entityType: "project",
      entityId: id,
      detailJson: JSON.stringify({
        reportId: report.id,
        weekKey,
        variance,
        primaryMilestoneId,
        milestoneUpdates: normalizedUpdates.map((update) => ({
          milestoneId: update.id,
          executionStatus: update.executionStatus,
          completion: update.completion,
        })),
        health,
      }),
    });
    const refreshedMilestones = progressRows.map((row) => {
      const update = updateById.get(row.id);
      return update ? { ...row, ...update } : row;
    });
    const stageSummary = calculateProjectStage({
      projectId: id,
      milestones: refreshedMilestones,
      asOfDate: shanghaiDateIso(),
      confirmedPrimaryMilestoneId: primaryMilestoneId,
      lifecycleStatus: project.lifecycleStatus,
    });

    return Response.json(
      { report, actions, action: actions[0], health, stageSummary },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
