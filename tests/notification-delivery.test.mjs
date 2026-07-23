import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildWebhookPayload,
  maskWebhookUrl,
  sendWebhook,
  validateWebhookUrl,
  WebhookValidationError,
} from "../lib/notification-webhook.ts";

const root = new URL("../", import.meta.url);
const delivery = {
  eventType: "red_escalation",
  title: "红灯升级：智慧采购平台",
  message: "关键节点预计延期4天，请立即处置。",
  severity: "critical",
  projectId: "P001",
  referenceKey: "2026-W30",
};

test("validates provider domains, HTTPS and generic webhook SSRF boundaries", () => {
  assert.equal(
    validateWebhookUrl(
      "wecom",
      "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=secret",
    ),
    "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=secret",
  );
  assert.equal(
    validateWebhookUrl(
      "dingtalk",
      "https://oapi.dingtalk.com/robot/send?access_token=secret",
    ),
    "https://oapi.dingtalk.com/robot/send?access_token=secret",
  );
  assert.equal(
    validateWebhookUrl("generic", "https://hooks.example.com/events/project"),
    "https://hooks.example.com/events/project",
  );

  for (const [provider, url] of [
    ["wecom", "http://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=x"],
    ["wecom", "https://evil.example.com/cgi-bin/webhook/send?key=x"],
    ["dingtalk", "https://dingtalk.com/robot/send?access_token=x"],
    ["generic", "https://localhost/hook"],
    ["generic", "https://service.internal/hook"],
    ["generic", "https://127.0.0.1/hook"],
    ["generic", "https://[::1]/hook"],
    ["generic", "https://hooks.example.com:8443/hook"],
    ["generic", "https://hooks.example.com/hook#secret"],
  ]) {
    assert.throws(
      () => validateWebhookUrl(provider, url),
      WebhookValidationError,
      `${provider} should reject ${url}`,
    );
  }
});

test("masks every path and query credential instead of returning a partial secret", () => {
  const raw =
    "https://hooks.example.com/services/team/really-secret-token?token=query-secret";
  const masked = maskWebhookUrl(raw);
  assert.match(masked, /^https:\/\/hooks\.example\.com\/services\/••••\?••••$/);
  assert.doesNotMatch(masked, /team|really-secret-token|query-secret|token=/);
});

test("builds native enterprise WeChat, DingTalk and generic payloads", () => {
  const wecom = buildWebhookPayload("wecom", delivery);
  assert.equal(wecom.msgtype, "markdown");
  assert.match(wecom.markdown.content, /🔴 \*\*红灯升级：智慧采购平台\*\*/);
  assert.match(wecom.markdown.content, /2026-W30/);

  const dingtalk = buildWebhookPayload("dingtalk", delivery);
  assert.equal(dingtalk.msgtype, "markdown");
  assert.equal(dingtalk.markdown.title, delivery.title);
  assert.match(dingtalk.markdown.text, /关键节点预计延期4天/);

  const generic = buildWebhookPayload(
    "generic",
    delivery,
    "2026-07-23T12:00:00.000Z",
  );
  assert.deepEqual(generic, {
    event: "red_escalation",
    title: delivery.title,
    message: delivery.message,
    severity: "critical",
    projectId: "P001",
    referenceKey: "2026-W30",
    occurredAt: "2026-07-23T12:00:00.000Z",
  });
});

test("sends JSON without redirects and evaluates provider response bodies", async () => {
  let captured;
  const success = await sendWebhook({
    provider: "wecom",
    webhookUrl:
      "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=secret",
    delivery,
    fetcher: async (url, init) => {
      captured = { url, init };
      return new Response('{"errcode":0,"errmsg":"ok"}', { status: 200 });
    },
  });
  assert.equal(success.ok, true);
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.redirect, "error");
  assert.match(captured.init.headers["content-type"], /application\/json/);
  assert.match(captured.init.body, /智慧采购平台/);

  const providerFailure = await sendWebhook({
    provider: "dingtalk",
    webhookUrl:
      "https://oapi.dingtalk.com/robot/send?access_token=secret",
    delivery,
    fetcher: async () =>
      new Response('{"errcode":310000,"errmsg":"invalid token"}', {
        status: 200,
      }),
  });
  assert.equal(providerFailure.ok, false);

  const malformedProviderResponse = await sendWebhook({
    provider: "wecom",
    webhookUrl:
      "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=secret",
    delivery,
    fetcher: async () => new Response("not-json", { status: 200 }),
  });
  assert.equal(malformedProviderResponse.ok, false);

  const genericSuccess = await sendWebhook({
    provider: "generic",
    webhookUrl: "https://hooks.example.com/project",
    delivery,
    fetcher: async () => new Response("accepted", { status: 202 }),
  });
  assert.equal(genericSuccess.ok, true);
});

