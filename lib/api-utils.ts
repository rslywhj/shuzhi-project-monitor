export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : "服务器发生未知错误";
  const databaseUnavailable =
    message.includes("D1 binding") ||
    message.includes("no such table") ||
    message.includes("no such column");
  return Response.json(
    {
      error: databaseUnavailable
        ? "数据服务尚未完成初始化，请稍后重试。"
        : message,
    },
    { status: 500 },
  );
}

export function requiredString(value: unknown, label: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label}不能为空。`);
  return text;
}

export function safeNumber(value: unknown, label: string, min = 0, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${label}必须在 ${min}–${max} 之间。`);
  }
  return number;
}
