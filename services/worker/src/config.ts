import { readFileSync } from "node:fs";
import path from "node:path";
import {
  normalizeCodexCommandPolicy,
  normalizeCodexSandboxPolicy,
  type CodexApprovalPolicy,
  type CodexCommandPolicy,
  type CodexPricing,
  type CodexRunnerSandboxPolicy,
  type CodexRunnerSandboxPolicyInput,
} from "@open-feedback-factory/runner";

export interface WorkerConfig {
  apiBaseUrl: string;
  approvalMode: "auto" | "manual";
  codexAuthMode: "api_key" | "cli";
  codexCli: string;
  codexCommandPolicy: CodexCommandPolicy;
  codexCommandPolicyError?: string;
  codexEffort: string;
  codexManageGit: boolean;
  codexModel: string;
  codexPricing?: CodexPricing;
  codexSandboxPolicy: CodexRunnerSandboxPolicy;
  codexSandboxPolicyError?: string;
  codexSecretsPath: string;
  codexTimeoutMs: number;
  githubMode: "app" | "disabled" | "gh";
  githubAppId?: string;
  githubAppInstallationId?: string;
  githubAppPrivateKey?: string;
  githubAppPrivateKeyPath?: string;
  githubOwner: string;
  githubRepo: string;
  pollIntervalMs: number;
  pullRequestBase: string;
  pullRequestEnabled: boolean;
  runOnce: boolean;
  runnerMode: "codex" | "disabled";
  runnerToken?: string;
  runnerWorkspace: string;
  runsInContainer: boolean;
  workerName: string;
  workItemId?: string;
  openAiApiKey?: string;
}

export function readWorkerConfig(env = process.env): WorkerConfig {
  const codexSandbox = readCodexSandboxPolicy(env);
  const codexCommandPolicy = readCodexCommandPolicy(env);
  return {
    apiBaseUrl: trimTrailingSlash(
      env.WORKER_API_BASE_URL ?? env.API_BASE_URL ?? env.VITE_API_BASE_URL ?? "http://localhost:4100",
    ),
    approvalMode: env.APPROVAL_MODE === "auto" ? "auto" : "manual",
    codexAuthMode: env.CODEX_AUTH_MODE === "api_key" ? "api_key" : "cli",
    codexCli: env.CODEX_CLI ?? "codex",
    codexCommandPolicy: codexCommandPolicy.policy,
    codexCommandPolicyError: codexCommandPolicy.error,
    codexEffort: env.CODEX_EFFORT ?? "extra-high",
    codexManageGit: env.CODEX_MANAGE_GIT === "true",
    codexModel: env.CODEX_MODEL ?? "gpt-5.5",
    codexPricing: readCodexPricing(env),
    codexSandboxPolicy: codexSandbox.policy,
    codexSandboxPolicyError: codexSandbox.error,
    codexSecretsPath: env.CODEX_SECRETS_PATH ?? ".off/secrets.env",
    codexTimeoutMs: Number(env.CODEX_TIMEOUT_MS ?? 5 * 60_000),
    githubMode: githubModeFromEnv(env.GITHUB_MODE),
    githubAppId: env.GITHUB_APP_ID || undefined,
    githubAppInstallationId: env.GITHUB_APP_INSTALLATION_ID || undefined,
    githubAppPrivateKey: env.GITHUB_APP_PRIVATE_KEY || undefined,
    githubAppPrivateKeyPath: env.GITHUB_APP_PRIVATE_KEY_PATH || undefined,
    githubOwner: env.GITHUB_OWNER ?? "joewilsonai",
    githubRepo: env.GITHUB_REPO ?? "open-feedback-factory",
    pollIntervalMs: Number(env.WORKER_POLL_INTERVAL_MS ?? 5000),
    pullRequestBase: env.GITHUB_PR_BASE ?? "main",
    pullRequestEnabled: env.GITHUB_CREATE_PR === "true",
    runOnce: env.WORKER_RUN_ONCE === "true",
    runnerMode: env.CODEX_RUNNER_MODE === "codex" ? "codex" : "disabled",
    runnerToken: env.RUNNER_TOKEN || undefined,
    runnerWorkspace: env.RUNNER_WORKSPACE ?? process.cwd(),
    runsInContainer: env.OFF_WORKER_CONTAINER === "true",
    workerName: env.WORKER_NAME ?? "open-feedback-worker",
    workItemId: env.WORKER_WORK_ITEM_ID || undefined,
    openAiApiKey: readOpenAiApiKey(env.OPENAI_API_KEY, env.CODEX_SECRETS_PATH ?? ".off/secrets.env"),
  };
}