test("persists, authorizes, deduplicates and retries outbound delivery safely", async () => {
  const [
    schema,
    migration,
    deliveryService,
    channelRoute,
    channelItemRoute,
    testRoute,
    retryRoute,
    reminderRoute,
    automation,
    worker,
    panel,
    page,
    css,
  ] = await Promise.all([
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("drizzle/0008_open_nightcrawler.sql", root), "utf8"),
    readFile(new URL("lib/notification-delivery.ts", root), "utf8"),
    readFile(new URL("app/api/notification-channels/route.ts", root), "utf8"),
    readFile(
      new URL("app/api/notification-channels/[id]/route.ts", root),
      "utf8",
    ),
    readFile(
      new URL("app/api/notification-channels/[id]/test/route.ts", root),
      "utf8",
    ),
    readFile(
      new URL("app/api/notification-deliveries/[id]/retry/route.ts", root),
      "utf8",
    ),
    readFile(
      new URL("app/api/notifications/reminders/route.ts", root),
      "utf8",
    ),
    readFile(new URL("lib/portfolio-automation.ts", root), "utf8"),
    readFile(new URL("worker/index.ts", root), "utf8"),
    readFile(new URL("app/notification-channel-panel.tsx", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);

  for (const table of ["notification_channels", "notification_deliveries"]) {
    assert.match(migration, new RegExp(`CREATE TABLE \\\`${table}\\\``));
  }
  assert.match(schema, /notification_deliveries_dedup_idx/);
  assert.match(schema, /notification_deliveries_status_retry_idx/);
  assert.match(deliveryService, /\.onConflictDoNothing\(\)/);
  assert.match(deliveryService, /RETRY_DELAYS_MS/);
  assert.match(deliveryService, /recoverStaleDeliveries/);
  assert.match(deliveryService, /chunks\(due, 4\)/);
  assert.match(deliveryService, /notificationDeliveryView/);
  assert.doesNotMatch(
    deliveryService.match(
      /export function notificationDeliveryView[\s\S]*?^}/m,
    )[0],
    /webhookUrl|dedupKey|message|responseBody|createdBy/,
  );

  assert.match(channelRoute, /canManagePortfolio/);
  assert.match(channelRoute, /canAdministerUsers/);
  assert.match(channelRoute, /MAX_ACTIVE_CHANNELS/);
  assert.match(channelRoute, /webhookUrlMasked/);
  assert.doesNotMatch(channelRoute, /\.\.\.delivery/);
  assert.doesNotMatch(channelRoute, /\.\.\.channel/);
  assert.match(channelItemRoute, /canAdministerUsers/);
  assert.match(channelItemRoute, /变更渠道类型时必须同时填写/);
  assert.match(channelItemRoute, /webhookChanged/);
  assert.match(testRoute, /canAdministerUsers/);
  assert.match(testRoute, /notification_channel\.test/);
  assert.match(testRoute, /notificationDeliveryView/);
  assert.match(retryRoute, /canManagePortfolio/);
  assert.match(retryRoute, /notification_delivery\.retry/);
  assert.match(retryRoute, /notificationDeliveryView/);

  assert.match(reminderRoute, /queueExternalNotifications/);
  assert.match(reminderRoute, /processDueExternalDeliveries/);
  assert.match(reminderRoute, /external:/);
  assert.match(automation, /queueExternalNotifications/);
  assert.match(automation, /processDueExternalDeliveries\(20\)/);
  assert.match(worker, /runPortfolioAutomation/);
  assert.match(worker, /async scheduled/);

  assert.match(panel, /外部消息渠道/);
  assert.match(panel, /页面和接口只返回脱敏地址/);
  assert.match(panel, /失败后按5分钟、30分钟、2小时退避重试/);
  assert.match(panel, /留空表示保留当前密钥/);
  assert.match(page, /NotificationChannelPanel/);
  assert.match(page, /外部渠道新增/);
  assert.match(page, /当前未配置已启用的外部渠道/);
  assert.match(css, /\.channel-governance/);
  assert.match(css, /\.delivery-status\.failed/);
  assert.match(css, /@media \(max-width:720px\)/);
});
