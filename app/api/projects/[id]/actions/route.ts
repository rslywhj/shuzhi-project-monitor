import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  correctiveActions,
  milestones,
  projects,
  risks,
} from "@/db/schema";
import {
  ApiRequestError,
  apiError,
  requiredIsoDate,
  requiredString,
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

const statuses = new Set(["pending", "in_progress", "completed", "overdue"]);

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
    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!project) {
      return Response.json({ error: "未找到指定项目。" }, { status: 404 });
    }
    const rows = await db
      .select()
      .from(correctiveActions)
      .where(eq(correctiveActions.projectId, id))
      .orderBy(desc(correctiveActions.createdAt));
    return Response.json({ actions: rows });
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

    const payload = (await request.json()) as {
      name?: string;
      owner?: string;
      recoveryDate?: string;
      detail?: string;
      status?: "pending" | "in_progress" | "completed" | "overdue";
      progress?: number;
      milestoneId?: number | null;
      riskId?: number | null;
    };
    if (payload.status && !statuses.has(payload.status)) {
      throw new ApiRequestError("措施状态无效。");
    }
    if (payload.milestoneId) {
      const [milestone] = await db
        .select({ projectId: milestones.projectId })
        .from(milestones)
        .where(eq(milestones.id, payload.milestoneId))
        .limit(1);
      if (!milestone || milestone.projectId !== id) {
        throw new ApiRequestError("关联节点不存在或不属于当前项目。");
      }
    }
    if (payload.riskId) {
      const [risk] = await db
        .select({ projectId: risks.projectId })
        .from(risks)
        .where(eq(risks.id, payload.riskId))
        .limit(1);
      if (!risk || risk.projectId !== id) {
        throw new ApiRequestError("关联风险不存在或不属于当前项目。");
      }
    }
    const [action] = await db
      .insert(correctiveActions)
      .values({
        projectId: id,
        milestoneId: payload.milestoneId || null,
        riskId: payload.riskId || null,
        name: requiredString(payload.name, "措施名称"),
        owner: requiredString(payload.owner, "措施责任人"),
        recoveryDate: requiredIsoDate(payload.recoveryDate, "预计恢复日期"),
        detail: requiredString(payload.detail, "具体行动"),
        status: payload.status ?? "in_progress",
        progress: safeNumber(payload.progress ?? 0, "措施进度"),
        createdBy: identity.email,
        updatedAt: new Date().toISOString(),
      })
      .returning();
    await db.insert(auditLogs).values({
      actorEmail: identity.email,
      action: "corrective_action.create",
      entityType: "corrective_action",
      entityId: String(action.id),
      detailJson: JSON.stringify({
        projectId: id,
        riskId: action.riskId,
        name: action.name,
      }),
    });
    const health = await recalculateProjectHealth(id);
    return Response.json({ action, health }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
