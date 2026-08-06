import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_COCKPIT_SORT,
  compareCockpitProjects,
  nextCockpitSort,
  normalizeCockpitSortPreference,
  persistCockpitSort,
} from "../lib/cockpit-sort.ts";

function project(id, name, score) {
  return { id, name, score };
}

test("sorts cockpit projects from clickable project and health headers", () => {
  assert.deepEqual(DEFAULT_COCKPIT_SORT, {
    field: "health",
    direction: "asc",
  });
  assert.deepEqual(
    nextCockpitSort(DEFAULT_COCKPIT_SORT, "health"),
    { field: "health", direction: "desc" },
  );
  assert.deepEqual(
    nextCockpitSort(DEFAULT_COCKPIT_SORT, "project"),
    { field: "project", direction: "asc" },
  );
  assert.deepEqual(
    nextCockpitSort({ field: "project", direction: "asc" }, "project"),
    { field: "project", direction: "desc" },
  );

  const rows = [
    project("P01", "B项目", 92),
    project("P02", "A项目", 63),
    project("P03", "C项目", 81),
  ];
  assert.deepEqual(
    [...rows]
      .sort((left, right) =>
        compareCockpitProjects(left, right, { field: "project", direction: "asc" }),
      )
      .map((row) => row.id),
    ["P02", "P01", "P03"],
  );
  assert.deepEqual(
    [...rows]
      .sort((left, right) =>
        compareCockpitProjects(left, right, { field: "project", direction: "desc" }),
      )
      .map((row) => row.id),
    ["P03", "P01", "P02"],
  );
  assert.deepEqual(
    [...rows]
      .sort((left, right) =>
        compareCockpitProjects(left, right, { field: "health", direction: "asc" }),
      )
      .map((row) => row.id),
    ["P02", "P03", "P01"],
  );
  assert.deepEqual(
    [...rows]
      .sort((left, right) =>
        compareCockpitProjects(left, right, { field: "health", direction: "desc" }),
      )
      .map((row) => row.id),
    ["P01", "P03", "P02"],
  );
});

test("persists shared header sorting and migrates the former dropdown", () => {
  assert.deepEqual(
    normalizeCockpitSortPreference({
      sortField: "project",
      sortDirection: "desc",
    }),
    { field: "project", direction: "desc" },
  );
  assert.deepEqual(normalizeCockpitSortPreference({ sortMode: "default" }), {
    field: "project",
    direction: "asc",
  });
  assert.deepEqual(normalizeCockpitSortPreference({ sortMode: "urgency" }), {
    field: "health",
    direction: "asc",
  });

  let savedPreference = JSON.stringify({
    pageSize: 12,
    sortMode: "urgency",
  });
  const storage = {
    getItem: () => savedPreference,
    setItem: (_key, value) => { savedPreference = value; },
  };
  persistCockpitSort(storage, "shared", {
    field: "project",
    direction: "desc",
  });
  assert.deepEqual(JSON.parse(savedPreference), {
    pageSize: 12,
    sortField: "project",
    sortDirection: "desc",
  });
});

test("renders sortable project and health headers in both management cockpits", async () => {
  const [timeline, page, css] = await Promise.all([
    readFile(new URL("../app/timeline-cockpit.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  for (const source of [timeline, page]) {
    assert.match(source, /toggleSort\("health"\)/);
    assert.match(source, /toggleSort\("project"\)/);
    assert.match(source, /按健康度/);
    assert.match(source, /按项目名称/);
    assert.doesNotMatch(source, /<option value="urgency">/);
    assert.doesNotMatch(source, /<option value="default">/);
  }
  assert.match(timeline, /timeline-project-column timeline-project-header/);
  assert.match(page, /project-col project-sort-header/);
  assert.match(css, /project-sort-header>button\.active/);
  assert.match(css, /project-sort-header>button:focus-visible/);
  assert.match(css, /timeline-project-header.*grid-template-columns:32px minmax\(0,1fr\) 32px/);
});
