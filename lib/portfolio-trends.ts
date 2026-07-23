export type TrendFilters = {
  org?: string;
  type?: string;
  owner?: string;
  status?: "green" | "yellow" | "red";
};

type SnapshotRow = {
  weekKey: string;
  version: number;
  completeness: number;
  lockedAt: string;
  payloadJson: string;
};

type SnapshotProject = {
  id: string;
  code: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  org: string;
  type: string;
  score: number;
  status: "green" | "yellow" | "red";
  planProgress: number;
  actualProgress: number;
};

type SnapshotMilestone = {
  projectId: string;
  templateId: number | null;
  name: string;
  sequence: number;
  applicable: boolean;
  status: "green" | "yellow" | "red" | "na";
  deviationDays: number;
};

type SnapshotPayload = {
  projects?: SnapshotProject[];
  milestones?: SnapshotMilestone[];
};

type ProjectHistoryRow = SnapshotProject & {
  weekKey: string;
  snapshotVersion: number;
  completeness: number;
  progressGap: number;
};

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[]) {
  return values.length
    ? round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : 0;
}

function parsePayload(value: string): SnapshotPayload {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as SnapshotPayload)
      : {};
  } catch {
    return {};
  }
}

function matchesFilters(project: SnapshotProject, filters: TrendFilters) {
  return (
    (!filters.org || project.org === filters.org) &&
    (!filters.type || project.type === filters.type) &&
    (!filters.owner || project.ownerName === filters.owner)
  );
}

