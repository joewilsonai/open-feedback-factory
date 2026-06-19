import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { AgentAssumptionRecord, UserFeedbackStatus } from "@open-feedback-factory/core";
import type { ControlRoomSnapshot, WorkItemRow } from "@open-feedback-factory/db";
import { buildApp, type AppStore } from "./app.js";
import type { ApiConfig } from "./config.js";
import { buildGithubAppEnvSnippet, githubWebhooksEnabledForBaseUrl } from "./routes/github.js";
import { buildSanitizedGithubIssueInput } from "./routes/sdk.js";

const config: ApiConfig = {
  apiHost: "127.0.0.1",
  apiPort: 4100,
  approvalMode: "manual",
  autoMergeEnabled: false,
  codexApiKeyConfigured: false,
  codexAuthMode: "cli",
  codexRunnerMode: "disabled",
  codexSecretsPath: ".off/test-secrets.env",
  controlCenterUrl: "http://control.test",
  databaseUrl: "postgres://example",
  githubMode: "disabled",
  githubOwner: "joewilsonai",
  githubRepo: "open-feedback-factory",
  githubWebhookSecret: "test-secret",
  maxFeatureCostUsd: 5,
  maxSafeDiffLines: 120,
  protectedPathFragments: ["auth", "billing", "privacy"],
  publicBaseUrl: "http://api.test",
  runnerWorkspace: "/tmp/open-feedback-factory-test",
};

class MemoryStore implements AppStore {
  approvalMode: ApiConfig["approvalMode"] | null = null;
  codexAuthMode: ApiConfig["codexAuthMode"] | null = null;
  deliveries = new Set<string>();
  feedbackStatuses = new Map<string, UserFeedbackStatus>();
  githubArtifacts = new Map<string, string>();
  recentAssumptions: AgentAssumptionRecord[] = [];
  usageCount = 0;
  workItems: WorkItemRow[] = [];

  async createFeedbackIntake(input: Parameters<AppStore["createFeedbackIntake"]>[0]) {
    const feedbackId = `feedback_${this.feedbackStatuses.size + 1}`;
    const workItemId = input.decision.shouldCreateIssue ? `work_${this.workItems.length + 1}` : null;
    const status: UserFeedbackStatus = {
      feedbackId,
      label: input.decision.userStatus,
      message: input.decision.userMessage,
      state: input.decision.userStatus,
      timeline: [],
    };
    this.feedbackStatuses.set(feedbackId, status);

    if (workItemId) {
      this.workItems.push({
        autoMergeEligible: false,
        category: input.decision.category,
        clusterKey: input.decision.clusterKey,
        costEstimate: input.decision.costEstimate,
        createdAt: new Date().toISOString(),
        githubIssueUrl: null,
        githubPrUrl: null,
        id: workItemId,
        latestActualCost: null,
        latestBranchName: null,
        riskTier: input.decision.riskTier,
        shouldCreateIssue: input.decision.shouldCreateIssue,
        status: "planned",
        summary: input.sanitized.sanitizedMessage,
        title: input.decision.title,
        updatedAt: new Date().toISOString(),
        userStatus: input.decision.userStatus,
        unresolvedAssumptions: [],
      });
    }

    return { feedbackId, status, workItemId };
  }

  async getControlRoomSnapshot(): Promise<ControlRoomSnapshot> {
    return {
      counts: {
        agentRuns: 0,
        feedbackSignals: this.feedbackStatuses.size,
        featureUsageEvents: this.usageCount,
        openWorkItems: this.workItems.length,
      },
      recentAgentRuns: [],
      recentAssumptions: this.recentAssumptions.map((assumption) => ({ ...assumption })),
      recentFeedback: [],
      recentUsage: [],
      workItems: this.workItems,
    };
  }

  async getApprovalMode(defaultMode: ApiConfig["approvalMode"]): Promise<ApiConfig["approvalMode"]> {
    return this.approvalMode ?? defaultMode;
  }

  async setApprovalMode(mode: ApiConfig["approvalMode"]) {
    this.approvalMode = mode;
  }

