const DAY_MS = 86_400_000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type ProjectScheduleTemplate = {
  id: number;
  code: string;
  name: string;
  sequence: number;
  defaultWeight: number;
  critical: boolean;
};

export type ProjectScheduleMilestone = ProjectScheduleTemplate & {
  plannedStart: string;
  plannedFinish: string;
};

function isoDateTimestamp(value: string) {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new Error("项目计划日期格式无效。");
  }
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== value
  ) {
    throw new Error("项目计划日期不存在。");
  }
  return timestamp;
}

export function addIsoDays(value: string, days: number) {
  return new Date(isoDateTimestamp(value) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function isoDaySpan(start: string, finish: string) {
  return Math.floor(
    (isoDateTimestamp(finish) - isoDateTimestamp(start)) / DAY_MS,
  ) + 1;
}

export function buildWeightedProjectSchedule(
  templates: ProjectScheduleTemplate[],
  plannedStart: string,
  plannedFinish: string,
) {
  const sorted = [...templates].sort(
    (left, right) => left.sequence - right.sequence,
  );
  if (!sorted.length) {
    throw new Error("当前没有可用于项目初始化的启用节点。");
  }
  const totalDays = isoDaySpan(plannedStart, plannedFinish);
  if (totalDays < sorted.length) {
    throw new Error(
      `项目周期至少需要${sorted.length}天，确保每个启用节点至少分配1天。`,
    );
  }

  const positiveWeights = sorted.map((template) =>
    Math.max(0, Number(template.defaultWeight) || 0),
  );
  const totalWeight = positiveWeights.reduce((sum, weight) => sum + weight, 0);
  const weights =
    totalWeight > 0 ? positiveWeights : sorted.map(() => 1);
  const normalizedWeight =
    totalWeight > 0 ? totalWeight : sorted.length;
  const distributableDays = totalDays - sorted.length;
  const shares = weights.map(
    (weight) => (distributableDays * weight) / normalizedWeight,
  );
  const extraDays = shares.map((share) => Math.floor(share));
  let remainder =
    distributableDays - extraDays.reduce((sum, value) => sum + value, 0);
  const remainderOrder = shares
    .map((share, index) => ({
      index,
      fraction: share - Math.floor(share),
      sequence: sorted[index].sequence,
    }))
    .sort(
      (left, right) =>
        right.fraction - left.fraction || left.sequence - right.sequence,
    );
  for (const item of remainderOrder) {
    if (remainder <= 0) break;
    extraDays[item.index] += 1;
    remainder -= 1;
  }

  let offset = 0;
  return sorted.map((template, index): ProjectScheduleMilestone => {
    const duration = 1 + extraDays[index];
    const row: ProjectScheduleMilestone = {
      ...template,
      plannedStart: addIsoDays(plannedStart, offset),
      plannedFinish: addIsoDays(plannedStart, offset + duration - 1),
    };
    offset += duration;
    return row;
  });
}

export function validateProjectSchedule(
  milestones: Array<Pick<ProjectScheduleMilestone, "name" | "plannedStart" | "plannedFinish">>,
) {
  if (!milestones.length) {
    throw new Error("请先生成项目节点计划。");
  }
  for (const milestone of milestones) {
    const span = isoDaySpan(milestone.plannedStart, milestone.plannedFinish);
    if (span < 1) {
      throw new Error(`${milestone.name}的计划完成日不能早于计划开始日。`);
    }
  }
}
