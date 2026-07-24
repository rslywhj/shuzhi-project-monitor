export type NotificationProvider =
  | "wecom"
  | "dingtalk"
  | "generic"
  | "email";
export type NotificationEventType =
  | "report_reminder"
  | "red_escalation"
  | "test";

export type WebhookDelivery = {
  eventType: NotificationEventType;
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
  projectId: string | null;
  referenceKey: string;
};

const DELIVERY_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_LENGTH = 500;
const blockedGenericHosts = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "instance-data",
]);

export class WebhookValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookValidationError";
  }
}

function isBlockedGenericHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return (
    blockedGenericHosts.has(normalized) ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized.endsWith(".home.arpa") ||
    normalized.startsWith("[") ||
    /^(?:\d{1,3}\.){3}\d{1,3}$/.test(normalized)
  );
}

export function validateWebhookUrl(
  provider: NotificationProvider,
  value: unknown,
) {
  if (provider === "email") {
    throw new WebhookValidationError("电子邮件渠道不使用Webhook地址。");
  }
  const raw = String(value ?? "").trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebhookValidationError("Webhook地址格式无效。");
  }
  if (url.protocol !== "https:") {
    throw new WebhookValidationError("Webhook必须使用HTTPS地址。");
  }
  if (url.username || url.password) {
    throw new WebhookValidationError("Webhook地址不能包含用户名或密码。");
  }
  if (url.port && url.port !== "443") {
    throw new WebhookValidationError("Webhook仅允许使用标准HTTPS端口。");
  }
  if (url.hash) {
    throw new WebhookValidationError("Webhook地址不能包含片段标识。");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (provider === "wecom" && hostname !== "qyapi.weixin.qq.com") {
    throw new WebhookValidationError(
      "企业微信机器人地址必须来自 qyapi.weixin.qq.com。",
    );
  }
  if (
    provider === "dingtalk" &&
    hostname !== "oapi.dingtalk.com" &&
    hostname !== "api.dingtalk.com"
  ) {
    throw new WebhookValidationError(
      "钉钉机器人地址必须来自 dingtalk.com 官方域名。",
    );
  }
  if (provider === "generic" && isBlockedGenericHostname(hostname)) {
    throw new WebhookValidationError(
      "通用Webhook必须使用可公开访问的HTTPS域名，不能使用本机、内网或IP地址。",
    );
  }
  return url.toString();
}

export function maskWebhookUrl(value: string) {
  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    const visiblePath = segments.length ? `/${segments[0]}/••••` : "/••••";
    const queryMarker = url.search ? "?••••" : "";
    return `${url.protocol}//${url.host}${visiblePath}${queryMarker}`;
  } catch {
    return "已配置（地址受保护）";
  }
}

export function buildWebhookPayload(
  provider: NotificationProvider,
  delivery: WebhookDelivery,
  occurredAt = new Date().toISOString(),
) {
  if (provider === "email") {
    throw new WebhookValidationError("电子邮件渠道不使用Webhook载荷。");
  }
  const symbol =
    delivery.severity === "critical"
      ? "🔴"
      : delivery.severity === "warning"
        ? "🟡"
        : "🔵";
  const text = `${symbol} **${delivery.title}**\n\n${delivery.message}\n\n> 事件：${delivery.eventType} · 标识：${delivery.referenceKey}`;
  if (provider === "wecom") {
    return { msgtype: "markdown", markdown: { content: text } };
  }
  if (provider === "dingtalk") {
    return {
      msgtype: "markdown",
      markdown: { title: delivery.title, text },
    };
  }
  return {
    event: delivery.eventType,
    title: delivery.title,
    message: delivery.message,
    severity: delivery.severity,
    projectId: delivery.projectId,
    referenceKey: delivery.referenceKey,
    occurredAt,
  };
}

export function providerResponseSucceeded(
  provider: NotificationProvider,
  response: Response,
  responseBody: string,
) {
  if (!response.ok) return false;
  if (provider === "email") return false;
  if (provider === "generic") return true;
  try {
    const parsed = JSON.parse(responseBody) as { errcode?: number | string };
    return Number(parsed.errcode) === 0;
  } catch {
    return false;
  }
}

export async function sendWebhook(options: {
  provider: NotificationProvider;
  webhookUrl: string;
  delivery: WebhookDelivery;
  fetcher?: typeof fetch;
}) {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(options.webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(
      buildWebhookPayload(options.provider, options.delivery),
    ),
    redirect: "error",
    signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
  });
  const responseBody = (await response.text()).slice(0, MAX_RESPONSE_LENGTH);
  return {
    ok: providerResponseSucceeded(
      options.provider,
      response,
      responseBody,
    ),
    responseStatus: response.status,
    responseBody,
  };
}
