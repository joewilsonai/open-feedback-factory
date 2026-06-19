import { pathToFileURL } from "node:url";
import type { WorkItemRow } from "@open-feedback-factory/db";
import { CodexCliRunner, DemoRunner, type RunnerResult } from "@open-feedback-factory/runner";
import { readWorkerConfig, type WorkerConfig } from "./config.js";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function claimJob(config: WorkerConfig, fetchImpl: FetchLike = fetch): Promise<WorkItemRow | null> {
  const response = await fetchImpl(`${config.apiBaseUrl}/runner/jobs/claim`, {
    body: JSON.stringify({ workerName: config.workerName }),
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
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const response = await fetchImpl(`${config.apiBaseUrl}/runner/jobs/${workItemId}/complete`, {
    body: JSON.stringify({
      agentName: config.runnerMode === "codex" ? "codex-cli-worker" : "demo-worker",
      costActual: result.costActual,
      metadata: {
        branchName: result.branchName,
        changedFiles: result.changedFiles,
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
          model: config.codexModel,
        })
      : new DemoRunner();

  const result = await runSafely(runner.run(job), job, config);
  const runId = await completeJob(config, job.id, result, fetchImpl);
  console.log(`Completed ${job.id} as ${result.status} (${runId}).`);
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startWorkerLoop().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
