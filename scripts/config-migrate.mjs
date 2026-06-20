#!/usr/bin/env node

const currentVersion = 1;
const args = new Map();

for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (!arg.startsWith("--")) continue;
  const key = arg.slice(2);
  const next = process.argv[index + 1];
  if (next && !next.startsWith("--")) {
    args.set(key, next);
    index += 1;
  } else {
    args.set(key, "true");
  }
}

const fromVersion = numberArg("from", Number(process.env.OFF_CONFIG_SCHEMA_VERSION ?? process.env.OFF_CONFIG_VERSION ?? currentVersion));
const toVersion = numberArg("to", currentVersion);
const backupConfirmed = args.get("backup-confirmed") === "true";

if (!backupConfirmed) {
  console.error(
    "Refusing to migrate config without --backup-confirmed. Back up the database and ignored config files first.",
  );
  process.exit(1);
}

if (toVersion > currentVersion) {
  console.error(`Cannot migrate to config schema v${toVersion}; this release only knows v${currentVersion}.`);
  process.exit(1);
}

if (fromVersion > currentVersion) {
  console.error(`Config schema v${fromVersion} is newer than this release. Upgrade Open Feedback Factory first.`);
  process.exit(1);
}

if (fromVersion >= toVersion) {
  console.log(`No config migration required. Current schema target is v${currentVersion}.`);
  process.exit(0);
}

console.log(`Config migration v${fromVersion} -> v${toVersion} is operator-applied in V1.`);
console.log(`Set OFF_CONFIG_SCHEMA_VERSION=${toVersion} after validating your ignored .env and deployment variables.`);
console.log("This command does not enable workers, auto-merge, GitHub mutation, or release marking.");

function numberArg(name, fallback) {
  const value = Number(args.get(name) ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.trunc(value));
}
