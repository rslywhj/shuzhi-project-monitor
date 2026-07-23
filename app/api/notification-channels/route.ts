import { asc, count, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  notificationChannels,
  notificationDeliveries,
} from "@/db/schema";
import {
  ApiRequestError,
  apiError,
  requiredString,
} from "@/lib/api-utils";
import {
  maskWebhookUrl,
  validateWebhookUrl,
  WebhookValidationError,
  type NotificationProvider,
} from "@/lib/notification-webhook";
import {
  canAdministerUsers,
  canManagePortfolio,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const providers = new Set<NotificationProvider>([
  "wecom",
  "dingtalk",
  "generic",
]);
const supportedEvents = new Set(["report_reminder", "red_escalation"]);
const MAX_ACTIVE_CHANNELS = 10;

function safeWebhookUrl(
  provider: NotificationProvider,
  value: unknown,
) {
  try {
    return validateWebhookUrl(provider, value);
  } catch (error) {
    if (error instanceof WebhookValidationError) {
      throw new ApiRequestError(error.message);
    }
    throw error;
  }
}

function eventTypes(value: unknown) {
  const rows = Array.isArray(value)
    ? [...new Set(value.map((item) => String(item)))]
    : [];
  if (
    !rows.length ||
    rows.some((eventType) => !supportedEvents.has(eventType))
  ) {
    throw new ApiRequestError("请至少选择一种有效的通知事件。");
  }
  return rows as Array<"report_reminder" | "red_escalation">;
}

function parseEventTypes(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    if (!canManagePortfolio(identity)) return forbidden();
    const db = getDb();
    const [channelRows, deliveryRows] = await Promise.all([
      db
        .select()
        .from(notificationChannels)
        .orderBy(asc(notificationChannels.name)),
      db
        .select({
          id: notificationDeliveries.id,
          channelId: notificationDeliveries.channelId,
          projectId: notificationDeliveries.projectId,
          eventType: notificationDeliveries.eventType,
          referenceKey: notificationDeliveries.referenceKey,
          title: notificationDeliveries.title,
          status: notificationDeliveries.status,
          attemptCount: notificationDeliveries.attemptCount,
          maxAttempts: notificationDeliveries.maxAttempts,
          nextAttemptAt: notificationDeliveries.nextAttemptAt,
          responseStatus: notificationDeliveries.responseStatus,
          errorMessage: notificationDeliveries.errorMessage,
          createdAt: notificationDeliveries.createdAt,
          sentAt: notificationDeliveries.sentAt,
        })
        .from(notificationDeliveries)
        .orderBy(
          desc(notificationDeliveries.createdAt),
          desc(notificationDeliveries.id),
        )
        .limit(100),
    ]);
    const channelNames = new Map(
      channelRows.map((channel) => [channel.id, channel.name]),
    );
    return Response.json({
      channels: channelRows.map((channel) => ({
        id: channel.id,
        name: channel.name,
        provider: channel.provider,
        webhookUrlMasked: maskWebhookUrl(channel.webhookUrl),
        eventTypes: parseEventTypes(channel.eventTypesJson),
        active: channel.active,
        createdBy: channel.createdBy,
        createdAt: channel.createdAt,
        updatedAt: channel.updatedAt,
      })),
      deliveries: deliveryRows.map((delivery) => ({
        id: delivery.id,
        channelId: delivery.channelId,
        projectId: delivery.projectId,
        eventType: delivery.eventType,
        referenceKey: delivery.referenceKey,
        title: delivery.title,
        status: delivery.status,
        attemptCount: delivery.attemptCount,
        maxAttempts: delivery.maxAttempts,
        nextAttemptAt: delivery.nextAttemptAt,
        responseStatus: delivery.responseStatus,
        errorMessage: delivery.errorMessage,
        createdAt: delivery.createdAt,
        sentAt: delivery.sentAt,
        channelName:
          channelNames.get(delivery.channelId) ?? `渠道#${delivery.channelId}`,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    if (!canAdministerUsers(identity)) return forbidden();
    const payload = (await request.json()) as {
      name?: unknown;
      provider?: unknown;
      webhookUrl?: unknown;
      eventTypes?: unknown;
      active?: unknown;
    };
    const name = requiredString(payload.name, "渠道名称");
    if (name.length < 2 || name.length > 60) {
      throw new ApiRequestError("渠道名称长度必须为2–60个字符。");
    }
    const provider =
      typeof payload.provider === "string" &&
      providers.has(payload.provider as NotificationProvider)
        ? (payload.provider as NotificationProvider)
        : null;
    if (!provider) throw new ApiRequestError("请选择有效的渠道类型。");
    const webhookUrl = safeWebhookUrl(provider, payload.webhookUrl);
    const events = eventTypes(payload.eventTypes);
    const db = getDb();
    const active = payload.active !== false;
    if (active) {
      const [{ value: activeCount }] = await db
        .select({ value: count() })
        .from(notificationChannels)
        .where(eq(notificationChannels.active, true));
      if (activeCount >= MAX_ACTIVE_CHANNELS) {
        throw new ApiRequestError(
          `最多同时启用${MAX_ACTIVE_CHANNELS}个外部通知渠道。`,
          409,
        );
      }
    }
    const [channel] = await db
      .insert(notificationChannels)
      .values({
        name,
        provider,
        webhookUrl,
        eventTypesJson: JSON.stringify(events),
        active,
        createdBy: identity.email,
      })
      .returning();
    await db.insert(auditLogs).values({
      actorEmail: identity.email,
      action: "notification_channel.create",
      entityType: "notification_channel",
      entityId: String(channel.id),
      detailJson: JSON.stringify({
        name,
        provider,
        eventTypes: events,
        active: channel.active,
      }),
    });
    return Response.json(
      {
        channel: {
          id: channel.id,
          name: channel.name,
          provider: channel.provider,
          webhookUrlMasked: maskWebhookUrl(channel.webhookUrl),
          eventTypes: events,
          active: channel.active,
          createdBy: channel.createdBy,
          createdAt: channel.createdAt,
          updatedAt: channel.updatedAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      message.includes(
        "UNIQUE constraint failed: notification_channels.name",
      )
    ) {
      return Response.json(
        { error: "渠道名称已存在，请使用其他名称。" },
        { status: 409 },
      );
    }
    return apiError(error);
  }
}
