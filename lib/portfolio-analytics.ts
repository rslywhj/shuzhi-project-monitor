type ProjectRow = {
  id: string;
  code: string;
  name: string;
  ownerEmail: string;
  ownerName: string;
  org: string;
  type: string;
  score: number;
  status: "green" | "yellow" | "red";
  planProgress: number;
  actualProgress: number;
  currentBaselineVersion: number;
};

type MilestoneRow = {
  id: number;
  projectId: string;
  templateId: number | null;
  name: string;
  sequence: number;
  applicable: boolean;
  status: "green" | "yellow" | "red" | "na";
  deviationDays: number;
  plannedFinish: string;
};

type BaselineVersionRow = {
  projectId: string;
  milestoneJson: string;
};

type BaselineMilestone = {
  milestoneId?: number;
  templateId?: number | null;
  name: string;
  sequence: number;
  plannedFinish: string;
  applicable?: boolean;
};

export type PortfolioAnalyticsFilters = {
  org?: string;
  type?: string;
  owner?: string;
  status?: "green" | "yellow" | "red";
};

type ProjectAnalysis = {
  id: string;
  code: string;
  name: string;
  owner: string;
  ownerEmail: string;
  org: string;
  type: string;
  status: "green" | "yellow" | "red";
  score: number;
  planProgress: number;
  actualProgress: number;
  progressGap: number;
  baselineVersion: number;
  changedMilestoneCount: number;
  cumulativeBaselineDriftDays: number;
  latestFinishDriftDays: number;
  delayedMilestoneCount: number;
  redMilestoneCount: number;
};

const DAY_MS = 86_400_000;

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[]) {
  return values.length
    ? round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : 0;
}

function dateDiffDays(later: string, earlier: string) {
  const laterTime = Date.parse(`${later}T00:00:00Z`);
  const earlierTime = Date.parse(`${earlier}T00:00:00Z`);
  if (!Number.isFinite(laterTime) || !Number.isFinite(earlierTime)) return 0;
  return Math.round((laterTime - earlierTime) / DAY_MS);
}

function parseBaselineMilestones(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as BaselineMilestone[]) : [];
  } catch {
    return [];
  }
}

function milestoneKeys(milestone: {
  id?: number;
  milestoneId?: number;
  templateId?: number | null;
  name: string;
  sequence: number;
}) {
  const keys: string[] = [];
  if (milestone.templateId !== null && milestone.templateId !== undefined) {
    keys.push(`template:${milestone.templateId}`);
  }
  if (milestone.milestoneId !== undefined) {
    keys.push(`milestone:${milestone.milestoneId}`);
  }
  if (milestone.id !== undefined) {
    keys.push(`milestone:${milestone.id}`);
  }
  keys.push(`sequence:${milestone.sequence}:${milestone.name}`);
  return keys;
}

function dimensionRows(
  rows: ProjectAnalysis[],
  key: "org" | "type" | "owner",
) {
  const groups = new Map<string, ProjectAnalysis[]>();
  for (const row of rows) {
    const name = row[key];
    const members = groups.get(name) ?? [];
    members.push(row);
    groups.set(name, members);
  }
  return [...groups.entries()]
    .map(([name, members]) => ({
      name,
      projectCount: members.length,
      green: members.filter((member) => member.status === "green").length,
      yellow: members.filter((member) => member.status === "yellow").length,
      red: members.filter((member) => member.status === "red").length,
      avgScore: average(members.map((member) => member.score)),
      avgProgressGap: average(
        members.map((member) => member.progressGap),
      ),
      avgBaselineDriftDays: average(
        members.map((member) => member.latestFinishDriftDays),
      ),
    }))
    .sort(
      (left, right) =>
        right.red - left.red ||
        right.avgProgressGap - left.avgProgressGap ||
        right.projectCount - left.projectCount ||
        left.name.localeCompare(right.name, "zh-CN"),
    );
}

