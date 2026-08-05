import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateProjectStage,
  latestConfirmedPrimary,
  shouldShowPrimaryStageIndicator,
} from "../lib/project-stage.ts";

function milestone(overrides = {}) {
  return {
    id: 1,
    sequence: 1,
    applicable: true,
    critical: false,
    completion: 0,
    plannedStart: "2026-08-01",
    plannedFinish: "2026-08-20",
    actualFinish: null,
    executionStatus: "not_started",
    ...overrides,
  };
}

test("uses a valid manager-confirmed active milestone as the primary stage", () => {
  const result = calculateProjectStage({
    projectId: "P01",
    asOfDate: "2026-08-05",
    confirmedPrimaryMilestoneId: 2,
    milestones: [
      milestone({ id: 1, completion: 40, executionStatus: "in_progress" }),
      milestone({
        id: 2,
        sequence: 2,
        completion: 20,
        executionStatus: "in_progress",
      }),
    ],
  });
  assert.equal(result.primaryMilestoneId, 2);
  assert.equal(result.primaryBasis, "manager_confirmed");
  assert.deepEqual(result.parallelMilestoneIds, [1]);
});

test("ranks active critical and overdue milestones before ordinary work", () => {
  const result = calculateProjectStage({
    projectId: "P02",
    asOfDate: "2026-08-05",
    milestones: [
      milestone({ id: 1, completion: 60, executionStatus: "in_progress" }),
      milestone({
        id: 2,
        sequence: 2,
        critical: true,
        completion: 10,
        plannedFinish: "2026-08-30",
        executionStatus: "in_progress",
      }),
      milestone({
        id: 3,
        sequence: 3,
        completion: 10,
        plannedFinish: "2026-07-30",
        executionStatus: "paused",
      }),
    ],
  });
  assert.equal(result.primaryMilestoneId, 2);
  assert.equal(result.primaryBasis, "system_recommended");
  assert.deepEqual(result.parallelMilestoneIds, [1, 3]);
});

test("does not mislabel scheduled but unstarted work as an active stage", () => {
  const result = calculateProjectStage({
    projectId: "P03",
    asOfDate: "2026-08-05",
    milestones: [
      milestone({ id: 1, plannedStart: "2026-07-20", plannedFinish: "2026-08-01" }),
      milestone({ id: 2, sequence: 2, plannedStart: "2026-08-10" }),
    ],
  });
  assert.equal(result.state, "not_started");
  assert.equal(result.primaryMilestoneId, null);
  assert.deepEqual(result.shouldStartMilestoneIds, [1]);
  assert.equal(result.nextMilestoneId, 2);
});

test("identifies unfinished predecessors as carryovers", () => {
  const result = calculateProjectStage({
    projectId: "P04",
    asOfDate: "2026-08-05",
    milestones: [
      milestone({ id: 1, plannedFinish: "2026-07-01" }),
      milestone({
        id: 2,
        sequence: 2,
        completion: 50,
        executionStatus: "in_progress",
      }),
    ],
  });
  assert.deepEqual(result.carryoverMilestoneIds, [1]);
  assert.deepEqual(result.overdueCarryoverMilestoneIds, [1]);
});

test("closes the stage when all milestones or the project lifecycle are complete", () => {
  const allDone = calculateProjectStage({
    projectId: "P05",
    asOfDate: "2026-08-05",
    milestones: [
      milestone({
        completion: 100,
        actualFinish: "2026-08-03",
        executionStatus: "completed",
      }),
    ],
  });
  assert.equal(allDone.state, "completed");
  assert.equal(allDone.primaryMilestoneId, null);

  const forcedClosure = calculateProjectStage({
    projectId: "P06",
    asOfDate: "2026-08-05",
    lifecycleStatus: "completed",
    milestones: [
      milestone({ completion: 20, executionStatus: "in_progress" }),
    ],
  });
  assert.equal(forcedClosure.state, "completed");
  assert.deepEqual(forcedClosure.activeMilestoneIds, []);
});

test("reads only the latest submitted primary confirmation per project", () => {
  const result = latestConfirmedPrimary([
    { projectId: "P01", weekKey: "2026-W31", status: "submitted", primaryMilestoneId: 1 },
    { projectId: "P01", weekKey: "2026-W32", status: "draft", primaryMilestoneId: 2 },
    { projectId: "P02", weekKey: "2026-W32", status: "locked", primaryMilestoneId: 4 },
  ]);
  assert.equal(result.get("P01"), 1);
  assert.equal(result.get("P02"), 4);
});

test("shows the primary-stage indicator only when multiple stage nodes need distinction", () => {
  assert.equal(
    shouldShowPrimaryStageIndicator({
      primaryMilestoneId: 2,
      parallelMilestoneIds: [],
      carryoverMilestoneIds: [],
    }),
    false,
  );
  assert.equal(
    shouldShowPrimaryStageIndicator({
      primaryMilestoneId: 2,
      parallelMilestoneIds: [3],
      carryoverMilestoneIds: [],
    }),
    true,
  );
  assert.equal(
    shouldShowPrimaryStageIndicator({
      primaryMilestoneId: 2,
      parallelMilestoneIds: [1],
      carryoverMilestoneIds: [1],
    }),
    true,
  );
});
