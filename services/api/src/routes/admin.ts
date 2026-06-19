import { evaluateAutoMerge, type WorkRiskTier } from "@open-feedback-factory/core";
import { CodexCliRunner } from "@open-feedback-factory/runner";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.js";
import { buildGithubClient } from "../githubClient.js";

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
    if (deps.config.codexRunnerMode !== "codex") {
      return reply.code(409).send({
        error: "codex runner disabled",
        mode: deps.config.codexRunnerMode,
        status: "blocked",
      });
    }

    const runner = new CodexCliRunner({
      cwd: deps.config.runnerWorkspace,
      effort: process.env.CODEX_EFFORT ?? "extra-high",
      model: process.env.CODEX_MODEL ?? workItem.costEstimate.model,
    });
    const result = await runner.run(workItem);

    const runId = await deps.store.completeWorkItemRun({
      agentName: "codex-cli",
      costActual: result.costActual,
      metadata: {
        branchName: result.branchName,
        changedFiles: result.changedFiles,
        githubPrUrl: null,
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

  app.post<{
    Body: {
      branchTrusted?: boolean;
      changedFiles?: string[];
      checksPassed?: boolean;
      costActualUsd?: number;
      diffLineCount?: number;
      redactionWarnings?: number;
      releaseHealthy?: boolean;
      reviewerApproved?: boolean;
    };
    Params: { id: string };
  }>("/admin/work-items/:id/automerge", async (request, reply) => {
    const workItem = await deps.store.getWorkItem(request.params.id);
    if (!workItem) return reply.code(404).send({ error: "work item not found" });

    const evaluation = evaluateAutoMerge({
      autoMergeEnabled: deps.config.autoMergeEnabled,
      branchTrusted: request.body.branchTrusted === true,
      changedFiles: request.body.changedFiles ?? [],
      checksPassed: request.body.checksPassed === true,
      costActualUsd: request.body.costActualUsd ?? workItem.costEstimate.amountUsd,
      costCapUsd: deps.config.maxFeatureCostUsd,
      diffLineCount: request.body.diffLineCount ?? deps.config.maxSafeDiffLines + 1,
      maxDiffLineCount: deps.config.maxSafeDiffLines,
      protectedPathFragments: deps.config.protectedPathFragments,
      redactionWarnings: request.body.redactionWarnings ?? 0,
      releaseHealthy: request.body.releaseHealthy === true,
      reviewerApproved: request.body.reviewerApproved === true,
      riskTier: workItem.riskTier as WorkRiskTier,
    });

    const prUrl = workItem.githubPrUrl;
    if (!prUrl) evaluation.reasons.push("missing_pr_url");
    if (deps.config.githubMode === "disabled") evaluation.reasons.push("github_merge_mode_not_enabled");

    if (!evaluation.eligible || evaluation.reasons.length > 0) {
      return reply.code(409).send({ evaluation: { eligible: false, reasons: evaluation.reasons }, status: "blocked" });
    }
    if (!prUrl) {
      return reply.code(409).send({ evaluation: { eligible: false, reasons: ["missing_pr_url"] }, status: "blocked" });
    }

    const github = buildGithubClient(deps.config);
    const mergeOutput = await github.mergePullRequest(prUrl);
    const runId = await deps.store.recordAgentRun({
      agentName: "github-safe-automerge",
      metadata: {
        evaluation,
        mergeOutput,
        prUrl,
      },
      runType: "automerge",
      status: "succeeded",
      summary: "Safe-lane auto-merge was enabled and all gates passed.",
      workItemId: workItem.id,
    });

    return { evaluation, mergeOutput, runId, status: "merged" };
  });
}
