export type ResourceType = "person" | "team" | "vendor" | "environment";
export type AllocationStatus = "planned" | "confirmed" | "cancelled";
export type CapacityStatus = "idle" | "healthy" | "warning" | "conflict";

export type ResourceRow = {
  id: number;
  name: string;
  resourceType: ResourceType;
  org: string;
  capacityHoursPerWeek: number;
  active: boolean;
};

export type AllocationRow = {
  id: number;
  resourceId: number;
  projectId: string;
  milestoneId: number | null;
  role: string;
  startDate: string;
  endDate: string;
  hoursPerWeek: number;
  status: AllocationStatus;
  note: string;
  overrideReason: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type CapacityProjectRow = {
  id: string;
  code: string;
  name: string;
  ownerName: string;
  org: string;
  type: string;
  lifecycleStatus?: "active" | "completed" | "archived";
};

export type CapacityMilestoneRow = {
  id: number;
  projectId: string;
  name: string;
};

export type ResourceCapacityFilters = {
  resourceOrg?: string;
  resourceType?: ResourceType;
  projectOrg?: string;
  projectType?: string;
  status?: "warning" | "conflict";
};

const DAY_MS = 86_400_000;

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function dateValue(value: string) {
  return Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
}

function isoDate(value: number) {
  return new Date(value).toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  return isoDate(dateValue(value) + days * DAY_MS);
}

export function isoWeekStart(value: string) {
  const parsed = dateValue(value);
  if (!Number.isFinite(parsed)) return value.slice(0, 10);
  const day = new Date(parsed).getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  return isoDate(parsed + offset * DAY_MS);
}

export function isoWeekKey(value: string) {
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  const day = parsed.getUTCDay() || 7;
  parsed.setUTCDate(parsed.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(parsed.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((parsed.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7,
  );
  return `${parsed.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function overlapWorkdays(
  allocation: Pick<AllocationRow, "startDate" | "endDate">,
  weekStart: string,
) {
  const start = Math.max(
    dateValue(allocation.startDate),
    dateValue(weekStart),
  );
  const end = Math.min(
    dateValue(allocation.endDate),
    dateValue(addDays(weekStart, 6)),
  );
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    return 0;
  }
  let count = 0;
  for (let cursor = start; cursor <= end; cursor += DAY_MS) {
    const day = new Date(cursor).getUTCDay();
    if (day >= 1 && day <= 5) count += 1;
  }
  return count;
}

function capacityStatus(
  totalHours: number,
  capacityHours: number,
): CapacityStatus {
  if (totalHours <= 0) return "idle";
  if (capacityHours <= 0 || totalHours > capacityHours) return "conflict";
  if (totalHours / capacityHours >= 0.85) return "warning";
  return "healthy";
}

export function buildResourceCapacity(input: {
  resources: ResourceRow[];
  allocations: AllocationRow[];
  projects: CapacityProjectRow[];
  milestones?: CapacityMilestoneRow[];
  asOfDate: string;
  weeks?: number;
  filters?: ResourceCapacityFilters;
}) {
  const weeks = Math.min(26, Math.max(4, Math.round(input.weeks ?? 12)));
  const rangeStart = isoWeekStart(input.asOfDate);
  const weekColumns = Array.from({ length: weeks }, (_, index) => {
    const startDate = addDays(rangeStart, index * 7);
    return {
      weekKey: isoWeekKey(startDate),
      startDate,
      endDate: addDays(startDate, 6),
      label: `${startDate.slice(5).replace("-", "/")}`,
    };
  });
  const filters = input.filters ?? {};
  const projectById = new Map(
    input.projects.map((project) => [project.id, project]),
  );
  const milestoneById = new Map(
    (input.milestones ?? []).map((milestone) => [milestone.id, milestone]),
  );
  const scopedAllocations = input.allocations.filter((allocation) => {
    if (allocation.status === "cancelled") return false;
    const project = projectById.get(allocation.projectId);
    if (
      project?.lifecycleStatus &&
      project.lifecycleStatus !== "active"
    ) {
      return false;
    }
    return (
      (!filters.projectOrg || project?.org === filters.projectOrg) &&
      (!filters.projectType || project?.type === filters.projectType)
    );
  });
  const allocationByResource = new Map<number, AllocationRow[]>();
  for (const allocation of scopedAllocations) {
    const rows = allocationByResource.get(allocation.resourceId) ?? [];
    rows.push(allocation);
    allocationByResource.set(allocation.resourceId, rows);
  }
  const hasProjectFilter = Boolean(
    filters.projectOrg || filters.projectType,
  );
  const resourceRows = input.resources
    .filter(
      (resource) =>
        resource.active &&
        (!filters.resourceOrg || resource.org === filters.resourceOrg) &&
        (!filters.resourceType ||
          resource.resourceType === filters.resourceType) &&
        (!hasProjectFilter ||
          (allocationByResource.get(resource.id)?.length ?? 0) > 0),
    )
    .map((resource) => {
      const resourceAllocations =
        allocationByResource.get(resource.id) ?? [];
      const weekRows = weekColumns.map((week) => {
        const allocationRows = resourceAllocations
          .map((allocation) => {
            const workdays = overlapWorkdays(allocation, week.startDate);
            if (!workdays) return null;
            const hours = round(
              allocation.hoursPerWeek * (workdays / 5),
            );
            const project = projectById.get(allocation.projectId);
            const milestone = allocation.milestoneId
              ? milestoneById.get(allocation.milestoneId)
              : null;
            return {
              id: allocation.id,
              projectId: allocation.projectId,
              projectCode: project?.code ?? allocation.projectId,
              projectName: project?.name ?? allocation.projectId,
              projectOrg: project?.org ?? "",
              milestoneName: milestone?.name ?? null,
              role: allocation.role,
              status: allocation.status,
              hours,
              startDate: allocation.startDate,
              endDate: allocation.endDate,
              note: allocation.note,
            };
          })
          .filter((row) => row !== null);
        const plannedHours = round(
          allocationRows
            .filter((allocation) => allocation.status === "planned")
            .reduce((sum, allocation) => sum + allocation.hours, 0),
        );
        const confirmedHours = round(
          allocationRows
            .filter((allocation) => allocation.status === "confirmed")
            .reduce((sum, allocation) => sum + allocation.hours, 0),
        );
        const totalHours = round(plannedHours + confirmedHours);
        const utilization = resource.capacityHoursPerWeek
          ? round(
              (totalHours / resource.capacityHoursPerWeek) * 100,
            )
          : totalHours > 0
            ? 999
            : 0;
        return {
          ...week,
          capacityHours: resource.capacityHoursPerWeek,
          plannedHours,
          confirmedHours,
          totalHours,
          utilization,
          status: capacityStatus(
            totalHours,
            resource.capacityHoursPerWeek,
          ),
          allocations: allocationRows,
        };
      });
      return {
        ...resource,
        peakUtilization: Math.max(
          0,
          ...weekRows.map((week) => week.utilization),
        ),
        conflictWeekCount: weekRows.filter(
          (week) => week.status === "conflict",
        ).length,
        warningWeekCount: weekRows.filter(
          (week) => week.status === "warning",
        ).length,
        weeks: weekRows,
      };
    })
    .filter(
      (resource) =>
        !filters.status ||
        resource.weeks.some((week) => week.status === filters.status),
    )
    .sort(
      (left, right) =>
        right.conflictWeekCount - left.conflictWeekCount ||
        right.peakUtilization - left.peakUtilization ||
        left.name.localeCompare(right.name, "zh-CN"),
    );

  const conflictRows = resourceRows
    .flatMap((resource) =>
      resource.weeks
        .filter((week) => week.status === "conflict")
        .map((week) => ({
          resourceId: resource.id,
          resourceName: resource.name,
          resourceType: resource.resourceType,
          resourceOrg: resource.org,
          weekKey: week.weekKey,
          weekStart: week.startDate,
          capacityHours: week.capacityHours,
          allocatedHours: week.totalHours,
          overallocatedHours: round(
            Math.max(0, week.totalHours - week.capacityHours),
          ),
          utilization: week.utilization,
          allocations: week.allocations,
        })),
    )
    .sort(
      (left, right) =>
        right.utilization - left.utilization ||
        left.weekKey.localeCompare(right.weekKey) ||
        left.resourceName.localeCompare(right.resourceName, "zh-CN"),
    );
  const visibleAllocationIds = new Set(
    resourceRows.flatMap((resource) =>
      resource.weeks.flatMap((week) =>
        week.allocations.map((allocation) => allocation.id),
      ),
    ),
  );
  const allocations = scopedAllocations
    .filter((allocation) => visibleAllocationIds.has(allocation.id))
    .map((allocation) => {
      const resource = input.resources.find(
        (item) => item.id === allocation.resourceId,
      );
      const project = projectById.get(allocation.projectId);
      const milestone = allocation.milestoneId
        ? milestoneById.get(allocation.milestoneId)
        : null;
      return {
        ...allocation,
        resourceName: resource?.name ?? String(allocation.resourceId),
        resourceOrg: resource?.org ?? "",
        projectCode: project?.code ?? allocation.projectId,
        projectName: project?.name ?? allocation.projectId,
        projectOrg: project?.org ?? "",
        milestoneName: milestone?.name ?? null,
      };
    })
    .sort(
      (left, right) =>
        left.startDate.localeCompare(right.startDate) ||
        left.resourceName.localeCompare(right.resourceName, "zh-CN"),
    );

  return {
    range: {
      asOfDate: input.asOfDate,
      startDate: weekColumns[0]?.startDate ?? rangeStart,
      endDate: weekColumns.at(-1)?.endDate ?? rangeStart,
      weeks,
      columns: weekColumns,
    },
    summary: {
      resourceCount: resourceRows.length,
      allocationCount: allocations.length,
      conflictResourceCount: resourceRows.filter(
        (resource) => resource.conflictWeekCount > 0,
      ).length,
      conflictWeekCount: conflictRows.length,
      warningResourceCount: resourceRows.filter(
        (resource) => resource.warningWeekCount > 0,
      ).length,
      peakUtilization: Math.max(
        0,
        ...resourceRows.map((resource) => resource.peakUtilization),
      ),
    },
    resources: resourceRows,
    conflicts: conflictRows,
    allocations,
    filterOptions: {
      resourceOrgs: [
        ...new Set(input.resources.map((resource) => resource.org)),
      ].sort((left, right) => left.localeCompare(right, "zh-CN")),
      resourceTypes: [
        ...new Set(input.resources.map((resource) => resource.resourceType)),
      ].sort(),
      projectOrgs: [
        ...new Set(input.projects.map((project) => project.org)),
      ].sort((left, right) => left.localeCompare(right, "zh-CN")),
      projectTypes: [
        ...new Set(input.projects.map((project) => project.type)),
      ].sort((left, right) => left.localeCompare(right, "zh-CN")),
    },
  };
}

export function allocationConflictPreview(input: {
  resources: ResourceRow[];
  allocations: AllocationRow[];
  projects: CapacityProjectRow[];
  milestones?: CapacityMilestoneRow[];
  proposed: AllocationRow;
}) {
  const rangeStart = isoWeekStart(input.proposed.startDate);
  const endWeekStart = isoWeekStart(input.proposed.endDate);
  const weekCount =
    Math.round(
      (dateValue(endWeekStart) - dateValue(rangeStart)) /
        (7 * DAY_MS),
    ) + 1;
  const analysis = buildResourceCapacity({
    resources: input.resources,
    allocations: [
      ...input.allocations.filter(
        (allocation) => allocation.id !== input.proposed.id,
      ),
      input.proposed,
    ],
    projects: input.projects,
    milestones: input.milestones,
    asOfDate: input.proposed.startDate,
    weeks: Math.min(26, Math.max(4, weekCount)),
  });
  return analysis.conflicts.filter(
    (conflict) =>
      conflict.resourceId === input.proposed.resourceId &&
      conflict.weekStart >= rangeStart &&
      conflict.weekStart <= endWeekStart,
  );
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

export function resourceCapacityCsv(
  rows: ReturnType<typeof buildResourceCapacity>["resources"],
) {
  const headers = [
    "资源",
    "资源类型",
    "所属组织",
    "周期",
    "周容量(小时)",
    "已确认(小时)",
    "计划中(小时)",
    "总分配(小时)",
    "利用率(%)",
    "状态",
    "涉及项目",
  ];
  const typeNames = {
    person: "人员",
    team: "团队",
    vendor: "供应商",
    environment: "环境",
  };
  const statusNames = {
    idle: "空闲",
    healthy: "正常",
    warning: "接近满载",
    conflict: "超配冲突",
  };
  return [
    headers,
    ...rows.flatMap((resource) =>
      resource.weeks.map((week) => [
        resource.name,
        typeNames[resource.resourceType],
        resource.org,
        week.weekKey,
        week.capacityHours,
        week.confirmedHours,
        week.plannedHours,
        week.totalHours,
        week.utilization,
        statusNames[week.status],
        [
          ...new Set(
            week.allocations.map(
              (allocation) =>
                `${allocation.projectCode}-${allocation.projectName}`,
            ),
          ),
        ].join("；"),
      ]),
    ),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}
