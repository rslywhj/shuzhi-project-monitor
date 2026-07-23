import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { baselineVersions, milestones, projects } from "@/db/schema";
import { apiError } from "@/lib/api-utils";
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
    const [projectRows, milestoneRows, originalBaselineRows] = await Promise.all([
      db.select().from(projects).orderBy(asc(projects.code)),
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
    ]);
    const url = new URL(request.url);
    const analytics = buildPortfolioAnalytics({
      projects: projectRows,
      milestones: milestoneRows,
      originalBaselines: originalBaselineRows,
      filters: analyticsFilters(url),
    });
    if (url.searchParams.get("format") === "csv") {
      const timestamp = new Date().toISOString().slice(0, 10);
      return new Response(`\uFEFF${portfolioAnalyticsCsv(analytics.projects)}`, {
        headers: {
          "cache-control": "no-store",
          "content-disposition": `attachment; filename="portfolio-analytics-${timestamp}.csv"`,
          "content-type": "text/csv; charset=utf-8",
        },
      });
    }
    return Response.json({
      ...analytics,
      filters: analyticsFilters(url),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return apiError(error);
  }
}
