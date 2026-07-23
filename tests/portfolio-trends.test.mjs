import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildPortfolioTrends,
  portfolioTrendCsv,
} from "../lib/portfolio-trends.ts";

function project(id, status, planProgress, actualProgress) {
  return {
    id,
    code: id,
    name: id === "P1" ? "采购平台" : "数据平台",
    ownerName: id === "P1" ? "负责人甲" : "负责人乙",
    ownerEmail: `${id.toLowerCase()}@example.com`,
    org: id === "P1" ? "供应链组" : "数据组",
    type: id === "P1" ? "业务平台" : "数据平台",
    score: status === "red" ? 65 : status === "yellow" ? 78 : 90,
    status,
    planProgress,
    actualProgress,
  };
}

function milestone(projectId, status, deviationDays) {
  return {
    projectId,
    templateId: 6,
    name: "开发完成",
    sequence: 6,
    applicable: true,
    status,
    deviationDays,
  };
}

function snapshot(weekKey, version, projects, milestones, completeness = 90) {
  return {
    weekKey,
    version,
    completeness,
    lockedAt: `${weekKey.slice(0, 4)}-01-01T09:00:00.000Z`,
    payloadJson: JSON.stringify({ projects, milestones }),
  };
}

const snapshots = [
  snapshot(
    "2026-W01",
    1,
    [project("P1", "yellow", 30, 25), project("P2", "green", 35, 36)],
    [milestone("P1", "yellow", 3), milestone("P2", "green", 0)],
    80,
  ),
  snapshot(
    "2026-W02",
    1,
    [project("P1", "red", 45, 34), project("P2", "red", 48, 39)],
    [milestone("P1", "red", 8), milestone("P2", "red", 6)],
    85,
  ),
  snapshot(
    "2026-W03",
    2,
    [project("P1", "red", 60, 46), project("P2", "green", 62, 63)],
    [milestone("P1", "red", 11), milestone("P2", "green", 0)],
    100,
  ),
];

test("measures new-red, recovery and persistent-red transitions across snapshots", () => {
  const result = buildPortfolioTrends({ snapshots });

  assert.equal(result.points.length, 3);
  assert.equal(result.points[0].newRed, 0);
  assert.equal(result.points[1].newRed, 2);
  assert.equal(result.points[2].recovered, 1);
  assert.equal(result.points[2].persistentRed, 1);
  assert.equal(result.summary.newRedTotal, 2);
  assert.equal(result.summary.recoveredTotal, 1);
  assert.equal(result.summary.chronicRedProjects, 1);
  assert.equal(result.summary.latestCompleteness, 100);
});

test("ranks chronic milestone bottlenecks and volatile projects", () => {
  const result = buildPortfolioTrends({ snapshots });
  const bottleneck = result.chronicBottlenecks[0];

  assert.equal(bottleneck.name, "开发完成");
  assert.equal(bottleneck.exposureCount, 6);
  assert.equal(bottleneck.redOccurrences, 3);
  assert.equal(bottleneck.redRate, 50);
  assert.equal(bottleneck.affectedWeekCount, 3);
  assert.equal(result.volatileProjects[0].id, "P1");
  assert.equal(result.volatileProjects[0].redWeeks, 2);
  assert.equal(result.volatileProjects[0].newRedEntries, 1);
});

test("applies stable portfolio dimensions before calculating transitions", () => {
  const result = buildPortfolioTrends({
    snapshots,
    filters: { org: "数据组" },
  });

  assert.equal(result.summary.latestProjectCount, 1);
  assert.equal(result.points[1].newRed, 1);
  assert.equal(result.points[2].recovered, 1);
  assert.deepEqual(
    [...new Set(result.projectHistory.map((row) => row.id))],
    ["P2"],
  );
});

test("uses the latest health filter as a fixed cohort for historical comparison", () => {
  const result = buildPortfolioTrends({
    snapshots,
    filters: { status: "red" },
  });

  assert.equal(result.summary.latestProjectCount, 1);
  assert.deepEqual(
    [...new Set(result.projectHistory.map((row) => row.id))],
    ["P1"],
  );
  assert.equal(result.points[1].newRed, 1);
  assert.equal(result.points[2].persistentRed, 1);
});

test("exports one auditable row per snapshot and project", () => {
  const result = buildPortfolioTrends({ snapshots });
  const csv = portfolioTrendCsv(result.projectHistory);

  assert.match(csv, /^快照周期,快照版本,项目编码/);
  assert.equal(csv.split("\r\n").length, 7);
  assert.match(csv, /2026-W02,V1,P1,采购平台,供应链组,业务平台,负责人甲,红色/);
});

test("serves history exclusively from latest locked snapshot versions", async () => {
  const [route, component, css] = await Promise.all([
    readFile(
      new URL(
        "../app/api/portfolio/analytics/trends/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../app/portfolio-trends.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(route, /getRequestIdentity/);
  assert.match(route, /eq\(snapshots\.status, "locked"\)/);
  assert.match(route, /latestByWeek/);
  assert.match(route, /portfolioTrendCsv/);
  assert.match(component, /跨周期态势与事后度量/);
  assert.match(component, /本期新转红 \/ 恢复/);
  assert.match(component, /持续性节点瓶颈/);
  assert.match(component, /导出历史明细/);
  assert.match(css, /history-status-bar/);
  assert.match(css, /volatile-list/);
});
