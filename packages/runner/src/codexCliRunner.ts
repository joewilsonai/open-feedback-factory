import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { WorkItemRow } from "@open-feedback-factory/db";
import type { CodexPricing, CodexStructuredResult, CodexUsage, RunnerResult, WorkRunner } from "./types.js";

export interface CodexCliRunnerOptions {
  branchPrefix?: string;
  cli?: string;
  cwd: string;
  effort?: string;
  manageGit?: boolean;
  model?: string;
  pricing?: CodexPricing;
  timeoutMs?: number;
}

export class CodexCliRunner implements WorkRunner {
  constructor(private readonly options: CodexCliRunnerOptions) {}

  async run(workItem: WorkItemRow): Promise<RunnerResult> {
    const schemaPath = await writeOutputSchema();
    const model = this.options.model ?? workItem.costEstimate.model;
    const branchName = buildCodexBranchName(workItem.id, this.options.branchPrefix);
    if (this.options.manageGit) {
      await ensureCleanGitWorkspace(this.options.cwd);
      await runGit(this.options.cwd, ["checkout", "-B", branchName]);
    }

    const args = buildCodexExecArgs({
      cwd: this.options.cwd,
      effort: this.options.effort ?? "extra-high",
      model,
      schemaPath,
    });

    const prompt = buildCodexPrompt(workItem);
    const output = await runProcess(this.options.cli ?? "codex", args, prompt, this.options.timeoutMs ?? 20 * 60_000);
    const parsed = parseCodexJsonlOutput(output);
    const structured = parsed.result ?? {
      changedFiles: [],
      outcome: "failed",
      summary: "Codex CLI did not return the expected structured result.",
    };
    const status = statusFromOutcome(structured.outcome);
    const gitChangedFiles = this.options.manageGit ? await listGitChangedFiles(this.options.cwd) : [];
    const changedFiles = uniqueFiles([...structured.changedFiles, ...gitChangedFiles]);
    const costActual = buildCodexCostActual({
      estimateAmountUsd: workItem.costEstimate.amountUsd,
      model,
      pricing: this.options.pricing,
      usage: parsed.usage,
    });

    return {
      branchName,
      changedFiles,
      costActual,
      output,
      status,
      summary: structured.summary,
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
    `model_reasoning_effort="${normalizeCodexEffort(input.effort)}"`,
    "--sandbox",
    "workspace-write",
    "--cd",
    input.cwd,
    "--output-schema",
    input.schemaPath,
    "-",
  ];
}

export function buildCodexBranchName(workItemId: string, prefix = "off/codex"): string {
  return `${prefix}/${workItemId}`.replace(/[^a-zA-Z0-9/_-]/g, "-");
}

export function buildCodexPrompt(workItem: WorkItemRow): string {
  return [
    "You are implementing an Open Feedback Factory safe-lane work item.",
    "Use only the sanitized work item summary below.",
    "Do not inspect or request raw private feedback.",
    "Make a PR-sized code change when the request is safe and actionable.",
    "Do not commit, push, or open a pull request; the runner handles GitHub publication.",
    "Run the relevant checks when feasible.",
    "",
    `Work item: ${workItem.id}`,
    `Title: ${workItem.title}`,
    `Risk tier: ${workItem.riskTier}`,
    `Summary: ${workItem.summary}`,
  ].join("\n");
}

export function normalizeCodexEffort(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "extra-high" || normalized === "extra_high" || normalized === "x-high") return "xhigh";
  return normalized;
}

export function parseCodexJsonlOutput(output: string): {
  errors: string[];
  result: CodexStructuredResult | null;
  usage: CodexUsage | null;
} {
  const errors: string[] = [];
  let result: CodexStructuredResult | null = null;
  let usage: CodexUsage | null = null;

  for (const line of output.split(/\r?\n/)) {
    if (!line.trim().startsWith("{")) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }

    if (event.type === "error" && typeof event.message === "string") {
      errors.push(event.message);
    }

    const item = event.item as Record<string, unknown> | undefined;
    if (event.type === "item.completed" && item?.type === "error" && typeof item.message === "string") {
      errors.push(item.message);
    }

    if (event.type === "item.completed" && item?.type === "agent_message" && typeof item.text === "string") {
      const parsed = parseStructuredResult(item.text);
      if (parsed) result = parsed;
    }

    if (event.type === "turn.completed" && isUsage(event.usage)) {
      usage = {
        cachedInputTokens: event.usage.cached_input_tokens,
        inputTokens: event.usage.input_tokens,
        outputTokens: event.usage.output_tokens,
        reasoningOutputTokens: event.usage.reasoning_output_tokens,
      };
    }
  }

  return { errors, result, usage };
}

export function buildCodexCostActual(input: {
  estimateAmountUsd: number;
  model: string;
  pricing?: CodexPricing;
  usage: CodexUsage | null;
}): RunnerResult["costActual"] {
  const tokens = input.usage
    ? input.usage.inputTokens + input.usage.outputTokens + input.usage.reasoningOutputTokens
    : undefined;
  const amountUsd = input.usage && input.pricing ? costFromUsage(input.usage, input.pricing) : input.estimateAmountUsd;

  return {
    amountUsd,
    confidence: input.usage && input.pricing ? "high" : "low",
    model: input.model,
    tokens,
  };
}

export function costFromUsage(usage: CodexUsage, pricing: CodexPricing): number {
  const uncachedInputTokens = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  const amount =
    (uncachedInputTokens / 1_000_000) * pricing.inputUsdPerMillion +
    (usage.cachedInputTokens / 1_000_000) * pricing.cachedInputUsdPerMillion +
    (usage.outputTokens / 1_000_000) * pricing.outputUsdPerMillion +
    (usage.reasoningOutputTokens / 1_000_000) * pricing.reasoningOutputUsdPerMillion;
  return Number(amount.toFixed(6));
}

function parseStructuredResult(text: string): CodexStructuredResult | null {
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    if (
      (value.outcome === "blocked" || value.outcome === "failed" || value.outcome === "implemented") &&
      typeof value.summary === "string" &&
      Array.isArray(value.changedFiles) &&
      value.changedFiles.every((file) => typeof file === "string")
    ) {
      return {
        changedFiles: value.changedFiles,
        outcome: value.outcome,
        summary: value.summary,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function statusFromOutcome(outcome: CodexStructuredResult["outcome"]): RunnerResult["status"] {
  if (outcome === "implemented") return "succeeded";
  return outcome;
}

function uniqueFiles(files: string[]): string[] {
  return [...new Set(files.filter(Boolean))].sort();
}

async function ensureCleanGitWorkspace(cwd: string): Promise<void> {
  const status = await runGit(cwd, ["status", "--porcelain"]);
  if (status.trim()) {
    throw new Error("Codex managed-git runner requires a clean workspace.");
  }
}

async function listGitChangedFiles(cwd: string): Promise<string[]> {
  const [unstaged, staged] = await Promise.all([
    runGit(cwd, ["diff", "--name-only"]),
    runGit(cwd, ["diff", "--cached", "--name-only"]),
  ]);
  return uniqueFiles([...unstaged.split(/\r?\n/), ...staged.split(/\r?\n/)]);
}

function runGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`git ${args.join(" ")} exited ${code}: ${stderr || stdout}`));
    });
  });
}

function isUsage(value: unknown): value is {
  cached_input_tokens: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
} {
  const usage = value as Record<string, unknown> | null;
  return (
    typeof usage?.cached_input_tokens === "number" &&
    typeof usage.input_tokens === "number" &&
    typeof usage.output_tokens === "number" &&
    typeof usage.reasoning_output_tokens === "number"
  );
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
