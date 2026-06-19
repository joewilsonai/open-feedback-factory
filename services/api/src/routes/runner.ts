import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.js";

export async function registerRunnerRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.post("/runner/jobs/claim", async () => {
    const snapshot = await deps.store.getControlRoomSnapshot();
    const next = snapshot.workItems.find((item) => item.status === "planned");
    return { job: next ?? null };
  });

  app.post<{
    Body: {
      agentName?: string;
      metadata?: Record<string, unknown>;
      status?: string;
      summary?: string;
    };
    Params: { id: string };
  }>("/runner/jobs/:id/complete", async (request, reply) => {
    const workItem = await deps.store.getWorkItem(request.params.id);
    if (!workItem) return reply.code(404).send({ error: "work item not found" });

    const runId = await deps.store.recordAgentRun({
      agentName: request.body.agentName ?? "runner",
      metadata: request.body.metadata ?? {},
      runType: "implementation",
      status: request.body.status ?? "succeeded",
      summary: request.body.summary ?? "Runner completed the job.",
      workItemId: workItem.id,
    });

    return { runId };
  });
}
