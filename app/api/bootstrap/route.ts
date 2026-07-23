import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  baselineChanges,
  correctiveActions,
  milestones,
  projects,
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
      baselineRows,
      snapshotRows,
      ruleRows,
    ] = await Promise.all([
      db.select().from(projects).orderBy(asc(projects.code)),
      db.select().from(milestones).orderBy(asc(milestones.projectId), asc(milestones.sequence)),
      db.select().from(weeklyReports).orderBy(desc(weeklyReports.submittedAt)).limit(100),
      db.select().from(correctiveActions).orderBy(desc(correctiveActions.createdAt)).limit(100),
      db.select().from(baselineChanges).orderBy(desc(baselineChanges.requestedAt)).limit(50),
      db.select().from(snapshots).orderBy(desc(snapshots.lockedAt)).limit(20),
      db.select().from(ruleConfigs).where(eq(ruleConfigs.active, true)).orderBy(desc(ruleConfigs.version)).limit(1),
    ]);

    const projectMilestones = new Map<string, typeof milestoneRows>();
    for (const milestone of milestoneRows) {
      const rows = projectMilestones.get(milestone.projectId) ?? [];
      rows.push(milestone);
      projectMilestones.set(milestone.projectId, rows);
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
      })),
      weeklyReports: reportRows,
      actions: actionRows,
      baselineChanges: baselineRows.map((row) => ({
        ...row,
        changes: JSON.parse(row.changesJson) as unknown,
      })),
      snapshots: snapshotRows.map((row) => ({
        ...row,
        payload: JSON.parse(row.payloadJson) as unknown,
      })),
      activeRule: ruleRows[0] ?? null,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return apiError(error);
  }
}
