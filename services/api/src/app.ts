import cors from "@fastify/cors";
import {
  type AgentAssumptionRecord,
  type FeedbackInput,
  type MergeMode,
  type UserFeedbackStatus,
  type WorkCadencePolicy,
} from "@open-feedback-factory/core";
import type { GitHubInstallationRepositoryList, GitHubIssueInput } from "@open-feedback-factory/runner";
import type {
  ControlRoomSnapshot,
  CostBudgetPolicy,
  CostBudgetUsage,
  MergeGuardrailPolicy,
  ReconciliationResult,
  WorkerHeartbeatInput,
  WorkerHeartbeatRow,
  WorkItemDetail,
  WorkItemReviewDecision,
  WorkItemRow,
} from "@open-feedback-factory/db";
import Fastify, { type FastifyInstance } from "fastify";
import { registerAccessControls } from "./auth.js";
import type { ApiConfig } from "./config.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerGithubRoutes } from "./routes/github.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerRunnerRoutes } from "./routes/runner.js";
import { registerSdkRoutes } from "./routes/sdk.js";
import { registerRateLimits } from "./rateLimit.js";

export interface AppStore {
  createFeedbackIntake(input: {
    decision: ReturnType<typeof import("@open-feedback-factory/core").routeFeedback>;
    feedback: FeedbackInput;
    sanitized: ReturnType<typeof import("@open-feedback-factory/core").sanitizeFeedback>;
  }): Promise<{
    createdWorkItem?: boolean;
    feedbackId: string;
    status: UserFeedbackStatus;
    workItemId: string | null;
  }>;
  claimNextWorkItem(workerName?: string, workItemId?: string, maxFeatureCostUsd?: number): Promise<WorkItemRow | null>;
  completeWorkItemRun(input: {
    agentName: string;
    assumptions?: AgentAssumptionRecord[];
    costActual?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    runType: string;
    status: "blocked" | "failed" | "succeeded";
    summary: string;
    workItemId: string;
  }): Promise<string>;
  getControlRoomSnapshot(): Promise<ControlRoomSnapshot>;
  getApprovalMode(defaultMode: ApiConfig["approvalMode"]): Promise<ApiConfig["approvalMode"]>;
  getCodexAuthMode(defaultMode: ApiConfig["codexAuthMode"]): Promise<ApiConfig["codexAuthMode"]>;
  getCostBudget(defaultBudget: CostBudgetPolicy): Promise<CostBudgetPolicy>;
  getCostBudgetUsage(): Promise<CostBudgetUsage>;
  getFeedbackClusterSignalCount(clusterKey: string): Promise<number>;
  getMaxFeatureCostUsd(defaultCap: number): Promise<number>;
  getMergeMode(defaultMode: ApiConfig["mergeMode"]): Promise<MergeMode>;
  getMergeGuardrailPolicy(defaultPolicy: MergeGuardrailPolicy): Promise<MergeGuardrailPolicy>;
  getWorkCadencePolicy(defaultPolicy: WorkCadencePolicy): Promise<WorkCadencePolicy>;
  getLatestWorkerHeartbeat(): Promise<WorkerHeartbeatRow | null>;
  getUserFeedbackStatus(feedbackId: string): Promise<UserFeedbackStatus | null>;
  getWorkItem(id: string): Promise<WorkItemRow | null>;
  getWorkItemDetail(id: string): Promise<WorkItemDetail | null>;
  getWorkItemReviewDecision(workItemId: string): Promise<WorkItemReviewDecision | null>;
  listWorkItems(): Promise<WorkItemRow[]>;
  markWorkItemDecision(input: {
    actor?: string;
    decisionCategory?: string;
    message: string;
    status: "blocked" | "not_planned";
    workItemId: string;
  }): Promise<void>;
  markWorkItemReleased(workItemId: string, message?: string, featureId?: string): Promise<void>;
  reconcileWorkItems(input?: { actor?: string; staleAfterMinutes?: number }): Promise<ReconciliationResult>;
  recordAgentRun(input: {
    agentName: string;
    assumptions?: AgentAssumptionRecord[];
    costActual?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    runType: string;
    status: string;
    summary: string;
    workItemId: string;
  }): Promise<string>;
  recordFeatureUsage(input: {
    action: string;
    featureId: string;
    metadata?: Record<string, unknown>;
    userId?: string;
  }): Promise<string>;
  recordGithubArtifact(input: {
    artifactNumber?: number;
    artifactType: "issue" | "pull_request";
    metadata?: Record<string, unknown>;
    url: string;
    workItemId: string;
  }): Promise<string>;
  recordGithubWebhookDelivery(input: {
    deliveryId?: string | null;
    event: string;
    metadata?: Record<string, unknown>;
  }): Promise<boolean>;
  recordWorkerHeartbeat(input: WorkerHeartbeatInput): Promise<WorkerHeartbeatRow>;
  recordWorkItemReview(input: {
    actor?: string;
    approved: boolean;
    reviewType?: "agent" | "human";
    summary: string;
    workItemId: string;
  }): Promise<WorkItemReviewDecision>;
  setApprovalMode(mode: ApiConfig["approvalMode"], actor?: string): Promise<void>;
  setCodexAuthMode(mode: ApiConfig["codexAuthMode"], actor?: string): Promise<void>;
  setCostBudget(policy: CostBudgetPolicy, actor?: string): Promise<CostBudgetPolicy>;
  setMaxFeatureCostUsd(amountUsd: number, actor?: string): Promise<void>;
  setMergeMode(mode: ApiConfig["mergeMode"], actor?: string): Promise<void>;
  setMergeGuardrailPolicy(policy: MergeGuardrailPolicy, actor?: string): Promise<MergeGuardrailPolicy>;
  setWorkCadencePolicy(policy: WorkCadencePolicy, actor?: string): Promise<WorkCadencePolicy>;
}

