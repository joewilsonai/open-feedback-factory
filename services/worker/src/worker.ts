import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import type { WorkItemRow } from "@open-feedback-factory/db";
import { CodexCliRunner, GitHubClient, type RunnerResult } from "@open-feedback-factory/runner";
import { readOpenAiApiKey, readWorkerConfig, type WorkerConfig } from "./config.js";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function claimJob(config: WorkerConfig, fetchImpl: FetchLike = fetch): Promise<WorkItemRow | null> {
  const response = await fetchImpl(`${config.apiBaseUrl}/runner/jobs/claim`, {
    body: JSON.stringify({ workItemId: config.workItemId, workerName: config.workerName }),
    headers: runnerHeaders(config),
    method: "POST",
  });
  if (!response.ok) throw new Error(`Failed to claim runner job: ${response.status} ${await response.text()}`);
  const body = (await response.json()) as { job?: WorkItemRow | null };
  return body.job ?? null;
}

export async function completeJob(
  config: WorkerConfig,
  workItemId: string,
  result: RunnerResult,
  githubPrUrl: string | null = null,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const response = await fetchImpl(`${config.apiBaseUrl}/runner/jobs/${workItemId}/complete`, {
    body: JSON.stringify({
      agentName: "codex-cli-worker",
      assumptions: [buildRunnerAssumptionRecord(result, config)],
      costActual: result.costActual,
      metadata: {
        branchName: result.branchName,
        changedFiles: result.changedFiles,
        checksRun: result.checksRun,
        checksSkipped: result.checksSkipped,
        githubPrUrl,
        mode: config.runnerMode,
        runnerOutput: result.output,
        userMessage: result.userMessage,
      },
      status: result.status,
      summary: result.summary,
    }),
    headers: runnerHeaders(config),
    method: "POST",
  });
  if (!response.ok) throw new Error(`Failed to complete runner job: ${response.status} ${await response.text()}`);
  const body = (await response.json()) as { runId: string };
  return body.runId;
}

export async function runWorkerOnce(config: WorkerConfig, fetchImpl: FetchLike = fetch): Promise<boolean> {
  if (config.runnerMode !== "codex") return false;
  const runtimeConfig = await resolveRuntimeConfig(config, fetchImpl);
  if (runtimeConfig.codexAuthMode === "api_key" && !runtimeConfig.openAiApiKey) return false;
  if (runtimeConfig.runsInContainer && runtimeConfig.codexAuthMode === "cli") {
    console.error("Docker worker cannot use host Codex CLI auth; switch to CODEX_AUTH_MODE=api_key or use the host worker.");
    return false;
  }
  if (!codexCliAvailable(runtimeConfig)) {
    console.error(`Codex CLI is not available at ${runtimeConfig.codexCli}; leaving work queued.`);
    return false;
  }

  const job = await claimJob(runtimeConfig, fetchImpl);
  if (!job) return false;
  console.log(`Claimed ${job.id}: ${job.title}`);

  const runner = new CodexCliRunner({
    cli: runtimeConfig.codexCli,
    cwd: runtimeConfig.runnerWorkspace,
    env: runtimeConfig.codexAuthMode === "api_key" ? { OPENAI_API_KEY: runtimeConfig.openAiApiKey } : undefined,
    effort: runtimeConfig.codexEffort,
    manageGit: runtimeConfig.codexManageGit,
    model: runtimeConfig.codexModel,
    pricing: runtimeConfig.codexPricing,
    timeoutMs: runtimeConfig.codexTimeoutMs,
  });

  let result = await runSafely(runner.run(job), job, runtimeConfig);
  const publication = await publishSafely(runtimeConfig, job, result);
  if (publication.status === "failed") {
    result = {
      ...result,
      assumptions: [...result.assumptions, "Pull request publication failed after the implementation run."],
      checksSkipped: [...result.checksSkipped, "GitHub pull request publication could not be completed."],
      output: `${result.output}\n${publication.output}`,
      status: "failed",
      summary: "Runner implemented the work, but pull request publication failed.",
      userMessage:
        "An agent made changes, but the pull request could not be published. A maintainer needs to review the runner output.",
    };
  }
  const runId = await completeJob(runtimeConfig, job.id, result, publication.prUrl, fetchImpl);
  console.log(`Completed ${job.id} as ${result.status} (${runId})${publication.prUrl ? ` with ${publication.prUrl}` : ""}.`);
  return true;
}

