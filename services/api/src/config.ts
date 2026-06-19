export interface ApiConfig {
  apiHost: string;
  apiPort: number;
  autoMergeEnabled: boolean;
  codexRunnerMode: "codex" | "demo";
  controlCenterUrl: string;
  databaseUrl: string;
  githubMode: "app" | "disabled" | "gh";
  githubAppId?: string;
  githubAppInstallationId?: string;
  githubAppPrivateKey?: string;
  githubAppPrivateKeyPath?: string;
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
    controlCenterUrl: stripTrailingSlash(env.CONTROL_CENTER_URL ?? `http://localhost:${env.CONTROL_CENTER_PORT ?? 5173}`),
    databaseUrl: env.DATABASE_URL ?? env.DOCKER_DATABASE_URL ?? "",
    githubMode: githubModeFromEnv(env.GITHUB_MODE),
    githubAppId: env.GITHUB_APP_ID || undefined,
    githubAppInstallationId: env.GITHUB_APP_INSTALLATION_ID || undefined,
    githubAppPrivateKey: env.GITHUB_APP_PRIVATE_KEY || undefined,
    githubAppPrivateKeyPath: env.GITHUB_APP_PRIVATE_KEY_PATH || undefined,
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
