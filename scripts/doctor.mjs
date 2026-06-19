import { createServer } from "node:net";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const env = {
  ...loadEnv(resolve(root, ".env.example"), existsSync(resolve(root, ".env")) ? resolve(root, ".env") : null),
  ...process.env,
};

const checks = [];

checks.push(commandCheck("node", ["--version"], "Node.js"));
checks.push(commandCheck("pnpm", ["--version"], "pnpm"));
checks.push(commandCheck("docker", ["--version"], "Docker"));
checks.push(commandCheck("codex", ["--version"], "Codex CLI", { required: env.CODEX_RUNNER_MODE === "codex" }));
checks.push(
  commandCheck("gh", ["auth", "status"], "GitHub CLI auth", {
    required: env.GITHUB_MODE === "gh" || env.GITHUB_CREATE_PR === "true",
  }),
);

checks.push(await portCheck(Number(env.API_PORT ?? 4100), "API port"));
checks.push(await portCheck(Number(env.CONTROL_CENTER_PORT ?? 5173), "Control center port"));
checks.push(await portCheck(Number(env.DEMO_APP_PORT ?? 5174), "Demo app port"));
checks.push(await portCheck(Number(env.POSTGRES_PORT ?? 55432), "Postgres port"));

checks.push({
  label: "Database URL",
  ok: Boolean(env.DATABASE_URL),
  detail: env.DATABASE_URL ? "configured" : "missing DATABASE_URL",
});

checks.push({
  label: "Safe auto-merge default",
  ok: env.AUTO_MERGE_ENABLED !== "true",
  detail: env.AUTO_MERGE_ENABLED === "true" ? "enabled" : "disabled",
});

checks.push({
  label: "Approval mode",
  ok: ["auto", "manual"].includes(env.APPROVAL_MODE ?? "manual"),
  detail: env.APPROVAL_MODE ?? "manual",
});

checks.push({
  label: "Runner mode",
  ok: ["codex", "disabled"].includes(env.CODEX_RUNNER_MODE ?? "disabled"),
  detail: env.CODEX_RUNNER_MODE ?? "disabled",
});

checks.push({
  label: "Codex credential mode",
  ok: ["api_key", "cli"].includes(env.CODEX_AUTH_MODE ?? "cli"),
  detail: env.CODEX_AUTH_MODE ?? "cli",
});

checks.push({
  label: "OpenAI API key",
  ok: env.CODEX_AUTH_MODE !== "api_key" || Boolean(env.OPENAI_API_KEY),
  detail: env.CODEX_AUTH_MODE === "api_key" ? (env.OPENAI_API_KEY ? "configured" : "missing") : "not required",
});

checks.push({
  label: "Worker poll interval",
  ok: Number(env.WORKER_POLL_INTERVAL_MS ?? 5000) > 0,
  detail: `${env.WORKER_POLL_INTERVAL_MS ?? 5000}ms`,
});

checks.push({
  label: "GitHub mode",
  ok: ["app", "disabled", "gh"].includes(env.GITHUB_MODE ?? "disabled"),
  detail: env.GITHUB_MODE ?? "disabled",
});

checks.push({
  label: "GitHub App credentials",
  ok: env.GITHUB_MODE !== "app" || githubAppConfigured(env),
  detail:
    env.GITHUB_MODE === "app"
      ? githubAppConfigured(env)
        ? "configured"
        : "missing GITHUB_APP_ID and private key"
      : "not required",
});

checks.push({
  label: "Codex managed git",
  ok: env.CODEX_MANAGE_GIT !== "true" || env.CODEX_RUNNER_MODE === "codex",
  detail: env.CODEX_MANAGE_GIT === "true" ? "enabled" : "disabled",
});

checks.push({
  label: "GitHub PR creation",
  ok:
    env.GITHUB_CREATE_PR !== "true" ||
    ((env.GITHUB_MODE === "gh" || (env.GITHUB_MODE === "app" && githubAppConfigured(env))) &&
      env.CODEX_MANAGE_GIT === "true"),
  detail: env.GITHUB_CREATE_PR === "true" ? "enabled" : "disabled",
});

