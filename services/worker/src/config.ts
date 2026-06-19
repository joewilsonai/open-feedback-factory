import type { CodexPricing } from "@open-feedback-factory/runner";

export interface WorkerConfig {
  apiBaseUrl: string;
  codexCli: string;
  codexEffort: string;
  codexManageGit: boolean;
  codexModel: string;
  codexPricing?: CodexPricing;
  codexTimeoutMs: number;
  githubMode: "app" | "disabled" | "gh";
  pollIntervalMs: number;
  pullRequestBase: string;
  pullRequestEnabled: boolean;
  runOnce: boolean;
  runnerMode: "codex" | "demo";
  runnerWorkspace: string;
  workerName: string;
  workItemId?: string;
}

export function readWorkerConfig(env = process.env): WorkerConfig {
  return {
    apiBaseUrl: trimTrailingSlash(
      env.WORKER_API_BASE_URL ?? env.API_BASE_URL ?? env.VITE_API_BASE_URL ?? "http://localhost:4100",
    ),
    codexCli: env.CODEX_CLI ?? "codex",
    codexEffort: env.CODEX_EFFORT ?? "extra-high",
    codexManageGit: env.CODEX_MANAGE_GIT === "true",
    codexModel: env.CODEX_MODEL ?? "gpt-5.5",
    codexPricing: readCodexPricing(env),
    codexTimeoutMs: Number(env.CODEX_TIMEOUT_MS ?? 5 * 60_000),
    githubMode: githubModeFromEnv(env.GITHUB_MODE),
    pollIntervalMs: Number(env.WORKER_POLL_INTERVAL_MS ?? 5000),
    pullRequestBase: env.GITHUB_PR_BASE ?? "main",
    pullRequestEnabled: env.GITHUB_CREATE_PR === "true",
    runOnce: env.WORKER_RUN_ONCE === "true",
    runnerMode: env.CODEX_RUNNER_MODE === "codex" ? "codex" : "demo",
    runnerWorkspace: env.RUNNER_WORKSPACE ?? process.cwd(),
    workerName: env.WORKER_NAME ?? "open-feedback-worker",
    workItemId: env.WORKER_WORK_ITEM_ID || undefined,
  };
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

function numberFromEnv(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
