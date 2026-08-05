import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_COCKPIT_SORT_MODE,
  normalizeCockpitSortMode,
  persistCockpitSortMode,
} from "../lib/cockpit-sort.ts";
import {
  buildProjectTimelineMarkers,
  buildTimelineMonths,
  compareTimelineProjectUrgency,
} from "../lib/timeline-cockpit.ts";

function project(id, name, status, plannedFinish, forecastFinish) {
  return {
    id,
    name,
    owner: "负责人",
    org: "数智组",
    type: "业务平台",
    status,
    score: 80,
    lifecycleStatus: "active",
    milestones: [{
      id: Number(id.slice(1)),
      name: "方案评审",
      sequence: 5,
      status,
      completion: 40,
      plannedFinish,
      forecastFinish,
      actualFinish: null,
      deviationDays: 0,
      reason: "",
      applicable: true,
      critical: false,
      custom: false,
      weight: 10,
    }],
  };
}

test("shares current-month urgency and original-order sorting across both cockpits", () => {
  assert.equal(DEFAULT_COCKPIT_SORT_MODE, "urgency");
  assert.equal(normalizeCockpitSortMode("urgency"), "urgency");
  assert.equal(normalizeCockpitSortMode("default"), "default");
  assert.equal(normalizeCockpitSortMode("unknown"), "urgency");

  let savedPreference = JSON.stringify({ pageSize: 12, sortMode: "urgency" });
  const storage = {
    getItem: () => savedPreference,
    setItem: (_key, value) => { savedPreference = value; },
  };
  persistCockpitSortMode(storage, "shared", "default");
  assert.deepEqual(JSON.parse(savedPreference), {
    pageSize: 12,
    sortMode: "default",
  });

  const months = buildTimelineMonths("2026-08");
  const regular = project("P01", "普通项目", "green", "2026-10-10", "2026-10-10");
  const urgent = project("P02", "紧迫项目", "red", "2026-07-20", "2026-08-20");
  const rows = [regular, urgent].map((item) => ({
    project: item,
    markers: buildProjectTimelineMarkers(item, months, "2026-08-05"),
  }));

  assert.deepEqual(
    [...rows]
      .sort((left, right) => compareTimelineProjectUrgency(left, right, "2026-08"))
      .map((row) => row.project.id),
    ["P02", "P01"],
  );
  assert.deepEqual(rows.map((row) => row.project.id), ["P01", "P02"]);
});

test("renders one shared sort switch and a row-aligned timeline project header", async () => {
  const [timeline, page, css] = await Promise.all([
    readFile(new URL("../app/timeline-cockpit.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  for (const source of [timeline, page]) {
    assert.match(source, /<option value="urgency">当月紧迫度<\/option>/);
    assert.match(source, /<option value="default">项目原顺序<\/option>/);
    assert.match(source, /sortMode/);
  }
  assert.doesNotMatch(timeline, /按当月紧迫度排序/);
  assert.doesNotMatch(timeline, /里程碑完成月/);
  assert.doesNotMatch(timeline, />当前月<\/small>/);
  assert.match(timeline, /timeline-project-column timeline-project-header/);
  assert.match(css, /timeline-project-header\{display:grid;grid-template-columns:32px minmax\(0,1fr\) 32px/);
  assert.match(css, /timeline-project-cell\{display:grid;grid-template-columns:32px minmax\(0,1fr\) 32px/);
});
