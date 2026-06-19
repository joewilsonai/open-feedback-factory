import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { AgentAssumptionRecord, UserFeedbackStatus } from "@open-feedback-factory/core";
import type {
  ControlRoomSnapshot,
  FeedbackClusterRow,
  MergeGuardrailPolicy,
  WorkItemDetail,
  WorkItemReviewDecision,
  WorkItemRow,
} from "@open-feedback-factory/db";
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
const sampleOnlyFeedbackSources = new Set(["demo_seed", "sample_seed"]);

class MemoryStore implements AppStore {
  approvalMode: ApiConfig["approvalMode"] | null = null;
  agentRuns: WorkItemDetail["agentRuns"] = [];
  auditEvents: WorkItemDetail["auditEvents"] = [];
  codexAuthMode: ApiConfig["codexAuthMode"] | null = null;
  costRecords: WorkItemDetail["costRecords"] = [];
  deliveries = new Set<string>();
  feedbackClusters = new Map<string, FeedbackClusterRow>();
  feedbackStatuses = new Map<string, UserFeedbackStatus>();
  githubArtifacts = new Map<string, string>();
  githubArtifactRows: WorkItemDetail["githubArtifacts"] = [];
  maxFeatureCostUsd: number | null = null;
  mergeGuardrails: MergeGuardrailPolicy | null = null;
  recentAssumptions: AgentAssumptionRecord[] = [];
  releaseEvents: WorkItemDetail["releaseEvents"] = [];
  userNotifications: WorkItemDetail["userNotifications"] = [];
  usageEvents: Array<{ action: string; featureId: string; metadata: Record<string, unknown>; userId?: string }> = [];
  usageCount = 0;
  workItems: WorkItemRow[] = [];

