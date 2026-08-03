import { and, asc, eq, inArray } from "drizzle-orm";
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

async function loadProject(id: string) {
  const [project] = await getDb()
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  return project;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    await ensureSeeded();
    const { id } = await context.params;
    const project = await loadProject(id);
    if (!project) return Response.json({ error: "未找到指定项目。" }, { status: 404 });
    const weeks = buildRollingWeeks();
    const rows = await getDb()
      .select()
      .from(biweeklyPlanTasks)
      .where(
        and(
          eq(biweeklyPlanTasks.projectId, id),
          inArray(
            biweeklyPlanTasks.weekKey,
            weeks.map((week) => week.weekKey),
          ),
        ),
      )
      .orderBy(asc(biweeklyPlanTasks.weekKey), asc(biweeklyPlanTasks.sequence));
    return Response.json({
      project: {
        id: project.id,
        name: project.name,
        owner: project.ownerName,
        lifecycleStatus: project.lifecycleStatus,
      },
      weeks,
      tasks: rows,
      canWrite:
        canWriteProject(identity, project.ownerEmail) &&
        !projectLifecycleLocked(project),
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
    const project = await loadProject(id);
    if (!project) return Response.json({ error: "未找到指定项目。" }, { status: 404 });
    if (!canWriteProject(identity, project.ownerEmail)) return forbidden();
    if (projectLifecycleLocked(project)) return lifecycleLockedResponse(project);

    const payload = (await request.json()) as Record<string, unknown>;
    const weekKey = requiredString(payload.weekKey, "计划周期");
    const plannedStart = requiredIsoDate(payload.plannedStart, "计划开始时间");
    const plannedFinish = requiredIsoDate(payload.plannedFinish, "计划结束时间");
    try {
      validateTaskDates(weekKey, plannedStart, plannedFinish, buildRollingWeeks());
    } catch (error) {
      throw new ApiRequestError(error instanceof Error ? error.message : "计划日期无效。");
    }
    const status = String(payload.status ?? "pending");
    if (!statuses.has(status)) throw new ApiRequestError("完成状况无效。");
    const actualFinish = payload.actualFinish
      ? requiredIsoDate(payload.actualFinish, "实际结束时间")
      : null;
    if (status === "completed" && !actualFinish) {
      throw new ApiRequestError("已完成任务必须填写实际结束时间。");
    }
    const [task] = await getDb()
      .insert(biweeklyPlanTasks)
      .values({
        projectId: id,
        weekKey,
        taskDescription: requiredString(payload.taskDescription, "任务描述"),
        owner: requiredString(payload.owner, "负责人"),
        participants: String(payload.participants ?? "").trim(),
        plannedStart,
        plannedFinish,
        workdays: safeNumber(payload.workdays ?? 1, "周期（工作日）", 0.1, 31),
        actualFinish,
        status: status as "pending" | "in_progress" | "completed" | "delayed" | "cancelled",
        tracking: String(payload.tracking ?? "").trim(),
        remark: String(payload.remark ?? "").trim(),
        sequence: Math.round(safeNumber(payload.sequence ?? 1, "序号", 1, 999)),
        createdBy: identity.email,
        updatedAt: new Date().toISOString(),
      })
      .returning();
    await getDb().insert(auditLogs).values({
      actorEmail: identity.email,
      action: "biweekly_plan_task.create",
      entityType: "biweekly_plan_task",
      entityId: String(task.id),
      detailJson: JSON.stringify({ projectId: id, weekKey, task: task.taskDescription }),
    });
    return Response.json({ task }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
