import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAutoMerge } from "./automerge.js";
import { buildAssumptionRecord } from "./assumptions.js";
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
  mergeMode: "agent_reviewed_auto_merge",
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

test("evaluateAutoMerge blocks modes that forbid autonomous merge", () => {
  const implementOnly = evaluateAutoMerge({
    ...safeInput,
    mergeMode: "implement_only",
  });
  const humanException = evaluateAutoMerge({
    ...safeInput,
    mergeMode: "human_exception_required",
  });

  assert.equal(implementOnly.eligible, false);
  assert.equal(implementOnly.reasons.includes("merge_mode_implement_only"), true);
  assert.equal(humanException.eligible, false);
  assert.equal(humanException.reasons.includes("merge_mode_human_exception_required"), true);
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

test("evaluateAutoMerge blocks unresolved assumptions that affect release or safety", () => {
  const result = evaluateAutoMerge({
    ...safeInput,
    unresolvedAssumptions: [
      buildAssumptionRecord({
        assumptions: ["Assumed merged means released."],
        checksSkipped: ["No release marker was provided."],
        impactAreas: ["release_status"],
      }),
    ],
  });

  assert.equal(result.eligible, false);
  assert.equal(result.reasons.includes("unresolved_assumption_blocks_automerge"), true);
});
