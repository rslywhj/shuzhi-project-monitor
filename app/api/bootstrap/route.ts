import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  baselineChanges,
  correctiveActions,
  milestoneTemplates,
  milestones,
  projects,
  risks,
  ruleConfigs,
  snapshots,
  users,
  weeklyReports,
} from "@/db/schema";
import { apiError } from "@/lib/api-utils";
import { formatShanghaiDate, shanghaiDateIso } from "@/lib/date-time";
import { runPortfolioAutomation } from "@/lib/portfolio-automation";
import {
  calculateProjectStage,
  latestConfirmedPrimary,
  type ProjectStageSummary,
} from "@/lib/project-stage";
import { ensureSeeded } from "@/lib/seed";
import { getRequestIdentity, unauthorized } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type DashboardAlertItem = {
  id: number;
  projectId: string;
  title: string;
  owner: string;
  targetDate: string;
};

type DashboardAlerts = {
  highRisks: DashboardAlertItem[];
  overdueActions: DashboardAlertItem[];
  predictedDelays: Array<{
    projectId: string;
    probability: number;
    riskBand: "low" | "medium" | "high";
    expectedDelayDays: number;
    milestoneName: string;
    confidence: "low" | "medium" | "high";
    earlyWarning: boolean;
  }>;
  resourceConflicts: Array<{
    resourceId: number;
    resourceName: string;
    resourceOrg: string;
    weekKey: string;
    utilization: number;
    overallocatedHours: number;
    projectNames: string[];
  }>;
};

