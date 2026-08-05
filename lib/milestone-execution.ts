import {
  ApiRequestError,
  requiredIsoDate,
  safeNumber,
} from "./api-utils.ts";
import type { MilestoneExecutionStatus } from "./project-stage.ts";

export type MilestoneExecutionPayload = {
  milestoneId?: number;
  sequence?: number;
  executionStatus?: MilestoneExecutionStatus;
  completion?: number;
  actualStart?: string | null;
  forecastFinish?: string | null;
  actualFinish?: string | null;
  pausedReason?: string | null;
  reason?: string | null;
};

export type CurrentMilestoneExecution = {
  id: number;
  sequence: number;
  applicable: boolean;
  completion: number;
  plannedFinish: string;
  executionStatus?: MilestoneExecutionStatus | null;
  actualStart?: string | null;
  forecastFinish?: string | null;
  actualFinish?: string | null;
  pausedReason?: string | null;
  reason?: string | null;
};

export type NormalizedMilestoneExecution = {
  id: number;
  executionStatus: MilestoneExecutionStatus;
  completion: number;
  actualStart: string | null;
  forecastFinish: string | null;
  actualFinish: string | null;
  pausedReason: string;
  reason: string;
  deviationDays: number;
};

function optionalIsoDate(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return null;
  return requiredIsoDate(value, label);
}

function inferredStatus(
  completion: number,
  actualFinish: string | null,
): MilestoneExecutionStatus {
  if (completion >= 100 || actualFinish) return "completed";
  if (completion > 0) return "in_progress";
  return "not_started";
}

export function normalizeMilestoneExecution(
  current: CurrentMilestoneExecution,
  payload: MilestoneExecutionPayload,
  options: { strict: boolean },
): NormalizedMilestoneExecution {
  if (!current.applicable) {
    throw new ApiRequestError("不适用节点不能更新执行状态。");
  }
  const completion = safeNumber(
    payload.completion ?? current.completion,
    "节点完成度",
  );
  const requestedActualFinish = optionalIsoDate(
    payload.actualFinish,
    "节点实际完成日",
  );
  const executionStatus =
    payload.executionStatus ??
    inferredStatus(completion, requestedActualFinish ?? current.actualFinish ?? null);
  const actualStart = optionalIsoDate(
    payload.actualStart ?? current.actualStart,
    "节点实际开始日",
  );
  const forecastFinish = optionalIsoDate(
    payload.forecastFinish ?? current.forecastFinish,
    "节点预测完成日",
  );
  const actualFinish =
    executionStatus === "completed"
      ? optionalIsoDate(
          payload.actualFinish ?? current.actualFinish ?? forecastFinish,
          "节点实际完成日",
        )
      : null;
  const pausedReason = String(
    payload.pausedReason ?? current.pausedReason ?? "",
  ).trim();
  const reason = String(payload.reason ?? current.reason ?? "").trim();

  if (executionStatus === "not_started") {
    if (completion !== 0) {
      throw new ApiRequestError("未开始节点的完成度必须为0%。");
    }
    if (actualStart || actualFinish) {
      throw new ApiRequestError("未开始节点不能填写实际开始或实际完成日期。");
    }
  }
  if (executionStatus === "in_progress" || executionStatus === "paused") {
    if (completion >= 100) {
      throw new ApiRequestError("进行中或暂停节点的完成度必须低于100%。");
    }
    if (options.strict && !actualStart) {
      throw new ApiRequestError("进行中或暂停节点必须填写实际开始日期。");
    }
  }
  if (executionStatus === "paused" && !pausedReason) {
    throw new ApiRequestError("暂停节点必须填写暂停原因。");
  }
  if (executionStatus === "completed") {
    if (completion !== 100) {
      throw new ApiRequestError("已完成节点的完成度必须为100%。");
    }
    if (!actualFinish) {
      throw new ApiRequestError("已完成节点必须填写实际完成日期。");
    }
  }
  if (completion < current.completion && reason.length < 10) {
    throw new ApiRequestError("节点完成度下降时必须填写不少于10个字符的调整原因。");
  }
  if (
    current.executionStatus === "completed" &&
    executionStatus !== "completed" &&
    reason.length < 10
  ) {
    throw new ApiRequestError("已完成节点回退时必须填写不少于10个字符的调整原因。");
  }
  if (actualStart && actualFinish && actualFinish < actualStart) {
    throw new ApiRequestError("节点实际完成日期不能早于实际开始日期。");
  }
  const effectiveFinish = actualFinish ?? forecastFinish;
  const deviationDays = effectiveFinish
    ? Math.round(
        (Date.parse(`${effectiveFinish}T00:00:00Z`) -
          Date.parse(`${current.plannedFinish}T00:00:00Z`)) /
          86_400_000,
      )
    : 0;

  return {
    id: current.id,
    executionStatus,
    completion,
    actualStart,
    forecastFinish,
    actualFinish,
    pausedReason: executionStatus === "paused" ? pausedReason : "",
    reason,
    deviationDays,
  };
}
