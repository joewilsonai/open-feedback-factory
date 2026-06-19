import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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
  latestActualCost: null,
  riskTier: "safe_auto_merge",
  shouldCreateIssue: true,
  status: "planned",
  summary: "Please add dark mode to settings",
  title: "Add a dark mode option",
  updatedAt: new Date().toISOString(),
  userStatus: "planned",
  unresolvedAssumptions: [],
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
    if (String(url).endsWith("/doctor")) {
      return jsonResponse({ approvalMode: "manual", codexAuthMode: "cli" });
    }
    return jsonResponse({ approvalMode: "manual", job: null, reason: "manual_approval_required" });
  };

  assert.equal(config.approvalMode, "manual");
  assert.equal(config.runnerMode, "codex");
  assert.equal(await runWorkerOnce(config, fetchImpl), false);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.url, "http://api.test/doctor");
  assert.equal(calls[1]?.url, "http://api.test/runner/jobs/claim");
});

test("readWorkerConfig loads api key mode from the local secrets file", async () => {
  const secretsDir = await mkdtemp(path.join(tmpdir(), "off-worker-key-"));
  const secretsPath = path.join(secretsDir, "secrets.env");
  await writeFile(secretsPath, 'OPENAI_API_KEY="sk-test_1234567890abcdef"\n');

  try {
    const config = readWorkerConfig({
      API_BASE_URL: "http://api.test",
      CODEX_AUTH_MODE: "api_key",
      CODEX_RUNNER_MODE: "codex",
      CODEX_SECRETS_PATH: secretsPath,
    });

    assert.equal(config.codexAuthMode, "api_key");
    assert.equal(config.openAiApiKey, "sk-test_1234567890abcdef");
  } finally {
    await rm(secretsDir, { force: true, recursive: true });
  }
});

test("runWorkerOnce uses api key mode instead of blocking before claim", async () => {
  const calls: Array<{ body: unknown; url: string }> = [];
  const config = readWorkerConfig({
    API_BASE_URL: "http://api.test",
    CODEX_AUTH_MODE: "api_key",
    CODEX_CLI: "definitely-missing-codex",
    CODEX_RUNNER_MODE: "codex",
    OPENAI_API_KEY: "sk-test_1234567890abcdef",
    WORKER_WORK_ITEM_ID: "work_test",
  });
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ body: init?.body ? JSON.parse(String(init.body)) : null, url });
    if (String(url).endsWith("/doctor")) {
      return jsonResponse({ approvalMode: "auto", codexAuthMode: "api_key" });
    }
    if (String(url).endsWith("/runner/jobs/claim")) return jsonResponse({ job });
    if (String(url).endsWith(`/runner/jobs/${job.id}/complete`)) return jsonResponse({ runId: "run_test" });
    return new Response("not found", { status: 404 });
  };

  assert.equal(config.codexAuthMode, "api_key");
  assert.equal(await runWorkerOnce(config, fetchImpl), true);
  assert.equal(calls.length, 3);
  assert.equal(calls[0]?.url, "http://api.test/doctor");
  assert.equal(calls[1]?.url, "http://api.test/runner/jobs/claim");
  assert.equal(calls[2]?.url, "http://api.test/runner/jobs/work_test/complete");
  assert.equal((calls[2]?.body as { status?: string }).status, "failed");
});

test("runWorkerOnce picks api key auth from API settings even when env defaults to cli", async () => {
  const calls: Array<{ body: unknown; url: string }> = [];
  const config = readWorkerConfig({
    API_BASE_URL: "http://api.test",
    CODEX_CLI: "definitely-missing-codex",
    CODEX_RUNNER_MODE: "codex",
    OPENAI_API_KEY: "sk-test_1234567890abcdef",
    WORKER_WORK_ITEM_ID: "work_test",
  });
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ body: init?.body ? JSON.parse(String(init.body)) : null, url });
    if (String(url).endsWith("/doctor")) {
      return jsonResponse({ approvalMode: "auto", codexAuthMode: "api_key" });
    }
    if (String(url).endsWith("/runner/jobs/claim")) return jsonResponse({ job });
    if (String(url).endsWith(`/runner/jobs/${job.id}/complete`)) return jsonResponse({ runId: "run_test" });
    return new Response("not found", { status: 404 });
  };

  assert.equal(config.codexAuthMode, "cli");
  assert.equal(await runWorkerOnce(config, fetchImpl), true);
  assert.equal(calls.map((call) => call.url).join(" "), "http://api.test/doctor http://api.test/runner/jobs/claim http://api.test/runner/jobs/work_test/complete");
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}
