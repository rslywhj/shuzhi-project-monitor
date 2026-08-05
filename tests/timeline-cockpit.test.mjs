import assert from "node:assert/strict";
import test from "node:test";
import {
  addTimelineMonths,
  buildProjectTimelineMarkers,
  buildTimelineKpis,
  buildTimelineMonths,
  compactTimelineDate,
  markerMatchesKpi,
  timelineProjectIsVisible,
  unfinishedPlannedFinish,
} from "../lib/timeline-cockpit.ts";

function milestone(overrides = {}) {
  return {
    id: 1,
    name: "需求确认",
    sequence: 3,
    status: "green",
    completion: 60,
    plannedFinish: "2026-01-15",
    forecastFinish: "2026-02-10",
    actualFinish: null,
    deviationDays: 0,
    reason: "",
    applicable: true,
    critical: false,
    custom: false,
    weight: 8,
    ...overrides,
  };
}

function project(overrides = {}) {
  return {
    id: "P01",
    name: "示例项目",
    owner: "张三",
    org: "数字化部",
    type: "管理应用",
    status: "green",
    score: 92,
    lifecycleStatus: "active",
    milestones: [milestone()],
    ...overrides,
  };
}

test("shows a compact planned finish date only for unfinished milestones", () => {
  const unfinished = milestone({ plannedFinish: "2026-08-19" });
  assert.equal(unfinishedPlannedFinish(unfinished), "2026-08-19");
  assert.equal(compactTimelineDate("2026-08-19"), "08-19");
  assert.equal(
    unfinishedPlannedFinish(milestone({ completion: 100 })),
    null,
  );
  assert.equal(
    unfinishedPlannedFinish(
      milestone({ completion: 60, actualFinish: "2026-08-18" }),
    ),
    null,
  );
  assert.equal(
    unfinishedPlannedFinish(
      milestone({ completion: 60, executionStatus: "completed" }),
    ),
    null,
  );
});

test("builds a rolling six-month window from previous month to four months ahead", () => {
  assert.equal(addTimelineMonths("2026-01", -1), "2025-12");
  assert.equal(addTimelineMonths("2026-12", 1), "2027-01");
  assert.deepEqual(
    buildTimelineMonths("2026-01").map((month) => month.key),
    ["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05"],
  );
  assert.equal(
    buildTimelineMonths("2026-01").find((month) => month.isCurrent)?.key,
    "2026-01",
  );
  assert.deepEqual(
    buildTimelineMonths("2026-01", 2).map((month) => month.key),
    ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"],
  );
});

test("merges plan and actual in one month and prefers actual over forecast", () => {
  const months = buildTimelineMonths("2026-01");
  const actualProject = project({
    milestones: [
      milestone({
        completion: 100,
        actualFinish: "2026-01-20",
        forecastFinish: "2026-03-10",
      }),
    ],
  });
  const markers = buildProjectTimelineMarkers(
    actualProject,
    months,
    "2026-01-25",
  );
  assert.equal(markers.length, 1);
  assert.deepEqual(markers[0].roles, ["plan", "actual"]);
  assert.equal(markers.some((marker) => marker.monthKey === "2026-03"), false);
});

test("shows plan and forecast in separate months for unfinished milestones", () => {
  const months = buildTimelineMonths("2026-01");
  const markers = buildProjectTimelineMarkers(
    project(),
    months,
    "2026-01-10",
  );
  assert.deepEqual(
    markers.map((marker) => [marker.monthKey, marker.roles]),
    [
      ["2026-01", ["plan"]],
      ["2026-02", ["forecast"]],
    ],
  );
});

test("carries an old overdue milestone into the current month", () => {
  const months = buildTimelineMonths("2026-07");
  const overdueProject = project({
    milestones: [
      milestone({
        plannedFinish: "2026-03-01",
        forecastFinish: "2026-08-01",
        status: "red",
      }),
    ],
  });
  const markers = buildProjectTimelineMarkers(
    overdueProject,
    months,
    "2026-07-24",
  );
  const carryover = markers.find((marker) => marker.monthKey === "2026-07");
  assert.ok(carryover);
  assert.deepEqual(carryover.roles, ["overdue"]);
  assert.equal(carryover.overdue, true);
  assert.equal(markerMatchesKpi(carryover, "overdue", "2026-07"), true);
});

test("counts overlapping current-month KPIs and critical milestones", () => {
  const critical = milestone({
    critical: true,
    plannedFinish: "2026-07-05",
    actualFinish: "2026-07-12",
    completion: 100,
  });
  const predicted = milestone({
    id: 2,
    name: "上线切换",
    plannedFinish: "2026-06-20",
    forecastFinish: "2026-07-28",
    completion: 80,
    status: "red",
    critical: true,
  });
  const kpis = buildTimelineKpis(
    [project({ milestones: [critical, predicted] })],
    "2026-07",
    "2026-07-24",
  );
  assert.equal(kpis.planned.count, 1);
  assert.equal(kpis.actual.count, 1);
  assert.equal(kpis.forecast.count, 1);
  assert.equal(kpis.overdue.count, 1);
  assert.equal(kpis.planned.criticalCount, 1);
  assert.equal(kpis.forecast.criticalCount, 1);
  assert.deepEqual([...kpis.overdue.projectIds], ["P01"]);
});

test("includes active rows with markers and completed rows with actuals, but excludes archives and blanks", () => {
  const months = buildTimelineMonths("2026-07");
  const actual = milestone({
    plannedFinish: "2026-06-20",
    actualFinish: "2026-07-02",
    completion: 100,
  });
  assert.equal(
    timelineProjectIsVisible(
      project({ lifecycleStatus: "completed", milestones: [actual] }),
      months,
      "2026-07-24",
    ),
    true,
  );
  assert.equal(
    timelineProjectIsVisible(
      project({ lifecycleStatus: "archived", milestones: [actual] }),
      months,
      "2026-07-24",
    ),
    false,
  );
  assert.equal(
    timelineProjectIsVisible(
      project({ milestones: [milestone({ applicable: false })] }),
      months,
      "2026-07-24",
    ),
    false,
  );
});

test("derives a 50-project multi-milestone timeline without expanding the month window", () => {
  const months = buildTimelineMonths("2026-07");
  const projects = Array.from({ length: 50 }, (_, projectIndex) =>
    project({
      id: `P${String(projectIndex + 1).padStart(2, "0")}`,
      name: `规模项目${projectIndex + 1}`,
      milestones: Array.from({ length: 12 }, (_, milestoneIndex) =>
        milestone({
          id: projectIndex * 100 + milestoneIndex + 1,
          sequence: milestoneIndex + 1,
          name: `节点${milestoneIndex + 1}`,
          plannedFinish: `2026-${String(6 + (milestoneIndex % 6)).padStart(2, "0")}-${String(10 + (milestoneIndex % 10)).padStart(2, "0")}`,
          forecastFinish: `2026-${String(6 + (milestoneIndex % 6)).padStart(2, "0")}-25`,
          critical: milestoneIndex % 4 === 0,
        }),
      ),
    }),
  );
  const startedAt = performance.now();
  const markerCount = projects.reduce(
    (sum, row) =>
      sum + buildProjectTimelineMarkers(row, months, "2026-07-24").length,
    0,
  );
  const elapsed = performance.now() - startedAt;
  assert.equal(months.length, 6);
  assert.ok(markerCount >= 600);
  assert.ok(elapsed < 250, `timeline derivation took ${elapsed.toFixed(1)}ms`);
});