  async getCodexAuthMode(defaultMode: ApiConfig["codexAuthMode"]): Promise<ApiConfig["codexAuthMode"]> {
    return this.codexAuthMode ?? defaultMode;
  }

  async setCodexAuthMode(mode: ApiConfig["codexAuthMode"]) {
    this.codexAuthMode = mode;
  }

  async claimNextWorkItem(_workerName?: string, workItemId?: string) {
    const item = this.workItems.find(
      (workItem) => workItem.status === "planned" && (!workItemId || workItem.id === workItemId),
    );
    if (!item) return null;
    item.status = "in_progress";
    item.userStatus = "in_progress";
    return item;
  }

  async completeWorkItemRun(input: Parameters<AppStore["completeWorkItemRun"]>[0]) {
    const item = this.workItems.find((workItem) => workItem.id === input.workItemId);
    if (item) {
      item.status = input.status === "succeeded" ? "implemented" : input.status;
      item.userStatus = input.status === "succeeded" ? "implemented" : "blocked";
      item.latestActualCost = input.costActual ?? null;
      item.latestBranchName = typeof input.metadata?.branchName === "string" ? input.metadata.branchName : item.latestBranchName;
      item.unresolvedAssumptions = (input.assumptions ?? []).filter((assumption) => assumption.unresolved);
    }
    this.recentAssumptions.unshift(...(input.assumptions ?? []));
    return "run_1";
  }

  async getUserFeedbackStatus(feedbackId: string) {
    return this.feedbackStatuses.get(feedbackId) ?? null;
  }

  async getWorkItem(id: string) {
    return this.workItems.find((item) => item.id === id) ?? null;
  }

  async listWorkItems() {
    return this.workItems;
  }

  async markWorkItemReleased(workItemId: string, message = "This request has shipped.") {
    const item = this.workItems.find((workItem) => workItem.id === workItemId);
    if (item) {
      item.status = "shipped";
      item.userStatus = "shipped";
      item.updatedAt = new Date().toISOString();
    }
    for (const [feedbackId] of this.feedbackStatuses) {
      this.feedbackStatuses.set(feedbackId, {
        feedbackId,
        label: "Shipped",
        message,
        state: "shipped",
        timeline: [],
      });
    }
  }

  async reconcileWorkItems(input?: Parameters<AppStore["reconcileWorkItems"]>[0]) {
    const staleAfterMinutes = input?.staleAfterMinutes ?? 60;
    const cutoff = Date.now() - staleAfterMinutes * 60_000;
    const staleInProgressRequeuedIds: string[] = [];
    for (const item of this.workItems) {
      if (item.status === "in_progress" && new Date(item.updatedAt).getTime() < cutoff) {
        item.status = "planned";
        item.userStatus = "planned";
        item.updatedAt = new Date().toISOString();
        staleInProgressRequeuedIds.push(item.id);
      }
    }
    return {
      failedWithoutPrIds: this.workItems
        .filter((item) => item.status === "failed" && !item.githubPrUrl)
        .map((item) => item.id),
      implementedAwaitingReleaseIds: this.workItems
        .filter((item) => item.status === "implemented")
        .map((item) => item.id),
      staleInProgressRequeuedIds,
    };
  }

  async recordAgentRun(input?: Parameters<AppStore["recordAgentRun"]>[0]) {
    if (input?.assumptions?.length) {
      const item = this.workItems.find((workItem) => workItem.id === input.workItemId);
      if (item) item.unresolvedAssumptions = input.assumptions.filter((assumption) => assumption.unresolved);
      this.recentAssumptions.unshift(...input.assumptions);
    }
    return "run_1";
  }

  async recordFeatureUsage() {
    this.usageCount += 1;
    return `usage_${this.usageCount}`;
  }

  async recordGithubArtifact(input: Parameters<AppStore["recordGithubArtifact"]>[0]) {
    const artifactKey = `${input.workItemId}:${input.artifactType}:${input.url}`;
    const existing = this.githubArtifacts.get(artifactKey);
    if (existing) return existing;

    const item = this.workItems.find((workItem) => workItem.id === input.workItemId);
    if (item && input.artifactType === "issue") item.githubIssueUrl = input.url;
    if (item && input.artifactType === "pull_request") item.githubPrUrl = input.url;
    const id = `gh_${this.githubArtifacts.size + 1}`;
    this.githubArtifacts.set(artifactKey, id);
    return id;
  }

