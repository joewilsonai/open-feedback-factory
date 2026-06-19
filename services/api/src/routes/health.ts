import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.js";
import { githubWebhooksEnabledForBaseUrl } from "./github.js";

export async function registerHealthRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.get("/health", async () => ({
    ok: true,
    service: "open-feedback-factory-api",
  }));

  app.get("/doctor", async () => {
    const approvalMode = await deps.store.getApprovalMode(deps.config.approvalMode);
    return {
      api: "ok",
      approvalMode,
      autoMergeEnabled: deps.config.autoMergeEnabled,
      codexApiKeyConfigured: deps.config.codexApiKeyConfigured,
      codexAuthMode: deps.config.codexAuthMode,
      codexRunnerMode: deps.config.codexRunnerMode,
      controlCenterUrl: deps.config.controlCenterUrl,
      databaseConfigured: Boolean(deps.config.databaseUrl),
      githubAppConfigured: Boolean(
        deps.config.githubAppId && (deps.config.githubAppPrivateKey || deps.config.githubAppPrivateKeyPath),
      ),
      githubAppSetupUrl: `${deps.config.publicBaseUrl}/github/app/setup`,
      githubMode: deps.config.githubMode,
      githubWebhookUrl: `${deps.config.publicBaseUrl}/github/webhook`,
      githubWebhooksEnabled: githubWebhooksEnabledForBaseUrl(deps.config.publicBaseUrl),
      maxFeatureCostUsd: deps.config.maxFeatureCostUsd,
      protectedPathFragments: deps.config.protectedPathFragments,
      publicBaseUrl: deps.config.publicBaseUrl,
    };
  });
}
