import type { FastifyInstance } from "fastify";
import type { WorkerHeartbeatRow } from "@open-feedback-factory/db";
import type { AppDeps } from "../app.js";
import { accessControlStatus } from "../auth.js";
import { defaultCostBudget } from "../costBudget.js";
import { getCodexApiKeyStatus } from "../secrets.js";
import { githubWebhooksEnabledForBaseUrl } from "./github.js";

const workerHeartbeatStaleAfterMs = 90_000;

export async function registerHealthRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.get("/health", async () => ({
    ok: true,
    service: "open-feedback-factory-api",
  }));

  app.get("/doctor", async () => {
    const approvalMode = await deps.store.getApprovalMode(deps.config.approvalMode);
    const codexAuthMode = await deps.store.getCodexAuthMode(deps.config.codexAuthMode);
    const costBudget = await deps.store.getCostBudget(defaultCostBudget(deps.config));
    const mergeGuardrails = await deps.store.getMergeGuardrailPolicy(defaultMergeGuardrailPolicy(deps));
    const codexApiKeyStatus = await getCodexApiKeyStatus(deps.config);
    const workerHeartbeat = await deps.store.getLatestWorkerHeartbeat();
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
      costBudget,
      costBudgetUsage: await deps.store.getCostBudgetUsage(),
      maxFeatureCostUsd: costBudget.maxFeatureCostUsd,
      maxSafeDiffLines: mergeGuardrails.maxSafeDiffLines,
      protectedPathFragments: mergeGuardrails.protectedPathFragments,
      publicBaseUrl: deps.config.publicBaseUrl,
      codexConnection: buildCodexConnectionPlan(codexAuthMode, codexApiKeyStatus),
      runnerInstall: buildRunnerInstallPlan(codexAuthMode),
      workerConnection: buildWorkerConnection(workerHeartbeat),
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

function buildCodexConnectionPlan(
  codexAuthMode: "api_key" | "cli",
  codexApiKeyStatus: { configured: boolean; fingerprint: string | null; source: string },
) {
  return {
    activeMode: codexAuthMode,
    apiKey: {
      configured: codexApiKeyStatus.configured,
      fingerprint: codexApiKeyStatus.fingerprint,
      label: "OpenAI API key",
      source: codexApiKeyStatus.source,
      status: codexApiKeyStatus.configured ? "configured" : "missing",
      summary: codexApiKeyStatus.configured
        ? "BYO API key is saved for a paid server-side Codex worker."
        : "Save a BYO OpenAI API key before using the Docker API-key worker.",
      supported: true,
    },
    subscription: {
      hostedDelegation: {
        status: "not_supported",
        summary:
          "Hosted subscription delegation needs a trusted runner or provider-supported delegated token path before Open Feedback Factory can use a user's Codex subscription from a hosted worker.",
        supported: false,
      },
      label: "Codex subscription",
      localLoginCommand: "codex login --device-auth",
      status: "trusted_worker_required",
      statusCommand: "codex login status",
      summary: "Uses the signed-in Codex CLI on a trusted host worker machine.",
      supported: true,
      workerRequirement: "Install the host worker on the trusted host worker where Codex is signed in.",
    },
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

export function buildWorkerConnection(row: WorkerHeartbeatRow | null, now = new Date()) {
  if (!row) {
    return {
      ageSeconds: null,
      codexAuthMode: null,
      heartbeatStatus: null,
      lastSeenAt: null,
      runnerMode: null,
      staleAfterSeconds: workerHeartbeatStaleAfterMs / 1000,
      status: "offline",
      summary: "No worker heartbeat yet. Install and start a trusted worker before expecting agent work.",
      workerKind: null,
      workerName: null,
    };
  }

  const lastSeenAt = new Date(row.lastSeenAt);
  const ageMs = now.getTime() - lastSeenAt.getTime();
  const ageSeconds = Number.isFinite(ageMs) ? Math.max(0, Math.round(ageMs / 1000)) : null;
  const stale = ageSeconds === null || ageMs > workerHeartbeatStaleAfterMs;

  return {
    ageSeconds,
    codexAuthMode: row.codexAuthMode,
    heartbeatStatus: row.status,
    lastSeenAt: row.lastSeenAt,
    runnerMode: row.runnerMode,
    staleAfterSeconds: workerHeartbeatStaleAfterMs / 1000,
    status: stale ? "stale" : "online",
    summary: stale
      ? "Worker is stale; the last heartbeat is older than the liveness window."
      : "Trusted worker online; the last heartbeat was received recently.",
    workerKind: row.workerKind,
    workerName: row.workerName,
  };
}
