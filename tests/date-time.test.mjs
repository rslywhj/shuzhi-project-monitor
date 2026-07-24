import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  formatShanghaiCalendarDay,
  formatShanghaiCalendarMonth,
  formatShanghaiDate,
  formatShanghaiDateTime,
  formatShanghaiMonthDayTime,
  shanghaiDateIso,
  SHANGHAI_TIME_ZONE_LABEL,
} from "../lib/date-time.ts";

test("shows D1 UTC audit timestamps in the Shanghai UTC+8 timezone", () => {
  assert.equal(
    formatShanghaiDateTime("2026-07-24 10:13:00"),
    "2026-07-24 18:13",
  );
  assert.equal(
    formatShanghaiDateTime("2026-07-24T10:13:00.000Z"),
    "2026-07-24 18:13",
  );
  assert.equal(
    formatShanghaiDateTime("2026-07-24T18:13:00+08:00"),
    "2026-07-24 18:13",
  );
  assert.equal(
    formatShanghaiDateTime("2026-07-24 18:30:00"),
    "2026-07-25 02:30",
  );
  assert.equal(
    formatShanghaiMonthDayTime("2026-07-24T18:30:00Z"),
    "07-25 02:30",
  );
  assert.equal(
    formatShanghaiDate("2026-07-24T18:30:00Z"),
    "2026-07-25",
  );
  assert.equal(SHANGHAI_TIME_ZONE_LABEL, "UTC+8（Asia/Shanghai）");
});

test("calculates user-facing calendar dates in UTC+8 across UTC day boundaries", () => {
  const instant = new Date("2026-07-24T18:30:00Z");
  assert.equal(shanghaiDateIso(instant), "2026-07-25");
  assert.equal(formatShanghaiCalendarMonth(instant), "JUL");
  assert.equal(formatShanghaiCalendarDay(instant), "25");
});

test("keeps an invalid timestamp visible for audit troubleshooting", () => {
  assert.equal(formatShanghaiDateTime("legacy-value"), "legacy-value");
  assert.equal(formatShanghaiDateTime(""), "—");
});

test("wires UTC+8 formatting through every user-facing timestamp surface", async () => {
  const root = new URL("../", import.meta.url);
  const [
    page,
    channelPanel,
    analyticsPanel,
    resourcePlanning,
    resourceApi,
    analyticsApi,
    trendsApi,
    resourceItemApi,
    weeklyReportApi,
  ] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/notification-channel-panel.tsx", root), "utf8"),
    readFile(new URL("app/portfolio-analytics.tsx", root), "utf8"),
    readFile(new URL("app/resource-planning.tsx", root), "utf8"),
    readFile(new URL("app/api/portfolio/resources/route.ts", root), "utf8"),
    readFile(new URL("app/api/portfolio/analytics/route.ts", root), "utf8"),
    readFile(
      new URL("app/api/portfolio/analytics/trends/route.ts", root),
      "utf8",
    ),
    readFile(new URL("app/api/resources/[id]/route.ts", root), "utf8"),
    readFile(
      new URL("app/api/projects/[id]/weekly-reports/route.ts", root),
      "utf8",
    ),
  ]);

  for (const source of [page, channelPanel, analyticsPanel]) {
    assert.doesNotMatch(
      source,
      /(?:createdAt|updatedAt|submittedAt|requestedAt|lockedAt|sentAt|generatedAt)\.replace\(/,
    );
  }
  assert.match(page, /formatShanghaiDateTime/);
  assert.match(page, /formatShanghaiMonthDayTime/);
  assert.match(page, /formatShanghaiDate/);
  assert.match(channelPanel, /formatShanghaiMonthDayTime/);
  assert.match(analyticsPanel, /formatShanghaiDateTime/);
  assert.match(resourcePlanning, /shanghaiDateIso/);
  for (const source of [
    resourceApi,
    analyticsApi,
    trendsApi,
    resourceItemApi,
    weeklyReportApi,
  ]) {
    assert.match(source, /shanghaiDateIso/);
    assert.doesNotMatch(
      source,
      /new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/,
    );
  }
});
