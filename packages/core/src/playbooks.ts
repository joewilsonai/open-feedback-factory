import type { WorkRiskTier } from "./types.js";

export type PlaybookCapability = "advise" | "clarify" | "document" | "implement" | "learn" | "plan" | "release" | "review" | "test";

export type PlaybookHost = "browser" | "claude_code" | "codex_cli" | "codex_cloud" | "github_actions" | "human";

export type PlaybookLifecycleStage = "clarify" | "plan" | "build" | "review" | "test" | "release" | "document" | "learn";

export interface PlaybookPolicyBoundary {
  canAccessSecrets: false;
  canApproveMerge: false;
  canChangePolicy: false;
  canMarkShipped: false;
  canNotifyUsers: false;
}

export interface AgentPlaybook {
  allowedRiskTiers: WorkRiskTier[];
  attribution: string;
  canImplement: boolean;
  capabilities: PlaybookCapability[];
  contractChecks: string[];
  description: string;
  estimatedCostProfile: "low" | "medium" | "high";
  forbiddenTools: string[];
  id: string;
  inputSchema: string[];
  license: "OFF-native";
  lifecycleEvents: string[];
  policyBoundary: PlaybookPolicyBoundary;
  redactionRules: string[];
  requiredApprovalModes: Array<"auto" | "manual">;
  requiredOutputSchema: string[];
  requiredTools: string[];
  source: "off_native";
  stage: PlaybookLifecycleStage;
  supportedHosts: PlaybookHost[];
  title: string;
  version: string;
}

const advisoryBoundary: PlaybookPolicyBoundary = {
  canAccessSecrets: false,
  canApproveMerge: false,
  canChangePolicy: false,
  canMarkShipped: false,
  canNotifyUsers: false,
};

const sharedRedactionRules = [
  "Use sanitized feedback summaries only.",
  "Do not request raw feedback, credentials, private messages, contact details, or unredacted logs.",
  "Record assumptions when context is incomplete.",
];

