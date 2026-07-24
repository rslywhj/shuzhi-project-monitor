import { and, desc, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import {
  correctiveActions,
  milestones,
  projects,
  risks,
  ruleConfigs,
  weeklyReports,
} from "@/db/schema";

const DAY_MS = 86_400_000;
const WEEK_MS = DAY_MS * 7;

function utcDay(value: string) {
  return Date.parse(`${value}T00:00:00Z`);
}

function isoWeekStart(value: string) {
  const match = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  const januaryFourth = Date.UTC(year, 0, 4);
  const januaryFourthDay = new Date(januaryFourth).getUTCDay() || 7;
  return januaryFourth - (januaryFourthDay - 1) * DAY_MS + (week - 1) * WEEK_MS;
}

function isoWeekKey(value = shanghaiDate()) {
  const date = new Date(`${value}T00:00:00Z`);
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((utc.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7,
  );
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function shanghaiDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

function evaluationDate(weekKey?: string, asOfDate?: string) {
  const weekStart = weekKey ? isoWeekStart(weekKey) : null;
  const today = asOfDate ?? shanghaiDate();
  if (weekStart === null) return today;
  const friday = new Date(weekStart + 4 * DAY_MS).toISOString().slice(0, 10);
  return weekKey === isoWeekKey(today) && friday > today ? today : friday;
}

function weeksBetween(later: string, earlier: string) {
  const laterStart = isoWeekStart(later);
  const earlierStart = isoWeekStart(earlier);
  if (laterStart === null || earlierStart === null) return 0;
  return Math.round((laterStart - earlierStart) / WEEK_MS);
}

function weightedProgress(
  rows: Array<{
    applicable: boolean;
    weight: number;
    completion: number;
    plannedStart: string;
    plannedFinish: string;
  }>,
  asOf: string,
) {
  const applicable = rows.filter((row) => row.applicable);
  const totalWeight = applicable.reduce((sum, row) => sum + row.weight, 0);
  if (totalWeight <= 0) return { plan: 0, actual: 0 };
  const asOfTime = utcDay(asOf);
  const plan = applicable.reduce((sum, row) => {
    const start = utcDay(row.plannedStart);
    const finish = utcDay(row.plannedFinish);
    const plannedCompletion =
      asOfTime < start
        ? 0
        : asOfTime >= finish
          ? 100
          : ((asOfTime - start) / Math.max(DAY_MS, finish - start)) * 100;
    return sum + row.weight * plannedCompletion;
  }, 0);
  const actual = applicable.reduce(
    (sum, row) => sum + row.weight * row.completion,
    0,
  );
  return {
    plan: Number((plan / totalWeight).toFixed(1)),
    actual: Number((actual / totalWeight).toFixed(1)),
  };
}

export async function recalculateProjectHealth(
  projectId: string,
  evaluationWeekKey?: string,
  options: { touchProject?: boolean; asOfDate?: string } = {},
) {
  const db = getDb();
  const [
    projectRows,
    milestoneRows,
    riskRows,
    actionRows,
    projectReportRows,
    activeRuleRows,
  ] = await Promise.all([
    db.select().from(projects).where(eq(projects.id, projectId)).limit(1),
    db.select().from(milestones).where(eq(milestones.projectId, projectId)),
    db.select().from(risks).where(eq(risks.projectId, projectId)),
    db
      .select()
      .from(correctiveActions)
      .where(eq(correctiveActions.projectId, projectId)),
    db
      .select()
      .from(weeklyReports)
      .where(
        and(
          eq(weeklyReports.projectId, projectId),
          ne(weeklyReports.status, "draft"),
        ),
      )
      .orderBy(desc(weeklyReports.weekKey))
      .limit(2),
    db
      .select()
      .from(ruleConfigs)
      .where(eq(ruleConfigs.active, true))
      .orderBy(desc(ruleConfigs.version))
      .limit(1),
  ]);
  const project = projectRows[0];
  if (!project) return null;
  const rule = activeRuleRows[0];
  const scoringRule = {
    version: rule?.version ?? 1,
    progressYellowGap: rule?.progressYellowGap ?? 5,
    progressRedGap: rule?.progressRedGap ?? 10,
    progressYellowPenalty: rule?.progressYellowPenalty ?? 10,
    progressRedPenalty: rule?.progressRedPenalty ?? 20,
    normalYellowPenalty: rule?.normalYellowPenalty ?? 3,
    normalRedPenalty: rule?.normalRedPenalty ?? 8,
    criticalYellowPenalty: rule?.criticalYellowPenalty ?? 8,
    criticalRedPenalty: rule?.criticalRedPenalty ?? 20,
    schedulePenaltyCap: rule?.schedulePenaltyCap ?? 60,
    mediumRiskPenalty: rule?.mediumRiskPenalty ?? 5,
    highRiskPenalty: rule?.highRiskPenalty ?? 15,
    riskPenaltyCap: rule?.riskPenaltyCap ?? 25,
    overdueActionPenalty: rule?.overdueActionPenalty ?? 5,
    actionPenaltyCap: rule?.actionPenaltyCap ?? 15,
    missingReportPenalty: rule?.missingReportPenalty ?? 10,
    consecutiveMissingPenalty: rule?.consecutiveMissingPenalty ?? 15,
    vetoCriticalRed: rule?.vetoCriticalRed ?? true,
    vetoHighRiskOverdue: rule?.vetoHighRiskOverdue ?? true,
    vetoConsecutiveMissing: rule?.vetoConsecutiveMissing ?? true,
  };
  const asOf = evaluationDate(evaluationWeekKey, options.asOfDate);
  const evaluatedMilestones = milestoneRows.map((milestone) => {
    if (!milestone.applicable) return { ...milestone, status: "na" as const };
    const effectiveFinish =
      milestone.completion >= 100
        ? milestone.actualFinish
        : milestone.forecastFinish;
    const overdueIncomplete =
      milestone.completion < 100 && milestone.plannedFinish < asOf;
    const deviationDays = effectiveFinish
      ? Math.round(
          (utcDay(effectiveFinish) - utcDay(milestone.plannedFinish)) / DAY_MS,
        )
      : overdueIncomplete
        ? Math.max(
            1,
            Math.round((utcDay(asOf) - utcDay(milestone.plannedFinish)) / DAY_MS),
          )
        : 0;
    const yellowDays = milestone.critical
      ? (rule?.criticalYellowDays ?? 1)
      : (rule?.normalYellowDays ?? 4);
    const redDays = milestone.critical
      ? (rule?.criticalRedDays ?? 4)
      : (rule?.normalRedDays ?? 8);
    const status =
      overdueIncomplete
        ? ("red" as const)
        : deviationDays >= redDays
        ? ("red" as const)
        : deviationDays >= yellowDays
          ? ("yellow" as const)
          : ("green" as const);
    return { ...milestone, status, deviationDays };
  });
  const changedMilestones = evaluatedMilestones.filter(
    (milestone, index) =>
      milestone.status !== milestoneRows[index].status ||
      milestone.deviationDays !== milestoneRows[index].deviationDays,
  );
  for (const milestone of changedMilestones) {
    await db
      .update(milestones)
      .set({
        status: milestone.status,
        deviationDays: milestone.deviationDays,
      })
      .where(eq(milestones.id, milestone.id));
  }

  const progress = weightedProgress(evaluatedMilestones, asOf);
  const progressGap = progress.plan - progress.actual;
  const progressGapPenalty =
    progressGap > scoringRule.progressRedGap
      ? scoringRule.progressRedPenalty
      : progressGap >= scoringRule.progressYellowGap
        ? scoringRule.progressYellowPenalty
        : 0;
  const milestonePenalty = evaluatedMilestones.reduce((sum, milestone) => {
    if (!milestone.applicable) return sum;
    if (milestone.status === "yellow") {
      return (
        sum +
        (milestone.critical
          ? scoringRule.criticalYellowPenalty
          : scoringRule.normalYellowPenalty)
      );
    }
    if (milestone.status === "red") {
      return (
        sum +
        (milestone.critical
          ? scoringRule.criticalRedPenalty
          : scoringRule.normalRedPenalty)
      );
    }
    return sum;
  }, 0);
  const schedulePenalty = Math.min(
    scoringRule.schedulePenaltyCap,
    progressGapPenalty + milestonePenalty,
  );

  const openRisks = riskRows.filter((risk) => risk.status !== "closed");
  const riskPenalty = Math.min(
    scoringRule.riskPenaltyCap,
    openRisks.reduce(
      (sum, risk) =>
        sum +
        (risk.level === "high"
          ? scoringRule.highRiskPenalty
          : risk.level === "medium"
            ? scoringRule.mediumRiskPenalty
            : 0),
      0,
    ),
  );
  const today = asOf;
  const overdueActions = actionRows.filter(
    (action) =>
      action.status !== "completed" &&
      (action.status === "overdue" || action.recoveryDate < today),
  );
  const actionPenalty = Math.min(
    scoringRule.actionPenaltyCap,
    overdueActions.length * scoringRule.overdueActionPenalty,
  );

  const latestWeek = evaluationWeekKey ?? isoWeekKey(asOf);
  const latestProjectWeek = projectReportRows[0]?.weekKey;
  let reportingPenalty = 0;
  let consecutiveMissing = false;
  if (latestProjectWeek !== latestWeek) {
    reportingPenalty = scoringRule.missingReportPenalty;
    const firstPlannedStart = evaluatedMilestones
      .filter((milestone) => milestone.applicable)
      .map((milestone) => milestone.plannedStart)
      .sort()[0];
    const projectHasBeenActiveForTwoWeeks =
      Boolean(firstPlannedStart) &&
      utcDay(asOf) - utcDay(firstPlannedStart) >= 2 * WEEK_MS;
    if (
      (latestProjectWeek &&
        weeksBetween(latestWeek, latestProjectWeek) >= 2) ||
      (!latestProjectWeek && projectHasBeenActiveForTwoWeeks)
    ) {
      reportingPenalty = scoringRule.consecutiveMissingPenalty;
      consecutiveMissing = true;
    }
  }

  const score = Math.max(
    0,
    100 - schedulePenalty - riskPenalty - actionPenalty - reportingPenalty,
  );
  const highRiskIds = new Set(
    openRisks.filter((risk) => risk.level === "high").map((risk) => risk.id),
  );
  const vetoes = {
    criticalRed:
      scoringRule.vetoCriticalRed &&
      evaluatedMilestones.some(
        (milestone) => milestone.critical && milestone.status === "red",
      ),
    highRiskOverdue:
      scoringRule.vetoHighRiskOverdue &&
      overdueActions.some(
        (action) => action.riskId !== null && highRiskIds.has(action.riskId),
      ),
    consecutiveMissing:
      scoringRule.vetoConsecutiveMissing && consecutiveMissing,
  };
  const forcedRed = Object.values(vetoes).some(Boolean);
  const greenScore = rule?.greenScore ?? 85;
  const yellowScore = rule?.yellowScore ?? 70;
  const status = forcedRed
    ? "red"
    : score >= greenScore
      ? "green"
      : score >= yellowScore
        ? "yellow"
        : "red";
  const riskLevel = openRisks.some((risk) => risk.level === "high")
    ? "high"
    : openRisks.some((risk) => risk.level === "medium")
      ? "medium"
      : "low";

  const calculatedAt = new Date().toISOString();
  const milestoneCounts = {
    normalYellow: evaluatedMilestones.filter(
      (milestone) =>
        milestone.applicable &&
        !milestone.critical &&
        milestone.status === "yellow",
    ).length,
    normalRed: evaluatedMilestones.filter(
      (milestone) =>
        milestone.applicable &&
        !milestone.critical &&
        milestone.status === "red",
    ).length,
    criticalYellow: evaluatedMilestones.filter(
      (milestone) =>
        milestone.applicable &&
        milestone.critical &&
        milestone.status === "yellow",
    ).length,
    criticalRed: evaluatedMilestones.filter(
      (milestone) =>
        milestone.applicable &&
        milestone.critical &&
        milestone.status === "red",
    ).length,
  };
  const deductions = {
    schedule: schedulePenalty,
    risk: riskPenalty,
    action: actionPenalty,
    reporting: reportingPenalty,
  };
  const healthExplanation = {
    ruleVersion: scoringRule.version,
    calculatedAt,
    asOfDate: asOf,
    progressGap: Number(progressGap.toFixed(1)),
    progressGapPenalty,
    milestonePenalty,
    milestoneCounts,
    openMediumRiskCount: openRisks.filter((risk) => risk.level === "medium")
      .length,
    openHighRiskCount: openRisks.filter((risk) => risk.level === "high").length,
    overdueActionCount: overdueActions.length,
    latestReportWeek: latestProjectWeek ?? null,
    evaluationWeekKey: latestWeek,
    consecutiveMissing,
    deductions: {
      ...deductions,
      total: Object.values(deductions).reduce((sum, value) => sum + value, 0),
    },
    vetoes,
  };
  await db
    .update(projects)
    .set({
      score,
      status,
      riskLevel,
      planProgress: progress.plan,
      actualProgress: progress.actual,
      healthCalculatedAt: calculatedAt,
      healthExplanationJson: JSON.stringify(healthExplanation),
      ...(options.touchProject === false ? {} : { updatedAt: calculatedAt }),
    })
    .where(eq(projects.id, projectId));
  return {
    score,
    status,
    riskLevel,
    progress,
    deductions,
    explanation: healthExplanation,
    forcedRed,
  };
}
