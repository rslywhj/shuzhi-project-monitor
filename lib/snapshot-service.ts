import { and, desc, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  correctiveActions,
  milestones,
  projects,
  resourceAllocations,
  resources,
  risks,
  ruleConfigs,
  snapshots,
  weeklyReports,
} from "@/db/schema";
import { buildPortfolioDelayForecast } from "@/lib/delay-forecast";
import { shanghaiDateIso } from "@/lib/date-time";
import { recalculateProjectHealth } from "@/lib/health";
import { buildResourceCapacity } from "@/lib/resource-capacity";
import { ensureSeeded } from "@/lib/seed";
import {
  calculateProjectStage,
  latestConfirmedPrimary,
} from "@/lib/project-stage";

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

  const projectIds = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.lifecycleStatus, "active"));
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
    allProjectRows,
    reportRows,
    milestoneRows,
    riskRows,
    actionRows,
    activeRuleRows,
    resourceRows,
    allocationRows,
  ] = await Promise.all([
    db.select().from(projects),
    db
      .select()
      .from(weeklyReports)
      .where(ne(weeklyReports.status, "draft")),
    db.select().from(milestones),
    db.select().from(risks),
    db.select().from(correctiveActions),
    db
      .select()
      .from(ruleConfigs)
      .where(eq(ruleConfigs.active, true))
      .orderBy(desc(ruleConfigs.version))
      .limit(1),
    db.select().from(resources),
    db.select().from(resourceAllocations),
  ]);
  const projectRows = allProjectRows.filter(
    (project) => project.lifecycleStatus === "active",
  );
  const snapshotProjectRows = allProjectRows.filter(
    (project) => project.lifecycleStatus !== "archived",
  );
  const activeProjectIds = new Set(projectRows.map((project) => project.id));
  const snapshotProjectIds = new Set(
    snapshotProjectRows.map((project) => project.id),
  );
  const snapshotMilestones = milestoneRows.filter((row) =>
    snapshotProjectIds.has(row.projectId),
  );
  const activeRisks = riskRows.filter((row) =>
    activeProjectIds.has(row.projectId),
  );
  const activeActions = actionRows.filter((row) =>
    activeProjectIds.has(row.projectId),
  );
  const activeReports = reportRows.filter((row) =>
    activeProjectIds.has(row.projectId),
  );
  const submittedProjectCount = new Set(
    activeReports
      .filter((report) => report.weekKey === options.weekKey)
      .map((report) => report.projectId),
  ).size;
  const version = (previous[0]?.version ?? 0) + 1;
  const completeness =
    projectRows.length === 0
      ? 0
      : Number(
          ((submittedProjectCount / projectRows.length) * 100).toFixed(1),
        );
  const capturedAt = options.capturedAt ?? new Date();
  const capturedAtIso = capturedAt.toISOString();
  const capturedDate = shanghaiDateIso(capturedAt);
  const confirmedPrimaryByProject = latestConfirmedPrimary(reportRows);
  const milestonesByProject = new Map<string, typeof milestoneRows>();
  for (const milestone of snapshotMilestones) {
    const rows = milestonesByProject.get(milestone.projectId) ?? [];
    rows.push(milestone);
    milestonesByProject.set(milestone.projectId, rows);
  }
  const projectStages = snapshotProjectRows.map((project) =>
    calculateProjectStage({
      projectId: project.id,
      milestones: milestonesByProject.get(project.id) ?? [],
      asOfDate: capturedDate,
      confirmedPrimaryMilestoneId: confirmedPrimaryByProject.get(project.id),
      lifecycleStatus: project.lifecycleStatus,
    }),
  );
  const stageDataQuality = {
    missingPrimaryProjectIds: projectStages
      .filter(
        (stage) =>
          stage.state === "active" && stage.primaryBasis !== "manager_confirmed",
      )
      .map((stage) => stage.projectId),
    shouldStartProjectIds: projectStages
      .filter((stage) => stage.shouldStartMilestoneIds.length > 0)
      .map((stage) => stage.projectId),
    carryoverProjectIds: projectStages
      .filter((stage) => stage.carryoverMilestoneIds.length > 0)
      .map((stage) => stage.projectId),
  };
  const delayForecast = buildPortfolioDelayForecast({
    projects: allProjectRows,
    milestones: milestoneRows,
    weeklyReports: reportRows,
    risks: riskRows,
    actions: actionRows,
    asOfDate: capturedDate,
    scopeProjectIds: activeProjectIds,
  });
  const resourceCapacity = buildResourceCapacity({
    resources: resourceRows,
    allocations: allocationRows,
    projects: allProjectRows,
    milestones: milestoneRows,
    asOfDate: capturedDate,
    weeks: 12,
  });
  const dashboardAlerts = {
    highRisks: activeRisks
      .filter((risk) => risk.status !== "closed" && risk.level === "high")
      .map((risk) => ({
        id: risk.id,
        projectId: risk.projectId,
        title: risk.title,
        owner: risk.owner,
        targetDate: risk.dueDate,
      })),
    overdueActions: activeActions
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
    predictedDelays: delayForecast.projects
      .filter(
        (project) =>
          project.probability >= 35 && Boolean(project.topMilestone),
      )
      .slice(0, 10)
      .map((project) => ({
        projectId: project.projectId,
        probability: project.probability,
        riskBand: project.riskBand,
        expectedDelayDays: project.expectedDelayDays,
        milestoneName: project.topMilestone!.name,
        confidence: project.confidence,
        earlyWarning: project.earlyWarning,
      })),
    resourceConflicts: resourceCapacity.conflicts.slice(0, 10).map(
      (conflict) => ({
        resourceId: conflict.resourceId,
        resourceName: conflict.resourceName,
        resourceOrg: conflict.resourceOrg,
        weekKey: conflict.weekKey,
        utilization: conflict.utilization,
        overallocatedHours: conflict.overallocatedHours,
        projectNames: [
          ...new Set(
            conflict.allocations.map(
              (allocation) => allocation.projectName,
            ),
          ),
        ],
      }),
    ),
  };
  const snapshotPayload = JSON.stringify({
    projects: snapshotProjectRows,
    milestones: snapshotMilestones,
    projectStages,
    stageDataQuality,
    dashboardAlerts,
    delayForecast,
    resourceCapacity,
    ruleConfig: activeRuleRows[0] ?? null,
    capturedAt: capturedAtIso,
  });

  try {
    const snapshotInsert = db
      .insert(snapshots)
      .values({
        weekKey: options.weekKey,
        version,
        projectCount: projectRows.length,
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
            predictedHighRiskCount:
              delayForecast.summary.highRiskProjectCount,
            earlyWarningCount:
              delayForecast.summary.earlyWarningProjectCount,
            resourceConflictCount:
              resourceCapacity.summary.conflictWeekCount,
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