  async recordGithubWebhookDelivery(input: Parameters<AppStore["recordGithubWebhookDelivery"]>[0]) {
    if (!input.deliveryId) return true;
    if (this.deliveries.has(input.deliveryId)) return false;
    this.deliveries.add(input.deliveryId);
    return true;
  }
}

test("API accepts SDK feedback and returns user-safe status", async () => {
  const app = await buildApp({ config, store: new MemoryStore() });

  const response = await app.inject({
    method: "POST",
    payload: {
      message: "Please add dark mode to settings",
      source: "demo",
      userId: "user-1",
    },
    url: "/sdk/feedback",
  });

  assert.equal(response.statusCode, 201);
  const body = response.json();
  assert.match(body.feedbackId, /^feedback_/);
  assert.match(body.workItemId, /^work_/);
  assert.equal(body.status.state, "planned");

  await app.close();
});

test("API rate limits repeated SDK feedback intake by actor", async () => {
  const app = await buildApp({
    config: { ...config, rateLimitWindowMs: 60_000, sdkRateLimitMax: 2 },
    store: new MemoryStore(),
  });

  for (let index = 0; index < 2; index += 1) {
    const response = await app.inject({
      method: "POST",
      payload: {
        message: `Please add note search ${index}`,
        source: "demo",
        userId: "user-rate-test",
      },
      url: "/sdk/feedback",
    });
    assert.equal(response.statusCode, 201);
  }

  const limited = await app.inject({
    method: "POST",
    payload: {
      message: "Please add note search again",
      source: "demo",
      userId: "user-rate-test",
    },
    url: "/sdk/feedback",
  });

  assert.equal(limited.statusCode, 429);
  assert.equal(limited.json().error, "rate_limited");
  assert.equal(limited.headers["retry-after"], "60");

  await app.close();
});

test("API records feature usage and exposes control room counts", async () => {
  const store = new MemoryStore();
  const app = await buildApp({ config, store });

  const usage = await app.inject({
    method: "POST",
    payload: { action: "enabled", userId: "user-1" },
    url: "/sdk/features/dark-mode/usage",
  });
  assert.equal(usage.statusCode, 201);

  const controlRoom = await app.inject({ method: "GET", url: "/admin/control-room" });
  assert.equal(controlRoom.statusCode, 200);
  assert.equal(controlRoom.json().counts.featureUsageEvents, 1);

  await app.close();
});

