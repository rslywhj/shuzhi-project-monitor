import { count, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { portfolioHealthRuns, projects } from "@/db/schema";
import { apiError } from "@/lib/api-utils";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSeeded();
    const db = getDb();
    const [[{ value }], latestRefreshRows] = await Promise.all([
      db
        .select({ value: count() })
        .from(projects)
        .where(eq(projects.lifecycleStatus, "active")),
      db
        .select({
          status: portfolioHealthRuns.status,
          asOfDate: portfolioHealthRuns.asOfDate,
          evaluationWeekKey: portfolioHealthRuns.evaluationWeekKey,
          projectCount: portfolioHealthRuns.projectCount,
          changedProjectCount: portfolioHealthRuns.changedProjectCount,
          completedAt: portfolioHealthRuns.completedAt,
        })
        .from(portfolioHealthRuns)
        .orderBy(desc(portfolioHealthRuns.id))
        .limit(1),
    ]);
    return Response.json({
      status: "ok",
      database: "connected",
      projects: value,
      healthRefresh: latestRefreshRows[0] ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return apiError(error);
  }
}
