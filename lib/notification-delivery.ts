import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { getDb } from "@/db";
import {
  notificationChannels,
  notificationDeliveries,
} from "@/db/schema";
import {
  sendWebhook,
  type NotificationEventType,
} from "@/lib/notification-webhook";
import { sendEmailNotification } from "@/lib/notification-email";
import { parseStoredEmailRecipients } from "@/lib/notification-email-content";

export type ExternalNotificationEvent = {
  projectId: string;
  eventType: "report_reminder" | "red_escalation";
  referenceKey: string;
  title: string;
  message: string;
  severity: "warning" | "critical";
};

const RETRY_DELAYS_MS = [5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
const MAX_CHANNELS = 10;

function chunks<T>(rows: T[], size: number) {
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, index) =>
    rows.slice(index * size, (index + 1) * size),
  );
}

function safeEventTypes(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is ExternalNotificationEvent["eventType"] =>
            item === "report_reminder" || item === "red_escalation",
        )
      : [];
  } catch {
    return [];
  }
}

export function notificationDeliveryView(delivery: {
  id: number;
  channelId: number;
  projectId: string | null;
  eventType: NotificationEventType;
  referenceKey: string;
  title: string;
  status: "pending" | "sending" | "sent" | "failed";
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  responseStatus: number | null;
  errorMessage: string;
  createdAt: string;
  sentAt: string | null;
}) {
  return {
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
  };
}

export async function queueExternalNotifications(
  events: ExternalNotificationEvent[],
  actorEmail: string,
) {
  if (!events.length) return { channelCount: 0, queued: 0 };
  const db = getDb();
  const channels = (
    await db
      .select()
      .from(notificationChannels)
      .where(eq(notificationChannels.active, true))
      .orderBy(asc(notificationChannels.id))
      .limit(MAX_CHANNELS)
  ).filter((channel) => {
    const accepted = safeEventTypes(channel.eventTypesJson);
    return events.some((event) => accepted.includes(event.eventType));
  });
  if (!channels.length) return { channelCount: 0, queued: 0 };
  const rows = channels.flatMap((channel) => {
    const accepted = safeEventTypes(channel.eventTypesJson);
    return events
      .filter((event) => accepted.includes(event.eventType))
      .map((event) => ({
        channelId: channel.id,
        projectId: event.projectId,
        eventType: event.eventType,
        referenceKey: event.referenceKey,
        dedupKey: `${channel.id}:${event.eventType}:${event.projectId}:${event.referenceKey}`,
        title: event.title,
        message: event.message,
        severity: event.severity,
        createdBy: actorEmail,
      }));
  });
  const created: Array<{ id: number }> = [];
  for (const batch of chunks(rows, 10)) {
    created.push(
      ...(await db
        .insert(notificationDeliveries)
        .values(batch)
        .onConflictDoNothing()
        .returning({ id: notificationDeliveries.id })),
    );
  }
  return { channelCount: channels.length, queued: created.length };
}

async function recoverStaleDeliveries(nowIso: string) {
  const staleBefore = new Date(Date.parse(nowIso) - 10 * 60_000).toISOString();
  await getDb()
    .update(notificationDeliveries)
    .set({
      status: "failed",
      nextAttemptAt: nowIso,
      errorMessage: "上次投递进程超时，已自动恢复到重试队列。",
      updatedAt: nowIso,
    })
    .where(
      and(
        eq(notificationDeliveries.status, "sending"),
        lte(notificationDeliveries.updatedAt, staleBefore),
      ),
    );
}

