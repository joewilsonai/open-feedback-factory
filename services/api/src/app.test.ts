import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import type { UserFeedbackStatus } from "@open-feedback-factory/core";
import type { ControlRoomSnapshot, WorkItemRow } from "@open-feedback-factory/db";
import { buildApp, type AppStore } from "./app.js";
import type { ApiConfig } from "./config.js";
import { buildGithubAppEnvSnippet, githubWebhooksEnabledForBaseUrl } from "./routes/github.js";
import { buildSanitizedGithubIssueInput } from "./routes/sdk.js";

const config: ApiConfig = {
  apiHost: "127.0.0.1",
  apiPort: 4100,
  autoMergeEnabled: false,
  codexRunnerMode: "demo",
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
  feedbackStatuses = new Map<string, UserFeedbackStatus>();
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
        riskTier: input.decision.riskTier,
        shouldCreateIssue: input.decision.shouldCreateIssue,
        status: "planned",
        summary: input.sanitized.sanitizedMessage,
        title: input.decision.title,
        updatedAt: new Date().toISOString(),
        userStatus: input.decision.userStatus,
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
      recentFeedback: [],
      recentUsage: [],
      workItems: this.workItems,
    };
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
      item.userStatus = input.status === "succeeded" ? "in_progress" : "blocked";
    }
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

  async markWorkItemReleased() {}

  async recordAgentRun() {
    return "run_1";
  }

  async recordFeatureUsage() {
    this.usageCount += 1;
    return `usage_${this.usageCount}`;
  }

  async recordGithubArtifact(input: Parameters<AppStore["recordGithubArtifact"]>[0]) {
    const item = this.workItems.find((workItem) => workItem.id === input.workItemId);
    if (item && input.artifactType === "issue") item.githubIssueUrl = input.url;
    if (item && input.artifactType === "pull_request") item.githubPrUrl = input.url;
    return "gh_1";
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

test("doctor exposes setup wizard links", async () => {
  const app = await buildApp({ config, store: new MemoryStore() });
  const response = await app.inject({ method: "GET", url: "/doctor" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().controlCenterUrl, "http://control.test");
  assert.equal(response.json().githubAppSetupUrl, "http://api.test/github/app/setup");
  assert.equal(response.json().githubWebhookUrl, "http://api.test/github/webhook");
  assert.equal(response.json().githubWebhooksEnabled, true);

  await app.close();
});

test("API exposes GitHub App manifest seam", async () => {
  const app = await buildApp({ config, store: new MemoryStore() });
  const response = await app.inject({ method: "GET", url: "/github/app/manifest" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().default_permissions.pull_requests, "write");
  assert.deepEqual(response.json().default_events, ["check_suite", "issues", "pull_request", "push"]);
  assert.deepEqual(response.json().callback_urls, ["http://api.test/github/app/installed"]);
  assert.equal(response.json().hook_attributes.url, "http://api.test/github/webhook");
  assert.equal(response.json().setup_url, "http://control.test");
  assert.equal(response.json().url, "https://github.com/joewilsonai/open-feedback-factory");

  await app.close();
});

test("GitHub App manifest omits webhooks for localhost setup", async () => {
  const localConfig: ApiConfig = {
    ...config,
    controlCenterUrl: "http://localhost:5173",
    publicBaseUrl: "http://localhost:4100",
  };
  const app = await buildApp({ config: localConfig, store: new MemoryStore() });
  const response = await app.inject({ method: "GET", url: "/github/app/manifest" });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal("hook_attributes" in body, false);
  assert.equal("default_events" in body, false);
  assert.deepEqual(body.callback_urls, ["http://localhost:4100/github/app/installed"]);

  const setup = await app.inject({ method: "GET", url: "/github/app/setup" });
  assert.match(setup.body, /Local mode: GitHub cannot reach localhost webhooks/);
  assert.doesNotMatch(setup.body, /hook_attributes/);

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
    riskTier: "safe_auto_merge",
    shouldCreateIssue: true,
    status: "implemented",
    summary: "Please improve the save label",
    title: "Improve product copy",
    updatedAt: new Date().toISOString(),
    userStatus: "in_progress",
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

  await app.close();
});

test("runner claims planned work and completes it with actual cost", async () => {
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
