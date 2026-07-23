import { and, count, desc, eq, ne, sql } from "drizzle-orm";
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
import { recalculateProjectHealth } from "@/lib/health";
import { ensureSeeded } from "@/lib/seed";

export type SnapshotLockSource = "manual" | "automation";

export type SnapshotLockResult =
  | {
      outcome: "created";
      snapshot: typeof snapshots.$inferSelect;
    }
  | {
      outcome: "already_locked" | "reopened";
      snapshot: typeof snapshots.$inferSelect;
    };

export async function lockPortfolioSnapshot(options: {
  weekKey: string;
  actorEmail: string;
  source: SnapshotLockSource;
  capturedAt?: Date;
}): Promise<SnapshotLockResult> {
  await ensureSeeded();
  const db = getDb();
  const previous = await db
    .select()
    .from(snapshots)
    .where(eq(snapshots.weekKey, options.weekKey))
    .orderBy(desc(snapshots.version))
    .limit(1);
  if (previous[0]?.status === "locked") {
    return { outcome: "already_locked", snapshot: previous[0] };
  }
  if (previous[0]?.status === "reopened" && options.source === "automation") {
    return { outcome: "reopened", snapshot: previous[0] };
  }

  const projectIds = await db.select({ id: projects.id }).from(projects);
  for (let index = 0; index < projectIds.length; index += 5) {
    await Promise.all(
      projectIds
        .slice(index, index + 5)
        .map((project) =>
          recalculateProjectHealth(project.id, options.weekKey, {
            touchProject: false,
          }),
        ),
    );
  }

  const [
    [projectTotal],
    [reportTotal],
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
          eq(weeklyReports.weekKey, options.weekKey),
          ne(weeklyReports.status, "draft"),
        ),
      ),
    db.select().from(projects),
    db.select().from(milestones),
    db.select().from(risks),
    db.select().from(correctiveActions),
  ]);
  const version = (previous[0]?.version ?? 0) + 1;
  const completeness =
    projectTotal.value === 0
      ? 0
      : Number(((reportTotal.value / projectTotal.value) * 100).toFixed(1));
  const capturedAt = options.capturedAt ?? new Date();
  const capturedAtIso = capturedAt.toISOString();
  const capturedDate = capturedAtIso.slice(0, 10);
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
    capturedAt: capturedAtIso,
  });

  try {
    const snapshotInsert = db
      .insert(snapshots)
      .values({
        weekKey: options.weekKey,
        version,
        projectCount: projectTotal.value,
        completeness,
        payloadJson: snapshotPayload,
        lockedBy: options.actorEmail,
        lockedAt: capturedAtIso,
      })
      .returning();
    const auditInsert = db.insert(auditLogs).select(
      db
        .select({
          id: sql<number>`NULL`.as("id"),
          actorEmail: sql<string>`${options.actorEmail}`.as("actor_email"),
          action: sql<string>`'snapshot.lock'`.as("action"),
          entityType: sql<string>`'snapshot'`.as("entity_type"),
          entityId: sql<string>`CAST(${snapshots.id} AS TEXT)`.as("entity_id"),
          detailJson: sql<string>`${JSON.stringify({
            weekKey: options.weekKey,
            version,
            completeness,
            source: options.source,
            highRiskCount: dashboardAlerts.highRisks.length,
            overdueActionCount: dashboardAlerts.overdueActions.length,
          })}`.as("detail_json"),
          createdAt: sql<string>`${capturedAtIso}`.as("created_at"),
        })
        .from(snapshots)
        .where(
          and(
            eq(snapshots.weekKey, options.weekKey),
            eq(snapshots.version, version),
          ),
        ),
    );
    const batchResults = await db.batch([
      snapshotInsert,
      db
        .update(weeklyReports)
        .set({ status: "locked" })
        .where(
          and(
            eq(weeklyReports.weekKey, options.weekKey),
            ne(weeklyReports.status, "draft"),
          ),
        ),
      auditInsert,
    ]);
    const insertedRows = batchResults[0] as
      | (typeof snapshots.$inferSelect)[]
      | undefined;
    const snapshot = insertedRows?.[0];
    if (!snapshot) {
      throw new Error("快照写入失败。");
    }
    return { outcome: "created", snapshot };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed: snapshots.week_key")
    ) {
      const [snapshot] = await db
        .select()
        .from(snapshots)
        .where(eq(snapshots.weekKey, options.weekKey))
        .orderBy(desc(snapshots.version))
        .limit(1);
      if (snapshot) {
        return {
          outcome: snapshot.status === "locked" ? "already_locked" : "reopened",
          snapshot,
        };
      }
    }
    throw error;
  }
}
