import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDockerApiKeyInstructions,
  buildHostWorkerCommand,
  detectService,
  renderLaunchAgent,
  renderSystemdUnit,
} from "./worker-install.mjs";
import { allowedHosts } from "./vite-dev-config.mjs";

test("host worker command sources env and applies worker defaults", () => {
  const command = buildHostWorkerCommand({
    apiBaseUrl: "http://localhost:4100",
    pnpm: "/usr/local/bin/pnpm",
    repoRoot: "/tmp/open-feedback-factory",
    workerName: "host-test",
  });

  assert.match(command, /if \[ -f \.\/\.env \]; then \. \.\/\.env; fi/);
  assert.match(command, /export CODEX_RUNNER_MODE=codex/);
  assert.match(command, /export WORKER_RUN_ONCE=false/);
  assert.match(command, /\[ -z "\$\{WORKER_API_BASE_URL:-\}" \]/);
  assert.match(command, /\[ "\$WORKER_API_BASE_URL" = "http:\/\/api:4100" \]/);
  assert.match(command, /export WORKER_API_BASE_URL='http:\/\/localhost:4100'/);
  assert.match(command, /RUNNER_WORKSPACE:-\/tmp\/open-feedback-factory/);
  assert.match(command, /CODEX_SECRETS_PATH:-\/tmp\/open-feedback-factory\/\.off\/secrets\.env/);
  assert.match(command, /exec '\/usr\/local\/bin\/pnpm' --filter @open-feedback-factory\/worker dev/);
  assert.doesNotMatch(command, /OPENAI_API_KEY=|GITHUB_APP_PRIVATE_KEY=/);
});

test("macOS LaunchAgent render keeps secrets out of the service file", () => {
  const plist = renderLaunchAgent({
    apiBaseUrl: "http://localhost:4100",
    repoRoot: "/tmp/open-feedback-factory",
    workerName: "host-test",
  });

  assert.match(plist, /com\.openfeedbackfactory\.host-worker/);
  assert.match(plist, /\/bin\/zsh/);
  assert.match(plist, /CODEX_RUNNER_MODE=codex/);
  assert.match(plist, /host-worker\.log/);
  assert.doesNotMatch(plist, /OPENAI_API_KEY=|GITHUB_APP_PRIVATE_KEY=/);
});

test("Linux systemd render keeps secrets out of the service file", () => {
  const unit = renderSystemdUnit({
    apiBaseUrl: "http://localhost:4100",
    repoRoot: "/tmp/open-feedback-factory",
    workerName: "host-test",
  });

  assert.match(unit, /Description=Open Feedback Factory host Codex worker/);
  assert.match(unit, /ExecStart=\/bin\/sh -lc/);
  assert.match(unit, /CODEX_RUNNER_MODE=codex/);
  assert.match(unit, /Restart=always/);
  assert.doesNotMatch(unit, /OPENAI_API_KEY=|GITHUB_APP_PRIVATE_KEY=/);
});

test("Docker API-key mode prints a compose lane instead of a host service", () => {
  const instructions = buildDockerApiKeyInstructions({ apiBaseUrl: "http://api:4100" });

  assert.match(instructions, /CODEX_AUTH_MODE=api_key/);
  assert.match(instructions, /CODEX_RUNNER_MODE=codex/);
  assert.match(instructions, /DOCKER_CODEX_CLI=codex/);
  assert.match(instructions, /CODEX_CLI_VERSION=0\.141\.0/);
  assert.match(instructions, /docker compose up -d --build worker/);
});

test("service detection maps the supported host platforms", () => {
  assert.equal(detectService("darwin"), "launchagent");
  assert.equal(detectService("linux"), "systemd");
  assert.equal(detectService("win32"), "print");
});

test("Vite dev hosts allow local and Tailscale dogfood URLs", () => {
  const hosts = allowedHosts();

  assert.equal(hosts.includes("localhost"), true);
  assert.equal(hosts.includes("127.0.0.1"), true);
  assert.equal(hosts.includes(".ts.net"), true);
});