test("admin run endpoint blocks implementation when Codex runner is disabled", async () => {
  const store = new MemoryStore();
  const app = await buildApp({ config, store });

  const feedback = await app.inject({
    method: "POST",
    payload: {
      message: "Please add dark mode to settings",
      source: "demo",
    },
    url: "/sdk/feedback",
  });
  const workItemId = feedback.json().workItemId;

  const response = await app.inject({
    method: "POST",
    url: `/admin/work-items/${workItemId}/run`,
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "codex runner disabled");
  assert.equal(response.json().mode, "disabled");
  assert.equal(store.workItems[0]?.status, "planned");

  await app.close();
});

test("doctor exposes setup wizard links", async () => {
  const store = new MemoryStore();
  store.approvalMode = "auto";
  const app = await buildApp({ config, store });
  const response = await app.inject({ method: "GET", url: "/doctor" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().controlCenterUrl, "http://control.test");
  assert.equal(response.json().approvalMode, "auto");
  assert.equal(response.json().codexAuthMode, "cli");
  assert.equal(response.json().codexApiKeyConfigured, false);
  assert.equal(response.json().githubAppSetupUrl, "http://api.test/github/app/setup");
  assert.equal(response.json().githubWebhookUrl, "http://api.test/github/webhook");
  assert.equal(response.json().githubWebhooksEnabled, true);

  await app.close();
});

test("admin can change approval mode without restarting the API", async () => {
  const store = new MemoryStore();
  const app = await buildApp({ config, store });

  const initialSettings = await app.inject({ method: "GET", url: "/admin/settings" });
  assert.equal(initialSettings.statusCode, 200);
  assert.equal(initialSettings.json().approvalMode, "manual");

  const update = await app.inject({
    method: "PATCH",
    payload: { approvalMode: "auto" },
    url: "/admin/settings/approval-mode",
  });
  assert.equal(update.statusCode, 200);
  assert.equal(update.json().approvalMode, "auto");

  const doctor = await app.inject({ method: "GET", url: "/doctor" });
  assert.equal(doctor.json().approvalMode, "auto");

  const invalid = await app.inject({
    method: "PATCH",
    payload: { approvalMode: "reckless" },
    url: "/admin/settings/approval-mode",
  });
  assert.equal(invalid.statusCode, 400);

  await app.close();
});

test("admin can configure Codex auth mode and save a masked API key", async () => {
  const store = new MemoryStore();
  const secretsDir = await mkdtemp(path.join(tmpdir(), "off-api-key-"));
  const secretsPath = path.join(secretsDir, "secrets.env");
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  const app = await buildApp({ config: { ...config, codexSecretsPath: secretsPath }, store });

  try {
    const initialSettings = await app.inject({ method: "GET", url: "/admin/settings" });
    assert.equal(initialSettings.statusCode, 200);
    assert.equal(initialSettings.json().codexAuthMode, "cli");
    assert.equal(initialSettings.json().codexApiKey.configured, false);
    assert.equal("apiKey" in initialSettings.json().codexApiKey, false);

    const mode = await app.inject({
      method: "PATCH",
      payload: { codexAuthMode: "api_key" },
      url: "/admin/settings/codex-auth-mode",
    });
    assert.equal(mode.statusCode, 200);
    assert.equal(mode.json().codexAuthMode, "api_key");

    const invalidKey = await app.inject({
      method: "PUT",
      payload: { apiKey: "short" },
      url: "/admin/settings/codex-api-key",
    });
    assert.equal(invalidKey.statusCode, 400);

    const save = await app.inject({
      method: "PUT",
      payload: { apiKey: "sk-test_1234567890abcdef" },
      url: "/admin/settings/codex-api-key",
    });
    assert.equal(save.statusCode, 200);
    assert.equal(save.json().codexApiKey.configured, true);
    assert.equal(save.json().codexApiKey.fingerprint, "sk-test...cdef");
    assert.equal("apiKey" in save.json().codexApiKey, false);
    assert.match(await readFile(secretsPath, "utf8"), /OPENAI_API_KEY=/);

    const doctor = await app.inject({ method: "GET", url: "/doctor" });
    assert.equal(doctor.json().codexAuthMode, "api_key");
    assert.equal(doctor.json().codexApiKeyConfigured, true);
    assert.equal(doctor.json().codexApiKeyFingerprint, "sk-test...cdef");

    const remove = await app.inject({ method: "DELETE", url: "/admin/settings/codex-api-key" });
    assert.equal(remove.statusCode, 200);
    assert.equal(remove.json().codexApiKey.configured, false);
  } finally {
    await app.close();
    if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiKey;
    await rm(secretsDir, { force: true, recursive: true });
  }
});

test("API exposes GitHub App manifest seam", async () => {
  const app = await buildApp({ config, store: new MemoryStore() });
  const response = await app.inject({ method: "GET", url: "/github/app/manifest" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().default_permissions.contents, "write");
  assert.equal(response.json().default_permissions.issues, "write");
  assert.equal(response.json().default_permissions.pull_requests, "write");
  assert.deepEqual(response.json().default_events, ["issues", "pull_request", "push"]);
  assert.deepEqual(response.json().callback_urls, ["http://api.test/github/app/installed"]);
  assert.equal(response.json().hook_attributes.url, "http://api.test/github/webhook");
  assert.equal(response.json().setup_url, "http://control.test");
  assert.equal(response.json().url, "https://github.com/joewilsonai/open-feedback-factory");

  await app.close();
});

test("GitHub App manifest disables webhooks for localhost setup", async () => {
  const localConfig: ApiConfig = {
    ...config,
    controlCenterUrl: "http://localhost:5173",
    publicBaseUrl: "http://localhost:4100",
  };
  const app = await buildApp({ config: localConfig, store: new MemoryStore() });
  const response = await app.inject({ method: "GET", url: "/github/app/manifest" });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.hook_attributes.active, false);
  assert.equal(body.hook_attributes.url, "https://example.com/open-feedback-factory/webhook-disabled");
  assert.equal("default_events" in body, false);
  assert.equal("setup_url" in body, false);
  assert.deepEqual(body.callback_urls, ["http://localhost:4100/github/app/installed"]);

  const setup = await app.inject({ method: "GET", url: "/github/app/setup" });
  assert.match(setup.body, /GitHub will not create a manifest-based App from localhost URLs/);
  assert.match(setup.body, /pnpm run tunnel:tailscale/);
  assert.match(setup.body, /cloudflared tunnel --url http:\/\/localhost:4100/);
  assert.doesNotMatch(setup.body, /https:\/\/github\.com\/settings\/apps\/new/);

  await app.close();
});

test("GitHub App setup posts to GitHub when the API URL is public", async () => {
  const app = await buildApp({ config, store: new MemoryStore() });
  const response = await app.inject({ method: "GET", url: "/github/app/setup" });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /https:\/\/github\.com\/settings\/apps\/new/);
  assert.match(response.body, /http:\/\/api\.test\/github\/webhook/);

  await app.close();
});

test("GitHub App manifest omits local setup URL when API uses a public tunnel", async () => {
  const tunnelConfig: ApiConfig = {
    ...config,
    controlCenterUrl: "http://localhost:5173",
    publicBaseUrl: "https://off.example.com",
  };
  const app = await buildApp({ config: tunnelConfig, store: new MemoryStore() });
  const response = await app.inject({ method: "GET", url: "/github/app/manifest" });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.hook_attributes.active, true);
  assert.equal(body.hook_attributes.url, "https://off.example.com/github/webhook");
  assert.deepEqual(body.default_events, ["issues", "pull_request", "push"]);
  assert.equal("setup_url" in body, false);

  await app.close();
});

