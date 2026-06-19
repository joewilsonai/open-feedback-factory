import assert from "node:assert/strict";
import test from "node:test";
import type { WorkItemRow } from "@open-feedback-factory/db";
import { readWorkerConfig } from "./config.js";
import { claimJob, runWorkerOnce, type FetchLike } from "./worker.js";

const job: WorkItemRow = {
  autoMergeEligible: false,
  category: "theme",
  clusterKey: "feature.theme.dark-mode",
  costEstimate: {
    amountUsd: 1.5,
    confidence: "low",
    currency: "USD",
    model: "gpt-5.5",
    reason: "test",
  },
  createdAt: new Date().toISOString(),
  githubIssueUrl: null,
  githubPrUrl: null,
  id: "work_test",
  riskTier: "safe_auto_merge",
  shouldCreateIssue: true,
  status: "planned",
  summary: "Please add dark mode to settings",
  title: "Add a dark mode option",
  updatedAt: new Date().toISOString(),
  userStatus: "planned",
};

test("claimJob posts worker identity and returns no-op when queue is empty", async () => {
  const config = readWorkerConfig({ API_BASE_URL: "http://api.test", WORKER_NAME: "worker-a" });
  const fetchImpl: FetchLike = async (url, init) => {
    assert.equal(url, "http://api.test/runner/jobs/claim");
    assert.equal(JSON.parse(String(init?.body)).workerName, "worker-a");
    return jsonResponse({ job: null });
  };

  assert.equal(await claimJob(config, fetchImpl), null);
});

test("runWorkerOnce claims, runs demo worker, and completes with cost actual", async () => {
  const calls: Array<{ body: unknown; url: string }> = [];
  const config = readWorkerConfig({ API_BASE_URL: "http://api.test", CODEX_RUNNER_MODE: "demo" });
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ body: init?.body ? JSON.parse(String(init.body)) : null, url });
    if (String(url).endsWith("/runner/jobs/claim")) return jsonResponse({ job });
    if (String(url).endsWith(`/runner/jobs/${job.id}/complete`)) return jsonResponse({ runId: "run_test" });
    return new Response("not found", { status: 404 });
  };

  assert.equal(await runWorkerOnce(config, fetchImpl), true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.url, "http://api.test/runner/jobs/work_test/complete");
  assert.equal((calls[1]?.body as { status?: string }).status, "succeeded");
  assert.equal((calls[1]?.body as { costActual?: { amountUsd?: number } }).costActual?.amountUsd, 1.25);
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}
