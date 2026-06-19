export interface WorkerConfig {
  apiBaseUrl: string;
  codexCli: string;
  codexEffort: string;
  codexManageGit: boolean;
  codexModel: string;
  githubMode: "app" | "disabled" | "gh";
  pollIntervalMs: number;
  pullRequestBase: string;
  pullRequestEnabled: boolean;
  runOnce: boolean;
  runnerMode: "codex" | "demo";
  runnerWorkspace: string;
  workerName: string;
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
    githubMode: githubModeFromEnv(env.GITHUB_MODE),
    pollIntervalMs: Number(env.WORKER_POLL_INTERVAL_MS ?? 5000),
    pullRequestBase: env.GITHUB_PR_BASE ?? "main",
    pullRequestEnabled: env.GITHUB_CREATE_PR === "true",
    runOnce: env.WORKER_RUN_ONCE === "true",
    runnerMode: env.CODEX_RUNNER_MODE === "codex" ? "codex" : "demo",
    runnerWorkspace: env.RUNNER_WORKSPACE ?? process.cwd(),
    workerName: env.WORKER_NAME ?? "open-feedback-worker",
  };
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function githubModeFromEnv(value: string | undefined): WorkerConfig["githubMode"] {
  if (value === "app" || value === "gh") return value;
  return "disabled";
}
