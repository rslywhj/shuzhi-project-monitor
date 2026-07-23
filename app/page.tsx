"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Status = "green" | "yellow" | "red" | "na";
type View = "cockpit" | "portfolio" | "project" | "report" | "pmo" | "admin";
type Role = "executive" | "pmo" | "manager" | "admin";
type Identity = { email: string; displayName: string; role: Role };
type Navigate = (view: View, projectId?: string) => void;

const milestones = ["立项启动", "需求确认", "方案评审", "开发完成", "联调测试", "用户验收", "上线切换"];

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
};

const statusLabel: Record<Status, string> = { green: "正常", yellow: "预警", red: "严重", na: "不适用" };
const statusSymbol: Record<Status, string> = { green: "●", yellow: "▲", red: "■", na: "—" };
const trend = [
  { w: "W17", g: 29, y: 10, r: 5 }, { w: "W18", g: 30, y: 9, r: 5 },
  { w: "W19", g: 31, y: 9, r: 4 }, { w: "W20", g: 30, y: 10, r: 4 },
  { w: "W21", g: 32, y: 8, r: 4 }, { w: "W22", g: 31, y: 8, r: 5 },
  { w: "W23", g: 33, y: 7, r: 4 }, { w: "W24", g: 32, y: 8, r: 4 },
  { w: "W25", g: 31, y: 9, r: 4 }, { w: "W26", g: 32, y: 8, r: 4 },
  { w: "W27", g: 33, y: 7, r: 4 }, { w: "W28", g: 31, y: 8, r: 5 },
];

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

