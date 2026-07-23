import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, baselineChanges, milestones, projects } from "@/db/schema";
import { apiError } from "@/lib/api-utils";
import { ensureSeeded } from "@/lib/seed";
import { recalculateProjectHealth } from "@/lib/health";
import {
  canManagePortfolio,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

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
    const changeId = Number(id);
    if (!Number.isInteger(changeId)) {
      return Response.json({ error: "无效的变更申请编号。" }, { status: 400 });
    }

    const db = getDb();
    const [change] = await db
      .select()
      .from(baselineChanges)
      .where(eq(baselineChanges.id, changeId))
      .limit(1);
    if (!change) {
      return Response.json({ error: "未找到基线变更申请。" }, { status: 404 });
    }
    if (change.status !== "pending") {
      return Response.json({ error: "该申请已经处理，不能重复审批。" }, { status: 409 });
    }

    const updates = JSON.parse(change.changesJson) as Array<{
      milestone: string;
      milestoneId?: number;
      to: string;
    }>;
    const stillPending = sql`EXISTS (
      SELECT 1
      FROM ${baselineChanges}
      WHERE ${baselineChanges.id} = ${changeId}
        AND ${baselineChanges.status} = 'pending'
    )`;
    const projectAtExpectedBaseline = sql`EXISTS (
      SELECT 1
      FROM ${projects}
      WHERE ${projects.id} = ${change.projectId}
        AND ${projects.currentBaselineVersion} = ${change.versionFrom}
    )`;
    const milestoneStatements = updates.map((update) =>
      db
        .update(milestones)
        .set({
          plannedFinish: update.to,
          forecastFinish: update.to,
          deviationDays: 0,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(
          update.milestoneId
            ? and(
                eq(milestones.projectId, change.projectId),
                eq(milestones.id, update.milestoneId),
                stillPending,
                projectAtExpectedBaseline,
              )
            : and(
                eq(milestones.projectId, change.projectId),
                eq(milestones.name, update.milestone),
                stillPending,
                projectAtExpectedBaseline,
              ),
        ),
    );
    const approvedAt = new Date().toISOString();
    const batchResults = await db.batch([
      ...milestoneStatements,
      db
        .update(projects)
        .set({
          currentBaselineVersion: change.versionTo,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(
          and(
            eq(projects.id, change.projectId),
            eq(projects.currentBaselineVersion, change.versionFrom),
            stillPending,
          ),
        ),
      db
        .update(baselineChanges)
        .set({
          status: "approved",
          approvedBy: identity.email,
          approvedAt,
        })
        .where(
          and(
            eq(baselineChanges.id, changeId),
            eq(baselineChanges.status, "pending"),
            sql`EXISTS (
              SELECT 1
              FROM ${projects}
              WHERE ${projects.id} = ${change.projectId}
                AND ${projects.currentBaselineVersion} = ${change.versionTo}
            )`,
          ),
        )
        .returning(),
    ]);
    const approvedRows = batchResults.at(-1) as
      | (typeof baselineChanges.$inferSelect)[]
      | undefined;
    const approvedChange = approvedRows?.[0];
    if (!approvedChange) {
      return Response.json(
        { error: "该申请已被处理，或项目基线版本已发生变化。" },
        { status: 409 },
      );
    }
    await db.insert(auditLogs).values({
      actorEmail: identity.email,
      action: "baseline_change.approve",
      entityType: "baseline_change",
      entityId: String(changeId),
      detailJson: JSON.stringify({
        projectId: change.projectId,
        versionFrom: change.versionFrom,
        versionTo: change.versionTo,
      }),
    });
    const health = await recalculateProjectHealth(change.projectId);

    return Response.json({
      change: {
        ...approvedChange,
        changes: updates,
      },
      health,
    });
  } catch (error) {
    return apiError(error);
  }
}
