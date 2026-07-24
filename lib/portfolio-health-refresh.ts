import { and, eq, lte, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  portfolioHealthRuns,
  projects,
} from "@/db/schema";
import { recalculateProjectHealth } from "@/lib/health";

const STALE_RUN_MS = 15 * 60_000;
const PROJECT_BATCH_SIZE = 5;

export type PortfolioHealthRefreshResult = {
  outcome: "completed" | "already_completed" | "in_progress";
  runKey: string;
  asOfDate: string;
  evaluationWeekKey: string;
  projectCount: number;
  changedProjectCount: number;
};

function chunks<T>(rows: T[], size: number) {
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, index) =>
    rows.slice(index * size, (index + 1) * size),
  );
}

export async function refreshPortfolioHealth(options: {
  asOfDate: string;
  evaluationWeekKey: string;
  trigger: "request" | "cron" | "manual";
  now?: Date;
}): Promise<PortfolioHealthRefreshResult> {
  const db = getDb();
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const runKey = `daily:${options.asOfDate}`;
  const [created] = await db
    .insert(portfolioHealthRuns)
    .values({
      runKey,
      asOfDate: options.asOfDate,
      evaluationWeekKey: options.evaluationWeekKey,
      trigger: options.trigger,
      status: "running",
      startedAt: nowIso,
    })
    .onConflictDoNothing()
    .returning();

  let run = created;
  if (!run) {
    const [existing] = await db
      .select()
      .from(portfolioHealthRuns)
      .where(eq(portfolioHealthRuns.runKey, runKey))
      .limit(1);
    if (!existing) {
      throw new Error("健康度刷新任务创建失败。");
    }
    if (existing.status === "completed") {
      return {
        outcome: "already_completed",
        runKey,
        asOfDate: existing.asOfDate,
        evaluationWeekKey: existing.evaluationWeekKey,
        projectCount: existing.projectCount,
        changedProjectCount: existing.changedProjectCount,
      };
    }
    const staleBefore = new Date(now.getTime() - STALE_RUN_MS).toISOString();
    const [reclaimed] = await db
      .update(portfolioHealthRuns)
      .set({
        trigger: options.trigger,
        status: "running",
        projectCount: 0,
        changedProjectCount: 0,
        errorMessage: "",
        startedAt: nowIso,
        completedAt: null,
      })
      .where(
        and(
          eq(portfolioHealthRuns.id, existing.id),
          or(
            eq(portfolioHealthRuns.status, "failed"),
            and(
              eq(portfolioHealthRuns.status, "running"),
              lte(portfolioHealthRuns.startedAt, staleBefore),
            ),
          ),
        ),
      )
      .returning();
    if (!reclaimed) {
      return {
        outcome: "in_progress",
        runKey,
        asOfDate: existing.asOfDate,
        evaluationWeekKey: existing.evaluationWeekKey,
        projectCount: existing.projectCount,
        changedProjectCount: existing.changedProjectCount,
      };
    }
    run = reclaimed;
  }

  try {
    const projectRows = await db
      .select({
        id: projects.id,
        score: projects.score,
        status: projects.status,
        riskLevel: projects.riskLevel,
        planProgress: projects.planProgress,
        actualProgress: projects.actualProgress,
      })
      .from(projects)
      .where(eq(projects.lifecycleStatus, "active"));
    let changedProjectCount = 0;
    for (const batch of chunks(projectRows, PROJECT_BATCH_SIZE)) {
      const results = await Promise.all(
        batch.map(async (project) => ({
          project,
          health: await recalculateProjectHealth(
            project.id,
            options.evaluationWeekKey,
            {
              touchProject: false,
              asOfDate: options.asOfDate,
            },
          ),
        })),
      );
      changedProjectCount += results.filter(({ project, health }) => {
        if (!health) return false;
        return (
          health.score !== project.score ||
          health.status !== project.status ||
          health.riskLevel !== project.riskLevel ||
          health.progress.plan !== project.planProgress ||
          health.progress.actual !== project.actualProgress
        );
      }).length;
    }
    const completedAt = new Date().toISOString();
    await db.batch([
      db
        .update(portfolioHealthRuns)
        .set({
          status: "completed",
          projectCount: projectRows.length,
          changedProjectCount,
          errorMessage: "",
          completedAt,
        })
        .where(eq(portfolioHealthRuns.id, run.id)),
      db.insert(auditLogs).values({
        actorEmail:
          options.trigger === "manual"
            ? "system:manual-health-refresh"
            : "system:portfolio-automation",
        action: "automation.health_refresh",
        entityType: "reporting_period",
        entityId: runKey,
        detailJson: JSON.stringify({
          trigger: options.trigger,
          asOfDate: options.asOfDate,
          evaluationWeekKey: options.evaluationWeekKey,
          projectCount: projectRows.length,
          changedProjectCount,
        }),
      }),
    ]);
    return {
      outcome: "completed",
      runKey,
      asOfDate: options.asOfDate,
      evaluationWeekKey: options.evaluationWeekKey,
      projectCount: projectRows.length,
      changedProjectCount,
    };
  } catch (error) {
    await db
      .update(portfolioHealthRuns)
      .set({
        status: "failed",
        errorMessage:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "健康度刷新失败。",
        completedAt: new Date().toISOString(),
      })
      .where(eq(portfolioHealthRuns.id, run.id));
    throw error;
  }
}
