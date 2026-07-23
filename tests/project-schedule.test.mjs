import assert from "node:assert/strict";
import test from "node:test";
import {
  addIsoDays,
  buildWeightedProjectSchedule,
  isoDaySpan,
  validateProjectSchedule,
} from "../lib/project-schedule.ts";

const templates = [
  {
    id: 2,
    code: "M02",
    name: "开发",
    sequence: 2,
    defaultWeight: 75,
    critical: true,
  },
  {
    id: 1,
    code: "M01",
    name: "启动",
    sequence: 1,
    defaultWeight: 25,
    critical: false,
  },
];

test("distributes an independent project range by enabled milestone weights", () => {
  const rows = buildWeightedProjectSchedule(
    templates,
    "2026-08-01",
    "2026-08-10",
  );

  assert.deepEqual(
    rows.map((row) => [
      row.code,
      row.plannedStart,
      row.plannedFinish,
      isoDaySpan(row.plannedStart, row.plannedFinish),
    ]),
    [
      ["M01", "2026-08-01", "2026-08-03", 3],
      ["M02", "2026-08-04", "2026-08-10", 7],
    ],
  );
  assert.equal(
    rows.reduce(
      (sum, row) => sum + isoDaySpan(row.plannedStart, row.plannedFinish),
      0,
    ),
    10,
  );
});

test("allocates at least one day to every enabled milestone", () => {
  const rows = buildWeightedProjectSchedule(
    templates,
    "2026-12-31",
    "2027-01-01",
  );
  assert.equal(rows[0].plannedStart, "2026-12-31");
  assert.equal(rows[1].plannedFinish, "2027-01-01");
  assert(rows.every((row) => isoDaySpan(row.plannedStart, row.plannedFinish) === 1));
});

test("rejects invalid or too-short project ranges and milestone windows", () => {
  assert.throws(
    () =>
      buildWeightedProjectSchedule(
        templates,
        "2026-08-01",
        "2026-08-01",
      ),
    /至少需要2天/,
  );
  assert.throws(() => addIsoDays("2026-02-30", 1), /日期不存在/);
  assert.throws(
    () =>
      validateProjectSchedule([
        {
          name: "开发",
          plannedStart: "2026-09-02",
          plannedFinish: "2026-09-01",
        },
      ]),
    /不能早于/,
  );
});
