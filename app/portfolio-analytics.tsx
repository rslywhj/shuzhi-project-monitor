"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PortfolioTrends from "./portfolio-trends";
import {
  formatShanghaiDateTime,
  SHANGHAI_TIME_ZONE_LABEL,
} from "@/lib/date-time";

type HealthStatus = "green" | "yellow" | "red";
type Identity = {
  email: string;
  displayName: string;
  role: "executive" | "pmo" | "manager" | "admin";
};
type Summary = {
  projectCount: number;
  green: number;
  yellow: number;
  red: number;
  avgScore: number;
  avgPlanProgress: number;
  avgActualProgress: number;
  avgProgressGap: number;
  delayedMilestoneCount: number;
  avgLatestFinishDriftDays: number;
};
type DimensionRow = {
  name: string;
  projectCount: number;
  green: number;
  yellow: number;
  red: number;
  avgScore: number;
  avgProgressGap: number;
  avgBaselineDriftDays: number;
};
type Bottleneck = {
  name: string;
  sequence: number;
  applicableCount: number;
  delayedCount: number;
  delayedRate: number;
  redCount: number;
  yellowCount: number;
  avgDelayDays: number;
  maxDelayDays: number;
};
type BaselineDrift = {
  id: string;
  code: string;
  name: string;
  owner: string;
  org: string;
  status: HealthStatus;
  baselineVersion: number;
  changedMilestoneCount: number;
  cumulativeBaselineDriftDays: number;
  latestFinishDriftDays: number;
};
type ForecastSignal = {
  code: string;
  label: string;
  impact: number;
  direction: "risk" | "protective" | "context";
};
type MilestoneForecast = {
  milestoneId: number;
  name: string;
  sequence: number;
  critical: boolean;
  plannedFinish: string;
  probability: number;
  riskBand: "low" | "medium" | "high";
  expectedDelayDays: number;
  forecastFinish: string;
  confidence: "low" | "medium" | "high";
  historicalSampleCount: number;
  historicalDelayRate: number;
  earlyWarning: boolean;
  signals: ForecastSignal[];
};
type ProjectForecast = {
  projectId: string;
  code: string;
  name: string;
  owner: string;
  org: string;
  type: string;
  probability: number;
  riskBand: "low" | "medium" | "high";
  expectedDelayDays: number;
  forecastFinish: string | null;
  confidence: "low" | "medium" | "high";
  highRiskMilestoneCount: number;
  earlyWarning: boolean;
  topMilestone: MilestoneForecast | null;
  milestones: MilestoneForecast[];
  drivers: ForecastSignal[];
};
type AnalyticsData = {
  summary: Summary;
  dimensions: {
    org: DimensionRow[];
    type: DimensionRow[];
    owner: DimensionRow[];
  };
  bottlenecks: Bottleneck[];
  baselineDrift: BaselineDrift[];
  filterOptions: {
    orgs: string[];
    types: string[];
    owners: string[];
  };
  delayForecast: {
    model: {
      version: string;
      method: string;
      asOfDate: string;
      historicalSampleCount: number;
      generatedAt: string;
    };
    summary: {
      analyzedProjectCount: number;
      highRiskProjectCount: number;
      mediumRiskProjectCount: number;
      lowRiskProjectCount: number;
      earlyWarningProjectCount: number;
      highRiskMilestoneCount: number;
      averageProbability: number;
    };
    projects: ProjectForecast[];
  };
  generatedAt: string;
};
type Filters = {
  org: string;
  type: string;
  owner: string;
  status: string;
};

const statusMeta = {
  green: { label: "正常", symbol: "●" },
  yellow: { label: "预警", symbol: "▲" },
  red: { label: "严重", symbol: "■" },
} satisfies Record<HealthStatus, { label: string; symbol: string }>;

const forecastRiskMeta = {
  low: { label: "低风险", symbol: "●" },
  medium: { label: "中风险", symbol: "▲" },
  high: { label: "高风险", symbol: "■" },
} as const;

const confidenceNames = {
  low: "低置信度",
  medium: "中置信度",
  high: "高置信度",
} as const;

function signedDays(value: number) {
  return value > 0 ? `+${value}天` : value < 0 ? `${value}天` : "0天";
}

function StatusPill({ status }: { status: HealthStatus }) {
  return (
    <span className={`status-pill ${status} compact`}>
      <i>{statusMeta[status].symbol}</i>
      <b className="sr-only">{statusMeta[status].label}</b>
    </span>
  );
}

