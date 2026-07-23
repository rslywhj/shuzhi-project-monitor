"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Status = "green" | "yellow" | "red" | "na";
type View = "cockpit" | "portfolio" | "project" | "report" | "pmo" | "admin";
type Role = "executive" | "pmo" | "manager" | "admin";
type Identity = { email: string; displayName: string; role: Role };
type Navigate = (view: View, projectId?: string) => void;
type MilestoneData = {
  id: number;
  name: string;
  sequence: number;
  weight: number;
  status: Status;
  completion: number;
  plannedStart: string;
  plannedFinish: string;
  forecastFinish: string | null;
  actualFinish: string | null;
  deviationDays: number;
  reason: string;
  applicable: boolean;
  critical: boolean;
  custom: boolean;
};

const milestones = [
  "立项启动",
  "需求调研",
  "需求确认",
  "方案设计",
  "方案评审",
  "开发完成",
  "测试验证",
  "联调测试",
  "试运行",
  "用户验收",
  "上线切换",
  "结项移交",
];
const standardTemplateWeights = [5, 5, 8, 7, 10, 15, 10, 10, 5, 10, 10, 5];
const standardCriticalSequences = new Set([6, 10, 11]);
type TemplateData = {
  id: number;
  code: string;
  name: string;
  sequence: number;
  defaultWeight: number;
  critical: boolean;
  active: boolean;
  description: string;
};
const defaultTemplateData: TemplateData[] = milestones.map((name, index) => ({
  id: index + 1,
  code: `M${String(index + 1).padStart(2, "0")}`,
  name,
  sequence: index + 1,
  defaultWeight: standardTemplateWeights[index],
  critical: standardCriticalSequences.has(index + 1),
  active: true,
  description: "",
}));

const projects = [
  { id: "P01", name: "司库管理系统", owner: "王嘉", org: "财务数智组", type: "核心系统", score: 92, status: "green" as Status, plan: 72, actual: 74, declared: 74, risk: "低", cells: ["green","green","green","green","green","green","yellow"] as Status[] },
  { id: "P02", name: "智慧采购平台", owner: "李程", org: "供应链组", type: "业务平台", score: 63, status: "red" as Status, plan: 68, actual: 53, declared: 55, risk: "高", cells: ["green","green","yellow","red","red","na","na"] as Status[] },
  { id: "P03", name: "人力资源共享平台", owner: "陈路", org: "人力数智组", type: "业务平台", score: 81, status: "yellow" as Status, plan: 57, actual: 51, declared: 52, risk: "中", cells: ["green","green","green","yellow","yellow","na","na"] as Status[] },
  { id: "P04", name: "合同全生命周期管理", owner: "周航", org: "法务数智组", type: "核心系统", score: 88, status: "green" as Status, plan: 46, actual: 44, declared: 44, risk: "低", cells: ["green","green","green","green","na","na","na"] as Status[] },
  { id: "P05", name: "财务共享中心二期", owner: "赵敏", org: "财务数智组", type: "核心系统", score: 59, status: "red" as Status, plan: 83, actual: 68, declared: 71, risk: "高", cells: ["green","green","green","yellow","red","red","na"] as Status[] },
  { id: "P06", name: "数据资产管理平台", owner: "孙悦", org: "数据治理组", type: "数据平台", score: 76, status: "yellow" as Status, plan: 64, actual: 56, declared: 57, risk: "中", cells: ["green","green","yellow","yellow","green","na","na"] as Status[] },
  { id: "P07", name: "经营分析驾驶舱", owner: "何清", org: "数据治理组", type: "数据平台", score: 95, status: "green" as Status, plan: 89, actual: 91, declared: 91, risk: "低", cells: ["green","green","green","green","green","green","green"] as Status[] },
  { id: "P08", name: "审计数字化平台", owner: "刘可", org: "监督数智组", type: "业务平台", score: 84, status: "yellow" as Status, plan: 39, actual: 34, declared: 35, risk: "中", cells: ["green","green","green","yellow","na","na","na"] as Status[] },
  { id: "P09", name: "主数据治理一期", owner: "林亦", org: "数据治理组", type: "数据平台", score: 90, status: "green" as Status, plan: 76, actual: 75, declared: 75, risk: "低", cells: ["green","green","green","green","green","yellow","na"] as Status[] },
  { id: "P10", name: "统一门户升级项目", owner: "高远", org: "技术平台组", type: "技术底座", score: 67, status: "red" as Status, plan: 94, actual: 81, declared: 82, risk: "高", cells: ["green","green","green","green","yellow","red","red"] as Status[] },
];
type ProjectData = (typeof projects)[number] & {
  ownerEmail?: string;
  baselineVersion?: number;
  updatedAt?: string;
  openRiskCount?: number;
  openActionCount?: number;
  milestones?: MilestoneData[];
};
type DashboardSnapshot = {
  id: number;
  weekKey: string;
  version: number;
  projectCount: number;
  completeness: number;
  lockedAt: string;
};
type TrendPoint = {
  weekKey: string;
  version: number;
  green: number;
  yellow: number;
  red: number;
  planProgress: number;
  actualProgress: number;
  completeness: number;
};
type WeeklyReportRow = {
  id: number;
  projectId: string;
  weekKey: string;
  systemProgress: number;
  declaredProgress: number;
  variance: number;
  reason: string;
  forecastFinish: string | null;
  status: "draft" | "submitted" | "locked";
  submittedBy: string;
  submittedAt: string;
  draft?: WeeklyReportDraft | null;
};
type WeeklyReportDraft = {
  submitMode?: "draft" | "submitted";
  weekKey?: string;
  declaredProgress?: number;
  reason?: string;
  forecastFinish?: string;
  milestone?: {
    sequence?: number;
    completion?: number;
    forecastFinish?: string;
    actualFinish?: string;
  };
  action?: {
    name?: string;
    owner?: string;
    recoveryDate?: string;
    detail?: string;
  };
};
type AttachmentData = {
  id: number;
  projectId: string;
  weekKey: string;
  milestoneId: number | null;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
};
type NotificationData = {
  id: number;
  recipientEmail: string;
  projectId: string | null;
  type:
    | "report_reminder"
    | "red_escalation"
    | "baseline_decision"
    | "system";
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  actionView: Exclude<View, "cockpit">;
  referenceKey: string;
  status: "unread" | "read" | "dismissed";
  createdBy: string;
  createdAt: string;
  readAt: string | null;
};
type BaselineMilestone = {
  milestoneId?: number;
  templateId?: number | null;
  name: string;
  sequence: number;
  plannedStart: string;
  plannedFinish: string;
  weight: number;
  critical: boolean;
  applicable: boolean;
};
type BaselineVersionRow = {
  id: number;
  projectId: string;
  version: number;
  kind: "original" | "approved" | "legacy";
  changeId: number | null;
  createdBy: string;
  createdAt: string;
  milestones: BaselineMilestone[] | null;
};
type BaselineChangeRow = {
  id: number;
  versionFrom: number;
  versionTo: number;
  reason: string;
  impact: string;
  status: "pending" | "approved" | "rejected";
  requestedBy: string;
  requestedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string;
  changes: Array<{
    milestone?: string;
    milestoneId?: number;
    from?: string;
    to?: string;
    days?: number;
  }> | null;
};
type ProjectAuditRow = {
  id: number;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  detail: unknown;
};
type ProjectActivityData = {
  weeklyReports: WeeklyReportRow[];
  attachments: AttachmentData[];
  baselineVersions: BaselineVersionRow[];
  baselineChanges: BaselineChangeRow[];
  auditLogs: ProjectAuditRow[];
};

const statusLabel: Record<Status, string> = { green: "正常", yellow: "预警", red: "严重", na: "不适用" };
const statusSymbol: Record<Status, string> = { green: "●", yellow: "▲", red: "■", na: "—" };

function shanghaiDateParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function currentReportingPeriod(offsetDays = 0) {
  const parts = shanghaiDateParts();
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + offsetDays);
  const day = date.getUTCDay() || 7;
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - day);
  const isoYear = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(
    ((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  const friday = new Date(date);
  friday.setUTCDate(date.getUTCDate() + (5 - day));
  return {
    weekKey: `${isoYear}-W${String(week).padStart(2, "0")}`,
    year: isoYear,
    week,
    fridayIso: `${friday.getUTCFullYear()}-${String(friday.getUTCMonth() + 1).padStart(2, "0")}-${String(friday.getUTCDate()).padStart(2, "0")}`,
    fridayLabel: `${String(friday.getUTCMonth() + 1).padStart(2, "0")}月${String(friday.getUTCDate()).padStart(2, "0")}日`,
  };
}

function daysBetween(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function Icon({ children }: { children: React.ReactNode }) {
  return <span className="icon" aria-hidden="true">{children}</span>;
}

function StatusPill({ status, compact = false }: { status: Status; compact?: boolean }) {
  return <span className={`status-pill ${status} ${compact ? "compact" : ""}`}>
    <span aria-hidden="true">{statusSymbol[status]}</span>{compact ? "" : statusLabel[status]}
  </span>;
}

function ProgressBar({ value, tone = "blue" }: { value: number; tone?: string }) {
  return <div className="progress-track" aria-label={`完成度 ${value}%`}>
    <span className={`progress-fill ${tone}`} style={{ width: `${value}%` }} />
  </div>;
}

function AppLogo({ dark = false }: { dark?: boolean }) {
  return <div className={`brand ${dark ? "dark" : ""}`}>
    <div className="brand-mark"><span>数</span></div>
    <div><strong>数智军团</strong><small>统建项目进度监控平台</small></div>
  </div>;
}

function Cockpit({ onNavigate, projectData = projects, snapshot, templateData = defaultTemplateData, trends = [] }: { onNavigate: Navigate; projectData?: ProjectData[]; snapshot: DashboardSnapshot | null; templateData?: TemplateData[]; trends?: TrendPoint[] }) {
  const [org, setOrg] = useState("全部组织");
  const [owner, setOwner] = useState("全部负责人");
  const [projectType, setProjectType] = useState("全部类型");
  const [health, setHealth] = useState("全部状态");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<{ project: ProjectData; index: number } | null>(null);
  const matrixMilestones = templateData
    .filter((template) => template.active)
    .sort((left, right) => left.sequence - right.sequence)
    .map((template) => template.name);
  const matching = useMemo(
    () =>
      projectData.filter(
        (project) =>
          (org === "全部组织" || project.org === org) &&
          (owner === "全部负责人" || project.owner === owner) &&
          (projectType === "全部类型" || project.type === projectType) &&
          (health === "全部状态" || statusLabel[project.status] === health),
      ),
    [health, org, owner, projectData, projectType],
  );
  const pageCount = Math.max(1, Math.ceil(matching.length / 10));
  const filtered = matching.slice(page * 10, page * 10 + 10);
  const total = projectData.length;
  const green = projectData.filter((project) => project.status === "green").length;
  const yellow = projectData.filter((project) => project.status === "yellow").length;
  const red = projectData.filter((project) => project.status === "red").length;
  const planProgress = total
    ? projectData.reduce((sum, project) => sum + project.plan, 0) / total
    : 0;
  const actualProgress = total
    ? projectData.reduce((sum, project) => sum + project.actual, 0) / total
    : 0;
  const progressGap = actualProgress - planProgress;
  const organizations = [...new Set(projectData.map((project) => project.org))].sort();
  const owners = [...new Set(projectData.map((project) => project.owner))].sort();
  const projectTypes = [
    ...new Set(projectData.map((project) => project.type)),
  ].sort();
  const snapshotLabel = snapshot
    ? `${snapshot.weekKey.replace("-W", "年第")}周 · V${snapshot.version}`
    : "尚无锁定快照";
  const snapshotTime = snapshot?.lockedAt
    ? snapshot.lockedAt.replace("T", " ").slice(5, 16)
    : "等待 PMO 锁定";
  const attentionProjects = [...projectData]
    .filter((project) => project.status === "red" || project.status === "yellow")
    .sort((left, right) => left.score - right.score)
    .slice(0, 3);
  const todayParts = shanghaiDateParts();
  const today = `${todayParts.year}-${String(todayParts.month).padStart(2, "0")}-${String(todayParts.day).padStart(2, "0")}`;
  const nextWeek = new Date(`${today}T00:00:00Z`);
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
  const nextWeekDate = nextWeek.toISOString().slice(0, 10);
  const upcomingMilestones = projectData
    .flatMap((project) =>
      (project.milestones ?? [])
        .filter(
          (milestone) =>
            milestone.applicable &&
            milestone.completion < 100 &&
            milestone.plannedFinish >= today &&
            milestone.plannedFinish <= nextWeekDate,
        )
        .map((milestone) => ({ project, milestone })),
    )
    .sort((left, right) =>
      left.milestone.plannedFinish.localeCompare(right.milestone.plannedFinish),
    )
    .slice(0, 3);
  const firstTrend = trends[0];
  const latestTrend = trends.at(-1);
  const greenShareChange =
    firstTrend && latestTrend
      ? ((latestTrend.green / Math.max(1, latestTrend.green + latestTrend.yellow + latestTrend.red)) -
          (firstTrend.green / Math.max(1, firstTrend.green + firstTrend.yellow + firstTrend.red))) *
        100
      : null;
  const selectedMilestone = selected
    ? selected.project.milestones?.find(
        (milestone) => milestone.name === matrixMilestones[selected.index],
      )
    : undefined;

  useEffect(() => {
    if (pageCount <= 1) return;
    const timer = window.setInterval(
      () => setPage((current) => (current + 1) % pageCount),
      20_000,
    );
    return () => window.clearInterval(timer);
  }, [pageCount]);

  return <main className="cockpit">
    <header className="cockpit-header">
      <AppLogo dark />
      <div className="cockpit-title">
        <span className="eyebrow">PORTFOLIO COMMAND CENTER</span>
        <h1>管理数智军团统建项目进度监控</h1>
      </div>
      <div className="snapshot">
        <span className="live-dot" /> 已锁定 · {snapshotLabel}
        <strong>{snapshotTime}</strong>
      </div>
      <button className="light-button" onClick={() => onNavigate("portfolio")}>进入工作台 <span>↗</span></button>
    </header>

    <section className="metric-grid">
      <div className="metric-card total"><span>统建项目总数</span><strong>{total}</strong><small>统一节点口径监控</small></div>
      <div className="metric-card green"><span>绿色 · 正常</span><strong>{green}</strong><small>{total ? ((green / total) * 100).toFixed(1) : "0.0"}% 项目受控</small></div>
      <div className="metric-card yellow"><span>黄色 · 预警</span><strong>{yellow}</strong><small>需提前干预</small></div>
      <div className="metric-card red"><span>红色 · 严重</span><strong>{red}</strong><small>需管理层关注</small></div>
      <div className="metric-card progress"><span>组合总体进度</span><div className="metric-progress"><strong>{actualProgress.toFixed(1)}%</strong><em>计划 {planProgress.toFixed(1)}%</em></div><ProgressBar value={actualProgress} /><small className={progressGap < 0 ? "negative" : "positive"}>{progressGap < 0 ? "落后" : "领先"}计划 {Math.abs(progressGap).toFixed(1)} 个百分点</small></div>
      <div className="metric-card quality"><span>周报完成率</span><strong>{snapshot?.completeness ?? 0}%</strong><small>当前锁定快照口径</small></div>
    </section>

    <section className="cockpit-controls">
      <div className="section-heading"><div><span className="section-index">01</span><h2>项目节点态势矩阵</h2></div><p>横向扫描统一节点，点击色块查看偏差归因</p></div>
      <div className="filter-row">
        <label>组织
          <select value={org} onChange={e => { setOrg(e.target.value); setPage(0); }}>
            <option>全部组织</option>{organizations.map((organization) => <option key={organization}>{organization}</option>)}
          </select>
        </label>
        <label>负责人
          <select value={owner} onChange={e => { setOwner(e.target.value); setPage(0); }}>
            <option>全部负责人</option>{owners.map((projectOwner) => <option key={projectOwner}>{projectOwner}</option>)}
          </select>
        </label>
        <label>项目类型
          <select value={projectType} onChange={e => { setProjectType(e.target.value); setPage(0); }}>
            <option>全部类型</option>{projectTypes.map((type) => <option key={type}>{type}</option>)}
          </select>
        </label>
        <label>健康度
          <select value={health} onChange={e => { setHealth(e.target.value); setPage(0); }}>
            <option>全部状态</option><option>正常</option><option>预警</option><option>严重</option>
          </select>
        </label>
        <div className="legend"><span className="green">● 正常</span><span className="yellow">▲ 预警</span><span className="red">■ 严重</span><span className="na">— 不适用</span></div>
      </div>
    </section>

    <section className="cockpit-main">
      <div className="heatmap-panel">
        <div className="heatmap-table" style={{ "--milestone-count": matrixMilestones.length } as React.CSSProperties}>
          <div className="heatmap-head"><div className="project-col">项目 / 健康度</div>{matrixMilestones.map((m, i) => <div key={`${m}-${i}`}><span>{String(i + 1).padStart(2, "0")}</span>{m}</div>)}</div>
          {filtered.map((p) => <div className="heatmap-row" key={p.id}>
            <button className="project-cell" onClick={() => onNavigate("project", p.id)}>
              <StatusPill status={p.status} compact /><span><strong>{p.name}</strong><small>{p.owner} · {p.org}</small></span><b>{p.score}</b>
            </button>
            {matrixMilestones.map((milestoneName, index) => {
              const status = p.cells[index] ?? "na";
              const milestone = p.milestones?.find((row) => row.name === milestoneName);
              const deviation = milestone?.deviationDays ?? 0;
              return <button key={`${milestoneName}-${index}`} className={`heat-cell ${status}`} onClick={() => setSelected({ project: p, index })} aria-label={`${p.name} ${milestoneName} ${statusLabel[status]}`}>
                <span className="cell-symbol">{statusSymbol[status]}</span>
                <small>{status === "na" ? "N/A" : deviation > 0 ? `+${deviation}天` : `${milestone?.completion ?? 0}%`}</small>
              </button>;
            })}
          </div>)}
        </div>
        <div className="matrix-footer"><span>当前展示 {filtered.length} / {matching.length} 个匹配项目</span><span>矩阵每 20 秒自动翻页 <i>{String(page + 1).padStart(2, "0")} / {pageCount}</i></span></div>
      </div>

      <aside className="attention-panel">
        <div className="attention-head"><div><span className="section-index">02</span><h2>重点关注</h2></div><button onClick={() => onNavigate("portfolio")}>查看全部</button></div>
        {attentionProjects.length ? attentionProjects.map((project, index) => {
          const issue = [...(project.milestones ?? [])]
            .filter((milestone) => milestone.applicable)
            .sort((left, right) => {
              const rank = { red: 3, yellow: 2, green: 1, na: 0 };
              return rank[right.status] - rank[left.status] || right.deviationDays - left.deviationDays;
            })[0];
          return <button className={`alert-card ${index === 0 ? "primary" : ""}`} key={project.id} onClick={() => onNavigate("project", project.id)}>
            <div className="rank">{String(index + 1).padStart(2, "0")}</div><div><StatusPill status={project.status} /><h3>{project.name}</h3><p>{issue ? `${issue.name}${issue.deviationDays > 0 ? `预计延期 ${issue.deviationDays} 天` : "需要重点关注"}` : "综合健康度触发预警"}</p><span>责任人 {project.owner} · 风险 {project.risk}</span></div><b>{project.actual - project.plan > 0 ? "+" : ""}{(project.actual - project.plan).toFixed(1)}pp</b>
          </button>;
        }) : <div className="dark-empty-state">当前无红黄项目</div>}
        <div className="upcoming">
          <h3><Icon>◷</Icon> 未来7日关键节点</h3>
          {upcomingMilestones.length ? <ul>{upcomingMilestones.map(({ project, milestone }) => <li key={`${project.id}-${milestone.id}`}><span>{milestone.plannedFinish.slice(5).replace("-", "/")}</span><b>{project.name} · {milestone.name}</b><em>{daysBetween(today, milestone.plannedFinish)}天</em></li>)}</ul> : <div className="dark-empty-inline">未来7日无到期节点</div>}
        </div>
      </aside>
    </section>

    <section className="trend-section">
      <div className="trend-card">
        <div className="mini-head"><div><span className="section-index">03</span><h2>近12周健康趋势</h2></div>{greenShareChange !== null && <span className={greenShareChange >= 0 ? "trend-up" : "trend-down"}>{greenShareChange >= 0 ? "↗" : "↘"} 绿色项目占比{greenShareChange >= 0 ? "提升" : "下降"} {Math.abs(greenShareChange).toFixed(1)}%</span>}</div>
        {trends.length ? <div className="stacked-chart">{trends.map((point) => {
          const maxCount = Math.max(1, ...trends.map((row) => row.green + row.yellow + row.red));
          const unit = 68 / maxCount;
          return <div className="week" key={point.weekKey}><div className="bar" title={`${point.weekKey}: 绿${point.green} 黄${point.yellow} 红${point.red}`}><i className="red" style={{height:`${point.red * unit}px`}}/><i className="yellow" style={{height:`${point.yellow * unit}px`}}/><i className="green" style={{height:`${point.green * unit}px`}}/></div><small>{point.weekKey.slice(-3)}</small></div>;
        })}</div> : <div className="dark-empty-state trend-empty">暂无已锁定周度快照，锁定后将生成趋势</div>}
      </div>
      <div className="variance-card">
        <div className="mini-head"><div><span className="section-index">04</span><h2>计划 / 实际进度</h2></div><span>组合口径</span></div>
        <div className="variance-numbers"><div><small>计划进度</small><strong>{planProgress.toFixed(1)}%</strong></div><div><small>实际进度</small><strong>{actualProgress.toFixed(1)}%</strong></div><div className="variance-gap"><small>进度偏差</small><strong>{progressGap > 0 ? "+" : ""}{progressGap.toFixed(1)}pp</strong></div></div>
        <div className="variance-bars"><label>计划 <ProgressBar value={planProgress} tone="blue" /></label><label>实际 <ProgressBar value={actualProgress} tone="cyan" /></label></div>
      </div>
    </section>

    {selected && <div className="drawer-backdrop" onClick={() => setSelected(null)}>
      <aside className="detail-drawer" onClick={e => e.stopPropagation()}>
        <button className="drawer-close" onClick={() => setSelected(null)} aria-label="关闭">×</button>
        <span className="drawer-kicker">节点运行详情</span>
        <h2>{selected.project.name}</h2><p>{matrixMilestones[selected.index]} · 第 {selected.index + 1} 阶段</p>
        <div className="drawer-status"><StatusPill status={selected.project.cells[selected.index] ?? "na"} /><strong>{selectedMilestone?.deviationDays ? `${selectedMilestone.deviationDays > 0 ? "延期" : "提前"} ${Math.abs(selectedMilestone.deviationDays)} 天` : selectedMilestone ? "按计划推进" : "该节点不适用"}</strong></div>
        <div className="drawer-grid"><div><small>计划完成</small><strong>{selectedMilestone?.plannedFinish ?? "—"}</strong></div><div><small>预测 / 实际</small><strong>{selectedMilestone?.actualFinish ?? selectedMilestone?.forecastFinish ?? "未填报"}</strong></div><div><small>节点权重</small><strong>{selectedMilestone?.applicable ? `${selectedMilestone.weight}%` : "N/A"}</strong></div><div><small>当前完成度</small><strong>{selectedMilestone?.applicable ? `${selectedMilestone.completion}%` : "N/A"}</strong></div></div>
        <div className="cause-card"><span>偏差归因</span><p>{selectedMilestone?.reason || (selectedMilestone ? "当前暂无偏差说明。" : "项目未启用该标准节点。")}</p></div>
        <button className="drawer-primary" onClick={() => onNavigate("project", selected.project.id)}>进入项目详情 <span>→</span></button>
      </aside>
    </div>}
  </main>;
}

function Sidebar({ view, onNavigate, identity }: { view: View; onNavigate: Navigate; identity: Identity | null }) {
  const items: Array<{ id: View; icon: string; label: string; roles?: Role[] }> = [
    { id: "portfolio", icon: "⌘", label: "项目总览" },
    { id: "project", icon: "▣", label: "项目台账" },
    { id: "report", icon: "✎", label: "周度填报", roles: ["manager", "pmo", "admin"] },
    { id: "pmo", icon: "◇", label: "PMO 管理", roles: ["pmo", "admin"] },
  ];
  const visibleItems = items.filter(
    (item) => !item.roles || (identity && item.roles.includes(identity.role)),
  );
  const canGovern = identity?.role === "pmo" || identity?.role === "admin";
  return <aside className="sidebar">
    <AppLogo />
    <nav>{visibleItems.map(item => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => onNavigate(item.id)}><Icon>{item.icon}</Icon>{item.label}</button>)}</nav>
    <div className="sidebar-divider" />
    <div className="subnav"><span>常用功能</span><button onClick={() => onNavigate("project")}><Icon>◫</Icon>风险与措施</button>{canGovern && <><button onClick={() => onNavigate("pmo")}><Icon>≋</Icon>基线变更</button><button onClick={() => onNavigate("pmo")}><Icon>⚙</Icon>规则配置</button><button onClick={() => onNavigate("admin")}><Icon>♙</Icon>用户与权限</button></>}</div>
    <div className="sidebar-bottom"><div className="system-state"><i /><span><strong>系统运行正常</strong><small>服务端实时数据</small></span></div><button className="cockpit-link" onClick={() => onNavigate("cockpit")}><Icon>▦</Icon>打开管理大屏 <span>↗</span></button></div>
  </aside>;
}

function WorkspaceHeader({ title, subtitle, onNavigate, identity }: { title: string; subtitle: string; onNavigate: Navigate; identity: Identity | null }) {
  const [menu, setMenu] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [notificationRows, setNotificationRows] = useState<NotificationData[]>([]);
  const [notificationError, setNotificationError] = useState("");
  const roleNames: Record<Role, string> = {
    executive: "管理层",
    manager: "项目经理",
    pmo: "PMO",
    admin: "系统管理员",
  };
  const displayName = identity?.displayName || "登录用户";
  const roleName = identity ? roleNames[identity.role] : "身份加载中";
  const canGovern = identity?.role === "admin" || identity?.role === "pmo";
  const unreadCount = notificationRows.filter(
    (notification) => notification.status === "unread",
  ).length;
  const loadNotifications = useCallback(async () => {
    if (!identity) return;
    const response = await fetch("/api/notifications", { cache: "no-store" });
    const result = (await response.json()) as {
      notifications?: NotificationData[];
      error?: string;
    };
    if (!response.ok) {
      throw new Error(result.error || "通知读取失败");
    }
    setNotificationRows(result.notifications ?? []);
    setNotificationError("");
  }, [identity]);
  useEffect(() => {
    if (!identity) return;
    const timer = window.setTimeout(() => {
      loadNotifications().catch((error) =>
        setNotificationError(
          error instanceof Error ? error.message : "通知读取失败",
        ),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [identity, loadNotifications]);
  async function openNotification(notification: NotificationData) {
    if (notification.status === "unread") {
      const response = await fetch(`/api/notifications/${notification.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "read" }),
      });
      if (response.ok) {
        setNotificationRows((rows) =>
          rows.map((row) =>
            row.id === notification.id ? { ...row, status: "read" } : row,
          ),
        );
      }
    }
    setNoticeOpen(false);
    onNavigate(notification.actionView, notification.projectId ?? undefined);
  }
  async function markAllNotificationsRead() {
    const response = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "read" }),
    });
    if (response.ok) {
      setNotificationRows((rows) =>
        rows.map((row) =>
          row.status === "unread" ? { ...row, status: "read" } : row,
        ),
      );
    }
  }
  return <header className="workspace-header">
    <div><h1>{title}</h1><p>{subtitle}</p></div>
    <div className="header-actions"><button className="icon-button" aria-label="搜索项目" onClick={() => onNavigate("portfolio")}>⌕</button><button className="icon-button notice" aria-label={`通知${unreadCount ? `，${unreadCount}条未读` : ""}`} aria-expanded={noticeOpen} onClick={() => { setNoticeOpen((value) => !value); setMenu(false); if (!noticeOpen) void loadNotifications(); }}>♢{unreadCount > 0 && <b>{unreadCount > 9 ? "9+" : unreadCount}</b>}</button><button className="user-button" onClick={() => { setMenu(!menu); setNoticeOpen(false); }}><span className="avatar">{displayName[0]}</span><span><strong>{displayName}</strong><small>{roleName}</small></span><em>⌄</em></button></div>
    {noticeOpen && <section className="notification-center"><div className="notification-head"><div><strong>通知中心</strong><span>{unreadCount} 条未读</span></div>{unreadCount > 0 && <button onClick={markAllNotificationsRead}>全部已读</button>}</div>{notificationError ? <div className="notification-error">! {notificationError}</div> : notificationRows.filter((row) => row.status !== "dismissed").length ? <div className="notification-list">{notificationRows.filter((row) => row.status !== "dismissed").slice(0, 20).map((notification) => <button className={`${notification.severity} ${notification.status}`} key={notification.id} onClick={() => openNotification(notification)}><span className="notification-symbol">{notification.severity === "critical" ? "■" : notification.severity === "warning" ? "▲" : "●"}</span><div><strong>{notification.title}</strong><p>{notification.message}</p><small>{notification.createdAt.replace("T"," ").slice(0,16)} · {notification.createdBy}</small></div>{notification.status === "unread" && <i />}</button>)}</div> : <div className="notification-empty">暂无通知</div>}<div className="notification-foot">{canGovern ? <button onClick={() => onNavigate("pmo")}>进入 PMO 待办</button> : <span>通知由 PMO 与系统工作流生成</span>}</div></section>}
    {menu && <div className="user-menu">{canGovern && <button onClick={() => onNavigate("admin")}>用户与权限</button>}<button onClick={() => onNavigate("portfolio")}>项目工作台</button><button onClick={() => onNavigate("cockpit")}>打开管理大屏</button></div>}
  </header>;
}

function Portfolio({ onNavigate, onDataChanged, projectData = projects, identity, templateData = defaultTemplateData, weeklyReports = [] }: { onNavigate: Navigate; onDataChanged: () => Promise<void>; projectData?: ProjectData[]; identity: Identity | null; templateData?: TemplateData[]; weeklyReports?: WeeklyReportRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("全部");
  const [page, setPage] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const matching = useMemo(
    () =>
      projectData.filter(
        (project) =>
          project.name.includes(query.trim()) &&
          (status === "全部" || statusLabel[project.status] === status),
      ),
    [query, status, projectData],
  );
  const pageCount = Math.max(1, Math.ceil(matching.length / 10));
  const safePage = Math.min(page, pageCount - 1);
  const filtered = matching.slice(safePage * 10, safePage * 10 + 10);
  const counts = {
    all: projectData.length,
    green: projectData.filter((project) => project.status === "green").length,
    yellow: projectData.filter((project) => project.status === "yellow").length,
    red: projectData.filter((project) => project.status === "red").length,
  };
  const percent = (value: number) => counts.all ? `${((value / counts.all) * 100).toFixed(1)}%` : "0%";
  const reportingWeek = currentReportingPeriod().weekKey;
  const submittedProjects = new Set(
    weeklyReports
      .filter(
        (report) =>
          report.weekKey === reportingWeek && report.status !== "draft",
      )
      .map((report) => report.projectId),
  ).size;
  const reportCompletion = counts.all
    ? Number(((submittedProjects / counts.all) * 100).toFixed(1))
    : 0;

  async function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setCreateError("");
    const form = new FormData(event.currentTarget);
    const activeTemplates = templateData
      .filter((template) => template.active)
      .sort((left, right) => left.sequence - right.sequence);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: form.get("code"),
          name: form.get("name"),
          ownerName: form.get("ownerName"),
          ownerEmail: form.get("ownerEmail"),
          org: form.get("org"),
          type: form.get("type"),
          riskLevel: form.get("riskLevel"),
          milestones: activeTemplates.map((template, index) => ({
            name: template.name,
            sequence: template.sequence,
            weight: template.defaultWeight,
            critical: template.critical,
            applicable: true,
            plannedStart: `${8 + index > 12 ? "2027" : "2026"}-${String(((7 + index) % 12) + 1).padStart(2, "0")}-01`,
            plannedFinish: `${8 + index > 12 ? "2027" : "2026"}-${String(((7 + index) % 12) + 1).padStart(2, "0")}-20`,
          })),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "项目创建失败");
      await onDataChanged();
      setShowCreate(false);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "项目创建失败");
    } finally {
      setCreating(false);
    }
  }
  return <div className="workspace-page">
    <WorkspaceHeader title="项目组合总览" subtitle={`以统一口径监控 ${counts.all} 个统建项目的进度与健康状态`} onNavigate={onNavigate} identity={identity} />
    <div className="page-content">
      <div className="summary-strip">
        <div className="summary-card"><span className="summary-icon blue">▦</span><div><small>全部项目</small><strong>{counts.all}</strong><em>100%</em></div></div>
        <div className="summary-card"><span className="summary-icon green">●</span><div><small>绿色项目</small><strong>{counts.green}</strong><em>{percent(counts.green)}</em></div></div>
        <div className="summary-card"><span className="summary-icon yellow">▲</span><div><small>黄色项目</small><strong>{counts.yellow}</strong><em>{percent(counts.yellow)}</em></div></div>
        <div className="summary-card"><span className="summary-icon red">■</span><div><small>红色项目</small><strong>{counts.red}</strong><em>{percent(counts.red)}</em></div></div>
        <div className="summary-card wide"><div><small>{reportingWeek} 周报完成率</small><strong>{reportCompletion}%</strong></div><ProgressBar value={reportCompletion} /><span>{submittedProjects} / {counts.all}</span></div>
      </div>
      <section className="content-card">
        <div className="table-toolbar"><div><h2>项目清单</h2><span>当前批准基线口径</span></div><div className="toolbar-actions"><label className="search"><span>⌕</span><input placeholder="搜索项目名称" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /></label><select value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}><option>全部</option><option>正常</option><option>预警</option><option>严重</option></select>{(identity?.role === "pmo" || identity?.role === "admin") && <button className="primary-button" onClick={() => setShowCreate(true)}>＋ 新建项目</button>}</div></div>
        <div className="project-table">
          <div className="table-head"><span>项目名称</span><span>健康状态</span><span>项目经理</span><span>计划 / 实际</span><span>进度偏差</span><span>风险</span><span>更新时间</span><span /></div>
          {filtered.map(p => <div className="table-row" key={p.id}>
            <button className="project-name" onClick={() => onNavigate("project", p.id)}><i>{p.id}</i><span><strong>{p.name}</strong><small>{p.org} · {p.type}</small></span></button>
            <span><StatusPill status={p.status} /></span><span className="owner"><i>{p.owner[0]}</i>{p.owner}</span>
            <span className="dual-progress"><b>{p.actual}%</b><ProgressBar value={p.actual} tone={p.status} /><small>计划 {p.plan}%</small></span>
            <span className={p.actual - p.plan < -5 ? "negative" : "positive"}>{p.actual - p.plan > 0 ? "+" : ""}{(p.actual - p.plan).toFixed(1)} pp</span>
            <span className={`risk ${p.risk === "高" ? "high" : p.risk === "中" ? "medium" : "low"}`}>{p.risk}风险</span><span>{p.updatedAt ? p.updatedAt.replace("T", " ").slice(5, 16) : "数据未同步"}</span><button className="more" aria-label={`查看${p.name}`} onClick={() => onNavigate("project", p.id)}>•••</button>
          </div>)}
        </div>
        <div className="pagination"><span>共 {matching.length} 条，每页 10 条</span><div><button disabled={safePage === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>‹</button>{Array.from({ length: pageCount }, (_, index) => <button key={index} className={safePage === index ? "active" : ""} onClick={() => setPage(index)}>{index + 1}</button>)}<button disabled={safePage === pageCount - 1} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>›</button></div></div>
      </section>
    </div>
    {showCreate && <div className="modal-backdrop" onClick={() => setShowCreate(false)}><section className="create-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowCreate(false)}>×</button><span className="modal-kicker">PROJECT SETUP</span><h2>新建统建项目</h2><p>创建后自动套用{templateData.filter((template) => template.active).length}个当前启用的标准节点，节点权重合计100%。</p><form onSubmit={createProject}><div className="modal-form-grid"><label>项目编码<input name="code" placeholder="例如 P11" required /></label><label>项目名称<input name="name" placeholder="请输入项目名称" required /></label><label>项目经理<input name="ownerName" placeholder="姓名" required /></label><label>项目经理邮箱<input name="ownerEmail" type="email" placeholder="name@example.com" required /></label><label>所属组织<input name="org" placeholder="例如 财务数智组" required /></label><label>项目类型<select name="type"><option>核心系统</option><option>业务平台</option><option>数据平台</option><option>技术底座</option></select></label><label>初始风险<select name="riskLevel"><option value="low">低风险</option><option value="medium">中风险</option><option value="high">高风险</option></select></label></div><div className="template-summary"><strong>标准节点模板</strong><span>{templateData.filter((template) => template.active).sort((left, right) => left.sequence - right.sequence).map((template) => template.name).join(" → ")}</span></div>{createError && <div className="form-error" role="alert">! {createError}</div>}<div className="modal-actions"><button type="button" className="outline-button" onClick={() => setShowCreate(false)}>取消</button><button type="submit" className="primary-button" disabled={creating}>{creating ? "正在创建…" : "创建项目"}</button></div></form></section></div>}
  </div>;
}

function RiskActionPanel({ projectId, canEdit, onDataChanged }: { projectId: string; canEdit: boolean; onDataChanged: () => Promise<void> }) {
  type RiskRow = {
    id: number;
    title: string;
    category: string;
    level: "low" | "medium" | "high";
    status: "open" | "monitoring" | "closed";
    description: string;
    mitigation: string;
    owner: string;
    dueDate: string | null;
  };
  type ActionRow = {
    id: number;
    riskId: number | null;
    name: string;
    owner: string;
    recoveryDate: string;
    detail: string;
    status: "pending" | "in_progress" | "completed" | "overdue";
    progress: number;
  };
  const [riskRows, setRiskRows] = useState<RiskRow[]>([]);
  const [actionRows, setActionRows] = useState<ActionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showRiskForm, setShowRiskForm] = useState(false);
  const [showActionForm, setShowActionForm] = useState(false);
  const [working, setWorking] = useState(false);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [riskResponse, actionResponse] = await Promise.all([
        fetch(`/api/projects/${encodeURIComponent(projectId)}/risks`),
        fetch(`/api/projects/${encodeURIComponent(projectId)}/actions`),
      ]);
      const riskResult = (await riskResponse.json()) as {
        risks?: RiskRow[];
        error?: string;
      };
      const actionResult = (await actionResponse.json()) as {
        actions?: ActionRow[];
        error?: string;
      };
      if (!riskResponse.ok) throw new Error(riskResult.error || "风险读取失败");
      if (!actionResponse.ok) throw new Error(actionResult.error || "措施读取失败");
      setRiskRows(riskResult.risks ?? []);
      setActionRows(actionResult.actions ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "风险与措施读取失败");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRows(), 0);
    return () => window.clearTimeout(timer);
  }, [loadRows]);

  async function createRisk(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/risks`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: form.get("title"),
            category: form.get("category"),
            level: form.get("level"),
            description: form.get("description"),
            mitigation: form.get("mitigation"),
            owner: form.get("owner"),
            dueDate: form.get("dueDate"),
          }),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "风险创建失败");
      setShowRiskForm(false);
      await Promise.all([loadRows(), onDataChanged()]);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "风险创建失败");
    } finally {
      setWorking(false);
    }
  }

  async function createAction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/actions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            riskId: Number(form.get("riskId")) || null,
            name: form.get("name"),
            owner: form.get("owner"),
            recoveryDate: form.get("recoveryDate"),
            detail: form.get("detail"),
            progress: 0,
          }),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "措施创建失败");
      setShowActionForm(false);
      await loadRows();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "措施创建失败");
    } finally {
      setWorking(false);
    }
  }

  async function patchRisk(id: number, status: RiskRow["status"]) {
    setWorking(true);
    setError("");
    try {
      const response = await fetch(`/api/risks/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "风险更新失败");
      await Promise.all([loadRows(), onDataChanged()]);
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : "风险更新失败");
    } finally {
      setWorking(false);
    }
  }

  async function patchAction(id: number, status: ActionRow["status"]) {
    setWorking(true);
    setError("");
    try {
      const response = await fetch(`/api/actions/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "措施更新失败");
      await loadRows();
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : "措施更新失败");
    } finally {
      setWorking(false);
    }
  }

  const openRisks = riskRows.filter((risk) => risk.status !== "closed");
  const overdueActions = actionRows.filter(
    (action) =>
      action.status !== "completed" &&
      action.recoveryDate < new Date().toISOString().slice(0, 10),
  );
  const levelNames = { low: "低", medium: "中", high: "高" };
  const statusNames = {
    open: "开放",
    monitoring: "跟踪中",
    closed: "已关闭",
  };
  const actionStatusNames = {
    pending: "待启动",
    in_progress: "进行中",
    completed: "已完成",
    overdue: "已逾期",
  };

  if (loading) return <section className="content-card"><div className="panel-loading">正在读取风险与措施…</div></section>;
  return <section className="content-card risk-action-panel">
    <div className="card-title"><div><h2>风险与纠偏措施</h2><p>风险、措施、责任人与恢复日期形成闭环跟踪</p></div>{canEdit && <div className="risk-toolbar"><button className="outline-button" onClick={() => setShowRiskForm((value) => !value)}>＋ 登记风险</button><button className="primary-button" onClick={() => setShowActionForm((value) => !value)}>＋ 新建措施</button></div>}</div>
    <div className="risk-summary"><div><small>开放风险</small><strong>{openRisks.length}</strong></div><div><small>高风险</small><strong className="red-text">{openRisks.filter((risk) => risk.level === "high").length}</strong></div><div><small>执行中措施</small><strong>{actionRows.filter((action) => action.status === "in_progress").length}</strong></div><div><small>逾期措施</small><strong className={overdueActions.length ? "red-text" : ""}>{overdueActions.length}</strong></div></div>
    {error && <div className="form-error" role="alert">! {error}</div>}
    {showRiskForm && <form className="inline-manage-form" onSubmit={createRisk}><div className="form-grid"><label>风险标题<input name="title" required /></label><label>风险类别<select name="category"><option>进度</option><option>资源</option><option>质量</option><option>供应商</option><option>范围</option></select></label><label>风险等级<select name="level" defaultValue="medium"><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label><label>责任人<input name="owner" required /></label><label>计划关闭日期<input name="dueDate" type="date" required /></label></div><label className="full-label">风险描述<textarea name="description" required /></label><label className="full-label">应对策略<textarea name="mitigation" /></label><div className="modal-actions"><button type="button" className="outline-button" onClick={() => setShowRiskForm(false)}>取消</button><button className="primary-button" disabled={working}>保存风险</button></div></form>}
    {showActionForm && <form className="inline-manage-form" onSubmit={createAction}><div className="form-grid"><label>关联风险<select name="riskId"><option value="">不关联风险</option>{openRisks.map((risk) => <option key={risk.id} value={risk.id}>{risk.title}</option>)}</select></label><label>措施名称<input name="name" required /></label><label>责任人<input name="owner" required /></label><label>预计恢复日期<input name="recoveryDate" type="date" required /></label></div><label className="full-label">具体行动<textarea name="detail" required /></label><div className="modal-actions"><button type="button" className="outline-button" onClick={() => setShowActionForm(false)}>取消</button><button className="primary-button" disabled={working}>保存措施</button></div></form>}
    <div className="risk-action-grid">
      <div><h3>风险台账 <span>{riskRows.length}</span></h3>{riskRows.length ? riskRows.map((risk) => <article className={`risk-record ${risk.level}`} key={risk.id}><div className="record-head"><span className={`risk-level ${risk.level}`}>{levelNames[risk.level]}风险</span><em>{statusNames[risk.status]}</em></div><h4>{risk.title}</h4><p>{risk.description}</p><small>{risk.category} · 责任人 {risk.owner} · 计划关闭 {risk.dueDate || "未设置"}</small>{risk.mitigation && <div className="mitigation">应对：{risk.mitigation}</div>}{canEdit && risk.status !== "closed" && <button className="text-button" disabled={working} onClick={() => patchRisk(risk.id, "closed")}>标记已关闭</button>}</article>) : <div className="empty-state">暂无风险记录</div>}</div>
      <div><h3>纠偏措施 <span>{actionRows.length}</span></h3>{actionRows.length ? actionRows.map((action) => <article className="action-record" key={action.id}><div className="record-head"><span>{actionStatusNames[action.status]}</span><em>{action.progress}%</em></div><h4>{action.name}</h4><p>{action.detail}</p><ProgressBar value={action.progress} tone={action.status === "completed" ? "green" : "blue"} /><small>责任人 {action.owner} · 恢复目标 {action.recoveryDate}</small>{canEdit && <select disabled={working} value={action.status} onChange={(event) => patchAction(action.id, event.target.value as ActionRow["status"])}><option value="pending">待启动</option><option value="in_progress">进行中</option><option value="completed">已完成</option><option value="overdue">已逾期</option></select>}</article>) : <div className="empty-state">暂无纠偏措施</div>}</div>
    </div>
  </section>;
}

