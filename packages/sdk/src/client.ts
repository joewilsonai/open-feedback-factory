export type FeedbackSeverity = "info" | "low" | "medium" | "high" | "critical";

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

export interface UserClarificationQuestion {
  id: string;
  placeholder?: string;
  question: string;
}

export interface FeedbackTimelineEvent {
  body: string;
  createdAt: string;
  event: string;
  label: string;
  proof?: string;
}

export interface UserFeedbackStatus {
  clarificationQuestions: UserClarificationQuestion[];
  feedbackId: string;
  label: string;
  message: string;
  state: UserFeedbackState;
  timeline: FeedbackTimelineEvent[];
}

export interface OpenFeedbackClientOptions {
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
  metadata?: Record<string, unknown>;
  userId?: string;
}

export interface SubmitFeedbackInput {
  message: string;
  metadata?: Record<string, unknown>;
  severity?: FeedbackSeverity;
  source?: string;
}

export interface SubmitFeedbackResult {
  feedbackId: string;
  status: UserFeedbackStatus;
  workItemId: string | null;
}

export interface TrackFeatureUsageInput {
  action: string;
  featureId: string;
  metadata?: Record<string, unknown>;
}

export interface OpenFeedbackClient {
  getFeedbackStatus(feedbackId: string): Promise<UserFeedbackStatus>;
  submitFeedback(input: SubmitFeedbackInput): Promise<SubmitFeedbackResult>;
  trackFeatureUsage(input: TrackFeatureUsageInput): Promise<{ usageId: string }>;
}

export function createOpenFeedbackClient(options: OpenFeedbackClientOptions): OpenFeedbackClient {
  const apiBaseUrl = options.apiBaseUrl.replace(/\/+$/, "");
  const fetcher = options.fetchImpl ?? fetch;

  return {
    async getFeedbackStatus(feedbackId) {
      const response = await fetcher(`${apiBaseUrl}/sdk/feedback/${encodeURIComponent(feedbackId)}/status`);
      return parseJsonResponse<UserFeedbackStatus>(response);
    },

    async submitFeedback(input) {
      const response = await fetcher(`${apiBaseUrl}/sdk/feedback`, {
        body: JSON.stringify({
          message: input.message,
          metadata: safeMetadata({
            ...(options.metadata ?? {}),
            ...(input.metadata ?? {}),
          }),
          severity: input.severity ?? "medium",
          source: input.source ?? "web_sdk",
          userId: options.userId,
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });

      return parseJsonResponse<SubmitFeedbackResult>(response);
    },

    async trackFeatureUsage(input) {
      const response = await fetcher(`${apiBaseUrl}/sdk/features/${encodeURIComponent(input.featureId)}/usage`, {
        body: JSON.stringify({
          action: input.action,
          metadata: safeMetadata({
            ...(options.metadata ?? {}),
            ...(input.metadata ?? {}),
          }),
          userId: options.userId,
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });

      return parseJsonResponse<{ usageId: string }>(response);
    },
  };
}

function safeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (/raw|screenshot|transcript|secret|token|password/i.test(key)) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      output[key] = value;
    }
  }
  return output;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body && body.error
        ? String(body.error)
        : `Request failed with ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}
