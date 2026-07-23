export class ApiRequestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const databaseUnavailable =
    message.includes("D1 binding") ||
    message.includes("no such table") ||
    message.includes("no such column");
  const status =
    error instanceof ApiRequestError
      ? error.status
      : error instanceof SyntaxError
        ? 400
        : databaseUnavailable
          ? 503
          : 500;
  return Response.json(
    {
      error: databaseUnavailable
        ? "数据服务尚未完成初始化，请稍后重试。"
        : error instanceof ApiRequestError
          ? error.message
          : error instanceof SyntaxError
            ? "请求内容不是有效的 JSON。"
            : "服务器处理请求时发生错误。",
    },
    { status },
  );
}

export function requiredString(value: unknown, label: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new ApiRequestError(`${label}不能为空。`);
  return text;
}

export function requiredEmail(value: unknown, label: string) {
  const email = requiredString(value, label).toLowerCase();
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new ApiRequestError(`${label}格式不正确。`);
  }
  return email;
}

export function safeNumber(value: unknown, label: string, min = 0, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new ApiRequestError(`${label}必须在 ${min}–${max} 之间。`);
  }
  return number;
}

export function requiredIsoDate(value: unknown, label: string) {
  const date = requiredString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new ApiRequestError(`${label}必须是有效的 YYYY-MM-DD 日期。`);
  }
  return date;
}

export function requiredWeekKey(value: unknown, label = "周期") {
  const weekKey = requiredString(value, label);
  if (!/^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(weekKey)) {
    throw new ApiRequestError(`${label}必须使用 YYYY-Www 格式。`);
  }
  return weekKey;
}