const playbooks: AgentPlaybook[] = [
  playbook({
    allowedRiskTiers: ["safe_auto_merge", "guarded_review", "extra_review", "plan_only"],
    capabilities: ["clarify", "advise"],
    contractChecks: ["returns plain-language questions", "does not ask implementation-specific questions"],
    description: "Turns vague beta feedback into a few plain-language questions an end user can answer.",
    estimatedCostProfile: "low",
    forbiddenTools: ["github_write", "secret_read", "shell"],
    id: "feedback-interviewer",
    inputSchema: ["sanitized_feedback", "app_context", "surface_context"],
    lifecycleEvents: ["clarification_requested"],
    requiredOutputSchema: ["questions", "reason", "assumptions"],
    requiredTools: [],
    stage: "clarify",
    supportedHosts: ["codex_cli", "codex_cloud", "claude_code"],
    title: "Feedback Interviewer",
  }),
  playbook({
    allowedRiskTiers: ["guarded_review", "extra_review", "plan_only"],
    capabilities: ["advise", "review"],
    contractChecks: ["returns build-now recommendation", "names demand and product risks"],
    description: "Challenges whether the request should be built now, queued, combined, or rejected.",
    estimatedCostProfile: "low",
    forbiddenTools: ["github_write", "secret_read"],
    id: "product-critic",
    inputSchema: ["sanitized_feedback_cluster", "demand_count", "feature_usage_context"],
    lifecycleEvents: ["product_critique_recorded"],
    requiredOutputSchema: ["recommendation", "risks", "assumptions"],
    requiredTools: [],
    stage: "plan",
    supportedHosts: ["codex_cli", "codex_cloud", "claude_code", "human"],
    title: "Product Critic",
  }),
  playbook({
    allowedRiskTiers: ["safe_auto_merge", "guarded_review", "extra_review", "plan_only"],
    capabilities: ["plan"],
    contractChecks: ["returns PR-sized scope", "names files or areas likely to change"],
    description: "Converts approved demand into a scoped implementation plan and visible assumptions.",
    estimatedCostProfile: "medium",
    forbiddenTools: ["github_write", "secret_read"],
    id: "product-planner",
    inputSchema: ["sanitized_work_item", "repo_summary", "policy_config"],
    lifecycleEvents: ["plan_recorded"],
    requiredOutputSchema: ["scope", "acceptance_criteria", "assumptions", "test_plan"],
    requiredTools: ["repo_read"],
    stage: "plan",
    supportedHosts: ["codex_cli", "codex_cloud", "claude_code"],
    title: "Product Planner",
  }),
  playbook({
    allowedRiskTiers: ["guarded_review", "extra_review", "plan_only"],
    capabilities: ["review"],
    contractChecks: ["covers architecture", "covers state flow", "covers failure modes", "covers tests"],
    description: "Reviews architecture, data flow, edge cases, migration risk, operational risk, and test coverage.",
    estimatedCostProfile: "medium",
    forbiddenTools: ["github_write", "secret_read"],
    id: "engineering-reviewer",
    inputSchema: ["plan", "diff_summary", "checks"],
    lifecycleEvents: ["engineering_review_recorded"],
    requiredOutputSchema: ["findings", "required_fixes", "approval_recommendation"],
    requiredTools: ["repo_read", "test_read"],
    stage: "review",
    supportedHosts: ["codex_cli", "codex_cloud", "claude_code", "github_actions"],
    title: "Engineering Reviewer",
  }),
  playbook({
    allowedRiskTiers: ["guarded_review", "extra_review", "plan_only"],
    capabilities: ["review"],
    contractChecks: ["covers UI quality", "covers accessibility", "covers responsive behavior"],
    description: "Reviews UI quality, accessibility, density, responsive behavior, and fit with the product.",
    estimatedCostProfile: "medium",
    forbiddenTools: ["github_write", "secret_read"],
    id: "design-reviewer",
    inputSchema: ["plan", "screenshots", "visual_diff_summary"],
    lifecycleEvents: ["design_review_recorded"],
    requiredOutputSchema: ["findings", "visual_risks", "approval_recommendation"],
    requiredTools: ["browser_view", "screenshot_read"],
    stage: "review",
    supportedHosts: ["browser", "claude_code", "codex_cli"],
    title: "Design Reviewer",
  }),
  playbook({
    allowedRiskTiers: ["guarded_review", "extra_review", "plan_only"],
    capabilities: ["review"],
    contractChecks: ["covers secret handling", "covers data exposure", "covers auth and rate limits"],
    description: "Reviews app security and privacy risks such as secret handling, data exposure, RLS, webhook auth, and sensitive-file edits.",
    estimatedCostProfile: "medium",
    forbiddenTools: ["secret_read", "policy_write"],
    id: "security-privacy-reviewer",
    inputSchema: ["plan", "diff_summary", "changed_files", "policy_config"],
    lifecycleEvents: ["security_review_recorded"],
    requiredOutputSchema: ["findings", "blocked_paths", "required_fixes", "approval_recommendation"],
    requiredTools: ["repo_read", "security_check_read"],
    stage: "review",
    supportedHosts: ["codex_cli", "codex_cloud", "claude_code", "github_actions"],
    title: "Security / Privacy Reviewer",
  }),
  playbook({
    allowedRiskTiers: ["safe_auto_merge", "guarded_review", "extra_review"],
    capabilities: ["test"],
    contractChecks: ["records real URL", "records screenshots or browser notes", "does not report fake pass state"],
    description: "Runs browser or simulator checks against a real URL and records reviewable evidence.",
    estimatedCostProfile: "medium",
    forbiddenTools: ["secret_read", "release_write"],
    id: "qa-browser-runner",
    inputSchema: ["preview_url", "acceptance_criteria", "test_account_policy"],
    lifecycleEvents: ["qa_evidence_recorded"],
    requiredOutputSchema: ["steps", "evidence", "failures", "assumptions"],
    requiredTools: ["browser_control", "screenshot_capture"],
    stage: "test",
    supportedHosts: ["browser", "claude_code", "codex_cli"],
    title: "QA Browser Runner",
  }),
  playbook({
    allowedRiskTiers: ["safe_auto_merge", "guarded_review", "extra_review"],
    capabilities: ["release", "review"],
    contractChecks: ["requires PR evidence", "requires release proof", "requires rollback note"],
    description: "Verifies branch, PR, checks, merge policy, release marker, rollback path, and user-safe status.",
    estimatedCostProfile: "low",
    forbiddenTools: ["secret_read", "user_notify"],
    id: "release-manager",
    inputSchema: ["pr_evidence", "checks", "release_marker", "rollback_plan"],
    lifecycleEvents: ["release_readiness_recorded"],
    requiredOutputSchema: ["release_status", "rollback_path", "user_status_recommendation"],
    requiredTools: ["github_read", "deployment_status_read"],
    stage: "release",
    supportedHosts: ["codex_cli", "codex_cloud", "github_actions", "human"],
    title: "Release Manager",
  }),
  playbook({
    allowedRiskTiers: ["safe_auto_merge", "guarded_review", "extra_review", "plan_only"],
    capabilities: ["document"],
    contractChecks: ["names changed docs", "does not claim public release without proof"],
    description: "Updates install docs, SDK docs, operator notes, PRD/status docs, and release notes when relevant.",
    estimatedCostProfile: "low",
    forbiddenTools: ["secret_read", "user_notify"],
    id: "docs-release-notes-writer",
    inputSchema: ["diff_summary", "user_visible_changes", "known_limits"],
    lifecycleEvents: ["docs_update_recorded"],
    requiredOutputSchema: ["docs_changed", "release_note", "known_limits"],
    requiredTools: ["repo_read", "repo_write"],
    canImplement: true,
    stage: "document",
    supportedHosts: ["codex_cli", "codex_cloud", "claude_code"],
    title: "Docs / Release Notes Writer",
  }),
  playbook({
    allowedRiskTiers: ["safe_auto_merge", "guarded_review", "extra_review", "plan_only"],
    capabilities: ["learn"],
    contractChecks: ["records assumption misses", "records eval or router suggestions"],
    description: "Records assumptions, misses, cost deltas, eval gaps, recurring failures, and router-rule suggestions.",
    estimatedCostProfile: "low",
    forbiddenTools: ["secret_read", "policy_write"],
    id: "retro-learning-writer",
    inputSchema: ["run_summary", "cost_delta", "review_findings", "user_outcome"],
    lifecycleEvents: ["learning_record_suggested"],
    requiredOutputSchema: ["learning_records", "router_suggestions", "eval_suggestions"],
    requiredTools: ["ledger_read"],
    stage: "learn",
    supportedHosts: ["codex_cli", "codex_cloud", "claude_code"],
    title: "Retro / Learning Writer",
  }),
];

