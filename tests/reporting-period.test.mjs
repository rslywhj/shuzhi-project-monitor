import assert from "node:assert/strict";
import test from "node:test";
import {
  isoWeekKeyForDate,
  portfolioAutomationWindow,
} from "../lib/reporting-period.ts";

test("calculates ISO weeks across year boundaries", () => {
  assert.equal(isoWeekKeyForDate(2026, 7, 23), "2026-W30");
  assert.equal(isoWeekKeyForDate(2027, 1, 1), "2026-W53");
  assert.equal(isoWeekKeyForDate(2027, 1, 4), "2027-W01");
});

test("starts reminders on Wednesday morning in Shanghai", () => {
  const before = portfolioAutomationWindow(
    new Date("2026-07-22T00:59:00.000Z"),
  );
  const after = portfolioAutomationWindow(
    new Date("2026-07-22T01:00:00.000Z"),
  );
  assert.equal(before.advanceReminderWeekKey, null);
  assert.equal(after.advanceReminderWeekKey, "2026-W30");
  assert.equal(after.dueLockWeekKey, "2026-W29");
});

test("locks the current week at Friday 17:00 Shanghai time", () => {
  const before = portfolioAutomationWindow(
    new Date("2026-07-24T08:59:00.000Z"),
  );
  const deadline = portfolioAutomationWindow(
    new Date("2026-07-24T09:00:00.000Z"),
  );
  assert.equal(before.advanceReminderWeekKey, "2026-W30");
  assert.equal(before.dueLockWeekKey, null);
  assert.equal(deadline.advanceReminderWeekKey, null);
  assert.equal(deadline.dueLockWeekKey, "2026-W30");
});

test("catches up the most recently due Friday after the weekend", () => {
  assert.equal(
    portfolioAutomationWindow(
      new Date("2026-07-25T02:00:00.000Z"),
    ).dueLockWeekKey,
    "2026-W30",
  );
  assert.equal(
    portfolioAutomationWindow(
      new Date("2026-07-27T02:00:00.000Z"),
    ).dueLockWeekKey,
    "2026-W30",
  );
});
