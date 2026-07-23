import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, baselineChanges, milestones, projects } from "@/db/schema";
import { apiError } from "@/lib/api-utils";
import { ensureSeeded } from "@/lib/seed";
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
      to: string;
    }>;
    for (const update of updates) {
      await db
        .update(milestones)
        .set({
          plannedFinish: update.to,
          forecastFinish: update.to,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(
          sql`${milestones.projectId} = ${change.projectId} AND ${milestones.name} = ${update.milestone}`,
        );
    }

    await db
      .update(baselineChanges)
      .set({
        status: "approved",
        approvedBy: identity.email,
        approvedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(baselineChanges.id, changeId));
    await db
      .update(projects)
      .set({
        currentBaselineVersion: change.versionTo,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(projects.id, change.projectId));
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

    return Response.json({
      change: {
        ...change,
        status: "approved",
        approvedBy: identity.email,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
