"use client";

import {
  matrixPrintRowHeightMm,
  paginateMatrixPrintRows,
  paginateTimelinePrintRows,
  timelinePrintRowHeightMm,
} from "@/lib/cockpit-print";
import { type CSSProperties } from "react";
import { useTheme } from "./theme-provider";

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
  completion: number;
  dateLabel?: "计划完成" | "实际完成";
  dateValue?: string | null;
};

export type TimelinePrintRow = {
  id: string;
  name: string;
  owner: string;
  org: string;
  status: PrintStatus;
  score: number;
  stageLabel?: string;
  markers: TimelinePrintMarker[];
};

export type MatrixPrintRow = {
  id: string;
  name: string;
  owner: string;
  org: string;
  status: PrintStatus;
  score: number;
  stageLabel?: string;
  cells: Array<{
    status: PrintStatus;
    notStarted?: boolean;
    completion: number | null;
    deviationDays: number | null;
  }>;
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
  legend,
}: {
  children: React.ReactNode;
  title: string;
  subtitle: string;
  snapshot: string;
  filters: string;
  page: number;
  pageCount: number;
  legend: React.ReactNode;
}) {
  return (
    <section className="cockpit-print-page">
      <header>
        <div><span>管理数智军团 · 统建项目进度监控</span><h1>{title}</h1><p>{subtitle}</p></div>
        <aside><strong>{snapshot}</strong><small>{filters}</small></aside>
      </header>
      {children}
      <footer><span>{legend}</span><b>第 {page} / {pageCount} 页</b></footer>
    </section>
  );
}

function TimelinePrintLegend() {
  return <span className="cockpit-print-legend timeline"><i className="plan">◇ 计划</i><i className="actual">● 实际</i><i className="forecast">▲ 预测</i><i className="overdue">■ 逾期</i></span>;
}

function MatrixPrintLegend() {
  return <span className="cockpit-print-legend matrix">灯色同时使用颜色、文字和形状：● 正常　▲ 预警　■ 严重　○ 未开始　— 不适用</span>;
}

function printRootStyle(fontScale: number): CSSProperties {
  return {
    "--print-font-scale": String(fontScale),
    "--print-head-height": `${10 + (fontScale - 1) * 4}mm`,
  } as CSSProperties;
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
  const { fontScale } = useTheme();
  const pages = paginateTimelinePrintRows(rows, fontScale);
  return (
    <div className="cockpit-print-root" aria-hidden="true" style={printRootStyle(fontScale)}>
      {pages.map((pageRows, pageIndex) => (
        <ReportPage key={pageIndex} title="项目里程碑时间轴" subtitle={`${months[0]?.label ?? "—"} 至 ${months.at(-1)?.label ?? "—"} · 当前筛选共 ${rows.length} 个项目`} snapshot={snapshot} filters={filters} page={pageIndex + 1} pageCount={pages.length} legend={<TimelinePrintLegend />}>
          <table className="cockpit-print-table timeline">
            <thead><tr><th>项目 / 健康度</th>{months.map((month) => <th key={month.key} className={month.isCurrent ? "current" : ""}>{month.year}<br/><b>{month.shortLabel}</b></th>)}</tr></thead>
            <tbody>{pageRows.length ? pageRows.map((row) => <tr key={row.id} style={{ "--print-row-height": `${timelinePrintRowHeightMm(row, fontScale)}mm` } as CSSProperties}><th><strong>{row.name}</strong><small>健康度 {row.score}分 · {row.owner} · {row.org}{row.stageLabel ? <><br/>{row.stageLabel}</> : null}</small></th>{months.map((month) => { const markers = row.markers.filter((marker) => marker.monthKey === month.key); return <td key={month.key} className={month.isCurrent ? "current" : ""}>{markers.length ? markers.map((marker) => <span className={`print-marker ${marker.status}`} key={marker.key}><b>{marker.symbol} {marker.label}{marker.critical ? " ◆" : ""}</b><small>进度 {marker.completion}%{marker.dateLabel && marker.dateValue ? ` · ${marker.dateLabel} ${marker.dateValue}` : ""}</small></span>) : <i>—</i>}</td>; })}</tr>) : <tr><td colSpan={months.length + 1}>当前筛选条件下暂无项目</td></tr>}</tbody>
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
  const { fontScale } = useTheme();
  const pages = paginateMatrixPrintRows(rows, fontScale);
  const rowHeight = matrixPrintRowHeightMm(fontScale);
  return (
    <div className="cockpit-print-root" aria-hidden="true" style={printRootStyle(fontScale)}>
      {pages.map((pageRows, pageIndex) => (
        <ReportPage key={pageIndex} title="项目 × 标准节点态势矩阵" subtitle={`当前筛选共 ${rows.length} 个项目 · ${milestones.length} 个标准节点`} snapshot={snapshot} filters={filters} page={pageIndex + 1} pageCount={pages.length} legend={<MatrixPrintLegend />}>
          <table className="cockpit-print-table matrix">
            <thead><tr><th>项目 / 健康度</th>{milestones.map((milestone, index) => <th key={`${milestone}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><br/>{milestone}</th>)}</tr></thead>
            <tbody>{pageRows.length ? pageRows.map((row) => <tr key={row.id} style={{ "--print-row-height": `${rowHeight}mm` } as CSSProperties}><th><strong>{row.name}</strong><small>健康度 {row.score}分<br/>{row.owner} · {row.org}{row.stageLabel ? <><br/>{row.stageLabel}</> : null}</small></th>{row.cells.map((cell, index) => <td className={cell.notStarted ? "not-started" : cell.status} key={index}><b>{cell.notStarted ? "○" : statusSymbol[cell.status]}</b><small>{cell.status === "na" ? "N/A" : cell.notStarted ? "未开始" : cell.deviationDays && cell.deviationDays > 0 ? `+${cell.deviationDays}天` : `${cell.completion ?? 0}%`}</small></td>)}</tr>) : <tr><td colSpan={milestones.length + 1}>当前筛选条件下暂无项目</td></tr>}</tbody>
          </table>
        </ReportPage>
      ))}
    </div>
  );
}
