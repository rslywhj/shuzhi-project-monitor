import { and, eq, ne, notExists, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  baselineChanges,
  correctiveActions,
  milestones,
  projects,
  risks,
} from "@/db/schema";
import { ApiRequestError, apiError, requiredString } from "@/lib/api-utils";
import {
  loadProjectClosureState,
  type ProjectLifecycleStatus,
} from "@/lib/project-lifecycle";
import { ensureSeeded } from "@/lib/seed";
import {
  canManagePortfolio,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const lifecycleStatuses = new Set<ProjectLifecycleStatus>([
  "active",
  "completed",
  "archived",
]);

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
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);
    if (!project) {
      return Response.json({ error: "未找到指定项目。" }, { status: 404 });
    }
    const closure = await loadProjectClosureState(db, id);
    return Response.json({ project, closure });
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
    if (!canManagePortfolio(identity)) return forbidden();
    await ensureSeeded();
    const { id } = await context.params;
    const payload = (await request.json()) as {
      status?: ProjectLifecycleStatus;
      reason?: unknown;
      overrideOpenItems?: boolean;
    };
    if (!payload.status || !lifecycleStatuses.has(payload.status)) {
      throw new ApiRequestError("请选择有效的项目生命周期状态。");
    }
    const reason = requiredString(payload.reason, "状态变更原因");
    if (reason.length < 10 || reason.length > 500) {
      throw new ApiRequestError("状态变更原因必须为10–500个字符。");
    }

    const db = getDb();
    const [existing] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);
    if (!existing) {
      return Response.json({ error: "未找到指定项目。" }, { status: 404 });
    }
    if (existing.lifecycleStatus === payload.status) {
      throw new ApiRequestError("项目已经处于目标状态。", 409);
    }
    if (
      payload.status === "archived" &&
      existing.lifecycleStatus !== "completed"
    ) {
      throw new ApiRequestError("只有已结项项目可以归档。", 409);
    }
    if (
      payload.status === "completed" &&
      existing.lifecycleStatus !== "active"
    ) {
      throw new ApiRequestError("只有在建项目可以标记结项。", 409);
    }

    const closure = await loadProjectClosureState(db, id);
    if (
      payload.status === "completed" &&
      !closure.clear &&
      payload.overrideOpenItems !== true
    ) {
      return Response.json(
        {
          error: "项目仍有未闭环事项，请处理完毕或明确勾选带原因结项。",
          closure,
        },
        { status: 409 },
      );
    }

    const targetStatus = payload.status;
    const expectedCurrent =
      targetStatus === "completed"
        ? "active"
        : targetStatus === "archived"
          ? "completed"
          : existing.lifecycleStatus;
    const closureConditions =
      targetStatus === "completed" && payload.overrideOpenItems !== true
        ? [
            notExists(
              db
                .select({ id: milestones.id })
                .from(milestones)
                .where(
                  and(
                    eq(milestones.projectId, id),
                    eq(milestones.applicable, true),
                    sql`${milestones.completion} < 100`,
                  ),
                ),
            ),
            notExists(
              db
                .select({ id: risks.id })
                .from(risks)
                .where(and(eq(risks.projectId, id), ne(risks.status, "closed"))),
            ),
            notExists(
              db
                .select({ id: correctiveActions.id })
                .from(correctiveActions)
                .where(
                  and(
                    eq(correctiveActions.projectId, id),
                    ne(correctiveActions.status, "completed"),
                  ),
                ),
            ),
            notExists(
              db
                .select({ id: baselineChanges.id })
                .from(baselineChanges)
                .where(
                  and(
                    eq(baselineChanges.projectId, id),
                    eq(baselineChanges.status, "pending"),
                  ),
                ),
            ),
          ]
        : [];
    const now = new Date().toISOString();
    const [project] = await db
      .update(projects)
      .set({
        lifecycleStatus: targetStatus,
        lifecycleReason: reason,
        completedAt:
          targetStatus === "completed"
            ? now
            : targetStatus === "active"
              ? null
              : existing.completedAt,
        archivedAt: targetStatus === "archived" ? now : null,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(
        and(
          eq(projects.id, id),
          eq(projects.lifecycleStatus, expectedCurrent),
          ...closureConditions,
        ),
      )
      .returning();
    if (!project) {
      throw new ApiRequestError(
        "项目状态或闭环事项刚刚发生变化，请刷新后重试。",
        409,
      );
    }
    await db.insert(auditLogs).values({
      actorEmail: identity.email,
      action: "project.lifecycle_change",
      entityType: "project",
      entityId: id,
      detailJson: JSON.stringify({
        from: existing.lifecycleStatus,
        to: targetStatus,
        reason,
        overrideOpenItems: payload.overrideOpenItems === true,
        closure,
      }),
    });
    return Response.json({ project, closure });
  } catch (error) {
    return apiError(error);
  }
}
