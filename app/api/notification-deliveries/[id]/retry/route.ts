import { getDb } from "@/db";
import { auditLogs } from "@/db/schema";
import { ApiRequestError, apiError } from "@/lib/api-utils";
import {
  notificationDeliveryView,
  retryExternalDelivery,
} from "@/lib/notification-delivery";
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
    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ApiRequestError("投递编号无效。");
    }
    const delivery = await retryExternalDelivery(id);
    if (!delivery) throw new ApiRequestError("投递记录不存在。", 404);
    await getDb().insert(auditLogs).values({
      actorEmail: identity.email,
      action: "notification_delivery.retry",
      entityType: "notification_delivery",
      entityId: String(id),
      detailJson: JSON.stringify({
        status: delivery.status,
        attemptCount: delivery.attemptCount,
      }),
    });
    return Response.json(
      { delivery: notificationDeliveryView(delivery) },
      { status: delivery.status === "sent" ? 200 : 202 },
    );
  } catch (error) {
    return apiError(error);
  }
}