export function buildPortfolioTrends(input: {
  snapshots: SnapshotRow[];
  filters?: TrendFilters;
}) {
  const filters = input.filters ?? {};
  const chronological = [...input.snapshots].sort(
    (left, right) =>
      left.weekKey.localeCompare(right.weekKey) ||
      left.version - right.version,
  );
  const latestPayload = chronological.length
    ? parsePayload(chronological.at(-1)!.payloadJson)
    : {};
  const statusCohort = filters.status
    ? new Set(
        (latestPayload.projects ?? [])
          .filter(
            (project) =>
              matchesFilters(project, filters) &&
              project.status === filters.status,
          )
          .map((project) => project.id),
      )
    : null;
  const projectHistory: ProjectHistoryRow[] = [];
  const bottleneckGroups = new Map<
    string,
    {
      name: string;
      sequence: number;
      exposureCount: number;
      redOccurrences: number;
      yellowOccurrences: number;
      delayedOccurrences: number;
      totalDelayDays: number;
      projects: Set<string>;
      weeks: Set<string>;
    }
  >();
  const histories = new Map<string, ProjectHistoryRow[]>();
  let previousStatuses = new Map<string, SnapshotProject["status"]>();

  const points = chronological.map((snapshot) => {
    const payload = parsePayload(snapshot.payloadJson);
    const projects = (payload.projects ?? []).filter(
      (project) =>
        matchesFilters(project, filters) &&
        (!statusCohort || statusCohort.has(project.id)),
    );
    const projectIds = new Set(projects.map((project) => project.id));
    const milestones = (payload.milestones ?? []).filter(
      (milestone) =>
        projectIds.has(milestone.projectId) && milestone.applicable,
    );
    const currentStatuses = new Map(
      projects.map((project) => [project.id, project.status]),
    );
    const newRed = projects.filter(
      (project) =>
        project.status === "red" &&
        previousStatuses.has(project.id) &&
        previousStatuses.get(project.id) !== "red",
    ).length;
    const recovered = projects.filter(
      (project) =>
        project.status !== "red" &&
        previousStatuses.get(project.id) === "red",
    ).length;
    const persistentRed = projects.filter(
      (project) =>
        project.status === "red" &&
        previousStatuses.get(project.id) === "red",
    ).length;

    for (const project of projects) {
      const row: ProjectHistoryRow = {
        ...project,
        weekKey: snapshot.weekKey,
        snapshotVersion: snapshot.version,
        completeness: snapshot.completeness,
        progressGap: round(project.planProgress - project.actualProgress),
      };
      projectHistory.push(row);
      const rows = histories.get(project.id) ?? [];
      rows.push(row);
      histories.set(project.id, rows);
    }

    for (const milestone of milestones) {
      const key =
        milestone.templateId === null
          ? `custom:${milestone.name}`
          : `template:${milestone.templateId}`;
      const group = bottleneckGroups.get(key) ?? {
        name: milestone.name,
        sequence: milestone.sequence,
        exposureCount: 0,
        redOccurrences: 0,
        yellowOccurrences: 0,
        delayedOccurrences: 0,
        totalDelayDays: 0,
        projects: new Set<string>(),
        weeks: new Set<string>(),
      };
      group.exposureCount += 1;
      group.projects.add(milestone.projectId);
      if (milestone.status === "red") {
        group.redOccurrences += 1;
        group.weeks.add(snapshot.weekKey);
      }
      if (milestone.status === "yellow") {
        group.yellowOccurrences += 1;
        group.weeks.add(snapshot.weekKey);
      }
      if (milestone.deviationDays > 0) {
        group.delayedOccurrences += 1;
        group.totalDelayDays += milestone.deviationDays;
        group.weeks.add(snapshot.weekKey);
      }
      bottleneckGroups.set(key, group);
    }

    const total = projects.length || 1;
    const point = {
      weekKey: snapshot.weekKey,
      version: snapshot.version,
      lockedAt: snapshot.lockedAt,
      completeness: snapshot.completeness,
      projectCount: projects.length,
      green: projects.filter((project) => project.status === "green").length,
      yellow: projects.filter((project) => project.status === "yellow").length,
      red: projects.filter((project) => project.status === "red").length,
      avgScore: average(projects.map((project) => project.score)),
      planProgress: round(
        projects.reduce(
          (sum, project) => sum + project.planProgress,
          0,
        ) / total,
      ),
      actualProgress: round(
        projects.reduce(
          (sum, project) => sum + project.actualProgress,
          0,
        ) / total,
      ),
      progressGap: average(
        projects.map(
          (project) => project.planProgress - project.actualProgress,
        ),
      ),
      redMilestones: milestones.filter(
        (milestone) => milestone.status === "red",
      ).length,
      delayedMilestones: milestones.filter(
        (milestone) => milestone.deviationDays > 0,
      ).length,
      newRed,
      recovered,
      persistentRed,
    };
    previousStatuses = currentStatuses;
    return point;
  });

  const chronicBottlenecks = [...bottleneckGroups.values()]
    .map((group) => ({
      name: group.name,
      sequence: group.sequence,
      exposureCount: group.exposureCount,
      affectedProjectCount: group.projects.size,
      affectedWeekCount: group.weeks.size,
      redOccurrences: group.redOccurrences,
      yellowOccurrences: group.yellowOccurrences,
      delayedOccurrences: group.delayedOccurrences,
      redRate: group.exposureCount
        ? round((group.redOccurrences / group.exposureCount) * 100)
        : 0,
      delayedRate: group.exposureCount
        ? round((group.delayedOccurrences / group.exposureCount) * 100)
        : 0,
      avgDelayDays: group.delayedOccurrences
        ? round(group.totalDelayDays / group.delayedOccurrences)
        : 0,
    }))
    .sort(
      (left, right) =>
        right.redRate - left.redRate ||
        right.delayedRate - left.delayedRate ||
        right.affectedWeekCount - left.affectedWeekCount ||
        left.sequence - right.sequence,
    );

  const volatileProjects = [...histories.values()]
    .map((rows) => {
      const ordered = [...rows].sort((left, right) =>
        left.weekKey.localeCompare(right.weekKey),
      );
      let transitions = 0;
      let newRedEntries = 0;
      let recoveries = 0;
      for (let index = 1; index < ordered.length; index += 1) {
        if (ordered[index].status !== ordered[index - 1].status) {
          transitions += 1;
        }
        if (
          ordered[index].status === "red" &&
          ordered[index - 1].status !== "red"
        ) {
          newRedEntries += 1;
        }
        if (
          ordered[index].status !== "red" &&
          ordered[index - 1].status === "red"
        ) {
          recoveries += 1;
        }
      }
      const latest = ordered.at(-1)!;
      return {
        id: latest.id,
        code: latest.code,
        name: latest.name,
        owner: latest.ownerName,
        org: latest.org,
        latestStatus: latest.status,
        observedWeeks: ordered.length,
        redWeeks: ordered.filter((row) => row.status === "red").length,
        yellowWeeks: ordered.filter((row) => row.status === "yellow").length,
        transitions,
        newRedEntries,
        recoveries,
        maxProgressGap: Math.max(...ordered.map((row) => row.progressGap)),
      };
    })
    .sort(
      (left, right) =>
        right.redWeeks - left.redWeeks ||
        right.newRedEntries - left.newRedEntries ||
        right.transitions - left.transitions ||
        right.maxProgressGap - left.maxProgressGap,
    );

  const latestPoint = points.at(-1);
  return {
    summary: {
      weekCount: points.length,
      latestProjectCount: latestPoint?.projectCount ?? 0,
      latestRed: latestPoint?.red ?? 0,
      latestProgressGap: latestPoint?.progressGap ?? 0,
      latestCompleteness: latestPoint?.completeness ?? 0,
      newRedTotal: points.reduce((sum, point) => sum + point.newRed, 0),
      recoveredTotal: points.reduce(
        (sum, point) => sum + point.recovered,
        0,
      ),
      chronicRedProjects: volatileProjects.filter(
        (project) => project.redWeeks >= 2,
      ).length,
      earliestWeek: points.at(0)?.weekKey ?? null,
      latestWeek: latestPoint?.weekKey ?? null,
    },
    points,
    chronicBottlenecks,
    volatileProjects: volatileProjects.slice(0, 20),
    projectHistory,
  };
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function portfolioTrendCsv(
  rows: ReturnType<typeof buildPortfolioTrends>["projectHistory"],
) {
  const statusNames = { green: "绿色", yellow: "黄色", red: "红色" };
  return [
    [
      "快照周期",
      "快照版本",
      "项目编码",
      "项目名称",
      "所属组织",
      "项目类型",
      "负责人",
      "健康状态",
      "健康得分",
      "计划进度(%)",
      "实际进度(%)",
      "进度落后(pp)",
      "周报完整率(%)",
    ],
    ...rows.map((row) => [
      row.weekKey,
      `V${row.snapshotVersion}`,
      row.code,
      row.name,
      row.org,
      row.type,
      row.ownerName,
      statusNames[row.status],
      row.score,
      row.planProgress,
      row.actualProgress,
      row.progressGap,
      row.completeness,
    ]),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}
