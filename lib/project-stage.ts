export type MilestoneExecutionStatus =
  | "not_started"
  | "in_progress"
  | "paused"
  | "completed";

export type ProjectStageState = "not_started" | "active" | "completed";
export type ProjectStagePrimaryBasis =
  | "manager_confirmed"
  | "system_recommended"
  | "legacy_inferred"
  | "none";

export type ProjectStageMilestone = {
  id: number;
  sequence: number;
  applicable: boolean;
  critical: boolean;
  completion: number;
  plannedStart: string;
  plannedFinish: string;
  actualFinish?: string | null;
  executionStatus?: MilestoneExecutionStatus | null;
};

export type ProjectStageSummary = {
  projectId: string;
  asOfDate: string;
  state: ProjectStageState;
  primaryMilestoneId: number | null;
  primaryBasis: ProjectStagePrimaryBasis;
  activeMilestoneIds: number[];
  parallelMilestoneIds: number[];
  carryoverMilestoneIds: number[];
  overdueCarryoverMilestoneIds: number[];
  shouldStartMilestoneIds: number[];
  nextMilestoneId: number | null;
};

function completed(milestone: ProjectStageMilestone) {
  return (
    milestone.executionStatus === "completed" ||
    milestone.completion >= 100 ||
    Boolean(milestone.actualFinish)
  );
}

function explicitActive(milestone: ProjectStageMilestone) {
  return (
    milestone.executionStatus === "in_progress" ||
    milestone.executionStatus === "paused"
  );
}

function legacyActive(milestone: ProjectStageMilestone) {
  return !milestone.executionStatus && milestone.completion > 0 && !completed(milestone);
}

function rankPrimary(
  left: ProjectStageMilestone,
  right: ProjectStageMilestone,
  asOfDate: string,
) {
  const leftInProgress = left.executionStatus === "in_progress" ? 1 : 0;
  const rightInProgress = right.executionStatus === "in_progress" ? 1 : 0;
  return (
    rightInProgress - leftInProgress ||
    Number(right.critical) - Number(left.critical) ||
    Number(right.plannedFinish < asOfDate) -
      Number(left.plannedFinish < asOfDate) ||
    left.plannedFinish.localeCompare(right.plannedFinish) ||
    left.sequence - right.sequence
  );
}

export function calculateProjectStage(input: {
  projectId: string;
  milestones: ProjectStageMilestone[];
  asOfDate: string;
  confirmedPrimaryMilestoneId?: number | null;
  lifecycleStatus?: "active" | "completed" | "archived";
}): ProjectStageSummary {
  const applicable = input.milestones
    .filter((milestone) => milestone.applicable)
    .sort((left, right) => left.sequence - right.sequence);
  const incomplete = applicable.filter((milestone) => !completed(milestone));
  const active = incomplete.filter(
    (milestone) => explicitActive(milestone) || legacyActive(milestone),
  );
  const shouldStart = incomplete.filter(
    (milestone) =>
      !active.includes(milestone) &&
      milestone.executionStatus !== "paused" &&
      milestone.plannedStart <= input.asOfDate,
  );
  const lifecycleClosed =
    input.lifecycleStatus === "completed" || input.lifecycleStatus === "archived";
  const confirmed = lifecycleClosed
    ? undefined
    : active.find(
        (milestone) => milestone.id === input.confirmedPrimaryMilestoneId,
      );
  const ranked = [...active].sort((left, right) =>
    rankPrimary(left, right, input.asOfDate),
  );
  const primary = lifecycleClosed ? undefined : (confirmed ?? ranked[0]);
  const primaryBasis: ProjectStagePrimaryBasis = confirmed
    ? "manager_confirmed"
    : primary
      ? primary.executionStatus
        ? "system_recommended"
        : "legacy_inferred"
      : "none";
  const carryovers = primary
    ? incomplete.filter(
        (milestone) =>
          milestone.id !== primary.id && milestone.sequence < primary.sequence,
      )
    : [];
  const next = primary
    ? incomplete.find((milestone) => milestone.sequence > primary.sequence)
    : incomplete.find((milestone) => milestone.plannedStart > input.asOfDate) ??
      shouldStart[0] ??
      incomplete[0];
  const state: ProjectStageState =
    lifecycleClosed || (applicable.length > 0 && incomplete.length === 0)
      ? "completed"
      : primary
        ? "active"
        : "not_started";

  return {
    projectId: input.projectId,
    asOfDate: input.asOfDate,
    state,
    primaryMilestoneId: primary?.id ?? null,
    primaryBasis,
    activeMilestoneIds: lifecycleClosed ? [] : active.map((milestone) => milestone.id),
    parallelMilestoneIds: lifecycleClosed
      ? []
      : active
          .filter((milestone) => milestone.id !== primary?.id)
          .map((milestone) => milestone.id),
    carryoverMilestoneIds: carryovers.map((milestone) => milestone.id),
    overdueCarryoverMilestoneIds: carryovers
      .filter((milestone) => milestone.plannedFinish < input.asOfDate)
      .map((milestone) => milestone.id),
    shouldStartMilestoneIds: lifecycleClosed
      ? []
      : shouldStart.map((milestone) => milestone.id),
    nextMilestoneId: lifecycleClosed ? null : (next?.id ?? null),
  };
}

export function latestConfirmedPrimary(
  reports: Array<{
    projectId: string;
    weekKey: string;
    status: "draft" | "submitted" | "locked";
    primaryMilestoneId?: number | null;
  }>,
) {
  const result = new Map<string, number>();
  for (const report of [...reports].sort((left, right) =>
    right.weekKey.localeCompare(left.weekKey),
  )) {
    if (
      report.status !== "draft" &&
      report.primaryMilestoneId &&
      !result.has(report.projectId)
    ) {
      result.set(report.projectId, report.primaryMilestoneId);
    }
  }
  return result;
}
