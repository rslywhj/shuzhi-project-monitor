import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  correctiveActions,
  milestones,
  projects,
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
import {
  canWriteProject,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type WeeklyReportPayload = {
  weekKey?: string;
  systemProgress?: number;
  declaredProgress?: number;
  reason?: string;
  forecastFinish?: string;
  milestone?: {
    sequence?: number;
    completion?: number;
    forecastFinish?: string;
  };
  action?: {
    name?: string;
    owner?: string;
    recoveryDate?: string;
    detail?: string;
  };
};

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

    const payload = (await request.json()) as WeeklyReportPayload;
    const weekKey = requiredWeekKey(payload.weekKey, "填报周期");
    const [lockedSnapshot] = await db
      .select({ id: snapshots.id })
      .from(snapshots)
      .where(
        sql`${snapshots.weekKey} = ${weekKey} AND ${snapshots.status} = 'locked'`,
      )
      .limit(1);
    if (lockedSnapshot) {
      return Response.json(
        { error: "该周期快照已经锁定，新的进度更新请提交到下一周期。" },
        { status: 409 },
      );
    }
    const systemProgress = safeNumber(payload.systemProgress, "系统计算进度");
    const declaredProgress = safeNumber(payload.declaredProgress, "申报进度");
    const variance = Number((declaredProgress - systemProgress).toFixed(2));
    const reason = requiredString(payload.reason, "偏差原因");
    if (Math.abs(variance) > 10 && reason.length < 10) {
      return Response.json(
        { error: "申报进度与计算值相差超过10个百分点，请填写完整差异说明。" },
        { status: 400 },
      );
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
          status: "submitted",
          submittedBy: identity.email,
          submittedAt: sql`CURRENT_TIMESTAMP`,
        },
      })
      .returning();

    await db
      .update(projects)
      .set({
        actualProgress: systemProgress,
        declaredProgress,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(projects.id, id));

    let milestoneId: number | null = null;
    if (payload.milestone?.sequence) {
      const completion = safeNumber(payload.milestone.completion, "节点完成度");
      const [updatedMilestone] = await db
        .update(milestones)
        .set({
          completion,
          forecastFinish: payload.milestone.forecastFinish
            ? requiredIsoDate(payload.milestone.forecastFinish, "节点预测完成日")
            : null,
          reason,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(
          sql`${milestones.projectId} = ${id} AND ${milestones.sequence} = ${payload.milestone.sequence}`,
        )
        .returning();
      milestoneId = updatedMilestone?.id ?? null;
    }

    if (payload.action) {
      await db.insert(correctiveActions).values({
        projectId: id,
        milestoneId,
        name: requiredString(payload.action.name, "措施名称"),
        owner: requiredString(payload.action.owner, "措施责任人"),
        recoveryDate: requiredIsoDate(payload.action.recoveryDate, "预计恢复日期"),
        detail: requiredString(payload.action.detail, "具体行动"),
        createdBy: identity.email,
      });
    }

    await db.insert(auditLogs).values({
      actorEmail: identity.email,
      action: "weekly_report.submit",
      entityType: "project",
      entityId: id,
      detailJson: JSON.stringify({ reportId: report.id, weekKey, variance }),
    });

    return Response.json({ report }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
