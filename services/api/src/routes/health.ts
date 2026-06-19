import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.js";
import { accessControlStatus } from "../auth.js";
import { getCodexApiKeyStatus } from "../secrets.js";
import { githubWebhooksEnabledForBaseUrl } from "./github.js";

export async function registerHealthRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.get("/health", async () => ({
    ok: true,
    service: "open-feedback-factory-api",
  }));

  app.get("/doctor", async () => {
    const approvalMode = await deps.store.getApprovalMode(deps.config.approvalMode);
    const codexAuthMode = await deps.store.getCodexAuthMode(deps.config.codexAuthMode);
    const maxFeatureCostUsd = await deps.store.getMaxFeatureCostUsd(deps.config.maxFeatureCostUsd);
    const mergeGuardrails = await deps.store.getMergeGuardrailPolicy(defaultMergeGuardrailPolicy(deps));
    const codexApiKeyStatus = await getCodexApiKeyStatus(deps.config);
    const accessControls = accessControlStatus(deps.config);
    return {
      ...accessControls,
      api: "ok",
      approvalMode,
      autoMergeEnabled: deps.config.autoMergeEnabled,
      codexApiKeyConfigured: codexApiKeyStatus.configured,
      codexApiKeyFingerprint: codexApiKeyStatus.fingerprint,
      codexApiKeySource: codexApiKeyStatus.source,
      codexAuthMode,
      codexRunnerMode: deps.config.codexRunnerMode,
      codexSecretStorageWritable: codexApiKeyStatus.writable,
      codexSecretsPath: codexApiKeyStatus.path,
      controlCenterUrl: deps.config.controlCenterUrl,
      databaseConfigured: Boolean(deps.config.databaseUrl),
      githubAppConfigured: Boolean(
        deps.config.githubAppId && (deps.config.githubAppPrivateKey || deps.config.githubAppPrivateKeyPath),
      ),
      githubAppSetupUrl: `${deps.config.publicBaseUrl}/github/app/setup`,
      githubMode: deps.config.githubMode,
      githubWebhookUrl: `${deps.config.publicBaseUrl}/github/webhook`,
      githubWebhooksEnabled: githubWebhooksEnabledForBaseUrl(deps.config.publicBaseUrl),
      autoMergePolicyEnabled: mergeGuardrails.autoMergePolicyEnabled,
      maxFeatureCostUsd,
      maxSafeDiffLines: mergeGuardrails.maxSafeDiffLines,
      protectedPathFragments: mergeGuardrails.protectedPathFragments,
      publicBaseUrl: deps.config.publicBaseUrl,
      runnerInstall: buildRunnerInstallPlan(codexAuthMode),
    };
  });
}

function defaultMergeGuardrailPolicy(deps: AppDeps) {
  return {
    autoMergePolicyEnabled: true,
    maxSafeDiffLines: deps.config.maxSafeDiffLines,
    protectedPathFragments: deps.config.protectedPathFragments,
  };
}

function buildRunnerInstallPlan(codexAuthMode: "api_key" | "cli") {
  return {
    dockerApiKey: {
      env: ["CODEX_RUNNER_MODE=codex", "CODEX_AUTH_MODE=api_key", "DOCKER_CODEX_CLI=codex", "CODEX_CLI_VERSION=0.141.0"],
      requirement: "Save an OpenAI API key in the control center before starting the Docker worker.",
      startCommand: "docker compose up -d --build worker",
      title: "Docker API-key worker",
    },
    hostCli: {
      installCommand: "pnpm worker:install:host",
      logPath: ".off/logs/host-worker.log",
      printCommand: "pnpm worker:print:host",
      service: "macOS LaunchAgent or Linux user systemd",
      statusCommand: "pnpm worker:status:host",
      title: "Host Codex CLI worker",
      uninstallCommand: "pnpm worker:uninstall:host",
    },
    recommendedMode: codexAuthMode === "api_key" ? "docker_api_key" : "host_cli",
  };
}
