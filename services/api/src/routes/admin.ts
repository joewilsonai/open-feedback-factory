import { CodexCliRunner, DemoRunner } from "@open-feedback-factory/runner";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.js";

export async function registerAdminRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.get("/admin/control-room", async () => deps.store.getControlRoomSnapshot());

  app.get<{ Params: { id: string } }>("/admin/work-items/:id", async (request, reply) => {
    const workItem = await deps.store.getWorkItem(request.params.id);
    if (!workItem) return reply.code(404).send({ error: "work item not found" });
    return workItem;
  });

  app.post<{ Params: { id: string } }>("/admin/work-items/:id/run", async (request, reply) => {
    const workItem = await deps.store.getWorkItem(request.params.id);
    if (!workItem) return reply.code(404).send({ error: "work item not found" });

    const runner =
      deps.config.codexRunnerMode === "codex"
        ? new CodexCliRunner({
            cwd: deps.config.runnerWorkspace,
            effort: process.env.CODEX_EFFORT ?? "extra-high",
            model: process.env.CODEX_MODEL ?? workItem.costEstimate.model,
          })
        : new DemoRunner();
    const result = await runner.run(workItem);

    const runId = await deps.store.recordAgentRun({
      agentName: deps.config.codexRunnerMode === "codex" ? "codex-cli" : "demo-runner",
      costActual: result.costActual,
      metadata: {
        branchName: result.branchName,
        changedFiles: result.changedFiles,
        mode: deps.config.codexRunnerMode,
        runnerOutput: result.output,
        sanitizedSummary: workItem.summary,
      },
      runType: "implementation",
      status: result.status,
      summary: result.summary,
      workItemId: workItem.id,
    });

    return reply.code(202).send({ result, runId, status: result.status });
  });

  app.post<{ Body: { message?: string }; Params: { id: string } }>(
    "/admin/work-items/:id/release",
    async (request, reply) => {
      const workItem = await deps.store.getWorkItem(request.params.id);
      if (!workItem) return reply.code(404).send({ error: "work item not found" });

      await deps.store.markWorkItemReleased(request.params.id, request.body.message);
      return reply.code(202).send({ status: "shipped" });
    },
  );
}
