import { normalizeFontScale } from "./theme.ts";

export type TimelinePrintHeightRow = {
  markers: Array<{ monthKey: string; dateValue?: string | null }>;
};

const PRINT_BODY_BASE_HEIGHT_MM = 142;
const PRINT_SCALE_HEIGHT_PENALTY_MM = 10;
const TIMELINE_BASE_ROW_HEIGHT_MM = 13.5;
const TIMELINE_MARKER_HEIGHT_MM = 5.8;
const TIMELINE_MARKER_WITH_DATE_HEIGHT_MM = 7.4;
const MATRIX_BASE_ROW_HEIGHT_MM = 16;

export function printBodyHeightMm(fontScale: number) {
  const scale = normalizeFontScale(fontScale);
  return PRINT_BODY_BASE_HEIGHT_MM -
    (scale - 1) * PRINT_SCALE_HEIGHT_PENALTY_MM;
}

export function timelinePrintRowHeightMm(
  row: TimelinePrintHeightRow,
  fontScale: number,
) {
  const scale = normalizeFontScale(fontScale);
  const markerHeightByMonth = new Map<string, number>();
  for (const marker of row.markers) {
    markerHeightByMonth.set(
      marker.monthKey,
      (markerHeightByMonth.get(marker.monthKey) ?? 0) +
        (marker.dateValue
          ? TIMELINE_MARKER_WITH_DATE_HEIGHT_MM
          : TIMELINE_MARKER_HEIGHT_MM),
    );
  }
  const maximumMarkerHeight = Math.max(
    TIMELINE_MARKER_HEIGHT_MM,
    ...markerHeightByMonth.values(),
  );
  return Number(
    (Math.max(
      TIMELINE_BASE_ROW_HEIGHT_MM,
      maximumMarkerHeight,
    ) * scale).toFixed(2),
  );
}

export function matrixPrintRowHeightMm(fontScale: number) {
  return Number(
    (MATRIX_BASE_ROW_HEIGHT_MM * normalizeFontScale(fontScale)).toFixed(2),
  );
}

export function paginatePrintRowsByHeight<T>(
  rows: T[],
  heightForRow: (row: T) => number,
  heightBudget: number,
): T[][] {
  if (!Number.isFinite(heightBudget) || heightBudget <= 0) {
    throw new Error("打印分页高度必须为正数。");
  }
  if (!rows.length) return [[]];

  const pages: T[][] = [];
  let page: T[] = [];
  let usedHeight = 0;
  for (const row of rows) {
    const rowHeight = heightForRow(row);
    if (!Number.isFinite(rowHeight) || rowHeight <= 0) {
      throw new Error("打印项目行高度必须为正数。");
    }
    if (page.length && usedHeight + rowHeight > heightBudget) {
      pages.push(page);
      page = [];
      usedHeight = 0;
    }
    page.push(row);
    usedHeight += rowHeight;
  }
  if (page.length) pages.push(page);
  return pages;
}

export function paginateTimelinePrintRows<T extends TimelinePrintHeightRow>(
  rows: T[],
  fontScale: number,
) {
  return paginatePrintRowsByHeight(
    rows,
    (row) => timelinePrintRowHeightMm(row, fontScale),
    printBodyHeightMm(fontScale),
  );
}

export function paginateMatrixPrintRows<T>(rows: T[], fontScale: number) {
  return paginatePrintRowsByHeight(
    rows,
    () => matrixPrintRowHeightMm(fontScale),
    printBodyHeightMm(fontScale),
  );
}
