import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, projects, risks } from "@/db/schema";
import {
  ApiRequestError,
  apiError,
  requiredIsoDate,
  requiredString,
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

const levels = new Set(["low", "medium", "high"]);
const statuses = new Set(["open", "monitoring", "closed"]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    const { id } = await context.params;
    const riskId = Number(id);
    if (!Number.isInteger(riskId) || riskId < 1) {
      throw new ApiRequestError("风险编号无效。");
    }

    const db = getDb();
    const [existing] = await db.select().from(risks).where(eq(risks.id, riskId)).limit(1);
    if (!existing) {
      return Response.json({ error: "未找到指定风险。" }, { status: 404 });
    }
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, existing.projectId))
      .limit(1);
    if (!project) {
      return Response.json({ error: "风险所属项目不存在。" }, { status: 409 });
    }
    if (!canWriteProject(identity, project.ownerEmail)) return forbidden();
    if (projectLifecycleLocked(project)) return lifecycleLockedResponse(project);

    const payload = (await request.json()) as {
      title?: string;
      category?: string;
      level?: "low" | "medium" | "high";
      status?: "open" | "monitoring" | "closed";
      description?: string;
      mitigation?: string;
      owner?: string;
      dueDate?: string | null;
    };
    if (payload.level && !levels.has(payload.level)) {
      throw new ApiRequestError("风险等级无效。");
    }
    if (payload.status && !statuses.has(payload.status)) {
      throw new ApiRequestError("风险状态无效。");
    }
    const changes = {
      ...(payload.title !== undefined
        ? { title: requiredString(payload.title, "风险标题") }
        : {}),
      ...(payload.category !== undefined
        ? { category: requiredString(payload.category, "风险类别") }
        : {}),
      ...(payload.level ? { level: payload.level } : {}),
      ...(payload.status ? { status: payload.status } : {}),
      ...(payload.description !== undefined
        ? { description: requiredString(payload.description, "风险描述") }
        : {}),
      ...(payload.mitigation !== undefined
        ? { mitigation: payload.mitigation.trim() }
        : {}),
      ...(payload.owner !== undefined
        ? { owner: requiredString(payload.owner, "风险责任人") }
        : {}),
      ...(payload.dueDate !== undefined
        ? {
            dueDate: payload.dueDate
              ? requiredIsoDate(payload.dueDate, "计划关闭日期")
              : null,
          }
        : {}),
      updatedAt: sql`CURRENT_TIMESTAMP`,
    };
    const [risk] = await db
      .update(risks)
      .set(changes)
      .where(eq(risks.id, riskId))
      .returning();

    const openRisks = await db
      .select({ level: risks.level })
      .from(risks)
      .where(
        and(
          eq(risks.projectId, existing.projectId),
          ne(risks.status, "closed"),
        ),
      );
    const nextRiskLevel = openRisks.some((row) => row.level === "high")
      ? "high"
      : openRisks.some((row) => row.level === "medium")
        ? "medium"
        : "low";
    await db.batch([
      db
        .update(projects)
        .set({ riskLevel: nextRiskLevel, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(projects.id, existing.projectId)),
      db.insert(auditLogs).values({
        actorEmail: identity.email,
        action: "risk.update",
        entityType: "risk",
        entityId: String(riskId),
        detailJson: JSON.stringify(payload),
      }),
    ]);
    const health = await recalculateProjectHealth(existing.projectId);
    return Response.json({ risk, health });
  } catch (error) {
    return apiError(error);
  }
}
