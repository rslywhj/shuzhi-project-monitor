import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, correctiveActions, projects } from "@/db/schema";
import {
  ApiRequestError,
  apiError,
  requiredIsoDate,
  requiredString,
  safeNumber,
} from "@/lib/api-utils";
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
import { recalculateProjectHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

const statuses = new Set(["pending", "in_progress", "completed", "overdue"]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    const { id } = await context.params;
    const actionId = Number(id);
    if (!Number.isInteger(actionId) || actionId < 1) {
      throw new ApiRequestError("措施编号无效。");
    }
    const db = getDb();
    const [existing] = await db
      .select()
      .from(correctiveActions)
      .where(eq(correctiveActions.id, actionId))
      .limit(1);
    if (!existing) {
      return Response.json({ error: "未找到指定纠偏措施。" }, { status: 404 });
    }
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, existing.projectId))
      .limit(1);
    if (!project || !canWriteProject(identity, project.ownerEmail)) return forbidden();
    if (projectLifecycleLocked(project)) return lifecycleLockedResponse(project);

    const payload = (await request.json()) as {
      name?: string;
      owner?: string;
      recoveryDate?: string;
      detail?: string;
      status?: "pending" | "in_progress" | "completed" | "overdue";
      progress?: number;
    };
    if (payload.status && !statuses.has(payload.status)) {
      throw new ApiRequestError("措施状态无效。");
    }
    const progress =
      payload.status === "completed"
        ? 100
        : payload.progress !== undefined
          ? safeNumber(payload.progress, "措施进度")
          : undefined;
    const changes = {
      ...(payload.name !== undefined
        ? { name: requiredString(payload.name, "措施名称") }
        : {}),
      ...(payload.owner !== undefined
        ? { owner: requiredString(payload.owner, "措施责任人") }
        : {}),
      ...(payload.recoveryDate !== undefined
        ? {
            recoveryDate: requiredIsoDate(
              payload.recoveryDate,
              "预计恢复日期",
            ),
          }
        : {}),
      ...(payload.detail !== undefined
        ? { detail: requiredString(payload.detail, "具体行动") }
        : {}),
      ...(payload.status ? { status: payload.status } : {}),
      ...(progress !== undefined ? { progress } : {}),
      updatedAt: sql`CURRENT_TIMESTAMP`,
    };
    const [action] = await db
      .update(correctiveActions)
      .set(changes)
      .where(eq(correctiveActions.id, actionId))
      .returning();
    await db.insert(auditLogs).values({
      actorEmail: identity.email,
      action: "corrective_action.update",
      entityType: "corrective_action",
      entityId: String(actionId),
      detailJson: JSON.stringify(payload),
    });
    const health = await recalculateProjectHealth(existing.projectId);
    return Response.json({ action, health });
  } catch (error) {
    return apiError(error);
  }
}
