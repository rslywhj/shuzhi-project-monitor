import { and, count, desc, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  correctiveActions,
  milestones,
  projects,
  risks,
  snapshots,
  weeklyReports,
} from "@/db/schema";
import { apiError, requiredWeekKey } from "@/lib/api-utils";
import { ensureSeeded } from "@/lib/seed";
import { recalculateProjectHealth } from "@/lib/health";
import {
  canManagePortfolio,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    if (!canManagePortfolio(identity)) return forbidden();
    await ensureSeeded();

    const payload = (await request.json()) as { weekKey?: string };
    const weekKey = requiredWeekKey(payload.weekKey, "快照周期");
    const db = getDb();
    const projectIds = await db.select({ id: projects.id }).from(projects);
    for (let index = 0; index < projectIds.length; index += 5) {
      await Promise.all(
        projectIds
          .slice(index, index + 5)
          .map((project) => recalculateProjectHealth(project.id, weekKey)),
      );
    }

    const [
      [projectTotal],
      [reportTotal],
      previous,
      projectRows,
      milestoneRows,
      riskRows,
      actionRows,
    ] = await Promise.all([
        db.select({ value: count() }).from(projects),
        db
          .select({ value: count() })
          .from(weeklyReports)
          .where(
            and(
              eq(weeklyReports.weekKey, weekKey),
              ne(weeklyReports.status, "draft"),
            ),
          ),
        db
          .select()
          .from(snapshots)
          .where(eq(snapshots.weekKey, weekKey))
          .orderBy(desc(snapshots.version))
          .limit(1),
        db.select().from(projects),
        db.select().from(milestones),
        db.select().from(risks),
        db.select().from(correctiveActions),
      ]);

    const version = (previous[0]?.version ?? 0) + 1;
    if (previous[0]?.status === "locked") {
      return Response.json(
        { error: "该周期已有锁定快照，请先填写原因并重新打开。" },
        { status: 409 },
      );
    }
    const completeness =
      projectTotal.value === 0
        ? 0
        : Number(((reportTotal.value / projectTotal.value) * 100).toFixed(1));
    const capturedAt = new Date().toISOString();
    const capturedDate = capturedAt.slice(0, 10);
    const dashboardAlerts = {
      highRisks: riskRows
        .filter((risk) => risk.status !== "closed" && risk.level === "high")
        .map((risk) => ({
          id: risk.id,
          projectId: risk.projectId,
          title: risk.title,
          owner: risk.owner,
          targetDate: risk.dueDate,
        })),
      overdueActions: actionRows
        .filter(
          (action) =>
            action.status !== "completed" &&
            (action.status === "overdue" ||
              (Boolean(action.recoveryDate) &&
                action.recoveryDate < capturedDate)),
        )
        .map((action) => ({
          id: action.id,
          projectId: action.projectId,
          title: action.name,
          owner: action.owner,
          targetDate: action.recoveryDate,
        })),
    };
    const snapshotPayload = JSON.stringify({
      projects: projectRows,
      milestones: milestoneRows,
      dashboardAlerts,
      capturedAt,
    });

    const [snapshot] = await db
      .insert(snapshots)
      .values({
        weekKey,
        version,
        projectCount: projectTotal.value,
        completeness,
        payloadJson: snapshotPayload,
        lockedBy: identity.email,
      })
      .returning();
    await db
      .update(weeklyReports)
      .set({ status: "locked" })
      .where(eq(weeklyReports.weekKey, weekKey));
    await db.insert(auditLogs).values({
      actorEmail: identity.email,
      action: "snapshot.lock",
      entityType: "snapshot",
      entityId: String(snapshot.id),
      detailJson: JSON.stringify({
        weekKey,
        version,
        completeness,
        highRiskCount: dashboardAlerts.highRisks.length,
        overdueActionCount: dashboardAlerts.overdueActions.length,
      }),
    });

    return Response.json({ snapshot }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed: snapshots.week_key")
    ) {
      return Response.json(
        { error: "该周期快照刚刚被其他操作锁定，请刷新后重试。" },
        { status: 409 },
      );
    }
    return apiError(error);
  }
}
