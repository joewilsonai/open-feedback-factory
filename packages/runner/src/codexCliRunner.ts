import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { WorkItemRow } from "@open-feedback-factory/db";
import type { CodexPricing, CodexStructuredResult, CodexUsage, RunnerResult, WorkRunner } from "./types.js";

export type CodexApprovalPolicy = "never" | "on-request" | "untrusted";
export type CodexSandboxMode = "read-only" | "workspace-write";
export type CodexWebSearchMode = "cached" | "disabled" | "live";

export interface CodexRunnerSandboxPolicy {
  allowLocalNetwork: boolean;
  allowLoginShell: boolean;
  allowUpstreamProxy: boolean;
  approvalPolicy: CodexApprovalPolicy;
  mode: CodexSandboxMode;
  networkAccess: boolean;
  networkAllowedDomains: string[];
  networkDeniedDomains: string[];
  webSearch: CodexWebSearchMode;
}

export type CodexRunnerSandboxPolicyInput = Partial<Omit<CodexRunnerSandboxPolicy, "mode">> & {
  mode?: CodexSandboxMode | "danger-full-access" | string;
};

export interface CodexCliRunnerOptions {
  branchPrefix?: string;
  cli?: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  effort?: string;
  manageGit?: boolean;
  model?: string;
  pricing?: CodexPricing;
  sandboxPolicy?: CodexRunnerSandboxPolicyInput;
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
      sandboxPolicy: this.options.sandboxPolicy,
      schemaPath,
    });

    const prompt = buildCodexPrompt(workItem);
    const output = await runProcess(this.options.cli ?? "codex", args, prompt, this.options.timeoutMs ?? 20 * 60_000, {
      ...process.env,
      ...this.options.env,
    });
    const parsed = parseCodexJsonlOutput(output);
    const structured = parsed.result ?? {
      assumptions: ["Codex CLI did not return the expected structured result."],
      changedFiles: [],
      checksRun: [],
      checksSkipped: ["Unknown; structured result was missing."],
      costSummary: "No structured cost summary was returned.",
      outcome: "failed",
      summary: "Codex CLI did not return the expected structured result.",
      userMessage: "The agent run failed before it could produce a safe user-facing summary.",
    };
    const status = statusFromOutcome(structured.outcome);
    const gitChangedFiles = this.options.manageGit ? await listGitChangedFiles(this.options.cwd) : [];
    const changedFiles = uniqueFiles([...structured.changedFiles, ...gitChangedFiles]);
    let finalStatus = status;
    let finalSummary = structured.summary;

    if (this.options.manageGit && finalStatus === "succeeded") {
      if (changedFiles.length === 0) {
        finalStatus = "failed";
        finalSummary = "Codex reported an implementation, but no changed files were found.";
      } else {
        await runGit(this.options.cwd, ["add", "--all", "--", ...changedFiles]);
        if (await hasStagedChanges(this.options.cwd)) {
          await runGit(this.options.cwd, ["commit", "-m", buildCodexCommitMessage(workItem)]);
        } else {
          finalStatus = "failed";
          finalSummary = "Codex reported an implementation, but no committable changes were found.";
        }
      }
    }

    const costActual = buildCodexCostActual({
      estimateAmountUsd: workItem.costEstimate.amountUsd,
      model,
      pricing: this.options.pricing,
      usage: parsed.usage,
    });

    return {
      assumptions: structured.assumptions,
      branchName,
      changedFiles,
      checksRun: structured.checksRun,
      checksSkipped: structured.checksSkipped,
      costActual,
      output,
      status: finalStatus,
      summary: finalSummary,
      userMessage: structured.userMessage,
    };
  }
}

