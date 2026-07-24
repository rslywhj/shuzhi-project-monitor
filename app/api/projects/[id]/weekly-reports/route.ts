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
  apiError,
  requiredIsoDate,
  requiredString,
  requiredWeekKey,
  safeNumber,
} from "@/lib/api-utils";
import { ensureSeeded } from "@/lib/seed";
import { recalculateProjectHealth } from "@/lib/health";
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
  milestone?: {
    sequence?: number;
    completion?: number;
    forecastFinish?: string;
    actualFinish?: string;
  };
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
        draftJson: undefined,
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
    let milestoneId: number | null = null;
    let milestoneUpdate:
      | {
          id: number;
          completion: number;
          forecastFinish: string | null;
          actualFinish: string | null;
          deviationDays: number;
        }
      | undefined;
    if (payload.milestone?.sequence) {
      const completion = safeNumber(payload.milestone.completion, "节点完成度");
      const currentMilestone = milestoneRows.find(
        (row) => row.sequence === payload.milestone?.sequence,
      );
      if (!currentMilestone) {
        return Response.json({ error: "未找到需要更新的项目节点。" }, { status: 404 });
      }
      if (!currentMilestone.applicable) {
        return Response.json(
          { error: "不适用节点不能提交进度。" },
          { status: 400 },
        );
      }
      const forecastFinish = payload.milestone.forecastFinish
        ? requiredIsoDate(payload.milestone.forecastFinish, "节点预测完成日")
        : currentMilestone.forecastFinish;
      const actualFinish =
        completion === 100
          ? requiredIsoDate(
              payload.milestone.actualFinish ?? forecastFinish,
              "节点实际完成日",
            )
          : null;
      const effectiveFinish = actualFinish ?? forecastFinish;
      const deviationDays = effectiveFinish
        ? Math.round(
            (Date.parse(`${effectiveFinish}T00:00:00Z`) -
              Date.parse(`${currentMilestone.plannedFinish}T00:00:00Z`)) /
              86_400_000,
          )
        : 0;
      milestoneId = currentMilestone.id;
      milestoneUpdate = {
        id: currentMilestone.id,
        completion,
        forecastFinish,
        actualFinish,
        deviationDays,
      };
    }

    const progressRows = milestoneRows.map((row) =>
      milestoneUpdate?.id === row.id
        ? { ...row, completion: milestoneUpdate.completion }
        : row,
    );
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

    let actionValues:
      | typeof correctiveActions.$inferInsert
      | undefined;
    if (submitMode === "submitted" && payload.action) {
      actionValues = {
        projectId: id,
        milestoneId,
        name: requiredString(payload.action.name, "措施名称"),
        owner: requiredString(payload.action.owner, "措施责任人"),
        recoveryDate: requiredIsoDate(payload.action.recoveryDate, "预计恢复日期"),
        detail: requiredString(payload.action.detail, "具体行动"),
        createdBy: identity.email,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      };
    }
    if (milestoneUpdate) {
      const [activeRule] = await db
        .select()
        .from(ruleConfigs)
        .where(eq(ruleConfigs.active, true))
        .orderBy(desc(ruleConfigs.version))
        .limit(1);
      const currentMilestone = milestoneRows.find(
        (row) => row.id === milestoneUpdate?.id,
      )!;
      const yellowDays = currentMilestone.critical
        ? (activeRule?.criticalYellowDays ?? 1)
        : (activeRule?.normalYellowDays ?? 4);
      const overdue =
        milestoneUpdate.completion < 100 &&
        currentMilestone.plannedFinish <
          new Date().toISOString().slice(0, 10);
      if (
        submitMode === "submitted" &&
        (overdue || milestoneUpdate.deviationDays >= yellowDays) &&
        !actionValues
      ) {
        return Response.json(
          { error: "红黄节点必须同步填写纠偏措施、责任人和预计恢复日期。" },
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
    if (milestoneUpdate) {
      await db
        .update(milestones)
        .set({
          completion: milestoneUpdate.completion,
          forecastFinish: milestoneUpdate.forecastFinish,
          actualFinish: milestoneUpdate.actualFinish,
          deviationDays: milestoneUpdate.deviationDays,
          reason,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(milestones.id, milestoneUpdate.id));
    }
    const [action] = actionValues
      ? await db.insert(correctiveActions).values(actionValues).returning()
      : [undefined];

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
        health,
      }),
    });

    return Response.json({ report, action, health }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
