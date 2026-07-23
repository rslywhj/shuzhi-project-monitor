import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, baselineChanges } from "@/db/schema";
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
    const changeId = Number(id);
    if (!Number.isInteger(changeId) || changeId < 1) {
      throw new ApiRequestError("基线变更申请编号无效。");
    }
    const payload = (await request.json()) as { reason?: string };
    const reason = requiredString(payload.reason, "驳回原因");
    const db = getDb();
    const [existing] = await db
      .select()
      .from(baselineChanges)
      .where(eq(baselineChanges.id, changeId))
      .limit(1);
    if (!existing) {
      return Response.json({ error: "未找到基线变更申请。" }, { status: 404 });
    }
    if (existing.status !== "pending") {
      return Response.json({ error: "该申请已经处理，不能重复审批。" }, { status: 409 });
    }
    const [change] = await db
      .update(baselineChanges)
      .set({
        status: "rejected",
        rejectedBy: identity.email,
        rejectedAt: sql`CURRENT_TIMESTAMP`,
        rejectionReason: reason,
      })
      .where(
        and(
          eq(baselineChanges.id, changeId),
          eq(baselineChanges.status, "pending"),
        ),
      )
      .returning();
    if (!change) {
      return Response.json(
        { error: "该申请已被其他审批操作处理。" },
        { status: 409 },
      );
    }
    await db.insert(auditLogs).values({
      actorEmail: identity.email,
      action: "baseline_change.reject",
      entityType: "baseline_change",
      entityId: String(changeId),
      detailJson: JSON.stringify({
        projectId: existing.projectId,
        reason,
      }),
    });
    return Response.json({ change });
  } catch (error) {
    return apiError(error);
  }
}
