import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const env = {
  ...loadEnv(resolve(repoRoot, ".env.example"), existsSync(resolve(repoRoot, ".env")) ? resolve(repoRoot, ".env") : null),
  ...process.env,
};

export function allowedHosts() {
  const hosts = new Set(["localhost", "127.0.0.1"]);
  for (const host of splitHosts(env.VITE_ALLOWED_HOSTS)) {
    hosts.add(host);
  }
  for (const value of [env.PUBLIC_BASE_URL, env.CONTROL_CENTER_URL, env.VITE_API_BASE_URL]) {
    const host = hostnameFromUrl(value);
    if (host) hosts.add(host);
  }
  return [...hosts, ".ts.net"];
}

export function envValue(key, fallback) {
  const value = env[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function splitHosts(value) {
  return (value ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
}

function hostnameFromUrl(value) {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function loadEnv(...paths) {
  const output = {};
  for (const path of paths.filter(Boolean)) {
    const text = readFileSync(path, "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const [key, ...rest] = line.split("=");
      output[key.trim()] = rest.join("=").trim();
    }
  }
  return output;
}