function ProjectActivityPanel({
  projectId,
  tab,
}: {
  projectId: string;
  tab: "周报记录" | "基线版本" | "操作审计";
}) {
  const [data, setData] = useState<ProjectActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null);

  const loadActivity = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/activity`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as ProjectActivityData & {
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "项目活动数据读取失败");
      setData(result);
    } catch (activityError) {
      setError(
        activityError instanceof Error
          ? activityError.message
          : "项目活动数据读取失败",
      );
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadActivity(), 0);
    return () => window.clearTimeout(timer);
  }, [loadActivity]);

  if (loading) {
    return <section className="content-card"><div className="panel-loading">正在读取{tab}…</div></section>;
  }
  if (error || !data) {
    return <section className="content-card activity-error"><div className="form-error" role="alert">! {error || "项目活动数据不可用"}</div><button className="outline-button" onClick={loadActivity}>重新加载</button></section>;
  }

  if (tab === "周报记录") {
    const reportStatus = {
      draft: "草稿",
      submitted: "已提交",
      locked: "已锁定",
    };
    return <section className="content-card activity-card">
      <div className="card-title"><div><h2>周报记录</h2><p>系统计算值、经理申报值和差异说明均永久留痕</p></div><button className="text-button" onClick={loadActivity}>刷新</button></div>
      {data.weeklyReports.length ? <div className="weekly-history-table">
        <div className="table-head"><span>周期</span><span>系统进度</span><span>申报进度</span><span>差异</span><span>状态</span><span>提交人</span><span>更新时间</span></div>
        {data.weeklyReports.map((report) => <article className="table-row" key={report.id}>
          <span><strong>{report.weekKey}</strong><small>{report.forecastFinish ? `预测完成 ${report.forecastFinish}` : "未填项目预测日"}</small></span>
          <span>{report.systemProgress.toFixed(1)}%</span>
          <span>{report.declaredProgress.toFixed(1)}%</span>
          <span className={Math.abs(report.variance) > 5 ? "red-text" : ""}>{report.variance > 0 ? "+" : ""}{report.variance.toFixed(1)}pp</span>
          <span className={`report-status ${report.status}`}>{reportStatus[report.status]}</span>
          <span>{report.submittedBy}</span>
          <time>{report.submittedAt.replace("T", " ").slice(0, 16)}</time>
          {report.reason && <p>{report.reason}</p>}
          {data.attachments.some((attachment) => attachment.weekKey === report.weekKey) && <div className="history-attachments"><strong>支撑附件</strong>{data.attachments.filter((attachment) => attachment.weekKey === report.weekKey).map((attachment) => <a key={attachment.id} href={`/api/attachments/${attachment.id}`} target="_blank" rel="noreferrer"><span>↧</span>{attachment.filename}<small>{formatFileSize(attachment.sizeBytes)}</small></a>)}</div>}
        </article>)}
      </div> : <div className="empty-state">暂无周报记录</div>}
    </section>;
  }

  if (tab === "基线版本") {
    const original =
      data.baselineVersions.find((row) => row.version === 1) ??
      data.baselineVersions.at(-1);
    const originalById = new Map(
      (original?.milestones ?? [])
        .filter((milestone) => milestone.milestoneId !== undefined)
        .map((milestone) => [milestone.milestoneId!, milestone]),
    );
    const originalByName = new Map(
      (original?.milestones ?? []).map((milestone) => [
        milestone.name,
        milestone,
      ]),
    );
    const originalFor = (milestone: BaselineMilestone) =>
      (milestone.milestoneId !== undefined
        ? originalById.get(milestone.milestoneId)
        : undefined) ?? originalByName.get(milestone.name);
    const kindNames = {
      original: "原始基线",
      approved: "批准基线",
      legacy: "历史迁移",
    };
    return <section className="content-card activity-card">
      <div className="card-title"><div><h2>基线版本</h2><p>V1 原始基线不可覆盖，批准调整生成新版本</p></div><span className="count-badge">{data.baselineVersions.length} 个版本</span></div>
      {data.baselineVersions.length ? <div className="baseline-version-list">{data.baselineVersions.map((version) => {
        const milestonesForVersion = version.milestones ?? [];
        const changedCount = milestonesForVersion.filter((milestone) => {
          const base = originalFor(milestone);
          return base && base.plannedFinish !== milestone.plannedFinish;
        }).length;
        return <article className="baseline-version" key={version.id}>
          <button className="baseline-version-head" onClick={() => setExpandedVersion(expandedVersion === version.version ? null : version.version)}>
            <span className={`version-badge ${version.kind}`}>V{version.version}</span>
            <span><strong>{kindNames[version.kind]}</strong><small>{version.createdBy} · {version.createdAt.replace("T", " ").slice(0, 16)}</small></span>
            <span>{version.version === 1 ? "冻结的原始计划" : `相对原始基线变更 ${changedCount} 个节点`}</span>
            <em>{expandedVersion === version.version ? "⌃" : "⌄"}</em>
          </button>
          {expandedVersion === version.version && <div className="baseline-node-table">
            <div className="table-head"><span>节点</span><span>计划开始</span><span>计划完成</span><span>相对 V1</span><span>权重</span></div>
            {milestonesForVersion.map((milestone) => {
              const base = originalFor(milestone);
              const delta = base ? daysBetween(base.plannedFinish, milestone.plannedFinish) : 0;
              return <div className="table-row" key={`${version.id}-${milestone.milestoneId ?? milestone.name}`}><span>{milestone.sequence}. {milestone.name}{milestone.critical ? " ◆" : ""}</span><span>{milestone.plannedStart}</span><span>{milestone.plannedFinish}</span><span className={delta > 0 ? "red-text" : delta < 0 ? "green-text" : ""}>{delta === 0 ? "未变化" : `${delta > 0 ? "+" : ""}${delta}天`}</span><span>{milestone.applicable ? `${milestone.weight}%` : "不适用"}</span></div>;
            })}
          </div>}
        </article>;
      })}</div> : <div className="empty-state">暂无基线版本</div>}
      {data.baselineChanges.length > 0 && <div className="baseline-change-history"><h3>变更申请记录</h3>{data.baselineChanges.map((change) => <div key={change.id}><span className={`change-status ${change.status}`}>{change.status === "pending" ? "待审批" : change.status === "approved" ? "已批准" : "已驳回"}</span><strong>V{change.versionFrom} → V{change.versionTo}</strong><p>{change.reason}</p><small>{change.requestedBy} · {change.requestedAt.replace("T", " ").slice(0, 16)}</small></div>)}</div>}
    </section>;
  }

  const actionNames: Record<string, string> = {
    "weekly_report.save_draft": "保存周报草稿",
    "weekly_report.submit": "提交周报",
    "baseline_change.request": "申请基线变更",
    "baseline_change.approve": "批准基线变更",
    "baseline_change.reject": "驳回基线变更",
    "project.update": "更新项目信息",
    "project.milestones.update": "更新项目节点治理",
    "milestone.create": "新增项目节点",
    "risk.create": "登记风险",
    "risk.update": "更新风险",
    "corrective_action.create": "新增纠偏措施",
    "corrective_action.update": "更新纠偏措施",
    "attachment.upload": "上传周报附件",
    "attachment.delete": "删除周报附件",
  };
  return <section className="content-card activity-card">
    <div className="card-title"><div><h2>操作审计</h2><p>项目、节点、风险、措施与基线关键操作统一追踪</p></div><button className="text-button" onClick={loadActivity}>刷新</button></div>
    {data.auditLogs.length ? <div className="project-audit-timeline">{data.auditLogs.map((row) => <article key={row.id}><span className="audit-dot" /><div><strong>{actionNames[row.action] ?? row.action}</strong><p>{row.actorEmail} · {row.entityType} / {row.entityId}</p></div><time>{row.createdAt.replace("T", " ").slice(0, 16)}</time></article>)}</div> : <div className="empty-state">暂无项目操作记录</div>}
  </section>;
}

function ProjectDetail({ onNavigate, onDataChanged, projectData = projects, projectId, identity }: { onNavigate: Navigate; onDataChanged: () => Promise<void>; projectData?: ProjectData[]; projectId: string; identity: Identity | null }) {
  const [tab, setTab] = useState("节点计划");
  const [expanded, setExpanded] = useState<number | null>(3);
  const [showBaselineForm, setShowBaselineForm] = useState(false);
  const [baselineWorking, setBaselineWorking] = useState(false);
  const [baselineError, setBaselineError] = useState("");
  const [baselineSuccess, setBaselineSuccess] = useState(false);
  const [showMilestoneGovernance, setShowMilestoneGovernance] = useState(false);
  const [milestoneDraft, setMilestoneDraft] = useState<MilestoneData[]>([]);
  const [milestoneWorking, setMilestoneWorking] = useState(false);
  const [milestoneError, setMilestoneError] = useState("");
  const [showProjectEdit, setShowProjectEdit] = useState(false);
  const [projectWorking, setProjectWorking] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [projectSuccess, setProjectSuccess] = useState(false);
  const currentProject =
    projectData.find((project) => project.id === projectId) ??
    projectData[0] ??
    projects[0];
  const variance = Number(
    (currentProject.actual - currentProject.plan).toFixed(1),
  );
  const canUpdate =
    identity?.role === "admin" ||
    identity?.role === "pmo" ||
    (identity?.role === "manager" &&
      Boolean(currentProject.ownerEmail) &&
      identity.email === currentProject.ownerEmail);
  const canChangeOwner =
    identity?.role === "admin" || identity?.role === "pmo";
  const adjustableMilestones =
    currentProject.milestones?.filter((milestone) => milestone.applicable) ?? [];
  const displayMilestones = [...(currentProject.milestones ?? [])].sort(
    (left, right) => left.sequence - right.sequence,
  );

  async function saveProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProjectWorking(true);
    setProjectError("");
    const form = new FormData(event.currentTarget);
    const payload: Record<string, FormDataEntryValue | null> = {
      name: form.get("name"),
      org: form.get("org"),
      type: form.get("type"),
      riskLevel: form.get("riskLevel"),
    };
    if (canChangeOwner) {
      payload.ownerName = form.get("ownerName");
      payload.ownerEmail = form.get("ownerEmail");
    }
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(currentProject.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "项目信息保存失败");
      await onDataChanged();
      setShowProjectEdit(false);
      setProjectSuccess(true);
      window.setTimeout(() => setProjectSuccess(false), 3000);
    } catch (error) {
      setProjectError(
        error instanceof Error ? error.message : "项目信息保存失败",
      );
    } finally {
      setProjectWorking(false);
    }
  }

  async function requestBaselineChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBaselineWorking(true);
    setBaselineError("");
    const form = new FormData(event.currentTarget);
    const milestoneId = Number(form.get("milestoneId"));
    try {
      const response = await fetch("/api/baseline-changes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: currentProject.id,
          reason: form.get("reason"),
          impact: form.get("impact"),
          changes: [{ milestoneId, to: form.get("to") }],
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "基线变更申请失败");
      setShowBaselineForm(false);
      setBaselineSuccess(true);
      setTimeout(() => setBaselineSuccess(false), 3000);
      await onDataChanged();
    } catch (requestError) {
      setBaselineError(
        requestError instanceof Error
          ? requestError.message
          : "基线变更申请失败",
      );
    } finally {
      setBaselineWorking(false);
    }
  }
  function openMilestoneGovernance() {
    setMilestoneDraft(displayMilestones.map((row) => ({ ...row })));
    setMilestoneError("");
    setShowMilestoneGovernance(true);
  }
  function updateMilestoneDraft<K extends keyof MilestoneData>(
    id: number,
    key: K,
    value: MilestoneData[K],
  ) {
    setMilestoneDraft((rows) =>
      rows.map((row) => (row.id === id ? { ...row, [key]: value } : row)),
    );
    setMilestoneError("");
  }
  async function saveMilestoneGovernance() {
    setMilestoneWorking(true);
    setMilestoneError("");
    try {
      const response = await fetch(
        `/api/projects/${currentProject.id}/milestones`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            milestones: milestoneDraft.map((row) => ({
              id: row.id,
              name: row.name,
              sequence: row.sequence,
              weight: row.weight,
              critical: row.critical,
              applicable: row.applicable,
            })),
          }),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "项目节点保存失败");
      await onDataChanged();
      setShowMilestoneGovernance(false);
    } catch (error) {
      setMilestoneError(
        error instanceof Error ? error.message : "项目节点保存失败",
      );
    } finally {
      setMilestoneWorking(false);
    }
  }
  async function createCustomMilestone(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMilestoneWorking(true);
    setMilestoneError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(
        `/api/projects/${currentProject.id}/milestones`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: form.get("name"),
            sequence: Number(form.get("sequence")),
            critical: form.get("critical") === "on",
            plannedStart: form.get("plannedStart"),
            plannedFinish: form.get("plannedFinish"),
          }),
        },
      );
      const result = (await response.json()) as {
        error?: string;
        milestone?: MilestoneData;
      };
      if (!response.ok) throw new Error(result.error || "自定义节点创建失败");
      if (result.milestone) {
        setMilestoneDraft((rows) =>
          [...rows, result.milestone!].sort(
            (left, right) => left.sequence - right.sequence,
          ),
        );
      }
      event.currentTarget.reset();
      await onDataChanged();
    } catch (error) {
      setMilestoneError(
        error instanceof Error ? error.message : "自定义节点创建失败",
      );
    } finally {
      setMilestoneWorking(false);
    }
  }
  return <div className="workspace-page">
    <WorkspaceHeader title="项目详情" subtitle={`项目台账 / ${currentProject.name}`} onNavigate={onNavigate} identity={identity} />
    <div className="page-content project-detail">
      <button className="back-link" onClick={() => onNavigate("portfolio")}>← 返回项目总览</button>
      <section className="project-hero">
        <div className="project-identity"><div className="project-code">{currentProject.name[0]}</div><div><div><StatusPill status={currentProject.status} /><span className="project-tag">{currentProject.type}</span>{currentProject.cells.some((cell) => cell === "red") && <span className="project-tag">重点关注</span>}</div><h2>{currentProject.name}</h2><p>项目经理 {currentProject.owner}　·　{currentProject.org}　·　当前批准基线口径</p></div></div>
        <div className="hero-metrics"><div><small>健康度</small><strong className={currentProject.status === "red" ? "red-text" : ""}>{currentProject.score}</strong><span>/100</span></div><div><small>计划进度</small><strong>{currentProject.plan}%</strong></div><div><small>实际进度</small><strong>{currentProject.actual}%</strong></div><div><small>进度偏差</small><strong className={variance < -5 ? "red-text" : ""}>{variance > 0 ? "+" : ""}{variance}pp</strong></div></div>
        <div className="hero-actions"><button className="outline-button" onClick={() => window.print()}>导出报告</button>{canUpdate && <><button className="outline-button" onClick={() => { setProjectError(""); setShowProjectEdit(true); }}>编辑信息</button><button className="primary-button" onClick={() => onNavigate("report", currentProject.id)}>更新本周进度</button></>}</div>
      </section>
      <section className="score-explain">
        <div className="score-ring"><strong>{currentProject.score}</strong><span>综合健康度</span></div><div className="score-copy"><h3>项目{statusLabel[currentProject.status]}：评分与一票否决规则共同判定</h3><p>基础分 100，当前累计扣分 {100 - currentProject.score} 分。所有扣分均可追溯至节点、风险或数据更新记录。</p><div className="deductions"><span>进度偏差 <b>{variance}pp</b></span><span>节点预警 <b>{currentProject.cells.filter((cell) => cell === "yellow").length}项</b></span><span>严重节点 <b>{currentProject.cells.filter((cell) => cell === "red").length}项</b></span></div></div><span className="count-badge">规则可解释</span>
      </section>
      <div className="tabs">{["节点计划","周报记录","风险与措施","基线版本","操作审计"].map(t => <button className={tab === t ? "active" : ""} onClick={() => setTab(t)} key={t}>{t}{t === "风险与措施" && <b>{(currentProject.openRiskCount ?? 0) + (currentProject.openActionCount ?? 0)}</b>}</button>)}</div>
      {tab === "节点计划" && <section className="content-card milestone-card">
        <div className="card-title"><div><h2>项目节点计划</h2><p>当前基线 V{currentProject.baselineVersion ?? 1} · 原始基线永久保留　<span>正式调整须经 PMO 审批</span></p></div>{canUpdate && <div className="card-actions"><button className="outline-button" onClick={openMilestoneGovernance}>节点治理</button><button className="outline-button" disabled={!adjustableMilestones.length} onClick={() => setShowBaselineForm(true)}>申请基线变更</button></div>}</div>
        <div className="milestone-list">
          {displayMilestones.map((milestone, i) => {
            const status = milestone.applicable ? milestone.status : "na";
            const effectiveFinish = milestone.actualFinish ?? milestone.forecastFinish;
            return <div className={`milestone-row ${expanded === i ? "expanded" : ""}`} key={milestone.id}>
              <button className="milestone-main" onClick={() => setExpanded(expanded === i ? null : i)}>
                <span className={`milestone-index ${status}`}>{milestone.sequence}</span><span className="milestone-name"><strong>{milestone.name}</strong><small>{milestone.critical ? "◆ 关键节点" : milestone.custom ? "自定义节点" : "标准节点"} · 权重 {milestone.weight}%</small></span>
                <span><small>计划完成</small><strong>{milestone.plannedFinish}</strong></span><span><small>预测 / 实际</small><strong className={status === "red" ? "red-text" : ""}>{status === "na" ? "—" : effectiveFinish ?? "未填报"}</strong></span>
                <span className="milestone-complete"><b>{milestone.completion}%</b><ProgressBar value={milestone.completion} tone={status} /></span><StatusPill status={status} /><em>{expanded === i ? "⌃" : "⌄"}</em>
              </button>
              {expanded === i && <div className="milestone-expand"><div><span>偏差说明</span><p>{milestone.reason || (milestone.deviationDays ? `当前相对批准基线偏差 ${milestone.deviationDays} 天。` : "当前无偏差说明。")}</p></div><div><span>节点口径</span><p>{milestone.applicable ? `${milestone.custom ? "项目自定义" : "标准模板"} · ${milestone.critical ? "关键节点" : "普通节点"} · 计划 ${milestone.plannedStart} 至 ${milestone.plannedFinish}` : "该节点已标记为不适用，不进入项目进度计算。"}</p></div><button onClick={() => setTab("操作审计")}>查看完整记录 →</button></div>}
            </div>;
          })}
        </div>
      </section>}
      {tab === "风险与措施" && <RiskActionPanel projectId={currentProject.id} canEdit={canUpdate} onDataChanged={onDataChanged} />}
      {(tab === "周报记录" || tab === "基线版本" || tab === "操作审计") && <ProjectActivityPanel projectId={currentProject.id} tab={tab} />}
    </div>
    {showMilestoneGovernance && <div className="modal-backdrop" onClick={() => setShowMilestoneGovernance(false)}><section className="create-modal milestone-governance-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowMilestoneGovernance(false)}>×</button><span className="modal-kicker">PROJECT MILESTONE GOVERNANCE</span><h2>项目节点治理</h2><p>{currentProject.name} · 可调整节点顺序、权重、关键标识及适用性；计划完成日须通过基线变更调整。</p><div className="project-milestone-grid"><div className="project-milestone-head"><span>序号</span><span>节点名称</span><span>权重</span><span>关键</span><span>适用</span><span>来源</span></div>{milestoneDraft.map((row) => <div className={`project-milestone-row ${row.applicable ? "" : "inactive"}`} key={row.id}><input type="number" min="1" max="99" value={row.sequence} onChange={(event) => updateMilestoneDraft(row.id, "sequence", Number(event.target.value))} /><input value={row.name} onChange={(event) => updateMilestoneDraft(row.id, "name", event.target.value)} /><label className="weight-input"><input type="number" min="0" max="100" step="0.5" value={row.weight} onChange={(event) => updateMilestoneDraft(row.id, "weight", Number(event.target.value))} /><span>%</span></label><label className="template-check"><input type="checkbox" checked={row.critical} onChange={(event) => updateMilestoneDraft(row.id, "critical", event.target.checked)} /><span>关键</span></label><label className="template-check"><input type="checkbox" checked={row.applicable} onChange={(event) => updateMilestoneDraft(row.id, "applicable", event.target.checked)} /><span>适用</span></label><span className={row.custom ? "custom-source" : "standard-source"}>{row.custom ? "自定义" : "标准"}</span></div>)}</div><div className="governance-summary"><span>节点 {milestoneDraft.length} 个</span><span>适用 {milestoneDraft.filter((row) => row.applicable).length} 个</span><strong className={Math.abs(milestoneDraft.reduce((sum, row) => sum + Number(row.weight || 0), 0) - 100) < 0.01 ? "weight-ok" : "weight-error"}>权重合计 {milestoneDraft.reduce((sum, row) => sum + Number(row.weight || 0), 0).toFixed(1)}%</strong></div>{milestoneError && <div className="form-error">! {milestoneError}</div>}<form className="custom-milestone-form" onSubmit={createCustomMilestone}><h3>追加项目自定义节点</h3><div className="modal-form-grid"><label>节点名称<input name="name" required /></label><label>节点序号<input name="sequence" type="number" min="1" max="99" required /></label><label>计划开始日<input name="plannedStart" type="date" required /></label><label>计划完成日<input name="plannedFinish" type="date" required /></label></div><label className="template-check custom-critical"><input name="critical" type="checkbox" /><span>标记为关键节点</span></label><button className="outline-button" disabled={milestoneWorking}>＋ 新增零权重节点</button></form><div className="modal-actions"><button className="outline-button" onClick={() => setShowMilestoneGovernance(false)}>取消</button><button className="primary-button" disabled={milestoneWorking || Math.abs(milestoneDraft.reduce((sum, row) => sum + Number(row.weight || 0), 0) - 100) >= 0.01} onClick={saveMilestoneGovernance}>{milestoneWorking ? "正在保存…" : "保存节点治理"}</button></div></section></div>}
    {showBaselineForm && <div className="modal-backdrop" onClick={() => setShowBaselineForm(false)}><section className="create-modal baseline-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowBaselineForm(false)}>×</button><span className="modal-kicker">BASELINE CHANGE</span><h2>申请基线变更</h2><p>{currentProject.name} · 当前批准基线 V{currentProject.baselineVersion ?? 1}</p><form onSubmit={requestBaselineChange}><div className="modal-form-grid"><label>调整节点<select name="milestoneId" required>{adjustableMilestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.name}（当前 {milestone.plannedFinish}）</option>)}</select></label><label>新计划完成日<input name="to" type="date" required /></label></div><label className="full-label">变更原因<textarea name="reason" minLength={10} required placeholder="说明触发原因、决策依据和不可通过纠偏消化的原因" /></label><label className="full-label">影响评估<textarea name="impact" minLength={10} required placeholder="说明对总体工期、成本、范围、资源和年度目标的影响" /></label>{baselineError && <div className="form-error" role="alert">! {baselineError}</div>}<div className="modal-actions"><button type="button" className="outline-button" onClick={() => setShowBaselineForm(false)}>取消</button><button className="primary-button" disabled={baselineWorking}>{baselineWorking ? "正在提交…" : "提交 PMO 审批"}</button></div></form></section></div>}
    {showProjectEdit && <div className="modal-backdrop" onClick={() => setShowProjectEdit(false)}><section className="create-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowProjectEdit(false)}>×</button><span className="modal-kicker">PROJECT PROFILE</span><h2>编辑项目基本信息</h2><p>{currentProject.id} · 计划日期调整不在此处进行，须通过基线变更审批。</p><form onSubmit={saveProject}><div className="modal-form-grid"><label>项目名称<input name="name" defaultValue={currentProject.name} required /></label><label>所属组织<input name="org" defaultValue={currentProject.org} required /></label><label>项目类型<select name="type" defaultValue={currentProject.type}><option>核心系统</option><option>业务平台</option><option>数据平台</option><option>技术底座</option><option>其他</option></select></label><label>风险等级<select name="riskLevel" defaultValue={currentProject.risk === "高" ? "high" : currentProject.risk === "中" ? "medium" : "low"}><option value="low">低风险</option><option value="medium">中风险</option><option value="high">高风险</option></select></label><label>项目经理<input name="ownerName" defaultValue={currentProject.owner} disabled={!canChangeOwner} required /></label><label>项目经理邮箱<input name="ownerEmail" type="email" defaultValue={currentProject.ownerEmail ?? ""} disabled={!canChangeOwner} required={canChangeOwner} /></label></div>{!canChangeOwner && <div className="form-hint">项目经理可维护业务信息；负责人调整仅限 PMO 或系统管理员。</div>}{projectError && <div className="form-error" role="alert">! {projectError}</div>}<div className="modal-actions"><button type="button" className="outline-button" onClick={() => setShowProjectEdit(false)}>取消</button><button className="primary-button" disabled={projectWorking}>{projectWorking ? "正在保存…" : "保存项目信息"}</button></div></form></section></div>}
    {baselineSuccess && <div className="toast"><span>✓</span><div><strong>基线变更申请已提交</strong><p>PMO 审批前当前批准基线保持不变。</p></div></div>}
    {projectSuccess && <div className="toast"><span>✓</span><div><strong>项目信息已更新</strong><p>修改已写入操作审计。</p></div></div>}
  </div>;
}

function WeeklyReport({ onNavigate, onDataChanged, projectId, projectData = projects, identity, snapshot }: { onNavigate: Navigate; onDataChanged: () => Promise<void>; projectId: string; projectData?: ProjectData[]; identity: Identity | null; snapshot: DashboardSnapshot | null }) {
  const currentProject =
    projectData.find((project) => project.id === projectId) ??
    projectData[0] ??
    projects[0];
  const reportingPeriod = useMemo(() => {
    const current = currentReportingPeriod();
    return snapshot?.weekKey === current.weekKey
      ? currentReportingPeriod(7)
      : current;
  }, [snapshot?.weekKey]);
  const applicableMilestones = useMemo(
    () =>
      [...(currentProject.milestones ?? [])]
        .filter((milestone) => milestone.applicable)
        .sort((left, right) => left.sequence - right.sequence),
    [currentProject.milestones],
  );
  const recommendedMilestone = useMemo(
    () =>
      applicableMilestones.find(
        (milestone) =>
          milestone.completion < 100 &&
          (milestone.status === "red" || milestone.status === "yellow"),
      ) ??
      applicableMilestones.find((milestone) => milestone.completion < 100) ??
      applicableMilestones.at(-1),
    [applicableMilestones],
  );
  const [selectedSequence, setSelectedSequence] = useState(0);
  const [completion, setCompletion] = useState(0);
  const [forecastFinish, setForecastFinish] = useState("");
  const [actualFinish, setActualFinish] = useState("");
  const [declared, setDeclared] = useState(currentProject.declared);
  const [reason, setReason] = useState("");
  const [actionName, setActionName] = useState("");
  const [actionOwner, setActionOwner] = useState(currentProject.owner);
  const [recoveryDate, setRecoveryDate] = useState("");
  const [actionDetail, setActionDetail] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(true);
  const [submitError, setSubmitError] = useState("");
  const [attachmentRows, setAttachmentRows] = useState<AttachmentData[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const selectedMilestone =
    applicableMilestones.find(
      (milestone) => milestone.sequence === selectedSequence,
    ) ?? recommendedMilestone;
  const systemProgress = useMemo(() => {
    const totalWeight = applicableMilestones.reduce(
      (sum, milestone) => sum + milestone.weight,
      0,
    );
    if (!totalWeight) return 0;
    return Number(
      (
        applicableMilestones.reduce(
          (sum, milestone) =>
            sum +
            milestone.weight *
              (milestone.sequence === selectedMilestone?.sequence
                ? completion
                : milestone.completion),
          0,
        ) / totalWeight
      ).toFixed(1),
    );
  }, [applicableMilestones, completion, selectedMilestone?.sequence]);
  const diff = Number((declared - systemProgress).toFixed(1));
  const effectiveFinish =
    completion >= 100 ? actualFinish || forecastFinish : forecastFinish;
  const deviationDays =
    selectedMilestone && effectiveFinish
      ? daysBetween(selectedMilestone.plannedFinish, effectiveFinish)
      : selectedMilestone?.deviationDays ?? 0;
  const todayParts = shanghaiDateParts();
  const today = `${todayParts.year}-${String(todayParts.month).padStart(2, "0")}-${String(todayParts.day).padStart(2, "0")}`;
  const overdue =
    Boolean(selectedMilestone) &&
    completion < 100 &&
    selectedMilestone!.plannedFinish < today;
  const yellowDays = selectedMilestone?.critical ? 1 : 4;
  const redDays = selectedMilestone?.critical ? 4 : 8;
  const previewStatus: Status = !selectedMilestone
    ? "na"
    : overdue || deviationDays >= redDays
      ? "red"
      : deviationDays >= yellowDays
        ? "yellow"
        : "green";
  const requiresAction =
    previewStatus === "red" || previewStatus === "yellow";
  const actionComplete = Boolean(
    actionName.trim() &&
      actionOwner.trim() &&
      recoveryDate &&
      actionDetail.trim(),
  );
  const completionItems = [
    true,
    Boolean(selectedMilestone),
    Boolean(reason.trim()),
    !requiresAction || actionComplete,
  ];
  const formCompleteness = Math.round(
    (completionItems.filter(Boolean).length / completionItems.length) * 100,
  );

  const loadAttachments = useCallback(async () => {
    const response = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/attachments?weekKey=${encodeURIComponent(reportingPeriod.weekKey)}`,
      { cache: "no-store" },
    );
    const result = (await response.json()) as {
      attachments?: AttachmentData[];
      error?: string;
    };
    if (!response.ok) {
      throw new Error(result.error || "附件列表读取失败");
    }
    setAttachmentRows(result.attachments ?? []);
  }, [projectId, reportingPeriod.weekKey]);

  useEffect(() => {
    if (!recommendedMilestone) return;
    const timer = window.setTimeout(() => {
      setSelectedSequence(recommendedMilestone.sequence);
      setCompletion(recommendedMilestone.completion);
      setForecastFinish(
        recommendedMilestone.forecastFinish ??
          recommendedMilestone.plannedFinish,
      );
      setActualFinish(recommendedMilestone.actualFinish ?? "");
      setReason(recommendedMilestone.reason ?? "");
      setDeclared(currentProject.declared);
      setActionOwner(currentProject.owner);
      setRecoveryDate(
        recommendedMilestone.forecastFinish ??
          recommendedMilestone.plannedFinish,
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    currentProject.declared,
    currentProject.owner,
    recommendedMilestone,
  ]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoadingDraft(true);
      fetch(
        `/api/projects/${encodeURIComponent(projectId)}/weekly-reports`,
        { cache: "no-store" },
      )
        .then(async (response) => {
          const result = (await response.json()) as {
            error?: string;
            weeklyReports?: WeeklyReportRow[];
          };
          if (!response.ok) {
            throw new Error(result.error || "无法读取本周草稿");
          }
          if (!active) return;
          const draft = result.weeklyReports?.find(
            (row) =>
              row.weekKey === reportingPeriod.weekKey &&
              row.status === "draft",
          )?.draft;
          if (!draft) return;
          if (draft.milestone?.sequence) {
            setSelectedSequence(draft.milestone.sequence);
          }
          if (draft.milestone?.completion !== undefined) {
            setCompletion(draft.milestone.completion);
          }
          setForecastFinish(draft.milestone?.forecastFinish ?? "");
          setActualFinish(draft.milestone?.actualFinish ?? "");
          if (draft.declaredProgress !== undefined) {
            setDeclared(draft.declaredProgress);
          }
          setReason(draft.reason ?? "");
          setActionName(draft.action?.name ?? "");
          setActionOwner(draft.action?.owner ?? currentProject.owner);
          setRecoveryDate(draft.action?.recoveryDate ?? "");
          setActionDetail(draft.action?.detail ?? "");
          setSavedMessage("已恢复本周服务器草稿");
        })
        .catch((draftError) => {
          if (active) {
            setSubmitError(
              draftError instanceof Error
                ? draftError.message
                : "无法读取本周草稿",
            );
          }
        })
        .finally(() => {
          if (active) setLoadingDraft(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [currentProject.owner, projectId, reportingPeriod.weekKey]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      loadAttachments().catch((attachmentError) => {
        if (active) {
          setSubmitError(
            attachmentError instanceof Error
              ? attachmentError.message
              : "附件列表读取失败",
          );
        }
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [loadAttachments]);

  function selectMilestone(sequence: number) {
    const milestone = applicableMilestones.find(
      (row) => row.sequence === sequence,
    );
    if (!milestone) return;
    setSelectedSequence(sequence);
    setCompletion(milestone.completion);
    setForecastFinish(milestone.forecastFinish ?? milestone.plannedFinish);
    setActualFinish(milestone.actualFinish ?? "");
    setReason(milestone.reason ?? "");
    setRecoveryDate(milestone.forecastFinish ?? milestone.plannedFinish);
    setSubmitError("");
  }

  async function uploadAttachment(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setUploadingAttachment(true);
    setSubmitError("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("weekKey", reportingPeriod.weekKey);
      if (selectedMilestone) {
        form.set("milestoneId", String(selectedMilestone.id));
      }
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/attachments`,
        { method: "POST", body: form },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "附件上传失败");
      }
      await loadAttachments();
      setSavedMessage(`${file.name} 已上传`);
      window.setTimeout(() => setSavedMessage(""), 3000);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "附件上传失败");
    } finally {
      setUploadingAttachment(false);
    }
  }

  async function deleteAttachment(attachment: AttachmentData) {
    setUploadingAttachment(true);
    setSubmitError("");
    try {
      const response = await fetch(`/api/attachments/${attachment.id}`, {
        method: "DELETE",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "附件删除失败");
      }
      await loadAttachments();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "附件删除失败");
    } finally {
      setUploadingAttachment(false);
    }
  }

  async function saveWeeklyReport(submitMode: "draft" | "submitted") {
    if (!selectedMilestone) {
      setSubmitError("当前项目没有可填报的适用节点。");
      return;
    }
    if (submitMode === "submitted" && !reason.trim()) {
      setSubmitError("请填写本周进展或偏差原因。");
      return;
    }
    if (submitMode === "submitted" && requiresAction && !actionComplete) {
      setSubmitError("红黄节点必须完整填写纠偏措施、责任人、恢复日期和具体行动。");
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/weekly-reports`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          submitMode,
          weekKey: reportingPeriod.weekKey,
          systemProgress,
          declaredProgress: declared,
          reason,
          forecastFinish: forecastFinish || undefined,
          milestone: {
            sequence: selectedMilestone.sequence,
            completion,
            forecastFinish: forecastFinish || undefined,
            actualFinish:
              completion >= 100 ? actualFinish || forecastFinish : undefined,
          },
          action:
            requiresAction || actionName.trim() || actionDetail.trim()
              ? {
                  name: actionName,
                  owner: actionOwner,
                  recoveryDate,
                  detail: actionDetail,
                }
              : undefined,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(
          result.error ||
            (submitMode === "draft" ? "草稿保存失败" : "周报提交失败"),
        );
      }
      if (submitMode === "submitted") await onDataChanged();
      setSavedMessage(
        submitMode === "draft"
          ? `${reportingPeriod.weekKey} 草稿已保存`
          : `${reportingPeriod.weekKey} 周报已提交`,
      );
      window.setTimeout(() => setSavedMessage(""), 3000);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : submitMode === "draft"
            ? "草稿保存失败"
            : "周报提交失败",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const rolledToNextWeek =
    snapshot?.weekKey === currentReportingPeriod().weekKey &&
    snapshot.weekKey !== reportingPeriod.weekKey;

  return <div className="workspace-page">
    <WorkspaceHeader title="周度进度填报" subtitle={`${reportingPeriod.year}年第${reportingPeriod.week}周 · 填报截止 ${reportingPeriod.fridayLabel} 17:00`} onNavigate={onNavigate} identity={identity} />
    <div className="page-content report-page">
      <div className="report-top"><div><button className="back-link" onClick={() => onNavigate("project", projectId)}>← 返回项目详情</button><h2>{currentProject.name}</h2><p>{currentProject.owner}负责 · {rolledToNextWeek ? `${snapshot?.weekKey} 已锁定，已自动切换到下一填报周期` : "本周数据将进入下一次周度快照"}</p></div><div className="save-state"><span>{loadingDraft ? "正在检查草稿" : "服务端校验已启用"}</span><i /> {loadingDraft ? "同步中" : "实时"}</div></div>
      <div className="report-layout">
        <div className="report-form">
          <section className="content-card form-section">
            <div className="form-title"><span>01</span><div><h3>总体进度确认</h3><p>系统根据节点权重自动计算，申报值偏差超过 5pp 将提示核验。</p></div></div>
            <div className="progress-compare"><div><small>系统计算进度</small><strong>{systemProgress}%</strong><ProgressBar value={systemProgress} /></div><div><small>项目经理申报进度</small><strong>{declared}%</strong><input aria-label="项目经理申报进度" type="range" min="0" max="100" value={declared} onChange={e => setDeclared(Number(e.target.value))} /></div><div className={Math.abs(diff) > 5 ? "compare-warning" : "compare-ok"}><span>{Math.abs(diff) > 5 ? "!" : "✓"}</span><strong>{diff > 0 ? "+" : ""}{diff}pp</strong><small>{Math.abs(diff) > 5 ? "需说明差异" : "口径一致"}</small></div></div>
          </section>
          <section className="content-card form-section">
            <div className="form-title"><span>02</span><div><h3>节点进展更新</h3><p>选择一个本周发生变化或需要关注的适用节点。</p></div></div>
            {selectedMilestone ? <div className={`node-form ${previewStatus === "yellow" ? "warning-node" : ""}`}>
              <div className="node-form-head"><div><StatusPill status={previewStatus} /><h4>{selectedMilestone.name} {selectedMilestone.critical && <span>◆ 关键节点</span>}</h4></div><small>计划完成 {selectedMilestone.plannedFinish} · 原完成度 {selectedMilestone.completion}%</small></div>
              <div className="form-grid"><label>更新节点<select value={selectedMilestone.sequence} onChange={(event) => selectMilestone(Number(event.target.value))}>{applicableMilestones.map((milestone) => <option key={milestone.id} value={milestone.sequence}>{milestone.sequence}. {milestone.name}{milestone.status === "red" ? "（红）" : milestone.status === "yellow" ? "（黄）" : ""}</option>)}</select></label><label>完成度<div className="percent-input"><input aria-label="节点完成度" type="number" min="0" max="100" step="1" value={completion} onChange={(event) => setCompletion(Math.min(100, Math.max(0, Number(event.target.value))))} /><span>%</span></div></label><label>{completion >= 100 ? "实际完成日期" : "预测完成日期"}<input type="date" value={completion >= 100 ? actualFinish : forecastFinish} onChange={(event) => completion >= 100 ? setActualFinish(event.target.value) : setForecastFinish(event.target.value)} /></label><label>相对基线偏差<div className={`readonly-input ${deviationDays >= redDays ? "red-text" : deviationDays >= yellowDays ? "yellow-text" : ""}`}>{deviationDays > 0 ? "+" : ""}{deviationDays} 天</div></label></div>
              <label className="full-label">本周进展 / 偏差原因 <b>*</b><textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="说明本周完成事项；如有偏差，说明根因、影响与判断依据" /></label>
            </div> : <div className="empty-state">当前项目没有可填报的适用节点</div>}
          </section>
          {requiresAction && <section className="content-card form-section">
            <div className="form-title"><span>03</span><div><h3>异常纠偏措施</h3><p>当前节点已触发{previewStatus === "red" ? "红色" : "黄色"}预警，正式提交前必须完整填写。</p></div></div>
            <div className="action-form"><div className="form-grid"><label>措施名称 <b>*</b><input value={actionName} onChange={(event) => setActionName(event.target.value)} placeholder="例如：接口联调专项攻坚" /></label><label>责任人 <b>*</b><input value={actionOwner} onChange={(event) => setActionOwner(event.target.value)} /></label><label>预计恢复日期 <b>*</b><input type="date" value={recoveryDate} onChange={(event) => setRecoveryDate(event.target.value)} /></label><label>措施状态<div className="readonly-input">进行中</div></label></div><label className="full-label">具体行动 <b>*</b><input value={actionDetail} onChange={(event) => setActionDetail(event.target.value)} placeholder="说明动作、资源投入、检查频率和完成标准" /></label></div>
          </section>}
          <section className="content-card form-section attachment-section">
            <div className="form-title"><span>04</span><div><h3>支撑附件</h3><p>上传会议纪要、验收材料、进度截图或问题清单；单个文件不超过10MB。</p></div><label className={`attachment-upload ${uploadingAttachment ? "disabled" : ""}`}>＋ {uploadingAttachment ? "正在处理…" : "选择文件"}<input type="file" disabled={uploadingAttachment} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.txt,.csv,.zip" onChange={uploadAttachment} /></label></div>
            {attachmentRows.length ? <div className="attachment-list">{attachmentRows.map((attachment) => <div key={attachment.id}><span className="attachment-type">↧</span><div><a href={`/api/attachments/${attachment.id}`} target="_blank" rel="noreferrer">{attachment.filename}</a><small>{formatFileSize(attachment.sizeBytes)} · {attachment.uploadedBy} · {attachment.createdAt.replace("T", " ").slice(0, 16)}</small></div><button type="button" disabled={uploadingAttachment} onClick={() => deleteAttachment(attachment)}>删除</button></div>)}</div> : <div className="attachment-empty">尚未上传附件，本项为选填。</div>}
          </section>
          {submitError && <div className="form-error" role="alert">! {submitError}</div>}
          <div className="report-actions"><button className="outline-button" disabled={submitting || loadingDraft} onClick={() => saveWeeklyReport("draft")}>{submitting ? "处理中…" : "保存草稿"}</button><button className="primary-button" disabled={submitting || loadingDraft || !selectedMilestone} onClick={() => saveWeeklyReport("submitted")}>{submitting ? "正在提交…" : "提交本周进度"}</button></div>
        </div>
        <aside className="report-aside">
          <div className="aside-card"><h3>填报完整度</h3><div className="completion-circle" style={{ background: `conic-gradient(var(--blue) ${formCompleteness}%,#e9edf3 0)` }}><strong>{formCompleteness}%</strong></div><ul><li className="done">✓ 总体进度</li><li className={selectedMilestone ? "done" : ""}>{selectedMilestone ? "✓" : "○"} 节点更新</li><li className={reason.trim() ? "done" : ""}>{reason.trim() ? "✓" : "○"} 本周进展说明</li><li className={!requiresAction || actionComplete ? "done" : ""}>{!requiresAction || actionComplete ? "✓" : "○"} 纠偏措施</li><li className={attachmentRows.length ? "done" : ""}>{attachmentRows.length ? "✓" : "○"} 支撑附件（选填）</li></ul></div>
          <div className="aside-card rule-tips"><h3>本次规则检查</h3><p className={Math.abs(diff) <= 5 ? "pass" : "warning"}>{Math.abs(diff) <= 5 ? "✓ 申报与计算进度一致" : `▲ 申报与计算相差 ${Math.abs(diff).toFixed(1)}pp`}</p><p className={reason.trim() ? "pass" : "warning"}>{reason.trim() ? "✓ 已填写本周进展说明" : "▲ 尚未填写进展说明"}</p><p className={!requiresAction || actionComplete ? "pass" : "warning"}>{!requiresAction ? "✓ 当前节点未触发措施必填" : actionComplete ? "✓ 纠偏措施字段完整" : "▲ 红黄节点措施尚不完整"}</p><p className={deviationDays > 0 ? "warning" : "pass"}>{deviationDays > 0 ? `▲ 预测完成日晚于基线 ${deviationDays} 天` : "✓ 节点未晚于批准基线"}</p></div>
          <div className="aside-card"><h3>快照提示</h3><p>{reportingPeriod.fridayLabel} 17:00 PMO 将锁定第{reportingPeriod.week}周快照。锁定后本周期不可再修改。</p></div>
        </aside>
      </div>
    </div>
    {savedMessage && <div className="toast"><span>✓</span><div><strong>{savedMessage}</strong><p>{savedMessage.includes("草稿") ? "可刷新页面或稍后继续编辑。" : `已进入第${reportingPeriod.week}周待锁定数据。`}</p></div></div>}
  </div>;
}

function RuleConfigPanel() {
  const [values, setValues] = useState({
    normalYellowDays: 4,
    normalRedDays: 8,
    criticalYellowDays: 1,
    criticalRedDays: 4,
    greenScore: 85,
    yellowScore: 70,
  });
  const [version, setVersion] = useState(1);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  type RuleHistoryRow = typeof values & {
    id: number;
    version: number;
    active: boolean;
    createdBy: string;
    createdAt: string;
  };
  const [history, setHistory] = useState<RuleHistoryRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const loadRuleHistory = useCallback(async () => {
    const response = await fetch("/api/rule-configs", { cache: "no-store" });
    const data = (await response.json()) as {
      ruleConfigs?: RuleHistoryRow[];
      error?: string;
    };
    if (!response.ok) {
      throw new Error(data.error || "规则版本读取失败");
    }
    const rows = data.ruleConfigs ?? [];
    setHistory(rows);
    const rule = rows[0];
    if (rule) {
      setValues({
        normalYellowDays: rule.normalYellowDays,
        normalRedDays: rule.normalRedDays,
        criticalYellowDays: rule.criticalYellowDays,
        criticalRedDays: rule.criticalRedDays,
        greenScore: rule.greenScore,
        yellowScore: rule.yellowScore,
      });
      setVersion(rule.version);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadRuleHistory().catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRuleHistory]);

  async function publishRule() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/rule-configs", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = (await response.json()) as {
        error?: string;
        rule?: { version: number };
      };
      if (!response.ok) throw new Error(result.error || "规则发布失败");
      setVersion(result.rule?.version ?? version + 1);
      setMessage("规则已发布，新版本将用于后续状态计算。");
      await loadRuleHistory();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "规则发布失败");
    } finally {
      setSaving(false);
    }
  }

  const field = (key: keyof typeof values, label: string, suffix: string) =>
    <label>{label}<div className="rule-input"><input type="number" min="0" max="365" value={values[key]} onChange={(event) => setValues((current) => ({ ...current, [key]: Number(event.target.value) }))} /><span>{suffix}</span></div></label>;

  return <section className="content-card rule-panel"><div className="card-title"><div><h2>预警规则配置</h2><p>当前生效版本 V{version} · 发布后保留历史版本并记录操作人</p></div><span className="count-badge">V{version} 生效中</span></div><div className="rule-sections"><div><h3>普通节点时间阈值</h3><p>根据预测或实际完成日期相对批准基线的偏差天数判定。</p><div className="rule-fields">{field("normalYellowDays","黄色起始阈值","天")}{field("normalRedDays","红色起始阈值","天")}</div></div><div><h3>关键节点时间阈值</h3><p>关键节点采用更严格的预警口径，并可触发项目红色一票否决。</p><div className="rule-fields">{field("criticalYellowDays","黄色起始阈值","天")}{field("criticalRedDays","红色起始阈值","天")}</div></div><div><h3>项目健康度阈值</h3><p>综合得分达到绿色阈值为正常，低于黄色阈值为严重。</p><div className="rule-fields">{field("greenScore","绿色最低分","分")}{field("yellowScore","黄色最低分","分")}</div></div></div>{showHistory && <div className="rule-history"><div className="table-head"><span>版本</span><span>普通节点</span><span>关键节点</span><span>健康度</span><span>发布人</span><span>发布时间</span></div>{history.map((rule) => <div className="table-row" key={rule.id}><span><strong>V{rule.version}</strong>{rule.active && <small>当前</small>}</span><span>黄 {rule.normalYellowDays}天 / 红 {rule.normalRedDays}天</span><span>黄 {rule.criticalYellowDays}天 / 红 {rule.criticalRedDays}天</span><span>绿 ≥{rule.greenScore} / 黄 ≥{rule.yellowScore}</span><span>{rule.createdBy}</span><span>{rule.createdAt.replace("T"," ").slice(0,16)}</span></div>)}</div>}{message && <div className={message.includes("已发布") ? "success-message" : "form-error"}>{message}</div>}<div className="rule-actions"><button className="outline-button" onClick={() => setShowHistory((value) => !value)}>{showHistory ? "收起历史版本" : `查看历史版本（${history.length}）`}</button><button className="primary-button" disabled={saving} onClick={publishRule}>{saving ? "正在发布…" : "发布新版本"}</button></div></section>;
}

function AdminPage({ onNavigate, identity }: { onNavigate: Navigate; identity: Identity | null }) {
  type UserRow = { email: string; displayName: string; role: "executive" | "pmo" | "manager" | "admin"; active: boolean; createdAt: string };
  type AuditRow = { id: number; actorEmail: string; action: string; entityType: string; entityId: string; createdAt: string };
  const [usersData, setUsersData] = useState<UserRow[]>([]);
  const [auditData, setAuditData] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingUser, setUpdatingUser] = useState("");
  const [error, setError] = useState("");
  const actionNames: Record<string, string> = {
    "weekly_report.submit": "提交周报",
    "baseline_change.approve": "批准基线",
    "snapshot.lock": "锁定快照",
    "project.create": "创建项目",
    "project.update": "更新项目",
    "user.update": "更新用户",
    "rule_config.publish": "发布规则",
    "risk.create": "登记风险",
    "risk.update": "更新风险",
    "corrective_action.create": "新建纠偏措施",
    "corrective_action.update": "更新纠偏措施",
    "baseline_change.request": "申请基线变更",
    "baseline_change.reject": "驳回基线变更",
    "snapshot.reopen": "重新打开快照",
    "attachment.upload": "上传附件",
    "attachment.delete": "删除附件",
  };

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [usersResponse, auditResponse] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/audit-logs?limit=50"),
      ]);
      const usersResult = (await usersResponse.json()) as { users?: UserRow[]; error?: string };
      const auditResult = (await auditResponse.json()) as { auditLogs?: AuditRow[]; error?: string };
      if (!usersResponse.ok) throw new Error(usersResult.error || "用户数据读取失败");
      if (!auditResponse.ok) throw new Error(auditResult.error || "审计数据读取失败");
      setUsersData(usersResult.users ?? []);
      setAuditData(auditResult.auditLogs ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "系统管理数据读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAdminData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAdminData]);

  async function updateRole(user: UserRow, role: UserRow["role"]) {
    setUpdatingUser(user.email);
    setError("");
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(user.email)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "角色更新失败");
      await loadAdminData();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "角色更新失败");
    } finally {
      setUpdatingUser("");
    }
  }

  async function toggleUser(user: UserRow) {
    setUpdatingUser(user.email);
    setError("");
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(user.email)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: !user.active }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "账号状态更新失败");
      await loadAdminData();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "账号状态更新失败");
    } finally {
      setUpdatingUser("");
    }
  }

  const canEditUsers = identity?.role === "admin";
  return <div className="workspace-page"><WorkspaceHeader title="系统管理" subtitle="用户角色、权限边界与全量操作审计" onNavigate={onNavigate} identity={identity} /><div className="page-content admin-page">{error && <div className="form-error" role="alert">! {error}</div>}<div className="admin-grid"><section className="content-card"><div className="card-title"><div><h2>用户与角色</h2><p>{canEditUsers ? "可调整角色并启用或停用账号；身份仍由登录平台确认" : "PMO 可查看账号，只有系统管理员可调整权限"}</p></div><span className="count-badge">{usersData.filter((user) => user.active).length} / {usersData.length} 启用</span></div>{loading ? <div className="panel-loading">正在读取用户数据…</div> : <div className="user-table"><div className="table-head"><span>用户</span><span>角色</span><span>账号状态</span><span>加入时间</span></div>{usersData.map((user) => <div className={`table-row ${user.active ? "" : "inactive-user"}`} key={user.email}><span className="admin-user"><i>{user.displayName[0]}</i><b>{user.displayName}<small>{user.email}</small></b></span><select value={user.role} disabled={!canEditUsers || updatingUser === user.email || !user.active || user.email === identity?.email} onChange={(event) => updateRole(user, event.target.value as UserRow["role"])}><option value="executive">管理层只读</option><option value="manager">项目经理</option><option value="pmo">PMO</option><option value="admin">系统管理员</option></select><button type="button" className={`user-state-button ${user.active ? "active" : "disabled"}`} disabled={!canEditUsers || updatingUser === user.email || user.email === identity?.email} onClick={() => toggleUser(user)} aria-label={`${user.active ? "停用" : "启用"} ${user.displayName}`}>{updatingUser === user.email ? "处理中…" : user.active ? "● 已启用" : "— 已停用"}</button><span>{user.createdAt.slice(0, 10)}</span></div>)}</div>}</section><section className="content-card"><div className="card-title"><div><h2>操作审计</h2><p>记录所有关键数据与权限变更</p></div><button className="text-button" onClick={loadAdminData}>刷新</button></div>{loading ? <div className="panel-loading">正在读取审计记录…</div> : <div className="audit-list">{auditData.length ? auditData.map((row) => <div key={row.id}><span className="audit-dot" /><div><strong>{actionNames[row.action] ?? row.action}</strong><p>{row.actorEmail} · {row.entityType} / {row.entityId}</p></div><time>{row.createdAt.replace("T"," ").slice(0,16)}</time></div>) : <div className="empty-state">暂无审计记录</div>}</div>}</section></div></div></div>;
}

