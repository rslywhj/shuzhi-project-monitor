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

export function formatShanghaiDateTime(value: string) {
  const date = parseDatabaseTimestamp(value);
  if (!date) return value.trim() || "—";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export const SHANGHAI_TIME_ZONE_LABEL = "UTC+8（Asia/Shanghai）";
