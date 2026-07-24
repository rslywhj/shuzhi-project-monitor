export const DELAY_FORECAST_MODEL_VERSION = "delay-v1.0";

export type DelayRiskBand = "low" | "medium" | "high";
export type ForecastConfidence = "low" | "medium" | "high";

type ProjectRow = {
  id: string;
  code: string;
  name: string;
  ownerName: string;
  org: string;
  type: string;
  planProgress: number;
  actualProgress: number;
  riskLevel: "low" | "medium" | "high";
};

type MilestoneRow = {
  id: number;
  projectId: string;
  templateId: number | null;
  name: string;
  sequence: number;
  critical: boolean;
  applicable: boolean;
  plannedStart: string;
  plannedFinish: string;
  forecastFinish: string | null;
  actualFinish: string | null;
  completion: number;
  status: "green" | "yellow" | "red" | "na";
  deviationDays: number;
};

type WeeklyReportRow = {
  projectId: string;
  weekKey: string;
  systemProgress: number;
  declaredProgress: number;
  status: "draft" | "submitted" | "locked";
  submittedAt: string;
};

type RiskRow = {
  projectId: string;
  level: "low" | "medium" | "high";
  status: "open" | "monitoring" | "closed";
};

type CorrectiveActionRow = {
  projectId: string;
  status: "pending" | "in_progress" | "completed" | "overdue";
  recoveryDate: string;
};

export type DelayForecastSignal = {
  code: string;
  label: string;
  impact: number;
  direction: "risk" | "protective" | "context";
};

export type MilestoneDelayForecast = {
  milestoneId: number;
  name: string;
  sequence: number;
  critical: boolean;
  plannedFinish: string;
  probability: number;
  riskBand: DelayRiskBand;
  expectedDelayDays: number;
  forecastFinish: string;
  confidence: ForecastConfidence;
  historicalSampleCount: number;
  historicalDelayRate: number;
  earlyWarning: boolean;
  signals: DelayForecastSignal[];
};

export type ProjectDelayForecast = {
  projectId: string;
  code: string;
  name: string;
  owner: string;
  org: string;
  type: string;
  probability: number;
  riskBand: DelayRiskBand;
  expectedDelayDays: number;
  forecastFinish: string | null;
  confidence: ForecastConfidence;
  highRiskMilestoneCount: number;
  earlyWarning: boolean;
  topMilestone: MilestoneDelayForecast | null;
  milestones: MilestoneDelayForecast[];
  drivers: DelayForecastSignal[];
};

type EmpiricalGroup = {
  samples: number;
  delayed: number;
};

const DAY_MS = 86_400_000;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isoDate(value: string) {
  return value.slice(0, 10);
}

function dateDiffDays(later: string, earlier: string) {
  const laterTime = Date.parse(`${isoDate(later)}T00:00:00Z`);
  const earlierTime = Date.parse(`${isoDate(earlier)}T00:00:00Z`);
  if (!Number.isFinite(laterTime) || !Number.isFinite(earlierTime)) return 0;
  return Math.round((laterTime - earlierTime) / DAY_MS);
}

