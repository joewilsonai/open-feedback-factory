import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.js";

export async function registerHealthRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.get("/health", async () => ({
    ok: true,
    service: "open-feedback-factory-api",
  }));

  app.get("/doctor", async () => ({
    api: "ok",
    autoMergeEnabled: deps.config.autoMergeEnabled,
    codexRunnerMode: deps.config.codexRunnerMode,
    databaseConfigured: Boolean(deps.config.databaseUrl),
    githubMode: deps.config.githubMode,
    maxFeatureCostUsd: deps.config.maxFeatureCostUsd,
    protectedPathFragments: deps.config.protectedPathFragments,
  }));
}
