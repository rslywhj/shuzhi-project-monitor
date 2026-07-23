import { desc, eq, sql } from "drizzle-orm";
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

    await db.batch([
      db
        .update(snapshots)
        .set({ status: "reopened" })
        .where(eq(snapshots.id, snapshotId)),
      db
        .update(weeklyReports)
        .set({ status: "submitted", submittedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(weeklyReports.weekKey, snapshot.weekKey)),
      db.insert(auditLogs).values({
        actorEmail: identity.email,
        action: "snapshot.reopen",
        entityType: "snapshot",
        entityId: String(snapshotId),
        detailJson: JSON.stringify({
          weekKey: snapshot.weekKey,
          version: snapshot.version,
          reason,
        }),
      }),
    ]);
    return Response.json({
      snapshot: { ...snapshot, status: "reopened" },
      reason,
    });
  } catch (error) {
    return apiError(error);
  }
}