  async createFeedbackIntake(input: Parameters<AppStore["createFeedbackIntake"]>[0]) {
    const feedbackId = `feedback_${this.feedbackStatuses.size + 1}`;
    const workItemId = input.decision.shouldCreateIssue ? `work_${this.workItems.length + 1}` : null;
    const status: UserFeedbackStatus = {
      clarificationQuestions: input.decision.clarificationQuestions,
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
        signalSources: [input.feedback.source],
        status: "planned",
        summary: input.sanitized.sanitizedMessage,
        title: input.decision.title,
        updatedAt: new Date().toISOString(),
        userStatus: input.decision.userStatus,
        unresolvedAssumptions: [],
      });
      this.costRecords.unshift({
        amountUsd: input.decision.costEstimate.amountUsd,
        confidence: input.decision.costEstimate.confidence,
        createdAt: new Date().toISOString(),
        id: `cost_${this.costRecords.length + 1}`,
        metadata: { reason: input.decision.costEstimate.reason },
        model: input.decision.costEstimate.model,
        phase: "estimate",
        workItemId,
      });
    }

    const existingCluster = this.feedbackClusters.get(input.decision.clusterKey);
    this.feedbackClusters.set(input.decision.clusterKey, {
      activeWorkItemId: workItemId ?? existingCluster?.activeWorkItemId ?? null,
      activeWorkItemStatus: workItemId ? "planned" : (existingCluster?.activeWorkItemStatus ?? null),
      category: input.decision.category,
      clusterKey: input.decision.clusterKey,
      latestSignalAt: new Date().toISOString(),
      latestStatus: status.state,
      latestUserMessage: status.message,
      signalCount: (existingCluster?.signalCount ?? 0) + 1,
      title: input.decision.title,
      updatedAt: new Date().toISOString(),
    });

    this.userNotifications.unshift({
      clarificationQuestions: input.decision.clarificationQuestions,
      createdAt: new Date().toISOString(),
      feedbackId,
      id: `note_${this.userNotifications.length + 1}`,
      message: status.message,
      status: status.state,
      workItemId,
    });
    this.auditEvents.unshift({
      actor: "system",
      createdAt: new Date().toISOString(),
      event: "feedback_intake_created",
      id: `audit_${this.auditEvents.length + 1}`,
      metadata: { action: input.decision.action, clusterKey: input.decision.clusterKey, workItemId },
      targetId: feedbackId,
      targetType: "feedback_signal",
    });

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
      feedbackClusters: Array.from(this.feedbackClusters.values()),
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

  async getMaxFeatureCostUsd(defaultCap: number) {
    return this.maxFeatureCostUsd ?? defaultCap;
  }

  async setMaxFeatureCostUsd(amountUsd: number) {
    this.maxFeatureCostUsd = Math.round(amountUsd * 100) / 100;
  }

  async getMergeGuardrailPolicy(defaultPolicy: MergeGuardrailPolicy) {
    return this.mergeGuardrails ?? defaultPolicy;
  }

  async setMergeGuardrailPolicy(policy: MergeGuardrailPolicy) {
    this.mergeGuardrails = {
      autoMergePolicyEnabled: policy.autoMergePolicyEnabled,
      maxSafeDiffLines: Math.max(1, Math.floor(policy.maxSafeDiffLines)),
      protectedPathFragments: policy.protectedPathFragments,
    };
    return this.mergeGuardrails;
  }

  async getFeedbackClusterSignalCount(clusterKey: string) {
    return this.feedbackClusters.get(clusterKey)?.signalCount ?? 0;
  }

  async claimNextWorkItem(_workerName?: string, workItemId?: string, maxFeatureCostUsd?: number) {
    const item = this.workItems.find(
      (workItem) =>
        workItem.status === "planned" &&
        (!workItemId || workItem.id === workItemId) &&
        workItem.signalSources.some((source) => !sampleOnlyFeedbackSources.has(source)) &&
        (maxFeatureCostUsd === undefined || workItem.costEstimate.amountUsd <= maxFeatureCostUsd),
    );
    if (!item) return null;
    item.status = "in_progress";
    item.userStatus = "in_progress";
    return item;
  }

  async completeWorkItemRun(input: Parameters<AppStore["completeWorkItemRun"]>[0]) {
    const runId = `run_${this.agentRuns.length + 1}`;
    const item = this.workItems.find((workItem) => workItem.id === input.workItemId);
    if (item) {
      item.status = input.status === "succeeded" ? "implemented" : input.status;
      item.userStatus = input.status === "succeeded" ? "implemented" : "blocked";
      item.latestActualCost = input.costActual ?? null;
      item.latestBranchName = typeof input.metadata?.branchName === "string" ? input.metadata.branchName : item.latestBranchName;
      item.unresolvedAssumptions = (input.assumptions ?? []).filter((assumption) => assumption.unresolved);
    }
    this.agentRuns.unshift({
      agentName: input.agentName,
      completedAt: new Date().toISOString(),
      costActual: input.costActual ?? null,
      createdAt: new Date().toISOString(),
      id: runId,
      metadata: input.metadata ?? {},
      runType: input.runType,
      status: input.status,
      summary: input.summary,
      workItemId: input.workItemId,
    });
    if (input.costActual && typeof input.costActual.amountUsd === "number" && typeof input.costActual.model === "string") {
      this.costRecords.unshift({
        amountUsd: input.costActual.amountUsd,
        confidence: typeof input.costActual.confidence === "string" ? input.costActual.confidence : "low",
        createdAt: new Date().toISOString(),
        id: `cost_${this.costRecords.length + 1}`,
        metadata: { agentRunId: runId },
        model: input.costActual.model,
        phase: "actual",
        workItemId: input.workItemId,
      });
    }
    if (typeof input.metadata?.githubPrUrl === "string") {
      this.githubArtifactRows.unshift({
        artifactNumber: null,
        artifactType: "pull_request",
        createdAt: new Date().toISOString(),
        id: `gh_${this.githubArtifactRows.length + 1}`,
        metadata: { agentRunId: runId, source: "runner_completion" },
        url: input.metadata.githubPrUrl,
        workItemId: input.workItemId,
      });
    }
    this.recentAssumptions.unshift(...(input.assumptions ?? []));
    return runId;
  }

  async getUserFeedbackStatus(feedbackId: string) {
    return this.feedbackStatuses.get(feedbackId) ?? null;
  }

  async getWorkItem(id: string) {
    return this.workItems.find((item) => item.id === id) ?? null;
  }

  async getWorkItemDetail(id: string) {
    const workItem = await this.getWorkItem(id);
    if (!workItem) return null;
    return {
      agentRuns: this.agentRuns.filter((row) => row.workItemId === id),
      assumptions: this.recentAssumptions.map((assumption, index) => ({
        ...assumption,
        agentRunId: this.agentRuns.find((row) => row.workItemId === id)?.id ?? null,
        createdAt: new Date().toISOString(),
        id: `assumption_${index + 1}`,
        workItemId: id,
      })),
      auditEvents: this.auditEvents.filter((row) => row.targetId === id || row.metadata.workItemId === id),
      costRecords: this.costRecords.filter((row) => row.workItemId === id),
      githubArtifacts: this.githubArtifactRows.filter((row) => row.workItemId === id),
      releaseEvents: this.releaseEvents.filter((row) => row.workItemId === id),
      usageAttribution: this.usageAttributionForWorkItem(id),
      userNotifications: this.userNotifications.filter((row) => row.workItemId === id),
      workItem,
    };
  }

  async listWorkItems() {
    return this.workItems;
  }

  async markWorkItemReleased(workItemId: string, message = "This request has shipped.", featureId?: string) {
    const item = this.workItems.find((workItem) => workItem.id === workItemId);
    if (item) {
      item.status = "shipped";
      item.userStatus = "shipped";
      item.updatedAt = new Date().toISOString();
    }
    this.releaseEvents.unshift({
      createdAt: new Date().toISOString(),
      id: `release_${this.releaseEvents.length + 1}`,
      metadata: featureId ? { featureId } : {},
      status: "shipped",
      workItemId,
    });
    for (const [feedbackId] of this.feedbackStatuses) {
      this.feedbackStatuses.set(feedbackId, {
        clarificationQuestions: [],
        feedbackId,
        label: "Shipped",
        message,
        state: "shipped",
        timeline: [],
      });
      this.userNotifications.unshift({
        clarificationQuestions: [],
        createdAt: new Date().toISOString(),
        feedbackId,
        id: `note_${this.userNotifications.length + 1}`,
        message,
        status: "shipped",
        workItemId,
      });
    }
  }

  async markWorkItemDecision(input: Parameters<AppStore["markWorkItemDecision"]>[0]) {
    const item = this.workItems.find((workItem) => workItem.id === input.workItemId);
    if (item) {
      item.status = input.status;
      item.userStatus = input.status;
      item.updatedAt = new Date().toISOString();
      const cluster = this.feedbackClusters.get(item.clusterKey);
      if (cluster) {
        cluster.activeWorkItemStatus = input.status;
        cluster.latestStatus = input.status;
        cluster.latestUserMessage = input.message;
        cluster.updatedAt = new Date().toISOString();
      }
    }
    for (const [feedbackId, current] of this.feedbackStatuses) {
      this.feedbackStatuses.set(feedbackId, {
        ...current,
        clarificationQuestions: [],
        label: input.status === "not_planned" ? "Not planned" : "Blocked",
        message: input.message,
        state: input.status,
      });
      this.userNotifications.unshift({
        clarificationQuestions: [],
        createdAt: new Date().toISOString(),
        feedbackId,
        id: `note_${this.userNotifications.length + 1}`,
        message: input.message,
        status: input.status,
        workItemId: input.workItemId,
      });
    }
    this.auditEvents.unshift({
      actor: input.actor ?? "operator",
      createdAt: new Date().toISOString(),
      event: "work_item_decision_recorded",
      id: `audit_${this.auditEvents.length + 1}`,
      metadata: {
        decisionCategory: input.decisionCategory ?? input.status,
        message: input.message,
        status: input.status,
      },
      targetId: input.workItemId,
      targetType: "work_item",
    });
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
    const runId = `run_${this.agentRuns.length + 1}`;
    if (input?.assumptions?.length) {
      const item = this.workItems.find((workItem) => workItem.id === input.workItemId);
      if (item) item.unresolvedAssumptions = input.assumptions.filter((assumption) => assumption.unresolved);
      this.recentAssumptions.unshift(...input.assumptions);
    }
    if (input) {
      this.agentRuns.unshift({
        agentName: input.agentName,
        completedAt: input.status === "succeeded" || input.status === "failed" || input.status === "blocked" ? new Date().toISOString() : null,
        costActual: input.costActual ?? null,
        createdAt: new Date().toISOString(),
        id: runId,
        metadata: input.metadata ?? {},
        runType: input.runType,
        status: input.status,
        summary: input.summary,
        workItemId: input.workItemId,
      });
    }
    return runId;
  }

  async recordFeatureUsage(input?: Parameters<AppStore["recordFeatureUsage"]>[0]) {
    this.usageCount += 1;
    if (input) {
      const attributedWorkItemId =
        stringValue(input.metadata?.workItemId) ??
        stringValue(input.metadata?.attributedWorkItemId) ??
        this.releaseEvents.find((event) => event.metadata.featureId === input.featureId)?.workItemId ??
        null;
      this.usageEvents.unshift({
        action: input.action,
        featureId: input.featureId,
        metadata: {
          ...(input.metadata ?? {}),
          ...(attributedWorkItemId
            ? {
                attributedWorkItemId,
                attributionSource: stringValue(input.metadata?.workItemId) ? "sdk_metadata" : "release_feature_id",
              }
            : {}),
        },
        userId: input.userId,
      });
    }
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
    this.githubArtifactRows.unshift({
      artifactNumber: input.artifactNumber ?? null,
      artifactType: input.artifactType,
      createdAt: new Date().toISOString(),
      id,
      metadata: input.metadata ?? {},
      url: input.url,
      workItemId: input.workItemId,
    });
    return id;
  }

  async recordGithubWebhookDelivery(input: Parameters<AppStore["recordGithubWebhookDelivery"]>[0]) {
    if (!input.deliveryId) return true;
    if (this.deliveries.has(input.deliveryId)) return false;
    this.deliveries.add(input.deliveryId);
    return true;
  }

  async recordWorkItemReview(input: Parameters<AppStore["recordWorkItemReview"]>[0]) {
    const decision: WorkItemReviewDecision = {
      actor: input.actor ?? "operator",
      approved: input.approved,
      createdAt: new Date().toISOString(),
      id: `audit_${this.auditEvents.length + 1}`,
      reviewType: input.reviewType ?? "human",
      summary: input.summary,
    };
    const item = this.workItems.find((workItem) => workItem.id === input.workItemId);
    if (item) item.reviewDecision = decision;
    this.auditEvents.unshift({
      actor: decision.actor,
      createdAt: decision.createdAt,
      event: "work_item_review_recorded",
      id: decision.id,
      metadata: {
        approved: decision.approved,
        reviewType: decision.reviewType,
        summary: decision.summary,
      },
      targetId: input.workItemId,
      targetType: "work_item",
    });
    return decision;
  }

  async getWorkItemReviewDecision(workItemId: string) {
    return this.workItems.find((workItem) => workItem.id === workItemId)?.reviewDecision ?? null;
  }

  private usageAttributionForWorkItem(workItemId: string): WorkItemDetail["usageAttribution"] {
    const releaseFeatureIds = new Set(
      this.releaseEvents
        .filter((event) => event.workItemId === workItemId)
        .map((event) => stringValue(event.metadata.featureId))
        .filter((value): value is string => Boolean(value)),
    );
    const matching = this.usageEvents.filter(
      (event) =>
        stringValue(event.metadata.attributedWorkItemId) === workItemId ||
        stringValue(event.metadata.workItemId) === workItemId ||
        releaseFeatureIds.has(event.featureId),
    );
    const byFeature = new Map<string, typeof matching>();
    for (const event of matching) byFeature.set(event.featureId, [...(byFeature.get(event.featureId) ?? []), event]);
    return Array.from(byFeature.entries()).map(([featureId, events]) => ({
      eventCount: events.length,
      featureId,
      latestUsageAt: new Date().toISOString(),
      requesterCount: this.feedbackStatuses.size,
      uniqueUsers: new Set(events.map((event) => event.userId).filter(Boolean)).size,
      workItemId,
    }));
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
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

test("API masks missing storage schema errors on public SDK feedback", async () => {
  const store = new MemoryStore();
  store.createFeedbackIntake = async () => {
    const error = new Error('relation "feedback_clusters" does not exist') as Error & { code: string };
    error.code = "42P01";
    throw error;
  };
  const app = await buildApp({ config, store });

  const response = await app.inject({
    method: "POST",
    payload: {
      message: "Please add reminders",
      source: "daybook_demo_app",
    },
    url: "/sdk/feedback",
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().code, "storage_not_ready");
  assert.equal(response.json().retryable, true);
  assert.doesNotMatch(response.body, /feedback_clusters|relation|postgres/i);

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
        message: `Please add note search for saved notes ${index}`,
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
      message: "Please add note search for saved notes again",
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

test("API rate limits privileged admin runner and GitHub route groups", async () => {
  const store = new MemoryStore();
  store.approvalMode = "auto";
  const app = await buildApp({
    config: {
      ...config,
      adminRateLimitMax: 1,
      githubRateLimitMax: 1,
      rateLimitWindowMs: 60_000,
      runnerRateLimitMax: 1,
    },
    store,
  });

  const adminAllowed = await app.inject({ method: "GET", url: "/admin/control-room" });
  assert.equal(adminAllowed.statusCode, 200);
  const adminLimited = await app.inject({ method: "GET", url: "/admin/control-room" });
  assert.equal(adminLimited.statusCode, 429);
  assert.equal(adminLimited.json().error, "rate_limited");
  assert.equal(adminLimited.headers["retry-after"], "60");

  const runnerAllowed = await app.inject({
    method: "POST",
    payload: { workerName: "worker-rate-test" },
    url: "/runner/jobs/claim",
  });
  assert.equal(runnerAllowed.statusCode, 200);
  const runnerLimited = await app.inject({
    method: "POST",
    payload: { workerName: "worker-rate-test" },
    url: "/runner/jobs/claim",
  });
  assert.equal(runnerLimited.statusCode, 429);

  const githubAllowed = await app.inject({ method: "GET", url: "/github/app/manifest" });
  assert.equal(githubAllowed.statusCode, 200);
  const githubLimited = await app.inject({ method: "GET", url: "/github/app/manifest" });
  assert.equal(githubLimited.statusCode, 429);

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

test("API promotes repeated below-threshold feedback from demand memory", async () => {
  const store = new MemoryStore();
  const app = await buildApp({ config, store });

  const first = await app.inject({
    method: "POST",
    payload: {
      message: "Add dashboard focus meter",
      source: "demo",
      userId: "user-demand-1",
    },
    url: "/sdk/feedback",
  });

  assert.equal(first.statusCode, 201);
  assert.equal(first.json().workItemId, null);
  assert.equal(first.json().status.state, "needs_more_signal");

  const second = await app.inject({
    method: "POST",
    payload: {
      message: "Add dashboard focus meter",
      source: "demo",
      userId: "user-demand-2",
    },
    url: "/sdk/feedback",
  });

  assert.equal(second.statusCode, 201);
  assert.match(second.json().workItemId, /^work_/);
  assert.equal(second.json().status.state, "planned");
  assert.equal(store.workItems[0]?.riskTier, "guarded_review");

  const controlRoom = await app.inject({ method: "GET", url: "/admin/control-room" });
  const cluster = controlRoom
    .json()
    .feedbackClusters.find(
      (row: { clusterKey: string }) => row.clusterKey === "feedback.add-dashboard-focus-meter",
    );
  assert.equal(cluster.signalCount, 2);
  assert.equal(cluster.activeWorkItemId, second.json().workItemId);
  assert.equal(cluster.latestStatus, "planned");

  await app.close();
});

test("API returns friendly clarification questions for vague feedback", async () => {
  const app = await buildApp({ config, store: new MemoryStore() });

  const response = await app.inject({
    method: "POST",
    payload: {
      message: "Make this better",
      metadata: {
        appName: "Daybook",
        productSummary: "Daybook is a notes and todos app.",
        surface: "notepad-todo",
      },
      source: "demo",
      userId: "user-clarify-1",
    },
    url: "/sdk/feedback",
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().workItemId, null);
  assert.equal(response.json().status.state, "needs_clarification");
  assert.equal(response.json().status.clarificationQuestions.length, 2);
  assert.match(response.json().status.clarificationQuestions[0].question, /Daybook/);
  assert.doesNotMatch(JSON.stringify(response.json().status.clarificationQuestions), /acceptance criteria|repro steps|scope/i);

  const status = await app.inject({ method: "GET", url: `/sdk/feedback/${response.json().feedbackId}/status` });
  assert.equal(status.json().clarificationQuestions.length, 2);

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
  assert.equal(response.json().adminAuthRequired, false);
  assert.equal(response.json().controlCenterUrl, "http://control.test");
  assert.equal(response.json().approvalMode, "auto");
  assert.equal(response.json().codexAuthMode, "cli");
  assert.equal(response.json().codexApiKeyConfigured, false);
  assert.equal(response.json().githubAppSetupUrl, "http://api.test/github/app/setup");
  assert.equal(response.json().githubWebhookUrl, "http://api.test/github/webhook");
  assert.equal(response.json().githubWebhooksEnabled, true);
  assert.equal(response.json().autoMergePolicyEnabled, true);
  assert.equal(response.json().maxSafeDiffLines, 120);
  assert.deepEqual(response.json().protectedPathFragments, ["auth", "billing", "privacy"]);
  assert.equal(response.json().runnerAuthRequired, false);
  assert.equal(response.json().runnerInstall.recommendedMode, "host_cli");
  assert.equal(response.json().runnerInstall.hostCli.installCommand, "pnpm worker:install:host");
  assert.equal(response.json().runnerInstall.hostCli.statusCommand, "pnpm worker:status:host");
  assert.equal(response.json().runnerInstall.dockerApiKey.startCommand, "docker compose up -d --build worker");
  assert.deepEqual(response.json().runnerInstall.dockerApiKey.env, [
    "CODEX_RUNNER_MODE=codex",
    "CODEX_AUTH_MODE=api_key",
    "DOCKER_CODEX_CLI=codex",
    "CODEX_CLI_VERSION=0.141.0",
  ]);

  await app.close();
});

test("admin routes require the configured admin token without leaking it through doctor", async () => {
  const app = await buildApp({
    config: { ...config, adminToken: "admin-test-token" },
    store: new MemoryStore(),
  });

  const blocked = await app.inject({ method: "GET", url: "/admin/control-room" });
  assert.equal(blocked.statusCode, 401);
  assert.equal(blocked.json().error, "admin_auth_required");

  const bad = await app.inject({
    headers: { "x-off-admin-token": "wrong-token" },
    method: "GET",
    url: "/admin/control-room",
  });
  assert.equal(bad.statusCode, 401);

  const allowed = await app.inject({
    headers: { authorization: "Bearer admin-test-token" },
    method: "GET",
    url: "/admin/control-room",
  });
  assert.equal(allowed.statusCode, 200);

  const doctor = await app.inject({ method: "GET", url: "/doctor" });
  assert.equal(doctor.statusCode, 200);
  assert.equal(doctor.json().adminAuthRequired, true);
  assert.equal("adminToken" in doctor.json(), false);

  await app.close();
});

test("runner routes require the configured runner token", async () => {
  const store = new MemoryStore();
  store.approvalMode = "auto";
  const app = await buildApp({
    config: { ...config, runnerToken: "runner-test-token" },
    store,
  });

  await app.inject({
    method: "POST",
    payload: {
      message: "Please add search so I can find older notes",
      source: "demo",
    },
    url: "/sdk/feedback",
  });

  const blocked = await app.inject({
    method: "POST",
    payload: { workerName: "worker-test" },
    url: "/runner/jobs/claim",
  });
  assert.equal(blocked.statusCode, 401);
  assert.equal(blocked.json().error, "runner_auth_required");

  const claim = await app.inject({
    headers: { "x-off-runner-token": "runner-test-token" },
    method: "POST",
    payload: { workerName: "worker-test" },
    url: "/runner/jobs/claim",
  });
  assert.equal(claim.statusCode, 200);
  const workItemId = claim.json().job.id;

  const completeBlocked = await app.inject({
    method: "POST",
    payload: {
      agentName: "worker-test",
      status: "succeeded",
      summary: "Implemented by worker.",
    },
    url: `/runner/jobs/${workItemId}/complete`,
  });
  assert.equal(completeBlocked.statusCode, 401);

  const complete = await app.inject({
    headers: { authorization: "Bearer runner-test-token" },
    method: "POST",
    payload: {
      agentName: "worker-test",
      status: "succeeded",
      summary: "Implemented by worker.",
    },
    url: `/runner/jobs/${workItemId}/complete`,
  });
  assert.equal(complete.statusCode, 200);

  const doctor = await app.inject({ method: "GET", url: "/doctor" });
  assert.equal(doctor.json().runnerAuthRequired, true);
  assert.equal("runnerToken" in doctor.json(), false);

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

test("admin can set cost cap and runner claims respect it", async () => {
  const store = new MemoryStore();
  const app = await buildApp({ config, store });

  const updateCap = await app.inject({
    method: "PATCH",
    payload: { maxFeatureCostUsd: 1 },
    url: "/admin/settings/cost-cap",
  });
  assert.equal(updateCap.statusCode, 200);
  assert.equal(updateCap.json().maxFeatureCostUsd, 1);

  const doctor = await app.inject({ method: "GET", url: "/doctor" });
  assert.equal(doctor.json().maxFeatureCostUsd, 1);

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
    payload: { workerName: "worker-test", workItemId },
    url: "/runner/jobs/claim",
  });
  assert.equal(claim.statusCode, 200);
  assert.equal(claim.json().job, null);
  assert.equal(claim.json().reason, "cost_cap_exceeded");
  assert.equal(store.workItems[0]?.status, "planned");

  const manualRun = await app.inject({ method: "POST", url: `/admin/work-items/${workItemId}/run` });
  assert.equal(manualRun.statusCode, 409);
  assert.equal(manualRun.json().error, "cost cap exceeded");

  await app.close();
});

test("runner leaves sample seed work queued", async () => {
  const store = new MemoryStore();
  store.approvalMode = "auto";
  store.workItems.push({
    autoMergeEligible: false,
    category: "feature_request",
    clusterKey: "feature.sample.search",
    costEstimate: { amountUsd: 1.5, confidence: "low", currency: "USD", model: "gpt-5.5", reason: "test" },
    createdAt: new Date().toISOString(),
    githubIssueUrl: null,
    githubPrUrl: null,
    id: "work_sample",
    latestActualCost: null,
    latestBranchName: null,
    riskTier: "safe_auto_merge",
    shouldCreateIssue: true,
    signalSources: ["sample_seed"],
    status: "planned",
    summary: "Please add sample note search",
    title: "Add sample note search",
    updatedAt: new Date().toISOString(),
    unresolvedAssumptions: [],
    userStatus: "planned",
  });
  const app = await buildApp({ config, store });

  const claim = await app.inject({
    method: "POST",
    payload: { workerName: "worker-test" },
    url: "/runner/jobs/claim",
  });

  assert.equal(claim.statusCode, 200);
  assert.equal(claim.json().job, null);
  assert.equal(store.workItems[0]?.status, "planned");

  await app.close();
});

test("admin can configure merge guardrails and auto-merge reads them", async () => {
  const store = new MemoryStore();
  const app = await buildApp({
    config: { ...config, autoMergeEnabled: true },
    store,
  });

  const update = await app.inject({
    method: "PATCH",
    payload: {
      autoMergePolicyEnabled: true,
      maxSafeDiffLines: 10,
      protectedPathFragments: ["safe-blocked-path"],
    },
    url: "/admin/settings/merge-guardrails",
  });
  assert.equal(update.statusCode, 200);
  assert.equal(update.json().mergeGuardrails.maxSafeDiffLines, 10);

  const doctor = await app.inject({ method: "GET", url: "/doctor" });
  assert.equal(doctor.json().maxSafeDiffLines, 10);
  assert.deepEqual(doctor.json().protectedPathFragments, ["safe-blocked-path"]);

  const feedback = await app.inject({
    method: "POST",
    payload: {
      message: "Please add a calmer save button label",
      source: "demo",
    },
    url: "/sdk/feedback",
  });
  const workItemId = feedback.json().workItemId;
  await store.completeWorkItemRun({
    agentName: "codex-test",
    costActual: {
      amountUsd: 1.25,
      confidence: "high",
      model: "gpt-5.5",
    },
    metadata: {
      branchName: "off/codex/work_1",
      changedFiles: ["apps/demo-app/src/App.tsx"],
      diffLineCount: 12,
    },
    runType: "implementation",
    status: "succeeded",
    summary: "Implemented test work.",
    workItemId,
  });
  await store.recordGithubArtifact({
    artifactType: "pull_request",
    url: "https://github.com/joewilsonai/open-feedback-factory/pull/42",
    workItemId,
  });
  await store.recordWorkItemReview({
    approved: true,
    reviewType: "agent",
    summary: "Reviewed and approved.",
    workItemId,
  });

  const diffBlocked = await app.inject({
    method: "POST",
    payload: {
      branchTrusted: false,
      changedFiles: ["README.md"],
      checksPassed: true,
      costActualUsd: 0.01,
      diffLineCount: 1,
      redactionWarnings: 0,
      releaseHealthy: true,
    },
    url: `/admin/work-items/${workItemId}/automerge`,
  });
  assert.equal(diffBlocked.statusCode, 409);
  assert.equal(diffBlocked.json().evaluation.reasons.includes("diff_too_large"), true);
  assert.equal(diffBlocked.json().evidence.evidenceSource, "stored_runner");
  assert.deepEqual(diffBlocked.json().evidence.changedFiles, ["apps/demo-app/src/App.tsx"]);
  assert.equal(diffBlocked.json().evidence.diffLineCount, 12);

  await app.inject({
    method: "PATCH",
    payload: {
      autoMergePolicyEnabled: true,
      maxSafeDiffLines: 100,
      protectedPathFragments: ["apps/demo-app"],
    },
    url: "/admin/settings/merge-guardrails",
  });

  const pathBlocked = await app.inject({
    method: "POST",
    payload: {
      branchTrusted: true,
      changedFiles: ["README.md"],
      checksPassed: true,
      costActualUsd: 1.25,
      diffLineCount: 1,
      redactionWarnings: 0,
      releaseHealthy: true,
    },
    url: `/admin/work-items/${workItemId}/automerge`,
  });
  assert.equal(pathBlocked.statusCode, 409);
  assert.equal(pathBlocked.json().evaluation.reasons.includes("protected_path_changed"), true);
  assert.deepEqual(pathBlocked.json().evidence.changedFiles, ["apps/demo-app/src/App.tsx"]);

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
  assert.equal(response.json().setup_url, "http://control.test/");
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
    signalSources: ["demo"],
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
      assumptions: [
        {
          alternativesSkipped: [],
          assumptions: ["Assumed the Daybook test app is the target app."],
          checksRun: ["pnpm test"],
          checksSkipped: [],
          confidence: "medium",
          defaultsUsed: ["model=gpt-5.5"],
          humanQuestions: [],
          impactAreas: ["none"],
          notes: "No blocking assumptions.",
          unresolved: false,
        },
      ],
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

  const evidence = await app.inject({ method: "GET", url: `/admin/work-items/${workItemId}/evidence` });
  assert.equal(evidence.statusCode, 200);
  assert.equal(evidence.json().workItem.id, workItemId);
  assert.equal(evidence.json().agentRuns[0].status, "succeeded");
  assert.equal(evidence.json().costRecords[0].phase, "actual");
  assert.equal(evidence.json().costRecords[0].amountUsd, 1.25);
  assert.equal(evidence.json().assumptions[0].notes, "No blocking assumptions.");

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
    payload: { featureId: "note-search", message: "Note search has shipped." },
    url: `/admin/work-items/${workItemId}/release`,
  });
  assert.equal(release.statusCode, 202);
  assert.equal(release.json().featureId, "note-search");

  const usage = await app.inject({
    method: "POST",
    payload: { action: "searched", userId: "demo-user" },
    url: "/sdk/features/note-search/usage",
  });
  assert.equal(usage.statusCode, 201);

  const status = await app.inject({ method: "GET", url: `/sdk/feedback/${feedbackId}/status` });
  assert.equal(status.json().state, "shipped");
  assert.equal(status.json().message, "Note search has shipped.");

  const evidence = await app.inject({ method: "GET", url: `/admin/work-items/${workItemId}/evidence` });
  assert.equal(evidence.json().usageAttribution[0].featureId, "note-search");
  assert.equal(evidence.json().usageAttribution[0].eventCount, 1);

  await app.close();
});

test("admin can mark work not planned and update requester status", async () => {
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
  const feedbackId = feedback.json().feedbackId;
  const workItemId = feedback.json().workItemId;

  const decision = await app.inject({
    method: "POST",
    payload: {
      decisionCategory: "out_of_scope",
      message: "We reviewed this and are not planning it for the current beta.",
      status: "not_planned",
    },
    url: `/admin/work-items/${workItemId}/decision`,
  });

  assert.equal(decision.statusCode, 202);
  assert.equal(decision.json().status, "not_planned");
  assert.equal(store.workItems[0]?.status, "not_planned");

  const status = await app.inject({ method: "GET", url: `/sdk/feedback/${feedbackId}/status` });
  assert.equal(status.json().state, "not_planned");
  assert.equal(status.json().message, "We reviewed this and are not planning it for the current beta.");

  const evidence = await app.inject({ method: "GET", url: `/admin/work-items/${workItemId}/evidence` });
  assert.equal(evidence.json().userNotifications[0].status, "not_planned");
  assert.equal(evidence.json().auditEvents[0].event, "work_item_decision_recorded");

  await app.close();
});

test("admin review decisions are durable auto-merge gates", async () => {
  const store = new MemoryStore();
  const app = await buildApp({
    config: { ...config, autoMergeEnabled: true },
    store,
  });

  const feedback = await app.inject({
    method: "POST",
    payload: {
      message: "Please add a calmer save button label",
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

  const beforeReview = await app.inject({
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
  assert.equal(beforeReview.statusCode, 409);
  assert.equal(beforeReview.json().evaluation.reasons.includes("reviewer_not_approved"), true);

  const review = await app.inject({
    method: "POST",
    payload: {
      approved: true,
      reviewer: "reviewer-agent",
      reviewType: "agent",
      summary: "Reviewed diff, checks, assumptions, and merge policy.",
    },
    url: `/admin/work-items/${workItemId}/review`,
  });
  assert.equal(review.statusCode, 202);
  assert.equal(review.json().reviewDecision.approved, true);

  const afterReview = await app.inject({
    method: "POST",
    payload: {
      branchTrusted: true,
      changedFiles: ["apps/demo-app/src/App.tsx"],
      checksPassed: true,
      costActualUsd: 1.25,
      diffLineCount: 12,
      redactionWarnings: 0,
      releaseHealthy: true,
    },
    url: `/admin/work-items/${workItemId}/automerge`,
  });
  assert.equal(afterReview.statusCode, 409);
  assert.equal(afterReview.json().evaluation.reasons.includes("reviewer_not_approved"), false);
  assert.equal(afterReview.json().evaluation.reasons.includes("github_merge_mode_not_enabled"), true);
  assert.equal(afterReview.json().evaluation.reasons.includes("checks_not_passing"), true);

  const evidence = await app.inject({ method: "GET", url: `/admin/work-items/${workItemId}/evidence` });
  assert.equal(evidence.json().auditEvents[0].event, "work_item_review_recorded");
  assert.equal(evidence.json().auditEvents[0].metadata.summary, "Reviewed diff, checks, assumptions, and merge policy.");

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
    signalSources: ["demo"],
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
    signalSources: ["demo"],
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
    config: { ...config, autoMergeEnabled: true },
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
  await store.recordWorkItemReview({
    actor: "reviewer-agent",
    approved: true,
    reviewType: "agent",
    summary: "Reviewer approved the implementation, pending assumption gates.",
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
      metadata: {
        branchName: "off/codex/work_1",
        changedFiles: ["apps/demo-app/src/App.tsx"],
        diffLineCount: 12,
      },
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
  assert.equal(merge.json().evaluation.reasons.includes("unresolved_assumption_blocks_automerge"), true);
  assert.equal(merge.json().evaluation.reasons.includes("github_merge_mode_not_enabled"), true);

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
