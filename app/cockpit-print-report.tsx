"use client";

import { paginatePrintRows } from "@/lib/biweekly-plan";

type PrintStatus = "green" | "yellow" | "red" | "na";

export type TimelinePrintMonth = {
  key: string;
  label: string;
  shortLabel: string;
  year: number;
  isCurrent: boolean;
};

export type TimelinePrintMarker = {
  key: string;
  monthKey: string;
  label: string;
  symbol: string;
  status: PrintStatus;
  critical: boolean;
};

export type TimelinePrintRow = {
  id: string;
  name: string;
  owner: string;
  org: string;
  status: PrintStatus;
  score: number;
  markers: TimelinePrintMarker[];
};

export type MatrixPrintRow = {
  id: string;
  name: string;
  owner: string;
  org: string;
  status: PrintStatus;
  score: number;
  cells: Array<{
    status: PrintStatus;
    completion: number | null;
    deviationDays: number | null;
  }>;
};

const statusLabel: Record<PrintStatus, string> = {
  green: "正常",
  yellow: "预警",
  red: "严重",
  na: "不适用",
};
const statusSymbol: Record<PrintStatus, string> = {
  green: "●",
  yellow: "▲",
  red: "■",
  na: "—",
};

export function triggerCockpitPrint() {
  const run = () => window.setTimeout(() => window.print(), 80);
  if (document.fullscreenElement) {
    void document.exitFullscreen().finally(run);
  } else {
    run();
  }
}

function ReportPage({
  children,
  title,
  subtitle,
  snapshot,
  filters,
  page,
  pageCount,
}: {
  children: React.ReactNode;
  title: string;
  subtitle: string;
  snapshot: string;
  filters: string;
  page: number;
  pageCount: number;
}) {
  return (
    <section className="cockpit-print-page">
      <header>
        <div><span>管理数智军团 · 统建项目进度监控</span><h1>{title}</h1><p>{subtitle}</p></div>
        <aside><strong>{snapshot}</strong><small>{filters}</small></aside>
      </header>
      {children}
      <footer><span>灯色同时使用颜色、文字和形状：● 正常　▲ 预警　■ 严重　— 不适用</span><b>第 {page} / {pageCount} 页</b></footer>
    </section>
  );
}

export function TimelinePrintReport({
  rows,
  months,
  snapshot,
  filters,
}: {
  rows: TimelinePrintRow[];
  months: TimelinePrintMonth[];
  snapshot: string;
  filters: string;
}) {
  const pages = paginatePrintRows(rows, 10);
  return (
    <div className="cockpit-print-root" aria-hidden="true">
      {pages.map((pageRows, pageIndex) => (
        <ReportPage key={pageIndex} title="项目里程碑时间轴" subtitle={`${months[0]?.label ?? "—"} 至 ${months.at(-1)?.label ?? "—"} · 当前筛选共 ${rows.length} 个项目`} snapshot={snapshot} filters={filters} page={pageIndex + 1} pageCount={pages.length}>
          <table className="cockpit-print-table timeline">
            <thead><tr><th>项目 / 健康度</th>{months.map((month) => <th key={month.key} className={month.isCurrent ? "current" : ""}>{month.year}<br/><b>{month.shortLabel}</b></th>)}</tr></thead>
            <tbody>{pageRows.length ? pageRows.map((row) => <tr key={row.id}><th><strong>{statusSymbol[row.status]} {row.name}</strong><small>{statusLabel[row.status]} · {row.score}分 · {row.owner} · {row.org}</small></th>{months.map((month) => { const markers = row.markers.filter((marker) => marker.monthKey === month.key); return <td key={month.key} className={month.isCurrent ? "current" : ""}>{markers.length ? markers.map((marker) => <span className={`print-marker ${marker.status}`} key={marker.key}>{marker.symbol} {marker.label}{marker.critical ? " ◆" : ""}</span>) : <i>—</i>}</td>; })}</tr>) : <tr><td colSpan={months.length + 1}>当前筛选条件下暂无项目</td></tr>}</tbody>
          </table>
        </ReportPage>
      ))}
    </div>
  );
}

export function MatrixPrintReport({
  rows,
  milestones,
  snapshot,
  filters,
}: {
  rows: MatrixPrintRow[];
  milestones: string[];
  snapshot: string;
  filters: string;
}) {
  const pages = paginatePrintRows(rows, 8);
  return (
    <div className="cockpit-print-root" aria-hidden="true">
      {pages.map((pageRows, pageIndex) => (
        <ReportPage key={pageIndex} title="项目 × 标准节点态势矩阵" subtitle={`当前筛选共 ${rows.length} 个项目 · ${milestones.length} 个标准节点`} snapshot={snapshot} filters={filters} page={pageIndex + 1} pageCount={pages.length}>
          <table className="cockpit-print-table matrix">
            <thead><tr><th>项目 / 健康度</th>{milestones.map((milestone, index) => <th key={`${milestone}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><br/>{milestone}</th>)}</tr></thead>
            <tbody>{pageRows.length ? pageRows.map((row) => <tr key={row.id}><th><strong>{statusSymbol[row.status]} {row.name}</strong><small>{statusLabel[row.status]} · {row.score}分<br/>{row.owner} · {row.org}</small></th>{row.cells.map((cell, index) => <td className={cell.status} key={index}><b>{statusSymbol[cell.status]}</b><small>{cell.status === "na" ? "N/A" : cell.deviationDays && cell.deviationDays > 0 ? `+${cell.deviationDays}天` : `${cell.completion ?? 0}%`}</small></td>)}</tr>) : <tr><td colSpan={milestones.length + 1}>当前筛选条件下暂无项目</td></tr>}</tbody>
          </table>
        </ReportPage>
      ))}
    </div>
  );
}
