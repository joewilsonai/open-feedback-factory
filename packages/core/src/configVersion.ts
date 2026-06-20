export const CURRENT_CONFIG_SCHEMA_VERSION = 1;

export type ConfigCompatibilityStatus = "compatible" | "incompatible" | "migration_required";

export interface ConfigDeprecatedSetting {
  key: string;
  reason: string;
  replacement: string;
}

export interface ConfigMigrationStep {
  command: string;
  fromVersion: number;
  requiresBackup: boolean;
  summary: string;
  toVersion: number;
}

export interface ConfigCompatibilityReport {
  configuredVersion: number;
  currentVersion: number;
  deprecatedSettings: ConfigDeprecatedSetting[];
  migrationsRequired: ConfigMigrationStep[];
  rollbackGuidance: string[];
  securityInvariant: string;
  status: ConfigCompatibilityStatus;
  summary: string;
}

export interface ConfigCompatibilityInput {
  configuredVersion?: number;
  env?: Record<string, string | undefined>;
}

const deprecatedSchemaAliases: ConfigDeprecatedSetting[] = [
  {
    key: "OFF_CONFIG_VERSION",
    reason: "Use the explicit schema-version key so app version and config schema version cannot be confused.",
    replacement: "OFF_CONFIG_SCHEMA_VERSION",
  },
];

export function buildConfigCompatibilityReport(input: ConfigCompatibilityInput): ConfigCompatibilityReport {
  const configuredVersion = normalizeVersion(input.configuredVersion, CURRENT_CONFIG_SCHEMA_VERSION);
  const deprecatedSettings = deprecatedSchemaAliases.filter((setting) => Boolean(input.env?.[setting.key]));
  const rollbackGuidance = [
    "Back up the database and ignored configuration files before running config migrations.",
    "If a migration fails, restore the backup and restart Open Feedback Factory with real execution disabled.",
  ];
  const securityInvariant =
    "Config migrations must not silently weaken guardrails, broaden agent access, enable real execution, or mark work shipped.";

  if (configuredVersion > CURRENT_CONFIG_SCHEMA_VERSION) {
    return {
      configuredVersion,
      currentVersion: CURRENT_CONFIG_SCHEMA_VERSION,
      deprecatedSettings,
      migrationsRequired: [],
      rollbackGuidance,
      securityInvariant,
      status: "incompatible",
      summary:
        "Configured schema version is newer than this Open Feedback Factory release. Upgrade OFF before running workers or migrations.",
    };
  }

  if (configuredVersion < CURRENT_CONFIG_SCHEMA_VERSION) {
    return {
      configuredVersion,
      currentVersion: CURRENT_CONFIG_SCHEMA_VERSION,
      deprecatedSettings,
      migrationsRequired: buildMigrationSteps(configuredVersion, CURRENT_CONFIG_SCHEMA_VERSION),
      rollbackGuidance,
      securityInvariant,
      status: "migration_required",
      summary: "Configuration is older than this Open Feedback Factory release and needs an operator-run migration.",
    };
  }

  return {
    configuredVersion,
    currentVersion: CURRENT_CONFIG_SCHEMA_VERSION,
    deprecatedSettings,
    migrationsRequired: [],
    rollbackGuidance,
    securityInvariant,
    status: "compatible",
    summary: "Configuration schema is compatible with this Open Feedback Factory release.",
  };
}

function buildMigrationSteps(fromVersion: number, currentVersion: number): ConfigMigrationStep[] {
  const steps: ConfigMigrationStep[] = [];
  for (let version = fromVersion; version < currentVersion; version += 1) {
    steps.push({
      command: `pnpm config:migrate -- --from ${version} --to ${version + 1} --backup-confirmed`,
      fromVersion: version,
      requiresBackup: true,
      summary: `Migrate OFF config schema from v${version} to v${version + 1}.`,
      toVersion: version + 1,
    });
  }
  return steps;
}

function normalizeVersion(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.trunc(value));
}
