import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, notificationChannels } from "@/db/schema";
import { ApiRequestError, apiError } from "@/lib/api-utils";
import {
  notificationDeliveryView,
  queueChannelTest,
} from "@/lib/notification-delivery";
import {
  canAdministerUsers,
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
    if (!canAdministerUsers(identity)) return forbidden();
    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ApiRequestError("渠道编号无效。");
    }
    const db = getDb();
    const [channel] = await db
      .select()
      .from(notificationChannels)
      .where(eq(notificationChannels.id, id))
      .limit(1);
    if (!channel) throw new ApiRequestError("通知渠道不存在。", 404);
    if (!channel.active) {
      throw new ApiRequestError("请先启用渠道再执行测试。", 409);
    }
    const delivery = await queueChannelTest(id, identity.email);
    await db.insert(auditLogs).values({
      actorEmail: identity.email,
      action: "notification_channel.test",
      entityType: "notification_channel",
      entityId: String(id),
      detailJson: JSON.stringify({
        deliveryId: delivery?.id ?? null,
        status: delivery?.status ?? "unknown",
      }),
    });
    return Response.json(
      { delivery: delivery ? notificationDeliveryView(delivery) : null },
      { status: delivery?.status === "sent" ? 200 : 202 },
    );
  } catch (error) {
    return apiError(error);
  }
}
