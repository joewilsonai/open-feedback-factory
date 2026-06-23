import {
  buildConfigCompatibilityReport,
  normalizeWorkCadencePolicy,
  type ConfigCompatibilityReport,
  type WorkCadenceInterval,
  type WorkCadenceMode,
  type WorkCadencePolicy,
} from "@open-feedback-factory/core";

export type AdminRole = "admin" | "operator" | "owner" | "viewer";

export interface AdminRoleToken {
  role: AdminRole;
  token: string;
}

export interface ApiConfig {
  adminRoleTokens: AdminRoleToken[];
  adminToken?: string;
  apiHost: string;
  apiPort: number;
  approvalMode: "auto" | "manual";
  autoMergeEnabled: boolean;
  codexAuthMode: "api_key" | "cli";
  codexApiKeyConfigured: boolean;
  codexRunnerMode: "codex" | "disabled";
  codexSecretsPath: string;
  configCompatibility: ConfigCompatibilityReport;
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
  mergeMode: "agent_reviewed_auto_merge" | "human_exception_required" | "implement_only";
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
  workCadence: WorkCadencePolicy;
  secretsVaultKey?: string;
  semanticClustering: SemanticClusteringConfig;
}

export interface SemanticClusteringConfig {
  /** True only when enabled by env AND an Anthropic API key is present. */
  enabled: boolean;
  apiKey?: string;
  model: string;
  timeoutMs: number;
}

export function readConfig(env = process.env): ApiConfig {
  const apiPort = env.PORT ?? env.API_PORT ?? "4100";
  const runningOnRailway = Boolean(env.RAILWAY_ENVIRONMENT || env.RAILWAY_SERVICE_NAME);
  const railwayPublicUrl = env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : undefined;

  return {
    adminRoleTokens: parseAdminRoleTokens(env.ADMIN_ROLE_TOKENS),
    adminToken: env.ADMIN_TOKEN || undefined,
    apiHost: env.API_HOST ?? (runningOnRailway ? "0.0.0.0" : "127.0.0.1"),
    apiPort: Number(apiPort),
    approvalMode: env.APPROVAL_MODE === "auto" ? "auto" : "manual",
    autoMergeEnabled: env.AUTO_MERGE_ENABLED === "true",
    codexAuthMode: env.CODEX_AUTH_MODE === "api_key" ? "api_key" : "cli",
    codexApiKeyConfigured: Boolean(env.OPENAI_API_KEY),
    codexRunnerMode: env.CODEX_RUNNER_MODE === "codex" ? "codex" : "disabled",
    codexSecretsPath: env.CODEX_SECRETS_PATH ?? ".off/secrets.env",
    configCompatibility: buildConfigCompatibilityReport({
      configuredVersion: configSchemaVersionFromEnv(env),
      env,
    }),
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
    mergeMode: mergeModeFromEnv(env.MERGE_MODE),
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
    secretsVaultKey: env.SECRETS_VAULT_KEY || env.OFF_SECRETS_VAULT_KEY || undefined,
    semanticClustering: semanticClusteringFromEnv(env),
    workCadence: normalizeWorkCadencePolicy({
      hourUtc: numberFromEnv(env.WORK_CADENCE_HOUR_UTC),
      interval: workCadenceIntervalFromEnv(env.WORK_CADENCE_INTERVAL),
      mode: workCadenceModeFromEnv(env.WORK_CADENCE_MODE),
      scheduledDayOfMonth: numberFromEnv(env.WORK_CADENCE_DAY_OF_MONTH),
      scheduledDayOfWeek: numberFromEnv(env.WORK_CADENCE_DAY_OF_WEEK),
      threshold: numberFromEnv(env.WORK_CADENCE_THRESHOLD),
    }),
  };
}

function configSchemaVersionFromEnv(env: NodeJS.ProcessEnv): number | undefined {
  const raw = env.OFF_CONFIG_SCHEMA_VERSION ?? env.OFF_CONFIG_VERSION;
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// Default model pinned per ~/.claude/REFERENCES.md. Sonnet 4.6 is used over Haiku
// for sharper, more consistent intent reuse (it judges each new signal against the
// existing intents). SEMANTIC_CLUSTERING=off hard-disables; "auto"/"on" enable when
// an Anthropic key is present, so the feature degrades to deterministic clustering
// with zero config when no key is set.
const DEFAULT_SEMANTIC_CLUSTER_MODEL = "claude-sonnet-4-6";

function semanticClusteringFromEnv(env: NodeJS.ProcessEnv): SemanticClusteringConfig {
  const apiKey = env.ANTHROPIC_API_KEY || undefined;
  const mode = (env.SEMANTIC_CLUSTERING ?? "auto").trim().toLowerCase();
  // Fail closed: only an explicit "auto"/"on" enables the external model call.
  // Anything else — "off", "false", "0", "disabled", a typo, or empty — keeps
  // clustering on the deterministic path. A privacy-affecting call should never
  // turn on by accident.
  const modeEnables = mode === "auto" || mode === "on";
  // 12s default: Sonnet's p50 is ~1.4s but its tail reaches ~6s+, and a 4s cap
  // silently dropped ~half of prod calls to the deterministic fallback. Most
  // feedback still resolves fast; only the slow tail waits longer (and only on
  // the generic-fallback path). Moving the call off the hot path is the v3 fix.
  const timeout = Number(env.SEMANTIC_CLUSTER_TIMEOUT_MS ?? 12000);
  return {
    enabled: modeEnables && Boolean(apiKey),
    apiKey,
    model: env.SEMANTIC_CLUSTER_MODEL || DEFAULT_SEMANTIC_CLUSTER_MODEL,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 12000,
  };
}

function githubModeFromEnv(value: string | undefined): ApiConfig["githubMode"] {
  if (value === "app" || value === "gh") return value;
  return "disabled";
}

function mergeModeFromEnv(value: string | undefined): ApiConfig["mergeMode"] {
  if (value === "agent_reviewed_auto_merge" || value === "human_exception_required") return value;
  return "implement_only";
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function workCadenceModeFromEnv(value: string | undefined): WorkCadenceMode | undefined {
  if (value === "immediate" || value === "scheduled" || value === "threshold") return value;
  return undefined;
}

function workCadenceIntervalFromEnv(value: string | undefined): WorkCadenceInterval | undefined {
  if (value === "daily" || value === "monthly" || value === "weekly") return value;
  return undefined;
}

function numberFromEnv(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseAdminRoleTokens(value: string | undefined): AdminRoleToken[] {
  if (!value) return [];
  const tokens: AdminRoleToken[] = [];
  for (const entry of value.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const separator = trimmed.includes("=") ? "=" : ":";
    const [rawRole, ...rawTokenParts] = trimmed.split(separator);
    const role = adminRoleFromValue(rawRole?.trim());
    const token = rawTokenParts.join(separator).trim();
    if (role && token.length >= 8) tokens.push({ role, token });
  }
  return tokens;
}

function adminRoleFromValue(value: string | undefined): AdminRole | null {
  if (value === "admin" || value === "operator" || value === "owner" || value === "viewer") return value;
  return null;
}
