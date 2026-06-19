import cors from "@fastify/cors";
import { type AgentAssumptionRecord, type FeedbackInput, type UserFeedbackStatus } from "@open-feedback-factory/core";
import type { ControlRoomSnapshot, ReconciliationResult, WorkItemRow } from "@open-feedback-factory/db";
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
    feedbackId: string;
    status: UserFeedbackStatus;
    workItemId: string | null;
  }>;
  claimNextWorkItem(workerName?: string, workItemId?: string): Promise<WorkItemRow | null>;
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
  getUserFeedbackStatus(feedbackId: string): Promise<UserFeedbackStatus | null>;
  getWorkItem(id: string): Promise<WorkItemRow | null>;
  listWorkItems(): Promise<WorkItemRow[]>;
  markWorkItemReleased(workItemId: string, message?: string): Promise<void>;
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
  setApprovalMode(mode: ApiConfig["approvalMode"], actor?: string): Promise<void>;
  setCodexAuthMode(mode: ApiConfig["codexAuthMode"], actor?: string): Promise<void>;
}

export interface AppDeps {
  config: ApiConfig;
  store: AppStore;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
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
