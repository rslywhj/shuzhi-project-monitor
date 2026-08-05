"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  buildProjectTimelineMarkers,
  buildTimelineKpis,
  buildTimelineMonths,
  markerMatchesKpi,
  compactTimelineDate,
  timelineProjectIsVisible,
  timelineProjectPriority,
  unfinishedPlannedFinish,
  type TimelineKpiFilter,
  type TimelineMarker,
  type TimelineMonth,
  type TimelineProjectInput,
  type TimelineStatus,
} from "@/lib/timeline-cockpit";
import {
  formatShanghaiDate,
  formatShanghaiMonthDayTime,
  shanghaiDateIso,
} from "@/lib/date-time";
import { shouldShowPrimaryStageIndicator } from "@/lib/project-stage";
import { ThemeControl } from "./theme-provider";
import {
  TimelinePrintReport,
  triggerCockpitPrint,
} from "./cockpit-print-report";

type TimelineDestination = "cockpit" | "portfolio" | "project";
type TimelineSnapshot = {
  weekKey: string;
  version: number;
  completeness: number;
  lockedAt: string;
};

type TimelineSelection = {
  project: TimelineProjectInput;
  month: TimelineMonth;
  markers: TimelineMarker[];
};

const DEFAULT_PAGE_SIZE = 7;
const MIN_PAGE_SIZE = 1;
const MAX_PAGE_SIZE = 50;
const DEFAULT_AUTO_PAGE_SECONDS = 20;
const AUTO_PAGE_SECONDS_OPTIONS = [5, 10, 15, 20, 30, 60] as const;
const PAGINATION_STORAGE_KEY = "shuzhi-cockpit-pagination-v1";

const STATUS_LABEL: Record<TimelineStatus, string> = {
  green: "正常",
  yellow: "预警",
  red: "严重",
  na: "不适用",
};

const KPI_COPY: Record<
  TimelineKpiFilter,
  { label: string; caption: string; symbol: string }
> = {
  planned: {
    label: "本月计划到期",
    caption: "批准基线口径",
    symbol: "◇",
  },
  actual: {
    label: "本月已完成",
    caption: "实际完成口径",
    symbol: "●",
  },
  forecast: {
    label: "本月预测完成",
    caption: "未完成节点预测",
    symbol: "▲",
  },
  overdue: {
    label: "逾期未完成",
    caption: "截至快照锁定日",
    symbol: "■",
  },
};

function timelineProjectStageLabel(project: TimelineProjectInput) {
  if (project.stageSummary?.primaryMilestoneId) {
    const primaryName =
      project.milestones?.find(
        (milestone) =>
          milestone.id === project.stageSummary?.primaryMilestoneId,
      )?.name ?? "待确认";
    return shouldShowPrimaryStageIndicator(project.stageSummary)
      ? `主：${primaryName} · 并行${project.stageSummary.parallelMilestoneIds.length} · 遗留${project.stageSummary.carryoverMilestoneIds.length}`
      : `当前：${primaryName}`;
  }
  if (project.stageSummary?.shouldStartMilestoneIds.length) {
    return `应启动未启动 ${project.stageSummary.shouldStartMilestoneIds.length}项`;
  }
  return null;
}

function TimelineLogo() {
  return (
    <div className="brand dark">
      <div className="brand-mark"><span>数</span></div>
      <div><strong>数智军团</strong><small>统建项目进度监控平台</small></div>
    </div>
  );
}

function TimelineStatusPill({
  status,
  compact = false,
}: {
  status: TimelineStatus;
  compact?: boolean;
}) {
  const symbol = { green: "●", yellow: "▲", red: "■", na: "—" }[status];
  return (
    <span className={`status-pill ${status} ${compact ? "compact" : ""}`}>
      {symbol} {!compact && STATUS_LABEL[status]}
    </span>
  );
}

function markerRoleLabel(marker: TimelineMarker) {
  if (marker.overdue) {
    if (
      marker.roles.includes("plan") &&
      marker.roles.includes("forecast")
    ) return "逾·计/预";
    if (marker.roles.includes("forecast")) return "逾·预";
    if (marker.roles.includes("plan")) return "逾·计";
    return "逾";
  }
  if (
    marker.roles.includes("plan") &&
    marker.roles.includes("actual")
  ) return "计/实";
  if (
    marker.roles.includes("plan") &&
    marker.roles.includes("forecast")
  ) return "计/预";
  if (marker.roles.includes("actual")) return "实";
  if (marker.roles.includes("forecast")) return "预";
  return "计";
}

