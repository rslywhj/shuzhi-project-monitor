import { apiError, requiredWeekKey } from "@/lib/api-utils";
import { ensureSeeded } from "@/lib/seed";
import {
  canManagePortfolio,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";
import { lockPortfolioSnapshot } from "@/lib/snapshot-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    if (!canManagePortfolio(identity)) return forbidden();
    await ensureSeeded();

    const payload = (await request.json()) as { weekKey?: string };
    const weekKey = requiredWeekKey(payload.weekKey, "快照周期");
    const result = await lockPortfolioSnapshot({
      weekKey,
      actorEmail: identity.email,
      source: "manual",
    });
    if (result.outcome === "already_locked") {
      return Response.json(
        { error: "该周已有锁定快照，请先填写原因并重新打开。" },
        { status: 409 },
      );
    }
    return Response.json({ snapshot: result.snapshot }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
