import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import {
  baselineChanges,
  correctiveActions,
  milestones,
  risks,
} from "@/db/schema";

export type ProjectLifecycleStatus = "active" | "completed" | "archived";

export function projectLifecycleLocked(
  project: { lifecycleStatus: ProjectLifecycleStatus },
) {
  return project.lifecycleStatus !== "active";
}

export function lifecycleLockedResponse(
  project: { lifecycleStatus: ProjectLifecycleStatus },
) {
  const label =
    project.lifecycleStatus === "completed" ? "已结项" : "已归档";
  return Response.json(
    { error: `项目${label}，请先恢复为在建状态后再修改业务数据。` },
    { status: 409 },
  );
}

export async function loadProjectClosureState(
  db: ReturnType<typeof getDb>,
  projectId: string,
) {
  const [milestoneRows, riskRows, actionRows, changeRows] = await Promise.all([
    db
      .select({
        id: milestones.id,
        name: milestones.name,
        completion: milestones.completion,
      })
      .from(milestones)
      .where(
        and(
          eq(milestones.projectId, projectId),
          eq(milestones.applicable, true),
        ),
      ),
    db
      .select({ id: risks.id })
      .from(risks)
      .where(and(eq(risks.projectId, projectId), ne(risks.status, "closed"))),
    db
      .select({ id: correctiveActions.id })
      .from(correctiveActions)
      .where(
        and(
          eq(correctiveActions.projectId, projectId),
          ne(correctiveActions.status, "completed"),
        ),
      ),
    db
      .select({ id: baselineChanges.id })
      .from(baselineChanges)
      .where(
        and(
          eq(baselineChanges.projectId, projectId),
          eq(baselineChanges.status, "pending"),
        ),
      ),
  ]);
  const incompleteMilestones = milestoneRows.filter(
    (milestone) => milestone.completion < 100,
  );
  return {
    incompleteMilestoneCount: incompleteMilestones.length,
    incompleteMilestones: incompleteMilestones.slice(0, 5),
    openRiskCount: riskRows.length,
    openActionCount: actionRows.length,
    pendingBaselineCount: changeRows.length,
    clear:
      incompleteMilestones.length === 0 &&
      riskRows.length === 0 &&
      actionRows.length === 0 &&
      changeRows.length === 0,
  };
}
