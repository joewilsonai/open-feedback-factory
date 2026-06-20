import assert from "node:assert/strict";
import test from "node:test";
import { buildConfigCompatibilityReport, CURRENT_CONFIG_SCHEMA_VERSION } from "./configVersion.js";

test("config compatibility defaults missing schema version to the current safe version", () => {
  const report = buildConfigCompatibilityReport({});

  assert.equal(report.currentVersion, CURRENT_CONFIG_SCHEMA_VERSION);
  assert.equal(report.configuredVersion, CURRENT_CONFIG_SCHEMA_VERSION);
  assert.equal(report.status, "compatible");
  assert.equal(report.migrationsRequired.length, 0);
  assert.equal(report.rollbackGuidance.length > 0, true);
  assert.match(report.securityInvariant, /must not/i);
});

test("config compatibility requires migration for older versions and blocks unknown future versions", () => {
  const oldReport = buildConfigCompatibilityReport({ configuredVersion: CURRENT_CONFIG_SCHEMA_VERSION - 1 });
  const futureReport = buildConfigCompatibilityReport({ configuredVersion: CURRENT_CONFIG_SCHEMA_VERSION + 1 });

  assert.equal(oldReport.status, "migration_required");
  assert.equal(oldReport.migrationsRequired.length, 1);
  assert.equal(oldReport.migrationsRequired[0]?.requiresBackup, true);
  assert.match(oldReport.migrationsRequired[0]?.command ?? "", /config:migrate/);

  assert.equal(futureReport.status, "incompatible");
  assert.equal(futureReport.migrationsRequired.length, 0);
  assert.match(futureReport.summary, /newer/i);
});

test("config compatibility reports deprecated schema-version aliases as warnings", () => {
  const report = buildConfigCompatibilityReport({
    configuredVersion: CURRENT_CONFIG_SCHEMA_VERSION,
    env: {
      OFF_CONFIG_VERSION: "1",
      OFF_CONFIG_SCHEMA_VERSION: "1",
    },
  });

  assert.equal(report.status, "compatible");
  assert.deepEqual(
    report.deprecatedSettings.map((setting) => setting.key),
    ["OFF_CONFIG_VERSION"],
  );
  assert.equal(report.deprecatedSettings[0]?.replacement, "OFF_CONFIG_SCHEMA_VERSION");
});
