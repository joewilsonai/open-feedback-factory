export interface WorkerConfig {
  apiBaseUrl: string;
  codexCli: string;
  codexEffort: string;
  codexModel: string;
  pollIntervalMs: number;
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
    codexModel: env.CODEX_MODEL ?? "gpt-5.5",
    pollIntervalMs: Number(env.WORKER_POLL_INTERVAL_MS ?? 5000),
    runOnce: env.WORKER_RUN_ONCE === "true",
    runnerMode: env.CODEX_RUNNER_MODE === "codex" ? "codex" : "demo",
    runnerWorkspace: env.RUNNER_WORKSPACE ?? process.cwd(),
    workerName: env.WORKER_NAME ?? "open-feedback-worker",
  };
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
