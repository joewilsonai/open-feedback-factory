export type FeedbackSeverity = "info" | "low" | "medium" | "high" | "critical";

export type FeedbackCategory =
  | "bug"
  | "copy"
  | "feature_request"
  | "privacy"
  | "security"
  | "support"
  | "theme"
  | "ux_confusion";

export type WorkRiskTier = "safe_auto_merge" | "guarded_review" | "extra_review" | "plan_only";

export type MergeMode = "agent_reviewed_auto_merge" | "human_exception_required" | "implement_only";

export type AssumptionImpactArea =
  | "cost"
  | "merge_safety"
  | "none"
  | "privacy"
  | "product_behavior"
  | "release_status";

export type WorkDecisionAction =
  | "already_available"
  | "blocked"
  | "create_work_item"
  | "needs_clarification"
  | "needs_more_signal"
  | "not_planned";

export type UserFeedbackState =
  | "already_available"
  | "blocked"
  | "grouped"
  | "implemented"
  | "in_progress"
  | "needs_clarification"
  | "needs_more_signal"
  | "not_planned"
  | "planned"
  | "received"
  | "shipped";

export interface FeedbackInput {
  message: string;
  source: string;
  severity?: FeedbackSeverity;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface SanitizedFeedback {
  sanitizedMessage: string;
  redactions: string[];
  privacyRisk: "low" | "medium" | "high" | "blocked";
  safeMetadata: Record<string, unknown>;
}

export interface FeatureCostEstimate {
  amountUsd: number;
  confidence: "high" | "medium" | "low";
  currency: "USD";
  model: string;
  reason: string;
}

export interface ClarificationContext {
  appName?: string;
  existingFeatures?: string[];
  productSummary?: string;
  route?: string;
  surface?: string;
}

export interface UserClarificationQuestion {
  id: string;
  placeholder?: string;
  question: string;
}

export interface WorkRoutingDecision {
  action: WorkDecisionAction;
  category: FeedbackCategory;
  clarificationQuestions: UserClarificationQuestion[];
  clusterKey: string;
  costEstimate: FeatureCostEstimate;
  riskTier: WorkRiskTier;
  shouldCreateIssue: boolean;
  title: string;
  userMessage: string;
  userStatus: UserFeedbackState;
}

export interface AutoMergeInput {
  autoMergeEnabled: boolean;
  branchTrusted: boolean;
  changedFiles: string[];
  checksPassed: boolean;
  costActualUsd: number;
  costCapUsd: number;
  diffLineCount: number;
  maxDiffLineCount: number;
  mergeMode: MergeMode;
  protectedPathFragments: string[];
  redactionWarnings: number;
  releaseHealthy: boolean;
  reviewerApproved: boolean;
  riskTier: WorkRiskTier;
  unresolvedAssumptions?: AgentAssumptionRecord[];
}

export interface AutoMergeEvaluation {
  eligible: boolean;
  reasons: string[];
}

export interface FeedbackTimelineEvent {
  event: string;
  label: string;
  body: string;
  createdAt: string;
  proof?: string;
}

export interface UserFeedbackStatus {
  feedbackId: string;
  clarificationQuestions: UserClarificationQuestion[];
  state: UserFeedbackState;
  label: string;
  message: string;
  timeline: FeedbackTimelineEvent[];
}

export interface AgentAssumptionRecord {
  assumptions: string[];
  alternativesSkipped: string[];
  checksRun: string[];
  checksSkipped: string[];
  confidence: "high" | "low" | "medium";
  defaultsUsed: string[];
  humanQuestions: string[];
  impactAreas: AssumptionImpactArea[];
  notes: string;
  unresolved: boolean;
}
