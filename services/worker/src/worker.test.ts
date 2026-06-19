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

test("claimJob posts worker identity and optional target work item", async () => {
  const config = readWorkerConfig({
    API_BASE_URL: "http://api.test",
    WORKER_NAME: "worker-a",
    WORKER_WORK_ITEM_ID: "work_target",
  });
  const fetchImpl: FetchLike = async (url, init) => {
    assert.equal(url, "http://api.test/runner/jobs/claim");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.workerName, "worker-a");
    assert.equal(body.workItemId, "work_target");
    return jsonResponse({ job: null });
  };

  assert.equal(await claimJob(config, fetchImpl), null);
});

test("runWorkerOnce leaves work queued when runner is disabled", async () => {
  const calls: Array<{ body: unknown; url: string }> = [];
  const config = readWorkerConfig({ API_BASE_URL: "http://api.test" });
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ body: init?.body ? JSON.parse(String(init.body)) : null, url });
    if (String(url).endsWith("/runner/jobs/claim")) return jsonResponse({ job });
    if (String(url).endsWith(`/runner/jobs/${job.id}/complete`)) return jsonResponse({ runId: "run_test" });
    return new Response("not found", { status: 404 });
  };

  assert.equal(config.runnerMode, "disabled");
  assert.equal(await runWorkerOnce(config, fetchImpl), false);
  assert.equal(calls.length, 0);
});

test("runWorkerOnce leaves work queued when API requires manual approval", async () => {
  const calls: Array<{ body: unknown; url: string }> = [];
  const config = readWorkerConfig({ API_BASE_URL: "http://api.test", CODEX_RUNNER_MODE: "codex" });
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ body: init?.body ? JSON.parse(String(init.body)) : null, url });
    return jsonResponse({ approvalMode: "manual", job: null, reason: "manual_approval_required" });
  };

  assert.equal(config.approvalMode, "manual");
  assert.equal(config.runnerMode, "codex");
  assert.equal(await runWorkerOnce(config, fetchImpl), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "http://api.test/runner/jobs/claim");
});

test("runWorkerOnce does not claim jobs for api key mode until that runner exists", async () => {
  const calls: Array<{ body: unknown; url: string }> = [];
  const config = readWorkerConfig({
    API_BASE_URL: "http://api.test",
    CODEX_AUTH_MODE: "api_key",
    CODEX_RUNNER_MODE: "codex",
    WORKER_WORK_ITEM_ID: "work_test",
  });
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ body: init?.body ? JSON.parse(String(init.body)) : null, url });
    return jsonResponse({ job });
  };

  assert.equal(config.codexAuthMode, "api_key");
  assert.equal(await runWorkerOnce(config, fetchImpl), false);
  assert.equal(calls.length, 0);
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}
