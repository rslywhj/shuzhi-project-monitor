import { count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, notificationChannels } from "@/db/schema";
import { ApiRequestError, apiError } from "@/lib/api-utils";
import {
  maskWebhookUrl,
  validateWebhookUrl,
  WebhookValidationError,
  type NotificationProvider,
} from "@/lib/notification-webhook";
import {
  EmailRecipientValidationError,
  maskEmailRecipients,
  parseStoredEmailRecipients,
  validateEmailRecipients,
} from "@/lib/notification-email-content";
import {
  canAdministerUsers,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const providers = new Set<NotificationProvider>([
  "wecom",
  "dingtalk",
  "generic",
  "email",
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

function safeEmailRecipients(value: unknown) {
  try {
    return validateEmailRecipients(value);
  } catch (error) {
    if (error instanceof EmailRecipientValidationError) {
      throw new ApiRequestError(error.message);
    }
    throw error;
  }
}

function numericId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiRequestError("渠道编号无效。");
  }
  return id;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    if (!canAdministerUsers(identity)) return forbidden();
    const id = numericId((await context.params).id);
    const db = getDb();
    const [existing] = await db
      .select()
      .from(notificationChannels)
      .where(eq(notificationChannels.id, id))
      .limit(1);
    if (!existing) {
      throw new ApiRequestError("通知渠道不存在。", 404);
    }
    const payload = (await request.json()) as {
      name?: unknown;
      provider?: unknown;
      webhookUrl?: unknown;
      emailRecipients?: unknown;
      eventTypes?: unknown;
      active?: unknown;
    };
    const provider =
      payload.provider === undefined
        ? existing.provider
        : typeof payload.provider === "string" &&
            providers.has(payload.provider as NotificationProvider)
          ? (payload.provider as NotificationProvider)
          : null;
    if (!provider) throw new ApiRequestError("请选择有效的渠道类型。");
    const name =
      payload.name === undefined ? existing.name : String(payload.name).trim();
    if (name.length < 2 || name.length > 60) {
      throw new ApiRequestError("渠道名称长度必须为2–60个字符。");
    }
    let events: string[];
    if (payload.eventTypes === undefined) {
      try {
        events = JSON.parse(existing.eventTypesJson) as string[];
      } catch {
        events = [];
      }
    } else {
      events = Array.isArray(payload.eventTypes)
        ? [...new Set(payload.eventTypes.map(String))]
        : [];
    }
    if (
      !events.length ||
      events.some((eventType) => !supportedEvents.has(eventType))
    ) {
      throw new ApiRequestError("请至少选择一种有效的通知事件。");
    }
    const hasNewWebhook =
      typeof payload.webhookUrl === "string" &&
      payload.webhookUrl.trim().length > 0;
    const hasNewEmailRecipients =
      (Array.isArray(payload.emailRecipients) &&
        payload.emailRecipients.length > 0) ||
      (typeof payload.emailRecipients === "string" &&
        payload.emailRecipients.trim().length > 0);
    if (
      provider !== existing.provider &&
      provider !== "email" &&
      !hasNewWebhook
    ) {
      throw new ApiRequestError(
        "变更渠道类型时必须同时填写该类型的新Webhook地址。",
      );
    }
    if (
      provider !== existing.provider &&
      provider === "email" &&
      !hasNewEmailRecipients
    ) {
      throw new ApiRequestError(
        "变更为电子邮件渠道时必须同时填写收件人邮箱。",
      );
    }
    const recipients =
      provider === "email"
        ? hasNewEmailRecipients
          ? safeEmailRecipients(payload.emailRecipients)
          : parseStoredEmailRecipients(existing.emailRecipientsJson)
        : [];
    if (provider === "email" && !recipients.length) {
      throw new ApiRequestError("请至少填写一个收件人邮箱。");
    }
    const webhookUrl =
      provider === "email"
        ? ""
        : hasNewWebhook
          ? safeWebhookUrl(provider, payload.webhookUrl)
          : existing.webhookUrl;
    const active =
      typeof payload.active === "boolean" ? payload.active : existing.active;
    if (active && !existing.active) {
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
      .update(notificationChannels)
      .set({
        name,
        provider,
        webhookUrl,
        emailRecipientsJson: JSON.stringify(recipients),
        eventTypesJson: JSON.stringify(events),
        active,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(notificationChannels.id, id))
      .returning();
    await db.insert(auditLogs).values({
      actorEmail: identity.email,
      action: "notification_channel.update",
      entityType: "notification_channel",
      entityId: String(id),
      detailJson: JSON.stringify({
        name: channel.name,
        provider: channel.provider,
        eventTypes: events,
        active: channel.active,
        webhookChanged:
          hasNewWebhook,
        emailRecipientsChanged: hasNewEmailRecipients,
        recipientCount: recipients.length,
      }),
    });
    return Response.json({
      channel: {
        id: channel.id,
        name: channel.name,
        provider: channel.provider,
        endpointMasked:
          channel.provider === "email"
            ? maskEmailRecipients(recipients)
            : maskWebhookUrl(channel.webhookUrl),
        webhookUrlMasked:
          channel.provider === "email"
            ? ""
            : maskWebhookUrl(channel.webhookUrl),
        emailRecipientsMasked:
          channel.provider === "email"
            ? maskEmailRecipients(recipients)
            : "",
        recipientCount: recipients.length,
        eventTypes: events,
        active: channel.active,
        createdBy: channel.createdBy,
        createdAt: channel.createdAt,
        updatedAt: channel.updatedAt,
      },
    });
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
