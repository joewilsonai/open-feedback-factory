import type { AutoMergeEvaluation, AutoMergeInput } from "./types.js";
import { assumptionsBlockAutoMerge } from "./assumptions.js";

export function evaluateAutoMerge(input: AutoMergeInput): AutoMergeEvaluation {
  const reasons: string[] = [];

  if (!input.autoMergeEnabled) reasons.push("auto_merge_disabled");
  if (input.mergeMode === "implement_only") reasons.push("merge_mode_implement_only");
  if (input.mergeMode === "human_exception_required") reasons.push("merge_mode_human_exception_required");
  if (input.riskTier !== "safe_auto_merge") reasons.push("risk_tier_not_safe");
  if (!input.branchTrusted) reasons.push("branch_not_created_by_runner");
  if (!input.checksPassed) reasons.push("checks_not_passing");
  if (!input.reviewerApproved) reasons.push("reviewer_not_approved");
  if (!input.releaseHealthy) reasons.push("release_or_incident_state_unhealthy");
  if (input.redactionWarnings > 0) reasons.push("redaction_warnings_present");
  if (input.diffLineCount > input.maxDiffLineCount) reasons.push("diff_too_large");
  if (input.costActualUsd > input.costCapUsd) reasons.push("cost_cap_exceeded");
  if (assumptionsBlockAutoMerge(input.unresolvedAssumptions)) reasons.push("unresolved_assumption_blocks_automerge");

  const protectedHit = input.changedFiles.some((file) =>
    input.protectedPathFragments.some((fragment) => file.includes(fragment)),
  );
  if (protectedHit) reasons.push("protected_path_changed");

  return {
    eligible: reasons.length === 0,
    reasons,
  };
}
