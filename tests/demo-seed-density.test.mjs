import assert from "node:assert/strict";
import test from "node:test";
import {
  DEMO_MILESTONE_CADENCE_DAYS,
  seedProjects,
} from "../lib/demo-seed-data.ts";

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dateAt(base, offset) {
  const result = new Date(base);
  result.setUTCDate(result.getUTCDate() + offset);
  return result;
}

test("demo standard milestones keep at most one distinct milestone per project month", () => {
  assert.equal(seedProjects.length, 16);
  assert.equal(DEMO_MILESTONE_CADENCE_DAYS, 50);

  // Check every possible seed day in a leap year so the rule does not only
  // happen to pass for today's calendar alignment.
  const yearStart = new Date("2028-01-01T00:00:00.000Z");
  for (let day = 0; day < 366; day += 1) {
    const base = dateAt(yearStart, day);
    for (const project of seedProjects) {
      const milestoneSequencesByMonth = new Map();
      for (let sequence = 1; sequence <= 12; sequence += 1) {
        const plannedOffset =
          project.startOffset + sequence * DEMO_MILESTONE_CADENCE_DAYS;
        const executionOffset =
          plannedOffset +
          (sequence <= project.completeThrough
            ? project.actualDelay
            : project.forecastDelay);
        for (const offset of [plannedOffset, executionOffset]) {
          const key = monthKey(dateAt(base, offset));
          const sequences = milestoneSequencesByMonth.get(key) ?? new Set();
          sequences.add(sequence);
          milestoneSequencesByMonth.set(key, sequences);
        }
      }

      for (const [month, sequences] of milestoneSequencesByMonth) {
        assert.ok(
          sequences.size <= 1,
          `${project.id} has ${sequences.size} standard milestones in ${month}`,
        );
      }
    }
  }
});