function PmoPage({ onNavigate, onDataChanged, identity, projectData = projects }: { onNavigate: Navigate; onDataChanged: () => Promise<void>; identity: Identity | null; projectData?: ProjectData[] }) {
  type SnapshotRow = {
    id: number;
    weekKey: string;
    version: number;
    status: "locked" | "reopened";
    projectCount: number;
    completeness: number;
    lockedAt: string;
    lockedBy: string;
  };
  type BaselineRow = {
    id: number;
    projectId: string;
    versionFrom: number;
    versionTo: number;
    reason: string;
    impact: string;
    status: "pending" | "approved" | "rejected";
    requestedBy: string;
    requestedAt: string;
    rejectionReason?: string;
    changes: Array<{
      milestone: string;
      from: string;
      to: string;
      days: number;
    }>;
  };
  type TemplateRow = {
    id: number;
    code: string;
    name: string;
    sequence: number;
    defaultWeight: number;
    critical: boolean;
    active: boolean;
    description: string;
  };
  const reportingPeriod = useMemo(() => currentReportingPeriod(), []);
  const [renderedAt] = useState(() => Date.now());
  const [locked, setLocked] = useState(false);
  const [snapshotId, setSnapshotId] = useState<number | null>(null);
  const [snapshotVersion, setSnapshotVersion] = useState(1);
  const [snapshotRows, setSnapshotRows] = useState<SnapshotRow[]>([]);
  const [showReopen, setShowReopen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [approved, setApproved] = useState(false);
  const [tab, setTab] = useState("快照锁定");
  const [changeId, setChangeId] = useState(1);
  const [baselineRows, setBaselineRows] = useState<BaselineRow[]>([]);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [working, setWorking] = useState(false);
  const [operationError, setOperationError] = useState("");
  const [templateRows, setTemplateRows] = useState<TemplateRow[]>([]);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateMessage, setTemplateMessage] = useState("");
  const [reportRows, setReportRows] = useState<WeeklyReportRow[]>([]);
  const [notificationWorking, setNotificationWorking] = useState("");
  const [notificationMessage, setNotificationMessage] = useState("");

  useEffect(() => {
    fetch("/api/bootstrap")
      .then(async (response) => {
        if (!response.ok) throw new Error("无法读取PMO数据");
        return response.json();
      })
      .then((data: {
         snapshots?: SnapshotRow[];
         baselineChanges?: BaselineRow[];
         milestoneTemplates?: TemplateRow[];
         weeklyReports?: WeeklyReportRow[];
       }) => {
         const rows = data.snapshots ?? [];
         setSnapshotRows(rows);
         const current = rows
           .filter((snapshot) => snapshot.weekKey === reportingPeriod.weekKey)
           .sort((a, b) => b.version - a.version)[0];
        setLocked(current?.status === "locked");
        setSnapshotId(current?.id ?? null);
        setSnapshotVersion(current?.version ?? 1);
        const changes = data.baselineChanges ?? [];
        setBaselineRows(changes);
        const change =
          changes.find((item) => item.status === "pending") ?? changes[0];
        if (change) {
          setChangeId(change.id);
          setApproved(change.status === "approved");
         }
         setTemplateRows(data.milestoneTemplates ?? []);
         setReportRows(data.weeklyReports ?? []);
       })
       .catch(() => undefined);
  }, [reportingPeriod.weekKey]);

  async function lockSnapshot() {
    setWorking(true);
    setOperationError("");
    try {
      const response = await fetch("/api/snapshots/lock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ weekKey: reportingPeriod.weekKey }),
      });
      const result = (await response.json()) as {
        error?: string;
        snapshot?: SnapshotRow;
      };
      if (!response.ok) throw new Error(result.error || "快照锁定失败");
      setLocked(true);
      if (result.snapshot) {
        setSnapshotId(result.snapshot.id);
        setSnapshotVersion(result.snapshot.version);
        setSnapshotRows((rows) => [result.snapshot!, ...rows]);
      }
      await onDataChanged();
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "快照锁定失败");
    } finally {
      setWorking(false);
    }
  }

  async function reopenSnapshot() {
    if (!snapshotId) return;
    setWorking(true);
    setOperationError("");
    try {
      const response = await fetch(`/api/snapshots/${snapshotId}/reopen`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reopenReason }),
      });
      const result = (await response.json()) as {
        error?: string;
        snapshot?: SnapshotRow;
      };
      if (!response.ok) throw new Error(result.error || "快照重新打开失败");
      setLocked(false);
      setShowReopen(false);
      setReopenReason("");
      setSnapshotRows((rows) =>
        rows.map((row) =>
          row.id === snapshotId ? { ...row, status: "reopened" } : row,
        ),
      );
      await onDataChanged();
    } catch (error) {
      setOperationError(
        error instanceof Error ? error.message : "快照重新打开失败",
      );
    } finally {
      setWorking(false);
    }
  }

  async function approveBaseline() {
    setWorking(true);
    setOperationError("");
    try {
      const response = await fetch(`/api/baseline-changes/${changeId}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "基线审批失败");
      setApproved(true);
      setBaselineRows((rows) =>
        rows.map((row) =>
          row.id === changeId ? { ...row, status: "approved" } : row,
        ),
      );
      await onDataChanged();
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "基线审批失败");
    } finally {
      setWorking(false);
    }
  }
  async function rejectBaseline() {
    setWorking(true);
    setOperationError("");
    try {
      const response = await fetch(
        `/api/baseline-changes/${changeId}/reject`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: rejectReason }),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "基线变更驳回失败");
      setBaselineRows((rows) =>
        rows.map((row) =>
          row.id === changeId
            ? { ...row, status: "rejected", rejectionReason: rejectReason }
            : row,
        ),
      );
      setApproved(false);
      setShowReject(false);
      setRejectReason("");
      await onDataChanged();
    } catch (error) {
      setOperationError(
        error instanceof Error ? error.message : "基线变更驳回失败",
      );
    } finally {
      setWorking(false);
    }
  }
  async function saveTemplates() {
    setTemplateSaving(true);
    setTemplateMessage("");
    try {
      const response = await fetch("/api/milestone-templates", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ templates: templateRows }),
      });
      const result = (await response.json()) as {
        error?: string;
        milestoneTemplates?: TemplateRow[];
      };
      if (!response.ok) throw new Error(result.error || "节点模板发布失败");
      setTemplateRows(result.milestoneTemplates ?? templateRows);
      setTemplateMessage("已发布新的标准节点模板，后续新建项目将使用最新口径。");
      await onDataChanged();
    } catch (error) {
      setTemplateMessage(
        error instanceof Error ? error.message : "节点模板发布失败",
      );
    } finally {
      setTemplateSaving(false);
    }
  }
  function updateTemplate<K extends keyof TemplateRow>(
    id: number,
    key: K,
    value: TemplateRow[K],
  ) {
    setTemplateRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, [key]: value } : row)),
    );
    setTemplateMessage("");
  }
  async function sendNotifications(
    projectIds: string[],
    kind: "report_reminder" | "red_escalation",
  ) {
    if (!projectIds.length) return;
    const operationKey = `${kind}:${projectIds.join(",")}`;
    setNotificationWorking(operationKey);
    setNotificationMessage("");
    setOperationError("");
    try {
      const response = await fetch("/api/notifications/reminders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectIds,
          weekKey: reportingPeriod.weekKey,
          kind,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        sent?: number;
        projects?: number;
      };
      if (!response.ok) {
        throw new Error(result.error || "通知发送失败");
      }
      setNotificationMessage(
        kind === "red_escalation"
          ? `已升级 ${result.projects ?? projectIds.length} 个红色项目，生成 ${result.sent ?? 0} 条站内通知。`
          : `已催报 ${result.projects ?? projectIds.length} 个项目，生成 ${result.sent ?? 0} 条站内通知。`,
      );
    } catch (error) {
      setOperationError(
        error instanceof Error ? error.message : "通知发送失败",
      );
    } finally {
      setNotificationWorking("");
    }
  }
  async function exportSnapshot(snapshot: SnapshotRow) {
    setOperationError("");
    try {
      const response = await fetch(`/api/snapshots/${snapshot.id}`);
      const result = (await response.json()) as {
        error?: string;
        snapshot?: unknown;
      };
      if (!response.ok || !result.snapshot) {
        throw new Error(result.error || "快照导出失败");
      }
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(result.snapshot, null, 2)], {
          type: "application/json;charset=utf-8",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `项目进度快照-${snapshot.weekKey}-V${snapshot.version}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "快照导出失败");
    }
  }
  const activeChange =
    baselineRows.find((change) => change.id === changeId) ?? baselineRows[0];
  const pendingChanges = baselineRows.filter(
    (change) => change.status === "pending",
  );
  const activeProject = projectData.find(
    (project) => project.id === activeChange?.projectId,
  );
  const currentSnapshotRow = snapshotRows.find(
    (snapshot) => snapshot.id === snapshotId,
  );
  const submittedProjectIds = new Set(
    reportRows
      .filter(
        (report) =>
          report.weekKey === reportingPeriod.weekKey &&
          report.status !== "draft",
      )
      .map((report) => report.projectId),
  );
  const submittedReports = reportRows.filter(
    (report) =>
      report.weekKey === reportingPeriod.weekKey &&
      report.status !== "draft",
  );
  const missingProjects = projectData.filter(
    (project) => !submittedProjectIds.has(project.id),
  );
  const redProjects = projectData.filter(
    (project) => project.status === "red",
  );
  const varianceReports = submittedReports.filter(
    (report) => Math.abs(report.variance) > 5,
  );
  const snapshotProjectCount =
    currentSnapshotRow?.projectCount ?? projectData.length;
  const submittedProjectCount = currentSnapshotRow
    ? Math.round(
        (snapshotProjectCount * currentSnapshotRow.completeness) / 100,
      )
    : submittedProjectIds.size;
  const missingProjectCount = Math.max(
    0,
    snapshotProjectCount - submittedProjectCount,
  );
  const currentCompleteness =
    currentSnapshotRow?.completeness ??
    (snapshotProjectCount
      ? Number(((submittedProjectCount / snapshotProjectCount) * 100).toFixed(1))
      : 0);
  const deadline = new Date(`${reportingPeriod.fridayIso}T17:00:00+08:00`);
  const remainingMs = deadline.getTime() - renderedAt;
  const remainingHours = Math.max(0, Math.floor(remainingMs / 3_600_000));
  const countdown =
    remainingMs <= 0
      ? "已到本周锁定时间"
      : `距离本周快照锁定还有 ${Math.floor(remainingHours / 24)}天 ${String(remainingHours % 24).padStart(2, "0")}小时`;
  const deadlineDate = new Date(`${reportingPeriod.fridayIso}T12:00:00+08:00`);
  const calendarMonth = deadlineDate
    .toLocaleString("en-US", { month: "short", timeZone: "Asia/Shanghai" })
    .toUpperCase();
  const calendarDay = String(deadlineDate.getDate()).padStart(2, "0");
  const activeTemplateWeight = templateRows
    .filter((row) => row.active)
    .reduce((sum, row) => sum + Number(row.defaultWeight || 0), 0);
  return <div className="workspace-page">
    <WorkspaceHeader title="PMO 管理中心" subtitle="统一规则、治理数据、锁定管理口径" onNavigate={onNavigate} identity={identity} />
    <div className="page-content pmo-page">
      <div className="pmo-tabs">{["快照锁定","基线变更","节点模板","预警规则"].map(t => <button className={tab === t ? "active" : ""} onClick={() => setTab(t)} key={t}>{t}{t === "基线变更" && <b>{pendingChanges.length}</b>}</button>)}</div>
      {tab === "快照锁定" && <>
        <section className={`snapshot-banner ${locked ? "locked" : ""}`}>
          <div className="snapshot-calendar"><span>{calendarMonth}</span><strong>{calendarDay}</strong></div><div><span className="kicker">{reportingPeriod.year}年第{reportingPeriod.week}周 · 周五17:00</span><h2>{locked ? "本周快照已锁定" : snapshotId ? "快照已重新打开，等待修订后锁定新版本" : countdown}</h2><p>{locked ? "管理层大屏已切换至最新锁定口径，历史版本已永久保留。" : `${reportingPeriod.fridayLabel}锁定；重新锁定将生成新版本，历史版本永久保留。`}</p></div><div className="snapshot-actions">{locked ? <><button className="locked-button" disabled>✓ 已锁定 · V{snapshotVersion}</button><button className="outline-button" onClick={() => setShowReopen(true)}>重新打开</button></> : <button className="primary-button" disabled={working} onClick={lockSnapshot}>{working ? "正在锁定…" : `锁定为 V${snapshotVersion + (snapshotId ? 1 : 0)}`}</button>}</div>
        </section>
        {showReopen && <section className="content-card reopen-panel"><div><h3>重新打开第{reportingPeriod.week}周快照</h3><p>重新打开后该周期允许修订，下一次锁定将生成不可覆盖的新版本。</p></div><textarea value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} placeholder="请说明重新打开原因、修订范围及授权依据" /><div><button className="outline-button" onClick={() => setShowReopen(false)}>取消</button><button className="danger-outline" disabled={working || reopenReason.trim().length < 5} onClick={reopenSnapshot}>{working ? "正在处理…" : "确认重新打开"}</button></div></section>}
        {operationError && <div className="form-error" role="alert">! {operationError}</div>}
        {notificationMessage && <div className="form-success">{notificationMessage}</div>}
        <div className="pmo-grid">
          <section className="content-card quality-panel"><div className="card-title"><div><h2>锁定前数据检查</h2><p>{reportingPeriod.weekKey} · 系统自动检查完整性、时效性与规则异常</p></div><span className="quality-score">{currentCompleteness}分</span></div>
            <div className="quality-items"><div className={missingProjectCount ? "warn" : "ok"}><span>{missingProjectCount ? "!" : "✓"}</span><div><strong>周报提交</strong><small>{submittedProjectCount} / {snapshotProjectCount} 已完成</small></div><b>{currentCompleteness}%</b></div><div className="ok"><span>✓</span><div><strong>关键字段完整性</strong><small>正式提交数据均已通过服务端必填校验</small></div><b>已校验</b></div><div className={missingProjectCount ? "warn" : "ok"}><span>{missingProjectCount ? "!" : "✓"}</span><div><strong>待补交项目</strong><small>{missingProjectCount}个项目尚未正式提交本周周报</small></div><b>{missingProjectCount} 项</b></div><div className={varianceReports.length ? "warn" : "ok"}><span>{varianceReports.length ? "!" : "✓"}</span><div><strong>申报偏差异常</strong><small>申报进度与计算值相差超过5pp</small></div><b>{varianceReports.length} 项</b></div></div>
          </section>
          <section className="content-card"><div className="card-title"><div><h2>待处理事项</h2><p>由当前周报、红灯状态、差异校验和审批队列实时生成</p></div><div className="todo-batch-actions">{missingProjects.length > 0 && <button disabled={Boolean(notificationWorking)} onClick={() => sendNotifications(missingProjects.map((project) => project.id), "report_reminder")}>{notificationWorking.startsWith("report_reminder:") ? "催报中…" : `催报缺报 ${missingProjects.length} 项`}</button>}{redProjects.length > 0 && <button className="red" disabled={Boolean(notificationWorking)} onClick={() => sendNotifications(redProjects.map((project) => project.id), "red_escalation")}>{notificationWorking.startsWith("red_escalation:") ? "升级中…" : `升级红灯 ${redProjects.length} 项`}</button>}<span className="count-badge">{missingProjects.length + redProjects.length + varianceReports.length + pendingChanges.length} 项</span></div></div>
            <div className="todo-list">{missingProjects.slice(0, 2).map((project) => <div key={`missing-${project.id}`}><span className="todo-icon red">!</span><div><strong>{project.name}</strong><p>尚未提交第{reportingPeriod.week}周正式进度</p></div><button disabled={Boolean(notificationWorking)} onClick={() => sendNotifications([project.id], "report_reminder")}>催报</button></div>)}{redProjects.slice(0, 2).map((project) => <div key={`red-${project.id}`}><span className="todo-icon red">■</span><div><strong>{project.name}</strong><p>项目综合状态红色，需升级至管理与治理角色</p></div><button disabled={Boolean(notificationWorking)} onClick={() => sendNotifications([project.id], "red_escalation")}>升级</button></div>)}{varianceReports.slice(0, 2).map((report) => { const project = projectData.find((item) => item.id === report.projectId); return <div key={`variance-${report.id}`}><span className="todo-icon yellow">▲</span><div><strong>{project?.name ?? report.projectId}</strong><p>申报进度与计算值相差 {Math.abs(report.variance).toFixed(1)}pp</p></div><button onClick={() => onNavigate("project", report.projectId)}>核验</button></div>; })}{pendingChanges.slice(0, 2).map((change) => <div key={`change-${change.id}`}><span className="todo-icon blue">≋</span><div><strong>{projectData.find((project) => project.id === change.projectId)?.name ?? change.projectId}</strong><p>基线变更 V{change.versionFrom} → V{change.versionTo} 待审批</p></div><button onClick={() => { setChangeId(change.id); setTab("基线变更"); }}>审批</button></div>)}{missingProjects.length + redProjects.length + varianceReports.length + pendingChanges.length === 0 && <div className="todo-empty"><span className="todo-icon blue">✓</span><div><strong>当前没有待处理事项</strong><p>本周数据已达到锁定前检查要求</p></div></div>}</div>
          </section>
        </div>
        <section className="content-card history-card"><div className="card-title"><div><h2>历史快照</h2><p>已锁定版本不可覆盖，导出文件包含当时的完整项目与节点数据</p></div><button className="outline-button" disabled={!snapshotRows.length} onClick={() => snapshotRows[0] && exportSnapshot(snapshotRows[0])}>导出最新快照</button></div>
          <div className="snapshot-table"><div className="table-head"><span>周期</span><span>版本</span><span>项目数</span><span>数据完整度</span><span>锁定时间</span><span>操作人</span><span>状态</span><span /></div>{snapshotRows.length ? snapshotRows.map((row)=><div className="table-row" key={row.id}><span>{row.weekKey}</span><span>V{row.version}</span><span>{row.projectCount}</span><span>{row.completeness}%</span><span>{row.lockedAt.replace("T"," ").slice(5,16)}</span><span>{row.lockedBy}</span><span><StatusPill status={row.status === "locked" ? "green" : "yellow"} /></span><button onClick={() => exportSnapshot(row)}>导出</button></div>) : <div className="empty-state">暂无历史快照</div>}</div>
        </section>
      </>}
      {tab === "基线变更" && <section className="content-card baseline-approval">
        <div className="card-title"><div><h2>基线变更审批</h2><p>原始基线永久保留，批准后生成新的当前基线版本</p></div><span className="count-badge">{pendingChanges.length}项待审批</span></div>
        {pendingChanges.length > 1 && <div className="approval-queue">{pendingChanges.map((change) => <button key={change.id} className={change.id === changeId ? "active" : ""} onClick={() => { setChangeId(change.id); setApproved(false); }}>{change.projectId} · V{change.versionFrom} → V{change.versionTo}</button>)}</div>}
        {activeChange ? <div className="change-card"><div className="change-head"><div><span className="project-chip">{activeChange.projectId}</span><div><h3>{activeProject?.name ?? activeChange.projectId}</h3><p>申请人 {activeChange.requestedBy} · {activeChange.requestedAt.replace("T"," ").slice(5,16)}</p></div></div><StatusPill status={activeChange.status === "approved" ? "green" : activeChange.status === "rejected" ? "red" : "yellow"} /></div>
          <div className="change-reason"><small>变更原因</small><p>{activeChange.reason}</p></div>
          <div className="date-change">{activeChange.changes.map((change) => <div key={`${change.milestone}-${change.to}`}><small>{change.milestone}</small><span><s>{change.from}</s><b>→</b><strong>{change.to}</strong><em>{change.days > 0 ? "+" : ""}{change.days}天</em></span></div>)}</div>
          <div className="change-impact"><span>影响评估</span><p>{activeChange.impact}</p></div>
          {operationError && <div className="form-error" role="alert">! {operationError}</div>}
          {showReject && <div className="reject-form"><textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="填写驳回原因及需要补充的材料" /><button className="outline-button" onClick={() => setShowReject(false)}>取消</button><button className="danger-outline" disabled={working || rejectReason.trim().length < 5} onClick={rejectBaseline}>确认驳回</button></div>}
          <div className="approval-actions">{activeChange.status === "approved" || approved ? <div className="approved-note">✓ 已批准，当前基线已更新为 V{activeChange.versionTo}</div> : activeChange.status === "rejected" ? <div className="rejected-note">■ 已驳回：{activeChange.rejectionReason}</div> : <><button className="danger-outline" onClick={() => setShowReject(true)}>驳回申请</button><button className="primary-button" disabled={working} onClick={approveBaseline}>{working ? "正在审批…" : `批准并生成 V${activeChange.versionTo}`}</button></>}</div>
        </div> : <div className="empty-state">暂无基线变更申请</div>}
      </section>}
      {tab === "节点模板" && <section className="content-card template-governance"><div className="card-title"><div><h2>标准节点模板</h2><p>统一维护节点编码、顺序、默认权重与关键节点标识；启用节点权重合计必须为100%</p></div><div className="template-publish"><span className={Math.abs(activeTemplateWeight - 100) < 0.01 ? "weight-ok" : "weight-error"}>启用权重 {activeTemplateWeight.toFixed(1)}%</span><button className="primary-button" disabled={templateSaving || Math.abs(activeTemplateWeight - 100) >= 0.01} onClick={saveTemplates}>{templateSaving ? "正在发布…" : "发布模板"}</button></div></div>{templateMessage && <div className={templateMessage.includes("已发布") ? "form-success" : "form-error"}>{templateMessage}</div>}<div className="template-grid"><div className="template-grid-head"><span>序号</span><span>编码</span><span>节点名称</span><span>权重</span><span>关键</span><span>启用</span><span>口径说明</span></div>{templateRows.map((row) => <div className={`template-grid-row ${row.active ? "" : "inactive"}`} key={row.id}><input aria-label={`${row.name}序号`} type="number" min="1" max="99" value={row.sequence} onChange={(event) => updateTemplate(row.id, "sequence", Number(event.target.value))} /><input aria-label={`${row.name}编码`} value={row.code} onChange={(event) => updateTemplate(row.id, "code", event.target.value.toUpperCase())} /><input aria-label={`${row.name}名称`} value={row.name} onChange={(event) => updateTemplate(row.id, "name", event.target.value)} /><label className="weight-input"><input aria-label={`${row.name}权重`} type="number" min="0" max="100" step="0.5" value={row.defaultWeight} onChange={(event) => updateTemplate(row.id, "defaultWeight", Number(event.target.value))} /><span>%</span></label><label className="template-check"><input type="checkbox" checked={row.critical} onChange={(event) => updateTemplate(row.id, "critical", event.target.checked)} /><span>关键</span></label><label className="template-check"><input type="checkbox" checked={row.active} onChange={(event) => updateTemplate(row.id, "active", event.target.checked)} /><span>启用</span></label><input aria-label={`${row.name}说明`} value={row.description} onChange={(event) => updateTemplate(row.id, "description", event.target.value)} /></div>)}</div><div className="template-footnote">项目可在本项目范围内标记节点不适用或追加零权重自定义节点；正式计划完成日调整仍须走基线变更审批。</div></section>}
      {tab === "预警规则" && <RuleConfigPanel />}
    </div>
    {locked && <div className="toast"><span>✓</span><div><strong>第{reportingPeriod.week}周快照已锁定</strong><p>管理大屏已切换至最新数据。</p></div></div>}
  </div>;
}