export function buildCodexExecArgs(input: {
  cwd: string;
  effort: string;
  model: string;
  sandboxPolicy?: CodexRunnerSandboxPolicyInput;
  schemaPath: string;
}): string[] {
  const sandboxPolicy = normalizeCodexSandboxPolicy(input.sandboxPolicy);
  const configArgs = buildCodexSandboxConfigArgs(sandboxPolicy);

  return [
    "exec",
    "--json",
    "--model",
    input.model,
    "-c",
    `model_reasoning_effort="${normalizeCodexEffort(input.effort)}"`,
    ...configArgs,
    "--ignore-user-config",
    "--sandbox",
    sandboxPolicy.mode,
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

export function buildCodexCommitMessage(workItem: Pick<WorkItemRow, "id" | "title">): string {
  const title = workItem.title.trim().replace(/\s+/g, " ");
  return `feat: ${title} (${workItem.id})`;
}

export function buildCodexPrompt(workItem: WorkItemRow): string {
  return [
    "You are implementing an Open Feedback Factory safe-lane work item.",
    "Use only the sanitized work item summary below.",
    "Do not inspect or request raw private feedback.",
    "Make a PR-sized code change when the request is safe and actionable.",
    "Do not commit, push, or open a pull request; the runner handles GitHub publication.",
    "For tiny copy or docs requests, make only the requested file/content change.",
    "Run the relevant checks when feasible.",
    "Return structured output with assumptions, checksRun, checksSkipped, costSummary, and a userMessage.",
    "If you make assumptions, list them explicitly. If a check cannot run, list it in checksSkipped with a short reason.",
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

export function normalizeCodexSandboxPolicy(
  input: CodexRunnerSandboxPolicyInput | undefined = {},
): CodexRunnerSandboxPolicy {
  const mode = input.mode ?? "workspace-write";
  if (mode === "danger-full-access") {
    throw new Error("Codex runner refuses danger-full-access sandbox mode.");
  }
  if (mode !== "workspace-write" && mode !== "read-only") {
    throw new Error(`Unsupported Codex sandbox mode: ${String(mode)}`);
  }

  const approvalPolicy = input.approvalPolicy ?? "never";
  if (!isCodexApprovalPolicy(approvalPolicy)) {
    throw new Error(`Unsupported Codex approval policy: ${String(approvalPolicy)}`);
  }

  const webSearch = input.webSearch ?? "disabled";
  if (!isCodexWebSearchMode(webSearch)) {
    throw new Error(`Unsupported Codex web search mode: ${String(webSearch)}`);
  }

  const allowLocalNetwork = input.allowLocalNetwork ?? false;
  const networkAccess = input.networkAccess ?? false;
  const networkAllowedDomains = normalizeNetworkDomains(
    input.networkAllowedDomains ?? [],
    "allow",
    allowLocalNetwork,
  );
  const networkDeniedDomains = normalizeNetworkDomains(
    input.networkDeniedDomains ?? [],
    "deny",
    true,
  );

  if (networkAccess && networkAllowedDomains.length === 0) {
    throw new Error("Codex network access requires an explicit allowed-domain list.");
  }

  return {
    allowLocalNetwork,
    allowLoginShell: input.allowLoginShell ?? false,
    allowUpstreamProxy: input.allowUpstreamProxy ?? false,
    approvalPolicy,
    mode,
    networkAccess,
    networkAllowedDomains,
    networkDeniedDomains,
    webSearch,
  };
}

function buildCodexSandboxConfigArgs(policy: CodexRunnerSandboxPolicy): string[] {
  const args = [
    "-c",
    `approval_policy="${policy.approvalPolicy}"`,
    "-c",
    `allow_login_shell=${booleanConfig(policy.allowLoginShell)}`,
    "-c",
    `web_search="${policy.webSearch}"`,
  ];

  if (policy.mode === "workspace-write") {
    args.push("-c", `sandbox_workspace_write.network_access=${booleanConfig(policy.networkAccess)}`);
  }

  if (!policy.networkAccess) {
    args.push("-c", "features.network_proxy.enabled=false");
    return args;
  }

  args.push("-c", "features.network_proxy.enabled=true");
  args.push("-c", `features.network_proxy.domains=${formatNetworkProxyDomains(policy)}`);
  args.push("-c", `features.network_proxy.allow_local_binding=${booleanConfig(policy.allowLocalNetwork)}`);
  args.push("-c", `features.network_proxy.allow_upstream_proxy=${booleanConfig(policy.allowUpstreamProxy)}`);
  return args;
}

function normalizeNetworkDomains(
  values: string[],
  action: "allow" | "deny",
  allowLocalNetwork: boolean,
): string[] {
  const normalized: string[] = [];
  for (const value of values) {
    const domain = value.trim().toLowerCase();
    if (!domain) continue;
    if (isGlobalNetworkPattern(domain)) {
      throw new Error("Codex runner refuses global network access; use explicit hostnames.");
    }
    if (!/^[a-z0-9.*_-]+(?::[0-9]+)?$/.test(domain)) {
      throw new Error(`Invalid Codex network ${action} domain: ${value}`);
    }
    if (action === "allow" && !allowLocalNetwork && isLocalOrPrivateNetworkHost(domain)) {
      throw new Error(`Codex network allowlist cannot include local/private host ${domain} unless local network is enabled.`);
    }
    if (!normalized.includes(domain)) normalized.push(domain);
  }
  return normalized;
}

function formatNetworkProxyDomains(policy: CodexRunnerSandboxPolicy): string {
  const entries = [
    ...policy.networkAllowedDomains.map((domain) => `"${domain}" = "allow"`),
    ...policy.networkDeniedDomains.map((domain) => `"${domain}" = "deny"`),
  ];
  return `{ ${entries.join(", ")} }`;
}

function isCodexApprovalPolicy(value: unknown): value is CodexApprovalPolicy {
  return value === "never" || value === "on-request" || value === "untrusted";
}

function isCodexWebSearchMode(value: unknown): value is CodexWebSearchMode {
  return value === "cached" || value === "disabled" || value === "live";
}

function isGlobalNetworkPattern(value: string): boolean {
  return value === "*" || value === "*.*" || value === "0.0.0.0/0" || value === "::/0";
}

function isLocalOrPrivateNetworkHost(value: string): boolean {
  const host = value.replace(/^\*\./, "").replace(/:\d+$/, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host === "[::1]") return true;
  if (host === "metadata.google.internal" || host.endsWith(".metadata.google.internal")) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  const classB = /^172\.(\d{1,2})\./.exec(host);
  return Boolean(classB && Number(classB[1]) >= 16 && Number(classB[1]) <= 31);
}

function booleanConfig(value: boolean): string {
  return value ? "true" : "false";
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
      typeof value.costSummary === "string" &&
      typeof value.userMessage === "string" &&
      Array.isArray(value.changedFiles) &&
      value.changedFiles.every((file) => typeof file === "string") &&
      Array.isArray(value.assumptions) &&
      value.assumptions.every((item) => typeof item === "string") &&
      Array.isArray(value.checksRun) &&
      value.checksRun.every((item) => typeof item === "string") &&
      Array.isArray(value.checksSkipped) &&
      value.checksSkipped.every((item) => typeof item === "string")
    ) {
      return {
        assumptions: value.assumptions,
        changedFiles: value.changedFiles,
        checksRun: value.checksRun,
        checksSkipped: value.checksSkipped,
        costSummary: value.costSummary,
        outcome: value.outcome,
        summary: value.summary,
        userMessage: value.userMessage,
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

function hasStagedChanges(cwd: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["diff", "--cached", "--quiet"], {
      cwd,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(false);
        return;
      }
      if (code === 1) {
        resolve(true);
        return;
      }
      reject(new Error(`git diff --cached --quiet exited ${code}: ${stderr}`));
    });
  });
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
          assumptions: { items: { type: "string" }, type: "array" },
          changedFiles: { items: { type: "string" }, type: "array" },
          checksRun: { items: { type: "string" }, type: "array" },
          checksSkipped: { items: { type: "string" }, type: "array" },
          costSummary: { type: "string" },
          outcome: { enum: ["blocked", "failed", "implemented"], type: "string" },
          summary: { type: "string" },
          userMessage: { type: "string" },
        },
        required: ["outcome", "summary", "changedFiles", "assumptions", "checksRun", "checksSkipped", "costSummary", "userMessage"],
        type: "object",
      },
      null,
      2,
    ),
  );
  return schemaPath;
}

function runProcess(
  command: string,
  args: string[],
  stdin: string,
  timeoutMs: number,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
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
