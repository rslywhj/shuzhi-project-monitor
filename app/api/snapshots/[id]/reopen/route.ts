import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, snapshots, weeklyReports } from "@/db/schema";
import { ApiRequestError, apiError, requiredString } from "@/lib/api-utils";
import {
  canManagePortfolio,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    if (!canManagePortfolio(identity)) return forbidden();
    const { id } = await context.params;
    const snapshotId = Number(id);
    if (!Number.isInteger(snapshotId) || snapshotId < 1) {
      throw new ApiRequestError("快照编号无效。");
    }
    const payload = (await request.json()) as { reason?: string };
    const reason = requiredString(payload.reason, "重新打开原因");

    const db = getDb();
    const [snapshot] = await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.id, snapshotId))
      .limit(1);
    if (!snapshot) {
      return Response.json({ error: "未找到指定快照。" }, { status: 404 });
    }
    const [latest] = await db
      .select({ id: snapshots.id })
      .from(snapshots)
      .where(eq(snapshots.weekKey, snapshot.weekKey))
      .orderBy(desc(snapshots.version))
      .limit(1);
    if (latest?.id !== snapshot.id) {
      return Response.json(
        { error: "只能重新打开该周期的最新快照版本。" },
        { status: 409 },
      );
    }
    if (snapshot.status !== "locked") {
      return Response.json({ error: "该快照已经处于重新打开状态。" }, { status: 409 });
    }

    const reopenedAt = new Date().toISOString();
    const reopenEventId = crypto.randomUUID();
    const claimedByThisRequest = sql`EXISTS (
      SELECT 1
      FROM ${snapshots}
      WHERE ${snapshots.id} = ${snapshotId}
        AND ${snapshots.reopenEventId} = ${reopenEventId}
    )`;
    const auditInsert = db.insert(auditLogs).select(
      db
        .select({
          id: sql<number>`NULL`.as("id"),
          actorEmail: sql<string>`${identity.email}`.as("actor_email"),
          action: sql<string>`'snapshot.reopen'`.as("action"),
          entityType: sql<string>`'snapshot'`.as("entity_type"),
          entityId: sql<string>`${String(snapshotId)}`.as("entity_id"),
          detailJson: sql<string>`${JSON.stringify({
            weekKey: snapshot.weekKey,
            version: snapshot.version,
            reason,
            reopenEventId,
          })}`.as("detail_json"),
          createdAt: sql<string>`${reopenedAt}`.as("created_at"),
        })
        .from(snapshots)
        .where(
          and(
            eq(snapshots.id, snapshotId),
            eq(snapshots.reopenEventId, reopenEventId),
          ),
        ),
    );
    const batchResults = await db.batch([
      db
        .update(snapshots)
        .set({
          status: "reopened",
          reopenEventId,
          reopenedBy: identity.email,
          reopenedAt,
          reopenReason: reason,
        })
        .where(
          and(
            eq(snapshots.id, snapshotId),
            eq(snapshots.status, "locked"),
          ),
        )
        .returning(),
      db
        .update(weeklyReports)
        .set({ status: "submitted" })
        .where(
          and(
            eq(weeklyReports.weekKey, snapshot.weekKey),
            eq(weeklyReports.status, "locked"),
            claimedByThisRequest,
          ),
        ),
      auditInsert,
    ]);
    const claimedRows = batchResults[0] as
      | (typeof snapshots.$inferSelect)[]
      | undefined;
    const reopenedSnapshot = claimedRows?.[0];
    if (!reopenedSnapshot) {
      return Response.json(
        { error: "该快照已被其他操作重新打开。" },
        { status: 409 },
      );
    }
    return Response.json({
      snapshot: reopenedSnapshot,
      reason,
    });
  } catch (error) {
    return apiError(error);
  }
}
