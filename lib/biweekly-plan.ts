export type BiweeklyPlanStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "delayed"
  | "cancelled";

export type RollingWeek = {
  weekKey: string;
  label: "本周" | "下周";
  startDate: string;
  endDate: string;
  dateLabel: string;
};

function datePartsInShanghai(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (name: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === name)?.value ?? 0);
  return { year: part("year"), month: part("month"), day: part("day") };
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function isoWeekKeyForDate(year: number, month: number, day: number) {
  const value = new Date(Date.UTC(year, month - 1, day));
  const weekday = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - weekday);
  const isoYear = value.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(
    ((value.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

function mondayForShanghaiDate(value: Date) {
  const { year, month, day } = datePartsInShanghai(value);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return date;
}

function buildWeek(monday: Date, label: RollingWeek["label"]): RollingWeek {
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const startDate = isoDate(monday);
  const endDate = isoDate(sunday);
  return {
    weekKey: isoWeekKeyForDate(
      monday.getUTCFullYear(),
      monday.getUTCMonth() + 1,
      monday.getUTCDate(),
    ),
    label,
    startDate,
    endDate,
    dateLabel: `${startDate.slice(5).replace("-", ".")}—${endDate
      .slice(5)
      .replace("-", ".")}`,
  };
}

export function buildRollingWeeks(value = new Date()): [RollingWeek, RollingWeek] {
  const currentMonday = mondayForShanghaiDate(value);
  const nextMonday = new Date(currentMonday);
  nextMonday.setUTCDate(currentMonday.getUTCDate() + 7);
  return [buildWeek(currentMonday, "本周"), buildWeek(nextMonday, "下周")];
}

export function buildRollingWeeksFromWeekKey(
  weekKey: string,
): [RollingWeek, RollingWeek] {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!match) throw new Error("历史周期格式无效。");
  const isoYear = Number(match[1]);
  const isoWeek = Number(match[2]);
  if (isoWeek < 1 || isoWeek > 53) throw new Error("历史周期格式无效。");

  const januaryFourth = new Date(Date.UTC(isoYear, 0, 4));
  const januaryFourthWeekday = januaryFourth.getUTCDay() || 7;
  const monday = new Date(januaryFourth);
  monday.setUTCDate(
    januaryFourth.getUTCDate() - januaryFourthWeekday + 1 + (isoWeek - 1) * 7,
  );
  if (
    isoWeekKeyForDate(
      monday.getUTCFullYear(),
      monday.getUTCMonth() + 1,
      monday.getUTCDate(),
    ) !== weekKey
  ) {
    throw new Error("历史周期不存在。");
  }
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);
  return [buildWeek(monday, "本周"), buildWeek(nextMonday, "下周")];
}

export function listHistoricalWeekKeys(
  weekKeys: string[],
  currentWeekKey: string,
) {
  return [...new Set(weekKeys)]
    .filter((weekKey) => /^\d{4}-W\d{2}$/.test(weekKey) && weekKey < currentWeekKey)
    .sort((left, right) => right.localeCompare(left));
}

export function validateTaskDates(
  weekKey: string,
  plannedStart: string,
  plannedFinish: string,
  windows: RollingWeek[],
) {
  if (plannedFinish < plannedStart) {
    throw new Error("计划结束时间不能早于计划开始时间。");
  }
  const week = windows.find((item) => item.weekKey === weekKey);
  if (!week) throw new Error("仅可维护当前双周滚动窗口内的任务。");
  if (plannedStart < week.startDate || plannedStart > week.endDate) {
    throw new Error(`计划开始时间应位于${week.label}（${week.dateLabel}）。`);
  }
  if (plannedFinish < week.startDate || plannedFinish > week.endDate) {
    throw new Error(`计划结束时间应位于${week.label}（${week.dateLabel}）。`);
  }
}

export function paginatePrintRows<T>(rows: T[], pageSize: number): T[][] {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error("打印分页行数必须为正整数。");
  }
  if (!rows.length) return [[]];
  return Array.from({ length: Math.ceil(rows.length / pageSize) }, (_, index) =>
    rows.slice(index * pageSize, (index + 1) * pageSize),
  );
}