export interface AppGithubClient {
  createIssue?(input: GitHubIssueInput): Promise<string>;
  listInstallationRepositories(): Promise<GitHubInstallationRepositoryList>;
}

export interface AppDeps {
  config: ApiConfig;
  githubClient?: AppGithubClient;
  store: AppStore;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
  });

  app.setErrorHandler((error, request, reply) => {
    const apiError = error as { message?: unknown; statusCode?: unknown };
    const storageError = storageNotReadyError(error);
    if (storageError) {
      return reply.code(503).send(storageError);
    }

    const statusCode = typeof apiError.statusCode === "number" && apiError.statusCode >= 400 ? apiError.statusCode : 500;
    if (statusCode >= 500) {
      return reply.code(statusCode).send({
        code: "internal_error",
        error: request.url.startsWith("/sdk/")
          ? "Feedback is temporarily unavailable. Please try again soon."
          : "Open Feedback Factory hit an internal error. Check server logs for details.",
        retryable: true,
      });
    }

    return reply.code(statusCode).send({ error: typeof apiError.message === "string" ? apiError.message : "Request failed" });
  });

  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    const rawBody = typeof body === "string" ? body : body.toString("utf8");
    (request as typeof request & { rawBody?: string }).rawBody = rawBody;
    try {
      done(null, rawBody ? JSON.parse(rawBody) : {});
    } catch (error) {
      done(error as Error);
    }
  });

  await app.register(cors, {
    origin: true,
  });

  await registerRateLimits(app, deps.config);
  await registerAccessControls(app, deps.config);
  await registerHealthRoutes(app, deps);
  await registerSdkRoutes(app, deps);
  await registerAdminRoutes(app, deps);
  await registerRunnerRoutes(app, deps);
  await registerGithubRoutes(app, deps);

  return app;
}

function storageNotReadyError(error: unknown) {
  const pgError = error as { code?: unknown; message?: unknown };
  const code = typeof pgError.code === "string" ? pgError.code : "";
  const message = typeof pgError.message === "string" ? pgError.message : "";

  if (
    ["42P01", "42703", "42883"].includes(code) ||
    /relation .+ does not exist|column .+ does not exist|function .+ does not exist/i.test(message)
  ) {
    return {
      code: "storage_not_ready",
      error: "Feedback storage is still being prepared. Please try again soon.",
      retryable: true,
    };
  }

  return null;
}
