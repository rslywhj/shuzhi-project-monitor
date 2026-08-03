import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, biweeklyPlanTasks, projects } from "@/db/schema";
import {
  ApiRequestError,
  apiError,
  requiredIsoDate,
  requiredString,
  safeNumber,
} from "@/lib/api-utils";
import { buildRollingWeeks, validateTaskDates } from "@/lib/biweekly-plan";
import {
  lifecycleLockedResponse,
  projectLifecycleLocked,
} from "@/lib/project-lifecycle";
import { ensureSeeded } from "@/lib/seed";
import {
  canWriteProject,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const statuses = new Set([
  "pending",
  "in_progress",
  "completed",
  "delayed",
  "cancelled",
]);

async function loadTask(id: number) {
  const [row] = await getDb()
    .select({ task: biweeklyPlanTasks, project: projects })
    .from(biweeklyPlanTasks)
    .innerJoin(projects, eq(projects.id, biweeklyPlanTasks.projectId))
    .where(eq(biweeklyPlanTasks.id, id))
    .limit(1);
  return row;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    await ensureSeeded();
    const id = Number((await context.params).id);
    if (!Number.isInteger(id)) throw new ApiRequestError("任务编号无效。");
    const row = await loadTask(id);
    if (!row) return Response.json({ error: "未找到双周计划任务。" }, { status: 404 });
    if (!canWriteProject(identity, row.project.ownerEmail)) return forbidden();
    if (projectLifecycleLocked(row.project)) return lifecycleLockedResponse(row.project);
    const payload = (await request.json()) as Record<string, unknown>;
    const weekKey = requiredString(payload.weekKey ?? row.task.weekKey, "计划周期");
    const plannedStart = requiredIsoDate(
      payload.plannedStart ?? row.task.plannedStart,
      "计划开始时间",
    );
    const plannedFinish = requiredIsoDate(
      payload.plannedFinish ?? row.task.plannedFinish,
      "计划结束时间",
    );
    try {
      validateTaskDates(weekKey, plannedStart, plannedFinish, buildRollingWeeks());
    } catch (error) {
      throw new ApiRequestError(error instanceof Error ? error.message : "计划日期无效。");
    }
    const status = String(payload.status ?? row.task.status);
    if (!statuses.has(status)) throw new ApiRequestError("完成状况无效。");
    const actualFinish = payload.actualFinish === ""
      ? null
      : payload.actualFinish
        ? requiredIsoDate(payload.actualFinish, "实际结束时间")
        : row.task.actualFinish;
    if (status === "completed" && !actualFinish) {
      throw new ApiRequestError("已完成任务必须填写实际结束时间。");
    }
    const [task] = await getDb()
      .update(biweeklyPlanTasks)
      .set({
        weekKey,
        taskDescription: requiredString(
          payload.taskDescription ?? row.task.taskDescription,
          "任务描述",
        ),
        owner: requiredString(payload.owner ?? row.task.owner, "负责人"),
        participants: String(payload.participants ?? row.task.participants).trim(),
        plannedStart,
        plannedFinish,
        workdays: safeNumber(
          payload.workdays ?? row.task.workdays,
          "周期（工作日）",
          0.1,
          31,
        ),
        actualFinish,
        status: status as "pending" | "in_progress" | "completed" | "delayed" | "cancelled",
        tracking: String(payload.tracking ?? row.task.tracking).trim(),
        remark: String(payload.remark ?? row.task.remark).trim(),
        sequence: Math.round(
          safeNumber(payload.sequence ?? row.task.sequence, "序号", 1, 999),
        ),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(biweeklyPlanTasks.id, id))
      .returning();
    await getDb().insert(auditLogs).values({
      actorEmail: identity.email,
      action: "biweekly_plan_task.update",
      entityType: "biweekly_plan_task",
      entityId: String(id),
      detailJson: JSON.stringify({ projectId: task.projectId, weekKey }),
    });
    return Response.json({ task });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    await ensureSeeded();
    const id = Number((await context.params).id);
    if (!Number.isInteger(id)) throw new ApiRequestError("任务编号无效。");
    const row = await loadTask(id);
    if (!row) return Response.json({ error: "未找到双周计划任务。" }, { status: 404 });
    if (!canWriteProject(identity, row.project.ownerEmail)) return forbidden();
    if (projectLifecycleLocked(row.project)) return lifecycleLockedResponse(row.project);
    await getDb().delete(biweeklyPlanTasks).where(eq(biweeklyPlanTasks.id, id));
    await getDb().insert(auditLogs).values({
      actorEmail: identity.email,
      action: "biweekly_plan_task.delete",
      entityType: "biweekly_plan_task",
      entityId: String(id),
      detailJson: JSON.stringify({
        projectId: row.task.projectId,
        weekKey: row.task.weekKey,
        task: row.task.taskDescription,
      }),
    });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
