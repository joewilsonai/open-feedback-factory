#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultLabel = "com.openfeedbackfactory.host-worker";
const defaultSystemdUnit = "open-feedback-factory-worker.service";

export function buildHostWorkerCommand(input = {}) {
  const root = path.resolve(input.repoRoot ?? repoRoot);
  const apiBaseUrl = input.apiBaseUrl ?? `http://localhost:${input.apiPort ?? 4100}`;
  const pnpm = input.pnpm ?? "pnpm";
  const workerName = input.workerName ?? "host-cli-worker";
  const secretsPath = input.secretsPath ?? path.join(root, ".off", "secrets.env");
  const runnerWorkspace = input.runnerWorkspace ?? root;
  const pathPrefix = input.pathPrefix ?? "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin";

  return [
    `cd ${shellQuote(root)}`,
    "set -a",
    "if [ -f ./.env ]; then . ./.env; fi",
    "set +a",
    `export PATH=${shellQuote(pathPrefix)}:$PATH`,
    "export CODEX_RUNNER_MODE=codex",
    "export WORKER_RUN_ONCE=false",
    `if [ -z "\${WORKER_API_BASE_URL:-}" ] || [ "$WORKER_API_BASE_URL" = "http://api:4100" ]; then export WORKER_API_BASE_URL=${shellQuote(apiBaseUrl)}; fi`,
    `export API_BASE_URL="${envDefault("API_BASE_URL", "$WORKER_API_BASE_URL")}"`,
    `export RUNNER_WORKSPACE="${envDefault("RUNNER_WORKSPACE", runnerWorkspace)}"`,
    `export CODEX_SECRETS_PATH="${envDefault("CODEX_SECRETS_PATH", secretsPath)}"`,
    `export WORKER_NAME="${envDefault("WORKER_NAME", workerName)}"`,
    `exec ${shellQuote(pnpm)} --filter @open-feedback-factory/worker dev`,
  ].join(" && ");
}