function readCodexCommandPolicy(env: NodeJS.ProcessEnv): {
  error?: string;
  policy: CodexCommandPolicy;
} {
  try {
    return {
      policy: normalizeCodexCommandPolicy({
        allowPrefixes: commandPrefixListFromEnv(env.CODEX_COMMAND_ALLOW_PREFIXES),
        denyPrefixes: commandPrefixListFromEnv(env.CODEX_COMMAND_DENY_PREFIXES),
        promptPrefixes: commandPrefixListFromEnv(env.CODEX_COMMAND_PROMPT_PREFIXES),
      }),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      policy: normalizeCodexCommandPolicy(),
    };
  }
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function githubModeFromEnv(value: string | undefined): WorkerConfig["githubMode"] {
  if (value === "app" || value === "gh") return value;
  return "disabled";
}

function readCodexPricing(env: NodeJS.ProcessEnv): CodexPricing | undefined {
  const inputUsdPerMillion = numberFromEnv(env.CODEX_INPUT_USD_PER_1M);
  const cachedInputUsdPerMillion = numberFromEnv(env.CODEX_CACHED_INPUT_USD_PER_1M);
  const outputUsdPerMillion = numberFromEnv(env.CODEX_OUTPUT_USD_PER_1M);
  const reasoningOutputUsdPerMillion = numberFromEnv(env.CODEX_REASONING_OUTPUT_USD_PER_1M);

  if (
    inputUsdPerMillion === undefined ||
    cachedInputUsdPerMillion === undefined ||
    outputUsdPerMillion === undefined ||
    reasoningOutputUsdPerMillion === undefined
  ) {
    return undefined;
  }

  return {
    cachedInputUsdPerMillion,
    inputUsdPerMillion,
    outputUsdPerMillion,
    reasoningOutputUsdPerMillion,
  };
}

function readCodexSandboxPolicy(env: NodeJS.ProcessEnv): {
  error?: string;
  policy: CodexRunnerSandboxPolicy;
} {
  const input: CodexRunnerSandboxPolicyInput = {
    allowLocalNetwork: env.CODEX_NETWORK_ALLOW_LOCAL === "true",
    allowLoginShell: false,
    allowUpstreamProxy: env.CODEX_NETWORK_ALLOW_UPSTREAM_PROXY === "true",
    approvalPolicy: codexApprovalPolicyFromEnv(env.CODEX_APPROVAL_POLICY),
    mode: codexSandboxModeFromEnv(env.CODEX_SANDBOX_MODE),
    networkAccess: env.CODEX_NETWORK_ACCESS === "true",
    networkAllowedDomains: csvFromEnv(env.CODEX_NETWORK_ALLOWED_DOMAINS),
    networkDeniedDomains: csvFromEnv(env.CODEX_NETWORK_DENIED_DOMAINS),
    webSearch: "disabled",
  };

  try {
    return { policy: normalizeCodexSandboxPolicy(input) };
  } catch (error) {
    const safePolicy = normalizeCodexSandboxPolicy();
    return {
      error: error instanceof Error ? error.message : String(error),
      policy: safePolicy,
    };
  }
}

function codexSandboxModeFromEnv(value: string | undefined): CodexRunnerSandboxPolicyInput["mode"] {
  if (value === "read-only" || value === "workspace-write" || value === "danger-full-access") return value;
  return "workspace-write";
}

function codexApprovalPolicyFromEnv(value: string | undefined): CodexApprovalPolicy {
  if (value === "on-request" || value === "untrusted") return value;
  return "never";
}

function csvFromEnv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function commandPrefixListFromEnv(value: string | undefined): string[][] {
  if (!value) return [];
  if (/[\r\n]/.test(value)) {
    throw new Error("Codex command policy env values must be single-line semicolon-separated prefixes.");
  }
  return value
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.split(/\s+/));
}

function numberFromEnv(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function readOpenAiApiKey(envValue: string | undefined, secretsPath: string): string | undefined {
  if (isUsableApiKey(envValue)) return envValue.trim();
  try {
    const contents = readFileSync(path.resolve(secretsPath), "utf8");
    const value = parseEnvValue(contents, "OPENAI_API_KEY");
    return isUsableApiKey(value) ? value.trim() : undefined;
  } catch (error) {
    if (isMissingFileError(error)) return undefined;
    throw error;
  }
}

function parseEnvValue(contents: string, key: string): string | undefined {
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    if (trimmed.slice(0, separatorIndex).trim() !== key) continue;
    return unquoteEnvValue(trimmed.slice(separatorIndex + 1).trim());
  }
  return undefined;
}

function unquoteEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
}

function isUsableApiKey(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length >= 20;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