test("API exposes GitHub App setup form for manifest registration", async () => {
  const app = await buildApp({ config, store: new MemoryStore() });
  const response = await app.inject({ method: "GET", url: "/github/app/setup" });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] as string, /text\/html/);
  assert.match(response.body, /https:\/\/github\.com\/settings\/apps\/new/);
  assert.match(response.body, /name="manifest"/);
  assert.match(response.body, /Open Feedback Factory/);

  await app.close();
});

test("GitHub App installed callback returns a human setup page by default", async () => {
  const app = await buildApp({ config, store: new MemoryStore() });
  const response = await app.inject({
    method: "GET",
    url: "/github/app/installed?code=temp-code&installation_id=123&setup_action=install&state=open-feedback-factory",
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] as string, /text\/html/);
  assert.match(response.body, /GitHub App Returned/);
  assert.match(response.body, /Generate env values/);
  assert.match(response.body, /temp-code/);
  assert.match(response.body, /curl -s -X POST http:\/\/api\.test\/github\/app\/manifest\/conversions/);
  assert.match(response.body, /http:\/\/control\.test/);

  await app.close();
});

test("GitHub App installed callback keeps JSON mode for automation", async () => {
  const app = await buildApp({ config, store: new MemoryStore() });
  const response = await app.inject({
    headers: { accept: "application/json" },
    method: "GET",
    url: "/github/app/installed?code=temp-code&installation_id=123&setup_action=install&state=open-feedback-factory",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().code, "temp-code");
  assert.equal(response.json().installationId, "123");
  assert.equal(response.json().setupAction, "install");

  await app.close();
});

test("GitHub App conversion env snippet is Docker-ready", () => {
  const snippet = buildGithubAppEnvSnippet({
    id: 12345,
    pem: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
    webhook_secret: "secret-value",
  });

  assert.match(snippet, /GITHUB_MODE=app/);
  assert.match(snippet, /GITHUB_APP_ID=12345/);
  assert.match(snippet, /GITHUB_APP_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----/);
  assert.match(snippet, /GITHUB_WEBHOOK_SECRET=secret-value/);
});

test("webhook reachability rejects local and private URLs", () => {
  assert.equal(githubWebhooksEnabledForBaseUrl("http://localhost:4100"), false);
  assert.equal(githubWebhooksEnabledForBaseUrl("http://127.0.0.1:4100"), false);
  assert.equal(githubWebhooksEnabledForBaseUrl("http://192.168.1.40:4100"), false);
  assert.equal(githubWebhooksEnabledForBaseUrl("https://off.example.com"), true);
});

test("sanitized GitHub issue body excludes raw feedback", () => {
  const issue = buildSanitizedGithubIssueInput({
    category: "copy",
    clusterKey: "safe.copy.save-label",
    riskTier: "safe_auto_merge",
    summary: "Please change the save button label to Done. Contact: [redacted email].",
    title: "Improve product copy",
    workItemId: "work_123",
  });

  assert.match(issue.body, /Please change the save button label to Done/);
  assert.match(issue.body, /Work item: work_123/);
  assert.match(issue.body, /Raw user feedback stays in the Open Feedback Factory database/);
  assert.doesNotMatch(issue.body, /joe@example\.com|sk-live|raw transcript/i);
});

test("GitHub webhook verifies signature and records PR artifact", async () => {
  const store = new MemoryStore();
  store.workItems.push({
    autoMergeEligible: false,
    category: "copy",
    clusterKey: "safe.copy",
    costEstimate: { amountUsd: 1.5, confidence: "low", currency: "USD", model: "gpt-5.5", reason: "test" },
    createdAt: new Date().toISOString(),
    githubIssueUrl: null,
    githubPrUrl: null,
    id: "work_123",
    latestActualCost: null,
    latestBranchName: null,
    riskTier: "safe_auto_merge",
    shouldCreateIssue: true,
    status: "implemented",
    summary: "Please improve the save label",
    title: "Improve product copy",
    updatedAt: new Date().toISOString(),
    userStatus: "implemented",
    unresolvedAssumptions: [],
  });

  const app = await buildApp({ config, store });
  const payload = JSON.stringify({
    action: "opened",
    pull_request: {
      body: "Work item: work_123",
      html_url: "https://github.com/joewilsonai/open-feedback-factory/pull/99",
      number: 99,
      state: "open",
      title: "Improve product copy",
    },
  });

  const bad = await app.inject({
    headers: {
      "content-type": "application/json",
      "x-github-event": "pull_request",
      "x-hub-signature-256": "sha256=bad",
    },
    method: "POST",
    payload,
    url: "/github/webhook",
  });
  assert.equal(bad.statusCode, 401);

  const response = await app.inject({
    headers: {
      "content-type": "application/json",
      "x-github-delivery": "delivery-1",
      "x-github-event": "pull_request",
      "x-hub-signature-256": sign(payload, config.githubWebhookSecret),
    },
    method: "POST",
    payload,
    url: "/github/webhook",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().workItemId, "work_123");
  assert.equal(store.workItems[0]?.githubPrUrl, "https://github.com/joewilsonai/open-feedback-factory/pull/99");
  assert.equal(store.githubArtifacts.size, 1);

  const duplicate = await app.inject({
    headers: {
      "content-type": "application/json",
      "x-github-delivery": "delivery-1",
      "x-github-event": "pull_request",
      "x-hub-signature-256": sign(payload, config.githubWebhookSecret),
    },
    method: "POST",
    payload,
    url: "/github/webhook",
  });

  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.json().duplicate, true);
  assert.equal(store.githubArtifacts.size, 1);

  await app.close();
});

test("runner waits for a target work item while approval mode is manual", async () => {
  const store = new MemoryStore();
  const app = await buildApp({ config, store });

  await app.inject({
    method: "POST",
    payload: {
      message: "Please add dark mode to settings",
      source: "demo",
    },
    url: "/sdk/feedback",
  });

  const claim = await app.inject({
    method: "POST",
    payload: { workerName: "worker-test" },
    url: "/runner/jobs/claim",
  });
  assert.equal(claim.statusCode, 200);
  assert.equal(claim.json().job, null);
  assert.equal(claim.json().reason, "manual_approval_required");
  assert.equal(store.workItems[0]?.status, "planned");

  await app.close();
});

test("runner claims planned work in auto approval mode and completes it with actual cost", async () => {
  const store = new MemoryStore();
  store.approvalMode = "auto";
  const app = await buildApp({ config, store });

  const feedback = await app.inject({
    method: "POST",
    payload: {
      message: "Please add dark mode to settings",
      source: "demo",
    },
    url: "/sdk/feedback",
  });
  const workItemId = feedback.json().workItemId;

  const claim = await app.inject({
    method: "POST",
    payload: { workerName: "worker-test" },
    url: "/runner/jobs/claim",
  });
  assert.equal(claim.statusCode, 200);
  assert.equal(claim.json().job.id, workItemId);
  assert.equal(claim.json().job.status, "in_progress");

  const complete = await app.inject({
    method: "POST",
    payload: {
      agentName: "worker-test",
      costActual: { amountUsd: 1.25, confidence: "low", model: "gpt-5.5" },
      status: "succeeded",
      summary: "Implemented by worker.",
    },
    url: `/runner/jobs/${workItemId}/complete`,
  });
  assert.equal(complete.statusCode, 200);
  assert.equal(complete.json().runId, "run_1");
  assert.equal(store.workItems[0]?.status, "implemented");
  assert.equal(store.workItems[0]?.latestActualCost?.amountUsd, 1.25);

  await app.close();
});

test("release marker requires implemented work and updates user status after implementation", async () => {
  const store = new MemoryStore();
  store.approvalMode = "auto";
  const app = await buildApp({ config, store });

  const feedback = await app.inject({
    method: "POST",
    payload: {
      message: "Please add search so I can find older notes",
      source: "demo",
    },
    url: "/sdk/feedback",
  });
  const feedbackId = feedback.json().feedbackId;
  const workItemId = feedback.json().workItemId;

  const earlyRelease = await app.inject({
    method: "POST",
    payload: { message: "This request has shipped." },
    url: `/admin/work-items/${workItemId}/release`,
  });
  assert.equal(earlyRelease.statusCode, 409);
  assert.equal(earlyRelease.json().error, "release marker requires implemented work");

  await app.inject({
    method: "POST",
    payload: {
      agentName: "worker-test",
      costActual: { amountUsd: 0.75, confidence: "high", model: "gpt-5.5" },
      status: "succeeded",
      summary: "Implemented by worker.",
    },
    url: `/runner/jobs/${workItemId}/complete`,
  });

  const release = await app.inject({
    method: "POST",
    payload: { message: "Note search has shipped." },
    url: `/admin/work-items/${workItemId}/release`,
  });
  assert.equal(release.statusCode, 202);

  const status = await app.inject({ method: "GET", url: `/sdk/feedback/${feedbackId}/status` });
  assert.equal(status.json().state, "shipped");
  assert.equal(status.json().message, "Note search has shipped.");

  await app.close();
});

test("reconciliation requeues stale in-progress work and reports release gaps", async () => {
  const store = new MemoryStore();
  store.workItems.push({
    autoMergeEligible: false,
    category: "feature_request",
    clusterKey: "feature.daybook.search",
    costEstimate: { amountUsd: 1.5, confidence: "low", currency: "USD", model: "gpt-5.5", reason: "test" },
    createdAt: new Date(Date.now() - 120 * 60_000).toISOString(),
    githubIssueUrl: null,
    githubPrUrl: null,
    id: "work_stale",
    latestActualCost: null,
    latestBranchName: null,
    riskTier: "safe_auto_merge",
    shouldCreateIssue: true,
    status: "in_progress",
    summary: "Please add note search",
    title: "Add note search",
    updatedAt: new Date(Date.now() - 120 * 60_000).toISOString(),
    unresolvedAssumptions: [],
    userStatus: "in_progress",
  });
  store.workItems.push({
    autoMergeEligible: false,
    category: "copy",
    clusterKey: "copy.save",
    costEstimate: { amountUsd: 0.5, confidence: "low", currency: "USD", model: "gpt-5.5", reason: "test" },
    createdAt: new Date().toISOString(),
    githubIssueUrl: null,
    githubPrUrl: "https://github.com/joewilsonai/open-feedback-factory/pull/77",
    id: "work_waiting_release",
    latestActualCost: { amountUsd: 0.25, confidence: "high", model: "gpt-5.5" },
    latestBranchName: "off/codex/work_waiting_release",
    riskTier: "safe_auto_merge",
    shouldCreateIssue: true,
    status: "implemented",
    summary: "Improve save copy",
    title: "Improve product copy",
    updatedAt: new Date().toISOString(),
    unresolvedAssumptions: [],
    userStatus: "implemented",
  });
  const app = await buildApp({ config, store });

  const response = await app.inject({
    method: "POST",
    payload: { staleAfterMinutes: 30 },
    url: "/admin/reconciliation/run",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().result.staleInProgressRequeuedIds, ["work_stale"]);
  assert.deepEqual(response.json().result.implementedAwaitingReleaseIds, ["work_waiting_release"]);
  assert.equal(store.workItems[0]?.status, "planned");

  await app.close();
});

test("auto merge blocks when an agent left unresolved assumptions", async () => {
  const store = new MemoryStore();
  store.approvalMode = "auto";
  const app = await buildApp({
    config: { ...config, autoMergeEnabled: true, githubMode: "gh" },
    store,
  });

  const feedback = await app.inject({
    method: "POST",
    payload: {
      message: "Please add a calmer button label",
      source: "demo",
    },
    url: "/sdk/feedback",
  });
  const workItemId = feedback.json().workItemId;

  await store.recordGithubArtifact({
    artifactType: "pull_request",
    url: "https://github.com/joewilsonai/open-feedback-factory/pull/42",
    workItemId,
  });

  const completion = await app.inject({
    method: "POST",
    payload: {
      agentName: "worker-test",
      assumptions: [
        {
          alternativesSkipped: [],
          assumptions: ["Release health was inferred from local checks only."],
          checksRun: ["pnpm test"],
          checksSkipped: ["Live release health check was not available."],
          confidence: "low",
          defaultsUsed: ["model=gpt-5.5"],
          humanQuestions: [],
          impactAreas: ["release_status"],
          notes: "Needs a release-health confirmation before merge.",
          unresolved: true,
        },
      ],
      costActual: { amountUsd: 1.25, confidence: "low", model: "gpt-5.5" },
      status: "succeeded",
      summary: "Implemented by worker.",
    },
    url: `/runner/jobs/${workItemId}/complete`,
  });
  assert.equal(completion.statusCode, 200);

  const merge = await app.inject({
    method: "POST",
    payload: {
      branchTrusted: true,
      changedFiles: ["apps/demo-app/src/App.tsx"],
      checksPassed: true,
      costActualUsd: 1.25,
      diffLineCount: 12,
      redactionWarnings: 0,
      releaseHealthy: true,
      reviewerApproved: true,
    },
    url: `/admin/work-items/${workItemId}/automerge`,
  });

  assert.equal(merge.statusCode, 409);
  assert.deepEqual(merge.json().evaluation.reasons, ["unresolved_assumption_blocks_automerge"]);

  await app.close();
});

function sign(payload: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

test("safe auto-merge endpoint is blocked by default guardrails", async () => {
  const store = new MemoryStore();
  const app = await buildApp({ config, store });

  const feedback = await app.inject({
    method: "POST",
    payload: {
      message: "Please add dark mode to settings",
      source: "demo",
    },
    url: "/sdk/feedback",
  });
  const workItemId = feedback.json().workItemId;

  const response = await app.inject({
    method: "POST",
    payload: {
      branchTrusted: true,
      changedFiles: ["apps/demo-app/src/styles.css"],
      checksPassed: true,
      costActualUsd: 1.25,
      diffLineCount: 40,
      redactionWarnings: 0,
      releaseHealthy: true,
      reviewerApproved: true,
    },
    url: `/admin/work-items/${workItemId}/automerge`,
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().evaluation.reasons.includes("auto_merge_disabled"), true);
  assert.equal(response.json().evaluation.reasons.includes("missing_pr_url"), true);

  await app.close();
});
