import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  allocationConflictPreview,
  buildResourceCapacity,
  isoWeekKey,
  isoWeekStart,
  resourceCapacityCsv,
} from "../lib/resource-capacity.ts";

const resources = [
  {
    id: 1,
    name: "共享架构师",
    resourceType: "person",
    org: "技术平台组",
    capacityHoursPerWeek: 40,
    active: true,
  },
  {
    id: 2,
    name: "UAT环境",
    resourceType: "environment",
    org: "基础设施组",
    capacityHoursPerWeek: 40,
    active: true,
  },
];

const projects = [
  {
    id: "P1",
    code: "P01",
    name: "采购平台",
    ownerName: "项目经理甲",
    org: "供应链组",
    type: "业务平台",
    lifecycleStatus: "active",
  },
  {
    id: "P2",
    code: "P02",
    name: "数据平台",
    ownerName: "项目经理乙",
    org: "数据组",
    type: "数据平台",
    lifecycleStatus: "active",
  },
  {
    id: "P3",
    code: "P03",
    name: "已归档项目",
    ownerName: "项目经理丙",
    org: "数据组",
    type: "数据平台",
    lifecycleStatus: "archived",
  },
];

function allocation(overrides) {
  return {
    id: 1,
    resourceId: 1,
    projectId: "P1",
    milestoneId: null,
    role: "架构支持",
    startDate: "2026-07-20",
    endDate: "2026-07-26",
    hoursPerWeek: 30,
    status: "confirmed",
    note: "",
    overrideReason: "",
    createdBy: "pmo@example.com",
    createdAt: "2026-07-20T00:00:00Z",
    updatedAt: "2026-07-20T00:00:00Z",
    ...overrides,
  };
}

test("ISO week helpers use Monday and ISO week-year semantics", () => {
  assert.equal(isoWeekStart("2026-07-24"), "2026-07-20");
  assert.equal(isoWeekStart("2026-07-26"), "2026-07-20");
  assert.equal(isoWeekKey("2026-01-01"), "2026-W01");
  assert.equal(isoWeekKey("2027-01-01"), "2026-W53");
});

test("capacity analysis combines planned and confirmed hours and exposes conflicts", () => {
  const result = buildResourceCapacity({
    resources,
    projects,
    allocations: [
      allocation({ id: 1 }),
      allocation({
        id: 2,
        projectId: "P2",
        hoursPerWeek: 20,
        status: "planned",
      }),
      allocation({
        id: 3,
        projectId: "P3",
        hoursPerWeek: 80,
      }),
    ],
    asOfDate: "2026-07-24",
    weeks: 4,
  });

  const firstWeek = result.resources[0].weeks[0];
  assert.equal(firstWeek.confirmedHours, 30);
  assert.equal(firstWeek.plannedHours, 20);
  assert.equal(firstWeek.totalHours, 50);
  assert.equal(firstWeek.utilization, 125);
  assert.equal(firstWeek.status, "conflict");
  assert.equal(result.summary.conflictResourceCount, 1);
  assert.equal(result.summary.conflictWeekCount, 1);
  assert.equal(result.conflicts[0].overallocatedHours, 10);
  assert.deepEqual(
    result.conflicts[0].allocations.map((item) => item.projectId).sort(),
    ["P1", "P2"],
  );
  assert.equal(
    result.allocations.some((item) => item.projectId === "P3"),
    false,
    "archived project allocations must not create current conflicts",
  );
});

test("partial weeks are prorated by overlapping workdays", () => {
  const result = buildResourceCapacity({
    resources: [resources[0]],
    projects,
    allocations: [
      allocation({
        startDate: "2026-07-22",
        endDate: "2026-07-24",
        hoursPerWeek: 40,
      }),
    ],
    asOfDate: "2026-07-20",
    weeks: 4,
  });

  assert.equal(result.resources[0].weeks[0].totalHours, 24);
  assert.equal(result.resources[0].weeks[0].utilization, 60);
  assert.equal(result.resources[0].weeks[0].status, "healthy");
});

test("editing an allocation replaces the existing row during conflict preview", () => {
  const existing = allocation({ id: 8, hoursPerWeek: 20 });
  const preview = allocationConflictPreview({
    resources: [resources[0]],
    projects,
    allocations: [existing],
    proposed: { ...existing, hoursPerWeek: 35 },
  });
  assert.equal(preview.length, 0, "the edited row must not be counted twice");

  const conflict = allocationConflictPreview({
    resources: [resources[0]],
    projects,
    allocations: [
      existing,
      allocation({ id: 9, projectId: "P2", hoursPerWeek: 15 }),
    ],
    proposed: { ...existing, hoursPerWeek: 30 },
  });
  assert.equal(conflict.length, 1);
  assert.equal(conflict[0].allocatedHours, 45);
});

test("filters and CSV export retain explainable capacity data", () => {
  const result = buildResourceCapacity({
    resources,
    projects,
    allocations: [
      allocation({ id: 1, hoursPerWeek: 34 }),
      allocation({
        id: 2,
        resourceId: 2,
        projectId: "P2",
        hoursPerWeek: 10,
      }),
    ],
    asOfDate: "2026-07-20",
    weeks: 4,
    filters: { status: "warning", projectOrg: "供应链组" },
  });

  assert.equal(result.resources.length, 1);
  assert.equal(result.resources[0].name, "共享架构师");
  assert.equal(result.resources[0].weeks[0].status, "warning");
  const csv = resourceCapacityCsv(result.resources);
  assert.match(csv, /资源类型/);
  assert.match(csv, /共享架构师/);
  assert.match(csv, /接近满载/);
  assert.match(csv, /P01-采购平台/);
});

test("wires resource governance through schema, APIs, snapshots and workspace UI", async () => {
  const [
    schema,
    portfolioRoute,
    allocationRoute,
    allocationDetailRoute,
    resourceRoute,
    snapshotService,
    page,
    resourcePage,
    styles,
  ] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/portfolio/resources/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/api/resource-allocations/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/api/resource-allocations/[id]/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../app/api/resources/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/snapshot-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/resource-planning.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /export const resources = sqliteTable/);
  assert.match(schema, /export const resourceAllocations = sqliteTable/);
  assert.match(portfolioRoute, /resourceCapacityCsv/);
  assert.match(allocationRoute, /canWriteProject/);
  assert.match(allocationRoute, /overrideReason\.length < 10/);
  assert.match(allocationDetailRoute, /existingProject\.ownerEmail/);
  assert.match(resourceRoute, /canManagePortfolio/);
  assert.match(snapshotService, /resourceCapacity/);
  assert.match(snapshotService, /resourceConflicts/);
  assert.match(page, /view === "resources"/);
  assert.match(page, /共享资源冲突/);
  assert.match(resourcePage, /资源 × 周容量热力图/);
  assert.match(resourcePage, /容量预检/);
  assert.match(styles, /\.resource-heatmap/);
  assert.match(styles, /\.allocation-preview/);
});
