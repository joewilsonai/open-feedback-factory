import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAutoMerge } from "./automerge.js";
import type { AutoMergeInput } from "./types.js";

const safeInput: AutoMergeInput = {
  autoMergeEnabled: true,
  branchTrusted: true,
  changedFiles: ["apps/demo-app/src/styles.css"],
  checksPassed: true,
  costActualUsd: 1.1,
  costCapUsd: 5,
  diffLineCount: 40,
  maxDiffLineCount: 120,
  protectedPathFragments: ["auth", "billing", "privacy", "migrations"],
  redactionWarnings: 0,
  releaseHealthy: true,
  reviewerApproved: true,
  riskTier: "safe_auto_merge",
};

test("evaluateAutoMerge approves the narrow safe lane", () => {
  assert.deepEqual(evaluateAutoMerge(safeInput), {
    eligible: true,
    reasons: [],
  });
});

test("evaluateAutoMerge blocks protected paths and failed checks", () => {
  const result = evaluateAutoMerge({
    ...safeInput,
    changedFiles: ["services/api/src/auth/session.ts"],
    checksPassed: false,
  });

  assert.equal(result.eligible, false);
  assert.equal(result.reasons.includes("protected_path_changed"), true);
  assert.equal(result.reasons.includes("checks_not_passing"), true);
});
