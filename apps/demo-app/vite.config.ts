import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { allowedHosts, apiProxyTarget } from "../../scripts/vite-dev-config.mjs";

const apiTarget = apiProxyTarget();
const apiProxyPaths = ["/admin", "/doctor", "/github", "/health", "/runner", "/sdk"];

export default defineConfig({
  css: {
    postcss: {
      plugins: [],
    },
  },
  plugins: [react()],
  preview: {
    allowedHosts: allowedHosts(),
    host: "0.0.0.0",
  },
  server: {
    allowedHosts: allowedHosts(),
    host: "127.0.0.1",
    port: 5174,
    proxy: Object.fromEntries(apiProxyPaths.map((path) => [path, apiTarget])),
  },
});
