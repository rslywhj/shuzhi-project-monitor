import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, projects, risks } from "@/db/schema";
import {
  ApiRequestError,
  apiError,
  requiredIsoDate,
  requiredString,
} from "@/lib/api-utils";
import { ensureSeeded } from "@/lib/seed";
import { recalculateProjectHealth } from "@/lib/health";
import {
  canWriteProject,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const levels = new Set(["low", "medium", "high"]);
const statuses = new Set(["open", "monitoring", "closed"]);

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
      .from(risks)
      .where(eq(risks.projectId, id))
      .orderBy(asc(risks.status), asc(risks.dueDate));
    return Response.json({ risks: rows });
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

    const payload = (await request.json()) as {
      title?: string;
      category?: string;
      level?: "low" | "medium" | "high";
      status?: "open" | "monitoring" | "closed";
      description?: string;
      mitigation?: string;
      owner?: string;
      dueDate?: string;
    };
    if (payload.level && !levels.has(payload.level)) {
      throw new ApiRequestError("风险等级无效。");
    }
    if (payload.status && !statuses.has(payload.status)) {
      throw new ApiRequestError("风险状态无效。");
    }
    const level = payload.level ?? "medium";
    const [risk] = await db
      .insert(risks)
      .values({
        projectId: id,
        title: requiredString(payload.title, "风险标题"),
        category: requiredString(payload.category ?? "进度", "风险类别"),
        level,
        status: payload.status ?? "open",
        description: requiredString(payload.description, "风险描述"),
        mitigation: payload.mitigation?.trim() ?? "",
        owner: requiredString(payload.owner, "风险责任人"),
        dueDate: payload.dueDate
          ? requiredIsoDate(payload.dueDate, "计划关闭日期")
          : null,
        createdBy: identity.email,
      })
      .returning();

    const rank = { low: 0, medium: 1, high: 2 };
    const nextRiskLevel =
      risk.status !== "closed" && rank[level] > rank[project.riskLevel]
        ? level
        : project.riskLevel;
    await db.batch([
      db
        .update(projects)
        .set({ riskLevel: nextRiskLevel, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(projects.id, id)),
      db.insert(auditLogs).values({
        actorEmail: identity.email,
        action: "risk.create",
        entityType: "risk",
        entityId: String(risk.id),
        detailJson: JSON.stringify({
          projectId: id,
          title: risk.title,
          level: risk.level,
        }),
      }),
    ]);
    const health = await recalculateProjectHealth(id);
    return Response.json({ risk, health }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
