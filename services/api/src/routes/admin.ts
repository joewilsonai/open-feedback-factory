import { evaluateAutoMerge, type WorkRiskTier } from "@open-feedback-factory/core";
import { CodexCliRunner } from "@open-feedback-factory/runner";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.js";
import { buildGithubClient } from "../githubClient.js";
import { getCodexApiKeyStatus, readCodexApiKey, removeCodexApiKey, saveCodexApiKey } from "../secrets.js";

export async function registerAdminRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.get("/admin/control-room", async () => deps.store.getControlRoomSnapshot());

  app.get("/admin/settings", async () => ({
    approvalMode: await deps.store.getApprovalMode(deps.config.approvalMode),
    codexApiKey: await getCodexApiKeyStatus(deps.config),
    codexAuthMode: await deps.store.getCodexAuthMode(deps.config.codexAuthMode),
  }));

  app.patch<{ Body: { approvalMode?: unknown } }>("/admin/settings/approval-mode", async (request, reply) => {
    const approvalMode = request.body?.approvalMode;
    if (approvalMode !== "auto" && approvalMode !== "manual") {
      return reply.code(400).send({ error: "approvalMode must be auto or manual" });
    }

    await deps.store.setApprovalMode(approvalMode, "control-center");
    return { approvalMode, status: "updated" };
  });

  app.patch<{ Body: { codexAuthMode?: unknown } }>("/admin/settings/codex-auth-mode", async (request, reply) => {
    const codexAuthMode = request.body?.codexAuthMode;
    if (codexAuthMode !== "api_key" && codexAuthMode !== "cli") {
      return reply.code(400).send({ error: "codexAuthMode must be cli or api_key" });
    }

    await deps.store.setCodexAuthMode(codexAuthMode, "control-center");
    return { codexAuthMode, status: "updated" };
  });

  app.put<{ Body: { apiKey?: unknown } }>("/admin/settings/codex-api-key", async (request, reply) => {
    const apiKey = typeof request.body?.apiKey === "string" ? request.body.apiKey : "";
    try {
      const codexApiKey = await saveCodexApiKey(deps.config, apiKey);
      return { codexApiKey, status: "saved" };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid API key" });
    }
  });

  app.delete("/admin/settings/codex-api-key", async () => ({
    codexApiKey: await removeCodexApiKey(deps.config),
    status: "removed",
  }));

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
    const codexAuthMode = await deps.store.getCodexAuthMode(deps.config.codexAuthMode);
    const codexApiKey = await getCodexApiKeyStatus(deps.config);
    const openAiApiKey = codexAuthMode === "api_key" ? await readCodexApiKey(deps.config) : undefined;
    if (codexAuthMode === "api_key" && !codexApiKey.configured) {
      return reply.code(409).send({
        codexApiKeyConfigured: false,
        error: "codex api key missing",
        mode: codexAuthMode,
        status: "blocked",
      });
    }

    const runner = new CodexCliRunner({
      cwd: deps.config.runnerWorkspace,
      env: codexAuthMode === "api_key" ? { OPENAI_API_KEY: openAiApiKey } : undefined,
      effort: process.env.CODEX_EFFORT ?? "extra-high",
      model: process.env.CODEX_MODEL ?? workItem.costEstimate.model,
    });
    const result = await runner.run(workItem);

    const runId = await deps.store.completeWorkItemRun({
      agentName: "codex-cli",
      assumptions: [
        {
          alternativesSkipped: [],
          assumptions: result.assumptions,
          checksRun: result.checksRun,
          checksSkipped: result.checksSkipped,
          confidence: result.status === "succeeded" ? "medium" : "low",
          defaultsUsed: [`model=${workItem.costEstimate.model}`, `auth=${codexAuthMode}`],
          humanQuestions: [],
          impactAreas: result.checksSkipped.length > 0 ? ["merge_safety"] : ["none"],
          notes: result.userMessage,
          unresolved: result.checksSkipped.length > 0,
        },
      ],
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
      if (workItem.status !== "implemented" && workItem.status !== "shipped") {
        return reply.code(409).send({
          error: "release marker requires implemented work",
          status: "blocked",
          workItemStatus: workItem.status,
        });
      }

      await deps.store.markWorkItemReleased(request.params.id, request.body.message);
      return reply.code(202).send({ status: "shipped" });
    },
  );

  app.post<{ Body: { staleAfterMinutes?: unknown } }>("/admin/reconciliation/run", async (request, reply) => {
    const staleAfterMinutes =
      typeof request.body?.staleAfterMinutes === "number" ? Math.floor(request.body.staleAfterMinutes) : 60;
    if (staleAfterMinutes < 1 || staleAfterMinutes > 10_080) {
      return reply.code(400).send({ error: "staleAfterMinutes must be between 1 and 10080" });
    }

    const result = await deps.store.reconcileWorkItems({
      actor: "control-center",
      staleAfterMinutes,
    });
    return { result, status: "reconciled" };
  });

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
      unresolvedAssumptions: workItem.unresolvedAssumptions,
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
