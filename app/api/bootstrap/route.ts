import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  baselineChanges,
  correctiveActions,
  milestones,
  projects,
  risks,
  ruleConfigs,
  snapshots,
  weeklyReports,
} from "@/db/schema";
import { apiError } from "@/lib/api-utils";
import { ensureSeeded } from "@/lib/seed";
import { getRequestIdentity, unauthorized } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    await ensureSeeded();

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
    ]);

    const projectMilestones = new Map<string, typeof milestoneRows>();
    for (const milestone of milestoneRows) {
      const rows = projectMilestones.get(milestone.projectId) ?? [];
      rows.push(milestone);
      projectMilestones.set(milestone.projectId, rows);
    }
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
    const lockedSnapshot = snapshotRows.find(
      (snapshot) => snapshot.status === "locked",
    );
    let dashboardProjects: Array<Record<string, unknown>> = [];
    if (lockedSnapshot) {
      const payload = JSON.parse(lockedSnapshot.payloadJson) as {
        projects?: typeof projectRows;
        milestones?: typeof milestoneRows;
      };
      const snapshotMilestones = new Map<string, typeof milestoneRows>();
      for (const milestone of payload.milestones ?? []) {
        const rows = snapshotMilestones.get(milestone.projectId) ?? [];
        rows.push(milestone);
        snapshotMilestones.set(milestone.projectId, rows);
      }
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
        cells: (snapshotMilestones.get(project.id) ?? []).map(
          (row) => row.status,
        ),
        milestones: snapshotMilestones.get(project.id) ?? [],
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
        cells: (projectMilestones.get(project.id) ?? []).map((row) => row.status),
        milestones: projectMilestones.get(project.id) ?? [],
        updatedAt: project.updatedAt,
        openRiskCount: openRiskCounts.get(project.id) ?? 0,
        openActionCount: openActionCounts.get(project.id) ?? 0,
      })),
      weeklyReports: reportRows,
      actions: actionRows,
      risks: riskRows,
      dashboardProjects,
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
      })),
      activeRule: ruleRows[0] ?? null,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return apiError(error);
  }
}
