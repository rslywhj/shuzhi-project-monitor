"use client";

import { useEffect, useMemo, useState } from "react";

type Status = "green" | "yellow" | "red" | "na";
type View = "cockpit" | "portfolio" | "project" | "report" | "pmo";

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

function Cockpit({ onNavigate, projectData = projects }: { onNavigate: (view: View, projectId?: string) => void; projectData?: typeof projects }) {
  const [org, setOrg] = useState("全部组织");
  const [health, setHealth] = useState("全部状态");
  const [selected, setSelected] = useState<{ project: typeof projects[0]; index: number } | null>(null);
  const filtered = projectData.filter(p => (org === "全部组织" || p.org === org) && (health === "全部状态" || statusLabel[p.status] === health)).slice(0, 10);
  const total = 44, green = 31, yellow = 8, red = 5;

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
      <div className="metric-card green"><span>绿色 · 正常</span><strong>{green}</strong><small>70.5% 项目受控</small></div>
      <div className="metric-card yellow"><span>黄色 · 预警</span><strong>{yellow}</strong><small>较上周 +1</small></div>
      <div className="metric-card red"><span>红色 · 严重</span><strong>{red}</strong><small>需管理层关注</small></div>
      <div className="metric-card progress"><span>组合总体进度</span><div className="metric-progress"><strong>68.4%</strong><em>计划 72.1%</em></div><ProgressBar value={68.4} /><small className="negative">落后计划 3.7 个百分点</small></div>
      <div className="metric-card quality"><span>周报完成率</span><strong>95.5%</strong><small>42 / 44 已完成</small></div>
    </section>

    <section className="cockpit-controls">
      <div className="section-heading"><div><span className="section-index">01</span><h2>项目节点态势矩阵</h2></div><p>横向扫描统一节点，点击色块查看偏差归因</p></div>
      <div className="filter-row">
        <label>组织
          <select value={org} onChange={e => setOrg(e.target.value)}>
            <option>全部组织</option><option>财务数智组</option><option>供应链组</option><option>数据治理组</option>
          </select>
        </label>
        <label>健康度
          <select value={health} onChange={e => setHealth(e.target.value)}>
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
        <div className="matrix-footer"><span>当前展示 {filtered.length} / 44 个项目</span><span>矩阵每 20 秒自动翻页 <i>01 / 05</i></span></div>
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
        <div className="variance-numbers"><div><small>计划进度</small><strong>72.1%</strong></div><div><small>实际进度</small><strong>68.4%</strong></div><div className="variance-gap"><small>进度偏差</small><strong>-3.7pp</strong></div></div>
        <div className="variance-bars"><label>计划 <ProgressBar value={72.1} tone="blue" /></label><label>实际 <ProgressBar value={68.4} tone="cyan" /></label></div>
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

function Sidebar({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const items: { id: View; icon: string; label: string }[] = [
    { id: "portfolio", icon: "⌘", label: "项目总览" },
    { id: "project", icon: "▣", label: "项目台账" },
    { id: "report", icon: "✎", label: "周度填报" },
    { id: "pmo", icon: "◇", label: "PMO 管理" },
  ];
  return <aside className="sidebar">
    <AppLogo />
    <nav>{items.map(item => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => onNavigate(item.id)}><Icon>{item.icon}</Icon>{item.label}{item.id === "report" && <b>2</b>}</button>)}</nav>
    <div className="sidebar-divider" />
    <div className="subnav"><span>常用功能</span><button><Icon>◫</Icon>风险与措施</button><button><Icon>≋</Icon>基线变更</button><button><Icon>⚙</Icon>规则配置</button><button><Icon>♙</Icon>用户与权限</button></div>
    <div className="sidebar-bottom"><div className="system-state"><i /><span><strong>系统运行正常</strong><small>数据更新于 14:32</small></span></div><button className="cockpit-link" onClick={() => onNavigate("cockpit")}><Icon>▦</Icon>打开管理大屏 <span>↗</span></button></div>
  </aside>;
}

function WorkspaceHeader({ title, subtitle, onNavigate }: { title: string; subtitle: string; onNavigate: (v: View) => void }) {
  const [menu, setMenu] = useState(false);
  return <header className="workspace-header">
    <div><h1>{title}</h1><p>{subtitle}</p></div>
    <div className="header-actions"><button className="icon-button" aria-label="搜索">⌕</button><button className="icon-button notice" aria-label="通知">♢<i /></button><button className="user-button" onClick={() => setMenu(!menu)}><span className="avatar">周</span><span><strong>周航</strong><small>PMO 管理员</small></span><em>⌄</em></button></div>
    {menu && <div className="user-menu"><button>个人设置</button><button onClick={() => onNavigate("cockpit")}>打开管理大屏</button><button>退出演示账号</button></div>}
  </header>;
}

function Portfolio({ onNavigate, projectData = projects }: { onNavigate: (v: View) => void; projectData?: typeof projects }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("全部");
  const filtered = useMemo(() => projectData.filter(p => p.name.includes(query) && (status === "全部" || statusLabel[p.status] === status)).slice(0, 10), [query, status, projectData]);
  return <div className="workspace-page">
    <WorkspaceHeader title="项目组合总览" subtitle="以统一口径监控 44 个统建项目的进度与健康状态" onNavigate={onNavigate} />
    <div className="page-content">
      <div className="summary-strip">
        <div className="summary-card"><span className="summary-icon blue">▦</span><div><small>全部项目</small><strong>44</strong><em>100%</em></div></div>
        <div className="summary-card"><span className="summary-icon green">●</span><div><small>绿色项目</small><strong>31</strong><em>70.5%</em></div></div>
        <div className="summary-card"><span className="summary-icon yellow">▲</span><div><small>黄色项目</small><strong>8</strong><em>18.2%</em></div></div>
        <div className="summary-card"><span className="summary-icon red">■</span><div><small>红色项目</small><strong>5</strong><em>11.3%</em></div></div>
        <div className="summary-card wide"><div><small>周报完成率</small><strong>95.5%</strong></div><ProgressBar value={95.5} /><span>42 / 44</span></div>
      </div>
      <section className="content-card">
        <div className="table-toolbar"><div><h2>项目清单</h2><span>已锁定 · 2026年第29周</span></div><div className="toolbar-actions"><label className="search"><span>⌕</span><input placeholder="搜索项目名称" value={query} onChange={e => setQuery(e.target.value)} /></label><select value={status} onChange={e => setStatus(e.target.value)}><option>全部</option><option>正常</option><option>预警</option><option>严重</option></select><button className="outline-button">筛选</button><button className="primary-button" onClick={() => onNavigate("report")}>＋ 新建周报</button></div></div>
        <div className="project-table">
          <div className="table-head"><span>项目名称</span><span>健康状态</span><span>项目经理</span><span>计划 / 实际</span><span>进度偏差</span><span>风险</span><span>更新时间</span><span /></div>
          {filtered.map(p => <div className="table-row" key={p.id}>
            <button className="project-name" onClick={() => onNavigate("project")}><i>{p.id}</i><span><strong>{p.name}</strong><small>{p.org} · {p.type}</small></span></button>
            <span><StatusPill status={p.status} /></span><span className="owner"><i>{p.owner[0]}</i>{p.owner}</span>
            <span className="dual-progress"><b>{p.actual}%</b><ProgressBar value={p.actual} tone={p.status} /><small>计划 {p.plan}%</small></span>
            <span className={p.actual - p.plan < -5 ? "negative" : "positive"}>{p.actual - p.plan > 0 ? "+" : ""}{p.actual - p.plan} pp</span>
            <span className={`risk ${p.risk === "高" ? "high" : p.risk === "中" ? "medium" : "low"}`}>{p.risk}风险</span><span>07-17 16:4{projectData.indexOf(p)}</span><button className="more" aria-label="更多">•••</button>
          </div>)}
        </div>
        <div className="pagination"><span>共 44 条，每页 10 条</span><div><button>‹</button><button className="active">1</button><button>2</button><button>3</button><button>4</button><button>5</button><button>›</button></div></div>
      </section>
    </div>
  </div>;
}

function ProjectDetail({ onNavigate, projectData = projects }: { onNavigate: (v: View) => void; projectData?: typeof projects }) {
  const [tab, setTab] = useState("节点计划");
  const [expanded, setExpanded] = useState<number | null>(3);
  const currentProject = projectData.find((project) => project.id === "P02") ?? projects[1];
  return <div className="workspace-page">
    <WorkspaceHeader title="项目详情" subtitle="项目台账 / 智慧采购平台" onNavigate={onNavigate} />
    <div className="page-content project-detail">
      <button className="back-link" onClick={() => onNavigate("portfolio")}>← 返回项目总览</button>
      <section className="project-hero">
        <div className="project-identity"><div className="project-code">采</div><div><div><StatusPill status="red" /><span className="project-tag">核心系统</span><span className="project-tag">关键项目</span></div><h2>智慧采购平台</h2><p>项目经理 李程　·　供应链数智组　·　2026-02-01 至 2026-10-31</p></div></div>
        <div className="hero-metrics"><div><small>健康度</small><strong className="red-text">63</strong><span>/100</span></div><div><small>计划进度</small><strong>68%</strong></div><div><small>实际进度</small><strong>53%</strong></div><div><small>进度偏差</small><strong className="red-text">-15pp</strong></div></div>
        <div className="hero-actions"><button className="outline-button">导出报告</button><button className="primary-button" onClick={() => onNavigate("report")}>更新本周进度</button></div>
      </section>
      <section className="score-explain">
        <div className="score-ring"><strong>63</strong><span>综合健康度</span></div><div className="score-copy"><h3>项目红色：关键节点触发一票否决</h3><p>基础分 100，当前累计扣分 37 分。所有扣分均可追溯至节点、风险或数据更新记录。</p><div className="deductions"><span>进度落后 <b>-20</b></span><span>关键节点红灯 <b>-20</b></span><span>开放高风险 <b>-15</b></span><span className="offset">重复项封顶 <b>+18</b></span></div></div><button className="text-button">查看评分明细 →</button>
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

function WeeklyReport({ onNavigate, onDataChanged }: { onNavigate: (v: View) => void; onDataChanged: () => Promise<void> }) {
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
        const project = data.projects?.find((item) => item.id === "P02");
        if (project) {
          setSystemProgress(project.actual);
          setDeclared(project.declared);
        }
      })
      .catch(() => undefined);
  }, []);

  async function submitWeeklyReport() {
    setSubmitting(true);
    setSubmitError("");
    try {
      const response = await fetch("/api/projects/P02/weekly-reports", {
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
    <WorkspaceHeader title="周度进度填报" subtitle="2026年第30周 · 填报截止 07月24日 17:00" onNavigate={onNavigate} />
    <div className="page-content report-page">
      <div className="report-top"><div><button className="back-link" onClick={() => onNavigate("project")}>← 返回项目详情</button><h2>智慧采购平台</h2><p>本周进展填报 · 数据将进入下一次周度快照</p></div><div className="save-state"><span>草稿已自动保存</span><i /> 14:38</div></div>
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

function PmoPage({ onNavigate, onDataChanged }: { onNavigate: (v: View) => void; onDataChanged: () => Promise<void> }) {
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
    <WorkspaceHeader title="PMO 管理中心" subtitle="统一规则、治理数据、锁定管理口径" onNavigate={onNavigate} />
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
          <div className="snapshot-table"><div className="table-head"><span>周期</span><span>版本</span><span>项目数</span><span>数据完整度</span><span>锁定时间</span><span>操作人</span><span>状态</span><span /></div>{[["第29周","V1","44","100%","07-17 17:00","系统自动"],["第28周","V2","44","100%","07-10 18:26","周航"],["第27周","V1","42","97.6%","07-03 17:00","系统自动"]].map((r,i)=><div className="table-row" key={r[0]}>{r.map(c=><span key={c}>{c}</span>)}<span><StatusPill status="green" /></span><button>查看</button></div>)}</div>
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
      {(tab === "节点模板" || tab === "预警规则") && <section className="content-card placeholder-panel"><div className="placeholder-icon">{tab === "节点模板" ? "▦" : "⚙"}</div><h2>{tab}</h2><p>{tab === "节点模板" ? "统一节点模板包含7个标准节点、权重及关键节点标识，项目可标记不适用或申请新增。" : "当前生效规则 V3：普通节点 3/7 天，关键节点 0/3 天；综合评分阈值 85/70。"}</p><button className="primary-button">编辑配置</button></section>}
    </div>
    {locked && <div className="toast"><span>✓</span><div><strong>第30周快照已锁定</strong><p>管理大屏已切换至最新数据。</p></div></div>}
  </div>;
}

export default function Home() {
  const [view, setView] = useState<View>("cockpit");
  const [projectData, setProjectData] = useState(projects);
  const [dataState, setDataState] = useState<"loading" | "ready" | "fallback">("loading");
  const navigate = (next: View) => { setView(next); window.scrollTo({ top: 0, behavior: "smooth" }); };

  async function refreshData() {
    try {
      const response = await fetch("/api/bootstrap", { cache: "no-store" });
      if (!response.ok) throw new Error("data unavailable");
      const data = (await response.json()) as { projects?: typeof projects };
      if (data.projects?.length) setProjectData(data.projects);
      setDataState("ready");
    } catch {
      setDataState("fallback");
    }
  }

  useEffect(() => {
    void refreshData();
  }, []);

  if (view === "cockpit") return <><Cockpit onNavigate={navigate} projectData={projectData} />{dataState === "fallback" && <div className="data-banner">当前显示离线演示数据，数据服务恢复后将自动同步。</div>}</>;
  return <div className="app-shell"><Sidebar view={view} onNavigate={navigate} /><div className="workspace">{view === "portfolio" && <Portfolio onNavigate={navigate} projectData={projectData} />}{view === "project" && <ProjectDetail onNavigate={navigate} projectData={projectData} />}{view === "report" && <WeeklyReport onNavigate={navigate} onDataChanged={refreshData} />}{view === "pmo" && <PmoPage onNavigate={navigate} onDataChanged={refreshData} />}</div></div>;
}
