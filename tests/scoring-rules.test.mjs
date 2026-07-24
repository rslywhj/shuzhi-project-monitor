import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("versions every threshold, penalty, cap and veto in the scoring model", async () => {
  const [schema, migration, route] = await Promise.all([
    read("db/schema.ts"),
    read("drizzle/0012_colossal_rhino.sql"),
    read("app/api/rule-configs/route.ts"),
  ]);

  for (const field of [
    "progressYellowGap",
    "progressRedGap",
    "progressYellowPenalty",
    "progressRedPenalty",
    "normalYellowPenalty",
    "normalRedPenalty",
    "criticalYellowPenalty",
    "criticalRedPenalty",
    "schedulePenaltyCap",
    "mediumRiskPenalty",
    "highRiskPenalty",
    "riskPenaltyCap",
    "overdueActionPenalty",
    "actionPenaltyCap",
    "missingReportPenalty",
    "consecutiveMissingPenalty",
    "vetoCriticalRed",
    "vetoHighRiskOverdue",
    "vetoConsecutiveMissing",
  ]) {
    assert.match(schema, new RegExp(`${field}:`));
    assert.match(route, new RegExp(field));
  }
  assert.match(migration, /ADD `health_explanation_json`/);
  assert.match(migration, /ADD `schedule_penalty_cap`/);
  assert.match(migration, /ADD `veto_critical_red`/);
  assert.match(route, /UPDATE rule_configs SET active = 0/);
  assert.match(route, /recalculatedProjects/);
});

test("calculates and persists an explainable health result under the active rule", async () => {
  const [health, bootstrap, snapshot, page] = await Promise.all([
    read("lib/health.ts"),
    read("app/api/bootstrap/route.ts"),
    read("lib/snapshot-service.ts"),
    read("app/page.tsx"),
  ]);

  assert.match(health, /const scoringRule =/);
  assert.match(health, /schedulePenaltyCap/);
  assert.match(health, /riskPenaltyCap/);
  assert.match(health, /actionPenaltyCap/);
  assert.match(health, /const vetoes =/);
  assert.match(health, /healthExplanationJson: JSON\.stringify\(healthExplanation\)/);
  assert.match(bootstrap, /parseHealthExplanation/);
  assert.match(bootstrap, /healthExplanation:/);
  assert.match(snapshot, /ruleConfig: activeRuleRows\[0\] \?\? null/);
  assert.match(page, /采用规则 V/);
  assert.match(page, /一票否决：/);
  assert.match(page, /发布新版本并重算在建项目/);
});
