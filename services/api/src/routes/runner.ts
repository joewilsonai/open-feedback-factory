import type { FastifyInstance } from "fastify";
import type { AgentAssumptionRecord } from "@open-feedback-factory/core";
import type { AppDeps } from "../app.js";

export async function registerRunnerRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
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
    return { approvalMode, job };
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
