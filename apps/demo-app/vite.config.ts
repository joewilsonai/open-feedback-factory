import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiProxyTarget = process.env.VITE_DEV_API_PROXY_TARGET ?? "http://127.0.0.1:4100";
const apiProxyPaths = ["/admin", "/doctor", "/github", "/health", "/runner", "/sdk"];

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: allowedHosts(),
    host: "127.0.0.1",
    port: 5174,
    proxy: Object.fromEntries(apiProxyPaths.map((path) => [path, apiProxyTarget])),
  },
});

function allowedHosts(): string[] {
  const hosts = new Set(["localhost", "127.0.0.1"]);
  for (const host of splitHosts(process.env.VITE_ALLOWED_HOSTS)) {
    hosts.add(host);
  }
  const publicHost = hostnameFromUrl(process.env.PUBLIC_BASE_URL);
  if (publicHost) hosts.add(publicHost);
  return [...hosts];
}

function splitHosts(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
}

function hostnameFromUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}
