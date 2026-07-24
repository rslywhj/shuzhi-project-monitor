import assert from "node:assert/strict";
import test from "node:test";
import {
  formatShanghaiDateTime,
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
  assert.equal(SHANGHAI_TIME_ZONE_LABEL, "UTC+8（Asia/Shanghai）");
});

test("keeps an invalid timestamp visible for audit troubleshooting", () => {
  assert.equal(formatShanghaiDateTime("legacy-value"), "legacy-value");
  assert.equal(formatShanghaiDateTime(""), "—");
});