export default function PortfolioAnalytics({
  onNavigate,
  identity,
  header,
}: {
  onNavigate: (view: "project", projectId: string) => void;
  identity: Identity | null;
  header: React.ReactNode;
}) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dimension, setDimension] = useState<"org" | "type" | "owner">("org");
  const [expandedForecastId, setExpandedForecastId] = useState<string | null>(
    null,
  );
  const [filters, setFilters] = useState<Filters>({
    org: "",
    type: "",
    owner: "",
    status: "",
  });
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }, [filters]);
  const trendFilters = useMemo(
    () => ({
      org: filters.org,
      type: filters.type,
      owner: filters.owner,
      status: filters.status,
    }),
    [filters.org, filters.owner, filters.status, filters.type],
  );

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/portfolio/analytics${queryString ? `?${queryString}` : ""}`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as AnalyticsData & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error || "组合分析数据加载失败");
      }
      setData(result);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "组合分析数据加载失败",
      );
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAnalytics(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAnalytics]);

  const summary = data?.summary;
  const dimensionRows = data?.dimensions[dimension] ?? [];
  const dimensionLabels = {
    org: "组织",
    type: "项目类型",
    owner: "负责人",
  };
  const exportUrl = `/api/portfolio/analytics?${[
    queryString,
    "format=csv",
  ]
    .filter(Boolean)
    .join("&")}`;

  function updateFilter(name: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function drillDimension(row: DimensionRow) {
    updateFilter(dimension, row.name);
  }

  return (
    <div className="workspace-page analytics-page">
      {header}
      <div className="page-content">
        <section className="content-card analytics-filter-bar">
          <div>
            <span className="analytics-kicker">PORTFOLIO INTELLIGENCE</span>
            <h2>组合健康度与进度偏差</h2>
            <p>
              当前用户：{identity?.displayName ?? "—"} · 使用当前批准基线与原始基线进行可解释对比
            </p>
          </div>
          <div className="analytics-filters">
            <select
              aria-label="筛选组织"
              value={filters.org}
              onChange={(event) => updateFilter("org", event.target.value)}
            >
              <option value="">全部组织</option>
              {(data?.filterOptions.orgs ?? []).map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <select
              aria-label="筛选项目类型"
              value={filters.type}
              onChange={(event) => updateFilter("type", event.target.value)}
            >
              <option value="">全部类型</option>
              {(data?.filterOptions.types ?? []).map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <select
              aria-label="筛选负责人"
              value={filters.owner}
              onChange={(event) => updateFilter("owner", event.target.value)}
            >
              <option value="">全部负责人</option>
              {(data?.filterOptions.owners ?? []).map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <select
              aria-label="筛选健康状态"
              value={filters.status}
              onChange={(event) => updateFilter("status", event.target.value)}
            >
              <option value="">全部状态</option>
              <option value="red">红色</option>
              <option value="yellow">黄色</option>
              <option value="green">绿色</option>
            </select>
            <button
              className="outline-button"
              disabled={!Object.values(filters).some(Boolean)}
              onClick={() =>
                setFilters({ org: "", type: "", owner: "", status: "" })
              }
            >
              重置
            </button>
            <a className="primary-button analytics-export" href={exportUrl}>
              导出分析报表
            </a>
          </div>
        </section>

        {error && (
          <div className="analytics-error" role="alert">
            <span>!</span>
            <div>
              <strong>暂时无法取得组合分析数据</strong>
              <p>{error}</p>
            </div>
            <button className="outline-button" onClick={() => void loadAnalytics()}>
              重新加载
            </button>
          </div>
        )}

        {loading && !data ? (
          <div className="analytics-loading">
            正在汇总项目、节点与原始基线…
          </div>
        ) : (
          <>
            <div className="analytics-summary">
              <article>
                <small>纳入分析项目</small>
                <strong>{summary?.projectCount ?? 0}</strong>
                <span>
                  <i className="green" /> {summary?.green ?? 0}
                  <i className="yellow" /> {summary?.yellow ?? 0}
                  <i className="red" /> {summary?.red ?? 0}
                </span>
              </article>
              <article>
                <small>组合平均健康分</small>
                <strong>{summary?.avgScore ?? 0}</strong>
                <span>满分 100 · 分值可下钻解释</span>
              </article>
              <article className={(summary?.avgProgressGap ?? 0) > 5 ? "warn" : ""}>
                <small>平均进度落后</small>
                <strong>
                  {summary?.avgProgressGap ?? 0}
                  <em> pp</em>
                </strong>
                <span>
                  计划 {summary?.avgPlanProgress ?? 0}% / 实际{" "}
                  {summary?.avgActualProgress ?? 0}%
                </span>
              </article>
              <article className={(summary?.delayedMilestoneCount ?? 0) > 0 ? "warn" : ""}>
                <small>延期节点总数</small>
                <strong>{summary?.delayedMilestoneCount ?? 0}</strong>
                <span>预测延期与实际延期统一统计</span>
              </article>
              <article className={(summary?.avgLatestFinishDriftDays ?? 0) > 0 ? "warn" : ""}>
                <small>平均最终日基线漂移</small>
                <strong>{signedDays(summary?.avgLatestFinishDriftDays ?? 0)}</strong>
                <span>当前批准基线相对原始基线</span>
              </article>
            </div>

            <section className="content-card delay-forecast-card">
              <div className="card-title delay-forecast-title">
                <div>
                  <span className="analytics-kicker">PREDICTIVE WARNING</span>
                  <h2>节点延期概率预警</h2>
                  <p>
                    使用同类节点历史延期先验，融合当前进度、预测日期、风险、措施和周报时效；每项结果均可解释
                  </p>
                </div>
                <div className="forecast-model-note">
                  <strong>{data?.delayForecast.model.version ?? "—"}</strong>
                  <span>
                    度量日 {data?.delayForecast.model.asOfDate ?? "—"} ·{" "}
                    {data?.delayForecast.model.historicalSampleCount ?? 0} 个历史完成样本
                  </span>
                </div>
              </div>
              <div className="forecast-summary-strip">
                <div className="high">
                  <span>高概率项目</span>
                  <strong>
                    {data?.delayForecast.summary.highRiskProjectCount ?? 0}
                  </strong>
                  <small>概率 ≥ 65%</small>
                </div>
                <div className="warning">
                  <span>提前预警项目</span>
                  <strong>
                    {data?.delayForecast.summary.earlyWarningProjectCount ?? 0}
                  </strong>
                  <small>尚未红灯但已高概率</small>
                </div>
                <div>
                  <span>高概率节点</span>
                  <strong>
                    {data?.delayForecast.summary.highRiskMilestoneCount ?? 0}
                  </strong>
                  <small>未完成节点口径</small>
                </div>
                <div>
                  <span>组合平均概率</span>
                  <strong>
                    {data?.delayForecast.summary.averageProbability ?? 0}
                    <em>%</em>
                  </strong>
                  <small>按项目最高风险节点</small>
                </div>
              </div>
              <div className="forecast-table-head">
                <span>项目 / 关注节点</span>
                <span>延期概率</span>
                <span>预计影响</span>
                <span>置信度</span>
                <span>预警性质</span>
                <span />
              </div>
              <div className="forecast-project-list">
                {(data?.delayForecast.projects ?? [])
                  .slice(0, 12)
                  .map((forecast) => {
                    const expanded =
                      expandedForecastId === forecast.projectId;
                    return (
                      <article
                        className={`${forecast.riskBand}${expanded ? " expanded" : ""}`}
                        key={forecast.projectId}
                      >
                        <button
                          className="forecast-project-row"
                          aria-expanded={expanded}
                          onClick={() =>
                            setExpandedForecastId(
                              expanded ? null : forecast.projectId,
                            )
                          }
                        >
                          <span className="forecast-project-name">
                            <i>{forecast.code}</i>
                            <span>
                              <strong>{forecast.name}</strong>
                              <small>
                                {forecast.topMilestone
                                  ? `${forecast.topMilestone.sequence}. ${forecast.topMilestone.name}${forecast.topMilestone.critical ? " ◆" : ""}`
                                  : "无未完成适用节点"}
                              </small>
                            </span>
                          </span>
                          <span className="forecast-probability">
                            <b>{forecast.probability}%</b>
                            <i>
                              <em
                                style={{
                                  width: `${forecast.probability}%`,
                                }}
                              />
                            </i>
                          </span>
                          <span>
                            <b>
                              {forecast.expectedDelayDays > 0
                                ? `+${forecast.expectedDelayDays} 天`
                                : "按期"}
                            </b>
                            <small>{forecast.forecastFinish ?? "—"}</small>
                          </span>
                          <span className={`confidence ${forecast.confidence}`}>
                            {confidenceNames[forecast.confidence]}
                          </span>
                          <span>
                            <b className={`forecast-band ${forecast.riskBand}`}>
                              {forecastRiskMeta[forecast.riskBand].symbol}{" "}
                              {forecastRiskMeta[forecast.riskBand].label}
                            </b>
                            {forecast.earlyWarning && (
                              <small className="early-warning-badge">
                                提前预警
                              </small>
                            )}
                          </span>
                          <em>{expanded ? "⌃" : "⌄"}</em>
                        </button>
                        {expanded && (
                          <div className="forecast-explanation">
                            <div className="forecast-driver-panel">
                              <h3>概率驱动因素</h3>
                              <div>
                                {(forecast.topMilestone?.signals ?? []).map(
                                  (signal) => (
                                    <span
                                      className={signal.direction}
                                      key={`${forecast.projectId}-${signal.code}`}
                                    >
                                      <b>
                                        {signal.direction === "context"
                                          ? "基准"
                                          : `${signal.impact > 0 ? "+" : ""}${signal.impact}pp`}
                                      </b>
                                      {signal.label}
                                    </span>
                                  ),
                                )}
                              </div>
                            </div>
                            <div className="forecast-node-panel">
                              <div>
                                <h3>高风险节点</h3>
                                <button
                                  onClick={() =>
                                    onNavigate("project", forecast.projectId)
                                  }
                                >
                                  进入项目详情 →
                                </button>
                              </div>
                              {(forecast.milestones ?? [])
                                .slice(0, 4)
                                .map((milestone) => (
                                  <div key={milestone.milestoneId}>
                                    <span>
                                      <strong>
                                        {milestone.sequence}. {milestone.name}
                                      </strong>
                                      <small>
                                        计划 {milestone.plannedFinish} ·
                                        预测 {milestone.forecastFinish}
                                      </small>
                                    </span>
                                    <b className={milestone.riskBand}>
                                      {milestone.probability}%
                                    </b>
                                    <em>
                                      历史 {milestone.historicalDelayRate}% ·{" "}
                                      {milestone.historicalSampleCount} 样本
                                    </em>
                                  </div>
                                ))}
                              {!forecast.milestones.length && (
                                <div className="forecast-no-node">
                                  当前项目没有未完成的适用节点
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                {!data?.delayForecast.projects.length && (
                  <div className="analytics-empty">
                    当前筛选条件下暂无可预测项目
                  </div>
                )}
              </div>
              <div className="forecast-disclaimer">
                <span>i</span>
                <p>
                  概率用于提前排序和干预，不替代项目经理判断；置信度由同类完成样本与正式周报数量共同决定。
                </p>
              </div>
            </section>

            <div className="analytics-grid">
              <section className="content-card analytics-dimension-card">
                <div className="card-title">
                  <div>
                    <h2>健康度分布</h2>
                    <p>红灯优先，其次按平均进度落后排序</p>
                  </div>
                  <div className="analytics-dimension-tabs">
                    {(["org", "type", "owner"] as const).map((item) => (
                      <button
                        key={item}
                        className={dimension === item ? "active" : ""}
                        onClick={() => setDimension(item)}
                      >
                        {dimensionLabels[item]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="dimension-head">
                  <span>{dimensionLabels[dimension]}</span>
                  <span>健康分布</span>
                  <span>平均得分</span>
                  <span>进度落后</span>
                  <span>基线漂移</span>
                </div>
                <div className="dimension-list">
                  {dimensionRows.length ? (
                    dimensionRows.slice(0, 12).map((row) => {
                      const total = row.projectCount || 1;
                      return (
                        <button
                          key={row.name}
                          onClick={() => drillDimension(row)}
                          aria-label={`筛选${dimensionLabels[dimension]} ${row.name}`}
                        >
                          <span>
                            <strong>{row.name}</strong>
                            <small>{row.projectCount} 个项目</small>
                          </span>
                          <span className="health-stack">
                            <i className="green" style={{ width: `${(row.green / total) * 100}%` }} />
                            <i className="yellow" style={{ width: `${(row.yellow / total) * 100}%` }} />
                            <i className="red" style={{ width: `${(row.red / total) * 100}%` }} />
                          </span>
                          <b>{row.avgScore}</b>
                          <em className={row.avgProgressGap > 5 ? "negative" : ""}>
                            {row.avgProgressGap} pp
                          </em>
                          <em className={row.avgBaselineDriftDays > 0 ? "negative" : ""}>
                            {signedDays(row.avgBaselineDriftDays)}
                          </em>
                        </button>
                      );
                    })
                  ) : (
                    <div className="analytics-empty">当前筛选条件下暂无数据</div>
                  )}
                </div>
                <div className="analytics-legend">
                  <span><i className="green" />绿色</span>
                  <span><i className="yellow" />黄色</span>
                  <span><i className="red" />红色</span>
                  <small>点击行可继续筛选</small>
                </div>
              </section>

              <section className="content-card bottleneck-card">
                <div className="card-title">
                  <div>
                    <h2>标准节点瓶颈排行</h2>
                    <p>按红灯数、延期率和平均延期天数综合排序</p>
                  </div>
                  <span className="count-badge">
                    {data?.bottlenecks.filter((row) => row.delayedCount > 0).length ?? 0} 个异常节点
                  </span>
                </div>
                <div className="bottleneck-head">
                  <span>节点</span><span>受影响</span><span>延期率</span>
                  <span>平均 / 最大</span><span>红 / 黄</span>
                </div>
                <div className="bottleneck-list">
                  {(data?.bottlenecks ?? []).slice(0, 10).map((row, index) => (
                    <div key={`${row.sequence}-${row.name}`}>
                      <span className="bottleneck-name">
                        <i>{String(index + 1).padStart(2, "0")}</i>
                        <strong>{row.name}</strong>
                      </span>
                      <span>{row.delayedCount} / {row.applicableCount}</span>
                      <span>
                        <b>{row.delayedRate}%</b>
                        <i className="rate-track">
                          <em style={{ width: `${Math.min(100, row.delayedRate)}%` }} />
                        </i>
                      </span>
                      <span>{row.avgDelayDays}天 / {row.maxDelayDays}天</span>
                      <span>
                        <b className="red-number">{row.redCount}</b>
                        <b className="yellow-number">{row.yellowCount}</b>
                      </span>
                    </div>
                  ))}
                  {!data?.bottlenecks.length && (
                    <div className="analytics-empty">暂无适用标准节点</div>
                  )}
                </div>
              </section>
            </div>

            <section className="content-card baseline-drift-card">
              <div className="card-title">
                <div>
                  <h2>原始基线累计偏差</h2>
                  <p>
                    区分计划重排与执行延期：这里仅衡量当前批准基线相对 V1
                    原始基线的计划漂移
                  </p>
                </div>
                <span
                  className="analytics-asof"
                  title={data?.generatedAt ? SHANGHAI_TIME_ZONE_LABEL : undefined}
                >
                  数据生成于{" "}
                  {data?.generatedAt
                    ? formatShanghaiDateTime(data.generatedAt)
                    : "—"}
                </span>
              </div>
              <div className="baseline-drift-head">
                <span>项目</span><span>健康度</span><span>当前基线</span>
                <span>变更节点</span><span>节点累计漂移</span>
                <span>最终日漂移</span><span />
              </div>
              <div className="baseline-drift-list">
                {(data?.baselineDrift ?? []).map((row) => (
                  <button key={row.id} onClick={() => onNavigate("project", row.id)}>
                    <span>
                      <i>{row.code}</i>
                      <span>
                        <strong>{row.name}</strong>
                        <small>{row.org} · {row.owner}</small>
                      </span>
                    </span>
                    <StatusPill status={row.status} />
                    <b>V{row.baselineVersion}</b>
                    <em>{row.changedMilestoneCount}</em>
                    <em className={row.cumulativeBaselineDriftDays > 0 ? "negative" : ""}>
                      {signedDays(row.cumulativeBaselineDriftDays)}
                    </em>
                    <em className={row.latestFinishDriftDays > 0 ? "negative" : ""}>
                      {signedDays(row.latestFinishDriftDays)}
                    </em>
                    <span>查看详情 →</span>
                  </button>
                ))}
                {!data?.baselineDrift.length && (
                  <div className="analytics-empty">当前筛选条件下暂无项目</div>
                )}
              </div>
            </section>
          </>
        )}
        <PortfolioTrends
          filters={trendFilters}
          onOpenProject={(projectId) => onNavigate("project", projectId)}
        />
      </div>
    </div>
  );
}
