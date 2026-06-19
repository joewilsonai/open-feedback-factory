import { spawn } from "node:child_process";

const defaultPort = process.argv[2] ?? "4173";
const port = process.env.PORT ?? process.env.OFF_PREVIEW_PORT ?? defaultPort;

const child = spawn("vite", ["preview", "--host", "0.0.0.0", "--port", port], {
  shell: process.platform === "win32",
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