export function renderLaunchAgent(input = {}) {
  const root = path.resolve(input.repoRoot ?? repoRoot);
  const label = input.label ?? defaultLabel;
  const logsDir = input.logsDir ?? path.join(root, ".off", "logs");
  const command = buildHostWorkerCommand(input);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>${xmlEscape(command)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(root)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEscape(path.join(logsDir, "host-worker.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(path.join(logsDir, "host-worker.error.log"))}</string>
</dict>
</plist>
`;
}

export function renderSystemdUnit(input = {}) {
  const root = path.resolve(input.repoRoot ?? repoRoot);
  const logsDir = input.logsDir ?? path.join(root, ".off", "logs");
  const command = buildHostWorkerCommand(input);

  return `[Unit]
Description=Open Feedback Factory host Codex worker
After=network-online.target

[Service]
Type=simple
WorkingDirectory=${systemdValue(root)}
ExecStart=/bin/sh -lc ${systemdValue(command)}
Restart=always
RestartSec=5
StandardOutput=append:${systemdValue(path.join(logsDir, "host-worker.log"))}
StandardError=append:${systemdValue(path.join(logsDir, "host-worker.error.log"))}

[Install]
WantedBy=default.target
`;
}

export function buildDockerApiKeyInstructions(input = {}) {
  const apiBaseUrl = input.apiBaseUrl ?? "http://api:4100";
  return [
    "# Save the OpenAI API key from the control center first.",
    "CODEX_RUNNER_MODE=codex",
    "CODEX_AUTH_MODE=api_key",
    "DOCKER_CODEX_CLI=codex",
    "CODEX_CLI_VERSION=0.141.0",
    `WORKER_API_BASE_URL=${apiBaseUrl}`,
    "docker compose up -d --build worker",
  ].join("\n");
}

export function detectService(platform = process.platform) {
  if (platform === "darwin") return "launchagent";
  if (platform === "linux") return "systemd";
  return "print";
}

function printHelp() {
  console.log(`Open Feedback Factory worker installer

Usage:
  node scripts/worker-install.mjs print [--mode host-cli|docker-api-key]
  node scripts/worker-install.mjs install [--service auto|launchagent|systemd]
  node scripts/worker-install.mjs uninstall [--service auto|launchagent|systemd]
  node scripts/worker-install.mjs status [--service auto|launchagent|systemd]

Common package scripts:
  pnpm worker:print:host
  pnpm worker:install:host
  pnpm worker:status:host
  pnpm worker:uninstall:host
  pnpm worker:print:docker-api

The host service sources .env at startup and does not copy secrets into the
service file. It is for Codex CLI/subscription workers on the local machine.
The Docker API-key lane uses the compose worker after a key is saved in the
control center.`);
}

function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    printHelp();
    return 0;
  }

  const action = parsed._[0] ?? "print";
  const mode = parsed.mode ?? "host-cli";
  const service = parsed.service === "auto" || !parsed.service ? detectService() : parsed.service;
  const root = path.resolve(parsed["repo-root"] ?? repoRoot);
  const input = {
    apiBaseUrl: parsed["api-base-url"],
    label: parsed.label ?? defaultLabel,
    pnpm: parsed.pnpm ?? "pnpm",
    repoRoot: root,
    workerName: parsed["worker-name"],
  };

  if (mode === "docker-api-key") {
    if (action !== "print") {
      throw new Error("Docker API-key mode is configured through docker compose; use print for the command snippet.");
    }
    console.log(buildDockerApiKeyInstructions({ apiBaseUrl: parsed["api-base-url"] }));
    return 0;
  }

  if (!["host-cli", undefined].includes(mode)) {
    throw new Error(`Unknown mode: ${mode}`);
  }

  if (action === "print") {
    console.log(renderService(service, input));
    return 0;
  }
  if (action === "install") return installService(service, input);
  if (action === "uninstall") return uninstallService(service, input);
  if (action === "status") return statusService(service, input);

  throw new Error(`Unknown action: ${action}`);
}

function renderService(service, input) {
  if (service === "launchagent") return renderLaunchAgent(input);
  if (service === "systemd") return renderSystemdUnit(input);
  return buildHostWorkerCommand(input);
}

function installService(service, input) {
  if (service === "launchagent") {
    const paths = launchAgentPaths(input);
    mkdirSync(path.dirname(paths.plist), { recursive: true });
    mkdirSync(paths.logsDir, { recursive: true });
    writeFileSync(paths.plist, renderLaunchAgent({ ...input, logsDir: paths.logsDir }), "utf8");
    run("launchctl", ["bootout", `gui/${process.getuid()}`, paths.plist], { allowFailure: true });
    run("launchctl", ["bootstrap", `gui/${process.getuid()}`, paths.plist]);
    run("launchctl", ["kickstart", "-k", `gui/${process.getuid()}/${input.label ?? defaultLabel}`]);
    console.log(`Installed ${paths.plist}`);
    return 0;
  }
  if (service === "systemd") {
    const paths = systemdPaths(input);
    mkdirSync(path.dirname(paths.unitPath), { recursive: true });
    mkdirSync(paths.logsDir, { recursive: true });
    writeFileSync(paths.unitPath, renderSystemdUnit({ ...input, logsDir: paths.logsDir }), "utf8");
    run("systemctl", ["--user", "daemon-reload"]);
    run("systemctl", ["--user", "enable", "--now", paths.unitName]);
    console.log(`Installed ${paths.unitPath}`);
    return 0;
  }
  throw new Error("This platform has no host service installer. Use print and run the command manually.");
}

function uninstallService(service, input) {
  if (service === "launchagent") {
    const paths = launchAgentPaths(input);
    run("launchctl", ["bootout", `gui/${process.getuid()}`, paths.plist], { allowFailure: true });
    rmSync(paths.plist, { force: true });
    console.log(`Removed ${paths.plist}`);
    return 0;
  }
  if (service === "systemd") {
    const paths = systemdPaths(input);
    run("systemctl", ["--user", "disable", "--now", paths.unitName], { allowFailure: true });
    rmSync(paths.unitPath, { force: true });
    run("systemctl", ["--user", "daemon-reload"], { allowFailure: true });
    console.log(`Removed ${paths.unitPath}`);
    return 0;
  }
  throw new Error("This platform has no host service installer to remove.");
}

function statusService(service, input) {
  if (service === "launchagent") {
    return run("launchctl", ["print", `gui/${process.getuid()}/${input.label ?? defaultLabel}`], { allowFailure: true });
  }
  if (service === "systemd") {
    return run("systemctl", ["--user", "status", "--no-pager", systemdPaths(input).unitName], { allowFailure: true });
  }
  console.log("No managed host service for this platform.");
  return 0;
}

function launchAgentPaths(input) {
  const root = path.resolve(input.repoRoot ?? repoRoot);
  return {
    logsDir: path.join(root, ".off", "logs"),
    plist: path.join(os.homedir(), "Library", "LaunchAgents", `${input.label ?? defaultLabel}.plist`),
  };
}

function systemdPaths(input) {
  const root = path.resolve(input.repoRoot ?? repoRoot);
  return {
    logsDir: path.join(root, ".off", "logs"),
    unitName: input.unitName ?? defaultSystemdUnit,
    unitPath: path.join(os.homedir(), ".config", "systemd", "user", input.unitName ?? defaultSystemdUnit),
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
  return result.status ?? 1;
}

function parseArgs(argv) {
  const output = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      output.help = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      output._.push(arg);
      continue;
    }
    const keyValue = arg.slice(2);
    const [key, inlineValue] = keyValue.split("=", 2);
    if (inlineValue !== undefined) {
      output[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      output[key] = "true";
      continue;
    }
    output[key] = next;
    index += 1;
  }
  return output;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function systemdValue(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function envDefault(key, value) {
  return `\${${key}:-${value}}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
