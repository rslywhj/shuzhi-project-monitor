const SHANGHAI_TIME_ZONE = "Asia/Shanghai";
const DAY_MS = 86_400_000;
const LOCK_MINUTE = 17 * 60;
const REMINDER_MINUTE = 9 * 60;

type ShanghaiClock = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
};

export type PortfolioAutomationWindow = {
  localTimestamp: string;
  currentWeekKey: string;
  advanceReminderWeekKey: string | null;
  dueLockWeekKey: string | null;
};

function shanghaiClock(now: Date): ShanghaiClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const calendarDate = new Date(
    Date.UTC(values.year, values.month - 1, values.day),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    weekday: calendarDate.getUTCDay() || 7,
    hour: values.hour,
    minute: values.minute,
  };
}

export function isoWeekKeyForDate(
  year: number,
  month: number,
  day: number,
) {
  const thursday = new Date(Date.UTC(year, month - 1, day));
  const weekday = thursday.getUTCDay() || 7;
  thursday.setUTCDate(thursday.getUTCDate() + 4 - weekday);
  const isoYear = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(
    ((thursday.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7,
  );
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

function previousDueFriday(clock: ShanghaiClock) {
  const minuteOfDay = clock.hour * 60 + clock.minute;
  let daysBack: number;
  if (clock.weekday === 5 && minuteOfDay >= LOCK_MINUTE) {
    daysBack = 0;
  } else if (clock.weekday === 6) {
    daysBack = 1;
  } else if (clock.weekday === 7) {
    daysBack = 2;
  } else if (clock.weekday === 5) {
    daysBack = 7;
  } else {
    daysBack = clock.weekday + 2;
  }
  const date = new Date(Date.UTC(clock.year, clock.month - 1, clock.day));
  date.setUTCDate(date.getUTCDate() - daysBack);
  return date;
}

export function portfolioAutomationWindow(
  now = new Date(),
): PortfolioAutomationWindow {
  const clock = shanghaiClock(now);
  const minuteOfDay = clock.hour * 60 + clock.minute;
  const currentWeekKey = isoWeekKeyForDate(
    clock.year,
    clock.month,
    clock.day,
  );
  const reminderDue =
    minuteOfDay >= REMINDER_MINUTE &&
    (clock.weekday === 3 ||
      clock.weekday === 4 ||
      (clock.weekday === 5 && minuteOfDay < LOCK_MINUTE));
  const reachedCurrentDeadline =
    clock.weekday === 6 ||
    clock.weekday === 7 ||
    (clock.weekday === 5 && minuteOfDay >= LOCK_MINUTE);
  const previousFriday = previousDueFriday(clock);
  const dueLockWeekKey =
    reachedCurrentDeadline || clock.weekday <= 4
      ? isoWeekKeyForDate(
          previousFriday.getUTCFullYear(),
          previousFriday.getUTCMonth() + 1,
          previousFriday.getUTCDate(),
        )
      : null;
  return {
    localTimestamp: `${clock.year}-${String(clock.month).padStart(2, "0")}-${String(clock.day).padStart(2, "0")} ${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`,
    currentWeekKey,
    advanceReminderWeekKey: reminderDue ? currentWeekKey : null,
    dueLockWeekKey,
  };
}
