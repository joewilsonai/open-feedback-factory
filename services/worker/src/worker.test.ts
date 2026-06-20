import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { WorkItemRow } from "@open-feedback-factory/db";
import { readWorkerConfig } from "./config.js";
import { claimJob, runWorkerOnce, sendHeartbeat, type FetchLike } from "./worker.js";

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
  latestBranchName: null,
  riskTier: "safe_auto_merge",
  shouldCreateIssue: true,
  signalSources: ["demo"],
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

test("claimJob sends the configured runner token", async () => {
  const config = readWorkerConfig({
    API_BASE_URL: "http://api.test",
    RUNNER_TOKEN: "runner-test-token",
    WORKER_NAME: "worker-a",
  });
  const fetchImpl: FetchLike = async (_url, init) => {
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers["content-type"], "application/json");
    assert.equal(headers["x-off-runner-token"], "runner-test-token");
    return jsonResponse({ job: null });
  };

  assert.equal(config.runnerToken, "runner-test-token");
  assert.equal(await claimJob(config, fetchImpl), null);
});

test("sendHeartbeat posts safe worker liveness with the configured runner token", async () => {
  const config = readWorkerConfig({
    API_BASE_URL: "http://api.test",
    CODEX_AUTH_MODE: "api_key",
    CODEX_RUNNER_MODE: "codex",
    OFF_WORKER_CONTAINER: "true",
    OPENAI_API_KEY: "sk-test_1234567890abcdef",
    RUNNER_TOKEN: "runner-test-token",
    WORKER_NAME: "worker-a",
  });
  const fetchImpl: FetchLike = async (url, init) => {
    assert.equal(url, "http://api.test/runner/heartbeat");
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers["x-off-runner-token"], "runner-test-token");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.workerName, "worker-a");
    assert.equal(body.runnerMode, "codex");
    assert.equal(body.codexAuthMode, "api_key");
    assert.equal(body.workerKind, "docker");
    assert.equal("openAiApiKey" in body, false);
    assert.doesNotMatch(String(init?.body), /sk-test/);
    return jsonResponse({ workerConnection: { status: "online" } });
  };

  await sendHeartbeat(config, fetchImpl);
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
  const config = readWorkerConfig({ API_BASE_URL: "http://api.test", CODEX_CLI: process.execPath, CODEX_RUNNER_MODE: "codex" });
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ body: init?.body ? JSON.parse(String(init.body)) : null, url });
    if (String(url).endsWith("/doctor")) {
      return jsonResponse({ approvalMode: "manual", codexAuthMode: "cli" });
    }
    if (String(url).endsWith("/runner/heartbeat")) {
      return jsonResponse({ workerConnection: { status: "online" } });
    }
    return jsonResponse({ approvalMode: "manual", job: null, reason: "manual_approval_required" });
  };

  assert.equal(config.approvalMode, "manual");
  assert.equal(config.runnerMode, "codex");
  assert.equal(await runWorkerOnce(config, fetchImpl), false);
  assert.equal(calls.length, 3);
  assert.equal(calls[0]?.url, "http://api.test/doctor");
  assert.equal(calls[1]?.url, "http://api.test/runner/heartbeat");
  assert.equal(calls[2]?.url, "http://api.test/runner/jobs/claim");
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

test("runWorkerOnce leaves work queued for Docker workers in cli auth mode", async () => {
  const calls: Array<{ body: unknown; url: string }> = [];
  const config = readWorkerConfig({
    API_BASE_URL: "http://api.test",
    CODEX_CLI: process.execPath,
    CODEX_RUNNER_MODE: "codex",
    OFF_WORKER_CONTAINER: "true",
  });
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ body: init?.body ? JSON.parse(String(init.body)) : null, url });
    if (String(url).endsWith("/doctor")) {
      return jsonResponse({ approvalMode: "auto", codexAuthMode: "cli" });
    }
    if (String(url).endsWith("/runner/heartbeat")) {
      return jsonResponse({ workerConnection: { status: "online" } });
    }
    return new Response("not found", { status: 404 });
  };

  assert.equal(config.runsInContainer, true);
  assert.equal(await runWorkerOnce(config, fetchImpl), false);
  assert.deepEqual(calls.map((call) => call.url), ["http://api.test/doctor", "http://api.test/runner/heartbeat"]);
});

test("runWorkerOnce leaves work queued when Codex CLI is missing", async () => {
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
    if (String(url).endsWith("/runner/heartbeat")) {
      return jsonResponse({ workerConnection: { status: "online" } });
    }
    return new Response("not found", { status: 404 });
  };

  assert.equal(config.codexAuthMode, "api_key");
  assert.equal(await runWorkerOnce(config, fetchImpl), false);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.url, "http://api.test/doctor");
  assert.equal(calls[1]?.url, "http://api.test/runner/heartbeat");
});

test("runWorkerOnce picks api key auth from API settings even when env defaults to cli", async () => {
  const calls: Array<{ body: unknown; url: string }> = [];
  const config = readWorkerConfig({
    API_BASE_URL: "http://api.test",
    CODEX_CLI: process.execPath,
    CODEX_RUNNER_MODE: "codex",
    OPENAI_API_KEY: "sk-test_1234567890abcdef",
    WORKER_WORK_ITEM_ID: "work_test",
  });
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ body: init?.body ? JSON.parse(String(init.body)) : null, url });
    if (String(url).endsWith("/doctor")) {
      return jsonResponse({ approvalMode: "auto", codexAuthMode: "api_key" });
    }
    if (String(url).endsWith("/runner/heartbeat")) {
      return jsonResponse({ workerConnection: { status: "online" } });
    }
    if (String(url).endsWith("/runner/jobs/claim")) return jsonResponse({ job });
    if (String(url).endsWith(`/runner/jobs/${job.id}/complete`)) return jsonResponse({ runId: "run_test" });
    return new Response("not found", { status: 404 });
  };

  assert.equal(config.codexAuthMode, "cli");
  assert.equal(await runWorkerOnce(config, fetchImpl), true);
  assert.equal(
    calls.map((call) => call.url).join(" "),
    "http://api.test/doctor http://api.test/runner/heartbeat http://api.test/runner/jobs/claim http://api.test/runner/jobs/work_test/complete",
  );
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}
