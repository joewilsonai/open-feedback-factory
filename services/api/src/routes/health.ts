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
    controlCenterUrl: deps.config.controlCenterUrl,
    databaseConfigured: Boolean(deps.config.databaseUrl),
    githubAppConfigured: Boolean(
      deps.config.githubAppId && (deps.config.githubAppPrivateKey || deps.config.githubAppPrivateKeyPath),
    ),
    githubAppSetupUrl: `${deps.config.publicBaseUrl}/github/app/setup`,
    githubMode: deps.config.githubMode,
    maxFeatureCostUsd: deps.config.maxFeatureCostUsd,
    protectedPathFragments: deps.config.protectedPathFragments,
    publicBaseUrl: deps.config.publicBaseUrl,
  }));
}
