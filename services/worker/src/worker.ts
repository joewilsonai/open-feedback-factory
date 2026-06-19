import { pathToFileURL } from "node:url";
import type { WorkItemRow } from "@open-feedback-factory/db";
import { CodexCliRunner, DemoRunner, GitHubClient, type RunnerResult } from "@open-feedback-factory/runner";
import { readWorkerConfig, type WorkerConfig } from "./config.js";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function claimJob(config: WorkerConfig, fetchImpl: FetchLike = fetch): Promise<WorkItemRow | null> {
  const response = await fetchImpl(`${config.apiBaseUrl}/runner/jobs/claim`, {
    body: JSON.stringify({ workItemId: config.workItemId, workerName: config.workerName }),
    headers: { "content-type": "application/json" },
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
      agentName: config.runnerMode === "codex" ? "codex-cli-worker" : "demo-worker",
      costActual: result.costActual,
      metadata: {
        branchName: result.branchName,
        changedFiles: result.changedFiles,
        githubPrUrl,
        mode: config.runnerMode,
        runnerOutput: result.output,
      },
      status: result.status,
      summary: result.summary,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) throw new Error(`Failed to complete runner job: ${response.status} ${await response.text()}`);
  const body = (await response.json()) as { runId: string };
  return body.runId;
}

export async function runWorkerOnce(config: WorkerConfig, fetchImpl: FetchLike = fetch): Promise<boolean> {
  const job = await claimJob(config, fetchImpl);
  if (!job) return false;
  console.log(`Claimed ${job.id}: ${job.title}`);

  const runner =
    config.runnerMode === "codex"
      ? new CodexCliRunner({
          cli: config.codexCli,
          cwd: config.runnerWorkspace,
          effort: config.codexEffort,
          manageGit: config.codexManageGit,
          model: config.codexModel,
          pricing: config.codexPricing,
          timeoutMs: config.codexTimeoutMs,
        })
      : new DemoRunner();

  let result = await runSafely(runner.run(job), job, config);
  const publication = await publishSafely(config, job, result);
  if (publication.status === "failed") {
    result = {
      ...result,
      output: `${result.output}\n${publication.output}`,
      status: "failed",
      summary: "Runner implemented the work, but pull request publication failed.",
    };
  }
  const runId = await completeJob(config, job.id, result, publication.prUrl, fetchImpl);
  console.log(`Completed ${job.id} as ${result.status} (${runId})${publication.prUrl ? ` with ${publication.prUrl}` : ""}.`);
  return true;
}

export async function startWorkerLoop(config = readWorkerConfig(), fetchImpl: FetchLike = fetch): Promise<void> {
  console.log(
    `Open Feedback Factory worker started in ${config.runnerMode} mode against ${config.apiBaseUrl} as ${config.workerName}.`,
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
      branchName: null,
      changedFiles: [],
      costActual: {
        amountUsd: 0,
        confidence: "low",
        model: config.codexModel,
      },
      output: error instanceof Error ? error.stack ?? error.message : String(error),
      status: "failed",
      summary: `Runner failed while working on ${job.id}.`,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
