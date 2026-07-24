const SHANGHAI_TIME_ZONE = "Asia/Shanghai";
const UTC_SQL_TIMESTAMP =
  /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?$/;

function parseDatabaseTimestamp(value: string) {
  const text = value.trim();
  const utcSqlMatch = text.match(UTC_SQL_TIMESTAMP);
  const normalized = utcSqlMatch
    ? `${utcSqlMatch[1]}T${utcSqlMatch[2]}${utcSqlMatch[3] ?? ""}Z`
    : text;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function shanghaiParts(
  value: string | Date,
  includeTime: boolean,
) {
  const date =
    value instanceof Date ? value : parseDatabaseTimestamp(value);
  if (!date || Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(includeTime
      ? {
          hour: "2-digit" as const,
          minute: "2-digit" as const,
          hourCycle: "h23" as const,
        }
      : {}),
  }).formatToParts(date);
}

function part(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
) {
  return parts.find((item) => item.type === type)?.value ?? "";
}

export function formatShanghaiDateTime(value: string) {
  const parts = shanghaiParts(value, true);
  if (!parts) return value.trim() || "—";
  return `${part(parts, "year")}-${part(parts, "month")}-${part(parts, "day")} ${part(parts, "hour")}:${part(parts, "minute")}`;
}

export function formatShanghaiMonthDayTime(value: string) {
  const parts = shanghaiParts(value, true);
  if (!parts) return value.trim() || "—";
  return `${part(parts, "month")}-${part(parts, "day")} ${part(parts, "hour")}:${part(parts, "minute")}`;
}

export function formatShanghaiDate(value: string) {
  const parts = shanghaiParts(value, false);
  if (!parts) return value.trim() || "—";
  return `${part(parts, "year")}-${part(parts, "month")}-${part(parts, "day")}`;
}

export function shanghaiDateIso(value = new Date()) {
  const parts = shanghaiParts(value, false);
  if (!parts) return "";
  return `${part(parts, "year")}-${part(parts, "month")}-${part(parts, "day")}`;
}

export function formatShanghaiCalendarDay(value: Date) {
  const parts = shanghaiParts(value, false);
  if (!parts) return "";
  return part(parts, "day");
}

export function formatShanghaiCalendarMonth(value: Date) {
  const date = value instanceof Date ? value : new Date(value);
  return date
    .toLocaleString("en-US", {
      month: "short",
      timeZone: SHANGHAI_TIME_ZONE,
    })
    .toUpperCase();
}

export const SHANGHAI_TIME_ZONE_LABEL = "UTC+8（Asia/Shanghai）";
