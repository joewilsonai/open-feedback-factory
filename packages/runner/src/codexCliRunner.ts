import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { WorkItemRow } from "@open-feedback-factory/db";
import type { RunnerResult, WorkRunner } from "./types.js";

export interface CodexCliRunnerOptions {
  cli?: string;
  cwd: string;
  effort?: string;
  model?: string;
  timeoutMs?: number;
}

export class CodexCliRunner implements WorkRunner {
  constructor(private readonly options: CodexCliRunnerOptions) {}

  async run(workItem: WorkItemRow): Promise<RunnerResult> {
    const schemaPath = await writeOutputSchema();
    const args = buildCodexExecArgs({
      cwd: this.options.cwd,
      effort: this.options.effort ?? "extra-high",
      model: this.options.model ?? workItem.costEstimate.model,
      schemaPath,
    });

    const prompt = buildCodexPrompt(workItem);
    const output = await runProcess(this.options.cli ?? "codex", args, prompt, this.options.timeoutMs ?? 20 * 60_000);

    return {
      branchName: `off/codex/${workItem.id}`,
      changedFiles: [],
      costActual: {
        amountUsd: workItem.costEstimate.amountUsd,
        confidence: "low",
        model: this.options.model ?? workItem.costEstimate.model,
      },
      output,
      status: "succeeded",
      summary: `Codex CLI completed work item ${workItem.id}.`,
    };
  }
}

export function buildCodexExecArgs(input: {
  cwd: string;
  effort: string;
  model: string;
  schemaPath: string;
}): string[] {
  return [
    "exec",
    "--json",
    "--model",
    input.model,
    "-c",
    `model_reasoning_effort="${input.effort}"`,
    "--sandbox",
    "workspace-write",
    "--cd",
    input.cwd,
    "--output-schema",
    input.schemaPath,
    "-",
  ];
}

export function buildCodexPrompt(workItem: WorkItemRow): string {
  return [
    "You are implementing an Open Feedback Factory safe-lane work item.",
    "Use only the sanitized work item summary below.",
    "Do not inspect or request raw private feedback.",
    "Open a PR-sized change and run the relevant checks.",
    "",
    `Work item: ${workItem.id}`,
    `Title: ${workItem.title}`,
    `Risk tier: ${workItem.riskTier}`,
    `Summary: ${workItem.summary}`,
  ].join("\n");
}

async function writeOutputSchema(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "off-codex-"));
  const schemaPath = join(dir, "runner-output.schema.json");
  await writeFile(
    schemaPath,
    JSON.stringify(
      {
        additionalProperties: false,
        properties: {
          changedFiles: { items: { type: "string" }, type: "array" },
          outcome: { enum: ["blocked", "failed", "implemented"], type: "string" },
          summary: { type: "string" },
        },
        required: ["outcome", "summary", "changedFiles"],
        type: "object",
      },
      null,
      2,
    ),
  );
  return schemaPath;
}

function runProcess(command: string, args: string[], stdin: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Codex CLI timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`Codex CLI exited ${code}: ${stderr || stdout}`));
    });

    child.stdin.end(stdin);
  });
}
