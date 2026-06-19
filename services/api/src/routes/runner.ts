import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.js";

export async function registerRunnerRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.post<{ Body: { workerName?: string } }>("/runner/jobs/claim", async (request) => {
    const job = await deps.store.claimNextWorkItem(request.body?.workerName ?? "worker");
    return { job };
  });

  app.post<{
    Body: {
      agentName?: string;
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