function markerSymbol(marker: TimelineMarker) {
  if (marker.overdue) return "■";
  if (marker.roles.includes("actual")) return "●";
  if (marker.roles.includes("forecast")) return "▲";
  return "◇";
}

export default function TimelineCockpit({
  onNavigate,
  projectData,
  snapshot,
}: {
  onNavigate: (view: TimelineDestination, projectId?: string) => void;
  projectData: TimelineProjectInput[];
  snapshot: TimelineSnapshot | null;
}) {
  const [todayIso, setTodayIso] = useState(() => shanghaiDateIso());
  const [viewOffset, setViewOffset] = useState(0);
  const [org, setOrg] = useState("全部组织");
  const [owner, setOwner] = useState("全部负责人");
  const [projectType, setProjectType] = useState("全部类型");
  const [health, setHealth] = useState("全部状态");
  const [activeKpi, setActiveKpi] = useState<TimelineKpiFilter | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [pageSizeInput, setPageSizeInput] = useState(String(DEFAULT_PAGE_SIZE));
  const [autoPageEnabled, setAutoPageEnabled] = useState(true);
  const [autoPageSeconds, setAutoPageSeconds] = useState(
    DEFAULT_AUTO_PAGE_SECONDS,
  );
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [selected, setSelected] = useState<TimelineSelection | null>(null);
  const [timelineFullscreen, setTimelineFullscreen] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const currentMonthKey = todayIso.slice(0, 7);
  const asOfDate = snapshot?.lockedAt
    ? formatShanghaiDate(snapshot.lockedAt)
    : todayIso;
  const months = useMemo(
    () => buildTimelineMonths(currentMonthKey, viewOffset),
    [currentMonthKey, viewOffset],
  );
  const defaultMonths = useMemo(
    () => buildTimelineMonths(currentMonthKey),
    [currentMonthKey],
  );

  const defaultScopeProjects = useMemo(
    () =>
      projectData.filter((project) =>
        timelineProjectIsVisible(project, defaultMonths, asOfDate),
      ),
    [asOfDate, defaultMonths, projectData],
  );
  const kpis = useMemo(
    () => buildTimelineKpis(defaultScopeProjects, currentMonthKey, asOfDate),
    [asOfDate, currentMonthKey, defaultScopeProjects],
  );
  const organizations = useMemo(
    () => [...new Set(projectData.map((project) => project.org))].sort(),
    [projectData],
  );
  const owners = useMemo(
    () => [...new Set(projectData.map((project) => project.owner))].sort(),
    [projectData],
  );
  const projectTypes = useMemo(
    () => [...new Set(projectData.map((project) => project.type))].sort(),
    [projectData],
  );
  const rows = useMemo(() => {
    const visibleProjects = projectData
      .filter((project) => timelineProjectIsVisible(project, months, asOfDate))
      .map((project) => ({
        project,
        markers: buildProjectTimelineMarkers(project, months, asOfDate),
      }))
      .filter(
        ({ project }) =>
          (org === "全部组织" || project.org === org) &&
          (owner === "全部负责人" || project.owner === owner) &&
          (projectType === "全部类型" || project.type === projectType) &&
          (health === "全部状态" || STATUS_LABEL[project.status] === health) &&
          (!activeKpi || kpis[activeKpi].projectIds.has(project.id)),
      );
    return visibleProjects.sort(
      (left, right) =>
        timelineProjectPriority(
          right.project,
          right.markers,
          currentMonthKey,
        ) -
          timelineProjectPriority(
            left.project,
            left.markers,
            currentMonthKey,
          ) ||
        left.project.name.localeCompare(right.project.name, "zh-CN"),
    );
  }, [
    activeKpi,
    asOfDate,
    currentMonthKey,
    health,
    kpis,
    months,
    org,
    owner,
    projectData,
    projectType,
  ]);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRows = rows.slice(
    currentPage * pageSize,
    currentPage * pageSize + pageSize,
  );
  const snapshotLabel = snapshot
    ? `${snapshot.weekKey.replace("-W", "年第")}周 · V${snapshot.version}`
    : "尚无锁定快照";
  const snapshotTime = snapshot?.lockedAt
    ? formatShanghaiMonthDayTime(snapshot.lockedAt)
    : "等待 PMO 锁定";
  const rangeLabel = `${months[0]?.label ?? "—"} — ${months.at(-1)?.label ?? "—"}`;
  const printFilters = [org, owner, projectType, health]
    .filter((value) => !value.startsWith("全部"))
    .concat(activeKpi ? KPI_COPY[activeKpi].label : [])
    .join(" · ") || "全部项目";
  const printRows = rows.map(({ project, markers }) => ({
    id: project.id,
    name: project.name,
    owner: project.owner,
    org: project.org,
    status: project.status,
    score: project.score,
    stageLabel: timelineProjectStageLabel(project) ?? "尚无执行中节点",
    markers: markers.map((marker) => ({
      key: marker.key,
      monthKey: marker.monthKey,
      label: `${marker.milestone.name} ${markerRoleLabel(marker)}`,
      symbol: markerSymbol(marker),
      status: marker.milestone.status,
      critical: marker.milestone.critical,
      plannedFinish: unfinishedPlannedFinish(marker.milestone),
    })),
  }));

  function applyPageSize(value: string) {
    const parsed = Number(value);
    const nextPageSize = Number.isFinite(parsed)
      ? Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, Math.round(parsed)))
      : DEFAULT_PAGE_SIZE;
    setPageSize(nextPageSize);
    setPageSizeInput(String(nextPageSize));
    setPage(0);
  }

  function changeKpi(filter: TimelineKpiFilter) {
    setViewOffset(0);
    setActiveKpi((current) => (current === filter ? null : filter));
    setPage(0);
  }

  function moveWindow(delta: number) {
    setViewOffset((current) => current + delta);
    setActiveKpi(null);
    setPage(0);
  }

  async function toggleTimelineFullscreen() {
    if (document.fullscreenElement === timelineRef.current) {
      await document.exitFullscreen();
      return;
    }
    await timelineRef.current?.requestFullscreen();
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextDate = shanghaiDateIso();
      setTodayIso((current) => (current === nextDate ? current : nextDate));
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(PAGINATION_STORAGE_KEY);
        if (saved) {
          const preferences = JSON.parse(saved) as {
            pageSize?: number;
            autoPageEnabled?: boolean;
            autoPageSeconds?: number;
          };
          if (
            Number.isInteger(preferences.pageSize) &&
            preferences.pageSize! >= MIN_PAGE_SIZE &&
            preferences.pageSize! <= MAX_PAGE_SIZE
          ) {
            setPageSize(preferences.pageSize!);
            setPageSizeInput(String(preferences.pageSize));
          }
          if (typeof preferences.autoPageEnabled === "boolean") {
            setAutoPageEnabled(preferences.autoPageEnabled);
          }
          if (
            AUTO_PAGE_SECONDS_OPTIONS.includes(
              preferences.autoPageSeconds as (typeof AUTO_PAGE_SECONDS_OPTIONS)[number],
            )
          ) {
            setAutoPageSeconds(preferences.autoPageSeconds!);
          }
        }
      } catch {
        // Keep safe defaults when a browser contains stale preferences.
      } finally {
        setPreferencesReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    window.localStorage.setItem(
      PAGINATION_STORAGE_KEY,
      JSON.stringify({ pageSize, autoPageEnabled, autoPageSeconds }),
    );
  }, [autoPageEnabled, autoPageSeconds, pageSize, preferencesReady]);

  useEffect(() => {
    if (!autoPageEnabled || pageCount <= 1 || selected) return;
    const timer = window.setTimeout(
      () =>
        setPage(
          (current) =>
            (Math.min(current, pageCount - 1) + 1) % pageCount,
        ),
      autoPageSeconds * 1_000,
    );
    return () => window.clearTimeout(timer);
  }, [
    autoPageEnabled,
    autoPageSeconds,
    currentPage,
    pageCount,
    selected,
  ]);

  useEffect(() => {
    const syncFullscreenState = () =>
      setTimelineFullscreen(document.fullscreenElement === timelineRef.current);
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () =>
      document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  useEffect(() => {
    if (viewOffset !== 0) return;
    const timer = window.setTimeout(() => {
      if (window.innerWidth > 620 || !timelineRef.current) return;
      const currentColumn = timelineRef.current.querySelector<HTMLElement>(
        '[data-current-month="true"]',
      );
      if (!currentColumn) return;
      timelineRef.current.scrollTo({
        left: Math.max(0, currentColumn.offsetLeft - 132),
        behavior: "smooth",
      });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [currentMonthKey, viewOffset]);

  return (
    <>
    <main className="cockpit timeline-cockpit">
      <header className="cockpit-header">
        <TimelineLogo />
        <div className="cockpit-title">
          <span className="eyebrow">MILESTONE TIMELINE COMMAND CENTER</span>
          <h1>统建项目里程碑时间轴</h1>
        </div>
        <div className="snapshot">
          <span className="live-dot" /> 已锁定 · {snapshotLabel}
          <strong>{snapshotTime}</strong>
        </div>
        <div className="cockpit-header-actions">
          <ThemeControl surface="cockpit" />
          <button className="cockpit-view-switch cockpit-pdf-button" onClick={triggerCockpitPrint}><span aria-hidden="true">⇩</span> 导出PDF</button>
          <button
            className="cockpit-view-switch"
            onClick={() => onNavigate("cockpit")}
          >
            <span aria-hidden="true">▦</span> 节点矩阵
          </button>
          <button
            className="light-button"
            onClick={() => onNavigate("portfolio")}
          >
            工作台 <span>↗</span>
          </button>
        </div>
      </header>

      <section className="timeline-metric-grid" aria-label="本月里程碑指标">
        {(Object.keys(KPI_COPY) as TimelineKpiFilter[]).map((filter) => {
          const copy = KPI_COPY[filter];
          const metric = kpis[filter];
          return (
            <button
              type="button"
              key={filter}
              className={`metric-card filter-card timeline-kpi ${filter} ${activeKpi === filter ? "active" : ""}`}
              aria-pressed={activeKpi === filter}
              onClick={() => changeKpi(filter)}
            >
              <span><b>{copy.symbol}</b>{copy.label}</span>
              <strong>{metric.count}</strong>
              <small>{copy.caption} · 关键节点 {metric.criticalCount}</small>
            </button>
          );
        })}
      </section>

      <section className="cockpit-controls timeline-controls">
        <div className="section-heading">
          <div><span className="section-index">01</span><h2>项目里程碑月度日历</h2></div>
          <p>上月复盘 · 本月跟踪 · 未来4个月预警；点击节点查看计划与执行偏差</p>
        </div>
        <div className="timeline-control-stack">
          <div className="timeline-window-nav" aria-label="时间轴月份导航">
            <button type="button" onClick={() => moveWindow(-1)} aria-label="向前一个月">‹</button>
            <strong>{rangeLabel}</strong>
            <button type="button" onClick={() => moveWindow(1)} aria-label="向后一个月">›</button>
            <button
              type="button"
              className={viewOffset === 0 ? "active" : ""}
              disabled={viewOffset === 0}
              onClick={() => {
                setViewOffset(0);
                setPage(0);
              }}
            >
              回到本月
            </button>
          </div>
          <div className="filter-row">
            <label>组织
              <select value={org} onChange={(event) => { setOrg(event.target.value); setPage(0); }}>
                <option>全部组织</option>
                {organizations.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>负责人
              <select value={owner} onChange={(event) => { setOwner(event.target.value); setPage(0); }}>
                <option>全部负责人</option>
                {owners.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>项目类型
              <select value={projectType} onChange={(event) => { setProjectType(event.target.value); setPage(0); }}>
                <option>全部类型</option>
                {projectTypes.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>健康度
              <select value={health} onChange={(event) => { setHealth(event.target.value); setPage(0); }}>
                <option>全部状态</option><option>正常</option><option>预警</option><option>严重</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      <section
        className={`timeline-panel ${activeKpi ? "kpi-filtering" : ""}`}
        ref={timelineRef}
      >
        <div
          className="timeline-grid"
          style={{ "--timeline-month-count": months.length } as CSSProperties}
        >
          <div className="timeline-grid-head">
            <div className="timeline-project-column">
              <span>项目 / 健康度</span>
              <small>按当月紧迫度排序</small>
            </div>
            {months.map((month) => (
              <div
                key={month.key}
                className={month.isCurrent ? "current" : ""}
                data-current-month={month.isCurrent ? "true" : undefined}
              >
                <span>{month.year}</span>
                <strong>{month.shortLabel}</strong>
                <small>{month.isCurrent ? "当前月" : "里程碑完成月"}</small>
              </div>
            ))}
          </div>

          {visibleRows.length ? visibleRows.map(({ project, markers }) => (
            <div className="timeline-grid-row" key={project.id}>
              <button
                type="button"
                className="timeline-project-column timeline-project-cell"
                onClick={() => onNavigate("project", project.id)}
              >
                <TimelineStatusPill status={project.status} compact />
                <span>
                  <strong>{project.name}</strong>
                  <small>{timelineProjectStageLabel(project) ?? `${project.owner} · ${project.org}`}</small>
                </span>
                <b>{project.score}</b>
              </button>
              {months.map((month) => {
                const cellMarkers = markers.filter(
                  (marker) => marker.monthKey === month.key,
                );
                const displayedMarkers = cellMarkers.slice(0, 2);
                return (
                  <div
                    className={`timeline-month-cell ${month.isCurrent ? "current" : ""}`}
                    key={`${project.id}-${month.key}`}
                  >
                    {displayedMarkers.map((marker) => {
                      const highlighted =
                        !activeKpi ||
                        markerMatchesKpi(
                          marker,
                          activeKpi,
                          currentMonthKey,
                        );
                      const plannedFinish = unfinishedPlannedFinish(
                        marker.milestone,
                      );
                      const showPrimaryStageIndicator =
                        project.stageSummary?.primaryMilestoneId ===
                          marker.milestone.id &&
                        shouldShowPrimaryStageIndicator(project.stageSummary);
                      return (
                        <button
                          type="button"
                          key={marker.key}
                          className={`timeline-marker ${marker.milestone.status} ${marker.roles.includes("actual") ? "role-actual" : marker.roles.includes("forecast") ? "role-forecast" : marker.overdue ? "role-overdue" : "role-plan"} ${marker.overdue ? "overdue" : ""} ${showPrimaryStageIndicator ? "stage-main" : project.stageSummary?.parallelMilestoneIds.includes(marker.milestone.id) ? "stage-parallel" : project.stageSummary?.carryoverMilestoneIds.includes(marker.milestone.id) ? "stage-carryover" : ""} ${highlighted ? "highlighted" : "dimmed"}`}
                          onClick={() =>
                            setSelected({
                              project,
                              month,
                              markers: [marker],
                            })
                          }
                          aria-label={`${project.name} ${marker.milestone.name} ${markerRoleLabel(marker)} ${STATUS_LABEL[marker.milestone.status]}${plannedFinish ? ` 计划完成 ${plannedFinish}` : ""}`}
                        >
                          <span className="timeline-marker-symbol">{markerSymbol(marker)}</span>
                          <span className="timeline-marker-title">
                            <strong>{marker.milestone.name}</strong>
                            {plannedFinish && (
                              <small title={`计划完成日期 ${plannedFinish}`}>
                                计划完成 {compactTimelineDate(plannedFinish)}
                              </small>
                            )}
                          </span>
                          <em>{markerRoleLabel(marker)}</em>
                          {showPrimaryStageIndicator && <i title="当前主节点">主</i>}
                          {marker.milestone.critical && <i title="关键节点">关</i>}
                        </button>
                      );
                    })}
                    {cellMarkers.length > 2 && (
                      <button
                        type="button"
                        className="timeline-more"
                        onClick={() =>
                          setSelected({ project, month, markers: cellMarkers })
                        }
                        aria-label={`${project.name} ${month.label} 还有${cellMarkers.length - 2}个节点`}
                      >
                        +{cellMarkers.length - 2}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )) : (
            <div className="timeline-empty">
              当前筛选及时间窗口内暂无里程碑节点
            </div>
          )}
        </div>

        <div className="matrix-footer timeline-footer">
          <span>当前展示 {visibleRows.length} / {rows.length} 个匹配项目</span>
          <div className="timeline-legend" aria-label="时间轴图例">
            <span className="plan">◇ 计划</span>
            <span className="actual">● 实际</span>
            <span className="forecast">▲ 预测</span>
            <span className="overdue">■ 逾期</span>
          </div>
          <div className="matrix-pagination-settings" title="设置保存在当前浏览器">
            <label>
              每页
              <input
                type="number"
                aria-label="管理大屏每页项目行数"
                min={MIN_PAGE_SIZE}
                max={MAX_PAGE_SIZE}
                step="1"
                inputMode="numeric"
                value={pageSizeInput}
                onChange={(event) => {
                  if (/^\d{0,2}$/.test(event.target.value)) {
                    setPageSizeInput(event.target.value);
                  }
                }}
                onFocus={(event) => event.currentTarget.select()}
                onBlur={(event) => applyPageSize(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
              行
            </label>
            <label className="matrix-auto-switch">
              <input
                type="checkbox"
                checked={autoPageEnabled}
                onChange={(event) => setAutoPageEnabled(event.target.checked)}
              />
              <span aria-hidden="true" />
              自动翻页
            </label>
            <label className={!autoPageEnabled ? "disabled" : ""}>
              间隔
              <select
                aria-label="管理大屏自动翻页时间"
                value={autoPageSeconds}
                disabled={!autoPageEnabled}
                onChange={(event) =>
                  setAutoPageSeconds(Number(event.target.value))
                }
              >
                {AUTO_PAGE_SECONDS_OPTIONS.map((seconds) => (
                  <option key={seconds} value={seconds}>{seconds}秒</option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="matrix-fullscreen-button"
            aria-pressed={timelineFullscreen}
            onClick={() => void toggleTimelineFullscreen()}
          >
            {timelineFullscreen ? "退出全屏" : "全屏时间轴"}
          </button>
          <nav className="matrix-pagination" aria-label="时间轴大屏项目分页">
            <button
              type="button"
              aria-label="上一页"
              disabled={pageCount <= 1}
              onClick={() =>
                setPage(
                  (current) =>
                    (Math.min(current, pageCount - 1) - 1 + pageCount) %
                    pageCount,
                )
              }
            >
              ‹
            </button>
            <i>{String(currentPage + 1).padStart(2, "0")} / {String(pageCount).padStart(2, "0")}</i>
            <button
              type="button"
              aria-label="下一页"
              disabled={pageCount <= 1}
              onClick={() =>
                setPage(
                  (current) =>
                    (Math.min(current, pageCount - 1) + 1) % pageCount,
                )
              }
            >
              ›
            </button>
          </nav>
        </div>

        {selected && (
          <div className="drawer-backdrop timeline-drawer-backdrop" onClick={() => setSelected(null)}>
            <aside className="detail-drawer timeline-detail-drawer" onClick={(event) => event.stopPropagation()}>
              <button className="drawer-close" onClick={() => setSelected(null)} aria-label="关闭">×</button>
              <span className="drawer-kicker">月度里程碑详情</span>
              <h2>{selected.project.name}</h2>
              <p>{selected.month.label} · 共 {selected.markers.length} 个节点</p>
              <div className="timeline-drawer-list">
                {selected.markers.map((marker) => (
                  <article className={`timeline-drawer-item ${marker.overdue ? "overdue" : ""}`} key={marker.key}>
                    <header>
                      <TimelineStatusPill status={marker.milestone.status} />
                      <strong>{marker.milestone.name}</strong>
                      <span>{markerRoleLabel(marker)}</span>
                    </header>
                    <div className="drawer-grid">
                      <div><small>计划完成</small><strong>{marker.milestone.plannedFinish || "—"}</strong></div>
                      <div><small>预测完成</small><strong>{marker.milestone.forecastFinish || "未填报"}</strong></div>
                      <div><small>实际完成</small><strong>{marker.milestone.actualFinish || "未完成"}</strong></div>
                      <div><small>完成度 / 偏差</small><strong>{marker.milestone.completion}% · {marker.milestone.deviationDays > 0 ? "+" : ""}{marker.milestone.deviationDays}天</strong></div>
                      <div><small>执行状态</small><strong>{marker.milestone.executionStatus === "completed" ? "✓ 已完成" : marker.milestone.executionStatus === "paused" ? "Ⅱ 暂停" : marker.milestone.executionStatus === "in_progress" ? "▶ 进行中" : "○ 未开始"}</strong></div>
                      <div><small>实际开始</small><strong>{marker.milestone.actualStart || "未填报"}</strong></div>
                    </div>
                    <div className="timeline-node-meta">
                      <span>{marker.milestone.critical ? "◆ 关键节点" : "◇ 普通节点"}</span>
                      <span>{marker.milestone.custom ? "自定义节点" : "标准节点"}</span>
                      <span>权重 {marker.milestone.weight}%</span>
                    </div>
                    <div className="cause-card">
                      <span>偏差归因</span>
                      <p>{marker.milestone.pausedReason ? `暂停原因：${marker.milestone.pausedReason}` : marker.milestone.reason || "当前暂无偏差说明。"}</p>
                    </div>
                  </article>
                ))}
              </div>
              <button
                className="drawer-primary"
                onClick={() => onNavigate("project", selected.project.id)}
              >
                进入项目详情 <span>→</span>
              </button>
            </aside>
          </div>
        )}
      </section>
    </main>
    <TimelinePrintReport
      rows={printRows}
      months={months}
      snapshot={`${snapshotLabel} · ${snapshotTime}`}
      filters={printFilters}
    />
    </>
  );
}
