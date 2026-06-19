import type { FeedbackTimelineEvent, UserFeedbackState, UserFeedbackStatus } from "./types.js";

const LABELS: Record<UserFeedbackState, string> = {
  already_available: "Already available",
  blocked: "Blocked",
  grouped: "Grouped with similar feedback",
  implemented: "Implemented, awaiting review",
  in_progress: "In progress",
  needs_clarification: "Needs a little more detail",
  needs_more_signal: "Needs more signal",
  not_planned: "Not planned",
  planned: "Planned",
  received: "Received",
  shipped: "Shipped",
};

export function buildUserStatus(input: {
  createdAt?: string;
  clarificationQuestions?: UserFeedbackStatus["clarificationQuestions"];
  feedbackId: string;
  message: string;
  state: UserFeedbackState;
  timeline?: FeedbackTimelineEvent[];
}): UserFeedbackStatus {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const timeline =
    input.timeline && input.timeline.length > 0
      ? input.timeline
      : [
          {
            body: "Your feedback was received by Open Feedback Factory.",
            createdAt,
            event: "feedback_received",
            label: "Feedback received",
          },
        ];

  return {
    clarificationQuestions: input.clarificationQuestions ?? [],
    feedbackId: input.feedbackId,
    label: LABELS[input.state],
    message: input.message,
    state: input.state,
    timeline,
  };
}
