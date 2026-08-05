export type TimelineStatus = "green" | "yellow" | "red" | "na";
export type TimelineMarkerRole = "plan" | "actual" | "forecast" | "overdue";
export type TimelineKpiFilter = "planned" | "actual" | "forecast" | "overdue";

export type TimelineMilestoneInput = {
  id: number;
  name: string;
  sequence: number;
  status: TimelineStatus;
  completion: number;
  plannedFinish: string;
  plannedStart?: string;
  forecastFinish: string | null;
  actualFinish: string | null;
  deviationDays: number;
  reason: string;
  applicable: boolean;
  critical: boolean;
  custom: boolean;
  weight: number;
  executionStatus?: "not_started" | "in_progress" | "paused" | "completed";
  actualStart?: string | null;
  pausedReason?: string;
};

export type TimelineProjectInput = {
  id: string;
  name: string;
  owner: string;
  org: string;
  type: string;
  status: TimelineStatus;
  score: number;
  lifecycleStatus?: "active" | "completed" | "archived";
  stageSummary?: {
    primaryMilestoneId: number | null;
    primaryBasis: "manager_confirmed" | "system_recommended" | "legacy_inferred" | "none";
    parallelMilestoneIds: number[];
    carryoverMilestoneIds: number[];
    overdueCarryoverMilestoneIds: number[];
    shouldStartMilestoneIds: number[];
    nextMilestoneId: number | null;
  };
  milestones?: TimelineMilestoneInput[];
};

export type TimelineMonth = {
  key: string;
  year: number;
  month: number;
  label: string;
  shortLabel: string;
  isCurrent: boolean;
};

export type TimelineMarker = {
  key: string;
  monthKey: string;
  milestone: TimelineMilestoneInput;
  roles: TimelineMarkerRole[];
  overdue: boolean;
};

export type TimelineKpi = {
  count: number;
  criticalCount: number;
  projectIds: Set<string>;
};

export type TimelineKpis = Record<TimelineKpiFilter, TimelineKpi>;

const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;

export function unfinishedPlannedFinish(
  milestone: TimelineMilestoneInput,
) {
  const completed =
    milestone.executionStatus === "completed" ||
    milestone.completion >= 100 ||
    Boolean(milestone.actualFinish);
  return completed ? null : (milestone.plannedFinish || null);
}

export function compactTimelineDate(value: string) {
  const match = value.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}-${match[2]}` : value;
}

function parseMonthKey(monthKey: string) {
  const match = monthKey.match(MONTH_KEY_PATTERN);
  if (!match) throw new Error(`Invalid month key: ${monthKey}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error(`Invalid month key: ${monthKey}`);
  return { year, month };
}

