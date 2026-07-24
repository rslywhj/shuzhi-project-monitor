"use client";

import { useCallback, useEffect, useState } from "react";
import {
  formatShanghaiMonthDayTime,
  SHANGHAI_TIME_ZONE_LABEL,
} from "@/lib/date-time";

type Provider = "wecom" | "dingtalk" | "generic" | "email";
type EventType = "report_reminder" | "red_escalation";
type Channel = {
  id: number;
  name: string;
  provider: Provider;
  webhookUrlMasked: string;
  endpointMasked: string;
  emailRecipientsMasked: string;
  recipientCount: number;
  eventTypes: EventType[];
  active: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};
type Delivery = {
  id: number;
  channelId: number;
  channelName: string;
  projectId: string | null;
  eventType: EventType | "test";
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
};
type Draft = {
  id?: number;
  name: string;
  provider: Provider;
  webhookUrl: string;
  emailRecipients: string;
  eventTypes: EventType[];
  active: boolean;
};

const providerNames: Record<Provider, string> = {
  wecom: "企业微信机器人",
  dingtalk: "钉钉机器人",
  generic: "通用 Webhook",
  email: "电子邮件",
};
const eventNames: Record<EventType | "test", string> = {
  report_reminder: "周报催报",
  red_escalation: "红灯升级",
  test: "渠道测试",
};
const statusNames: Record<Delivery["status"], string> = {
  pending: "待投递",
  sending: "投递中",
  sent: "已送达",
  failed: "失败",
};
const emptyDraft: Draft = {
  name: "",
  provider: "wecom",
  webhookUrl: "",
  emailRecipients: "",
  eventTypes: ["report_reminder", "red_escalation"],
  active: true,
};

