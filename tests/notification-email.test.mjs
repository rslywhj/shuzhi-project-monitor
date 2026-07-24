import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildRawNotificationEmail,
  EmailRecipientValidationError,
  maskEmailRecipients,
  validateEmailRecipients,
} from "../lib/notification-email-content.ts";

const delivery = {
  eventType: "red_escalation",
  title: "红灯升级：智慧采购平台",
  message: "关键节点预计延期4天，请立即处置。",
  severity: "critical",
  projectId: "P001",
  referenceKey: "2026-W30",
};

test("validates, deduplicates and limits email channel recipients", () => {
  assert.deepEqual(
    validateEmailRecipients([
      "PMO@example.com",
      "pmo@example.com",
      "leader@example.com",
    ]),
    ["pmo@example.com", "leader@example.com"],
  );
  for (const value of [
    [],
    ["not-an-email"],
    ["user@example.com\r\nBcc: attacker@example.com"],
    Array.from({ length: 21 }, (_, index) => `user${index}@example.com`),
  ]) {
    assert.throws(
      () => validateEmailRecipients(value),
      EmailRecipientValidationError,
    );
  }
});

test("masks recipient identities and builds safe UTF-8 MIME messages", () => {
  const masked = maskEmailRecipients([
    "portfolio@example.com",
    "leader@example.com",
    "pmo@example.com",
  ]);
  assert.match(masked, /等3人/);
  assert.doesNotMatch(masked, /portfolio|leader|pmo@/);

  const raw = buildRawNotificationEmail(
    "notifications@dougge.top",
    "leader@example.com",
    delivery,
  );
  assert.match(
    raw,
    /From: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <notifications@dougge\.top>/,
  );
  assert.match(raw, /To: leader@example\.com/);
  assert.match(raw, /Subject: =\?UTF-8\?B\?/);
  assert.match(raw, /Content-Transfer-Encoding: base64/);
  assert.doesNotMatch(raw, /\r\nBcc:/);
});

test("wires Cloudflare Email Routing into schema, APIs, delivery and UI", async () => {
  const root = new URL("../", import.meta.url);
  const [
    schema,
    migration,
    deliveryService,
    emailRuntime,
    collectionRoute,
    itemRoute,
    panel,
    css,
    wrangler,
  ] = await Promise.all([
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(
      new URL("drizzle/0016_email_notification_channel.sql", root),
      "utf8",
    ),
    readFile(new URL("lib/notification-delivery.ts", root), "utf8"),
    readFile(new URL("lib/notification-email.ts", root), "utf8"),
    readFile(
      new URL("app/api/notification-channels/route.ts", root),
      "utf8",
    ),
    readFile(
      new URL("app/api/notification-channels/[id]/route.ts", root),
      "utf8",
    ),
    readFile(new URL("app/notification-channel-panel.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("wrangler.production.jsonc", root), "utf8"),
  ]);

  assert.match(schema, /"email"/);
  assert.match(schema, /emailRecipientsJson/);
  assert.match(migration, /email_recipients_json/);
  assert.match(deliveryService, /sendEmailNotification/);
  assert.match(deliveryService, /parseStoredEmailRecipients/);
  assert.match(emailRuntime, /EmailMessage/);
  assert.match(emailRuntime, /runtime\.EMAIL\.send/);
  assert.match(collectionRoute, /validateEmailRecipients/);
  assert.match(collectionRoute, /emailRecipientsMasked/);
  assert.match(itemRoute, /变更为电子邮件渠道/);
  assert.match(panel, /电子邮件/);
  assert.match(panel, /Cloudflare Email Routing/);
  assert.match(css, /channel-provider\.email/);
  assert.match(wrangler, /"send_email"/);
  assert.match(wrangler, /"name":\s*"EMAIL"/);
});
