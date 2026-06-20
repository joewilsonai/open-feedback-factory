export interface ApiConfig {
  adminToken?: string;
  apiHost: string;
  apiPort: number;
  approvalMode: "auto" | "manual";
  autoMergeEnabled: boolean;
  codexAuthMode: "api_key" | "cli";
  codexApiKeyConfigured: boolean;
  codexRunnerMode: "codex" | "disabled";
  codexSecretsPath: string;
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
  maxDailyCostUsd: number;
  maxFeatureCostUsd: number;
  maxMonthlyCostUsd: number;
  maxSafeDiffLines: number;
  maxTokensPerRun: number;
  protectedPathFragments: string[];
  publicBaseUrl: string;
  adminRateLimitMax?: number;
  githubRateLimitMax?: number;
  rateLimitWindowMs?: number;
  runnerRateLimitMax?: number;
  runnerToken?: string;
  runnerWorkspace: string;
  sdkRateLimitMax?: number;
  sdkPackagePublished: boolean;
}

export function readConfig(env = process.env): ApiConfig {
  const apiPort = env.PORT ?? env.API_PORT ?? "4100";
  const runningOnRailway = Boolean(env.RAILWAY_ENVIRONMENT || env.RAILWAY_SERVICE_NAME);
  const railwayPublicUrl = env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : undefined;

  return {
    adminToken: env.ADMIN_TOKEN || undefined,
    apiHost: env.API_HOST ?? (runningOnRailway ? "0.0.0.0" : "127.0.0.1"),
    apiPort: Number(apiPort),
    approvalMode: env.APPROVAL_MODE === "auto" ? "auto" : "manual",
    autoMergeEnabled: env.AUTO_MERGE_ENABLED === "true",
    codexAuthMode: env.CODEX_AUTH_MODE === "api_key" ? "api_key" : "cli",
    codexApiKeyConfigured: Boolean(env.OPENAI_API_KEY),
    codexRunnerMode: env.CODEX_RUNNER_MODE === "codex" ? "codex" : "disabled",
    codexSecretsPath: env.CODEX_SECRETS_PATH ?? ".off/secrets.env",
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
    maxDailyCostUsd: Number(env.MAX_DAILY_COST_USD ?? 25),
    maxFeatureCostUsd: Number(env.MAX_FEATURE_COST_USD ?? 5),
    maxMonthlyCostUsd: Number(env.MAX_MONTHLY_COST_USD ?? 100),
    maxSafeDiffLines: Number(env.MAX_SAFE_DIFF_LINES ?? 120),
    maxTokensPerRun: Number(env.MAX_TOKENS_PER_RUN ?? 250_000),
    protectedPathFragments: (env.PROTECTED_PATHS ?? "auth,billing,privacy,legal,encryption,secrets,infra,migrations,release")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    publicBaseUrl: stripTrailingSlash(env.PUBLIC_BASE_URL ?? railwayPublicUrl ?? `http://localhost:${apiPort}`),
    adminRateLimitMax: Number(env.ADMIN_RATE_LIMIT_MAX ?? 120),
    githubRateLimitMax: Number(env.GITHUB_RATE_LIMIT_MAX ?? 300),
    rateLimitWindowMs: Number(env.RATE_LIMIT_WINDOW_MS ?? 60_000),
    runnerRateLimitMax: Number(env.RUNNER_RATE_LIMIT_MAX ?? 300),
    runnerToken: env.RUNNER_TOKEN || undefined,
    runnerWorkspace: env.RUNNER_WORKSPACE ?? process.cwd(),
    sdkRateLimitMax: Number(env.SDK_RATE_LIMIT_MAX ?? 120),
    sdkPackagePublished: env.SDK_PACKAGE_PUBLISHED === "true",
  };
}

function githubModeFromEnv(value: string | undefined): ApiConfig["githubMode"] {
  if (value === "app" || value === "gh") return value;
  return "disabled";
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