checks.push({
  label: "Worker installers",
  ok: existsSync(resolve(root, "scripts/worker-install.mjs")),
  detail: "host CLI service and Docker API-key helper commands available",
});

if (env.CODEX_RUNNER_MODE === "codex" && env.CODEX_AUTH_MODE !== "api_key") {
  checks.push(hostWorkerServiceStatus());
}

checks.push(await optionalHttpCheck(`http://localhost:${env.API_PORT ?? 4100}/doctor`, "API /doctor"));

for (const check of checks) {
  const mark = check.ok ? "✓" : "✗";
  console.log(`${mark} ${check.label}: ${check.detail}`);
}

const failed = checks.filter((check) => !check.ok);
if (failed.length > 0) {
  process.exitCode = 1;
}

function commandCheck(command, args, label, options = { required: true }) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 10000,
  });
  const commandError =
    result.error?.code === "ETIMEDOUT" ? `${command} timed out` : result.error?.message;
  const output = firstLine(result.stdout || result.stderr || commandError || "");
  const detail = output || (options.required ? "missing" : "not configured");
  return {
    detail: result.status === 0 ? detail : options.required ? detail : `optional; ${detail}`,
    label,
    ok: result.status === 0 || !options.required,
  };
}

function firstLine(value) {
  return value.trim().split("\n")[0] || "";
}

function githubAppConfigured(env) {
  const privateKeyPath = env.GITHUB_APP_PRIVATE_KEY_PATH ? resolve(root, env.GITHUB_APP_PRIVATE_KEY_PATH) : "";
  return Boolean(
    env.GITHUB_APP_ID &&
      (env.GITHUB_APP_PRIVATE_KEY || (privateKeyPath && existsSync(privateKeyPath))),
  );
}

function hostWorkerServiceStatus() {
  if (process.platform === "darwin") {
    const result = spawnSync("launchctl", ["print", `gui/${process.getuid()}/com.openfeedbackfactory.host-worker`], {
      cwd: root,
      encoding: "utf8",
      timeout: 10000,
    });
    return {
      detail:
        result.status === 0
          ? "LaunchAgent running"
          : "not installed; run pnpm worker:install:host or start the worker manually",
      label: "Host worker service",
      ok: true,
    };
  }
  if (process.platform === "linux") {
    const result = spawnSync("systemctl", ["--user", "is-active", "open-feedback-factory-worker.service"], {
      cwd: root,
      encoding: "utf8",
      timeout: 10000,
    });
    return {
      detail:
        result.status === 0
          ? "systemd user service active"
          : "not installed; run pnpm worker:install:host or start the worker manually",
      label: "Host worker service",
      ok: true,
    };
  }
  return {
    detail: "manual worker command required on this platform",
    label: "Host worker service",
    ok: true,
  };
}

async function portCheck(port, label) {
  return new Promise((resolveCheck) => {
    const server = createServer();
    server.once("error", () => {
      resolveCheck({
        detail: `${port} is already in use; this is expected when the stack is running`,
        label,
        ok: true,
      });
    });
    server.once("listening", () => {
      server.close(() => {
        resolveCheck({
          detail: `${port} is available`,
          label,
          ok: true,
        });
      });
    });
    server.listen(port, "127.0.0.1");
  });
}

async function optionalHttpCheck(url, label) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { detail: `${response.status} from ${url}`, label, ok: false };
    }
    const body = await response.json();
    return { detail: `${body.api ?? "ok"} (${body.codexRunnerMode ?? "unknown"} mode)`, label, ok: true };
  } catch {
    return { detail: "not running; start Docker or pnpm dev to verify runtime", label, ok: true };
  }
}

function loadEnv(...paths) {
  const output = {};
  for (const path of paths.filter(Boolean)) {
    const text = readFileSync(path, "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const [key, ...rest] = line.split("=");
      output[key] = rest.join("=");
    }
  }
  return output;
}
