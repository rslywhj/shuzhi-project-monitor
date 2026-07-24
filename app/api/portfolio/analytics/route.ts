import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  baselineVersions,
  correctiveActions,
  milestones,
  projects,
  risks,
  weeklyReports,
} from "@/db/schema";
import { apiError } from "@/lib/api-utils";
import { buildPortfolioDelayForecast } from "@/lib/delay-forecast";
import {
  buildPortfolioAnalytics,
  portfolioAnalyticsCsv,
  type PortfolioAnalyticsFilters,
} from "@/lib/portfolio-analytics";
import { ensureSeeded } from "@/lib/seed";
import { getRequestIdentity, unauthorized } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

function analyticsFilters(url: URL): PortfolioAnalyticsFilters {
  const status = url.searchParams.get("status")?.trim();
  return {
    org: url.searchParams.get("org")?.trim() || undefined,
    type: url.searchParams.get("type")?.trim() || undefined,
    owner: url.searchParams.get("owner")?.trim() || undefined,
    status:
      status === "green" || status === "yellow" || status === "red"
        ? status
        : undefined,
  };
}

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    await ensureSeeded();
    const db = getDb();
    const [
      allProjectRows,
      milestoneRows,
      originalBaselineRows,
      reportRows,
      riskRows,
      actionRows,
    ] = await Promise.all([
      db
        .select()
        .from(projects)
        .orderBy(asc(projects.code)),
      db
        .select()
        .from(milestones)
        .orderBy(asc(milestones.projectId), asc(milestones.sequence)),
      db
        .select({
          projectId: baselineVersions.projectId,
          milestoneJson: baselineVersions.milestoneJson,
        })
        .from(baselineVersions)
        .where(eq(baselineVersions.version, 1)),
      db.select().from(weeklyReports),
      db.select().from(risks),
      db.select().from(correctiveActions),
    ]);
    const url = new URL(request.url);
    const projectRows = allProjectRows.filter(
      (project) => project.lifecycleStatus === "active",
    );
    const analytics = buildPortfolioAnalytics({
      projects: projectRows,
      milestones: milestoneRows,
      originalBaselines: originalBaselineRows,
      filters: analyticsFilters(url),
    });
    const delayForecast = buildPortfolioDelayForecast({
      projects: allProjectRows,
      milestones: milestoneRows,
      weeklyReports: reportRows,
      risks: riskRows,
      actions: actionRows,
      asOfDate: new Date().toISOString().slice(0, 10),
      scopeProjectIds: new Set(
        analytics.projects.map((project) => project.id),
      ),
    });
    if (url.searchParams.get("format") === "csv") {
      const timestamp = new Date().toISOString().slice(0, 10);
      return new Response(
        `\uFEFF${portfolioAnalyticsCsv(
          analytics.projects,
          delayForecast.projects,
        )}`,
        {
        headers: {
          "cache-control": "no-store",
          "content-disposition": `attachment; filename="portfolio-analytics-${timestamp}.csv"`,
          "content-type": "text/csv; charset=utf-8",
        },
        },
      );
    }
    return Response.json({
      ...analytics,
      delayForecast,
      filters: analyticsFilters(url),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return apiError(error);
  }
}