export async function startWorkerLoop(config = readWorkerConfig(), fetchImpl: FetchLike = fetch): Promise<void> {
  console.log(
    `Open Feedback Factory worker started with runner=${config.runnerMode}, local approval default=${config.approvalMode}, local auth default=${config.codexAuthMode}; live approval/auth settings are read from ${config.apiBaseUrl}/doctor before each claim as ${config.workerName}.`,
  );

  do {
    let worked = false;
    try {
      worked = await runWorkerOnce(config, fetchImpl);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
    if (config.runOnce) return;
    if (!worked) await sleep(config.pollIntervalMs);
  } while (true);
}

async function runSafely(run: Promise<RunnerResult>, job: WorkItemRow, config: WorkerConfig): Promise<RunnerResult> {
  try {
    return await run;
  } catch (error) {
    return {
      assumptions: ["Runner failed before structured Codex output was available."],
      branchName: null,
      changedFiles: [],
      checksRun: [],
      checksSkipped: ["Codex runner failed before checks could be confirmed."],
      costActual: {
        amountUsd: 0,
        confidence: "low",
        model: config.codexModel,
      },
      output: error instanceof Error ? error.stack ?? error.message : String(error),
      status: "failed",
      summary: `Runner failed while working on ${job.id}.`,
      userMessage: "The agent run failed before it could produce a safe user-facing summary.",
    };
  }
}

async function resolveRuntimeConfig(config: WorkerConfig, fetchImpl: FetchLike): Promise<WorkerConfig> {
  const settings = await fetchRuntimeSettings(config, fetchImpl);
  const codexAuthMode = settings?.codexAuthMode ?? config.codexAuthMode;
  return {
    ...config,
    approvalMode: settings?.approvalMode ?? config.approvalMode,
    codexAuthMode,
    openAiApiKey: readOpenAiApiKey(process.env.OPENAI_API_KEY ?? config.openAiApiKey, config.codexSecretsPath),
  };
}

async function fetchRuntimeSettings(
  config: WorkerConfig,
  fetchImpl: FetchLike,
): Promise<{ approvalMode?: "auto" | "manual"; codexAuthMode?: "api_key" | "cli" } | null> {
  try {
    const response = await fetchImpl(`${config.apiBaseUrl}/doctor`);
    if (!response.ok) return null;
    const body = (await response.json()) as Record<string, unknown>;
    return {
      approvalMode: body.approvalMode === "auto" || body.approvalMode === "manual" ? body.approvalMode : undefined,
      codexAuthMode: body.codexAuthMode === "api_key" || body.codexAuthMode === "cli" ? body.codexAuthMode : undefined,
    };
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function codexCliAvailable(config: WorkerConfig): boolean {
  const result = spawnSync(config.codexCli, ["--version"], {
    encoding: "utf8",
    env: config.codexAuthMode === "api_key" && config.openAiApiKey
      ? { ...process.env, OPENAI_API_KEY: config.openAiApiKey }
      : process.env,
    stdio: "ignore",
  });
  return result.status === 0;
}

function runnerHeaders(config: WorkerConfig): HeadersInit {
  return {
    "content-type": "application/json",
    ...(config.runnerToken ? { "x-off-runner-token": config.runnerToken } : {}),
  };
}

function buildRunnerAssumptionRecord(result: RunnerResult, config: WorkerConfig): Record<string, unknown> {
  const unresolved = result.status !== "succeeded" || result.checksSkipped.length > 0;
  return {
    alternativesSkipped: [],
    assumptions: result.assumptions,
    checksRun: result.checksRun,
    checksSkipped: result.checksSkipped,
    confidence: result.status === "succeeded" ? "medium" : "low",
    defaultsUsed: [`model=${config.codexModel}`, `runner=${config.runnerMode}`, `auth=${config.codexAuthMode}`],
    humanQuestions: [],
    impactAreas: unresolved ? ["merge_safety"] : ["none"],
    notes: result.userMessage,
    unresolved,
  };
}

async function publishPullRequestIfEnabled(
  config: WorkerConfig,
  job: WorkItemRow,
  result: RunnerResult,
): Promise<string | null> {
  if (
    !config.pullRequestEnabled ||
    config.githubMode === "disabled" ||
    config.runnerMode !== "codex" ||
    result.status !== "succeeded" ||
    !result.branchName
  ) {
    return null;
  }

  const github = new GitHubClient({
    appId: config.githubAppId,
    appPrivateKey: config.githubAppPrivateKey,
    appPrivateKeyPath: config.githubAppPrivateKeyPath,
    cwd: config.runnerWorkspace,
    installationId: config.githubAppInstallationId,
    mode: config.githubMode === "app" ? "app" : "gh",
    owner: config.githubOwner,
    repo: config.githubRepo,
  });
  await github.pushBranch(result.branchName);
  const prUrl = await github.createPullRequest({
    base: config.pullRequestBase,
    body: [
      "## Open Feedback Factory",
      "",
      `Work item: ${job.id}`,
      `Risk tier: ${job.riskTier}`,
      "",
      "## Sanitized Summary",
      "",
      job.summary,
      "",
      "Raw feedback remains private in Open Feedback Factory.",
    ].join("\n"),
    head: result.branchName,
    title: job.title,
  });
  result.output = `${result.output}\n${JSON.stringify({ githubPrUrl: prUrl, type: "github.pr_created" })}`;
  return prUrl;
}

async function publishSafely(
  config: WorkerConfig,
  job: WorkItemRow,
  result: RunnerResult,
): Promise<{ output: string; prUrl: string | null; status: "failed" | "skipped" | "succeeded" }> {
  try {
    const prUrl = await publishPullRequestIfEnabled(config, job, result);
    return { output: "", prUrl, status: prUrl ? "succeeded" : "skipped" };
  } catch (error) {
    return {
      output: JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        type: "github.pr_failed",
      }),
      prUrl: null,
      status: "failed",
    };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startWorkerLoop().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