export async function processExternalDelivery(deliveryId: number) {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const [claimed] = await db
    .update(notificationDeliveries)
    .set({ status: "sending", updatedAt: nowIso })
    .where(
      and(
        eq(notificationDeliveries.id, deliveryId),
        inArray(notificationDeliveries.status, ["pending", "failed"]),
        sql`${notificationDeliveries.attemptCount} < ${notificationDeliveries.maxAttempts}`,
      ),
    )
    .returning();
  if (!claimed) return null;
  const [channel] = await db
    .select()
    .from(notificationChannels)
    .where(eq(notificationChannels.id, claimed.channelId))
    .limit(1);
  const attemptCount = claimed.attemptCount + 1;
  if (!channel || !channel.active) {
    const [failed] = await db
      .update(notificationDeliveries)
      .set({
        status: "failed",
        attemptCount,
        nextAttemptAt: null,
        errorMessage: "渠道不存在或已停用。",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(notificationDeliveries.id, claimed.id))
      .returning();
    return failed;
  }

  try {
    const result =
      channel.provider === "email"
        ? await sendEmailNotification({
            recipients: parseStoredEmailRecipients(
              channel.emailRecipientsJson,
            ),
            delivery: claimed,
          })
        : await sendWebhook({
            provider: channel.provider,
            webhookUrl: channel.webhookUrl,
            delivery: claimed,
          });
    if (result.ok) {
      const finishedAt = new Date().toISOString();
      const [sent] = await db
        .update(notificationDeliveries)
        .set({
          status: "sent",
          attemptCount,
          nextAttemptAt: null,
          responseStatus: result.responseStatus,
          responseBody: result.responseBody,
          errorMessage: "",
          sentAt: finishedAt,
          updatedAt: finishedAt,
        })
        .where(eq(notificationDeliveries.id, claimed.id))
        .returning();
      return sent;
    }
    throw new Error(
      `渠道返回失败状态（HTTP ${result.responseStatus}）。`,
    );
  } catch (error) {
    const finalAttempt = attemptCount >= claimed.maxAttempts;
    const retryDelay =
      RETRY_DELAYS_MS[
        Math.min(attemptCount - 1, RETRY_DELAYS_MS.length - 1)
      ];
    const [failed] = await db
      .update(notificationDeliveries)
      .set({
        status: "failed",
        attemptCount,
        nextAttemptAt: finalAttempt
          ? null
          : new Date(Date.now() + retryDelay).toISOString(),
        errorMessage:
          error instanceof Error &&
          (error.message.startsWith("渠道返回失败状态") ||
            error.message.startsWith("电子邮件"))
            ? error.message
            : "网络请求失败或超时，系统将按退避策略重试。",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(notificationDeliveries.id, claimed.id))
      .returning();
    return failed;
  }
}

export async function processDueExternalDeliveries(limit = 20) {
  const nowIso = new Date().toISOString();
  await recoverStaleDeliveries(nowIso);
  const due = await getDb()
    .select({ id: notificationDeliveries.id })
    .from(notificationDeliveries)
    .where(
      and(
        inArray(notificationDeliveries.status, ["pending", "failed"]),
        or(
          isNull(notificationDeliveries.nextAttemptAt),
          lte(notificationDeliveries.nextAttemptAt, nowIso),
        ),
        sql`${notificationDeliveries.attemptCount} < ${notificationDeliveries.maxAttempts}`,
      ),
    )
    .orderBy(
      asc(notificationDeliveries.nextAttemptAt),
      asc(notificationDeliveries.createdAt),
    )
    .limit(Math.min(50, Math.max(1, limit)));
  const results = [];
  for (const batch of chunks(due, 4)) {
    results.push(
      ...(await Promise.all(
        batch.map((delivery) => processExternalDelivery(delivery.id)),
      )),
    );
  }
  return {
    processed: results.filter(Boolean).length,
    sent: results.filter((result) => result?.status === "sent").length,
    failed: results.filter((result) => result?.status === "failed").length,
  };
}

export async function queueChannelTest(
  channelId: number,
  actorEmail: string,
) {
  const db = getDb();
  const referenceKey = `test:${crypto.randomUUID()}`;
  const [delivery] = await db
    .insert(notificationDeliveries)
    .values({
      channelId,
      projectId: null,
      eventType: "test",
      referenceKey,
      dedupKey: `${channelId}:test:${referenceKey}`,
      title: "进度监控平台渠道测试",
      message:
        "这是一条由系统管理员发起的测试消息。收到此消息表示渠道配置和网络投递均正常。",
      severity: "info",
      createdBy: actorEmail,
    })
    .returning();
  return processExternalDelivery(delivery.id);
}

export async function retryExternalDelivery(deliveryId: number) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.id, deliveryId))
    .limit(1);
  if (!existing) return null;
  if (existing.status !== "failed") return existing;
  const [updated] = await db
    .update(notificationDeliveries)
    .set({
      status: "pending",
      maxAttempts: Math.max(existing.maxAttempts, existing.attemptCount + 1),
      nextAttemptAt: null,
      errorMessage: "",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(notificationDeliveries.id, deliveryId))
    .returning();
  return processExternalDelivery(updated.id);
}
