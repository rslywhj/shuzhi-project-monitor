import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildPortfolioAnalytics,
  portfolioAnalyticsCsv,
} from "../lib/portfolio-analytics.ts";

const projects = [
  {
    id: "P1",
    code: "P1",
    name: "采购平台",
    ownerEmail: "owner-a@example.com",
    ownerName: "负责人甲",
    org: "供应链组",
    type: "业务平台",
    score: 62,
    status: "red",
    planProgress: 60,
    actualProgress: 40,
    currentBaselineVersion: 2,
  },
  {
    id: "P2",
    code: "P2",
    name: "数据平台",
    ownerEmail: "owner-b@example.com",
    ownerName: "负责人乙",
    org: "数据组",
    type: "数据平台",
    score: 92,
    status: "green",
    planProgress: 50,
    actualProgress: 55,
    currentBaselineVersion: 1,
  },
];

const milestones = [
  {
    id: 1,
    projectId: "P1",
    templateId: 1,
    name: "开发完成",
    sequence: 1,
    applicable: true,
    status: "red",
    deviationDays: 5,
    plannedFinish: "2026-01-15",
  },
  {
    id: 2,
    projectId: "P2",
    templateId: 1,
    name: "开发完成",
    sequence: 1,
    applicable: true,
    status: "green",
    deviationDays: 0,
    plannedFinish: "2026-01-10",
  },
];

const originalBaselines = [
  {
    projectId: "P1",
    milestoneJson: JSON.stringify([
      {
        templateId: 1,
        name: "开发完成",
        sequence: 1,
        plannedFinish: "2026-01-10",
        applicable: true,
      },
    ]),
  },
  {
    projectId: "P2",
    milestoneJson: JSON.stringify([
      {
        templateId: 1,
        name: "开发完成",
        sequence: 1,
        plannedFinish: "2026-01-10",
        applicable: true,
      },
    ]),
  },
];

test("builds explainable portfolio dimensions, bottlenecks and baseline drift", () => {
  const result = buildPortfolioAnalytics({
    projects,
    milestones,
    originalBaselines,
  });

  assert.deepEqual(result.summary, {
    projectCount: 2,
    green: 1,
    yellow: 0,
    red: 1,
    avgScore: 77,
    avgPlanProgress: 55,
    avgActualProgress: 47.5,
    avgProgressGap: 7.5,
    delayedMilestoneCount: 1,
    avgLatestFinishDriftDays: 2.5,
  });
  assert.equal(result.dimensions.org[0].name, "供应链组");
  assert.equal(result.dimensions.org[0].red, 1);
  assert.equal(result.bottlenecks[0].name, "开发完成");
  assert.equal(result.bottlenecks[0].delayedRate, 50);
  assert.equal(result.bottlenecks[0].avgDelayDays, 5);
  assert.equal(result.baselineDrift[0].id, "P1");
  assert.equal(result.baselineDrift[0].latestFinishDriftDays, 5);
  assert.equal(result.baselineDrift[0].cumulativeBaselineDriftDays, 5);
});

test("applies portfolio filters before aggregating every analysis section", () => {
  const result = buildPortfolioAnalytics({
    projects,
    milestones,
    originalBaselines,
    filters: { org: "数据组", status: "green" },
  });

  assert.equal(result.summary.projectCount, 1);
  assert.equal(result.summary.green, 1);
  assert.equal(result.summary.red, 0);
  assert.equal(result.bottlenecks[0].applicableCount, 1);
  assert.equal(result.bottlenecks[0].delayedCount, 0);
  assert.deepEqual(result.baselineDrift.map((row) => row.id), ["P2"]);
  assert.deepEqual(result.filterOptions.orgs, ["供应链组", "数据组"]);
});

test("matches legacy custom milestones by sequence and name when ids differ", () => {
  const result = buildPortfolioAnalytics({
    projects: [projects[0]],
    milestones: [
      {
        ...milestones[0],
        id: 99,
        templateId: null,
        name: "数据迁移",
        sequence: 13,
        plannedFinish: "2026-02-20",
      },
    ],
    originalBaselines: [
      {
        projectId: "P1",
        milestoneJson: JSON.stringify([
          {
            milestoneId: 7,
            templateId: null,
            name: "数据迁移",
            sequence: 13,
            plannedFinish: "2026-02-10",
          },
        ]),
      },
    ],
  });

  assert.equal(result.baselineDrift[0].changedMilestoneCount, 1);
  assert.equal(result.baselineDrift[0].latestFinishDriftDays, 10);
});

test("exports the filtered project analysis as spreadsheet-safe UTF-8 CSV", () => {
  const result = buildPortfolioAnalytics({
    projects: [{ ...projects[0], name: '采购,"升级"平台' }],
    milestones: [milestones[0]],
    originalBaselines: [originalBaselines[0]],
  });
  const csv = portfolioAnalyticsCsv(result.projects);

  assert.match(csv, /^项目编码,项目名称,所属组织/);
  assert.match(csv, /"采购,""升级""平台"/);
  assert.match(csv, /红色,62,60,40,20,V2,1,5,5,1,1/);
});

test("exposes authenticated JSON analytics and CSV download from one API", async () => {
  const [route, page, analyticsPage, css] = await Promise.all([
    readFile(
      new URL("../app/api/portfolio/analytics/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/portfolio-analytics.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(route, /getRequestIdentity/);
  assert.match(route, /buildPortfolioAnalytics/);
  assert.match(route, /format.*csv/);
  assert.match(route, /content-disposition/);
  assert.match(page, /项目组合分析/);
  assert.match(analyticsPage, /标准节点瓶颈排行/);
  assert.match(analyticsPage, /原始基线累计偏差/);
  assert.match(analyticsPage, /导出分析报表/);
  assert.match(css, /analytics-summary/);
  assert.match(css, /baseline-drift-card/);
});