export function monthKeyFromDate(value: string | null | undefined) {
  if (!value) return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[1]}-${match[2]}`;
}

export function addTimelineMonths(monthKey: string, offset: number) {
  const { year, month } = parseMonthKey(monthKey);
  const serial = year * 12 + month - 1 + offset;
  const nextYear = Math.floor(serial / 12);
  const nextMonth = ((serial % 12) + 12) % 12 + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

export function buildTimelineMonths(
  currentMonthKey: string,
  viewOffset = 0,
): TimelineMonth[] {
  const anchorMonthKey = addTimelineMonths(currentMonthKey, viewOffset);
  return Array.from({ length: 6 }, (_, index) => {
    const key = addTimelineMonths(anchorMonthKey, index - 1);
    const { year, month } = parseMonthKey(key);
    return {
      key,
      year,
      month,
      label: `${year}年${month}月`,
      shortLabel: `${String(month).padStart(2, "0")}月`,
      isCurrent: key === currentMonthKey,
    };
  });
}

function markerIdentity(milestone: TimelineMilestoneInput) {
  return `${milestone.id}-${milestone.sequence}-${milestone.name}`;
}

export function buildProjectTimelineMarkers(
  project: TimelineProjectInput,
  months: TimelineMonth[],
  asOfDate: string,
) {
  const visibleMonths = new Set(months.map((month) => month.key));
  const currentMonthKey = months.find((month) => month.isCurrent)?.key ?? null;
  const markerMap = new Map<string, TimelineMarker>();

  function addMarker(
    monthKey: string | null,
    milestone: TimelineMilestoneInput,
    role: TimelineMarkerRole,
    overdue = false,
  ) {
    if (!monthKey || !visibleMonths.has(monthKey)) return;
    const key = `${monthKey}-${markerIdentity(milestone)}`;
    const existing = markerMap.get(key);
    if (existing) {
      if (!existing.roles.includes(role)) existing.roles.push(role);
      existing.overdue ||= overdue;
      return;
    }
    markerMap.set(key, {
      key,
      monthKey,
      milestone,
      roles: [role],
      overdue,
    });
  }

  for (const milestone of project.milestones ?? []) {
    if (!milestone.applicable) continue;
    const plannedMonth = monthKeyFromDate(milestone.plannedFinish);
    const actualMonth = monthKeyFromDate(milestone.actualFinish);
    const forecastMonth =
      !actualMonth && milestone.completion < 100
        ? monthKeyFromDate(milestone.forecastFinish)
        : null;
    const overdue =
      milestone.completion < 100 &&
      Boolean(milestone.plannedFinish) &&
      milestone.plannedFinish < asOfDate;

    addMarker(plannedMonth, milestone, "plan", overdue);
    if (actualMonth) addMarker(actualMonth, milestone, "actual", overdue);
    else if (forecastMonth) {
      addMarker(forecastMonth, milestone, "forecast", overdue);
    }

    if (overdue) {
      if (plannedMonth && visibleMonths.has(plannedMonth)) {
        addMarker(plannedMonth, milestone, "overdue", true);
      } else if (currentMonthKey) {
        addMarker(currentMonthKey, milestone, "overdue", true);
      }
    }
  }

  return [...markerMap.values()].sort(
    (left, right) =>
      left.monthKey.localeCompare(right.monthKey) ||
      Number(right.overdue) - Number(left.overdue) ||
      Number(right.milestone.critical) - Number(left.milestone.critical) ||
      left.milestone.sequence - right.milestone.sequence,
  );
}

export function markerMatchesKpi(
  marker: TimelineMarker,
  filter: TimelineKpiFilter,
  currentMonthKey: string,
) {
  if (filter === "overdue") return marker.overdue;
  if (marker.monthKey !== currentMonthKey) return false;
  if (filter === "planned") return marker.roles.includes("plan");
  if (filter === "actual") return marker.roles.includes("actual");
  return marker.roles.includes("forecast");
}

export function buildTimelineKpis(
  projects: TimelineProjectInput[],
  currentMonthKey: string,
  asOfDate: string,
): TimelineKpis {
  const result: TimelineKpis = {
    planned: { count: 0, criticalCount: 0, projectIds: new Set() },
    actual: { count: 0, criticalCount: 0, projectIds: new Set() },
    forecast: { count: 0, criticalCount: 0, projectIds: new Set() },
    overdue: { count: 0, criticalCount: 0, projectIds: new Set() },
  };

  function add(
    filter: TimelineKpiFilter,
    project: TimelineProjectInput,
    milestone: TimelineMilestoneInput,
  ) {
    result[filter].count += 1;
    if (milestone.critical) result[filter].criticalCount += 1;
    result[filter].projectIds.add(project.id);
  }

  for (const project of projects) {
    for (const milestone of project.milestones ?? []) {
      if (!milestone.applicable) continue;
      if (monthKeyFromDate(milestone.plannedFinish) === currentMonthKey) {
        add("planned", project, milestone);
      }
      if (monthKeyFromDate(milestone.actualFinish) === currentMonthKey) {
        add("actual", project, milestone);
      }
      if (
        !milestone.actualFinish &&
        milestone.completion < 100 &&
        monthKeyFromDate(milestone.forecastFinish) === currentMonthKey
      ) {
        add("forecast", project, milestone);
      }
      if (
        milestone.completion < 100 &&
        Boolean(milestone.plannedFinish) &&
        milestone.plannedFinish < asOfDate
      ) {
        add("overdue", project, milestone);
      }
    }
  }

  return result;
}

export function timelineProjectIsVisible(
  project: TimelineProjectInput,
  months: TimelineMonth[],
  asOfDate: string,
) {
  const lifecycle = project.lifecycleStatus ?? "active";
  if (lifecycle === "archived") return false;
  const visibleMonths = new Set(months.map((month) => month.key));
  if (lifecycle === "completed") {
    return (project.milestones ?? []).some(
      (milestone) =>
        milestone.applicable &&
        visibleMonths.has(monthKeyFromDate(milestone.actualFinish) ?? ""),
    );
  }
  return buildProjectTimelineMarkers(project, months, asOfDate).length > 0;
}

export function timelineProjectPriority(
  project: TimelineProjectInput,
  markers: TimelineMarker[],
  currentMonthKey: string,
) {
  const currentMarkers = markers.filter(
    (marker) => marker.monthKey === currentMonthKey,
  );
  const overdueCount = markers.filter((marker) => marker.overdue).length;
  const criticalCurrent = currentMarkers.filter(
    (marker) => marker.milestone.critical,
  ).length;
  const statusRank: Record<TimelineStatus, number> = {
    red: 3,
    yellow: 2,
    green: 1,
    na: 0,
  };
  return (
    overdueCount * 1_000 +
    criticalCurrent * 100 +
    currentMarkers.length * 10 +
    statusRank[project.status]
  );
}