export function buildPortfolioAnalytics(input: {
  projects: ProjectRow[];
  milestones: MilestoneRow[];
  originalBaselines: BaselineVersionRow[];
  filters?: PortfolioAnalyticsFilters;
}) {
  const baselineByProject = new Map(
    input.originalBaselines.map((baseline) => [
      baseline.projectId,
      parseBaselineMilestones(baseline.milestoneJson),
    ]),
  );
  const milestonesByProject = new Map<string, MilestoneRow[]>();
  for (const milestone of input.milestones) {
    const rows = milestonesByProject.get(milestone.projectId) ?? [];
    rows.push(milestone);
    milestonesByProject.set(milestone.projectId, rows);
  }

  const allProjectRows: ProjectAnalysis[] = input.projects.map((project) => {
    const currentMilestones = milestonesByProject.get(project.id) ?? [];
    const originalMilestones = baselineByProject.get(project.id) ?? [];
    const originalByKey = new Map<string, BaselineMilestone>();
    for (const milestone of originalMilestones) {
      for (const key of milestoneKeys(milestone)) {
        originalByKey.set(key, milestone);
      }
    }
    const baselineDrifts = currentMilestones
      .filter((milestone) => milestone.applicable)
      .map((milestone) => {
        const original = milestoneKeys(milestone)
          .map((key) => originalByKey.get(key))
          .find(Boolean);
        return original
          ? dateDiffDays(milestone.plannedFinish, original.plannedFinish)
          : 0;
      });
    const originalLatestFinish = originalMilestones
      .filter((milestone) => milestone.applicable !== false)
      .map((milestone) => milestone.plannedFinish)
      .filter(Boolean)
      .sort()
      .at(-1);
    const currentLatestFinish = currentMilestones
      .filter((milestone) => milestone.applicable)
      .map((milestone) => milestone.plannedFinish)
      .filter(Boolean)
      .sort()
      .at(-1);
    return {
      id: project.id,
      code: project.code,
      name: project.name,
      owner: project.ownerName,
      ownerEmail: project.ownerEmail,
      org: project.org,
      type: project.type,
      status: project.status,
      score: project.score,
      planProgress: project.planProgress,
      actualProgress: project.actualProgress,
      progressGap: round(project.planProgress - project.actualProgress),
      baselineVersion: project.currentBaselineVersion,
      changedMilestoneCount: baselineDrifts.filter((days) => days !== 0).length,
      cumulativeBaselineDriftDays: baselineDrifts.reduce(
        (sum, days) => sum + days,
        0,
      ),
      latestFinishDriftDays:
        currentLatestFinish && originalLatestFinish
          ? dateDiffDays(currentLatestFinish, originalLatestFinish)
          : 0,
      delayedMilestoneCount: currentMilestones.filter(
        (milestone) => milestone.applicable && milestone.deviationDays > 0,
      ).length,
      redMilestoneCount: currentMilestones.filter(
        (milestone) => milestone.applicable && milestone.status === "red",
      ).length,
    };
  });
  const filters = input.filters ?? {};
  const projectRows = allProjectRows.filter(
    (project) =>
      (!filters.org || project.org === filters.org) &&
      (!filters.type || project.type === filters.type) &&
      (!filters.owner || project.owner === filters.owner) &&
      (!filters.status || project.status === filters.status),
  );
  const projectIds = new Set(projectRows.map((project) => project.id));

  const bottleneckGroups = new Map<
    string,
    {
      name: string;
      sequence: number;
      projectIds: Set<string>;
      applicableCount: number;
      delayedCount: number;
      yellowCount: number;
      redCount: number;
      totalDelayDays: number;
      maxDelayDays: number;
    }
  >();
  for (const milestone of input.milestones) {
    if (!projectIds.has(milestone.projectId) || !milestone.applicable) continue;
    const key =
      milestone.templateId === null
        ? `custom:${milestone.name}`
        : `template:${milestone.templateId}`;
    const group = bottleneckGroups.get(key) ?? {
      name: milestone.name,
      sequence: milestone.sequence,
      projectIds: new Set<string>(),
      applicableCount: 0,
      delayedCount: 0,
      yellowCount: 0,
      redCount: 0,
      totalDelayDays: 0,
      maxDelayDays: 0,
    };
    group.projectIds.add(milestone.projectId);
    group.applicableCount += 1;
    if (milestone.deviationDays > 0) {
      group.delayedCount += 1;
      group.totalDelayDays += milestone.deviationDays;
      group.maxDelayDays = Math.max(
        group.maxDelayDays,
        milestone.deviationDays,
      );
    }
    if (milestone.status === "yellow") group.yellowCount += 1;
    if (milestone.status === "red") group.redCount += 1;
    bottleneckGroups.set(key, group);
  }

  const bottlenecks = [...bottleneckGroups.values()]
    .map((group) => ({
      name: group.name,
      sequence: group.sequence,
      projectCount: group.projectIds.size,
      applicableCount: group.applicableCount,
      delayedCount: group.delayedCount,
      delayedRate: group.applicableCount
        ? round((group.delayedCount / group.applicableCount) * 100)
        : 0,
      yellowCount: group.yellowCount,
      redCount: group.redCount,
      avgDelayDays: group.delayedCount
        ? round(group.totalDelayDays / group.delayedCount)
        : 0,
      maxDelayDays: group.maxDelayDays,
    }))
    .sort(
      (left, right) =>
        right.redCount - left.redCount ||
        right.delayedRate - left.delayedRate ||
        right.avgDelayDays - left.avgDelayDays ||
        left.sequence - right.sequence,
    );

  return {
    summary: {
      projectCount: projectRows.length,
      green: projectRows.filter((project) => project.status === "green").length,
      yellow: projectRows.filter((project) => project.status === "yellow").length,
      red: projectRows.filter((project) => project.status === "red").length,
      avgScore: average(projectRows.map((project) => project.score)),
      avgPlanProgress: average(
        projectRows.map((project) => project.planProgress),
      ),
      avgActualProgress: average(
        projectRows.map((project) => project.actualProgress),
      ),
      avgProgressGap: average(
        projectRows.map((project) => project.progressGap),
      ),
      delayedMilestoneCount: projectRows.reduce(
        (sum, project) => sum + project.delayedMilestoneCount,
        0,
      ),
      avgLatestFinishDriftDays: average(
        projectRows.map((project) => project.latestFinishDriftDays),
      ),
    },
    dimensions: {
      org: dimensionRows(projectRows, "org"),
      type: dimensionRows(projectRows, "type"),
      owner: dimensionRows(projectRows, "owner"),
    },
    bottlenecks,
    baselineDrift: [...projectRows]
      .sort(
        (left, right) =>
          right.latestFinishDriftDays - left.latestFinishDriftDays ||
          right.cumulativeBaselineDriftDays -
            left.cumulativeBaselineDriftDays ||
          right.changedMilestoneCount - left.changedMilestoneCount,
      )
      .slice(0, 20),
    projects: projectRows,
    filterOptions: {
      orgs: [...new Set(allProjectRows.map((project) => project.org))].sort(
        (left, right) => left.localeCompare(right, "zh-CN"),
      ),
      types: [...new Set(allProjectRows.map((project) => project.type))].sort(
        (left, right) => left.localeCompare(right, "zh-CN"),
      ),
      owners: [...new Set(allProjectRows.map((project) => project.owner))].sort(
        (left, right) => left.localeCompare(right, "zh-CN"),
      ),
    },
  };
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function portfolioAnalyticsCsv(
  rows: ReturnType<typeof buildPortfolioAnalytics>["projects"],
  delayForecasts: Array<{
    projectId: string;
    probability: number;
    riskBand: "low" | "medium" | "high";
    expectedDelayDays: number;
    forecastFinish: string | null;
    confidence: "low" | "medium" | "high";
    topMilestone: { name: string } | null;
    earlyWarning: boolean;
  }> = [],
) {
  const forecastByProject = new Map(
    delayForecasts.map((forecast) => [forecast.projectId, forecast]),
  );
  const headers = [
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
    "当前基线版本",
    "变更节点数",
    "累计基线漂移(天)",
    "最终完成日漂移(天)",
    "延期节点数",
    "红色节点数",
    "预测延期概率(%)",
    "预测风险等级",
    "预测关注节点",
    "预计延期(天)",
    "预测完成日",
    "预测置信度",
    "提前预警",
  ];
  const statusNames = { green: "绿色", yellow: "黄色", red: "红色" };
  const riskBandNames = { low: "低", medium: "中", high: "高" };
  const confidenceNames = { low: "低", medium: "中", high: "高" };
  return [
    headers,
    ...rows.map((row) => {
      const forecast = forecastByProject.get(row.id);
      return [
        row.code,
        row.name,
        row.org,
        row.type,
        row.owner,
        statusNames[row.status],
        row.score,
        row.planProgress,
        row.actualProgress,
        row.progressGap,
        `V${row.baselineVersion}`,
        row.changedMilestoneCount,
        row.cumulativeBaselineDriftDays,
        row.latestFinishDriftDays,
        row.delayedMilestoneCount,
        row.redMilestoneCount,
        forecast?.probability ?? 0,
        forecast ? riskBandNames[forecast.riskBand] : "低",
        forecast?.topMilestone?.name ?? "",
        forecast?.expectedDelayDays ?? 0,
        forecast?.forecastFinish ?? "",
        forecast ? confidenceNames[forecast.confidence] : "低",
        forecast?.earlyWarning ? "是" : "否",
      ];
    }),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}
