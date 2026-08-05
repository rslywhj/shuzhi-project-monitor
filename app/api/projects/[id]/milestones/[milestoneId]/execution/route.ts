import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  milestones,
  projects,
  weeklyReports,
} from "@/db/schema";
import { ApiRequestError, apiError, safeNumber } from "@/lib/api-utils";
import { shanghaiDateIso } from "@/lib/date-time";
import {
  normalizeMilestoneExecution,
  type MilestoneExecutionPayload,
} from "@/lib/milestone-execution";
import {
  lifecycleLockedResponse,
  projectLifecycleLocked,
} from "@/lib/project-lifecycle";
import { calculateProjectStage } from "@/lib/project-stage";
import { recalculateProjectHealth } from "@/lib/health";
import { ensureSeeded } from "@/lib/seed";
import {
  canWriteProject,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; milestoneId: string }> },
) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    await ensureSeeded();
    const { id, milestoneId: milestoneIdParam } = await context.params;
    const milestoneId = safeNumber(
      milestoneIdParam,
      "节点编号",
      1,
      1_000_000,
    );
    if (!Number.isInteger(milestoneId)) {
      throw new ApiRequestError("节点编号必须是整数。");
    }
    const db = getDb();
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);
    if (!project) {
      return Response.json({ error: "未找到指定项目。" }, { status: 404 });
    }
    if (!canWriteProject(identity, project.ownerEmail)) return forbidden();
    if (projectLifecycleLocked(project)) return lifecycleLockedResponse(project);
    const milestoneRows = await db
      .select()
      .from(milestones)
      .where(eq(milestones.projectId, id));
    const current = milestoneRows.find((row) => row.id === milestoneId);
    if (!current) {
      return Response.json({ error: "未找到指定项目节点。" }, { status: 404 });
    }
    const payload = (await request.json()) as MilestoneExecutionPayload;
    const update = normalizeMilestoneExecution(current, payload, {
      strict: true,
    });
    const changedFields = {
      before: {
        executionStatus: current.executionStatus,
        completion: current.completion,
        actualStart: current.actualStart,
        forecastFinish: current.forecastFinish,
        actualFinish: current.actualFinish,
        pausedReason: current.pausedReason,
      },
      after: update,
    };
    await db
      .update(milestones)
      .set({
        executionStatus: update.executionStatus,
        completion: update.completion,
        actualStart: update.actualStart,
        forecastFinish: update.forecastFinish,
        actualFinish: update.actualFinish,
        pausedReason: update.pausedReason,
        reason: update.reason,
        deviationDays: update.deviationDays,
        executionUpdatedAt: new Date().toISOString(),
        executionUpdatedBy: identity.email,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(milestones.id, milestoneId));
    await db.insert(auditLogs).values({
      actorEmail: identity.email,
      action: "project_milestone.execution_update",
      entityType: "milestone",
      entityId: String(milestoneId),
      detailJson: JSON.stringify({ projectId: id, ...changedFields }),
    });
    const health = await recalculateProjectHealth(id);
    const [latestReport] = await db
      .select({ primaryMilestoneId: weeklyReports.primaryMilestoneId })
      .from(weeklyReports)
      .where(
        sql`${weeklyReports.projectId} = ${id} AND ${weeklyReports.status} <> 'draft'`,
      )
      .orderBy(desc(weeklyReports.weekKey))
      .limit(1);
    const refreshedMilestones = milestoneRows.map((row) =>
      row.id === milestoneId ? { ...row, ...update } : row,
    );
    const stageSummary = calculateProjectStage({
      projectId: id,
      milestones: refreshedMilestones,
      asOfDate: shanghaiDateIso(),
      confirmedPrimaryMilestoneId: latestReport?.primaryMilestoneId,
      lifecycleStatus: project.lifecycleStatus,
    });
    return Response.json({ milestone: { ...current, ...update }, health, stageSummary });
  } catch (error) {
    return apiError(error);
  }
}