export default function Home() {
  const [view, setView] = useState<View>("cockpit");
  const [projectData, setProjectData] = useState<ProjectData[]>(projects);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [dashboardData, setDashboardData] = useState<ProjectData[]>([]);
  const [dashboardSnapshot, setDashboardSnapshot] =
    useState<DashboardSnapshot | null>(null);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [templateData, setTemplateData] =
    useState<TemplateData[]>(defaultTemplateData);
  const [weeklyReportData, setWeeklyReportData] = useState<WeeklyReportRow[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("P02");
  const [dataState, setDataState] = useState<"loading" | "ready" | "fallback">("loading");
  const navigate: Navigate = (next, projectId) => {
    if (projectId) setSelectedProjectId(projectId);
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const refreshData = useCallback(async () => {
    try {
      const response = await fetch("/api/bootstrap", { cache: "no-store" });
      if (!response.ok) throw new Error("data unavailable");
      const data = (await response.json()) as {
        projects?: ProjectData[];
        identity?: Identity;
        dashboardProjects?: ProjectData[];
        dashboardSnapshot?: DashboardSnapshot | null;
        milestoneTemplates?: TemplateData[];
        weeklyReports?: WeeklyReportRow[];
      };
      if (data.projects?.length) setProjectData(data.projects);
      if (data.dashboardProjects?.length) {
        setDashboardData(data.dashboardProjects);
      } else {
        setDashboardData([]);
      }
      setDashboardSnapshot(data.dashboardSnapshot ?? null);
      if (data.milestoneTemplates?.length) {
        setTemplateData(data.milestoneTemplates);
      }
      setWeeklyReportData(data.weeklyReports ?? []);
      if (data.identity) setIdentity(data.identity);
      try {
        const trendResponse = await fetch("/api/dashboard/trends", {
          cache: "no-store",
        });
        const trendResult = (await trendResponse.json()) as {
          trends?: TrendPoint[];
        };
        setTrendData(
          trendResponse.ok && Array.isArray(trendResult.trends)
            ? trendResult.trends
            : [],
        );
      } catch {
        setTrendData([]);
      }
      setDataState("ready");
    } catch {
      setDataState("fallback");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshData(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshData]);

  if (view === "cockpit") return <><Cockpit onNavigate={navigate} projectData={dashboardData} snapshot={dashboardSnapshot} templateData={templateData} trends={trendData} />{dataState === "fallback" && <div className="data-banner">当前数据服务不可用，管理大屏不展示未核实的演示数据。</div>}</>;
  return <div className="app-shell"><Sidebar view={view} onNavigate={navigate} identity={identity} /><div className="workspace">{view === "portfolio" && <Portfolio onNavigate={navigate} onDataChanged={refreshData} projectData={projectData} identity={identity} templateData={templateData} weeklyReports={weeklyReportData} />}{view === "project" && <ProjectDetail onNavigate={navigate} onDataChanged={refreshData} projectData={projectData} projectId={selectedProjectId} identity={identity} />}{view === "report" && <WeeklyReport onNavigate={navigate} onDataChanged={refreshData} projectId={selectedProjectId} projectData={projectData} identity={identity} snapshot={dashboardSnapshot} />}{view === "pmo" && <PmoPage onNavigate={navigate} onDataChanged={refreshData} identity={identity} projectData={projectData} />}{view === "admin" && <AdminPage onNavigate={navigate} identity={identity} />}</div></div>;
}
