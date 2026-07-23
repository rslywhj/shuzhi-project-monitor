import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs } from "@/db/schema";
import { apiError } from "@/lib/api-utils";
import {
  canManagePortfolio,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    if (!canManagePortfolio(identity)) return forbidden();

    const url = new URL(request.url);
    const entityType = url.searchParams.get("entityType")?.trim();
    const entityId = url.searchParams.get("entityId")?.trim();
    const requestedLimit = Number(url.searchParams.get("limit") ?? 100);
    const limit = Math.min(200, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 100));
    const filters = [
      entityType ? eq(auditLogs.entityType, entityType) : undefined,
      entityId ? eq(auditLogs.entityId, entityId) : undefined,
    ].filter(Boolean);

    const rows = await getDb()
      .select()
      .from(auditLogs)
      .where(filters.length ? and(...filters) : sql`1 = 1`)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
    return Response.json({
      auditLogs: rows.map((row) => ({
        ...row,
        detail: JSON.parse(row.detailJson) as unknown,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
