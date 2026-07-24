import assert from "node:assert/strict";
import test from "node:test";
import { projectOwnerAccountError } from "../lib/project-owner-rules.ts";

const eligibleManager = {
  email: "manager@example.com",
  displayName: "项目经理",
  role: "manager",
  active: true,
};

test("only active manager accounts are eligible project owners", () => {
  assert.equal(projectOwnerAccountError(eligibleManager), "");
  assert.match(projectOwnerAccountError(undefined), /尚未预置/);
  assert.match(
    projectOwnerAccountError({ ...eligibleManager, active: false }),
    /已停用/,
  );
  assert.match(
    projectOwnerAccountError({ ...eligibleManager, role: "pmo" }),
    /角色为“项目经理”/,
  );
});
