"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type HealthStatus = "green" | "yellow" | "red";
type TrendPoint = {
  weekKey: string;
  version: number;
  completeness: number;
  projectCount: number;
  green: number;
  yellow: number;
  red: number;
  avgScore: number;
  planProgress: number;
  actualProgress: number;
  progressGap: number;
  redMilestones: number;
  delayedMilestones: number;
  newRed: number;
  recovered: number;
  persistentRed: number;
};
type ChronicBottleneck = {
  name: string;
  sequence: number;
  exposureCount: number;
  affectedProjectCount: number;
  affectedWeekCount: number;
  redOccurrences: number;
  yellowOccurrences: number;
  delayedOccurrences: number;
  redRate: number;
  delayedRate: number;
  avgDelayDays: number;
};
type VolatileProject = {
  id: string;
  code: string;
  name: string;
  owner: string;
  org: string;
  latestStatus: HealthStatus;
  observedWeeks: number;
  redWeeks: number;
  yellowWeeks: number;
  transitions: number;
  newRedEntries: number;
  recoveries: number;
  maxProgressGap: number;
};
type TrendData = {
  summary: {
    weekCount: number;
    latestProjectCount: number;
    latestRed: number;
    latestProgressGap: number;
    latestCompleteness: number;
    newRedTotal: number;
    recoveredTotal: number;
    chronicRedProjects: number;
    earliestWeek: string | null;
    latestWeek: string | null;
  };
  points: TrendPoint[];
  chronicBottlenecks: ChronicBottleneck[];
  volatileProjects: VolatileProject[];
  generatedAt: string;
};

const statusSymbol = { green: "●", yellow: "▲", red: "■" };
const statusLabel = { green: "正常", yellow: "预警", red: "严重" };

