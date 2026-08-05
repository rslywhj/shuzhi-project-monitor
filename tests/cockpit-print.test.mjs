import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  paginateMatrixPrintRows,
  paginateTimelinePrintRows,
  printBodyHeightMm,
  timelinePrintRowHeightMm,
} from "../lib/cockpit-print.ts";

function timelineRow(id, markerCount = 2) {
  return {
    id,
    markers: Array.from({ length: markerCount }, (_, index) => ({
      monthKey: "2026-08",
      key: `${id}-${index}`,
    })),
  };
}

test("paginates A4 cockpit rows by active font scale and content height", () => {
  const rows = Array.from({ length: 10 }, (_, index) =>
    timelineRow(index + 1),
  );
  assert.deepEqual(
    paginateTimelinePrintRows(rows, 1).map((page) => page.length),
    [10],
  );
  assert.deepEqual(
    paginateTimelinePrintRows(rows, 2).map((page) => page.length),
    [4, 4, 2],
  );
  assert.deepEqual(
    paginateMatrixPrintRows(rows, 2).map((page) => page.length),
    [4, 4, 2],
  );
  assert(printBodyHeightMm(2) < printBodyHeightMm(1));
  assert(
    timelinePrintRowHeightMm(timelineRow("dense", 4), 1) >
      timelinePrintRowHeightMm(timelineRow("normal", 2), 1),
  );
  const actualDateRow = timelineRow("actual-date", 2);
  actualDateRow.markers.forEach((marker) => {
    marker.dateLabel = "实际完成";
    marker.dateValue = "2026-08-19";
  });
  assert(
    timelinePrintRowHeightMm(actualDateRow, 1) >
      timelinePrintRowHeightMm(timelineRow("normal", 2), 1),
  );
});

test("prints the live timeline legend and scales every PDF text surface", async () => {
  const [component, css] = await Promise.all([
    readFile(new URL("../app/cockpit-print-report.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(component, /◇ 计划/);
  assert.match(component, /● 实际/);
  assert.match(component, /▲ 预测/);
  assert.match(component, /■ 逾期/);
  assert.match(component, /paginateTimelinePrintRows\(rows, fontScale\)/);
  assert.match(component, /timelinePrintRowHeightMm\(row, fontScale\)/);
  assert.match(component, /marker\.dateLabel.*marker\.dateValue/);
  assert.match(css, /--print-font-scale/);
  assert.match(css, /font-size:calc\(14pt \* var\(--print-font-scale,1\)\)/);
  assert.match(css, /\.cockpit-print-page>footer\{display:flex/);
  assert.doesNotMatch(css, /\.cockpit-print-page>footer\{position:absolute/);
});