export default function NotificationChannelPanel({
  role,
}: {
  role: "executive" | "pmo" | "manager" | "admin" | undefined;
}) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [workingId, setWorkingId] = useState("");
  const canEdit = role === "admin";
  const canOperate = role === "admin" || role === "pmo";

  const loadChannels = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/notification-channels", {
        cache: "no-store",
      });
      const result = (await response.json()) as {
        channels?: Channel[];
        deliveries?: Delivery[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error || "外部通知渠道读取失败");
      }
      setChannels(result.channels ?? []);
      setDeliveries(result.deliveries ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "外部通知渠道读取失败",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadChannels(), 0);
    return () => window.clearTimeout(timer);
  }, [loadChannels]);

  function openEdit(channel: Channel) {
    setError("");
    setMessage("");
    setDraft({
      id: channel.id,
      name: channel.name,
      provider: channel.provider,
      webhookUrl: "",
      emailRecipients: "",
      eventTypes: channel.eventTypes,
      active: channel.active,
    });
  }

  function toggleEvent(eventType: EventType) {
    setDraft((current) => {
      if (!current) return current;
      const selected = current.eventTypes.includes(eventType);
      return {
        ...current,
        eventTypes: selected
          ? current.eventTypes.filter((item) => item !== eventType)
          : [...current.eventTypes, eventType],
      };
    });
  }

  async function saveChannel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        draft.id
          ? `/api/notification-channels/${draft.id}`
          : "/api/notification-channels",
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: draft.name,
            provider: draft.provider,
            webhookUrl: draft.webhookUrl || undefined,
            emailRecipients:
              draft.provider === "email" && draft.emailRecipients.trim()
                ? draft.emailRecipients.split(/[\s,;]+/).filter(Boolean)
                : undefined,
            eventTypes: draft.eventTypes,
            active: draft.active,
          }),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "渠道保存失败");
      }
      setDraft(null);
      setMessage(draft.id ? "✓ 渠道配置已更新。" : "✓ 外部通知渠道已创建。");
      await loadChannels();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "渠道保存失败",
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleChannel(channel: Channel) {
    setWorkingId(`channel-${channel.id}`);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/notification-channels/${channel.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: !channel.active }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "渠道状态更新失败");
      }
      setMessage(`✓ 已${channel.active ? "停用" : "启用"}${channel.name}。`);
      await loadChannels();
    } catch (operationError) {
      setError(
        operationError instanceof Error
          ? operationError.message
          : "渠道状态更新失败",
      );
    } finally {
      setWorkingId("");
    }
  }

  async function testChannel(channel: Channel) {
    setWorkingId(`test-${channel.id}`);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/notification-channels/${channel.id}/test`,
        { method: "POST" },
      );
      const result = (await response.json()) as {
        delivery?: Delivery;
        error?: string;
      };
      if (!response.ok && response.status !== 202) {
        throw new Error(result.error || "渠道测试失败");
      }
      setMessage(
        result.delivery?.status === "sent"
          ? `✓ ${channel.name}测试消息已送达。`
          : `! ${channel.name}测试未送达，已记录失败原因，可在投递日志中重试。`,
      );
      await loadChannels();
    } catch (operationError) {
      setError(
        operationError instanceof Error
          ? operationError.message
          : "渠道测试失败",
      );
    } finally {
      setWorkingId("");
    }
  }

  async function retryDelivery(delivery: Delivery) {
    setWorkingId(`delivery-${delivery.id}`);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/notification-deliveries/${delivery.id}/retry`,
        { method: "POST" },
      );
      const result = (await response.json()) as {
        delivery?: Delivery;
        error?: string;
      };
      if (!response.ok && response.status !== 202) {
        throw new Error(result.error || "投递重试失败");
      }
      setMessage(
        result.delivery?.status === "sent"
          ? "✓ 消息重试后已送达。"
          : "! 重试仍未送达，系统已保留最新失败原因。",
      );
      await loadChannels();
    } catch (operationError) {
      setError(
        operationError instanceof Error
          ? operationError.message
          : "投递重试失败",
      );
    } finally {
      setWorkingId("");
    }
  }

  return (
    <section className="channel-governance">
      <div className="channel-heading">
        <div>
          <span className="analytics-kicker">OUTBOUND NOTIFICATION GOVERNANCE</span>
          <h2>外部消息渠道</h2>
          <p>
            站内通知始终保留为可靠兜底；Webhook与电子邮件按项目、事件和周期去重，并记录每次投递和重试结果。
          </p>
        </div>
        {canEdit && (
          <button
            className="primary-button"
            onClick={() => {
              setError("");
              setMessage("");
              setDraft({ ...emptyDraft });
            }}
          >
            ＋ 新增渠道
          </button>
        )}
      </div>
      {error && <div className="form-error" role="alert">! {error}</div>}
      {message && (
        <div className={message.startsWith("✓") ? "form-success" : "channel-warning"}>
          {message}
        </div>
      )}
      <div className="channel-security-note">
        <span>🔒</span>
        <div>
          <strong>凭据保护</strong>
          <p>
            页面和接口只返回脱敏地址，审计日志不记录Webhook密钥或完整收件人；邮件通过Cloudflare Email Routing投递。
          </p>
        </div>
      </div>

      <div className="channel-layout">
        <section className="content-card channel-list-card">
          <div className="card-title">
            <div>
              <h2>已配置渠道</h2>
              <p>最多启用10个渠道，支持按事件订阅</p>
            </div>
            <span className="count-badge">
              {channels.filter((channel) => channel.active).length} / {channels.length} 启用
            </span>
          </div>
          {loading ? (
            <div className="panel-loading">正在读取渠道配置…</div>
          ) : channels.length ? (
            <div className="channel-list">
              {channels.map((channel) => (
                <article className={channel.active ? "" : "inactive"} key={channel.id}>
                  <div className={`channel-provider ${channel.provider}`}>
                    {channel.provider === "wecom"
                      ? "企"
                      : channel.provider === "dingtalk"
                        ? "钉"
                        : channel.provider === "email"
                          ? "邮"
                          : "↗"}
                  </div>
                  <div className="channel-main">
                    <div>
                      <strong>{channel.name}</strong>
                      <span className={channel.active ? "active" : "disabled"}>
                        {channel.active ? "● 启用" : "— 停用"}
                      </span>
                    </div>
                    <p>{providerNames[channel.provider]} · {channel.endpointMasked}</p>
                    <div>
                      {channel.eventTypes.map((eventType) => (
                        <span key={eventType}>{eventNames[eventType]}</span>
                      ))}
                    </div>
                  </div>
                  <div className="channel-actions">
                    {canEdit && (
                      <>
                        <button
                          className="text-button"
                          disabled={workingId.length > 0}
                          onClick={() => openEdit(channel)}
                        >
                          编辑
                        </button>
                        <button
                          className="text-button"
                          disabled={!channel.active || workingId.length > 0}
                          onClick={() => void testChannel(channel)}
                        >
                          {workingId === `test-${channel.id}` ? "测试中…" : "测试"}
                        </button>
                        <button
                          className={channel.active ? "danger-text" : "text-button"}
                          disabled={workingId.length > 0}
                          onClick={() => void toggleChannel(channel)}
                        >
                          {workingId === `channel-${channel.id}`
                            ? "处理中…"
                            : channel.active
                              ? "停用"
                              : "启用"}
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="channel-empty">
              <span>◇</span>
              <div>
                <strong>尚未配置外部消息渠道</strong>
                <p>系统仍会正常生成站内催报和红灯升级通知。</p>
              </div>
            </div>
          )}
        </section>

        <section className="content-card delivery-card">
          <div className="card-title">
            <div>
              <h2>最近投递记录</h2>
              <p>发送响应、失败原因和人工重试全程留痕</p>
            </div>
            <button className="text-button" onClick={() => void loadChannels()}>
              刷新
            </button>
          </div>
          <div className="delivery-head">
            <span>渠道 / 消息</span><span>事件</span><span>状态</span>
            <span>尝试</span><span>时间</span><span />
          </div>
          <div className="delivery-list">
            {deliveries.slice(0, 50).map((delivery) => (
              <div key={delivery.id}>
                <span>
                  <strong>{delivery.channelName}</strong>
                  <small title={delivery.errorMessage || delivery.title}>
                    {delivery.errorMessage || delivery.title}
                  </small>
                </span>
                <span>{eventNames[delivery.eventType]}</span>
                <span className={`delivery-status ${delivery.status}`}>
                  {statusNames[delivery.status]}
                </span>
                <span>{delivery.attemptCount} / {delivery.maxAttempts}</span>
                <time
                  dateTime={delivery.sentAt ?? delivery.createdAt}
                  title={SHANGHAI_TIME_ZONE_LABEL}
                >
                  {formatShanghaiMonthDayTime(
                    delivery.sentAt ?? delivery.createdAt,
                  )}
                </time>
                <span>
                  {delivery.status === "failed" && canOperate && (
                    <button
                      className="text-button"
                      disabled={workingId.length > 0}
                      onClick={() => void retryDelivery(delivery)}
                    >
                      {workingId === `delivery-${delivery.id}` ? "重试中…" : "重试"}
                    </button>
                  )}
                </span>
              </div>
            ))}
            {!loading && !deliveries.length && (
              <div className="delivery-empty">暂无外部投递记录</div>
            )}
          </div>
        </section>
      </div>

      {draft && canEdit && (
        <div
          className="modal-backdrop"
          onClick={saving ? undefined : () => setDraft(null)}
        >
          <section
            className="create-modal channel-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              disabled={saving}
              onClick={() => setDraft(null)}
              aria-label="关闭渠道配置"
            >
              ×
            </button>
            <span className="modal-kicker">NOTIFICATION CHANNEL</span>
            <h2>{draft.id ? "编辑外部通知渠道" : "新增外部通知渠道"}</h2>
            <p>{draft.provider === "email" ? "邮件收件人仅用于服务端投递，保存后页面只显示脱敏摘要。" : "渠道密钥只用于服务端投递，保存后不会再次向页面返回完整地址。"}</p>
            <form onSubmit={saveChannel}>
              <div className="modal-form-grid">
                <label>
                  渠道名称
                  <input
                    value={draft.name}
                    minLength={2}
                    maxLength={60}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, name: event.target.value } : current,
                      )
                    }
                    placeholder="例如：PMO企业微信群"
                    required
                  />
                </label>
                <label>
                  渠道类型
                  <select
                    value={draft.provider}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              provider: event.target.value as Provider,
                              webhookUrl: "",
                              emailRecipients: "",
                            }
                          : current,
                      )
                    }
                  >
                    <option value="wecom">企业微信机器人</option>
                    <option value="dingtalk">钉钉机器人</option>
                    <option value="generic">通用 Webhook</option>
                    <option value="email">电子邮件</option>
                  </select>
                </label>
              </div>
              {draft.provider === "email" ? (
                <label className="channel-url-field">
                  收件人邮箱
                  <textarea
                    value={draft.emailRecipients}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, emailRecipients: event.target.value }
                          : current,
                      )
                    }
                    placeholder={
                      draft.id
                        ? "留空表示保留当前收件人"
                        : "name@example.com，多个地址可用逗号或换行分隔"
                    }
                    required={!draft.id}
                    rows={3}
                    autoComplete="off"
                  />
                  <small>最多20个收件人；Cloudflare Email Routing要求目标邮箱已验证。</small>
                </label>
              ) : (
                <label className="channel-url-field">
                  Webhook HTTPS地址
                  <input
                    value={draft.webhookUrl}
                    type="url"
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, webhookUrl: event.target.value }
                          : current,
                      )
                    }
                    placeholder={
                      draft.id
                        ? "留空表示保留当前密钥"
                        : "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
                    }
                    required={!draft.id}
                    autoComplete="off"
                  />
                </label>
              )}
              <fieldset className="channel-event-field">
                <legend>订阅事件</legend>
                <label>
                  <input
                    type="checkbox"
                    checked={draft.eventTypes.includes("report_reminder")}
                    onChange={() => toggleEvent("report_reminder")}
                  />
                  <span><strong>周报催报</strong><small>手动催报、自动提醒及逾期通知</small></span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={draft.eventTypes.includes("red_escalation")}
                    onChange={() => toggleEvent("red_escalation")}
                  />
                  <span><strong>红灯升级</strong><small>手动升级及锁数后的自动升级</small></span>
                </label>
              </fieldset>
              <label className="channel-active-field">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? { ...current, active: event.target.checked }
                        : current,
                    )
                  }
                />
                <span>保存后立即启用</span>
              </label>
              <div className="channel-payload-note">
                <strong>投递与重试</strong>
                <span>{draft.provider === "email" ? "使用 notifications@dougge.top 发件；失败后按5分钟、30分钟、2小时退避重试。" : "单次请求超时8秒；失败后按5分钟、30分钟、2小时退避重试，人工重试同样保留记录。"}</span>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="outline-button"
                  disabled={saving}
                  onClick={() => setDraft(null)}
                >
                  取消
                </button>
                <button
                  className="primary-button"
                  disabled={saving || !draft.eventTypes.length}
                >
                  {saving ? "正在保存…" : "保存渠道"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