export default function PortfolioTrends({
  filters,
  onOpenProject,
}: {
  filters: { org: string; type: string; owner: string; status: string };
  onOpenProject: (projectId: string) => void;
}) {
  const [weeks, setWeeks] = useState(12);
  const [data, setData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const queryString = useMemo(() => {
    const params = new URLSearchParams({ weeks: String(weeks) });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }, [filters, weeks]);

  const loadTrends = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/portfolio/analytics/trends?${queryString}`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as TrendData & { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "跨周期趋势加载失败");
      }
      setData(result);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "跨周期趋势加载失败",
      );
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadTrends(), 0);
    return () => window.clearTimeout(timer);
  }, [loadTrends]);

  const maxProjects = Math.max(
    1,
    ...(data?.points.map((point) => point.projectCount) ?? []),
  );
  const exportUrl = `/api/portfolio/analytics/trends?${queryString}&format=csv`;
  const latestPoint = data?.points.at(-1);

  return (
    <section className="portfolio-history">
      <div className="history-section-heading">
        <div>
          <span className="analytics-kicker">LOCKED SNAPSHOT HISTORY</span>
          <h2>跨周期态势与事后度量</h2>
          <p>
            仅使用各周期最新锁定快照，识别新转红、恢复、持续红灯和共性节点瓶颈
            {filters.status
              ? "；健康状态按本期筛选形成固定项目队列后回溯"
              : ""}
          </p>
        </div>
        <div>
          <label>
            观察窗口
            <select
              value={weeks}
              onChange={(event) => setWeeks(Number(event.target.value))}
            >
              <option value={12}>近12周</option>
              <option value={24}>近24周</option>
              <option value={52}>近52周</option>
            </select>
          </label>
          <a className="outline-button history-export" href={exportUrl}>
            导出历史明细
          </a>
        </div>
      </div>

      {error && (
        <div className="analytics-error" role="alert">
          <span>!</span>
          <div>
            <strong>跨周期分析暂时不可用</strong>
            <p>{error}</p>
          </div>
          <button className="outline-button" onClick={() => void loadTrends()}>
            重新加载
          </button>
        </div>
      )}

      {loading && !data ? (
        <div className="history-loading">正在读取锁定快照并计算状态迁移…</div>
      ) : !data?.points.length ? (
        <div className="history-empty">
          <span>◇</span>
          <div>
            <strong>尚无可用于趋势分析的锁定快照</strong>
            <p>PMO完成每周锁数后，这里会自动形成跨周期态势。</p>
          </div>
        </div>
      ) : (
        <>
          <div className="history-summary">
            <article>
              <small>覆盖周期</small>
              <strong>{data.summary.weekCount}</strong>
              <span>
                {data.summary.earliestWeek} 至 {data.summary.latestWeek}
              </span>
            </article>
            <article className={data.summary.latestRed ? "red" : ""}>
              <small>本期红色项目</small>
              <strong>{data.summary.latestRed}</strong>
              <span>持续红灯 {latestPoint?.persistentRed ?? 0} 个</span>
            </article>
            <article className={latestPoint?.newRed ? "red" : ""}>
              <small>本期新转红 / 恢复</small>
              <strong>
                {latestPoint?.newRed ?? 0}
                <em> / {latestPoint?.recovered ?? 0}</em>
              </strong>
              <span>窗口累计新红 {data.summary.newRedTotal} 次</span>
            </article>
            <article className={data.summary.latestProgressGap > 5 ? "red" : ""}>
              <small>本期平均进度落后</small>
              <strong>
                {data.summary.latestProgressGap}
                <em> pp</em>
              </strong>
              <span>
                计划 {latestPoint?.planProgress ?? 0}% / 实际{" "}
                {latestPoint?.actualProgress ?? 0}%
              </span>
            </article>
            <article>
              <small>本期周报完整率</small>
              <strong>
                {data.summary.latestCompleteness}
                <em>%</em>
              </strong>
              <span>恢复累计 {data.summary.recoveredTotal} 次</span>
            </article>
          </div>

          <section className="content-card history-chart-card">
            <div className="card-title">
              <div>
                <h2>红黄绿与进度落后演进</h2>
                <p>柱体为项目状态构成；下方同步显示进度落后、新红与恢复</p>
              </div>
              <div className="history-legend">
                <span className="green">● 绿色</span>
                <span className="yellow">▲ 黄色</span>
                <span className="red">■ 红色</span>
              </div>
            </div>
            <div className="history-chart-scroll">
              <div
                className="history-chart"
                style={{
                  "--history-point-count": data.points.length,
                } as React.CSSProperties}
              >
                {data.points.map((point) => {
                  const chartHeight = Math.max(
                    18,
                    (point.projectCount / maxProjects) * 112,
                  );
                  const total = point.projectCount || 1;
                  return (
                    <article key={`${point.weekKey}-${point.version}`}>
                      <div className="history-gap">
                        <strong
                          className={point.progressGap > 5 ? "negative" : ""}
                        >
                          {point.progressGap}pp
                        </strong>
                        <small>进度落后</small>
                      </div>
                      <div
                        className="history-status-bar"
                        style={{ height: `${chartHeight}px` }}
                      >
                        <i
                          className="green"
                          style={{ height: `${(point.green / total) * 100}%` }}
                        />
                        <i
                          className="yellow"
                          style={{ height: `${(point.yellow / total) * 100}%` }}
                        />
                        <i
                          className="red"
                          style={{ height: `${(point.red / total) * 100}%` }}
                        />
                      </div>
                      <div className="history-transition">
                        <span className={point.newRed ? "has-red" : ""}>
                          +红 {point.newRed}
                        </span>
                        <span className={point.recovered ? "has-recovery" : ""}>
                          恢复 {point.recovered}
                        </span>
                      </div>
                      <strong>{point.weekKey.replace(/^\d{4}-/, "")}</strong>
                      <small>
                        {point.projectCount}项 · 完整{point.completeness}%
                      </small>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>

          <div className="history-detail-grid">
            <section className="content-card chronic-card">
              <div className="card-title">
                <div>
                  <h2>持续性节点瓶颈</h2>
                  <p>按跨周期红灯率、延期率及受影响周期数排序</p>
                </div>
                <span className="count-badge">
                  {data.chronicBottlenecks.filter(
                    (item) => item.affectedWeekCount >= 2,
                  ).length}{" "}
                  个持续瓶颈
                </span>
              </div>
              <div className="chronic-head">
                <span>标准节点</span><span>影响范围</span>
                <span>红灯率</span><span>延期率</span><span>平均延期</span>
              </div>
              <div className="chronic-list">
                {data.chronicBottlenecks.slice(0, 10).map((item, index) => (
                  <div key={`${item.sequence}-${item.name}`}>
                    <span>
                      <i>{String(index + 1).padStart(2, "0")}</i>
                      <strong>{item.name}</strong>
                    </span>
                    <span>
                      {item.affectedProjectCount}项 / {item.affectedWeekCount}周
                    </span>
                    <b className={item.redRate > 20 ? "negative" : ""}>
                      {item.redRate}%
                    </b>
                    <b>{item.delayedRate}%</b>
                    <span>{item.avgDelayDays}天</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="content-card volatile-card">
              <div className="card-title">
                <div>
                  <h2>持续红灯与状态波动项目</h2>
                  <p>优先展示多周红灯、反复转红及最大进度落后项目</p>
                </div>
                <span className="count-badge">
                  {data.summary.chronicRedProjects} 个多周红灯
                </span>
              </div>
              <div className="volatile-head">
                <span>项目</span><span>红 / 黄周数</span>
                <span>状态迁移</span><span>最大落后</span><span>当前</span>
              </div>
              <div className="volatile-list">
                {data.volatileProjects.slice(0, 10).map((project) => (
                  <button
                    key={project.id}
                    onClick={() => onOpenProject(project.id)}
                  >
                    <span>
                      <strong>{project.name}</strong>
                      <small>{project.org} · {project.owner}</small>
                    </span>
                    <span>
                      <b className="red-number">{project.redWeeks}</b>
                      <b className="yellow-number">{project.yellowWeeks}</b>
                    </span>
                    <span>{project.transitions}次</span>
                    <em className={project.maxProgressGap > 5 ? "negative" : ""}>
                      {project.maxProgressGap}pp
                    </em>
                    <span className={`history-status ${project.latestStatus}`}>
                      {statusSymbol[project.latestStatus]}{" "}
                      {statusLabel[project.latestStatus]}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </section>
  );
}
