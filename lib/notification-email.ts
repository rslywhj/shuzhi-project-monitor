import { EmailMessage } from "cloudflare:email";
import { env } from "cloudflare:workers";
import {
  buildRawNotificationEmail,
  validateEmailRecipients,
} from "@/lib/notification-email-content";
import type { WebhookDelivery } from "@/lib/notification-webhook";

const DEFAULT_EMAIL_FROM = "notifications@dougge.top";

export async function sendEmailNotification(options: {
  recipients: string[];
  delivery: WebhookDelivery;
}) {
  const recipients = validateEmailRecipients(options.recipients);
  const runtime = env as unknown as {
    EMAIL?: SendEmail;
    APP_EMAIL_FROM?: string;
  };
  if (!runtime.EMAIL) {
    throw new Error("电子邮件发送服务尚未启用。");
  }
  const from = String(runtime.APP_EMAIL_FROM ?? DEFAULT_EMAIL_FROM)
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@dougge\.top$/.test(from)) {
    throw new Error("电子邮件发件人配置无效。");
  }
  try {
    for (const recipient of recipients) {
      await runtime.EMAIL.send(
        new EmailMessage(
          from,
          recipient,
          buildRawNotificationEmail(from, recipient, options.delivery),
        ),
      );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message.toLowerCase() : "";
    if (
      message.includes("destination") ||
      message.includes("recipient") ||
      message.includes("verified address")
    ) {
      throw new Error(
        "电子邮件收件地址尚未在Cloudflare Email Routing中验证。",
      );
    }
    if (message.includes("sender") || message.includes("from address")) {
      throw new Error(
        "电子邮件发件地址尚未在Cloudflare Email Routing中启用。",
      );
    }
    throw new Error("电子邮件投递被Cloudflare Email Routing拒绝。");
  }
  return {
    ok: true,
    responseStatus: 202,
    responseBody: JSON.stringify({ recipients: recipients.length }),
  };
}
