export interface ApiConfig {
  apiHost: string;
  apiPort: number;
  autoMergeEnabled: boolean;
  codexRunnerMode: "codex" | "demo";
  databaseUrl: string;
  githubMode: "app" | "disabled" | "gh";
  githubOwner: string;
  githubRepo: string;
  githubWebhookSecret: string;
  maxFeatureCostUsd: number;
  maxSafeDiffLines: number;
  protectedPathFragments: string[];
  publicBaseUrl: string;
  runnerWorkspace: string;
}

export function readConfig(env = process.env): ApiConfig {
  return {
    apiHost: env.API_HOST ?? "127.0.0.1",
    apiPort: Number(env.API_PORT ?? 4100),
    autoMergeEnabled: env.AUTO_MERGE_ENABLED === "true",
    codexRunnerMode: env.CODEX_RUNNER_MODE === "codex" ? "codex" : "demo",
    databaseUrl: env.DATABASE_URL ?? env.DOCKER_DATABASE_URL ?? "",
    githubMode: githubModeFromEnv(env.GITHUB_MODE),
    githubOwner: env.GITHUB_OWNER ?? "joewilsonai",
    githubRepo: env.GITHUB_REPO ?? "open-feedback-factory",
    githubWebhookSecret: env.GITHUB_WEBHOOK_SECRET ?? "",
    maxFeatureCostUsd: Number(env.MAX_FEATURE_COST_USD ?? 5),
    maxSafeDiffLines: Number(env.MAX_SAFE_DIFF_LINES ?? 120),
    protectedPathFragments: (env.PROTECTED_PATHS ?? "auth,billing,privacy,legal,encryption,secrets,infra,migrations,release")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    publicBaseUrl: stripTrailingSlash(env.PUBLIC_BASE_URL ?? `http://localhost:${env.API_PORT ?? 4100}`),
    runnerWorkspace: env.RUNNER_WORKSPACE ?? process.cwd(),
  };
}

function githubModeFromEnv(value: string | undefined): ApiConfig["githubMode"] {
  if (value === "app" || value === "gh") return value;
  return "disabled";
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
