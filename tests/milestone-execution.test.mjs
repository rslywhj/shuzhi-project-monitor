import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMilestoneExecution } from "../lib/milestone-execution.ts";

function current(overrides = {}) {
  return {
    id: 1,
    sequence: 1,
    applicable: true,
    completion: 0,
    plannedFinish: "2026-08-20",
    executionStatus: "not_started",
    actualStart: null,
    forecastFinish: "2026-08-20",
    actualFinish: null,
    pausedReason: "",
    reason: "",
    ...overrides,
  };
}

test("requires an actual start date for new in-progress submissions", () => {
  assert.throws(
    () =>
      normalizeMilestoneExecution(
        current(),
        { executionStatus: "in_progress", completion: 20 },
        { strict: true },
      ),
    /实际开始日期/,
  );
});

test("normalizes a paused milestone and clears pause data when resumed", () => {
  const paused = normalizeMilestoneExecution(
    current(),
    {
      executionStatus: "paused",
      completion: 30,
      actualStart: "2026-08-01",
      pausedReason: "等待测试环境资源到位",
    },
    { strict: true },
  );
  assert.equal(paused.pausedReason, "等待测试环境资源到位");

  const resumed = normalizeMilestoneExecution(
    { ...current(), ...paused },
    { executionStatus: "in_progress", completion: 40 },
    { strict: true },
  );
  assert.equal(resumed.pausedReason, "");
});

test("enforces completion consistency and date order", () => {
  assert.throws(
    () =>
      normalizeMilestoneExecution(
        current(),
        {
          executionStatus: "completed",
          completion: 100,
          actualStart: "2026-08-10",
          actualFinish: "2026-08-09",
        },
        { strict: true },
      ),
    /不能早于/,
  );
});

test("requires a reason when completion moves backwards", () => {
  assert.throws(
    () =>
      normalizeMilestoneExecution(
        current({
          completion: 70,
          executionStatus: "in_progress",
          actualStart: "2026-08-01",
        }),
        { executionStatus: "in_progress", completion: 50, reason: "修正" },
        { strict: true },
      ),
    /不少于10个字符/,
  );
});