export function listPlaybooks(): AgentPlaybook[] {
  return playbooks.map(clonePlaybook);
}

export function getPlaybook(id: string): AgentPlaybook | null {
  const found = playbooks.find((playbook) => playbook.id === id);
  return found ? clonePlaybook(found) : null;
}

export function playbooksForLifecycleStage(stage: PlaybookLifecycleStage): AgentPlaybook[] {
  return playbooks.filter((playbook) => playbook.stage === stage).map(clonePlaybook);
}

type AgentPlaybookInput = Omit<
  AgentPlaybook,
  "attribution" | "canImplement" | "license" | "policyBoundary" | "redactionRules" | "requiredApprovalModes" | "source" | "version"
> &
  Partial<Pick<AgentPlaybook, "canImplement" | "redactionRules" | "requiredApprovalModes">>;

function playbook(input: AgentPlaybookInput): AgentPlaybook {
  return {
    ...input,
    attribution: "Open Feedback Factory native playbook registry",
    canImplement: input.canImplement ?? false,
    license: "OFF-native",
    policyBoundary: advisoryBoundary,
    redactionRules: input.redactionRules ?? sharedRedactionRules,
    requiredApprovalModes: input.requiredApprovalModes ?? ["manual"],
    source: "off_native",
    version: "0.1.0",
  };
}

function clonePlaybook(playbook: AgentPlaybook): AgentPlaybook {
  return {
    ...playbook,
    allowedRiskTiers: [...playbook.allowedRiskTiers],
    capabilities: [...playbook.capabilities],
    contractChecks: [...playbook.contractChecks],
    forbiddenTools: [...playbook.forbiddenTools],
    inputSchema: [...playbook.inputSchema],
    lifecycleEvents: [...playbook.lifecycleEvents],
    policyBoundary: { ...playbook.policyBoundary },
    redactionRules: [...playbook.redactionRules],
    requiredApprovalModes: [...playbook.requiredApprovalModes],
    requiredOutputSchema: [...playbook.requiredOutputSchema],
    requiredTools: [...playbook.requiredTools],
    supportedHosts: [...playbook.supportedHosts],
  };
}
