import type { FastifyInstance } from "fastify";
import type { AgentAssumptionRecord } from "@open-feedback-factory/core";
import type { WorkItemRow } from "@open-feedback-factory/db";
import type { AppDeps } from "../app.js";
import { buildWorkerConnection } from "./health.js";

export async function registerRunnerRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.post<{ Body: Record<string, unknown> }>("/runner/heartbeat", async (request) => {
    const heartbeat = await deps.store.recordWorkerHeartbeat(normalizeHeartbeat(request.body));
    return { workerConnection: buildWorkerConnection(heartbeat) };
  });

  app.post<{ Body: { workItemId?: string; workerName?: string } }>("/runner/jobs/claim", async (request) => {
    const approvalMode = await deps.store.getApprovalMode(deps.config.approvalMode);
    if (approvalMode === "manual" && !request.body?.workItemId) {
      return { approvalMode, job: null, reason: "manual_approval_required" };
    }

    const maxFeatureCostUsd = await deps.store.getMaxFeatureCostUsd(deps.config.maxFeatureCostUsd);
    if (request.body?.workItemId) {
      const workItem = await deps.store.getWorkItem(request.body.workItemId);
      if (workItem && workItem.costEstimate.amountUsd > maxFeatureCostUsd) {
        return {
          approvalMode,
          costEstimateUsd: workItem.costEstimate.amountUsd,
          job: null,
          maxFeatureCostUsd,
          reason: "cost_cap_exceeded",
        };
      }
    }

    const job = await deps.store.claimNextWorkItem(
      request.body?.workerName ?? "worker",
      request.body?.workItemId,
      maxFeatureCostUsd,
    );
    return { approvalMode, job: job ? await withRunnerTarget(deps, job) : null };
  });

  app.post<{
    Body: {
      agentName?: string;
      assumptions?: AgentAssumptionRecord[];
      costActual?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      status?: "blocked" | "failed" | "succeeded";
      summary?: string;
    };
    Params: { id: string };
  }>("/runner/jobs/:id/complete", async (request, reply) => {
    const workItem = await deps.store.getWorkItem(request.params.id);
    if (!workItem) return reply.code(404).send({ error: "work item not found" });

    const runId = await deps.store.completeWorkItemRun({
      agentName: request.body.agentName ?? "runner",
      assumptions: request.body.assumptions,
      costActual: request.body.costActual,
      metadata: request.body.metadata ?? {},
      runType: "implementation",
      status: request.body.status ?? "succeeded",
      summary: request.body.summary ?? "Runner completed the job.",
      workItemId: workItem.id,
    });

    return { runId, status: request.body.status ?? "succeeded" };
  });
}

async function withRunnerTarget(deps: AppDeps, job: WorkItemRow) {
  const runnerTarget = await runnerTargetForWorkItem(deps, job.id);
  return runnerTarget ? { ...job, runnerTarget } : job;
}

async function runnerTargetForWorkItem(deps: AppDeps, workItemId: string) {
  const detail = await deps.store.getWorkItemDetail(workItemId);
  const artifact = detail?.githubArtifacts.find(
    (item) => typeof item.metadata.repositoryFullName === "string" && item.metadata.handoff === "sdk_install",
  );
  const repositoryFullName = artifact?.metadata.repositoryFullName;
  if (typeof repositoryFullName !== "string") return null;
  const parsed = parseRepositoryFullName(repositoryFullName);
  if (!parsed) return null;
  return {
    owner: parsed.owner,
    repo: parsed.repo,
    repositoryFullName: parsed.fullName,
    source: "github_artifact",
  };
}

function parseRepositoryFullName(value: string): { fullName: string; owner: string; repo: string } | null {
  const match = value.trim().match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!match) return null;
  const [, owner, repo] = match;
  if (!owner || !repo) return null;
  return {
    fullName: `${owner}/${repo}`,
    owner,
    repo,
  };
}

function normalizeHeartbeat(body: Record<string, unknown> | undefined) {
  return {
    codexAuthMode: body?.codexAuthMode === "api_key" ? "api_key" : "cli",
    runnerMode: body?.runnerMode === "codex" ? "codex" : "disabled",
    status: heartbeatStatus(body?.status),
    workerKind: body?.workerKind === "docker" || body?.workerKind === "host" ? body.workerKind : "unknown",
    workerName: safeString(body?.workerName, "open-feedback-worker", 80),
  };
}

function heartbeatStatus(value: unknown): "error" | "idle" | "online" {
  if (value === "error" || value === "idle" || value === "online") return value;
  return "online";
}

function safeString(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== "string") return fallback;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!clean) return fallback;
  return clean.slice(0, maxLength);
}
