"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PortfolioAnalytics from "./portfolio-analytics";
import NotificationChannelPanel from "./notification-channel-panel";
import ResourcePlanning from "./resource-planning";
import {
  addIsoDays,
  buildWeightedProjectSchedule,
  isoDaySpan,
  type ProjectScheduleMilestone,
  validateProjectSchedule,
} from "@/lib/project-schedule";
import {
  formatShanghaiCalendarDay,
  formatShanghaiCalendarMonth,
  formatShanghaiDate,
  formatShanghaiDateTime,
  formatShanghaiMonthDayTime,
  SHANGHAI_TIME_ZONE_LABEL,
} from "@/lib/date-time";

type Status = "green" | "yellow" | "red" | "na";
type View =
  | "cockpit"
  | "portfolio"
  | "analytics"
  | "resources"
  | "project"
  | "report"
  | "pmo"
  | "admin";
type Role = "executive" | "pmo" | "manager" | "admin";
type Identity = { email: string; displayName: string; role: Role };
type PasswordPolicy = {
  minPasswordLength: number;
  requireLetter: boolean;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
};
const defaultPasswordPolicy: PasswordPolicy = {
  minPasswordLength: 12,
  requireLetter: true,
  requireUppercase: false,
  requireLowercase: false,
  requireNumber: true,
  requireSymbol: false,
};
function describePasswordPolicy(policy: PasswordPolicy) {
  const requirements = [`至少${policy.minPasswordLength}位`];
  if (policy.requireLetter) requirements.push("字母");
  if (policy.requireUppercase) requirements.push("大写字母");
  if (policy.requireLowercase) requirements.push("小写字母");
  if (policy.requireNumber) requirements.push("数字");
  if (policy.requireSymbol) requirements.push("特殊字符");
  return requirements.join("、");
}
type ProjectManagerAccount = { email: string; displayName: string };
type Navigate = (view: View, projectId?: string) => void;
type MilestoneData = {
  id: number;
  templateId?: number | null;
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
  lifecycleStatus?: "active" | "completed" | "archived";
  lifecycleReason?: string;
  completedAt?: string | null;
  archivedAt?: string | null;
  healthExplanation?: HealthExplanation | null;
  milestones?: MilestoneData[];
};
type ProjectLifecycleStatus = NonNullable<ProjectData["lifecycleStatus"]>;
type ProjectClosureState = {
  incompleteMilestoneCount: number;
  incompleteMilestones: Array<{
    id: number;
    name: string;
    completion: number;
  }>;
  openRiskCount: number;
  openActionCount: number;
  pendingBaselineCount: number;
  clear: boolean;
};
type HealthExplanation = {
  ruleVersion: number;
  calculatedAt: string;
  asOfDate: string;
  progressGap: number;
  progressGapPenalty: number;
  milestonePenalty: number;
  milestoneCounts: {
    normalYellow: number;
    normalRed: number;
    criticalYellow: number;
    criticalRed: number;
  };
  openMediumRiskCount: number;
  openHighRiskCount: number;
  overdueActionCount: number;
  latestReportWeek: string | null;
  evaluationWeekKey: string;
  consecutiveMissing: boolean;
  deductions: {
    schedule: number;
    risk: number;
    action: number;
    reporting: number;
    total: number;
  };
  vetoes: {
    criticalRed: boolean;
    highRiskOverdue: boolean;
    consecutiveMissing: boolean;
  };
};
type DashboardSnapshot = {
  id: number;
  weekKey: string;
  version: number;
  projectCount: number;
  completeness: number;
  lockedAt: string;
};
type DashboardAlertItem = {
  id: number;
  projectId: string;
  title: string;
  owner: string;
  targetDate: string;
};
type DashboardAlerts = {
  highRisks: DashboardAlertItem[];
  overdueActions: DashboardAlertItem[];
  predictedDelays: Array<{
    projectId: string;
    probability: number;
    riskBand: "low" | "medium" | "high";
    expectedDelayDays: number;
    milestoneName: string;
    confidence: "low" | "medium" | "high";
    earlyWarning: boolean;
  }>;
  resourceConflicts: Array<{
    resourceId: number;
    resourceName: string;
    resourceOrg: string;
    weekKey: string;
    utilization: number;
    overallocatedHours: number;
    projectNames: string[];
  }>;
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
const lifecycleLabel: Record<ProjectLifecycleStatus, string> = {
  active: "在建",
  completed: "已结项",
  archived: "已归档",
};
const projectLifecycle = (project: ProjectData): ProjectLifecycleStatus =>
  project.lifecycleStatus ?? "active";

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

function shanghaiTodayIso() {
  const parts = shanghaiDateParts();
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
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

function formatScheduleSpan(start: string, finish: string) {
  try {
    const span = isoDaySpan(start, finish);
    return span > 0 ? `${span}天` : "—";
  } catch {
    return "—";
  }
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

function WeeklyProgressChart({ reports }: { reports: WeeklyReportRow[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartReports = useMemo(
    () =>
      [...reports]
        .filter((report) => report.status !== "draft")
        .sort((left, right) => left.weekKey.localeCompare(right.weekKey))
        .slice(-12),
    [reports],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || chartReports.length === 0) return;
    const draw = () => {
      const container = canvas.parentElement;
      if (!container) return;
      const width = Math.max(620, container.clientWidth);
      const height = 188;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(ratio, ratio);
      context.clearRect(0, 0, width, height);
      const padding = { left: 38, right: 18, top: 16, bottom: 32 };
      const chartWidth = width - padding.left - padding.right;
      const chartHeight = height - padding.top - padding.bottom;
      const xFor = (index: number) =>
        padding.left +
        (chartReports.length === 1
          ? chartWidth / 2
          : (chartWidth * index) / (chartReports.length - 1));
      const yFor = (value: number) =>
        padding.top + chartHeight * (1 - Math.max(0, Math.min(100, value)) / 100);

      context.font = "9px Arial";
      context.textAlign = "right";
      context.textBaseline = "middle";
      for (let value = 0; value <= 100; value += 25) {
        const y = yFor(value);
        context.strokeStyle = "#e9edf3";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(padding.left, y);
        context.lineTo(width - padding.right, y);
        context.stroke();
        context.fillStyle = "#9aa4b3";
        context.fillText(`${value}%`, padding.left - 7, y);
      }

      const drawSeries = (
        readValue: (report: WeeklyReportRow) => number,
        color: string,
      ) => {
        context.strokeStyle = color;
        context.lineWidth = 2;
        context.lineJoin = "round";
        context.lineCap = "round";
        context.beginPath();
        chartReports.forEach((report, index) => {
          const x = xFor(index);
          const y = yFor(readValue(report));
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.stroke();
        chartReports.forEach((report, index) => {
          context.fillStyle = "#fff";
          context.strokeStyle = color;
          context.lineWidth = 2;
          context.beginPath();
          context.arc(xFor(index), yFor(readValue(report)), 3.5, 0, Math.PI * 2);
          context.fill();
          context.stroke();
        });
      };
      drawSeries((report) => report.systemProgress, "#1b64f2");
      drawSeries((report) => report.declaredProgress, "#17a875");

      context.fillStyle = "#8792a4";
      context.font = "8px Arial";
      context.textAlign = "center";
      context.textBaseline = "top";
      chartReports.forEach((report, index) => {
        context.fillText(
          report.weekKey.replace(/^\d{4}-/, ""),
          xFor(index),
          height - padding.bottom + 10,
        );
      });
    };
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [chartReports]);

  if (chartReports.length === 0) return null;
  return <div className="weekly-progress-chart">
    <div className="chart-head">
      <div><strong>周度进度曲线</strong><small>最近{chartReports.length}个正式填报周期</small></div>
      <div className="chart-legend"><span className="system">系统计算进度</span><span className="declared">经理申报进度</span></div>
    </div>
    <div className="weekly-progress-visual">
      <canvas ref={canvasRef} aria-label="周度系统计算进度与项目经理申报进度曲线" role="img" />
    </div>
  </div>;
}

function AppLogo({ dark = false }: { dark?: boolean }) {
  return <div className={`brand ${dark ? "dark" : ""}`}>
    <div className="brand-mark"><span>数</span></div>
    <div><strong>数智军团</strong><small>统建项目进度监控平台</small></div>
  </div>;
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "登录失败");
      window.location.reload();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="login-screen">
    <section className="login-intro">
      <AppLogo dark />
      <div>
        <span className="eyebrow">PORTFOLIO COMMAND CENTER</span>
        <h1>统一节点口径，<br />提前识别项目偏差</h1>
        <p>面向管理层、项目经理与 PMO 的统建项目进度监控平台。</p>
      </div>
      <div className="login-capabilities">
        <span><b>01</b> 项目 × 节点态势矩阵</span>
        <span><b>02</b> 预测预警与事后度量</span>
        <span><b>03</b> 周报、措施与基线闭环</span>
      </div>
    </section>
    <section className="login-panel">
      <div className="login-card">
        <span className="login-kicker">SECURE ACCESS</span>
        <h2>登录工作台</h2>
        <p>使用系统管理员分配的独立账号登录。平台部署于 Cloudflare，并按管理层、项目经理、PMO 或管理员角色授权。</p>
        <form className="login-form" onSubmit={login}>
          <label>
            登录邮箱
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            密码
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              maxLength={128}
              required
            />
          </label>
          {error && <div className="form-error" role="alert">! {error}</div>}
          <button className="login-button" disabled={submitting}>
            {submitting ? "正在验证…" : "登录工作台"} <span>→</span>
          </button>
        </form>
        <div className="login-role-grid">
          <span><b>管理层</b><small>只读查看组合态势</small></span>
          <span><b>项目经理</b><small>维护所属项目进度</small></span>
          <span><b>PMO</b><small>治理规则与周度快照</small></span>
          <span><b>管理员</b><small>维护账号权限</small></span>
        </div>
        <small className="login-note">密码经 PBKDF2 加盐散列保存；会话使用安全、仅 HTTP Cookie。若无法登录，请联系管理员重置账号。</small>
      </div>
    </section>
  </main>;
}

const COCKPIT_DEFAULT_PAGE_SIZE = 7;
const COCKPIT_MIN_PAGE_SIZE = 1;
const COCKPIT_MAX_PAGE_SIZE = 50;
const COCKPIT_DEFAULT_AUTO_PAGE_SECONDS = 20;
const COCKPIT_AUTO_PAGE_SECONDS_OPTIONS = [5, 10, 15, 20, 30, 60] as const;
const COCKPIT_PAGINATION_STORAGE_KEY = "shuzhi-cockpit-pagination-v1";

function Cockpit({ onNavigate, projectData = projects, snapshot, templateData = defaultTemplateData, trends = [], alerts }: { onNavigate: Navigate; projectData?: ProjectData[]; snapshot: DashboardSnapshot | null; templateData?: TemplateData[]; trends?: TrendPoint[]; alerts: DashboardAlerts }) {
  const [org, setOrg] = useState("全部组织");
  const [owner, setOwner] = useState("全部负责人");
  const [projectType, setProjectType] = useState("全部类型");
  const [health, setHealth] = useState("全部状态");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(COCKPIT_DEFAULT_PAGE_SIZE);
  const [pageSizeInput, setPageSizeInput] = useState(
    String(COCKPIT_DEFAULT_PAGE_SIZE),
  );
  const [autoPageEnabled, setAutoPageEnabled] = useState(true);
  const [autoPageSeconds, setAutoPageSeconds] = useState(
    COCKPIT_DEFAULT_AUTO_PAGE_SECONDS,
  );
  const [paginationPreferencesReady, setPaginationPreferencesReady] =
    useState(false);
  const [selected, setSelected] = useState<{ project: ProjectData; index: number } | null>(null);
  const [matrixFullscreen, setMatrixFullscreen] = useState(false);
  const matrixRef = useRef<HTMLDivElement>(null);
  const activeProjects = useMemo(
    () => projectData.filter((project) => projectLifecycle(project) === "active"),
    [projectData],
  );
  const matrixMilestones = templateData
    .filter((template) => template.active)
    .sort((left, right) => left.sequence - right.sequence)
    .map((template) => template.name);
  const matching = useMemo(
    () =>
      activeProjects.filter(
        (project) =>
          (org === "全部组织" || project.org === org) &&
          (owner === "全部负责人" || project.owner === owner) &&
          (projectType === "全部类型" || project.type === projectType) &&
          (health === "全部状态" || statusLabel[project.status] === health),
      ),
    [activeProjects, health, org, owner, projectType],
  );
  const pageCount = Math.max(
    1,
    Math.ceil(matching.length / pageSize),
  );
  const currentPage = Math.min(page, pageCount - 1);
  const filtered = matching.slice(
    currentPage * pageSize,
    currentPage * pageSize + pageSize,
  );
  const total = activeProjects.length;
  const green = activeProjects.filter((project) => project.status === "green").length;
  const yellow = activeProjects.filter((project) => project.status === "yellow").length;
  const red = activeProjects.filter((project) => project.status === "red").length;
  const planProgress = total
    ? activeProjects.reduce((sum, project) => sum + project.plan, 0) / total
    : 0;
  const actualProgress = total
    ? activeProjects.reduce((sum, project) => sum + project.actual, 0) / total
    : 0;
  const progressGap = actualProgress - planProgress;
  const organizations = [...new Set(activeProjects.map((project) => project.org))].sort();
  const owners = [...new Set(activeProjects.map((project) => project.owner))].sort();
  const projectTypes = [
    ...new Set(activeProjects.map((project) => project.type)),
  ].sort();
  const snapshotLabel = snapshot
    ? `${snapshot.weekKey.replace("-W", "年第")}周 · V${snapshot.version}`
    : "尚无锁定快照";
  const snapshotTime = snapshot?.lockedAt
    ? formatShanghaiMonthDayTime(snapshot.lockedAt)
    : "等待 PMO 锁定";
  const predictionByProject = new Map(
    (alerts.predictedDelays ?? []).map((prediction) => [
      prediction.projectId,
      prediction,
    ]),
  );
  const attentionProjects = [...activeProjects]
    .filter(
      (project) =>
        project.status === "red" ||
        project.status === "yellow" ||
        (predictionByProject.get(project.id)?.probability ?? 0) >= 65,
    )
    .sort((left, right) => {
      const statusWeight = { red: 20, yellow: 10, green: 0, na: 0 };
      const leftPriority =
        (predictionByProject.get(left.id)?.probability ?? 0) +
        statusWeight[left.status];
      const rightPriority =
        (predictionByProject.get(right.id)?.probability ?? 0) +
        statusWeight[right.status];
      return rightPriority - leftPriority || left.score - right.score;
    })
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

  function applyPageSize(value: string) {
    const parsed = Number(value);
    const nextPageSize = Number.isFinite(parsed)
      ? Math.min(
          COCKPIT_MAX_PAGE_SIZE,
          Math.max(COCKPIT_MIN_PAGE_SIZE, Math.round(parsed)),
        )
      : COCKPIT_DEFAULT_PAGE_SIZE;
    setPageSize(nextPageSize);
    setPageSizeInput(String(nextPageSize));
    setPage(0);
  }

  function focusMatrixByHealth(nextHealth: string) {
    setOrg("全部组织");
    setOwner("全部负责人");
    setProjectType("全部类型");
    setHealth(nextHealth);
    setPage(0);
  }

  async function toggleMatrixFullscreen() {
    if (document.fullscreenElement === matrixRef.current) {
      await document.exitFullscreen();
      return;
    }
    await matrixRef.current?.requestFullscreen();
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(
          COCKPIT_PAGINATION_STORAGE_KEY,
        );
        if (saved) {
          const preferences = JSON.parse(saved) as {
            pageSize?: number;
            autoPageEnabled?: boolean;
            autoPageSeconds?: number;
          };
          if (
            Number.isInteger(preferences.pageSize) &&
            preferences.pageSize! >= COCKPIT_MIN_PAGE_SIZE &&
            preferences.pageSize! <= COCKPIT_MAX_PAGE_SIZE
          ) {
            setPageSize(preferences.pageSize!);
            setPageSizeInput(String(preferences.pageSize));
          }
          if (typeof preferences.autoPageEnabled === "boolean") {
            setAutoPageEnabled(preferences.autoPageEnabled);
          }
          if (
            COCKPIT_AUTO_PAGE_SECONDS_OPTIONS.includes(
              preferences.autoPageSeconds as (typeof COCKPIT_AUTO_PAGE_SECONDS_OPTIONS)[number],
            )
          ) {
            setAutoPageSeconds(preferences.autoPageSeconds!);
          }
        }
      } catch {
        // Ignore invalid browser preferences and keep safe defaults.
      } finally {
        setPaginationPreferencesReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const syncFullscreenState = () =>
      setMatrixFullscreen(document.fullscreenElement === matrixRef.current);
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () =>
      document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  useEffect(() => {
    if (!paginationPreferencesReady) return;
    window.localStorage.setItem(
      COCKPIT_PAGINATION_STORAGE_KEY,
      JSON.stringify({ pageSize, autoPageEnabled, autoPageSeconds }),
    );
  }, [
    autoPageEnabled,
    autoPageSeconds,
    pageSize,
    paginationPreferencesReady,
  ]);

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
  }, [autoPageEnabled, autoPageSeconds, currentPage, pageCount, selected]);

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
      <button type="button" className={`metric-card total filter-card ${health === "全部状态" ? "active" : ""}`} aria-pressed={health === "全部状态"} onClick={() => focusMatrixByHealth("全部状态")}><span>统建项目总数</span><strong>{total}</strong><small>点击查看全部项目</small></button>
      <button type="button" className={`metric-card green filter-card ${health === "正常" ? "active" : ""}`} aria-pressed={health === "正常"} onClick={() => focusMatrixByHealth("正常")}><span>绿色 · 正常</span><strong>{green}</strong><small>{total ? ((green / total) * 100).toFixed(1) : "0.0"}% 项目受控 · 点击筛选</small></button>
      <button type="button" className={`metric-card yellow filter-card ${health === "预警" ? "active" : ""}`} aria-pressed={health === "预警"} onClick={() => focusMatrixByHealth("预警")}><span>黄色 · 预警</span><strong>{yellow}</strong><small>需提前干预 · 点击筛选</small></button>
      <button type="button" className={`metric-card red filter-card ${health === "严重" ? "active" : ""}`} aria-pressed={health === "严重"} onClick={() => focusMatrixByHealth("严重")}><span>红色 · 严重</span><strong>{red}</strong><small>需管理层关注 · 点击筛选</small></button>
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
      <div className="heatmap-panel" ref={matrixRef}>
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
        <div className="matrix-footer">
          <span>当前展示 {filtered.length} / {matching.length} 个匹配项目</span>
          <div className="matrix-pagination-settings" title="设置保存在当前浏览器">
            <label>
              每页
              <input
                type="number"
                aria-label="管理大屏每页项目行数"
                min={COCKPIT_MIN_PAGE_SIZE}
                max={COCKPIT_MAX_PAGE_SIZE}
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
                {COCKPIT_AUTO_PAGE_SECONDS_OPTIONS.map((seconds) => (
                  <option key={seconds} value={seconds}>{seconds}秒</option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="matrix-fullscreen-button"
            aria-pressed={matrixFullscreen}
            onClick={() => void toggleMatrixFullscreen()}
          >
            {matrixFullscreen ? "退出全屏" : "全屏矩阵"}
          </button>
          <nav className="matrix-pagination" aria-label="管理大屏项目分页">
            <button
              type="button"
              aria-label="上一页"
              title="上一页"
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
              title="下一页"
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
      </div>

      <aside className="attention-panel">
        <div className="attention-head"><div><span className="section-index">02</span><h2>重点关注</h2></div><button onClick={() => onNavigate("portfolio")}>查看全部</button></div>
        {attentionProjects.length ? attentionProjects.map((project, index) => {
          const prediction = predictionByProject.get(project.id);
          const issue = [...(project.milestones ?? [])]
            .filter((milestone) => milestone.applicable)
            .sort((left, right) => {
              const rank = { red: 3, yellow: 2, green: 1, na: 0 };
              return rank[right.status] - rank[left.status] || right.deviationDays - left.deviationDays;
            })[0];
          return <button className={`alert-card ${index === 0 ? "primary" : ""}`} key={project.id} onClick={() => onNavigate("project", project.id)}>
            <div className="rank">{String(index + 1).padStart(2, "0")}</div><div><StatusPill status={project.status} /><h3>{project.name}</h3><p>{prediction ? `${prediction.milestoneName} 延期概率 ${prediction.probability}% · 预计 +${prediction.expectedDelayDays} 天` : issue ? `${issue.name}${issue.deviationDays > 0 ? `预计延期 ${issue.deviationDays} 天` : "需要重点关注"}` : "综合健康度触发预警"}</p><span>责任人 {project.owner} · 风险 {project.risk}{prediction?.earlyWarning ? " · 提前预警" : ""}</span></div><b>{prediction ? `${prediction.probability}%` : `${project.actual - project.plan > 0 ? "+" : ""}${(project.actual - project.plan).toFixed(1)}pp`}</b>
          </button>;
        }) : <div className="dark-empty-state">当前无红黄项目</div>}
        <div className="upcoming">
          <h3><Icon>◷</Icon> 未来7日关键节点</h3>
          {upcomingMilestones.length ? <ul>{upcomingMilestones.map(({ project, milestone }) => <li key={`${project.id}-${milestone.id}`}><span>{milestone.plannedFinish.slice(5).replace("-", "/")}</span><b>{project.name} · {milestone.name}</b><em>{daysBetween(today, milestone.plannedFinish)}天</em></li>)}</ul> : <div className="dark-empty-inline">未来7日无到期节点</div>}
        </div>
        <div className="governance-alerts">
          <section>
            <h3><span>!</span> 开放高风险 <b>{alerts.highRisks.length}</b></h3>
            {alerts.highRisks.length ? alerts.highRisks.slice(0, 2).map((risk) => <button key={`risk-${risk.id}`} onClick={() => onNavigate("project", risk.projectId)}><strong>{projectData.find((project) => project.id === risk.projectId)?.name ?? risk.projectId}</strong><small>{risk.title} · {risk.owner}</small><em>{risk.targetDate || "未设置日期"}</em></button>) : <p>当前快照无开放高风险</p>}
          </section>
          <section>
            <h3><span>⌛</span> 逾期措施 <b>{alerts.overdueActions.length}</b></h3>
            {alerts.overdueActions.length ? alerts.overdueActions.slice(0, 2).map((action) => <button key={`action-${action.id}`} onClick={() => onNavigate("project", action.projectId)}><strong>{projectData.find((project) => project.id === action.projectId)?.name ?? action.projectId}</strong><small>{action.title} · {action.owner}</small><em>{action.targetDate || "未设置日期"}</em></button>) : <p>当前快照无逾期措施</p>}
          </section>
          <section className="resource-conflict-alert">
            <h3><span>⚡</span> 共享资源冲突 <b>{alerts.resourceConflicts.length}</b></h3>
            {alerts.resourceConflicts.length ? alerts.resourceConflicts.slice(0, 1).map((conflict) => <button key={`resource-${conflict.resourceId}-${conflict.weekKey}`} onClick={() => onNavigate("resources")}><strong>{conflict.resourceName} · {conflict.utilization}%</strong><small>{conflict.projectNames.join("、") || conflict.resourceOrg}</small><em>{conflict.weekKey} · 超配 {conflict.overallocatedHours}h</em></button>) : <p>当前快照无共享资源超配</p>}
          </section>
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

  </main>;
}

function Sidebar({ view, onNavigate, identity }: { view: View; onNavigate: Navigate; identity: Identity | null }) {
  const items: Array<{ id: View; icon: string; label: string; roles?: Role[] }> = [
    { id: "portfolio", icon: "⌘", label: "项目总览" },
    { id: "analytics", icon: "▥", label: "组合分析" },
    { id: "resources", icon: "▦", label: "资源计划" },
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
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordPolicy, setPasswordPolicy] = useState(defaultPasswordPolicy);
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
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.assign("/");
  }
  async function openPasswordModal() {
    setPasswordError("");
    setPasswordMessage("");
    setPasswordOpen(true);
    setMenu(false);
    try {
      const response = await fetch("/api/security-config", {
        cache: "no-store",
      });
      const result = (await response.json()) as {
        passwordPolicy?: PasswordPolicy;
        error?: string;
      };
      if (!response.ok || !result.passwordPolicy) {
        throw new Error(result.error || "密码策略读取失败");
      }
      setPasswordPolicy(result.passwordPolicy);
    } catch (policyError) {
      setPasswordError(
        policyError instanceof Error
          ? policyError.message
          : "密码策略读取失败",
      );
    }
  }
  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordSaving(true);
    setPasswordError("");
    setPasswordMessage("");
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");
    if (newPassword !== confirmPassword) {
      setPasswordError("两次输入的新密码不一致。");
      setPasswordSaving(false);
      return;
    }
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const result = (await response.json()) as {
        changed?: boolean;
        error?: string;
      };
      if (!response.ok || !result.changed) {
        throw new Error(result.error || "密码修改失败");
      }
      setPasswordMessage("密码已修改，正在退出并返回登录页…");
      window.setTimeout(() => window.location.assign("/"), 900);
    } catch (changeError) {
      setPasswordError(
        changeError instanceof Error ? changeError.message : "密码修改失败",
      );
      setPasswordSaving(false);
    }
  }
  return (
    <header className="workspace-header">
      <div><h1>{title}</h1><p>{subtitle}</p></div>
      <div className="header-actions"><button className="icon-button" aria-label="搜索项目" onClick={() => onNavigate("portfolio")}>⌕</button><button className="icon-button notice" aria-label={`通知${unreadCount ? `，${unreadCount}条未读` : ""}`} aria-expanded={noticeOpen} onClick={() => { setNoticeOpen((value) => !value); setMenu(false); if (!noticeOpen) void loadNotifications(); }}>♢{unreadCount > 0 && <b>{unreadCount > 9 ? "9+" : unreadCount}</b>}</button><button className="user-button" onClick={() => { setMenu(!menu); setNoticeOpen(false); }}><span className="avatar">{displayName[0]}</span><span><strong>{displayName}</strong><small>{roleName}</small></span><em>⌄</em></button></div>
      {noticeOpen && <section className="notification-center"><div className="notification-head"><div><strong>通知中心</strong><span>{unreadCount} 条未读</span></div>{unreadCount > 0 && <button onClick={markAllNotificationsRead}>全部已读</button>}</div>{notificationError ? <div className="notification-error">! {notificationError}</div> : notificationRows.filter((row) => row.status !== "dismissed").length ? <div className="notification-list">{notificationRows.filter((row) => row.status !== "dismissed").slice(0, 20).map((notification) => <button className={`${notification.severity} ${notification.status}`} key={notification.id} onClick={() => openNotification(notification)}><span className="notification-symbol">{notification.severity === "critical" ? "■" : notification.severity === "warning" ? "▲" : "●"}</span><div><strong>{notification.title}</strong><p>{notification.message}</p><small title={SHANGHAI_TIME_ZONE_LABEL}>{formatShanghaiDateTime(notification.createdAt)} · {notification.createdBy}</small></div>{notification.status === "unread" && <i />}</button>)}</div> : <div className="notification-empty">暂无通知</div>}<div className="notification-foot">{canGovern ? <button onClick={() => onNavigate("pmo")}>进入 PMO 待办</button> : <span>通知由 PMO 与系统工作流生成</span>}</div></section>}
      {menu && (
        <div className="user-menu">
          {canGovern && <button onClick={() => onNavigate("admin")}>用户与权限</button>}
          <button
            onClick={() => void openPasswordModal()}
          >
            修改密码
          </button>
          <button onClick={() => onNavigate("portfolio")}>项目工作台</button>
          <button onClick={() => onNavigate("cockpit")}>打开管理大屏</button>
          <button onClick={logout}>退出登录</button>
        </div>
      )}
      {passwordOpen && (
        <div
          className="modal-backdrop"
          onClick={
            passwordSaving || passwordMessage
              ? undefined
              : () => setPasswordOpen(false)
          }
        >
          <section
            className="create-modal password-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              type="button"
              disabled={passwordSaving || Boolean(passwordMessage)}
              onClick={() => setPasswordOpen(false)}
              aria-label="关闭修改密码"
            >
              ×
            </button>
            <span className="modal-kicker">ACCOUNT SECURITY</span>
            <h2>修改登录密码</h2>
            <p>修改后当前会话将退出，请使用新密码重新登录。</p>
            <form onSubmit={changePassword}>
              <label>
                当前密码
                <input
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </label>
              <label>
                新密码
                <input
                  name="newPassword"
                  type="password"
                  minLength={passwordPolicy.minPasswordLength}
                  maxLength={128}
                  autoComplete="new-password"
                  placeholder={describePasswordPolicy(passwordPolicy)}
                  required
                />
              </label>
              <label>
                确认新密码
                <input
                  name="confirmPassword"
                  type="password"
                  minLength={passwordPolicy.minPasswordLength}
                  maxLength={128}
                  autoComplete="new-password"
                  required
                />
              </label>
              <div className="password-security-note">
                当前策略：{describePasswordPolicy(passwordPolicy)}。密码仅保存 PBKDF2 加盐散列；修改后旧会话将失效。
              </div>
              {passwordError && <div className="form-error" role="alert">! {passwordError}</div>}
              {passwordMessage && <div className="success-message" role="status">{passwordMessage}</div>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="outline-button"
                  disabled={passwordSaving || Boolean(passwordMessage)}
                  onClick={() => setPasswordOpen(false)}
                >
                  取消
                </button>
                <button
                  className="primary-button"
                  disabled={passwordSaving || Boolean(passwordMessage)}
                >
                  {passwordSaving ? "正在修改…" : "确认修改"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </header>
  );
}

type ProjectImportRow = {
  rowNumber: number;
  code: unknown;
  name: unknown;
  ownerName: unknown;
  ownerEmail: unknown;
  org: unknown;
  type: unknown;
  riskLevel: unknown;
};

type MilestoneImportRow = {
  rowNumber: number;
  projectCode: unknown;
  templateCode: unknown;
  name: unknown;
  sequence: unknown;
  weight: unknown;
  critical: unknown;
  applicable: unknown;
  plannedStart: unknown;
  plannedFinish: unknown;
};

type ProjectImportPayload = {
  mode: "preview" | "commit";
  projects: ProjectImportRow[];
  milestones: MilestoneImportRow[];
};

type ProjectImportIssue = {
  sheet: "项目清单" | "节点计划";
  row: number;
  field: string;
  message: string;
};

type ProjectImportPreviewRow = {
  code: string;
  name: string;
  ownerName: string;
  org: string;
  type: string;
  riskLevel: "low" | "medium" | "high";
  milestoneCount: number;
  customMilestoneCount: number;
  applicableMilestoneCount: number;
  totalWeight: number;
  plannedStart: string;
  plannedFinish: string;
};

type ProjectImportResult = {
  valid: boolean;
  mode: "preview" | "commit";
  batchId?: string;
  created?: number;
  summary: {
    projectCount: number;
    milestoneCount: number;
    standardMilestoneCount: number;
    customMilestoneCount: number;
    activeTemplateCount: number;
  };
  errors: ProjectImportIssue[];
  errorCount: number;
  projects?: ProjectImportPreviewRow[];
  error?: string;
};

const projectImportHeaders = [
  "项目编码",
  "项目名称",
  "项目经理姓名",
  "项目经理邮箱",
  "所属组织",
  "项目类型",
  "初始风险",
] as const;

const milestoneImportHeaders = [
  "项目编码",
  "节点编码",
  "节点名称",
  "节点序号",
  "权重",
  "关键节点",
  "是否适用",
  "计划开始日",
  "计划完成日",
] as const;

function hasExcelValue(value: unknown) {
  return (
    value !== null &&
    value !== undefined &&
    !(typeof value === "string" && value.trim() === "")
  );
}

function normalizeExcelValue(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return value ?? "";
}

function readImportSheet(
  data: unknown[][],
  sheetName: "项目清单" | "节点计划",
  requiredHeaders: readonly string[],
) {
  if (!data.length) {
    throw new Error(`工作表“${sheetName}”为空。`);
  }
  const headerCells = data[0].map((value) =>
    String(normalizeExcelValue(value)).trim(),
  );
  const indexes = new Map(
    headerCells.map((header, index) => [header.normalize("NFKC"), index]),
  );
  const missing = requiredHeaders.filter(
    (header) => !indexes.has(header.normalize("NFKC")),
  );
  if (missing.length) {
    throw new Error(
      `工作表“${sheetName}”缺少列：${missing.join("、")}。请使用最新模板。`,
    );
  }
  return data
    .slice(1)
    .map((row, index) => ({
      rowNumber: index + 2,
      row,
      value: (header: string) =>
        normalizeExcelValue(
          row[indexes.get(header.normalize("NFKC")) as number],
        ),
    }))
    .filter(({ row }) => row.some(hasExcelValue));
}

async function parseProjectImportWorkbook(file: File) {
  const { default: readExcelFile } = await import("read-excel-file/browser");
  const sheets = await readExcelFile(file);
  const projectSheet = sheets.find((sheet) => sheet.sheet.trim() === "项目清单");
  const milestoneSheet = sheets.find(
    (sheet) => sheet.sheet.trim() === "节点计划",
  );
  const missingSheets = [
    !projectSheet ? "项目清单" : "",
    !milestoneSheet ? "节点计划" : "",
  ].filter(Boolean);
  if (missingSheets.length) {
    throw new Error(
      `缺少工作表：${missingSheets.join("、")}。请下载最新模板后重试。`,
    );
  }
  const projectRows = readImportSheet(
    projectSheet!.data as unknown[][],
    "项目清单",
    projectImportHeaders,
  );
  const milestoneRows = readImportSheet(
    milestoneSheet!.data as unknown[][],
    "节点计划",
    milestoneImportHeaders,
  );
  return {
    projects: projectRows.map(({ rowNumber, value }) => ({
      rowNumber,
      code: value("项目编码"),
      name: value("项目名称"),
      ownerName: value("项目经理姓名"),
      ownerEmail: value("项目经理邮箱"),
      org: value("所属组织"),
      type: value("项目类型"),
      riskLevel: value("初始风险"),
    })),
    milestones: milestoneRows.map(({ rowNumber, value }) => ({
      rowNumber,
      projectCode: value("项目编码"),
      templateCode: value("节点编码"),
      name: value("节点名称"),
      sequence: value("节点序号"),
      weight: value("权重"),
      critical: value("关键节点"),
      applicable: value("是否适用"),
      plannedStart: value("计划开始日"),
      plannedFinish: value("计划完成日"),
    })),
  };
}

async function downloadProjectImportTemplate(
  templateData: TemplateData[],
  projectManagers: ProjectManagerAccount[],
) {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const activeTemplates = templateData
    .filter((template) => template.active)
    .sort((left, right) => left.sequence - right.sequence);
  const projectData = [
    [...projectImportHeaders],
    ["", "", "", "", "", "", "低"],
  ];
  const milestoneData = [
    [...milestoneImportHeaders],
    ...activeTemplates.map((template) => [
      "",
      template.code,
      template.name,
      template.sequence,
      template.defaultWeight,
      template.critical ? "是" : "否",
      "是",
      "",
      "",
    ]),
  ];
  const instructionData = [
    ["序号", "填写说明"],
    [
      "1",
      "项目清单：一个项目填写一行，项目编码必须唯一，仅支持新建项目；负责人必须从“项目经理账号”工作表选择。",
    ],
    [
      "2",
      `节点计划：每个项目必须覆盖当前${activeTemplates.length}个启用标准节点；复制整组标准节点行并填写项目编码及日期。`,
    ],
    ["3", "权重填写数字5代表5%，同一项目全部节点权重合计必须为100。"],
    [
      "4",
      "自定义节点可追加在标准节点之后：节点编码留空，填写节点名称、序号、权重及日期。",
    ],
    ["5", "日期统一使用YYYY-MM-DD；计划完成日不得早于计划开始日。"],
    ["6", "关键节点、是否适用支持填写“是/否”；初始风险支持“低/中/高”。"],
    [
      "7",
      "先在系统执行导入预检；只有全部校验通过后才能确认导入。导入过程不会覆盖已有项目。",
    ],
    ["", ""],
    ["当前标准节点", "编码 / 名称 / 默认权重 / 关键节点"],
    ...activeTemplates.map((template) => [
      String(template.sequence),
      `${template.code} / ${template.name} / ${template.defaultWeight}% / ${template.critical ? "关键" : "普通"}`,
    ]),
  ];
  await writeExcelFile([
    {
      sheet: "项目清单",
      data: projectData,
      columns: [
        { width: 15 },
        { width: 26 },
        { width: 16 },
        { width: 28 },
        { width: 22 },
        { width: 18 },
        { width: 12 },
      ],
      stickyRowsCount: 1,
    },
    {
      sheet: "节点计划",
      data: milestoneData,
      columns: [
        { width: 15 },
        { width: 12 },
        { width: 22 },
        { width: 11 },
        { width: 10 },
        { width: 12 },
        { width: 12 },
        { width: 16 },
        { width: 16 },
      ],
      stickyRowsCount: 1,
    },
    {
      sheet: "项目经理账号",
      data: [
        ["项目经理姓名", "项目经理邮箱"],
        ...projectManagers.map((manager) => [
          manager.displayName,
          manager.email,
        ]),
      ],
      columns: [{ width: 20 }, { width: 34 }],
      stickyRowsCount: 1,
    },
    {
      sheet: "填写说明",
      data: instructionData,
      columns: [{ width: 16 }, { width: 84 }],
      stickyRowsCount: 1,
    },
  ]).toFile("统建项目批量导入模板.xlsx");
}

function ProjectImportModal({
  templateData,
  projectManagers,
  onClose,
  onImported,
}: {
  templateData: TemplateData[];
  projectManagers: ProjectManagerAccount[];
  onClose: () => void;
  onImported: () => Promise<void>;
}) {
  const [fileName, setFileName] = useState("");
  const [payload, setPayload] = useState<Omit<ProjectImportPayload, "mode"> | null>(
    null,
  );
  const [result, setResult] = useState<ProjectImportResult | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "reading" | "previewing" | "ready" | "committing" | "success"
  >("idle");
  const [operationError, setOperationError] = useState("");
  const [downloading, setDownloading] = useState(false);

  async function requestImport(
    mode: "preview" | "commit",
    rows: Omit<ProjectImportPayload, "mode">,
  ) {
    const response = await fetch("/api/projects/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, ...rows }),
    });
    const responseResult = (await response.json()) as ProjectImportResult;
    if (!response.ok && response.status !== 422) {
      throw new Error(responseResult.error || "批量导入服务暂不可用。");
    }
    return responseResult;
  }

  async function selectWorkbook(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFileName(file.name);
    setPayload(null);
    setResult(null);
    setOperationError("");
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setPhase("idle");
      setOperationError("仅支持.xlsx格式，请使用系统模板。");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPhase("idle");
      setOperationError("文件不能超过10MB。");
      return;
    }
    try {
      setPhase("reading");
      const rows = await parseProjectImportWorkbook(file);
      setPayload(rows);
      setPhase("previewing");
      const preview = await requestImport("preview", rows);
      setResult(preview);
      setPhase(preview.valid ? "ready" : "idle");
    } catch (error) {
      setPhase("idle");
      setOperationError(
        error instanceof Error ? error.message : "Excel文件解析失败。",
      );
    }
  }

  async function commitImport() {
    if (!payload || !result?.valid) return;
    setOperationError("");
    setPhase("committing");
    try {
      const committed = await requestImport("commit", payload);
      setResult(committed);
      if (!committed.valid) {
        setPhase("idle");
        return;
      }
      await onImported();
      setPhase("success");
    } catch (error) {
      setPhase("ready");
      setOperationError(
        error instanceof Error ? error.message : "确认导入失败。",
      );
    }
  }

  async function downloadTemplate() {
    setDownloading(true);
    setOperationError("");
    try {
      await downloadProjectImportTemplate(templateData, projectManagers);
    } catch (error) {
      setOperationError(
        error instanceof Error ? error.message : "模板下载失败。",
      );
    } finally {
      setDownloading(false);
    }
  }

  const busy =
    phase === "reading" ||
    phase === "previewing" ||
    phase === "committing";
  const currentStep =
    phase === "success" ? 3 : result?.valid ? 2 : fileName ? 1 : 0;

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <section
        className="create-modal project-import-modal"
        onClick={(event) => event.stopPropagation()}
        aria-busy={busy}
        aria-labelledby="project-import-title"
      >
        <button
          className="modal-close"
          onClick={onClose}
          disabled={busy}
          aria-label="关闭批量导入"
        >
          ×
        </button>
        <span className="modal-kicker">EXCEL BATCH IMPORT</span>
        <h2 id="project-import-title">Excel批量导入项目</h2>
        <p>本地解析文件、服务端逐行预检、事务化一次写入；任何一行失败都不会创建项目。</p>

        <div className="import-stepper" aria-label="导入步骤">
          {["上传文件", "导入预检", "完成导入"].map((label, index) => (
            <div
              key={label}
              className={`${currentStep >= index + 1 ? "done" : ""} ${currentStep === index ? "active" : ""}`}
            >
              <span>{phase === "success" || currentStep > index + 1 ? "✓" : index + 1}</span>
              <strong>{label}</strong>
            </div>
          ))}
        </div>

        {phase !== "success" && (
          <label className={`import-dropzone ${busy ? "busy" : ""}`}>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={selectWorkbook}
              disabled={busy}
            />
            <span className="import-file-symbol">⇧</span>
            <strong>
              {phase === "reading"
                ? "正在解析Excel文件…"
                : phase === "previewing"
                  ? "正在执行导入预检…"
                  : fileName || "点击选择.xlsx文件"}
            </strong>
            <small>
              {fileName
                ? "重新选择文件将覆盖当前预检结果"
                : "文件仅在浏览器解析为结构化数据，不上传原始Excel；最大10MB"}
            </small>
          </label>
        )}

        {result?.summary && phase !== "success" && (
          <div className="import-summary">
            <div><small>项目</small><strong>{result.summary.projectCount}</strong></div>
            <div><small>全部节点</small><strong>{result.summary.milestoneCount}</strong></div>
            <div><small>标准节点</small><strong>{result.summary.standardMilestoneCount}</strong></div>
            <div><small>自定义节点</small><strong>{result.summary.customMilestoneCount}</strong></div>
          </div>
        )}

        {result && !result.valid && (
          <section className="import-validation-panel invalid">
            <div className="import-validation-head">
              <div>
                <strong>导入预检未通过</strong>
                <small>共发现{result.errorCount}项问题，修正Excel后重新选择文件。</small>
              </div>
              <span>阻止导入</span>
            </div>
            <div className="import-error-table">
              <div><span>工作表</span><span>行号</span><span>字段</span><span>问题说明</span></div>
              {result.errors.map((issue, index) => (
                <div key={`${issue.sheet}-${issue.row}-${issue.field}-${index}`}>
                  <span>{issue.sheet}</span>
                  <span>{issue.row}</span>
                  <span>{issue.field}</span>
                  <span>{issue.message}</span>
                </div>
              ))}
              {result.errorCount > result.errors.length && (
                <p>仅展示前{result.errors.length}项，请先修正后再次预检。</p>
              )}
            </div>
          </section>
        )}

        {result?.valid && phase !== "success" && (
          <section className="import-validation-panel valid">
            <div className="import-validation-head">
              <div>
                <strong>导入预检通过</strong>
                <small>结构、必填项、标准节点覆盖和权重均已校验，可确认导入。</small>
              </div>
              <span>可导入</span>
            </div>
            <div className="import-preview-table">
              <div><span>项目</span><span>负责人 / 组织</span><span>节点</span><span>计划周期</span><span>权重</span></div>
              {result.projects?.slice(0, 20).map((project) => (
                <div key={project.code}>
                  <span><strong>{project.name}</strong><small>{project.code} · {project.type}</small></span>
                  <span><strong>{project.ownerName}</strong><small>{project.org}</small></span>
                  <span>{project.milestoneCount}<small>{project.customMilestoneCount ? `含${project.customMilestoneCount}个自定义` : "全部标准"}</small></span>
                  <span>{project.plannedStart}<small>至 {project.plannedFinish}</small></span>
                  <span>{project.totalWeight}%</span>
                </div>
              ))}
              {(result.projects?.length ?? 0) > 20 && (
                <p>另有{(result.projects?.length ?? 0) - 20}个项目将在确认后一次导入。</p>
              )}
            </div>
          </section>
        )}

        {phase === "success" && result && (
          <section className="import-success-state">
            <span>✓</span>
            <h3>批量导入完成</h3>
            <p>已创建{result.created}个项目、{result.summary.milestoneCount}个节点，并生成原始基线V1。</p>
            <dl>
              <div><dt>导入批次</dt><dd>{result.batchId}</dd></div>
              <div><dt>标准 / 自定义节点</dt><dd>{result.summary.standardMilestoneCount} / {result.summary.customMilestoneCount}</dd></div>
            </dl>
          </section>
        )}

        {operationError && (
          <div className="form-error" role="alert">! {operationError}</div>
        )}

        <div className="modal-actions import-modal-actions">
          {phase !== "success" && (
            <button
              type="button"
              className="outline-button template-download-button"
              onClick={downloadTemplate}
              disabled={busy || downloading}
            >
              {downloading ? "正在生成…" : "下载导入模板"}
            </button>
          )}
          <button
            type="button"
            className="outline-button"
            onClick={onClose}
            disabled={busy}
          >
            {phase === "success" ? "完成" : "取消"}
          </button>
          {phase !== "success" && (
            <button
              type="button"
              className="primary-button"
              onClick={commitImport}
              disabled={phase !== "ready" || !result?.valid}
            >
              {phase === "committing" ? "正在事务导入…" : "确认导入"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function Portfolio({
  onNavigate,
  onDataChanged,
  projectData = projects,
  identity,
  templateData = defaultTemplateData,
  projectManagers = [],
  weeklyReports = [],
}: {
  onNavigate: Navigate;
  onDataChanged: () => Promise<void>;
  projectData?: ProjectData[];
  identity: Identity | null;
  templateData?: TemplateData[];
  projectManagers?: ProjectManagerAccount[];
  weeklyReports?: WeeklyReportRow[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("全部");
  const [lifecycle, setLifecycle] = useState<ProjectLifecycleStatus | "all">(
    "active",
  );
  const [displayMode, setDisplayMode] = useState<"table" | "heatmap">("table");
  const [page, setPage] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [creating, setCreating] = useState(false);
  const [templateDownloading, setTemplateDownloading] = useState(false);
  const [createError, setCreateError] = useState("");
  const [portfolioError, setPortfolioError] = useState("");
  const [projectPlanStart, setProjectPlanStart] = useState("");
  const [projectPlanFinish, setProjectPlanFinish] = useState("");
  const [projectPlanRows, setProjectPlanRows] = useState<
    ProjectScheduleMilestone[]
  >([]);
  const [projectPlanError, setProjectPlanError] = useState("");
  const canManagePortfolio =
    identity?.role === "pmo" || identity?.role === "admin";
  const activeProjects = useMemo(
    () => projectData.filter((project) => projectLifecycle(project) === "active"),
    [projectData],
  );
  const matching = useMemo(
    () =>
      projectData.filter(
        (project) =>
          project.name.includes(query.trim()) &&
          (lifecycle === "all" || projectLifecycle(project) === lifecycle) &&
          (status === "全部" || statusLabel[project.status] === status),
      ),
    [lifecycle, query, status, projectData],
  );
  const pageCount = Math.max(1, Math.ceil(matching.length / 10));
  const safePage = Math.min(page, pageCount - 1);
  const filtered = matching.slice(safePage * 10, safePage * 10 + 10);
  const counts = {
    all: activeProjects.length,
    green: activeProjects.filter((project) => project.status === "green").length,
    yellow: activeProjects.filter((project) => project.status === "yellow").length,
    red: activeProjects.filter((project) => project.status === "red").length,
  };
  const percent = (value: number) => counts.all ? `${((value / counts.all) * 100).toFixed(1)}%` : "0%";
  const reportingWeek = currentReportingPeriod().weekKey;
  const submittedProjects = new Set(
    weeklyReports
      .filter(
        (report) =>
          report.weekKey === reportingWeek &&
          report.status !== "draft" &&
          activeProjects.some((project) => project.id === report.projectId),
      )
      .map((report) => report.projectId),
  ).size;
  const reportCompletion = counts.all
    ? Number(((submittedProjects / counts.all) * 100).toFixed(1))
    : 0;
  const matrixTemplates = templateData
    .filter((template) => template.active)
    .sort((left, right) => left.sequence - right.sequence);

  function generateProjectPlan(start: string, finish: string) {
    try {
      const rows = buildWeightedProjectSchedule(
        matrixTemplates,
        start,
        finish,
      );
      setProjectPlanRows(rows);
      setProjectPlanError("");
    } catch (error) {
      setProjectPlanRows([]);
      setProjectPlanError(
        error instanceof Error ? error.message : "项目节点计划生成失败",
      );
    }
  }

  function openCreateProject() {
    const start = shanghaiTodayIso();
    const finish = addIsoDays(start, 364);
    setProjectPlanStart(start);
    setProjectPlanFinish(finish);
    setCreateError("");
    generateProjectPlan(start, finish);
    setShowCreate(true);
  }

  function updateProjectRange(
    field: "start" | "finish",
    value: string,
  ) {
    const start = field === "start" ? value : projectPlanStart;
    const finish = field === "finish" ? value : projectPlanFinish;
    if (field === "start") setProjectPlanStart(value);
    else setProjectPlanFinish(value);
    if (start && finish) generateProjectPlan(start, finish);
  }

  function updateProjectPlanRow(
    id: number,
    field: "plannedStart" | "plannedFinish",
    value: string,
  ) {
    const rows = projectPlanRows.map((row) =>
      row.id === id ? { ...row, [field]: value } : row,
    );
    setProjectPlanRows(rows);
    try {
      validateProjectSchedule(rows);
      setProjectPlanError("");
    } catch (error) {
      setProjectPlanError(
        error instanceof Error ? error.message : "节点计划日期无效",
      );
    }
  }

  async function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setCreateError("");
    const form = new FormData(event.currentTarget);
    try {
      const ownerEmail = String(form.get("ownerEmail") ?? "");
      const ownerAccount = projectManagers.find(
        (manager) => manager.email === ownerEmail,
      );
      if (!ownerAccount) {
        throw new Error("请选择账号目录中的已启用项目经理。");
      }
      validateProjectSchedule(projectPlanRows);
      if (projectPlanRows.length !== matrixTemplates.length) {
        throw new Error("节点计划与当前启用模板不一致，请重新生成。");
      }
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: form.get("code"),
          name: form.get("name"),
          ownerName: ownerAccount.displayName,
          ownerEmail: ownerAccount.email,
          org: form.get("org"),
          type: form.get("type"),
          riskLevel: form.get("riskLevel"),
          milestones: projectPlanRows.map((template) => ({
            name: template.name,
            sequence: template.sequence,
            weight: template.defaultWeight,
            critical: template.critical,
            applicable: true,
            plannedStart: template.plannedStart,
            plannedFinish: template.plannedFinish,
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
  async function downloadImportTemplate() {
    setTemplateDownloading(true);
    setPortfolioError("");
    try {
      await downloadProjectImportTemplate(templateData, projectManagers);
    } catch (error) {
      setPortfolioError(
        error instanceof Error ? error.message : "导入模板生成失败。",
      );
    } finally {
      setTemplateDownloading(false);
    }
  }
  return <div className="workspace-page">
    <WorkspaceHeader title="项目组合总览" subtitle={`以统一口径监控 ${counts.all} 个在建项目，项目库共 ${projectData.length} 个`} onNavigate={onNavigate} identity={identity} />
    <div className="page-content">
      <div className="summary-strip">
        <div className="summary-card"><span className="summary-icon blue">▦</span><div><small>在建项目</small><strong>{counts.all}</strong><em>项目库 {projectData.length}</em></div></div>
        <div className="summary-card"><span className="summary-icon green">●</span><div><small>绿色项目</small><strong>{counts.green}</strong><em>{percent(counts.green)}</em></div></div>
        <div className="summary-card"><span className="summary-icon yellow">▲</span><div><small>黄色项目</small><strong>{counts.yellow}</strong><em>{percent(counts.yellow)}</em></div></div>
        <div className="summary-card"><span className="summary-icon red">■</span><div><small>红色项目</small><strong>{counts.red}</strong><em>{percent(counts.red)}</em></div></div>
        <div className="summary-card wide"><div><small>{reportingWeek} 周报完成率</small><strong>{reportCompletion}%</strong></div><ProgressBar value={reportCompletion} /><span>{submittedProjects} / {counts.all}</span></div>
      </div>
      <section className="content-card">
        <div className="table-toolbar">
          <div><h2>{displayMode === "table" ? "项目清单" : "项目节点热力矩阵"}</h2><span>当前批准基线口径</span></div>
          <div className="toolbar-actions">
            <label className="search"><span>⌕</span><input placeholder="搜索项目名称" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /></label>
            <select aria-label="生命周期筛选" value={lifecycle} onChange={e => { setLifecycle(e.target.value as ProjectLifecycleStatus | "all"); setPage(0); }}><option value="active">在建</option><option value="completed">已结项</option><option value="archived">已归档</option><option value="all">全部状态</option></select>
            <select value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}><option>全部</option><option>正常</option><option>预警</option><option>严重</option></select>
            <div className="view-switch" aria-label="项目视图"><button className={displayMode === "table" ? "active" : ""} onClick={() => setDisplayMode("table")}>列表</button><button className={displayMode === "heatmap" ? "active" : ""} onClick={() => setDisplayMode("heatmap")}>节点热力</button></div>
            {canManagePortfolio && <div className="portfolio-import-actions">
              <button className="outline-button" onClick={downloadImportTemplate} disabled={templateDownloading}>{templateDownloading ? "正在生成…" : "下载导入模板"}</button>
              <button className="outline-button import-button" onClick={() => setShowImport(true)}>⇧ Excel批量导入</button>
              <button className="primary-button" onClick={openCreateProject}>＋ 新建项目</button>
            </div>}
          </div>
        </div>
        {portfolioError && <div className="portfolio-operation-error" role="alert">! {portfolioError}<button onClick={() => setPortfolioError("")}>×</button></div>}
        {displayMode === "table" ? <div className="project-table">
          <div className="table-head"><span>项目名称</span><span>健康状态</span><span>项目经理</span><span>计划 / 实际</span><span>进度偏差</span><span>风险</span><span>更新时间</span><span /></div>
          {filtered.map(p => <div className="table-row" key={p.id}>
            <button className="project-name" onClick={() => onNavigate("project", p.id)}><i>{p.id}</i><span><strong>{p.name} <em className={`lifecycle-badge ${projectLifecycle(p)}`}>{lifecycleLabel[projectLifecycle(p)]}</em></strong><small>{p.org} · {p.type}</small></span></button>
            <span><StatusPill status={p.status} /></span><span className="owner"><i>{p.owner[0]}</i>{p.owner}</span>
            <span className="dual-progress"><b>{p.actual}%</b><ProgressBar value={p.actual} tone={p.status} /><small>计划 {p.plan}%</small></span>
            <span className={p.actual - p.plan < -5 ? "negative" : "positive"}>{p.actual - p.plan > 0 ? "+" : ""}{(p.actual - p.plan).toFixed(1)} pp</span>
            <span className={`risk ${p.risk === "高" ? "high" : p.risk === "中" ? "medium" : "low"}`}>{p.risk}风险</span><span title={p.updatedAt ? SHANGHAI_TIME_ZONE_LABEL : undefined}>{p.updatedAt ? formatShanghaiMonthDayTime(p.updatedAt) : "数据未同步"}</span><button className="more" aria-label={`查看${p.name}`} onClick={() => onNavigate("project", p.id)}>•••</button>
          </div>)}
        </div> : <div className="portfolio-matrix"><div className="portfolio-matrix-grid" style={{ "--portfolio-milestone-count": matrixTemplates.length } as React.CSSProperties}><div className="portfolio-matrix-head"><div>项目 / 健康度</div>{matrixTemplates.map((template) => <div key={template.id}><span>{template.code}</span>{template.name}</div>)}</div>{filtered.map((project) => <div className="portfolio-matrix-row" key={project.id}><button className="portfolio-project-cell" onClick={() => onNavigate("project", project.id)}><StatusPill status={project.status} compact /><span><strong>{project.name} <em className={`lifecycle-badge ${projectLifecycle(project)}`}>{lifecycleLabel[projectLifecycle(project)]}</em></strong><small>{project.owner} · {project.org}</small></span><b>{project.score}</b></button>{matrixTemplates.map((template) => { const milestone = project.milestones?.find((row) => row.templateId === template.id || row.name === template.name); const cellStatus = milestone?.status ?? "na"; return <button key={template.id} className={`portfolio-heat-cell ${cellStatus}`} aria-label={`${project.name} ${template.name} ${statusLabel[cellStatus]}`} onClick={() => onNavigate("project", project.id)}><span>{statusSymbol[cellStatus]}</span><small>{cellStatus === "na" ? "N/A" : milestone && milestone.deviationDays > 0 ? `+${milestone.deviationDays}天` : `${milestone?.completion ?? 0}%`}</small></button>; })}</div>)}</div></div>}
        <div className="pagination"><span>共 {matching.length} 条，每页 10 条</span><div><button disabled={safePage === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>‹</button>{Array.from({ length: pageCount }, (_, index) => <button key={index} className={safePage === index ? "active" : ""} onClick={() => setPage(index)}>{index + 1}</button>)}<button disabled={safePage === pageCount - 1} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>›</button></div></div>
      </section>
    </div>
    {showCreate && (
      <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
        <section
          className="create-modal project-setup-modal"
          onClick={(event) => event.stopPropagation()}
        >
          <button className="modal-close" onClick={() => setShowCreate(false)}>
            ×
          </button>
          <span className="modal-kicker">PROJECT SETUP</span>
          <h2>新建统建项目</h2>
          <p>
            套用{matrixTemplates.length}个当前启用的标准节点，并按本项目独立计划周期生成可逐项校准的节点日期。
          </p>
          <form onSubmit={createProject}>
            <div className="modal-form-grid">
              <label>
                项目编码
                <input name="code" placeholder="例如 P11" required />
              </label>
              <label>
                项目名称
                <input name="name" placeholder="请输入项目名称" required />
              </label>
              <label>
                项目经理账号
                <select name="ownerEmail" defaultValue="" required>
                  <option value="" disabled>
                    {projectManagers.length
                      ? "请选择已启用项目经理"
                      : "暂无可用项目经理账号"}
                  </option>
                  {projectManagers.map((manager) => (
                    <option key={manager.email} value={manager.email}>
                      {manager.displayName} · {manager.email}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                所属组织
                <input name="org" placeholder="例如 财务数智组" required />
              </label>
              <label>
                项目类型
                <select name="type">
                  <option>核心系统</option>
                  <option>业务平台</option>
                  <option>数据平台</option>
                  <option>技术底座</option>
                </select>
              </label>
              <label>
                初始风险
                <select name="riskLevel">
                  <option value="low">低风险</option>
                  <option value="medium">中风险</option>
                  <option value="high">高风险</option>
                </select>
              </label>
            </div>
            {!projectManagers.length && (
              <div className="form-error" role="alert">
                ! 尚未预置已启用的项目经理账号，请先前往系统管理完成账号配置。
              </div>
            )}
            <div className="project-plan-builder">
              <div className="project-plan-heading">
                <div>
                  <strong>项目节点计划</strong>
                  <span>
                    系统按节点权重分配时间，可继续修改任一节点的开始和完成日期
                  </span>
                </div>
                <div className="project-range-fields">
                  <label>
                    项目开始
                    <input
                      type="date"
                      value={projectPlanStart}
                      onChange={(event) =>
                        updateProjectRange("start", event.target.value)
                      }
                      required
                    />
                  </label>
                  <label>
                    目标完成
                    <input
                      type="date"
                      value={projectPlanFinish}
                      onChange={(event) =>
                        updateProjectRange("finish", event.target.value)
                      }
                      required
                    />
                  </label>
                </div>
              </div>
              {projectPlanRows.length > 0 && (
                <div className="project-plan-table">
                  <div className="project-plan-head">
                    <span>节点</span>
                    <span>权重</span>
                    <span>计划开始</span>
                    <span>计划完成</span>
                    <span>天数</span>
                  </div>
                  {projectPlanRows.map((row) => (
                    <div className="project-plan-row" key={row.id}>
                      <span>
                        <i>{row.code}</i>
                        <strong>{row.name}</strong>
                        {row.critical && <small>关键</small>}
                      </span>
                      <b>{row.defaultWeight}%</b>
                      <input
                        type="date"
                        value={row.plannedStart}
                        onChange={(event) =>
                          updateProjectPlanRow(
                            row.id,
                            "plannedStart",
                            event.target.value,
                          )
                        }
                        required
                      />
                      <input
                        type="date"
                        value={row.plannedFinish}
                        onChange={(event) =>
                          updateProjectPlanRow(
                            row.id,
                            "plannedFinish",
                            event.target.value,
                          )
                        }
                        required
                      />
                      <em>
                        {formatScheduleSpan(
                          row.plannedStart,
                          row.plannedFinish,
                        )}
                      </em>
                    </div>
                  ))}
                </div>
              )}
              {projectPlanError && (
                <div className="form-error" role="alert">
                  ! {projectPlanError}
                </div>
              )}
            </div>
            <div className="template-summary">
              <strong>标准节点模板</strong>
              <span>
                {matrixTemplates.map((template) => template.name).join(" → ")}
              </span>
            </div>
            {createError && (
              <div className="form-error" role="alert">
                ! {createError}
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="outline-button"
                onClick={() => setShowCreate(false)}
              >
                取消
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={
                  creating ||
                  Boolean(projectPlanError) ||
                  !projectPlanRows.length ||
                  !projectManagers.length
                }
              >
                {creating ? "正在创建…" : "创建项目并冻结原始基线"}
              </button>
            </div>
          </form>
        </section>
      </div>
    )}
    {showImport && canManagePortfolio && (
      <ProjectImportModal
        templateData={templateData}
        projectManagers={projectManagers}
        onClose={() => setShowImport(false)}
        onImported={onDataChanged}
      />
    )}
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
      action.recoveryDate < shanghaiTodayIso(),
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
      {data.weeklyReports.length ? <><WeeklyProgressChart reports={data.weeklyReports} /><div className="weekly-history-table">
        <div className="table-head"><span>周期</span><span>系统进度</span><span>申报进度</span><span>差异</span><span>状态</span><span>提交人</span><span>更新时间</span></div>
        {data.weeklyReports.map((report) => <article className="table-row" key={report.id}>
          <span><strong>{report.weekKey}</strong><small>{report.forecastFinish ? `预测完成 ${report.forecastFinish}` : "未填项目预测日"}</small></span>
          <span>{report.systemProgress.toFixed(1)}%</span>
          <span>{report.declaredProgress.toFixed(1)}%</span>
          <span className={Math.abs(report.variance) > 5 ? "red-text" : ""}>{report.variance > 0 ? "+" : ""}{report.variance.toFixed(1)}pp</span>
          <span className={`report-status ${report.status}`}>{reportStatus[report.status]}</span>
          <span>{report.submittedBy}</span>
          <time dateTime={report.submittedAt} title={SHANGHAI_TIME_ZONE_LABEL}>{formatShanghaiDateTime(report.submittedAt)}</time>
          {report.reason && <p>{report.reason}</p>}
          {data.attachments.some((attachment) => attachment.weekKey === report.weekKey) && <div className="history-attachments"><strong>支撑附件</strong>{data.attachments.filter((attachment) => attachment.weekKey === report.weekKey).map((attachment) => <a key={attachment.id} href={`/api/attachments/${attachment.id}`} target="_blank" rel="noreferrer"><span>↧</span>{attachment.filename}<small>{formatFileSize(attachment.sizeBytes)}</small></a>)}</div>}
        </article>)}
      </div></> : <div className="empty-state">暂无周报记录</div>}
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
            <span><strong>{kindNames[version.kind]}</strong><small title={SHANGHAI_TIME_ZONE_LABEL}>{version.createdBy} · {formatShanghaiDateTime(version.createdAt)}</small></span>
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
      {data.baselineChanges.length > 0 && <div className="baseline-change-history"><h3>变更申请记录</h3>{data.baselineChanges.map((change) => <div key={change.id}><span className={`change-status ${change.status}`}>{change.status === "pending" ? "待审批" : change.status === "approved" ? "已批准" : "已驳回"}</span><strong>V{change.versionFrom} → V{change.versionTo}</strong><p>{change.reason}</p><small title={SHANGHAI_TIME_ZONE_LABEL}>{change.requestedBy} · {formatShanghaiDateTime(change.requestedAt)}</small></div>)}</div>}
    </section>;
  }

  const actionNames: Record<string, string> = {
    "weekly_report.save_draft": "保存周报草稿",
    "weekly_report.submit": "提交周报",
    "baseline_change.request": "申请基线变更",
    "baseline_change.approve": "批准基线变更",
    "baseline_change.reject": "驳回基线变更",
    "project.update": "更新项目信息",
    "project.owner_transfer": "移交项目负责人",
    "project.lifecycle_change": "变更项目生命周期",
    "project_milestones.update": "更新项目节点治理",
    "project_milestone.create_custom": "新增项目自定义节点",
    "risk.create": "登记风险",
    "risk.update": "更新风险",
    "corrective_action.create": "新增纠偏措施",
    "corrective_action.update": "更新纠偏措施",
    "attachment.upload": "上传周报附件",
    "attachment.delete": "删除周报附件",
  };
  return <section className="content-card activity-card">
    <div className="card-title"><div><h2>操作审计</h2><p>项目、节点、风险、措施与基线关键操作统一追踪</p></div><button className="text-button" onClick={loadActivity}>刷新</button></div>
    {data.auditLogs.length ? <div className="project-audit-timeline">{data.auditLogs.map((row) => <article key={row.id}><span className="audit-dot" /><div><strong>{actionNames[row.action] ?? row.action}</strong><p>{row.actorEmail} · {row.entityType} / {row.entityId}</p></div><time dateTime={row.createdAt} title={SHANGHAI_TIME_ZONE_LABEL}>{formatShanghaiDateTime(row.createdAt)}</time></article>)}</div> : <div className="empty-state">暂无项目操作记录</div>}
  </section>;
}

function ProjectDetail({
  onNavigate,
  onDataChanged,
  projectData = projects,
  projectId,
  identity,
  projectManagers = [],
}: {
  onNavigate: Navigate;
  onDataChanged: () => Promise<void>;
  projectData?: ProjectData[];
  projectId: string;
  identity: Identity | null;
  projectManagers?: ProjectManagerAccount[];
}) {
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
  const [showLifecycle, setShowLifecycle] = useState(false);
  const [lifecycleClosure, setLifecycleClosure] =
    useState<ProjectClosureState | null>(null);
  const [lifecycleReason, setLifecycleReason] = useState("");
  const [lifecycleOverride, setLifecycleOverride] = useState(false);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);
  const [lifecycleWorking, setLifecycleWorking] = useState(false);
  const [lifecycleError, setLifecycleError] = useState("");
  const currentProject =
    projectData.find((project) => project.id === projectId) ??
    projectData[0] ??
    projects[0];
  const variance = Number(
    (currentProject.actual - currentProject.plan).toFixed(1),
  );
  const currentLifecycle = projectLifecycle(currentProject);
  const lifecycleLocked = currentLifecycle !== "active";
  const healthExplanation = currentProject.healthExplanation;
  const activeVetoes = healthExplanation
    ? [
        healthExplanation.vetoes.criticalRed ? "关键节点红色" : "",
        healthExplanation.vetoes.highRiskOverdue ? "高风险措施逾期" : "",
        healthExplanation.vetoes.consecutiveMissing ? "连续两个周期缺报" : "",
      ].filter(Boolean)
    : [];
  const canUpdate =
    !lifecycleLocked &&
    (identity?.role === "admin" ||
      identity?.role === "pmo" ||
      (identity?.role === "manager" &&
        Boolean(currentProject.ownerEmail) &&
        identity.email === currentProject.ownerEmail));
  const canChangeOwner =
    identity?.role === "admin" || identity?.role === "pmo";
  const canChangeLifecycle =
    identity?.role === "admin" || identity?.role === "pmo";
  const currentOwnerInDirectory = projectManagers.some(
    (manager) => manager.email === currentProject.ownerEmail,
  );
  const adjustableMilestones =
    currentProject.milestones?.filter((milestone) => milestone.applicable) ?? [];
  const displayMilestones = [...(currentProject.milestones ?? [])].sort(
    (left, right) => left.sequence - right.sequence,
  );

  async function openLifecyclePanel() {
    setShowLifecycle(true);
    setLifecycleLoading(true);
    setLifecycleError("");
    setLifecycleReason("");
    setLifecycleOverride(false);
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(currentProject.id)}/lifecycle`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as {
        error?: string;
        closure?: ProjectClosureState;
      };
      if (!response.ok || !result.closure) {
        throw new Error(result.error || "项目结项检查读取失败");
      }
      setLifecycleClosure(result.closure);
    } catch (error) {
      setLifecycleError(
        error instanceof Error ? error.message : "项目结项检查读取失败",
      );
    } finally {
      setLifecycleLoading(false);
    }
  }

  async function changeLifecycle(status: ProjectLifecycleStatus) {
    if (lifecycleReason.trim().length < 10) {
      setLifecycleError("状态变更原因至少填写10个字符。");
      return;
    }
    setLifecycleWorking(true);
    setLifecycleError("");
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(currentProject.id)}/lifecycle`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            status,
            reason: lifecycleReason,
            overrideOpenItems:
              status === "completed" ? lifecycleOverride : false,
          }),
        },
      );
      const result = (await response.json()) as {
        error?: string;
        closure?: ProjectClosureState;
      };
      if (!response.ok) {
        if (result.closure) setLifecycleClosure(result.closure);
        throw new Error(result.error || "项目状态变更失败");
      }
      await onDataChanged();
      setShowLifecycle(false);
      setProjectSuccess(true);
      window.setTimeout(() => setProjectSuccess(false), 3000);
    } catch (error) {
      setLifecycleError(
        error instanceof Error ? error.message : "项目状态变更失败",
      );
    } finally {
      setLifecycleWorking(false);
    }
  }

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
      const ownerEmail = String(form.get("ownerEmail") ?? "");
      const ownerAccount = projectManagers.find(
        (manager) => manager.email === ownerEmail,
      );
      if (!ownerAccount) {
        setProjectWorking(false);
        setProjectError("请选择账号目录中的已启用项目经理。");
        return;
      }
      if (
        ownerAccount.email !== currentProject.ownerEmail ||
        ownerAccount.displayName !== currentProject.owner
      ) {
        payload.ownerName = ownerAccount.displayName;
        payload.ownerEmail = ownerAccount.email;
      }
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
        <div className="project-identity"><div className="project-code">{currentProject.name[0]}</div><div><div><StatusPill status={currentProject.status} /><span className={`lifecycle-badge ${currentLifecycle}`}>{lifecycleLabel[currentLifecycle]}</span><span className="project-tag">{currentProject.type}</span>{currentProject.cells.some((cell) => cell === "red") && <span className="project-tag">重点关注</span>}</div><h2>{currentProject.name}</h2><p>项目经理 {currentProject.owner}　·　{currentProject.org}　·　当前批准基线口径</p></div></div>
        <div className="hero-metrics"><div><small>健康度</small><strong className={currentProject.status === "red" ? "red-text" : ""}>{currentProject.score}</strong><span>/100</span></div><div><small>计划进度</small><strong>{currentProject.plan}%</strong></div><div><small>实际进度</small><strong>{currentProject.actual}%</strong></div><div><small>进度偏差</small><strong className={variance < -5 ? "red-text" : ""}>{variance > 0 ? "+" : ""}{variance}pp</strong></div></div>
        <div className="hero-actions"><button className="outline-button" onClick={() => window.print()}>导出报告</button>{canChangeLifecycle && <button className="outline-button" onClick={openLifecyclePanel}>项目状态</button>}{canUpdate && <><button className="outline-button" onClick={() => { setProjectError(""); setShowProjectEdit(true); }}>编辑信息</button><button className="primary-button" onClick={() => onNavigate("report", currentProject.id)}>更新本周进度</button></>}</div>
      </section>
      {lifecycleLocked && <div className="lifecycle-readonly-banner"><span>▣</span><div><strong>项目{lifecycleLabel[currentLifecycle]}，当前为只读状态</strong><p>已停止周报、催报、健康度重算和快照统计；如需继续处理未闭环事项，请由 PMO 或管理员先恢复为在建。</p></div>{currentProject.lifecycleReason && <small>最近变更原因：{currentProject.lifecycleReason}</small>}</div>}
      <section className="score-explain">
        <div className="score-ring"><strong>{currentProject.score}</strong><span>综合健康度</span></div><div className="score-copy"><h3>项目{statusLabel[currentProject.status]}：评分与一票否决规则共同判定</h3><p>基础分 100，当前累计扣分 {healthExplanation?.deductions.total ?? 100 - currentProject.score} 分。{healthExplanation ? `采用规则 V${healthExplanation.ruleVersion}，度量日 ${healthExplanation.asOfDate}。` : "健康度明细将在下一次自动重算后生成。"}</p>{healthExplanation ? <div className="deductions"><span>进度与节点 <b>-{healthExplanation.deductions.schedule}</b></span><span>开放风险 <b>-{healthExplanation.deductions.risk}</b></span><span>逾期措施 <b>-{healthExplanation.deductions.action}</b></span><span>周报时效 <b>-{healthExplanation.deductions.reporting}</b></span></div> : <div className="deductions"><span>进度偏差 <b>{variance}pp</b></span><span>节点预警 <b>{currentProject.cells.filter((cell) => cell === "yellow").length}项</b></span><span>严重节点 <b>{currentProject.cells.filter((cell) => cell === "red").length}项</b></span></div>}{activeVetoes.length > 0 && <div className="health-veto">■ 一票否决：{activeVetoes.join("、")}</div>}</div><span className="count-badge">{healthExplanation ? `规则 V${healthExplanation.ruleVersion}` : "等待明细"}</span>
      </section>
      {healthExplanation && <section className="health-breakdown"><div><span>进度落后</span><strong>{healthExplanation.progressGap > 0 ? `${healthExplanation.progressGap}pp` : "无"}</strong><small>进度差扣 {healthExplanation.progressGapPenalty} 分</small></div><div><span>节点扣分</span><strong>{healthExplanation.milestonePenalty}</strong><small>普黄 {healthExplanation.milestoneCounts.normalYellow} / 普红 {healthExplanation.milestoneCounts.normalRed} / 关黄 {healthExplanation.milestoneCounts.criticalYellow} / 关红 {healthExplanation.milestoneCounts.criticalRed}</small></div><div><span>开放风险</span><strong>{healthExplanation.openMediumRiskCount + healthExplanation.openHighRiskCount}</strong><small>中风险 {healthExplanation.openMediumRiskCount} / 高风险 {healthExplanation.openHighRiskCount}</small></div><div><span>逾期措施</span><strong>{healthExplanation.overdueActionCount}</strong><small>按恢复目标日自动识别</small></div><div><span>最近周报</span><strong>{healthExplanation.latestReportWeek ?? "未提交"}</strong><small>评估周期 {healthExplanation.evaluationWeekKey}</small></div></section>}
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
    {showProjectEdit && (
      <div className="modal-backdrop" onClick={() => setShowProjectEdit(false)}>
        <section
          className="create-modal"
          onClick={(event) => event.stopPropagation()}
        >
          <button className="modal-close" onClick={() => setShowProjectEdit(false)}>
            ×
          </button>
          <span className="modal-kicker">PROJECT PROFILE</span>
          <h2>编辑项目基本信息</h2>
          <p>
            {currentProject.id} ·
            计划日期调整不在此处进行，须通过基线变更审批。
          </p>
          <form onSubmit={saveProject}>
            <div className="modal-form-grid">
              <label>
                项目名称
                <input name="name" defaultValue={currentProject.name} required />
              </label>
              <label>
                所属组织
                <input name="org" defaultValue={currentProject.org} required />
              </label>
              <label>
                项目类型
                <select name="type" defaultValue={currentProject.type}>
                  <option>核心系统</option>
                  <option>业务平台</option>
                  <option>数据平台</option>
                  <option>技术底座</option>
                  <option>其他</option>
                </select>
              </label>
              <label>
                风险等级
                <select
                  name="riskLevel"
                  defaultValue={
                    currentProject.risk === "高"
                      ? "high"
                      : currentProject.risk === "中"
                        ? "medium"
                        : "low"
                  }
                >
                  <option value="low">低风险</option>
                  <option value="medium">中风险</option>
                  <option value="high">高风险</option>
                </select>
              </label>
              {canChangeOwner ? (
                <label>
                  项目经理账号
                  <select
                    name="ownerEmail"
                    defaultValue={currentProject.ownerEmail ?? ""}
                    required
                  >
                    {!currentOwnerInDirectory && (
                      <option
                        value={currentProject.ownerEmail ?? ""}
                        disabled
                      >
                        {currentProject.owner} · 当前账号不可用，请移交
                      </option>
                    )}
                    {projectManagers.map((manager) => (
                      <option key={manager.email} value={manager.email}>
                        {manager.displayName} · {manager.email}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  项目经理
                  <input value={currentProject.owner} disabled readOnly />
                </label>
              )}
            </div>
            {!canChangeOwner && (
              <div className="form-hint">
                项目经理可维护业务信息；负责人调整仅限 PMO 或系统管理员。
              </div>
            )}
            {canChangeOwner && !projectManagers.length && (
              <div className="form-error" role="alert">
                ! 暂无可用项目经理账号，请先在系统管理中预置并启用账号。
              </div>
            )}
            {projectError && (
              <div className="form-error" role="alert">
                ! {projectError}
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="outline-button"
                onClick={() => setShowProjectEdit(false)}
              >
                取消
              </button>
              <button
                className="primary-button"
                disabled={
                  projectWorking || (canChangeOwner && !projectManagers.length)
                }
              >
                {projectWorking ? "正在保存…" : "保存项目信息"}
              </button>
            </div>
          </form>
        </section>
      </div>
    )}
    {showLifecycle && <div className="modal-backdrop" onClick={() => setShowLifecycle(false)}><section className="create-modal lifecycle-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowLifecycle(false)}>×</button><span className="modal-kicker">PROJECT LIFECYCLE</span><h2>项目状态管理</h2><p>{currentProject.name} · 当前状态 <b>{lifecycleLabel[currentLifecycle]}</b></p>{lifecycleLoading ? <div className="panel-loading">正在执行结项检查…</div> : lifecycleClosure && <div className="closure-checks"><div className={lifecycleClosure.incompleteMilestoneCount ? "blocked" : "clear"}><span>{lifecycleClosure.incompleteMilestoneCount ? "!" : "✓"}</span><strong>{lifecycleClosure.incompleteMilestoneCount}</strong><small>未完成适用节点</small></div><div className={lifecycleClosure.openRiskCount ? "blocked" : "clear"}><span>{lifecycleClosure.openRiskCount ? "!" : "✓"}</span><strong>{lifecycleClosure.openRiskCount}</strong><small>开放风险</small></div><div className={lifecycleClosure.openActionCount ? "blocked" : "clear"}><span>{lifecycleClosure.openActionCount ? "!" : "✓"}</span><strong>{lifecycleClosure.openActionCount}</strong><small>未完成措施</small></div><div className={lifecycleClosure.pendingBaselineCount ? "blocked" : "clear"}><span>{lifecycleClosure.pendingBaselineCount ? "!" : "✓"}</span><strong>{lifecycleClosure.pendingBaselineCount}</strong><small>待审批基线</small></div></div>}<label className="full-label">状态变更原因 <b>*</b><textarea value={lifecycleReason} minLength={10} maxLength={500} onChange={(event) => setLifecycleReason(event.target.value)} placeholder="至少10个字符，说明结项、归档或恢复在建的依据与后续安排" /></label>{currentLifecycle === "active" && lifecycleClosure && !lifecycleClosure.clear && <label className="lifecycle-override"><input type="checkbox" checked={lifecycleOverride} onChange={(event) => setLifecycleOverride(event.target.checked)} /><span><strong>确认带未闭环事项结项</strong><small>结项后项目业务数据将锁定；必须先恢复为在建，才能继续处理上述事项。</small></span></label>}{lifecycleError && <div className="form-error" role="alert">! {lifecycleError}</div>}<div className="modal-actions"><button className="outline-button" onClick={() => setShowLifecycle(false)}>取消</button>{currentLifecycle === "active" && <button className="primary-button" disabled={lifecycleLoading || lifecycleWorking || !lifecycleClosure || (!lifecycleClosure.clear && !lifecycleOverride) || lifecycleReason.trim().length < 10} onClick={() => changeLifecycle("completed")}>{lifecycleWorking ? "处理中…" : "标记结项"}</button>}{currentLifecycle === "completed" && <><button className="outline-button" disabled={lifecycleWorking || lifecycleReason.trim().length < 10} onClick={() => changeLifecycle("active")}>恢复在建</button><button className="primary-button" disabled={lifecycleWorking || lifecycleReason.trim().length < 10} onClick={() => changeLifecycle("archived")}>归档项目</button></>}{currentLifecycle === "archived" && <button className="primary-button" disabled={lifecycleWorking || lifecycleReason.trim().length < 10} onClick={() => changeLifecycle("active")}>恢复在建</button>}</div></section></div>}
    {baselineSuccess && <div className="toast"><span>✓</span><div><strong>基线变更申请已提交</strong><p>PMO 审批前当前批准基线保持不变。</p></div></div>}
    {projectSuccess && <div className="toast"><span>✓</span><div><strong>项目信息已更新</strong><p>修改已写入操作审计。</p></div></div>}
  </div>;
}

function WeeklyReport({ onNavigate, onDataChanged, projectId, projectData = projects, identity, snapshot }: { onNavigate: Navigate; onDataChanged: () => Promise<void>; projectId: string; projectData?: ProjectData[]; identity: Identity | null; snapshot: DashboardSnapshot | null }) {
  const currentProject =
    projectData.find((project) => project.id === projectId) ??
    projectData[0] ??
    projects[0];
  const lifecycleLocked = projectLifecycle(currentProject) !== "active";
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
    if (lifecycleLocked) {
      setSubmitError("项目已结项或归档，恢复为在建后才能上传附件。");
      return;
    }
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
    if (lifecycleLocked) {
      setSubmitError("项目已结项或归档，恢复为在建后才能删除附件。");
      return;
    }
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
    if (lifecycleLocked) {
      setSubmitError("项目已结项或归档，恢复为在建后才能填报周报。");
      return;
    }
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
      {lifecycleLocked && <div className="lifecycle-readonly-banner"><span>▣</span><div><strong>项目{lifecycleLabel[projectLifecycle(currentProject)]}，周报只读</strong><p>该项目不再进入催报与快照完整率统计。如需继续填报或收尾，请先由 PMO 或管理员恢复为在建。</p></div></div>}
      <div className="report-layout">
        <div className={`report-form ${lifecycleLocked ? "lifecycle-readonly" : ""}`}>
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
            <div className="form-title"><span>04</span><div><h3>支撑附件</h3><p>上传会议纪要、验收材料、进度截图或问题清单；单个文件不超过10MB。</p></div><label className={`attachment-upload ${uploadingAttachment || lifecycleLocked ? "disabled" : ""}`}>＋ {uploadingAttachment ? "正在处理…" : "选择文件"}<input type="file" disabled={uploadingAttachment || lifecycleLocked} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.txt,.csv,.zip" onChange={uploadAttachment} /></label></div>
            {attachmentRows.length ? <div className="attachment-list">{attachmentRows.map((attachment) => <div key={attachment.id}><span className="attachment-type">↧</span><div><a href={`/api/attachments/${attachment.id}`} target="_blank" rel="noreferrer">{attachment.filename}</a><small title={SHANGHAI_TIME_ZONE_LABEL}>{formatFileSize(attachment.sizeBytes)} · {attachment.uploadedBy} · {formatShanghaiDateTime(attachment.createdAt)}</small></div><button type="button" disabled={uploadingAttachment || lifecycleLocked} onClick={() => deleteAttachment(attachment)}>删除</button></div>)}</div> : <div className="attachment-empty">尚未上传附件，本项为选填。</div>}
          </section>
          {submitError && <div className="form-error" role="alert">! {submitError}</div>}
          <div className="report-actions"><button className="outline-button" disabled={lifecycleLocked || submitting || loadingDraft} onClick={() => saveWeeklyReport("draft")}>{submitting ? "处理中…" : "保存草稿"}</button><button className="primary-button" disabled={lifecycleLocked || submitting || loadingDraft || !selectedMilestone} onClick={() => saveWeeklyReport("submitted")}>{submitting ? "正在提交…" : "提交本周进度"}</button></div>
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
    progressYellowGap: 5,
    progressRedGap: 10,
    progressYellowPenalty: 10,
    progressRedPenalty: 20,
    normalYellowPenalty: 3,
    normalRedPenalty: 8,
    criticalYellowPenalty: 8,
    criticalRedPenalty: 20,
    schedulePenaltyCap: 60,
    mediumRiskPenalty: 5,
    highRiskPenalty: 15,
    riskPenaltyCap: 25,
    overdueActionPenalty: 5,
    actionPenaltyCap: 15,
    missingReportPenalty: 10,
    consecutiveMissingPenalty: 15,
    vetoCriticalRed: true,
    vetoHighRiskOverdue: true,
    vetoConsecutiveMissing: true,
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
        progressYellowGap: rule.progressYellowGap,
        progressRedGap: rule.progressRedGap,
        progressYellowPenalty: rule.progressYellowPenalty,
        progressRedPenalty: rule.progressRedPenalty,
        normalYellowPenalty: rule.normalYellowPenalty,
        normalRedPenalty: rule.normalRedPenalty,
        criticalYellowPenalty: rule.criticalYellowPenalty,
        criticalRedPenalty: rule.criticalRedPenalty,
        schedulePenaltyCap: rule.schedulePenaltyCap,
        mediumRiskPenalty: rule.mediumRiskPenalty,
        highRiskPenalty: rule.highRiskPenalty,
        riskPenaltyCap: rule.riskPenaltyCap,
        overdueActionPenalty: rule.overdueActionPenalty,
        actionPenaltyCap: rule.actionPenaltyCap,
        missingReportPenalty: rule.missingReportPenalty,
        consecutiveMissingPenalty: rule.consecutiveMissingPenalty,
        vetoCriticalRed: rule.vetoCriticalRed,
        vetoHighRiskOverdue: rule.vetoHighRiskOverdue,
        vetoConsecutiveMissing: rule.vetoConsecutiveMissing,
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

  type NumericRuleKey = {
    [Key in keyof typeof values]: (typeof values)[Key] extends number ? Key : never;
  }[keyof typeof values];
  const field = (key: NumericRuleKey, label: string, suffix: string) =>
    <label>{label}<div className="rule-input"><input type="number" min="0" max="365" value={values[key]} onChange={(event) => setValues((current) => ({ ...current, [key]: Number(event.target.value) }))} /><span>{suffix}</span></div></label>;
  const vetoField = (
    key: "vetoCriticalRed" | "vetoHighRiskOverdue" | "vetoConsecutiveMissing",
    label: string,
  ) => <label className="rule-veto"><input type="checkbox" checked={values[key]} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.checked }))} /><span>{label}</span></label>;

  // 预警规则配置与综合评分规则在同一版本中原子发布。
  return <section className="content-card rule-panel"><div className="card-title"><div><h2>预警与综合评分规则</h2><p>当前生效版本 V{version} · 阈值、扣分、封顶和一票否决统一版本化</p></div><span className="count-badge">V{version} 生效中</span></div><div className="rule-sections scoring-rules"><div><h3>节点时间阈值</h3><p>按预测或实际完成日相对批准基线判灯。</p><div className="rule-fields">{field("normalYellowDays","普通黄","天")}{field("normalRedDays","普通红","天")}{field("criticalYellowDays","关键黄","天")}{field("criticalRedDays","关键红","天")}</div></div><div><h3>项目状态阈值</h3><p>综合得分达到绿色阈值为正常，低于黄色阈值为严重。</p><div className="rule-fields">{field("greenScore","绿色最低分","分")}{field("yellowScore","黄色最低分","分")}{field("progressYellowGap","进度落后起扣","pp")}{field("progressRedGap","进度严重落后","pp")}</div></div><div><h3>进度与节点扣分</h3><p>进度类扣分包含总体偏差和节点灯色，并应用统一封顶。</p><div className="rule-fields">{field("progressYellowPenalty","落后扣分","分")}{field("progressRedPenalty","严重落后","分")}{field("normalYellowPenalty","普通黄","分")}{field("normalRedPenalty","普通红","分")}{field("criticalYellowPenalty","关键黄","分")}{field("criticalRedPenalty","关键红","分")}{field("schedulePenaltyCap","进度封顶","分")}</div></div><div><h3>风险、措施与周报</h3><p>按开放风险、逾期措施和数据新鲜度累计扣分。</p><div className="rule-fields">{field("mediumRiskPenalty","中风险","分")}{field("highRiskPenalty","高风险","分")}{field("riskPenaltyCap","风险封顶","分")}{field("overdueActionPenalty","逾期措施","分")}{field("actionPenaltyCap","措施封顶","分")}{field("missingReportPenalty","本周缺报","分")}{field("consecutiveMissingPenalty","连续缺报","分")}</div></div><div><h3>一票否决</h3><p>启用后，对应条件直接将项目判为红色，仍保留评分明细。</p><div className="rule-veto-list">{vetoField("vetoCriticalRed","关键节点红色")}{vetoField("vetoHighRiskOverdue","高风险关联措施逾期")}{vetoField("vetoConsecutiveMissing","连续两个周期未填报")}</div></div></div>{showHistory && <div className="rule-history"><div className="table-head"><span>版本</span><span>节点阈值</span><span>进度扣分</span><span>风险/措施/周报</span><span>发布人</span><span>发布时间</span></div>{history.map((rule) => <div className="table-row" key={rule.id}><span><strong>V{rule.version}</strong>{rule.active && <small>当前</small>}</span><span>普黄 {rule.normalYellowDays} / 普红 {rule.normalRedDays} / 关红 {rule.criticalRedDays}</span><span>落后 {rule.progressYellowPenalty} / 严重 {rule.progressRedPenalty} / 封顶 {rule.schedulePenaltyCap}</span><span>高风险 {rule.highRiskPenalty} / 措施 {rule.overdueActionPenalty} / 缺报 {rule.missingReportPenalty}</span><span>{rule.createdBy}</span><span title={SHANGHAI_TIME_ZONE_LABEL}>{formatShanghaiDateTime(rule.createdAt)}</span></div>)}</div>}{message && <div className={message.includes("已发布") ? "success-message" : "form-error"}>{message}</div>}<div className="rule-actions"><button className="outline-button" onClick={() => setShowHistory((value) => !value)}>{showHistory ? "收起历史版本" : `查看历史版本（${history.length}）`}</button><button className="primary-button" disabled={saving} onClick={publishRule}>{saving ? "正在发布并重算…" : "发布新版本并重算在建项目"}</button></div></section>;
}

function AdminPage({ onNavigate, identity }: { onNavigate: Navigate; identity: Identity | null }) {
  type UserRow = { email: string; displayName: string; role: "executive" | "pmo" | "manager" | "admin"; active: boolean; createdAt: string; assignedProjectCount: number; passwordConfigured: boolean };
  type AuditRow = { id: number; actorEmail: string; action: string; entityType: string; entityId: string; createdAt: string };
  const [usersData, setUsersData] = useState<UserRow[]>([]);
  const [auditData, setAuditData] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingUser, setUpdatingUser] = useState("");
  const [error, setError] = useState("");
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [createUserError, setCreateUserError] = useState("");
  const [resetUser, setResetUser] = useState<UserRow | null>(null);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetPasswordError, setResetPasswordError] = useState("");
  const [resetPasswordMessage, setResetPasswordMessage] = useState("");
  const [passwordPolicy, setPasswordPolicy] = useState(defaultPasswordPolicy);
  const [savingPasswordPolicy, setSavingPasswordPolicy] = useState(false);
  const [passwordPolicyMessage, setPasswordPolicyMessage] = useState("");
  const actionNames: Record<string, string> = {
    "weekly_report.submit": "提交周报",
    "baseline_change.approve": "批准基线",
    "snapshot.lock": "锁定快照",
    "project.create": "创建项目",
    "project.update": "更新项目",
    "project.owner_transfer": "移交项目负责人",
    "user.create": "预置用户",
    "user.update": "更新用户",
    "user.password_change": "用户修改密码",
    "user.password_reset": "管理员重置密码",
    "security_config.update": "更新密码复杂度策略",
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
    "milestone_template.publish": "发布标准节点模板",
    "milestone_template.promote": "提升自定义节点",
    "notification_channel.create": "新增通知渠道",
    "notification_channel.update": "更新通知渠道",
    "notification_channel.test": "测试通知渠道",
    "notification_delivery.retry": "重试外部投递",
    "automation.health_refresh": "每日健康度重算",
  };

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [usersResponse, auditResponse, securityResponse] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/audit-logs?limit=50"),
        fetch("/api/security-config", { cache: "no-store" }),
      ]);
      const usersResult = (await usersResponse.json()) as { users?: UserRow[]; error?: string };
      const auditResult = (await auditResponse.json()) as { auditLogs?: AuditRow[]; error?: string };
      const securityResult = (await securityResponse.json()) as {
        passwordPolicy?: PasswordPolicy;
        error?: string;
      };
      if (!usersResponse.ok) throw new Error(usersResult.error || "用户数据读取失败");
      if (!auditResponse.ok) throw new Error(auditResult.error || "审计数据读取失败");
      if (!securityResponse.ok || !securityResult.passwordPolicy) {
        throw new Error(securityResult.error || "密码策略读取失败");
      }
      setUsersData(usersResult.users ?? []);
      setAuditData(auditResult.auditLogs ?? []);
      setPasswordPolicy(securityResult.passwordPolicy);
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

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingUser(true);
    setCreateUserError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          displayName: form.get("displayName"),
          role: form.get("role"),
          password: form.get("password"),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "用户预置失败");
      }
      await loadAdminData();
      setShowCreateUser(false);
    } catch (createError) {
      setCreateUserError(
        createError instanceof Error ? createError.message : "用户预置失败",
      );
    } finally {
      setCreatingUser(false);
    }
  }

  async function resetUserPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetUser) return;
    setResettingPassword(true);
    setResetPasswordError("");
    setResetPasswordMessage("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");
    if (password !== confirmPassword) {
      setResetPasswordError("两次输入的新密码不一致。");
      setResettingPassword(false);
      return;
    }
    try {
      const response = await fetch(
        `/api/users/${encodeURIComponent(resetUser.email)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ password }),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "密码重置失败");
      }
      setResetPasswordMessage(
        `已重置 ${resetUser.displayName} 的密码，原有登录会话已失效。`,
      );
      await loadAdminData();
    } catch (resetError) {
      setResetPasswordError(
        resetError instanceof Error ? resetError.message : "密码重置失败",
      );
    } finally {
      setResettingPassword(false);
    }
  }

  async function savePasswordPolicy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPasswordPolicy(true);
    setPasswordPolicyMessage("");
    setError("");
    try {
      const response = await fetch("/api/security-config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(passwordPolicy),
      });
      const result = (await response.json()) as {
        passwordPolicy?: PasswordPolicy;
        error?: string;
      };
      if (!response.ok || !result.passwordPolicy) {
        throw new Error(result.error || "密码策略保存失败");
      }
      setPasswordPolicy(result.passwordPolicy);
      setPasswordPolicyMessage(
        `✓ 密码策略已生效：${describePasswordPolicy(result.passwordPolicy)}`,
      );
      await loadAdminData();
    } catch (policyError) {
      setError(
        policyError instanceof Error ? policyError.message : "密码策略保存失败",
      );
    } finally {
      setSavingPasswordPolicy(false);
    }
  }

  const canEditUsers = identity?.role === "admin";
  return (
    <div className="workspace-page">
      <WorkspaceHeader
        title="系统管理"
        subtitle="用户角色、权限边界、外部通知渠道与全量操作审计"
        onNavigate={onNavigate}
        identity={identity}
      />
      <div className="page-content admin-page">
        {error && <div className="form-error" role="alert">! {error}</div>}
        <div className="admin-grid">
          <section className="content-card">
            <div className="card-title">
              <div>
                <h2>用户与角色</h2>
                <p>
                  {canEditUsers
                    ? "可创建独立账号、设置初始密码、调整角色并启停"
                    : "PMO 可查看账号，只有系统管理员可调整权限"}
                </p>
              </div>
              <div className="user-card-actions">
                <span className="count-badge">
                  {usersData.filter((user) => user.active).length} / {usersData.length} 启用
                </span>
                {canEditUsers && (
                  <button
                    className="primary-button"
                    onClick={() => {
                      setCreateUserError("");
                      setShowCreateUser(true);
                    }}
                  >
                    ＋ 预置账号
                  </button>
                )}
              </div>
            </div>
            {loading ? (
              <div className="panel-loading">正在读取用户数据…</div>
            ) : (
              <div className="user-table">
                <div className="table-head">
                   <span>用户</span><span>角色</span><span>账号状态</span><span>加入时间</span><span>操作</span>
                </div>
                {usersData.map((user) => (
                  <div
                    className={`table-row ${user.active ? "" : "inactive-user"}`}
                    key={user.email}
                  >
                    <span className="admin-user">
                      <i>{user.displayName[0]}</i>
                      <b>
                        {user.displayName}
                        <small>
                          {user.email}
                          {user.assignedProjectCount
                            ? ` · 负责${user.assignedProjectCount}个项目`
                            : ""}
                        </small>
                      </b>
                    </span>
                    <select
                      value={user.role}
                      disabled={
                        !canEditUsers ||
                        updatingUser === user.email ||
                        !user.active ||
                        user.email === identity?.email ||
                        user.assignedProjectCount > 0
                      }
                      onChange={(event) =>
                        updateRole(user, event.target.value as UserRow["role"])
                      }
                    >
                      <option value="executive">管理层只读</option>
                      <option value="manager">项目经理</option>
                      <option value="pmo">PMO</option>
                      <option value="admin">系统管理员</option>
                    </select>
                    <button
                      type="button"
                      className={`user-state-button ${user.active ? "active" : "disabled"}`}
                      disabled={
                        !canEditUsers ||
                        updatingUser === user.email ||
                        user.email === identity?.email ||
                        (user.active && user.assignedProjectCount > 0)
                      }
                      onClick={() => toggleUser(user)}
                      aria-label={`${user.active ? "停用" : "启用"} ${user.displayName}`}
                    >
                      {updatingUser === user.email
                        ? "处理中…"
                        : user.active
                          ? "● 已启用"
                          : "— 已停用"}
                    </button>
                     <span title={SHANGHAI_TIME_ZONE_LABEL}>{formatShanghaiDate(user.createdAt)}</span>
                     <button
                       type="button"
                       className="reset-password-button"
                       disabled={
                         !canEditUsers ||
                         updatingUser === user.email ||
                         user.email === identity?.email
                       }
                       title={
                         user.email === identity?.email
                           ? "请从右上角用户菜单修改自己的密码"
                           : `重置 ${user.displayName} 的密码`
                       }
                       onClick={() => {
                         setResetPasswordError("");
                         setResetPasswordMessage("");
                         setResetUser(user);
                       }}
                     >
                       {user.email === identity?.email
                         ? "个人修改"
                         : user.passwordConfigured
                           ? "重置密码"
                           : "设置密码"}
                     </button>
                   </div>
                ))}
              </div>
            )}
          </section>
          <section className="content-card">
            <div className="card-title">
              <div><h2>操作审计</h2><p>记录所有关键数据与权限变更</p></div>
              <button className="text-button" onClick={loadAdminData}>刷新</button>
            </div>
            {loading ? (
              <div className="panel-loading">正在读取审计记录…</div>
            ) : (
              <div className="audit-list">
                {auditData.length ? (
                  auditData.map((row) => (
                    <div key={row.id}>
                      <span className="audit-dot" />
                      <div>
                        <strong>{actionNames[row.action] ?? row.action}</strong>
                        <p>{row.actorEmail} · {row.entityType} / {row.entityId}</p>
                      </div>
                      <time dateTime={row.createdAt} title={SHANGHAI_TIME_ZONE_LABEL}>
                        {formatShanghaiDateTime(row.createdAt)}
                      </time>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">暂无审计记录</div>
                )}
              </div>
            )}
          </section>
        </div>
        <section className="content-card security-policy-card">
          <div className="card-title">
            <div>
              <h2>密码复杂度策略</h2>
              <p>统一约束账号创建、个人修改密码和管理员重置密码</p>
            </div>
            <span className="count-badge">最长固定 128 位</span>
          </div>
          <form onSubmit={savePasswordPolicy}>
            <label className="security-length-field">
              最小密码长度
              <div>
                <input
                  type="number"
                  min={8}
                  max={64}
                  value={passwordPolicy.minPasswordLength}
                  disabled={!canEditUsers || savingPasswordPolicy}
                  onChange={(event) =>
                    setPasswordPolicy((current) => ({
                      ...current,
                      minPasswordLength: Number(event.target.value),
                    }))
                  }
                />
                <span>位（可配置范围 8–64）</span>
              </div>
            </label>
            <fieldset disabled={!canEditUsers || savingPasswordPolicy}>
              <legend>必须包含的字符类别</legend>
              {([
                ["requireLetter", "字母", "至少一个英文字母"],
                ["requireUppercase", "大写字母", "至少一个 A–Z"],
                ["requireLowercase", "小写字母", "至少一个 a–z"],
                ["requireNumber", "数字", "至少一个 0–9"],
                ["requireSymbol", "特殊字符", "至少一个标点或符号"],
              ] as const).map(([key, label, hint]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={passwordPolicy[key]}
                    onChange={(event) =>
                      setPasswordPolicy((current) => ({
                        ...current,
                        [key]: event.target.checked,
                      }))
                    }
                  />
                  <span><strong>{label}</strong><small>{hint}</small></span>
                </label>
              ))}
            </fieldset>
            <div className="security-policy-preview">
              <strong>当前规则</strong>
              <span>{describePasswordPolicy(passwordPolicy)}</span>
              <small>策略更新仅约束此后设置的密码，不强制迁移现有密码。</small>
            </div>
            {passwordPolicyMessage && (
              <div className="success-message" role="status">
                {passwordPolicyMessage}
              </div>
            )}
            <div className="security-policy-actions">
              {canEditUsers ? (
                <button className="primary-button" disabled={savingPasswordPolicy}>
                  {savingPasswordPolicy ? "正在保存…" : "保存并立即生效"}
                </button>
              ) : (
                <span>仅系统管理员可修改密码策略</span>
              )}
            </div>
          </form>
        </section>
        {(identity?.role === "pmo" || identity?.role === "admin") && (
          <NotificationChannelPanel role={identity.role} />
        )}
      </div>
      {showCreateUser && canEditUsers && (
        <div
          className="modal-backdrop"
          onClick={creatingUser ? undefined : () => setShowCreateUser(false)}
        >
          <section
            className="create-modal create-user-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              type="button"
              disabled={creatingUser}
              onClick={() => setShowCreateUser(false)}
              aria-label="关闭预置账号"
            >
              ×
            </button>
            <span className="modal-kicker">ACCOUNT PROVISIONING</span>
            <h2>预置登录账号</h2>
            <p>
              创建登录邮箱、初始密码和系统角色；用户登录后将直接沿用该角色与权限。
            </p>
            <form onSubmit={createUser}>
              <div className="modal-form-grid">
                <label>
                  用户姓名
                  <input
                    name="displayName"
                    minLength={2}
                    maxLength={60}
                    placeholder="请输入真实姓名"
                    required
                  />
                </label>
                <label>
                  登录邮箱
                  <input
                    name="email"
                    type="email"
                    maxLength={254}
                    placeholder="name@example.com"
                    autoComplete="off"
                    required
                  />
                </label>
                <label>
                  初始角色
                  <select name="role" defaultValue="manager">
                    <option value="executive">管理层只读</option>
                    <option value="manager">项目经理</option>
                    <option value="pmo">PMO</option>
                    <option value="admin">系统管理员</option>
                  </select>
                </label>
                <label>
                  初始密码
                  <input
                    name="password"
                    type="password"
                    minLength={passwordPolicy.minPasswordLength}
                    maxLength={128}
                    autoComplete="new-password"
                    placeholder={describePasswordPolicy(passwordPolicy)}
                    required
                  />
                </label>
              </div>
              <div className="account-provision-note">
                <span>i</span>
                <div>
                  <strong>Cloudflare 原生安全会话</strong>
                  <p>当前策略：{describePasswordPolicy(passwordPolicy)}。密码仅保存 PBKDF2 加盐散列；浏览器会话使用 HttpOnly、Secure Cookie。</p>
                </div>
              </div>
              {createUserError && (
                <div className="form-error" role="alert">! {createUserError}</div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="outline-button"
                  disabled={creatingUser}
                  onClick={() => setShowCreateUser(false)}
                >
                  取消
                </button>
                <button className="primary-button" disabled={creatingUser}>
                  {creatingUser ? "正在预置…" : "确认预置"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {resetUser && canEditUsers && (
        <div
          className="modal-backdrop"
          onClick={
            resettingPassword
              ? undefined
              : () => setResetUser(null)
          }
        >
          <section
            className="create-modal password-modal reset-password-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              type="button"
              disabled={resettingPassword}
              onClick={() => setResetUser(null)}
              aria-label="关闭密码重置"
            >
              ×
            </button>
            <span className="modal-kicker">ADMIN PASSWORD RESET</span>
            <h2>重置用户密码</h2>
            <p>
              正在为 <strong>{resetUser.displayName}</strong>（{resetUser.email}）设置新密码。
            </p>
            <form onSubmit={resetUserPassword}>
              <label>
                新密码
                <input
                  name="password"
                  type="password"
                  minLength={passwordPolicy.minPasswordLength}
                  maxLength={128}
                  autoComplete="new-password"
                  placeholder={describePasswordPolicy(passwordPolicy)}
                  disabled={Boolean(resetPasswordMessage)}
                  required
                />
              </label>
              <label>
                确认新密码
                <input
                  name="confirmPassword"
                  type="password"
                  minLength={passwordPolicy.minPasswordLength}
                  maxLength={128}
                  autoComplete="new-password"
                  disabled={Boolean(resetPasswordMessage)}
                  required
                />
              </label>
              <div className="password-security-note warning">
                当前策略：{describePasswordPolicy(passwordPolicy)}。重置成功后，该用户已有登录会话将立即失效；请通过安全渠道告知新密码。
              </div>
              {resetPasswordError && <div className="form-error" role="alert">! {resetPasswordError}</div>}
              {resetPasswordMessage && <div className="success-message" role="status">{resetPasswordMessage}</div>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="outline-button"
                  disabled={resettingPassword}
                  onClick={() => setResetUser(null)}
                >
                  {resetPasswordMessage ? "完成" : "取消"}
                </button>
                {!resetPasswordMessage && (
                  <button className="primary-button" disabled={resettingPassword}>
                    {resettingPassword ? "正在重置…" : "确认重置"}
                  </button>
                )}
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
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
    reopenEventId?: string | null;
    reopenedBy?: string | null;
    reopenedAt?: string | null;
    reopenReason?: string | null;
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
  type TemplateCandidateSource = {
    milestoneId: number;
    projectId: string;
    projectCode: string;
    projectName: string;
    ownerName: string;
    name: string;
    sequence: number;
    weight: number;
    critical: boolean;
    applicable: boolean;
    plannedStart: string;
    plannedFinish: string;
  };
  type TemplateCandidate = {
    key: string;
    name: string;
    sourceProjectCount: number;
    sourceMilestoneCount: number;
    criticalCount: number;
    criticalRatio: number;
    existingTemplate: {
      id: number;
      code: string;
      name: string;
      active: boolean;
    } | null;
    sources: TemplateCandidateSource[];
  };
  type PromotionDraft = {
    code: string;
    sequence: number;
    critical: boolean;
    description: string;
    syncExistingProjects: boolean;
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
  const [templateCandidates, setTemplateCandidates] = useState<
    TemplateCandidate[]
  >([]);
  const [candidateLoading, setCandidateLoading] = useState(true);
  const [promoteCandidate, setPromoteCandidate] =
    useState<TemplateCandidate | null>(null);
  const [promotionDraft, setPromotionDraft] = useState<PromotionDraft>({
    code: "M13",
    sequence: 13,
    critical: false,
    description: "",
    syncExistingProjects: true,
  });
  const [promotionSaving, setPromotionSaving] = useState(false);
  const [reportRows, setReportRows] = useState<WeeklyReportRow[]>([]);
  const [notificationWorking, setNotificationWorking] = useState("");
  const [notificationMessage, setNotificationMessage] = useState("");

  const loadTemplateCandidates = useCallback(async () => {
    try {
      const response = await fetch("/api/milestone-templates/candidates", {
        cache: "no-store",
      });
      const result = (await response.json()) as {
        candidates?: TemplateCandidate[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error || "自定义节点候选池读取失败");
      }
      setTemplateCandidates(result.candidates ?? []);
    } catch (error) {
      setTemplateMessage(
        error instanceof Error ? error.message : "自定义节点候选池读取失败",
      );
    } finally {
      setCandidateLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/bootstrap")
      .then(async (response) => {
        if (!response.ok) throw new Error("无法读取PMO数据");
        return (await response.json()) as {
          snapshots?: SnapshotRow[];
          baselineChanges?: BaselineRow[];
          milestoneTemplates?: TemplateRow[];
          weeklyReports?: WeeklyReportRow[];
        };
      })
      .then((data) => {
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
    fetch("/api/milestone-templates/candidates", { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as {
          candidates?: TemplateCandidate[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(result.error || "自定义节点候选池读取失败");
        }
        return result.candidates ?? [];
      })
      .then((candidates) => setTemplateCandidates(candidates))
      .catch((error: unknown) =>
        setTemplateMessage(
          error instanceof Error ? error.message : "自定义节点候选池读取失败",
        ),
      )
      .finally(() => setCandidateLoading(false));
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
      setTemplateMessage("✓ 已发布新的标准节点模板，后续新建项目将使用最新口径。");
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
  function openCandidatePromotion(candidate: TemplateCandidate) {
    const usedSequences = new Set(templateRows.map((row) => row.sequence));
    const nextSequence =
      Array.from({ length: 99 }, (_, index) => index + 1).find(
        (sequence) => !usedSequences.has(sequence),
      ) ?? 99;
    const usedCodes = new Set(templateRows.map((row) => row.code.toUpperCase()));
    const nextCode =
      Array.from({ length: 99 }, (_, index) => `M${String(index + 1).padStart(2, "0")}`).find(
        (code) => !usedCodes.has(code),
      ) ?? `M${nextSequence}`;
    setPromotionDraft({
      code: nextCode,
      sequence: nextSequence,
      critical: candidate.criticalRatio >= 50,
      description: `由${candidate.sourceProjectCount}个项目的自定义节点归并提升`,
      syncExistingProjects: true,
    });
    setTemplateMessage("");
    setPromoteCandidate(candidate);
  }
  async function promoteTemplateCandidate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!promoteCandidate) return;
    setPromotionSaving(true);
    setTemplateMessage("");
    try {
      const response = await fetch("/api/milestone-templates/promote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidateName: promoteCandidate.name,
          code: promotionDraft.code,
          sequence: promotionDraft.sequence,
          critical: promotionDraft.critical,
          description: promotionDraft.description,
          sourceMilestoneIds: promoteCandidate.sources.map(
            (source) => source.milestoneId,
          ),
          syncExistingProjects: promotionDraft.syncExistingProjects,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        milestoneTemplate?: TemplateRow;
        promotedMilestones?: number;
        synchronizedProjects?: number;
      };
      if (!response.ok || !result.milestoneTemplate) {
        throw new Error(result.error || "自定义节点提升失败");
      }
      setTemplateRows((rows) =>
        [...rows, result.milestoneTemplate!].sort(
          (left, right) => left.sequence - right.sequence,
        ),
      );
      setTemplateMessage(
        `✓ 已将“${promoteCandidate.name}”提升为未启用标准节点草稿，关联${result.promotedMilestones ?? 0}个来源节点、同步${result.synchronizedProjects ?? 0}个项目。`,
      );
      setPromoteCandidate(null);
      setCandidateLoading(true);
      await Promise.all([loadTemplateCandidates(), onDataChanged()]);
    } catch (error) {
      setTemplateMessage(
        error instanceof Error ? error.message : "自定义节点提升失败",
      );
    } finally {
      setPromotionSaving(false);
    }
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
        external?: {
          channelCount?: number;
          queued?: number;
          processed?: number;
          sent?: number;
          failed?: number;
        };
      };
      if (!response.ok) {
        throw new Error(result.error || "通知发送失败");
      }
      const stationMessage =
        kind === "red_escalation"
          ? `已升级 ${result.projects ?? projectIds.length} 个红色项目，生成 ${result.sent ?? 0} 条站内通知。`
          : `已催报 ${result.projects ?? projectIds.length} 个项目，生成 ${result.sent ?? 0} 条站内通知。`;
      const externalMessage = result.external?.channelCount
        ? ` 外部渠道新增${result.external.queued ?? 0}条，送达${result.external.sent ?? 0}条，失败${result.external.failed ?? 0}条。`
        : " 当前未配置已启用的外部渠道。";
      setNotificationMessage(`${stationMessage}${externalMessage}`);
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
  const activeProjects = projectData.filter(
    (project) => projectLifecycle(project) === "active",
  );
  const activeProjectIds = new Set(activeProjects.map((project) => project.id));
  const submittedProjectIds = new Set(
    reportRows
      .filter(
        (report) =>
          report.weekKey === reportingPeriod.weekKey &&
          report.status !== "draft" &&
          activeProjectIds.has(report.projectId),
      )
      .map((report) => report.projectId),
  );
  const submittedReports = reportRows.filter(
    (report) =>
      report.weekKey === reportingPeriod.weekKey &&
      report.status !== "draft" &&
      activeProjectIds.has(report.projectId),
  );
  const missingProjects = activeProjects.filter(
    (project) => !submittedProjectIds.has(project.id),
  );
  const redProjects = activeProjects.filter(
    (project) => project.status === "red",
  );
  const varianceReports = submittedReports.filter(
    (report) => Math.abs(report.variance) > 5,
  );
  const snapshotProjectCount =
    currentSnapshotRow?.projectCount ?? activeProjects.length;
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
  const calendarMonth = formatShanghaiCalendarMonth(deadlineDate);
  const calendarDay = formatShanghaiCalendarDay(deadlineDate);
  const activeTemplateWeight = templateRows
    .filter((row) => row.active)
    .reduce((sum, row) => sum + Number(row.defaultWeight || 0), 0);
  return <div className="workspace-page">
    <WorkspaceHeader title="PMO 管理中心" subtitle="统一规则、治理数据、锁定管理口径" onNavigate={onNavigate} identity={identity} />
    <div className="page-content pmo-page">
      <div className="pmo-tabs">{["快照锁定","基线变更","节点模板","预警规则"].map(t => <button className={tab === t ? "active" : ""} onClick={() => setTab(t)} key={t}>{t}{t === "基线变更" && <b>{pendingChanges.length}</b>}</button>)}</div>
      {tab === "快照锁定" && <>
        <section className={`snapshot-banner ${locked ? "locked" : ""}`}>
          <div className="snapshot-calendar"><span>{calendarMonth}</span><strong>{calendarDay}</strong></div><div><span className="kicker">{reportingPeriod.year}年第{reportingPeriod.week}周 · 周五17:00 <b className="automation-badge">● 自动锁数已启用</b></span><h2>{locked ? "本周快照已锁定" : snapshotId ? "快照已重新打开，等待修订后锁定新版本" : countdown}</h2><p>{locked ? "管理层大屏已切换至最新锁定口径，历史版本已永久保留。" : snapshotId ? "人工重新打开后自动锁数暂停；完成修订与复核后请手动锁定新版本。" : `${reportingPeriod.fridayLabel}17:00系统自动锁定；PMO也可在检查通过后提前手动锁定。`}</p></div><div className="snapshot-actions">{locked ? <><button className="locked-button" disabled>✓ 已锁定 · V{snapshotVersion}</button><button className="outline-button" onClick={() => setShowReopen(true)}>重新打开</button></> : <button className="primary-button" disabled={working} onClick={lockSnapshot}>{working ? "正在锁定…" : `锁定为 V${snapshotVersion + (snapshotId ? 1 : 0)}`}</button>}</div>
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
          <div className="snapshot-table"><div className="table-head"><span>周期</span><span>版本</span><span>项目数</span><span>数据完整度</span><span>锁定时间</span><span>操作人</span><span>状态</span><span /></div>{snapshotRows.length ? snapshotRows.map((row)=><div className="table-row" key={row.id}><span>{row.weekKey}</span><span>V{row.version}</span><span>{row.projectCount}</span><span>{row.completeness}%</span><span title={SHANGHAI_TIME_ZONE_LABEL}>{formatShanghaiMonthDayTime(row.lockedAt)}</span><span>{row.lockedBy}</span><span title={row.reopenReason ?? undefined}><StatusPill status={row.status === "locked" ? "green" : "yellow"} /></span><button onClick={() => exportSnapshot(row)}>导出</button></div>) : <div className="empty-state">暂无历史快照</div>}</div>
        </section>
      </>}
      {tab === "基线变更" && <section className="content-card baseline-approval">
        <div className="card-title"><div><h2>基线变更审批</h2><p>原始基线永久保留，批准后生成新的当前基线版本</p></div><span className="count-badge">{pendingChanges.length}项待审批</span></div>
        {pendingChanges.length > 1 && <div className="approval-queue">{pendingChanges.map((change) => <button key={change.id} className={change.id === changeId ? "active" : ""} onClick={() => { setChangeId(change.id); setApproved(false); }}>{change.projectId} · V{change.versionFrom} → V{change.versionTo}</button>)}</div>}
        {activeChange ? <div className="change-card"><div className="change-head"><div><span className="project-chip">{activeChange.projectId}</span><div><h3>{activeProject?.name ?? activeChange.projectId}</h3><p title={SHANGHAI_TIME_ZONE_LABEL}>申请人 {activeChange.requestedBy} · {formatShanghaiMonthDayTime(activeChange.requestedAt)}</p></div></div><StatusPill status={activeChange.status === "approved" ? "green" : activeChange.status === "rejected" ? "red" : "yellow"} /></div>
          <div className="change-reason"><small>变更原因</small><p>{activeChange.reason}</p></div>
          <div className="date-change">{activeChange.changes.map((change) => <div key={`${change.milestone}-${change.to}`}><small>{change.milestone}</small><span><s>{change.from}</s><b>→</b><strong>{change.to}</strong><em>{change.days > 0 ? "+" : ""}{change.days}天</em></span></div>)}</div>
          <div className="change-impact"><span>影响评估</span><p>{activeChange.impact}</p></div>
          {operationError && <div className="form-error" role="alert">! {operationError}</div>}
          {showReject && <div className="reject-form"><textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="填写驳回原因及需要补充的材料" /><button className="outline-button" onClick={() => setShowReject(false)}>取消</button><button className="danger-outline" disabled={working || rejectReason.trim().length < 5} onClick={rejectBaseline}>确认驳回</button></div>}
          <div className="approval-actions">{activeChange.status === "approved" || approved ? <div className="approved-note">✓ 已批准，当前基线已更新为 V{activeChange.versionTo}</div> : activeChange.status === "rejected" ? <div className="rejected-note">■ 已驳回：{activeChange.rejectionReason}</div> : <><button className="danger-outline" onClick={() => setShowReject(true)}>驳回申请</button><button className="primary-button" disabled={working} onClick={approveBaseline}>{working ? "正在审批…" : `批准并生成 V${activeChange.versionTo}`}</button></>}</div>
        </div> : <div className="empty-state">暂无基线变更申请</div>}
      </section>}
      {tab === "节点模板" && <>
        <section className="content-card template-governance">
          <div className="card-title"><div><h2>标准节点模板</h2><p>统一维护节点编码、顺序、默认权重与关键节点标识；启用节点权重合计必须为100%</p></div><div className="template-publish"><span className={Math.abs(activeTemplateWeight - 100) < 0.01 ? "weight-ok" : "weight-error"}>启用权重 {activeTemplateWeight.toFixed(1)}%</span><button className="primary-button" disabled={templateSaving || Math.abs(activeTemplateWeight - 100) >= 0.01} onClick={saveTemplates}>{templateSaving ? "正在发布…" : "发布模板"}</button></div></div>
          {templateMessage && <div className={templateMessage.startsWith("✓") ? "form-success" : "form-error"}>{templateMessage}</div>}
          <div className="template-grid"><div className="template-grid-head"><span>序号</span><span>编码</span><span>节点名称</span><span>权重</span><span>关键</span><span>启用</span><span>口径说明</span></div>{templateRows.map((row) => <div className={`template-grid-row ${row.active ? "" : "inactive"}`} key={row.id}><input aria-label={`${row.name}序号`} type="number" min="1" max="99" value={row.sequence} onChange={(event) => updateTemplate(row.id, "sequence", Number(event.target.value))} /><input aria-label={`${row.name}编码`} value={row.code} onChange={(event) => updateTemplate(row.id, "code", event.target.value.toUpperCase())} /><input aria-label={`${row.name}名称`} value={row.name} onChange={(event) => updateTemplate(row.id, "name", event.target.value)} /><label className="weight-input"><input aria-label={`${row.name}权重`} type="number" min="0" max="100" step="0.5" value={row.defaultWeight} onChange={(event) => updateTemplate(row.id, "defaultWeight", Number(event.target.value))} /><span>%</span></label><label className="template-check"><input type="checkbox" checked={row.critical} onChange={(event) => updateTemplate(row.id, "critical", event.target.checked)} /><span>关键</span></label><label className="template-check"><input type="checkbox" checked={row.active} onChange={(event) => updateTemplate(row.id, "active", event.target.checked)} /><span>启用</span></label><input aria-label={`${row.name}说明`} value={row.description} onChange={(event) => updateTemplate(row.id, "description", event.target.value)} /></div>)}</div>
          <div className="template-footnote">项目可在本项目范围内标记节点不适用或追加零权重自定义节点；正式计划完成日调整仍须走基线变更审批。</div>
        </section>
        <section className="content-card template-candidate-pool">
          <div className="card-title"><div><h2>自定义节点候选池</h2><p>按规范化名称归集各项目的未关联自定义节点，由PMO评估后提升为标准节点草稿</p></div><div className="candidate-pool-actions"><span className="count-badge">{templateCandidates.length} 个候选</span><button className="text-button" disabled={candidateLoading} onClick={() => { setCandidateLoading(true); void loadTemplateCandidates(); }}>{candidateLoading ? "刷新中…" : "刷新候选池"}</button></div></div>
          {candidateLoading ? <div className="panel-loading">正在汇总项目自定义节点…</div> : templateCandidates.length ? <div className="candidate-list">{templateCandidates.map((candidate) => <article className={candidate.existingTemplate ? "duplicate" : ""} key={candidate.key}><div className="candidate-main"><span className="candidate-symbol">◇</span><div><h3>{candidate.name}</h3><p>{candidate.sources.slice(0, 3).map((source) => `${source.projectCode} ${source.projectName}`).join(" · ")}{candidate.sources.length > 3 ? ` 等${candidate.sources.length}个来源节点` : ""}</p></div></div><div className="candidate-stats"><span><strong>{candidate.sourceProjectCount}</strong>来源项目</span><span><strong>{candidate.sourceMilestoneCount}</strong>来源节点</span><span><strong>{candidate.criticalRatio}%</strong>关键占比</span></div>{candidate.existingTemplate ? <div className="candidate-duplicate">! 已存在 {candidate.existingTemplate.code} · {candidate.existingTemplate.name}</div> : <button className="outline-button" onClick={() => openCandidatePromotion(candidate)}>提升为标准节点</button>}</article>)}</div> : <div className="candidate-empty"><span>✓</span><div><strong>暂无待治理自定义节点</strong><p>项目新增自定义节点后会自动进入候选池，只有提升并正式发布的节点才进入全局矩阵。</p></div></div>}
        </section>
        {promoteCandidate && <div className="modal-backdrop" onClick={() => setPromoteCandidate(null)}><section className="create-modal candidate-promotion-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" type="button" onClick={() => setPromoteCandidate(null)}>×</button><span className="modal-kicker">MILESTONE PROMOTION</span><h2>提升“{promoteCandidate.name}”</h2><p>来源覆盖{promoteCandidate.sourceProjectCount}个项目、{promoteCandidate.sourceMilestoneCount}个节点。提升后先生成零权重、未启用草稿，不直接改变全局矩阵。</p><form onSubmit={promoteTemplateCandidate}><div className="promotion-source-list">{promoteCandidate.sources.map((source) => <div key={source.milestoneId}><span>{source.projectCode}</span><strong>{source.projectName}</strong><small>序号 {source.sequence} · 权重 {source.weight}% · {source.critical ? "关键节点" : "普通节点"}</small></div>)}</div><div className="modal-form-grid"><label>标准节点编码<input value={promotionDraft.code} onChange={(event) => setPromotionDraft((draft) => ({ ...draft, code: event.target.value.toUpperCase() }))} pattern="[A-Z][A-Z0-9_-]{1,19}" required /></label><label>标准节点序号<input type="number" min="1" max="99" value={promotionDraft.sequence} onChange={(event) => setPromotionDraft((draft) => ({ ...draft, sequence: Number(event.target.value) }))} required /></label></div><label className="promotion-description">口径说明<textarea value={promotionDraft.description} onChange={(event) => setPromotionDraft((draft) => ({ ...draft, description: event.target.value }))} placeholder="说明该节点的统一定义、完成标准和适用范围" /></label><div className="promotion-options"><label className="template-check"><input type="checkbox" checked={promotionDraft.critical} onChange={(event) => setPromotionDraft((draft) => ({ ...draft, critical: event.target.checked }))} /><span>作为关键节点草稿</span></label><label className="template-check"><input type="checkbox" checked={promotionDraft.syncExistingProjects} onChange={(event) => setPromotionDraft((draft) => ({ ...draft, syncExistingProjects: event.target.checked }))} /><span>同步到现有项目并默认标记为不适用、零权重</span></label></div><div className="promotion-safety-note"><strong>治理保护</strong><span>来源节点仅建立标准模板关联；其他项目新增节点保持“不适用 / 0权重 / NA”，不会改写批准基线或进度权重。</span></div><div className="modal-actions"><button type="button" className="outline-button" onClick={() => setPromoteCandidate(null)}>取消</button><button className="primary-button" disabled={promotionSaving}>{promotionSaving ? "正在提升…" : "确认提升为草稿"}</button></div></form></section></div>}
      </>}
      {tab === "预警规则" && <RuleConfigPanel />}
    </div>
    {locked && <div className="toast"><span>✓</span><div><strong>第{reportingPeriod.week}周快照已锁定</strong><p>管理大屏已切换至最新数据。</p></div></div>}
  </div>;
}

function EmptyProjectWorkspace({
  onNavigate,
  identity,
}: {
  onNavigate: Navigate;
  identity: Identity | null;
}) {
  return (
    <>
      <WorkspaceHeader
        title="尚未创建项目"
        subtitle="先建立真实项目组合，再进入项目详情或周度填报"
        onNavigate={onNavigate}
        identity={identity}
      />
      <div className="page-content">
        <section className="content-card">
          <div className="empty-state">
            当前项目库为空。请由 PMO 或管理员前往“项目组合”新建项目或导入 Excel。
          </div>
        </section>
      </div>
    </>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("cockpit");
  const [projectData, setProjectData] = useState<ProjectData[]>([]);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [dashboardData, setDashboardData] = useState<ProjectData[]>([]);
  const [dashboardSnapshot, setDashboardSnapshot] =
    useState<DashboardSnapshot | null>(null);
  const [dashboardAlerts, setDashboardAlerts] = useState<DashboardAlerts>({
    highRisks: [],
    overdueActions: [],
    predictedDelays: [],
    resourceConflicts: [],
  });
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [templateData, setTemplateData] =
    useState<TemplateData[]>(defaultTemplateData);
  const [projectManagers, setProjectManagers] = useState<
    ProjectManagerAccount[]
  >([]);
  const [weeklyReportData, setWeeklyReportData] = useState<WeeklyReportRow[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("P02");
  const [dataState, setDataState] = useState<
    "loading" | "ready" | "fallback" | "unauthenticated"
  >("loading");
  const navigate: Navigate = (next, projectId) => {
    if (projectId) setSelectedProjectId(projectId);
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const refreshData = useCallback(async () => {
    try {
      const response = await fetch("/api/bootstrap", { cache: "no-store" });
      if (response.status === 401) {
        setIdentity(null);
        setDataState("unauthenticated");
        return;
      }
      if (!response.ok) throw new Error("data unavailable");
      const data = (await response.json()) as {
        projects?: ProjectData[];
        identity?: Identity;
        dashboardProjects?: ProjectData[];
        dashboardAlerts?: DashboardAlerts;
        dashboardSnapshot?: DashboardSnapshot | null;
        milestoneTemplates?: TemplateData[];
        projectManagers?: ProjectManagerAccount[];
        weeklyReports?: WeeklyReportRow[];
      };
      if (Array.isArray(data.projects)) setProjectData(data.projects);
      if (data.dashboardProjects?.length) {
        setDashboardData(data.dashboardProjects);
      } else {
        setDashboardData([]);
      }
      setDashboardSnapshot(data.dashboardSnapshot ?? null);
      setDashboardAlerts(
        data.dashboardAlerts ?? {
          highRisks: [],
          overdueActions: [],
          predictedDelays: [],
          resourceConflicts: [],
        },
      );
      if (data.milestoneTemplates?.length) {
        setTemplateData(data.milestoneTemplates);
      }
      setProjectManagers(data.projectManagers ?? []);
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

  if (dataState === "unauthenticated") return <LoginScreen />;
  if (view === "cockpit") return <><Cockpit onNavigate={navigate} projectData={dashboardData} snapshot={dashboardSnapshot} templateData={templateData} trends={trendData} alerts={dashboardAlerts} />{dataState === "fallback" && <div className="data-banner">当前数据服务不可用，管理大屏不展示未核实的演示数据。</div>}</>;
  return <div className="app-shell"><Sidebar view={view} onNavigate={navigate} identity={identity} /><div className="workspace">{view === "portfolio" && <Portfolio onNavigate={navigate} onDataChanged={refreshData} projectData={projectData} identity={identity} templateData={templateData} projectManagers={projectManagers} weeklyReports={weeklyReportData} />}{view === "analytics" && <PortfolioAnalytics onNavigate={(next, projectId) => navigate(next, projectId)} identity={identity} header={<WorkspaceHeader title="项目组合分析" subtitle="从组织、类型、负责人和标准节点维度识别共性瓶颈与基线漂移" onNavigate={navigate} identity={identity} />} />}{view === "resources" && <ResourcePlanning identity={identity} onOpenProject={(projectId) => navigate("project", projectId)} header={<WorkspaceHeader title="跨项目资源计划" subtitle="统一资源池、周容量、项目分配与超配治理" onNavigate={navigate} identity={identity} />} />}{view === "project" && (projectData.length ? <ProjectDetail onNavigate={navigate} onDataChanged={refreshData} projectData={projectData} projectId={selectedProjectId} identity={identity} projectManagers={projectManagers} /> : <EmptyProjectWorkspace onNavigate={navigate} identity={identity} />)}{view === "report" && (projectData.length ? <WeeklyReport onNavigate={navigate} onDataChanged={refreshData} projectId={selectedProjectId} projectData={projectData} identity={identity} snapshot={dashboardSnapshot} /> : <EmptyProjectWorkspace onNavigate={navigate} identity={identity} />)}{view === "pmo" && <PmoPage onNavigate={navigate} onDataChanged={refreshData} identity={identity} projectData={projectData} />}{view === "admin" && <AdminPage onNavigate={navigate} identity={identity} />}</div></div>;
}