function Cockpit({ onNavigate, projectData = projects }: { onNavigate: Navigate; projectData?: ProjectData[] }) {
  const [org, setOrg] = useState("全部组织");
  const [health, setHealth] = useState("全部状态");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<{ project: ProjectData; index: number } | null>(null);
  const matching = useMemo(
    () =>
      projectData.filter(
        (project) =>
          (org === "全部组织" || project.org === org) &&
          (health === "全部状态" || statusLabel[project.status] === health),
      ),
    [health, org, projectData],
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
        <span className="live-dot" /> 已锁定 · 2026年第29周
        <strong>07月17日 17:00</strong>
      </div>
      <button className="light-button" onClick={() => onNavigate("portfolio")}>进入工作台 <span>↗</span></button>
    </header>

    <section className="metric-grid">
      <div className="metric-card total"><span>统建项目总数</span><strong>{total}</strong><small>本周新增 2 个</small></div>
      <div className="metric-card green"><span>绿色 · 正常</span><strong>{green}</strong><small>{total ? ((green / total) * 100).toFixed(1) : "0.0"}% 项目受控</small></div>
      <div className="metric-card yellow"><span>黄色 · 预警</span><strong>{yellow}</strong><small>较上周 +1</small></div>
      <div className="metric-card red"><span>红色 · 严重</span><strong>{red}</strong><small>需管理层关注</small></div>
      <div className="metric-card progress"><span>组合总体进度</span><div className="metric-progress"><strong>{actualProgress.toFixed(1)}%</strong><em>计划 {planProgress.toFixed(1)}%</em></div><ProgressBar value={actualProgress} /><small className={progressGap < 0 ? "negative" : "positive"}>{progressGap < 0 ? "落后" : "领先"}计划 {Math.abs(progressGap).toFixed(1)} 个百分点</small></div>
      <div className="metric-card quality"><span>数据装载状态</span><strong>{total ? "100%" : "0%"}</strong><small>{total} / {total} 项目已载入</small></div>
    </section>

    <section className="cockpit-controls">
      <div className="section-heading"><div><span className="section-index">01</span><h2>项目节点态势矩阵</h2></div><p>横向扫描统一节点，点击色块查看偏差归因</p></div>
      <div className="filter-row">
        <label>组织
          <select value={org} onChange={e => { setOrg(e.target.value); setPage(0); }}>
            <option>全部组织</option>{organizations.map((organization) => <option key={organization}>{organization}</option>)}
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
        <div className="heatmap-table">
          <div className="heatmap-head"><div className="project-col">项目 / 健康度</div>{milestones.map((m, i) => <div key={m}><span>0{i + 1}</span>{m}</div>)}</div>
          {filtered.map((p) => <div className="heatmap-row" key={p.id}>
            <button className="project-cell" onClick={() => onNavigate("project", p.id)}>
              <StatusPill status={p.status} compact /><span><strong>{p.name}</strong><small>{p.owner} · {p.org}</small></span><b>{p.score}</b>
            </button>
            {p.cells.map((status, index) => {
              const day = status === "red" ? (index + 3) : status === "yellow" ? (index + 1) : 0;
              return <button key={index} className={`heat-cell ${status}`} onClick={() => setSelected({ project: p, index })} aria-label={`${p.name} ${milestones[index]} ${statusLabel[status]}`}>
                <span className="cell-symbol">{statusSymbol[status]}</span>
                <small>{status === "na" ? "N/A" : status === "green" ? `${Math.min(100, 28 + index * 14)}%` : `+${day}天`}</small>
              </button>;
            })}
          </div>)}
        </div>
        <div className="matrix-footer"><span>当前展示 {filtered.length} / {matching.length} 个匹配项目</span><span>矩阵每 20 秒自动翻页 <i>{String(page + 1).padStart(2, "0")} / {pageCount}</i></span></div>
      </div>

      <aside className="attention-panel">
        <div className="attention-head"><div><span className="section-index">02</span><h2>重点关注</h2></div><button>查看全部</button></div>
        <div className="alert-card primary">
          <div className="rank">01</div><div><StatusPill status="red" /><h3>智慧采购平台</h3><p>开发完成节点预计延期 12 天</p><span>责任人 李程 · 恢复目标 07/28</span></div><b>-15%</b>
        </div>
        <div className="alert-card"><div className="rank">02</div><div><h3>财务共享中心二期</h3><p>联调测试连续两周未达预期</p><span>高风险 2项 · 措施逾期 1项</span></div><b>-15%</b></div>
        <div className="alert-card"><div className="rank">03</div><div><h3>统一门户升级项目</h3><p>用户验收关键节点延期 6 天</p><span>责任人 高远 · 待管理决策</span></div><b>-13%</b></div>
        <div className="upcoming">
          <h3><Icon>◷</Icon> 未来7日关键节点</h3>
          <ul><li><span>07/24</span><b>合同管理 · 方案评审</b><em>3天</em></li><li><span>07/26</span><b>主数据治理 · 用户验收</b><em>5天</em></li><li><span>07/28</span><b>司库系统 · 上线切换</b><em>7天</em></li></ul>
        </div>
      </aside>
    </section>

    <section className="trend-section">
      <div className="trend-card">
        <div className="mini-head"><div><span className="section-index">03</span><h2>近12周健康趋势</h2></div><span className="trend-up">↗ 绿色项目占比提升 4.6%</span></div>
        <div className="stacked-chart">{trend.map(t => <div className="week" key={t.w}><div className="bar" title={`${t.w}: 绿${t.g} 黄${t.y} 红${t.r}`}><i className="red" style={{height:`${t.r*3}px`}}/><i className="yellow" style={{height:`${t.y*3}px`}}/><i className="green" style={{height:`${t.g*2}px`}}/></div><small>{t.w}</small></div>)}</div>
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
        <h2>{selected.project.name}</h2><p>{milestones[selected.index]} · 第 {selected.index + 1} 阶段</p>
        <div className="drawer-status"><StatusPill status={selected.project.cells[selected.index]} /><strong>{selected.project.cells[selected.index] === "red" ? "预计延期 12 天" : selected.project.cells[selected.index] === "yellow" ? "预计延期 4 天" : "按计划推进"}</strong></div>
        <div className="drawer-grid"><div><small>计划完成</small><strong>2026-07-16</strong></div><div><small>预测完成</small><strong>2026-07-28</strong></div><div><small>节点权重</small><strong>20%</strong></div><div><small>当前完成度</small><strong>68%</strong></div></div>
        <div className="cause-card"><span>偏差归因</span><p>核心供应商接口规范确认晚于计划，影响开发联调窗口；已安排专项工作组并行处理。</p></div>
        <div className="action-card"><div><span>纠偏措施</span><StatusPill status="yellow" /></div><h3>接口联调专项攻坚</h3><p>责任人：李程　·　恢复目标：07月28日</p><ProgressBar value={60} tone="yellow" /></div>
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
    <div className="sidebar-bottom"><div className="system-state"><i /><span><strong>系统运行正常</strong><small>数据更新于 14:32</small></span></div><button className="cockpit-link" onClick={() => onNavigate("cockpit")}><Icon>▦</Icon>打开管理大屏 <span>↗</span></button></div>
  </aside>;
}

function WorkspaceHeader({ title, subtitle, onNavigate, identity }: { title: string; subtitle: string; onNavigate: Navigate; identity: Identity | null }) {
  const [menu, setMenu] = useState(false);
  const roleNames: Record<Role, string> = {
    executive: "管理层",
    manager: "项目经理",
    pmo: "PMO",
    admin: "系统管理员",
  };
  const displayName = identity?.displayName || "登录用户";
  const roleName = identity ? roleNames[identity.role] : "身份加载中";
  return <header className="workspace-header">
    <div><h1>{title}</h1><p>{subtitle}</p></div>
    <div className="header-actions"><button className="icon-button" aria-label="搜索">⌕</button><button className="icon-button notice" aria-label="通知">♢<i /></button><button className="user-button" onClick={() => setMenu(!menu)}><span className="avatar">{displayName[0]}</span><span><strong>{displayName}</strong><small>{roleName}</small></span><em>⌄</em></button></div>
    {menu && <div className="user-menu"><button>个人设置</button><button onClick={() => onNavigate("cockpit")}>打开管理大屏</button><button>退出演示账号</button></div>}
  </header>;
}

function Portfolio({ onNavigate, onDataChanged, projectData = projects, identity }: { onNavigate: Navigate; onDataChanged: () => Promise<void>; projectData?: ProjectData[]; identity: Identity | null }) {
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

  async function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setCreateError("");
    const form = new FormData(event.currentTarget);
    const names = milestones;
    const weights = [5, 10, 10, 20, 20, 20, 15];
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
          milestones: names.map((name, index) => ({
            name,
            sequence: index + 1,
            weight: weights[index],
            critical: index === 3 || index === 6,
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
        <div className="summary-card wide"><div><small>周报完成率</small><strong>95.5%</strong></div><ProgressBar value={95.5} /><span>42 / 44</span></div>
      </div>
      <section className="content-card">
        <div className="table-toolbar"><div><h2>项目清单</h2><span>当前批准基线口径</span></div><div className="toolbar-actions"><label className="search"><span>⌕</span><input placeholder="搜索项目名称" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /></label><select value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}><option>全部</option><option>正常</option><option>预警</option><option>严重</option></select>{(identity?.role === "pmo" || identity?.role === "admin") && <button className="primary-button" onClick={() => setShowCreate(true)}>＋ 新建项目</button>}</div></div>
        <div className="project-table">
          <div className="table-head"><span>项目名称</span><span>健康状态</span><span>项目经理</span><span>计划 / 实际</span><span>进度偏差</span><span>风险</span><span>更新时间</span><span /></div>
          {filtered.map(p => <div className="table-row" key={p.id}>
            <button className="project-name" onClick={() => onNavigate("project", p.id)}><i>{p.id}</i><span><strong>{p.name}</strong><small>{p.org} · {p.type}</small></span></button>
            <span><StatusPill status={p.status} /></span><span className="owner"><i>{p.owner[0]}</i>{p.owner}</span>
            <span className="dual-progress"><b>{p.actual}%</b><ProgressBar value={p.actual} tone={p.status} /><small>计划 {p.plan}%</small></span>
            <span className={p.actual - p.plan < -5 ? "negative" : "positive"}>{p.actual - p.plan > 0 ? "+" : ""}{p.actual - p.plan} pp</span>
            <span className={`risk ${p.risk === "高" ? "high" : p.risk === "中" ? "medium" : "low"}`}>{p.risk}风险</span><span>{p.updatedAt ? p.updatedAt.replace("T", " ").slice(5, 16) : "演示数据"}</span><button className="more" aria-label="更多">•••</button>
          </div>)}
        </div>
        <div className="pagination"><span>共 {matching.length} 条，每页 10 条</span><div><button disabled={safePage === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>‹</button>{Array.from({ length: pageCount }, (_, index) => <button key={index} className={safePage === index ? "active" : ""} onClick={() => setPage(index)}>{index + 1}</button>)}<button disabled={safePage === pageCount - 1} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>›</button></div></div>
      </section>
    </div>
    {showCreate && <div className="modal-backdrop" onClick={() => setShowCreate(false)}><section className="create-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowCreate(false)}>×</button><span className="modal-kicker">PROJECT SETUP</span><h2>新建统建项目</h2><p>创建后自动套用7个标准节点，节点权重合计100%。</p><form onSubmit={createProject}><div className="modal-form-grid"><label>项目编码<input name="code" placeholder="例如 P11" required /></label><label>项目名称<input name="name" placeholder="请输入项目名称" required /></label><label>项目经理<input name="ownerName" placeholder="姓名" required /></label><label>项目经理邮箱<input name="ownerEmail" type="email" placeholder="name@example.com" required /></label><label>所属组织<input name="org" placeholder="例如 财务数智组" required /></label><label>项目类型<select name="type"><option>核心系统</option><option>业务平台</option><option>数据平台</option><option>技术底座</option></select></label><label>初始风险<select name="riskLevel"><option value="low">低风险</option><option value="medium">中风险</option><option value="high">高风险</option></select></label></div><div className="template-summary"><strong>标准节点模板</strong><span>{milestones.join(" → ")}</span></div>{createError && <div className="form-error" role="alert">! {createError}</div>}<div className="modal-actions"><button type="button" className="outline-button" onClick={() => setShowCreate(false)}>取消</button><button type="submit" className="primary-button" disabled={creating}>{creating ? "正在创建…" : "创建项目"}</button></div></form></section></div>}
  </div>;
}

function ProjectDetail({ onNavigate, projectData = projects, projectId, identity }: { onNavigate: Navigate; projectData?: ProjectData[]; projectId: string; identity: Identity | null }) {
  const [tab, setTab] = useState("节点计划");
  const [expanded, setExpanded] = useState<number | null>(3);
  const currentProject =
    projectData.find((project) => project.id === projectId) ??
    projectData[0] ??
    projects[0];
  const variance = currentProject.actual - currentProject.plan;
  const canUpdate =
    identity?.role === "admin" ||
    identity?.role === "pmo" ||
    (identity?.role === "manager" &&
      Boolean(currentProject.ownerEmail) &&
      identity.email === currentProject.ownerEmail);
  return <div className="workspace-page">
    <WorkspaceHeader title="项目详情" subtitle={`项目台账 / ${currentProject.name}`} onNavigate={onNavigate} identity={identity} />
    <div className="page-content project-detail">
      <button className="back-link" onClick={() => onNavigate("portfolio")}>← 返回项目总览</button>
      <section className="project-hero">
        <div className="project-identity"><div className="project-code">{currentProject.name[0]}</div><div><div><StatusPill status={currentProject.status} /><span className="project-tag">{currentProject.type}</span>{currentProject.cells.some((cell) => cell === "red") && <span className="project-tag">重点关注</span>}</div><h2>{currentProject.name}</h2><p>项目经理 {currentProject.owner}　·　{currentProject.org}　·　当前批准基线口径</p></div></div>
        <div className="hero-metrics"><div><small>健康度</small><strong className={currentProject.status === "red" ? "red-text" : ""}>{currentProject.score}</strong><span>/100</span></div><div><small>计划进度</small><strong>{currentProject.plan}%</strong></div><div><small>实际进度</small><strong>{currentProject.actual}%</strong></div><div><small>进度偏差</small><strong className={variance < -5 ? "red-text" : ""}>{variance > 0 ? "+" : ""}{variance}pp</strong></div></div>
        <div className="hero-actions"><button className="outline-button" onClick={() => window.print()}>导出报告</button>{canUpdate && <button className="primary-button" onClick={() => onNavigate("report", currentProject.id)}>更新本周进度</button>}</div>
      </section>
      <section className="score-explain">
        <div className="score-ring"><strong>{currentProject.score}</strong><span>综合健康度</span></div><div className="score-copy"><h3>项目{statusLabel[currentProject.status]}：评分与一票否决规则共同判定</h3><p>基础分 100，当前累计扣分 {100 - currentProject.score} 分。所有扣分均可追溯至节点、风险或数据更新记录。</p><div className="deductions"><span>进度偏差 <b>{variance}pp</b></span><span>节点预警 <b>{currentProject.cells.filter((cell) => cell === "yellow").length}项</b></span><span>严重节点 <b>{currentProject.cells.filter((cell) => cell === "red").length}项</b></span></div></div><button className="text-button">查看评分明细 →</button>
      </section>
      <div className="tabs">{["节点计划","周报记录","风险与措施","基线版本","操作审计"].map(t => <button className={tab === t ? "active" : ""} onClick={() => setTab(t)} key={t}>{t}{t === "风险与措施" && <b>4</b>}</button>)}</div>
      {tab === "节点计划" && <section className="content-card milestone-card">
        <div className="card-title"><div><h2>项目节点计划</h2><p>当前基线 V2 · 批准于 2026-06-18　<span>较原始基线累计延期 9 天</span></p></div><button className="outline-button">申请基线变更</button></div>
        <div className="milestone-list">
          {milestones.map((m, i) => {
            const status = currentProject.cells[i] ?? "na"; const complete = [100,100,100,Math.max(68, currentProject.actual),25,0,0][i];
            return <div className={`milestone-row ${expanded === i ? "expanded" : ""}`} key={m}>
              <button className="milestone-main" onClick={() => setExpanded(expanded === i ? null : i)}>
                <span className={`milestone-index ${status}`}>{i + 1}</span><span className="milestone-name"><strong>{m}</strong><small>{i === 3 || i === 6 ? "◆ 关键节点" : "标准节点"} · 权重 {i === 3 ? 20 : i === 6 ? 15 : 10}%</small></span>
                <span><small>计划完成</small><strong>2026-{String(3 + i).padStart(2,"0")}-{10 + i}</strong></span><span><small>预测 / 实际</small><strong className={status === "red" ? "red-text" : ""}>{status === "na" ? "—" : `2026-${String(3+i).padStart(2,"0")}-${12+i}`}</strong></span>
                <span className="milestone-complete"><b>{complete}%</b><ProgressBar value={complete} tone={status} /></span><StatusPill status={status} /><em>{expanded === i ? "⌃" : "⌄"}</em>
              </button>
              {expanded === i && <div className="milestone-expand"><div><span>偏差说明</span><p>供应商接口规范确认晚于计划，开发工作量增加，预测较批准基线延期 12 天。</p></div><div><span>纠偏措施</span><p>接口联调专项攻坚 · 责任人 李程 · 恢复目标 07月28日</p></div><button>查看完整记录 →</button></div>}
            </div>;
          })}
        </div>
      </section>}
      {tab !== "节点计划" && <section className="content-card placeholder-panel"><div className="placeholder-icon">{tab === "风险与措施" ? "!" : tab === "基线版本" ? "≋" : "◎"}</div><h2>{tab}</h2><p>该模块已纳入原型信息架构，可从主流程中的对应入口继续体验。</p><button className="primary-button" onClick={() => tab === "基线版本" ? onNavigate("pmo") : onNavigate("report")}>进入演示流程</button></section>}
    </div>
  </div>;
}

function WeeklyReport({ onNavigate, onDataChanged, projectId, projectData = projects, identity }: { onNavigate: Navigate; onDataChanged: () => Promise<void>; projectId: string; projectData?: ProjectData[]; identity: Identity | null }) {
  const currentProject =
    projectData.find((project) => project.id === projectId) ??
    projectData[0] ??
    projects[0];
  const [declared, setDeclared] = useState(55);
  const [systemProgress, setSystemProgress] = useState(53);
  const [reason, setReason] = useState("核心供应商接口规范确认晚于计划，影响开发联调窗口。");
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const diff = declared - systemProgress;

  useEffect(() => {
    fetch("/api/bootstrap")
      .then(async (response) => {
        if (!response.ok) throw new Error("无法读取当前项目数据");
        return response.json();
      })
      .then((data: { projects?: Array<{ id: string; actual: number; declared: number }> }) => {
        const project = data.projects?.find((item) => item.id === projectId);
        if (project) {
          setSystemProgress(project.actual);
          setDeclared(project.declared);
        }
      })
      .catch(() => undefined);
  }, [projectId]);

  async function submitWeeklyReport() {
    setSubmitting(true);
    setSubmitError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/weekly-reports`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          weekKey: "2026-W30",
          systemProgress,
          declaredProgress: declared,
          reason,
          forecastFinish: "2026-07-28",
          milestone: { sequence: 4, completion: 68, forecastFinish: "2026-07-28" },
          action: {
            name: "接口联调专项攻坚",
            owner: "李程",
            recoveryDate: "2026-07-28",
            detail: "增加2名接口开发人员，每日17:00开展问题清零会。",
          },
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "周报提交失败");
      await onDataChanged();
      setSaved(true);
      setTimeout(() => setSaved(false), 2800);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "周报提交失败");
    } finally {
      setSubmitting(false);
    }
  }
  return <div className="workspace-page">
    <WorkspaceHeader title="周度进度填报" subtitle="2026年第30周 · 填报截止 07月24日 17:00" onNavigate={onNavigate} identity={identity} />
    <div className="page-content report-page">
      <div className="report-top"><div><button className="back-link" onClick={() => onNavigate("project", projectId)}>← 返回项目详情</button><h2>{currentProject.name}</h2><p>{currentProject.owner}负责 · 本周数据将进入下一次周度快照</p></div><div className="save-state"><span>服务端校验已启用</span><i /> 实时</div></div>
      <div className="report-layout">
        <div className="report-form">
          <section className="content-card form-section">
            <div className="form-title"><span>01</span><div><h3>总体进度确认</h3><p>系统根据节点权重自动计算，申报值偏差超过 5pp 将提示核验。</p></div></div>
            <div className="progress-compare"><div><small>系统计算进度</small><strong>{systemProgress}%</strong><ProgressBar value={systemProgress} /></div><div><small>项目经理申报进度</small><strong>{declared}%</strong><input aria-label="项目经理申报进度" type="range" min="0" max="100" value={declared} onChange={e => setDeclared(Number(e.target.value))} /></div><div className={Math.abs(diff) > 5 ? "compare-warning" : "compare-ok"}><span>{Math.abs(diff) > 5 ? "!" : "✓"}</span><strong>{diff > 0 ? "+" : ""}{diff}pp</strong><small>{Math.abs(diff) > 5 ? "需说明差异" : "口径一致"}</small></div></div>
          </section>
          <section className="content-card form-section">
            <div className="form-title"><span>02</span><div><h3>节点进展更新</h3><p>仅展示本周有变化或需要关注的节点。</p></div></div>
            <div className="node-form">
              <div className="node-form-head"><div><StatusPill status="red" /><h4>开发完成 <span>◆ 关键节点</span></h4></div><small>计划完成 07月16日 · 当前完成 68%</small></div>
              <div className="form-grid"><label>节点状态<select defaultValue="进行中"><option>未开始</option><option>进行中</option><option>已完成</option></select></label><label>完成度<div className="percent-input"><input defaultValue="68" /><span>%</span></div></label><label>预测完成日期<input type="date" defaultValue="2026-07-28" /></label><label>相对基线偏差<div className="readonly-input red-text">+12 天</div></label></div>
              <label className="full-label">偏差原因 <b>*</b><textarea value={reason} onChange={e => setReason(e.target.value)} /></label>
            </div>
            <div className="node-form warning-node">
              <div className="node-form-head"><div><StatusPill status="yellow" /><h4>联调测试</h4></div><small>计划完成 08月18日 · 当前完成 25%</small></div>
              <div className="form-grid"><label>节点状态<select defaultValue="进行中"><option>未开始</option><option>进行中</option></select></label><label>完成度<div className="percent-input"><input defaultValue="25" /><span>%</span></div></label><label>预测完成日期<input type="date" defaultValue="2026-08-22" /></label><label>相对基线偏差<div className="readonly-input yellow-text">+4 天</div></label></div>
            </div>
          </section>
          <section className="content-card form-section">
            <div className="form-title"><span>03</span><div><h3>异常纠偏措施</h3><p>红黄节点必须明确措施、责任人与预计恢复时间。</p></div></div>
            <div className="action-form"><div className="form-grid"><label>措施名称 <b>*</b><input defaultValue="接口联调专项攻坚" /></label><label>责任人 <b>*</b><input defaultValue="李程" /></label><label>预计恢复日期 <b>*</b><input type="date" defaultValue="2026-07-28" /></label><label>措施状态<select><option>进行中</option><option>待启动</option><option>已完成</option></select></label></div><label className="full-label">具体行动<input defaultValue="增加2名接口开发人员，每日17:00开展问题清零会。" /></label></div>
          </section>
          {submitError && <div className="form-error" role="alert">! {submitError}</div>}
          <div className="report-actions"><button className="outline-button">保存草稿</button><button className="primary-button" disabled={submitting} onClick={submitWeeklyReport}>{submitting ? "正在提交…" : "提交本周进度"}</button></div>
        </div>
        <aside className="report-aside">
          <div className="aside-card"><h3>填报完整度</h3><div className="completion-circle"><strong>92%</strong></div><ul><li className="done">✓ 总体进度</li><li className="done">✓ 节点更新</li><li className="done">✓ 偏差原因</li><li className="done">✓ 纠偏措施</li><li>○ 支撑附件（选填）</li></ul></div>
          <div className="aside-card rule-tips"><h3>本次规则检查</h3><p className="pass">✓ 申报与计算进度一致</p><p className="pass">✓ 红色节点已填写原因</p><p className="pass">✓ 已指定措施责任人</p><p className="warning">▲ 预测完成日晚于基线12天</p></div>
          <div className="aside-card"><h3>快照提示</h3><p>本周五 17:00 系统将锁定第30周快照。锁定后修改只影响下一周期。</p></div>
        </aside>
      </div>
    </div>
    {saved && <div className="toast"><span>✓</span><div><strong>周报提交成功</strong><p>已进入第30周待锁定数据。</p></div></div>}
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

  useEffect(() => {
    fetch("/api/rule-configs")
      .then((response) => response.json())
      .then((data: { ruleConfigs?: Array<typeof values & { version: number }> }) => {
        const rule = data.ruleConfigs?.[0];
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
      })
      .catch(() => undefined);
  }, []);

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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "规则发布失败");
    } finally {
      setSaving(false);
    }
  }

  const field = (key: keyof typeof values, label: string, suffix: string) =>
    <label>{label}<div className="rule-input"><input type="number" min="0" max="365" value={values[key]} onChange={(event) => setValues((current) => ({ ...current, [key]: Number(event.target.value) }))} /><span>{suffix}</span></div></label>;

  return <section className="content-card rule-panel"><div className="card-title"><div><h2>预警规则配置</h2><p>当前生效版本 V{version} · 发布后保留历史版本并记录操作人</p></div><span className="count-badge">V{version} 生效中</span></div><div className="rule-sections"><div><h3>普通节点时间阈值</h3><p>根据预测或实际完成日期相对批准基线的偏差天数判定。</p><div className="rule-fields">{field("normalYellowDays","黄色起始阈值","天")}{field("normalRedDays","红色起始阈值","天")}</div></div><div><h3>关键节点时间阈值</h3><p>关键节点采用更严格的预警口径，并可触发项目红色一票否决。</p><div className="rule-fields">{field("criticalYellowDays","黄色起始阈值","天")}{field("criticalRedDays","红色起始阈值","天")}</div></div><div><h3>项目健康度阈值</h3><p>综合得分达到绿色阈值为正常，低于黄色阈值为严重。</p><div className="rule-fields">{field("greenScore","绿色最低分","分")}{field("yellowScore","黄色最低分","分")}</div></div></div>{message && <div className={message.includes("已发布") ? "success-message" : "form-error"}>{message}</div>}<div className="rule-actions"><button className="outline-button">查看历史版本</button><button className="primary-button" disabled={saving} onClick={publishRule}>{saving ? "正在发布…" : "发布新版本"}</button></div></section>;
}

function AdminPage({ onNavigate, identity }: { onNavigate: Navigate; identity: Identity | null }) {
  type UserRow = { email: string; displayName: string; role: "executive" | "pmo" | "manager" | "admin"; active: boolean; createdAt: string };
  type AuditRow = { id: number; actorEmail: string; action: string; entityType: string; entityId: string; createdAt: string };
  const [usersData, setUsersData] = useState<UserRow[]>([]);
  const [auditData, setAuditData] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const actionNames: Record<string, string> = {
    "weekly_report.submit": "提交周报",
    "baseline_change.approve": "批准基线",
    "snapshot.lock": "锁定快照",
    "project.create": "创建项目",
    "project.update": "更新项目",
    "user.update": "更新用户",
    "rule_config.publish": "发布规则",
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
    setError("");
    const response = await fetch(`/api/users/${encodeURIComponent(user.email)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(result.error || "角色更新失败");
      return;
    }
    await loadAdminData();
  }

  const canEditUsers = identity?.role === "admin";
  return <div className="workspace-page"><WorkspaceHeader title="系统管理" subtitle="用户角色、权限边界与全量操作审计" onNavigate={onNavigate} identity={identity} /><div className="page-content admin-page">{error && <div className="form-error" role="alert">! {error}</div>}<div className="admin-grid"><section className="content-card"><div className="card-title"><div><h2>用户与角色</h2><p>{canEditUsers ? "可调整账号角色；身份仍由登录平台确认" : "PMO 可查看账号，只有系统管理员可调整角色"}</p></div><span className="count-badge">{usersData.length} 个账号</span></div>{loading ? <div className="panel-loading">正在读取用户数据…</div> : <div className="user-table"><div className="table-head"><span>用户</span><span>角色</span><span>状态</span><span>加入时间</span></div>{usersData.map((user) => <div className="table-row" key={user.email}><span className="admin-user"><i>{user.displayName[0]}</i><b>{user.displayName}<small>{user.email}</small></b></span><select value={user.role} disabled={!canEditUsers} onChange={(event) => updateRole(user, event.target.value as UserRow["role"])}><option value="executive">管理层只读</option><option value="manager">项目经理</option><option value="pmo">PMO</option><option value="admin">系统管理员</option></select><span className={user.active ? "user-active" : "user-disabled"}>{user.active ? "● 正常" : "— 停用"}</span><span>{user.createdAt.slice(0, 10)}</span></div>)}</div>}</section><section className="content-card"><div className="card-title"><div><h2>操作审计</h2><p>记录所有关键数据与权限变更</p></div><button className="text-button" onClick={loadAdminData}>刷新</button></div>{loading ? <div className="panel-loading">正在读取审计记录…</div> : <div className="audit-list">{auditData.length ? auditData.map((row) => <div key={row.id}><span className="audit-dot" /><div><strong>{actionNames[row.action] ?? row.action}</strong><p>{row.actorEmail} · {row.entityType} / {row.entityId}</p></div><time>{row.createdAt.replace("T"," ").slice(0,16)}</time></div>) : <div className="empty-state">暂无审计记录</div>}</div>}</section></div></div></div>;
}

function PmoPage({ onNavigate, onDataChanged, identity }: { onNavigate: Navigate; onDataChanged: () => Promise<void>; identity: Identity | null }) {
  const [locked, setLocked] = useState(false);
  const [approved, setApproved] = useState(false);
  const [tab, setTab] = useState("快照锁定");
  const [changeId, setChangeId] = useState(1);
  const [working, setWorking] = useState(false);
  const [operationError, setOperationError] = useState("");

  useEffect(() => {
    fetch("/api/bootstrap")
      .then(async (response) => {
        if (!response.ok) throw new Error("无法读取PMO数据");
        return response.json();
      })
      .then((data: {
        snapshots?: Array<{ weekKey: string }>;
        baselineChanges?: Array<{ id: number; projectId: string; status: string }>;
      }) => {
        setLocked(Boolean(data.snapshots?.some((snapshot) => snapshot.weekKey === "2026-W30")));
        const change = data.baselineChanges?.find((item) => item.projectId === "P02");
        if (change) {
          setChangeId(change.id);
          setApproved(change.status === "approved");
        }
      })
      .catch(() => undefined);
  }, []);

  async function lockSnapshot() {
    setWorking(true);
    setOperationError("");
    try {
      const response = await fetch("/api/snapshots/lock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ weekKey: "2026-W30" }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "快照锁定失败");
      setLocked(true);
      await onDataChanged();
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "快照锁定失败");
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
      await onDataChanged();
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "基线审批失败");
    } finally {
      setWorking(false);
    }
  }
  return <div className="workspace-page">
    <WorkspaceHeader title="PMO 管理中心" subtitle="统一规则、治理数据、锁定管理口径" onNavigate={onNavigate} identity={identity} />
    <div className="page-content pmo-page">
      <div className="pmo-tabs">{["快照锁定","基线变更","节点模板","预警规则"].map(t => <button className={tab === t ? "active" : ""} onClick={() => setTab(t)} key={t}>{t}{t === "基线变更" && <b>3</b>}</button>)}</div>
      {tab === "快照锁定" && <>
        <section className={`snapshot-banner ${locked ? "locked" : ""}`}>
          <div className="snapshot-calendar"><span>JUL</span><strong>24</strong></div><div><span className="kicker">2026年第30周</span><h2>{locked ? "本周快照已锁定" : "距离本周快照锁定还有 2天 02:21"}</h2><p>{locked ? "管理层大屏已切换至最新锁定口径，历史版本已永久保留。" : "计划于周五 17:00 自动锁定，PMO 可在数据检查通过后提前锁定。"}</p></div><button className={locked ? "locked-button" : "primary-button"} disabled={working || locked} onClick={lockSnapshot}>{locked ? "✓ 已锁定 · V1" : working ? "正在锁定…" : "立即锁定快照"}</button>
        </section>
        {operationError && <div className="form-error" role="alert">! {operationError}</div>}
        <div className="pmo-grid">
          <section className="content-card quality-panel"><div className="card-title"><div><h2>锁定前数据检查</h2><p>系统自动检查完整性、时效性与规则异常</p></div><span className="quality-score">96.8分</span></div>
            <div className="quality-items"><div className="ok"><span>✓</span><div><strong>周报提交</strong><small>42 / 44 已完成</small></div><b>95.5%</b></div><div className="ok"><span>✓</span><div><strong>关键字段完整性</strong><small>所有红黄节点均已填写原因</small></div><b>100%</b></div><div className="warn"><span>!</span><div><strong>待补交项目</strong><small>2个项目尚未提交本周数据</small></div><b>2 项</b></div><div className="warn"><span>!</span><div><strong>申报偏差异常</strong><small>申报进度与计算值相差超过5pp</small></div><b>3 项</b></div></div>
          </section>
          <section className="content-card"><div className="card-title"><div><h2>待处理事项</h2><p>处理完成后可提高快照数据质量</p></div><button className="text-button">查看全部</button></div>
            <div className="todo-list"><div><span className="todo-icon red">!</span><div><strong>数字档案平台</strong><p>尚未提交第30周进度</p></div><em>催报</em></div><div><span className="todo-icon yellow">▲</span><div><strong>主数据治理一期</strong><p>申报进度与计算值相差 8pp</p></div><em>核验</em></div><div><span className="todo-icon blue">≋</span><div><strong>智慧采购平台</strong><p>基线变更申请待审批</p></div><em onClick={() => setTab("基线变更")}>审批</em></div></div>
          </section>
        </div>
        <section className="content-card history-card"><div className="card-title"><div><h2>历史快照</h2><p>已锁定版本不可覆盖，重新打开将生成新版本</p></div><button className="outline-button">导出快照</button></div>
          <div className="snapshot-table"><div className="table-head"><span>周期</span><span>版本</span><span>项目数</span><span>数据完整度</span><span>锁定时间</span><span>操作人</span><span>状态</span><span /></div>{[["第29周","V1","44","100%","07-17 17:00","系统自动"],["第28周","V2","44","100%","07-10 18:26","周航"],["第27周","V1","42","97.6%","07-03 17:00","系统自动"]].map((r)=><div className="table-row" key={r[0]}>{r.map(c=><span key={c}>{c}</span>)}<span><StatusPill status="green" /></span><button>查看</button></div>)}</div>
        </section>
      </>}
      {tab === "基线变更" && <section className="content-card baseline-approval">
        <div className="card-title"><div><h2>基线变更审批</h2><p>原始基线永久保留，批准后生成新的当前基线版本</p></div><span className="count-badge">3项待审批</span></div>
        <div className="change-card"><div className="change-head"><div><span className="project-chip">P02</span><div><h3>智慧采购平台</h3><p>申请人 李程 · 07月21日 10:32</p></div></div><StatusPill status={approved ? "green" : "yellow"} /></div>
          <div className="change-reason"><small>变更原因</small><p>核心供应商接口规范调整，经项目专题会确认增加开发与联调周期。</p></div>
          <div className="date-change"><div><small>开发完成</small><span><s>2026-07-16</s><b>→</b><strong>2026-07-28</strong><em>+12天</em></span></div><div><small>联调测试</small><span><s>2026-08-18</s><b>→</b><strong>2026-08-22</strong><em>+4天</em></span></div><div><small>上线切换</small><span><s>2026-10-20</s><b>→</b><strong>2026-10-31</strong><em>+11天</em></span></div></div>
          <div className="change-impact"><span>影响评估</span><p>较原始基线累计延期 23 天；不影响年度总体目标；项目成本预计增加 3.2%。</p></div>
          {operationError && <div className="form-error" role="alert">! {operationError}</div>}
          <div className="approval-actions">{approved ? <div className="approved-note">✓ 已批准，当前基线已更新为 V3</div> : <><button className="danger-outline">驳回申请</button><button className="primary-button" disabled={working} onClick={approveBaseline}>{working ? "正在审批…" : "批准并生成 V3"}</button></>}</div>
        </div>
      </section>}
      {tab === "节点模板" && <section className="content-card placeholder-panel"><div className="placeholder-icon">▦</div><h2>节点模板</h2><p>统一节点模板包含7个标准节点、权重及关键节点标识，项目可标记不适用或申请新增。</p><button className="primary-button" onClick={() => onNavigate("portfolio")}>新建项目并套用模板</button></section>}
      {tab === "预警规则" && <RuleConfigPanel />}
    </div>
    {locked && <div className="toast"><span>✓</span><div><strong>第30周快照已锁定</strong><p>管理大屏已切换至最新数据。</p></div></div>}
  </div>;
}

export default function Home() {
  const [view, setView] = useState<View>("cockpit");
  const [projectData, setProjectData] = useState<ProjectData[]>(projects);
  const [identity, setIdentity] = useState<Identity | null>(null);
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
      };
      if (data.projects?.length) setProjectData(data.projects);
      if (data.identity) setIdentity(data.identity);
      setDataState("ready");
    } catch {
      setDataState("fallback");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshData(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshData]);

  if (view === "cockpit") return <><Cockpit onNavigate={navigate} projectData={projectData} />{dataState === "fallback" && <div className="data-banner">当前显示离线演示数据，数据服务恢复后将自动同步。</div>}</>;
  return <div className="app-shell"><Sidebar view={view} onNavigate={navigate} identity={identity} /><div className="workspace">{view === "portfolio" && <Portfolio onNavigate={navigate} onDataChanged={refreshData} projectData={projectData} identity={identity} />}{view === "project" && <ProjectDetail onNavigate={navigate} projectData={projectData} projectId={selectedProjectId} identity={identity} />}{view === "report" && <WeeklyReport onNavigate={navigate} onDataChanged={refreshData} projectId={selectedProjectId} projectData={projectData} identity={identity} />}{view === "pmo" && <PmoPage onNavigate={navigate} onDataChanged={refreshData} identity={identity} />}{view === "admin" && <AdminPage onNavigate={navigate} identity={identity} />}</div></div>;
}