function addIsoDays(value: string, days: number) {
  const parsed = Date.parse(`${isoDate(value)}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return isoDate(value);
  return new Date(parsed + days * DAY_MS).toISOString().slice(0, 10);
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function logit(probability: number) {
  const safe = clamp(probability, 0.02, 0.98);
  return Math.log(safe / (1 - safe));
}

function riskBand(probability: number): DelayRiskBand {
  if (probability >= 65) return "high";
  if (probability >= 35) return "medium";
  return "low";
}

function empiricalKey(
  project: Pick<ProjectRow, "type">,
  milestone: Pick<MilestoneRow, "templateId" | "name">,
) {
  const milestoneKey =
    milestone.templateId === null
      ? `custom:${milestone.name}`
      : `template:${milestone.templateId}`;
  return {
    milestoneKey,
    typeMilestoneKey: `${project.type}|${milestoneKey}`,
  };
}

function completionExpected(
  milestone: Pick<
    MilestoneRow,
    "plannedStart" | "plannedFinish" | "completion"
  >,
  asOfDate: string,
) {
  const totalDays = Math.max(
    1,
    dateDiffDays(milestone.plannedFinish, milestone.plannedStart),
  );
  const elapsedDays = dateDiffDays(asOfDate, milestone.plannedStart);
  if (elapsedDays <= 0) return 0;
  if (elapsedDays >= totalDays) return 100;
  return round((elapsedDays / totalDays) * 100, 1);
}

function confidence(
  historicalSamples: number,
  reportCount: number,
): ForecastConfidence {
  if (historicalSamples >= 8 && reportCount >= 4) return "high";
  if (historicalSamples >= 3 || reportCount >= 2) return "medium";
  return "low";
}

function createSignal(
  code: string,
  label: string,
  coefficient: number,
): { code: string; label: string; coefficient: number } {
  return { code, label, coefficient };
}

export function buildPortfolioDelayForecast(input: {
  projects: ProjectRow[];
  milestones: MilestoneRow[];
  weeklyReports: WeeklyReportRow[];
  risks: RiskRow[];
  actions: CorrectiveActionRow[];
  asOfDate: string;
  scopeProjectIds?: Set<string>;
}) {
  const projectById = new Map(
    input.projects.map((project) => [project.id, project]),
  );
  const globalGroup: EmpiricalGroup = { samples: 0, delayed: 0 };
  const milestoneGroups = new Map<string, EmpiricalGroup>();
  const typeMilestoneGroups = new Map<string, EmpiricalGroup>();

  for (const milestone of input.milestones) {
    if (!milestone.applicable || milestone.completion < 100) continue;
    const project = projectById.get(milestone.projectId);
    if (!project) continue;
    const delayed =
      milestone.deviationDays > 0 ||
      Boolean(
        milestone.actualFinish &&
          dateDiffDays(milestone.actualFinish, milestone.plannedFinish) > 0,
      );
    const { milestoneKey, typeMilestoneKey } = empiricalKey(
      project,
      milestone,
    );
    const milestoneGroup = milestoneGroups.get(milestoneKey) ?? {
      samples: 0,
      delayed: 0,
    };
    const typeGroup = typeMilestoneGroups.get(typeMilestoneKey) ?? {
      samples: 0,
      delayed: 0,
    };
    globalGroup.samples += 1;
    milestoneGroup.samples += 1;
    typeGroup.samples += 1;
    if (delayed) {
      globalGroup.delayed += 1;
      milestoneGroup.delayed += 1;
      typeGroup.delayed += 1;
    }
    milestoneGroups.set(milestoneKey, milestoneGroup);
    typeMilestoneGroups.set(typeMilestoneKey, typeGroup);
  }

  const globalPrior =
    (globalGroup.delayed + 1.5) / (globalGroup.samples + 5);
  const reportsByProject = new Map<string, WeeklyReportRow[]>();
  for (const report of input.weeklyReports) {
    if (report.status === "draft") continue;
    const rows = reportsByProject.get(report.projectId) ?? [];
    rows.push(report);
    reportsByProject.set(report.projectId, rows);
  }
  for (const rows of reportsByProject.values()) {
    rows.sort(
      (left, right) =>
        right.weekKey.localeCompare(left.weekKey) ||
        right.submittedAt.localeCompare(left.submittedAt),
    );
  }

  const milestonesByProject = new Map<string, MilestoneRow[]>();
  for (const milestone of input.milestones) {
    const rows = milestonesByProject.get(milestone.projectId) ?? [];
    rows.push(milestone);
    milestonesByProject.set(milestone.projectId, rows);
  }
  const risksByProject = new Map<string, RiskRow[]>();
  for (const risk of input.risks) {
    if (risk.status === "closed") continue;
    const rows = risksByProject.get(risk.projectId) ?? [];
    rows.push(risk);
    risksByProject.set(risk.projectId, rows);
  }
  const actionsByProject = new Map<string, CorrectiveActionRow[]>();
  for (const action of input.actions) {
    if (action.status === "completed") continue;
    const rows = actionsByProject.get(action.projectId) ?? [];
    rows.push(action);
    actionsByProject.set(action.projectId, rows);
  }

  const projectForecasts: ProjectDelayForecast[] = [];
  for (const project of input.projects) {
    if (
      input.scopeProjectIds &&
      !input.scopeProjectIds.has(project.id)
    ) {
      continue;
    }
    const projectReports = reportsByProject.get(project.id) ?? [];
    const projectRisks = risksByProject.get(project.id) ?? [];
    const projectActions = actionsByProject.get(project.id) ?? [];
    const highRiskCount = projectRisks.filter(
      (risk) => risk.level === "high",
    ).length;
    const mediumRiskCount = projectRisks.filter(
      (risk) => risk.level === "medium",
    ).length;
    const overdueActionCount = projectActions.filter(
      (action) =>
        action.status === "overdue" ||
        (Boolean(action.recoveryDate) &&
          isoDate(action.recoveryDate) < input.asOfDate),
    ).length;
    const progressGap = round(
      project.planProgress - project.actualProgress,
      1,
    );
    const latestReport = projectReports[0];
    const previousReport = projectReports[1];
    const reportAgeDays = latestReport
      ? Math.max(
          0,
          dateDiffDays(input.asOfDate, isoDate(latestReport.submittedAt)),
        )
      : 999;
    const stalled =
      Boolean(latestReport && previousReport) &&
      latestReport.systemProgress < 100 &&
      latestReport.systemProgress - previousReport.systemProgress < 1;
    const milestoneForecasts: MilestoneDelayForecast[] = [];

    for (const milestone of milestonesByProject.get(project.id) ?? []) {
      if (
        !milestone.applicable ||
        milestone.completion >= 100 ||
        milestone.actualFinish
      ) {
        continue;
      }
      const { milestoneKey, typeMilestoneKey } = empiricalKey(
        project,
        milestone,
      );
      const milestoneGroup = milestoneGroups.get(milestoneKey) ?? {
        samples: 0,
        delayed: 0,
      };
      const typeGroup = typeMilestoneGroups.get(typeMilestoneKey) ?? {
        samples: 0,
        delayed: 0,
      };
      const milestonePrior =
        (milestoneGroup.delayed + globalPrior * 4) /
        (milestoneGroup.samples + 4);
      const typePrior =
        (typeGroup.delayed + milestonePrior * 3) /
        (typeGroup.samples + 3);
      let score = logit(typePrior);
      const rawSignals: Array<{
        code: string;
        label: string;
        coefficient: number;
      }> = [];
      const forecastDelayDays = milestone.forecastFinish
        ? Math.max(
            0,
            dateDiffDays(
              milestone.forecastFinish,
              milestone.plannedFinish,
            ),
          )
        : Math.max(0, milestone.deviationDays);
      const overdueDays = Math.max(
        0,
        dateDiffDays(input.asOfDate, milestone.plannedFinish),
      );
      const expectedCompletion = completionExpected(
        milestone,
        input.asOfDate,
      );
      const completionGap = round(
        expectedCompletion - milestone.completion,
        1,
      );

      if (forecastDelayDays > 0) {
        rawSignals.push(
          createSignal(
            "forecast_delay",
            `预测完成日已晚于计划 ${forecastDelayDays} 天`,
            Math.min(2.2, 0.35 + forecastDelayDays * 0.12),
          ),
        );
      } else if (milestone.forecastFinish) {
        rawSignals.push(
          createSignal(
            "forecast_on_time",
            "预测完成日未晚于当前计划",
            -0.38,
          ),
        );
      }
      if (progressGap > 3) {
        rawSignals.push(
          createSignal(
            "project_progress_gap",
            `项目实际进度落后计划 ${progressGap} 个百分点`,
            Math.min(1.25, (progressGap - 3) * 0.065),
          ),
        );
      } else if (progressGap < -3) {
        rawSignals.push(
          createSignal(
            "project_progress_ahead",
            `项目实际进度领先计划 ${Math.abs(progressGap)} 个百分点`,
            -0.3,
          ),
        );
      }
      if (completionGap > 10) {
        rawSignals.push(
          createSignal(
            "milestone_completion_gap",
            `按时间窗口应完成 ${expectedCompletion}%，当前为 ${milestone.completion}%`,
            Math.min(1.25, completionGap * 0.022),
          ),
        );
      } else if (completionGap < -15) {
        rawSignals.push(
          createSignal(
            "milestone_completion_ahead",
            `节点完成度领先时间窗口 ${Math.abs(completionGap)} 个百分点`,
            -0.3,
          ),
        );
      }
      if (milestone.status === "yellow") {
        rawSignals.push(
          createSignal("milestone_yellow", "节点当前为黄色预警", 0.45),
        );
      } else if (milestone.status === "red") {
        rawSignals.push(
          createSignal("milestone_red", "节点当前已触发红色预警", 1),
        );
      }
      if (highRiskCount > 0) {
        rawSignals.push(
          createSignal(
            "high_risk",
            `项目存在 ${highRiskCount} 项开放高风险`,
            Math.min(0.9, highRiskCount * 0.55),
          ),
        );
      } else if (mediumRiskCount > 0) {
        rawSignals.push(
          createSignal(
            "medium_risk",
            `项目存在 ${mediumRiskCount} 项开放中风险`,
            Math.min(0.45, mediumRiskCount * 0.2),
          ),
        );
      }
      if (overdueActionCount > 0) {
        rawSignals.push(
          createSignal(
            "overdue_action",
            `项目存在 ${overdueActionCount} 项逾期纠偏措施`,
            Math.min(0.75, overdueActionCount * 0.35),
          ),
        );
      }
      if (stalled) {
        rawSignals.push(
          createSignal(
            "progress_stalled",
            "最近两个正式周期的系统进度增量不足 1 个百分点",
            0.38,
          ),
        );
      }
      if (reportAgeDays > 14) {
        rawSignals.push(
          createSignal(
            "report_stale",
            latestReport
              ? `最近正式周报距今 ${reportAgeDays} 天`
              : "尚无正式周报",
            0.48,
          ),
        );
      } else if (reportAgeDays > 7) {
        rawSignals.push(
          createSignal(
            "report_aging",
            `最近正式周报距今 ${reportAgeDays} 天`,
            0.22,
          ),
        );
      }
      if (milestone.critical) {
        rawSignals.push(
          createSignal("critical", "该节点为关键节点", 0.15),
        );
      }
      if (overdueDays > 0) {
        rawSignals.push(
          createSignal(
            "already_overdue",
            `计划完成日已过去 ${overdueDays} 天且节点未完成`,
            4,
          ),
        );
      }

      const signals: DelayForecastSignal[] = [
        {
          code: "historical_prior",
          label:
            milestoneGroup.samples > 0
              ? `同类节点历史延期率 ${round(
                  (milestoneGroup.delayed / milestoneGroup.samples) * 100,
                )}%（${milestoneGroup.samples} 个样本）`
              : `同类节点暂无完成样本，采用组合平滑先验 ${round(
                  globalPrior * 100,
                )}%`,
          impact: 0,
          direction: "context",
        },
      ];
      for (const signal of rawSignals) {
        const before = sigmoid(score);
        score += signal.coefficient;
        const after = sigmoid(score);
        signals.push({
          code: signal.code,
          label: signal.label,
          impact: round((after - before) * 100),
          direction:
            signal.coefficient >= 0 ? "risk" : "protective",
        });
      }
      const probability =
        overdueDays > 0
          ? 99
          : clamp(round(sigmoid(score) * 100), 5, 95);
      const expectedDelayDays =
        overdueDays > 0
          ? Math.max(
              1,
              overdueDays,
              forecastDelayDays,
              milestone.deviationDays,
            )
          : Math.max(
              forecastDelayDays,
              round(
                (Math.max(0, probability - 35) / 65) * 14 +
                  Math.max(0, completionGap) / 25 +
                  Math.max(0, progressGap) / 8,
              ),
            );
      const band = riskBand(probability);
      milestoneForecasts.push({
        milestoneId: milestone.id,
        name: milestone.name,
        sequence: milestone.sequence,
        critical: milestone.critical,
        plannedFinish: milestone.plannedFinish,
        probability,
        riskBand: band,
        expectedDelayDays,
        forecastFinish: addIsoDays(
          milestone.plannedFinish,
          expectedDelayDays,
        ),
        confidence: confidence(
          milestoneGroup.samples + typeGroup.samples,
          projectReports.length,
        ),
        historicalSampleCount:
          milestoneGroup.samples + typeGroup.samples,
        historicalDelayRate:
          milestoneGroup.samples > 0
            ? round(
                (milestoneGroup.delayed / milestoneGroup.samples) * 100,
              )
            : round(globalPrior * 100),
        earlyWarning:
          band === "high" &&
          milestone.status !== "red" &&
          overdueDays === 0,
        signals: signals.sort(
          (left, right) =>
            Math.abs(right.impact) - Math.abs(left.impact) ||
            left.code.localeCompare(right.code),
        ),
      });
    }

    milestoneForecasts.sort(
      (left, right) =>
        right.probability - left.probability ||
        Number(right.critical) - Number(left.critical) ||
        left.sequence - right.sequence,
    );
    const topMilestone = milestoneForecasts[0] ?? null;
    const probability = topMilestone?.probability ?? 0;
    projectForecasts.push({
      projectId: project.id,
      code: project.code,
      name: project.name,
      owner: project.ownerName,
      org: project.org,
      type: project.type,
      probability,
      riskBand: topMilestone?.riskBand ?? "low",
      expectedDelayDays: topMilestone?.expectedDelayDays ?? 0,
      forecastFinish: topMilestone?.forecastFinish ?? null,
      confidence: topMilestone?.confidence ?? "low",
      highRiskMilestoneCount: milestoneForecasts.filter(
        (milestone) => milestone.riskBand === "high",
      ).length,
      earlyWarning: milestoneForecasts.some(
        (milestone) => milestone.earlyWarning,
      ),
      topMilestone,
      milestones: milestoneForecasts,
      drivers:
        topMilestone?.signals
          .filter((signal) => signal.direction !== "context")
          .slice(0, 4) ?? [],
    });
  }

  projectForecasts.sort(
    (left, right) =>
      right.probability - left.probability ||
      right.highRiskMilestoneCount - left.highRiskMilestoneCount ||
      left.code.localeCompare(right.code, "zh-CN"),
  );
  return {
    model: {
      version: DELAY_FORECAST_MODEL_VERSION,
      method:
        "同类节点历史延期先验 + 当前进度、预测日期、风险、措施和周报时效的可解释规则融合",
      asOfDate: input.asOfDate,
      historicalSampleCount: globalGroup.samples,
      generatedAt: new Date().toISOString(),
    },
    summary: {
      analyzedProjectCount: projectForecasts.length,
      highRiskProjectCount: projectForecasts.filter(
        (project) => project.riskBand === "high",
      ).length,
      mediumRiskProjectCount: projectForecasts.filter(
        (project) => project.riskBand === "medium",
      ).length,
      lowRiskProjectCount: projectForecasts.filter(
        (project) => project.riskBand === "low",
      ).length,
      earlyWarningProjectCount: projectForecasts.filter(
        (project) => project.earlyWarning,
      ).length,
      highRiskMilestoneCount: projectForecasts.reduce(
        (sum, project) => sum + project.highRiskMilestoneCount,
        0,
      ),
      averageProbability: projectForecasts.length
        ? round(
            projectForecasts.reduce(
              (sum, project) => sum + project.probability,
              0,
            ) / projectForecasts.length,
            1,
          )
        : 0,
    },
    projects: projectForecasts,
  };
}
