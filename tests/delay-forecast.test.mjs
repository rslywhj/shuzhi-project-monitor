import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildPortfolioDelayForecast,
  DELAY_FORECAST_MODEL_VERSION,
} from "../lib/delay-forecast.ts";

const projects = [
  {
    id: "P1",
    code: "P1",
    name: "采购平台",
    ownerName: "负责人甲",
    org: "供应链组",
    type: "业务平台",
    planProgress: 65,
    actualProgress: 43,
    riskLevel: "high",
  },
  {
    id: "P2",
    code: "P2",
    name: "数据平台",
    ownerName: "负责人乙",
    org: "数据组",
    type: "数据平台",
    planProgress: 48,
    actualProgress: 55,
    riskLevel: "low",
  },
];

const completedMilestones = [1, 2, 3, 4].map((id) => ({
  id,
  projectId: id % 2 ? "P1" : "P2",
  templateId: 6,
  name: "开发完成",
  sequence: 6,
  critical: true,
  applicable: true,
  plannedStart: "2026-01-01",
  plannedFinish: `2026-02-${String(id).padStart(2, "0")}`,
  forecastFinish: null,
  actualFinish:
    id <= 3
      ? `2026-02-${String(id + 6).padStart(2, "0")}`
      : "2026-02-04",
  completion: 100,
  status: id <= 3 ? "red" : "green",
  deviationDays: id <= 3 ? 6 : 0,
}));

const activeMilestones = [
  {
    id: 10,
    projectId: "P1",
    templateId: 6,
    name: "开发完成",
    sequence: 6,
    critical: true,
    applicable: true,
    plannedStart: "2026-06-01",
    plannedFinish: "2026-07-20",
    forecastFinish: "2026-07-31",
    actualFinish: null,
    completion: 38,
    status: "yellow",
    deviationDays: 11,
  },
  {
    id: 11,
    projectId: "P2",
    templateId: 6,
    name: "开发完成",
    sequence: 6,
    critical: true,
    applicable: true,
    plannedStart: "2026-06-01",
    plannedFinish: "2026-07-20",
    forecastFinish: "2026-07-18",
    actualFinish: null,
    completion: 72,
    status: "green",
    deviationDays: 0,
  },
];

const reports = [
  {
    projectId: "P1",
    weekKey: "2026-W26",
    systemProgress: 43,
    declaredProgress: 45,
    status: "submitted",
    submittedAt: "2026-06-28T10:00:00Z",
  },
  {
    projectId: "P1",
    weekKey: "2026-W25",
    systemProgress: 42.5,
    declaredProgress: 43,
    status: "submitted",
    submittedAt: "2026-06-21T10:00:00Z",
  },
  {
    projectId: "P2",
    weekKey: "2026-W26",
    systemProgress: 55,
    declaredProgress: 55,
    status: "submitted",
    submittedAt: "2026-06-28T10:00:00Z",
  },
  {
    projectId: "P2",
    weekKey: "2026-W25",
    systemProgress: 48,
    declaredProgress: 48,
    status: "locked",
    submittedAt: "2026-06-21T10:00:00Z",
  },
];

test("predicts a future high-probability delay before the node turns red", () => {
  const result = buildPortfolioDelayForecast({
    projects,
    milestones: [...completedMilestones, ...activeMilestones],
    weeklyReports: reports,
    risks: [
      {
        projectId: "P1",
        level: "high",
        status: "open",
      },
    ],
    actions: [
      {
        projectId: "P1",
        status: "overdue",
        recoveryDate: "2026-06-25",
      },
    ],
    asOfDate: "2026-07-01",
  });

  const forecast = result.projects.find((row) => row.projectId === "P1");
  assert.ok(forecast);
  assert.equal(result.model.version, DELAY_FORECAST_MODEL_VERSION);
  assert.equal(forecast.riskBand, "high");
  assert.equal(forecast.earlyWarning, true);
  assert.ok(forecast.probability >= 65);
  assert.ok(forecast.expectedDelayDays >= 11);
  assert.equal(forecast.topMilestone.name, "开发完成");
  assert.ok(
    forecast.topMilestone.signals.some(
      (signal) => signal.code === "forecast_delay",
    ),
  );
  assert.ok(
    forecast.topMilestone.signals.some(
      (signal) => signal.code === "historical_prior",
    ),
  );
});

test("keeps an ahead-of-plan node below the high-risk threshold", () => {
  const result = buildPortfolioDelayForecast({
    projects,
    milestones: [...completedMilestones, ...activeMilestones],
    weeklyReports: reports,
    risks: [],
    actions: [],
    asOfDate: "2026-07-01",
  });

  const forecast = result.projects.find((row) => row.projectId === "P2");
  assert.ok(forecast);
  assert.notEqual(forecast.riskBand, "high");
  assert.equal(forecast.earlyWarning, false);
  assert.ok(
    forecast.topMilestone.signals.some(
      (signal) => signal.direction === "protective",
    ),
  );
});

test("limits forecast output to the filtered portfolio scope while retaining priors", () => {
  const result = buildPortfolioDelayForecast({
    projects,
    milestones: [...completedMilestones, ...activeMilestones],
    weeklyReports: reports,
    risks: [],
    actions: [],
    asOfDate: "2026-07-01",
    scopeProjectIds: new Set(["P2"]),
  });

  assert.deepEqual(
    result.projects.map((project) => project.projectId),
    ["P2"],
  );
  assert.equal(result.summary.analyzedProjectCount, 1);
  assert.equal(result.model.historicalSampleCount, 4);
});

test("integrates forecasts with analytics export, locked snapshots and the UI", async () => {
  const [route, snapshotService, analyticsPage, css, analyticsLibrary] =
    await Promise.all([
      readFile(
        new URL("../app/api/portfolio/analytics/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../lib/snapshot-service.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../app/portfolio-analytics.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
      readFile(
        new URL("../lib/portfolio-analytics.ts", import.meta.url),
        "utf8",
      ),
    ]);

  assert.match(route, /buildPortfolioDelayForecast/);
  assert.match(route, /delayForecast/);
  assert.match(snapshotService, /predictedDelays/);
  assert.match(snapshotService, /delayForecast/);
  assert.match(analyticsPage, /节点延期概率预警/);
  assert.match(analyticsPage, /概率驱动因素/);
  assert.match(analyticsPage, /提前预警/);
  assert.match(css, /delay-forecast-card/);
  assert.match(analyticsLibrary, /预测延期概率/);
});
