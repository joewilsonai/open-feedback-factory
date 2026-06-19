import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const env = {
  ...loadEnv(resolve(root, ".env.example")),
  ...(existsSync(resolve(root, ".env")) ? loadEnv(resolve(root, ".env")) : {}),
  ...process.env,
};

const apiPort = Number(env.API_PORT || 4100);
const demoPort = Number(env.DEMO_APP_PORT || 5174);
const apiTarget = `http://127.0.0.1:${apiPort}`;
const demoTarget = `http://127.0.0.1:${demoPort}`;
const routes = [
  ["/", demoTarget],
  ["/sdk", apiTarget],
  ["/admin", apiTarget],
  ["/runner", apiTarget],
  ["/doctor", apiTarget],
  ["/health", apiTarget],
  ["/github", apiTarget],
];

for (const [path, target] of routes) {
  run("tailscale", ["funnel", "--bg", "--yes", `--set-path=${path}`, target]);
}

run("tailscale", ["funnel", "status"]);
console.log("\nSet PUBLIC_BASE_URL in .env to the Funnel HTTPS URL above, then run docker compose up -d --build.");

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: "pipe" });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status ?? "unknown"}`);
  }
}

function loadEnv(path) {
  const output = {};
  if (!existsSync(path)) return output;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    output[key] = value;
  }
  return output;
}
