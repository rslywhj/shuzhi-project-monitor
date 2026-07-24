import type { WebhookDelivery } from "@/lib/notification-webhook";

const MAX_EMAIL_RECIPIENTS = 20;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class EmailRecipientValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailRecipientValidationError";
  }
}

export function validateEmailRecipients(value: unknown) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\s,;]+/)
      : [];
  const recipients = [
    ...new Set(
      source
        .map((item) => String(item).trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (!recipients.length) {
    throw new EmailRecipientValidationError("请至少填写一个收件人邮箱。");
  }
  if (recipients.length > MAX_EMAIL_RECIPIENTS) {
    throw new EmailRecipientValidationError(
      `单个邮件渠道最多配置${MAX_EMAIL_RECIPIENTS}个收件人。`,
    );
  }
  if (
    recipients.some(
      (recipient) =>
        recipient.length > 254 ||
        recipient.includes("\r") ||
        recipient.includes("\n") ||
        !EMAIL_PATTERN.test(recipient),
    )
  ) {
    throw new EmailRecipientValidationError("收件人邮箱格式无效。");
  }
  return recipients;
}

export function parseStoredEmailRecipients(value: string) {
  try {
    return validateEmailRecipients(JSON.parse(value));
  } catch {
    return [];
  }
}

function maskEmail(value: string) {
  const [local, domain] = value.split("@");
  const visible =
    local.length <= 2
      ? `${local[0] ?? "*"}*`
      : `${local.slice(0, 2)}${"*".repeat(Math.min(4, local.length - 2))}`;
  return `${visible}@${domain}`;
}

export function maskEmailRecipients(recipients: string[]) {
  if (!recipients.length) return "未配置收件人";
  const visible = recipients.slice(0, 2).map(maskEmail).join("、");
  return recipients.length > 2
    ? `${visible} 等${recipients.length}人`
    : visible;
}

function base64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function wrapBase64(value: string) {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

export function buildRawNotificationEmail(
  from: string,
  to: string,
  delivery: WebhookDelivery,
) {
  const senderName = `=?UTF-8?B?${base64Utf8("数智项目监控")}?=`;
  const subject = `=?UTF-8?B?${base64Utf8(`[数智项目监控] ${delivery.title}`)}?=`;
  const body = [
    delivery.title,
    "",
    delivery.message,
    "",
    `事件：${delivery.eventType}`,
    `级别：${delivery.severity}`,
    `项目：${delivery.projectId ?? "—"}`,
    `标识：${delivery.referenceKey}`,
    "",
    "此邮件由管理数智军团统建项目进度监控平台自动发送，请勿直接回复。",
  ].join("\n");
  return [
    `From: ${senderName} <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "Auto-Submitted: auto-generated",
    "",
    wrapBase64(base64Utf8(body)),
  ].join("\r\n");
}
