import { spawn } from "node:child_process";

const service = process.env.OFF_SERVICE ?? "api";
const commands = {
  api: ["pnpm", ["railway:start:api"]],
  "control-center": ["pnpm", ["railway:start:control-center"]],
  "demo-app": ["pnpm", ["railway:start:demo-app"]],
  worker: ["pnpm", ["railway:start:worker"]],
};

const command = commands[service];

if (!command) {
  console.error(`Unknown OFF_SERVICE "${service}". Expected one of: ${Object.keys(commands).join(", ")}`);
  process.exit(1);
}

const [bin, args] = command;
const child = spawn(bin, args, {
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
