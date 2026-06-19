import cors from "@fastify/cors";
import { type FeedbackInput, type UserFeedbackStatus } from "@open-feedback-factory/core";
import type { ControlRoomSnapshot, WorkItemRow } from "@open-feedback-factory/db";
import Fastify, { type FastifyInstance } from "fastify";
import type { ApiConfig } from "./config.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerGithubRoutes } from "./routes/github.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerRunnerRoutes } from "./routes/runner.js";
import { registerSdkRoutes } from "./routes/sdk.js";

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
  getControlRoomSnapshot(): Promise<ControlRoomSnapshot>;
  getUserFeedbackStatus(feedbackId: string): Promise<UserFeedbackStatus | null>;
  getWorkItem(id: string): Promise<WorkItemRow | null>;
  listWorkItems(): Promise<WorkItemRow[]>;
  markWorkItemReleased(workItemId: string, message?: string): Promise<void>;
  recordAgentRun(input: {
    agentName: string;
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
}

export interface AppDeps {
  config: ApiConfig;
  store: AppStore;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
  });

  await app.register(cors, {
    origin: true,
  });

  await registerHealthRoutes(app, deps);
  await registerSdkRoutes(app, deps);
  await registerAdminRoutes(app, deps);
  await registerRunnerRoutes(app, deps);
  await registerGithubRoutes(app, deps);

  return app;
}
