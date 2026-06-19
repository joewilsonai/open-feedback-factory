import { clusterKeyForFeedback } from "./cluster.js";
import { buildEndUserClarificationQuestions } from "./clarification.js";
import { estimateFeatureCost } from "./cost.js";
import type {
  FeedbackCategory,
  SanitizedFeedback,
  WorkRiskTier,
  WorkRoutingDecision,
} from "./types.js";

export interface RouteFeedbackInput {
  activeUserCount?: number;
  model?: string;
  sanitized: SanitizedFeedback;
  signalCount?: number;
}

export function routeFeedback(input: RouteFeedbackInput): WorkRoutingDecision {
  const clusterKey = clusterKeyForFeedback(input.sanitized);
  const message = input.sanitized.sanitizedMessage.toLowerCase();
  const clarificationQuestions = buildEndUserClarificationQuestions(input.sanitized);

  if (input.sanitized.privacyRisk === "blocked") {
    return decision({
      action: "blocked",
      category: "security",
      clusterKey,
      model: input.model,
      riskTier: "plan_only",
      shouldCreateIssue: false,
      title: "Blocked private or secret-bearing feedback",
      userMessage:
        "We received this, but it included private or secret-looking details. It will not be sent to GitHub or an agent.",
      userStatus: "blocked",
    });
  }

  if (/billing|auth|password|privacy|delete all|export.*private|legal|encryption/.test(message)) {
    return decision({
      action: "blocked",
      category: categoryFor(message, "privacy"),
      clusterKey,
      model: input.model,
      riskTier: "extra_review",
      shouldCreateIssue: false,
      title: "Blocked high-risk product request",
      userMessage:
        "We received this, but it touches a protected area and needs human product review before any agent work.",
      userStatus: "blocked",
    });
  }

  if (clarificationQuestions.length > 0) {
    return decision({
      action: "needs_clarification",
      category: categoryFor(message, "feature_request"),
      clarificationQuestions,
      clusterKey,
      model: input.model,
      riskTier: "plan_only",
      shouldCreateIssue: false,
      title: "Needs user clarification",
      userMessage:
        "Thanks, we got this. Could you answer a couple quick questions so we understand what would help?",
      userStatus: "needs_clarification",
    });
  }

  if (
    /dark mode|dark theme|theme|appearance|color/.test(message) ||
    clusterKey === "feature.theme.dark-mode" ||
    clusterKey === "feature.theme.color-options"
  ) {
    return decision({
      action: "create_work_item",
      category: "theme",
      clusterKey,
      model: input.model,
      riskTier: "safe_auto_merge",
      shouldCreateIssue: true,
      title: titleForThemeFeature(message, clusterKey),
      userMessage:
        "This looks safe and actionable. We can queue it for a small implementation PR.",
      userStatus: "planned",
    });
  }

  if (/copy|wording|label|typo|text/.test(message)) {
    return decision({
      action: "create_work_item",
      category: "copy",
      clusterKey,
      model: input.model,
      riskTier: "safe_auto_merge",
      shouldCreateIssue: true,
      title: "Improve product copy",
      userMessage: "This copy improvement looks safe enough for the small-change lane.",
      userStatus: "planned",
    });
  }

  if (/due date|deadline|todo|task|pinned note|pin.*note|search.*note|notepad/.test(message)) {
    return decision({
      action: "create_work_item",
      category: "feature_request",
      clusterKey,
      model: input.model,
      riskTier: "safe_auto_merge",
      shouldCreateIssue: true,
      title: titleForDaybookFeature(message),
      userMessage:
        "This looks like a safe Daybook feature request. We can queue it for a small implementation PR.",
      userStatus: "planned",
    });
  }

  const signalCount = input.signalCount ?? 1;
  if (signalCount < 2) {
    return decision({
      action: "needs_more_signal",
      category: categoryFor(message, "feature_request"),
      clusterKey,
      model: input.model,
      riskTier: "plan_only",
      shouldCreateIssue: false,
      title: "Needs more user signal",
      userMessage:
        "We received this and are keeping it in the backlog until enough similar requests appear.",
      userStatus: "needs_more_signal",
    });
  }

  return decision({
    action: "create_work_item",
    category: categoryFor(message, "feature_request"),
    clusterKey,
    model: input.model,
    riskTier: "guarded_review",
    shouldCreateIssue: true,
    title: "Review repeated feature request",
    userMessage:
      "Enough similar requests have appeared to queue this for a guarded implementation review.",
    userStatus: "planned",
  });
}

function decision(
  input: Omit<WorkRoutingDecision, "clarificationQuestions" | "costEstimate"> &
    { clarificationQuestions?: WorkRoutingDecision["clarificationQuestions"]; model?: string },
): WorkRoutingDecision {
  return {
    ...input,
    clarificationQuestions: input.clarificationQuestions ?? [],
    costEstimate: estimateFeatureCost({
      model: input.model,
      riskTier: input.riskTier,
    }),
  };
}

function categoryFor(message: string, fallback: FeedbackCategory): FeedbackCategory {
  if (/privacy|delete|export/.test(message)) return "privacy";
  if (/auth|password|token|secret|encryption/.test(message)) return "security";
  if (/crash|bug|broken|error/.test(message)) return "bug";
  if (/confusing|where|how/.test(message)) return "ux_confusion";
  return fallback;
}

function titleForDaybookFeature(message: string): string {
  if (/due date|deadline/.test(message)) return "Add due dates to todos";
  if (/pinned note|pin.*note/.test(message)) return "Add pinned notes";
  if (/search.*note/.test(message)) return "Add note search";
  if (/edit|rename|update|change/.test(message) && /todo|task/.test(message)) return "Edit open tasks";
  if (/todo|task/.test(message)) return "Improve todos";
  return "Improve Daybook";
}

function titleForThemeFeature(message: string, clusterKey: string): string {
  if (/color|colour|theme picker|appearance/.test(message) || clusterKey === "feature.theme.color-options") {
    return "Add theme color choices";
  }
  if (clusterKey === "feature.theme.dark-mode" || /dark mode|dark theme/.test(message)) return "Add a dark mode option";
  return "Improve theme settings";
}
