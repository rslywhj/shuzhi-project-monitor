import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { snapshots } from "@/db/schema";
import { apiError } from "@/lib/api-utils";
import { shanghaiDateIso } from "@/lib/date-time";
import {
  buildPortfolioTrends,
  portfolioTrendCsv,
  type TrendFilters,
} from "@/lib/portfolio-trends";
import { getRequestIdentity, unauthorized } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

function trendFilters(url: URL): TrendFilters {
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
    const url = new URL(request.url);
    const requestedWeeks = Number(url.searchParams.get("weeks") ?? 12);
    const weekLimit = Math.min(
      52,
      Math.max(4, Number.isFinite(requestedWeeks) ? requestedWeeks : 12),
    );
    const rows = await getDb()
      .select()
      .from(snapshots)
      .where(eq(snapshots.status, "locked"))
      .orderBy(desc(snapshots.lockedAt), desc(snapshots.version))
      .limit(200);
    const latestByWeek = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (!latestByWeek.has(row.weekKey)) {
        latestByWeek.set(row.weekKey, row);
      }
    }
    const selectedSnapshots = [...latestByWeek.values()]
      .sort((left, right) => right.weekKey.localeCompare(left.weekKey))
      .slice(0, weekLimit);
    const trends = buildPortfolioTrends({
      snapshots: selectedSnapshots,
      filters: trendFilters(url),
    });
    if (url.searchParams.get("format") === "csv") {
      const timestamp = shanghaiDateIso();
      return new Response(`\uFEFF${portfolioTrendCsv(trends.projectHistory)}`, {
        headers: {
          "cache-control": "no-store",
          "content-disposition": `attachment; filename="portfolio-trends-${timestamp}.csv"`,
          "content-type": "text/csv; charset=utf-8",
        },
      });
    }
    return Response.json({
      ...trends,
      filters: trendFilters(url),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return apiError(error);
  }
}