function parseHealthExplanation(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    await ensureSeeded();
    const automation = await runPortfolioAutomation(
      new Date(),
      "request",
    ).catch((error) => {
      console.error("request-triggered portfolio automation failed", error);
      return null;
    });

    const db = getDb();
    const [
      projectRows,
      milestoneRows,
      reportRows,
      actionRows,
      riskRows,
      baselineRows,
      snapshotRows,
      ruleRows,
      templateRows,
      userRows,
    ] = await Promise.all([
      db.select().from(projects).orderBy(asc(projects.code)),
      db.select().from(milestones).orderBy(asc(milestones.projectId), asc(milestones.sequence)),
      db.select().from(weeklyReports).orderBy(desc(weeklyReports.submittedAt)).limit(100),
      db.select().from(correctiveActions).orderBy(desc(correctiveActions.createdAt)).limit(100),
      db.select().from(risks).orderBy(desc(risks.createdAt)).limit(100),
      db
        .select()
        .from(baselineChanges)
        .orderBy(desc(baselineChanges.requestedAt), desc(baselineChanges.id))
        .limit(50),
      db.select().from(snapshots).orderBy(desc(snapshots.lockedAt)).limit(20),
      db.select().from(ruleConfigs).where(eq(ruleConfigs.active, true)).orderBy(desc(ruleConfigs.version)).limit(1),
      db
        .select()
        .from(milestoneTemplates)
        .orderBy(asc(milestoneTemplates.sequence)),
      db
        .select({
          email: users.email,
          displayName: users.displayName,
          role: users.role,
          active: users.active,
        })
        .from(users)
        .orderBy(asc(users.displayName)),
    ]);

    const projectMilestones = new Map<string, typeof milestoneRows>();
    for (const milestone of milestoneRows) {
      const rows = projectMilestones.get(milestone.projectId) ?? [];
      rows.push(milestone);
      projectMilestones.set(milestone.projectId, rows);
    }
    const activeTemplates = templateRows.filter((template) => template.active);
    const matrixCells = (rows: typeof milestoneRows) =>
      activeTemplates.map(
        (template) =>
          rows.find(
            (milestone) =>
              milestone.templateId === template.id ||
              milestone.name === template.name,
          )?.status ?? "na",
      );
    const openRiskCounts = new Map<string, number>();
    for (const risk of riskRows) {
      if (risk.status !== "closed") {
        openRiskCounts.set(
          risk.projectId,
          (openRiskCounts.get(risk.projectId) ?? 0) + 1,
        );
      }
    }
    const openActionCounts = new Map<string, number>();
    for (const action of actionRows) {
      if (action.status !== "completed") {
        openActionCounts.set(
          action.projectId,
          (openActionCounts.get(action.projectId) ?? 0) + 1,
        );
      }
    }
    const confirmedPrimaryByProject = latestConfirmedPrimary(reportRows);
    const liveStageByProject = new Map(
      projectRows.map((project) => {
        const summary = calculateProjectStage({
          projectId: project.id,
          milestones: projectMilestones.get(project.id) ?? [],
          asOfDate: shanghaiDateIso(),
          confirmedPrimaryMilestoneId: confirmedPrimaryByProject.get(project.id),
          lifecycleStatus: project.lifecycleStatus,
        });
        return [project.id, summary] as const;
      }),
    );
    const lockedSnapshot = snapshotRows.find(
      (snapshot) => snapshot.status === "locked",
    );
    let dashboardProjects: Array<Record<string, unknown>> = [];
    let dashboardAlerts: DashboardAlerts = {
      highRisks: [],
      overdueActions: [],
      predictedDelays: [],
      resourceConflicts: [],
    };
    let dashboardStageDataQuality = {
      missingPrimaryProjectIds: [] as string[],
      shouldStartProjectIds: [] as string[],
      carryoverProjectIds: [] as string[],
    };
    if (lockedSnapshot) {
      const payload = JSON.parse(lockedSnapshot.payloadJson) as {
        projects?: typeof projectRows;
        milestones?: typeof milestoneRows;
        projectStages?: ProjectStageSummary[];
        stageDataQuality?: typeof dashboardStageDataQuality;
        dashboardAlerts?: DashboardAlerts;
      };
      dashboardAlerts = {
        highRisks: payload.dashboardAlerts?.highRisks ?? [],
        overdueActions: payload.dashboardAlerts?.overdueActions ?? [],
        predictedDelays:
          payload.dashboardAlerts?.predictedDelays ?? [],
        resourceConflicts:
          payload.dashboardAlerts?.resourceConflicts ?? [],
      };
      const snapshotMilestones = new Map<string, typeof milestoneRows>();
      for (const milestone of payload.milestones ?? []) {
        const rows = snapshotMilestones.get(milestone.projectId) ?? [];
        rows.push(milestone);
        snapshotMilestones.set(milestone.projectId, rows);
      }
      const snapshotStageByProject = new Map(
        (payload.projectStages ?? []).map((stage) => [stage.projectId, stage]),
      );
      dashboardStageDataQuality = payload.stageDataQuality ?? dashboardStageDataQuality;
      dashboardProjects = (payload.projects ?? []).map((project) => ({
        id: project.id,
        name: project.name,
        owner: project.ownerName,
        ownerEmail: project.ownerEmail,
        org: project.org,
        type: project.type,
        score: project.score,
        status: project.status,
        plan: project.planProgress,
        actual: project.actualProgress,
        declared: project.declaredProgress,
        risk:
          project.riskLevel === "high"
            ? "高"
            : project.riskLevel === "medium"
              ? "中"
              : "低",
        baselineVersion: project.currentBaselineVersion,
        lifecycleStatus: project.lifecycleStatus,
        lifecycleReason: project.lifecycleReason,
        completedAt: project.completedAt,
        archivedAt: project.archivedAt,
        healthExplanation: parseHealthExplanation(
          project.healthExplanationJson,
        ),
        cells: matrixCells(snapshotMilestones.get(project.id) ?? []),
        milestones: snapshotMilestones.get(project.id) ?? [],
        stageSummary:
          snapshotStageByProject.get(project.id) ??
          calculateProjectStage({
            projectId: project.id,
            milestones: snapshotMilestones.get(project.id) ?? [],
            asOfDate: formatShanghaiDate(lockedSnapshot.lockedAt),
            lifecycleStatus: project.lifecycleStatus,
          }),
        updatedAt: project.updatedAt,
      }));
    }

    return Response.json({
      identity,
      projects: projectRows.map((project) => ({
        id: project.id,
        name: project.name,
        owner: project.ownerName,
        ownerEmail: project.ownerEmail,
        org: project.org,
        type: project.type,
        score: project.score,
        status: project.status,
        plan: project.planProgress,
        actual: project.actualProgress,
        declared: project.declaredProgress,
        risk:
          project.riskLevel === "high"
            ? "高"
            : project.riskLevel === "medium"
              ? "中"
              : "低",
        baselineVersion: project.currentBaselineVersion,
        lifecycleStatus: project.lifecycleStatus,
        lifecycleReason: project.lifecycleReason,
        completedAt: project.completedAt,
        archivedAt: project.archivedAt,
        healthExplanation: parseHealthExplanation(
          project.healthExplanationJson,
        ),
        cells: matrixCells(projectMilestones.get(project.id) ?? []),
        milestones: projectMilestones.get(project.id) ?? [],
        stageSummary: liveStageByProject.get(project.id),
        updatedAt: project.updatedAt,
        openRiskCount: openRiskCounts.get(project.id) ?? 0,
        openActionCount: openActionCounts.get(project.id) ?? 0,
      })),
      weeklyReports: reportRows.map((report) => ({
        ...report,
        milestoneUpdates: JSON.parse(report.milestoneUpdatesJson) as unknown,
        milestoneUpdatesJson: undefined,
      })),
      actions: actionRows,
      risks: riskRows,
      dashboardProjects,
      dashboardAlerts,
      dashboardStageDataQuality,
      dashboardSnapshot: lockedSnapshot
        ? {
            id: lockedSnapshot.id,
            weekKey: lockedSnapshot.weekKey,
            version: lockedSnapshot.version,
            projectCount: lockedSnapshot.projectCount,
            completeness: lockedSnapshot.completeness,
            lockedAt: lockedSnapshot.lockedAt,
          }
        : null,
      baselineChanges: baselineRows.map((row) => ({
        ...row,
        changes: JSON.parse(row.changesJson) as unknown,
      })),
      snapshots: snapshotRows.map((row) => ({
        id: row.id,
        weekKey: row.weekKey,
        version: row.version,
        status: row.status,
        projectCount: row.projectCount,
        completeness: row.completeness,
        lockedBy: row.lockedBy,
        lockedAt: row.lockedAt,
        reopenEventId: row.reopenEventId,
        reopenedBy: row.reopenedBy,
        reopenedAt: row.reopenedAt,
        reopenReason: row.reopenReason,
      })),
      activeRule: ruleRows[0] ?? null,
      milestoneTemplates: templateRows,
      projectManagers:
        identity.role === "pmo" || identity.role === "admin"
          ? userRows
              .filter((user) => user.active && user.role === "manager")
              .map((user) => ({
                email: user.email,
                displayName: user.displayName,
              }))
          : [],
      automation,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return apiError(error);
  }
}
