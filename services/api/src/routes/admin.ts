import { evaluateAutoMerge, routeFeedback, sanitizeFeedback, type FeedbackInput, type WorkRiskTier } from "@open-feedback-factory/core";
import type { AgentRunLedgerRow, WorkItemDetail, WorkItemRow } from "@open-feedback-factory/db";
import { CodexCliRunner } from "@open-feedback-factory/runner";
import type { GitHubAccessibleRepository, GitHubIssueInput, GitHubPullRequestEvidence } from "@open-feedback-factory/runner";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.js";
import { buildGithubClient } from "../githubClient.js";
import { defaultCostBudget, evaluateCostBudget, normalizeCostBudget } from "../costBudget.js";
import { getCodexApiKeyStatus, readCodexApiKey, removeCodexApiKey, saveCodexApiKey } from "../secrets.js";
import { buildWorkerConnection } from "./health.js";
import { buildSanitizedGithubIssueInput } from "./sdk.js";

interface AutoMergeEvidence {
  branchTrusted: boolean;
  changedFiles: string[];
  checksPassed: boolean;
  costActualUsd: number;
  diffLineCount: number;
  evidenceSource: "github_live" | "stored_runner";
  headBranch: string | null;
  redactionWarnings: number;
  releaseHealthy: boolean;
}

export async function registerAdminRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.get("/admin/control-room", async () => deps.store.getControlRoomSnapshot());

  app.get("/admin/settings", async () => {
    const costBudget = await deps.store.getCostBudget(defaultCostBudget(deps.config));
    return {
      approvalMode: await deps.store.getApprovalMode(deps.config.approvalMode),
      codexApiKey: await getCodexApiKeyStatus(deps.config),
      codexAuthMode: await deps.store.getCodexAuthMode(deps.config.codexAuthMode),
      costBudget,
      costBudgetUsage: await deps.store.getCostBudgetUsage(),
      maxFeatureCostUsd: costBudget.maxFeatureCostUsd,
      mergeGuardrails: await deps.store.getMergeGuardrailPolicy(defaultMergeGuardrailPolicy(deps)),
    };
  });

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

  app.get("/admin/github/repositories", async () => githubRepositoryScopeStatus(deps));

  app.post<{ Body: { repositoryFullName?: unknown } }>("/admin/connect/sdk-install-pr", async (request, reply) => {
    const target = githubTargetFromFullName(request.body?.repositoryFullName, deps);
    if (!target) {
      return reply.code(400).send({ error: "repositoryFullName must look like owner/repo" });
    }

    const github = await githubRepositoryScopeStatus(deps, target);
    if (!github.targetAccessible) {
      return reply.code(409).send(
        blockedSdkInstallHandoff({
          github,
          missing: ["github_target_missing"],
          repositoryFullName: target.fullName,
          summary: `GitHub App cannot access ${target.fullName}. Connect the repo before requesting SDK installation.`,
        }),
      );
    }

    if (!deps.config.sdkPackagePublished) {
      return reply.code(409).send(
        blockedSdkInstallHandoff({
          github,
          missing: ["sdk_publish_held"],
          repositoryFullName: target.fullName,
          summary:
            "The public SDK package is staged but not published yet, so OFF cannot create a truthful npm install PR.",
        }),
      );
    }

    const handoff = await queueSdkInstallHandoff(deps, target);
    return reply.code(202).send({
      github,
      issueUrl: handoff.issueUrl,
      missing: handoff.missing,
      prUrl: null,
      repositoryFullName: target.fullName,
      status: "queued",
      summary: handoff.summary,
      workItemId: handoff.workItemId,
    });
  });

  app.patch<{ Body: { maxFeatureCostUsd?: unknown } }>("/admin/settings/cost-cap", async (request, reply) => {
    const amount = Number(request.body?.maxFeatureCostUsd);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000) {
      return reply.code(400).send({ error: "maxFeatureCostUsd must be between 0 and 10000" });
    }

    const existing = await deps.store.getCostBudget(defaultCostBudget(deps.config));
    const costBudget = await deps.store.setCostBudget(
      { ...existing, maxFeatureCostUsd: Math.round(amount * 100) / 100 },
      "control-center",
    );
    return { costBudget, maxFeatureCostUsd: costBudget.maxFeatureCostUsd, status: "updated" };
  });

  app.patch<{ Body: Record<string, unknown> }>("/admin/settings/cost-budget", async (request, reply) => {
    const existing = await deps.store.getCostBudget(defaultCostBudget(deps.config));
    const costBudget = normalizeCostBudget(request.body ?? {}, existing);
    if (!costBudget) {
      return reply.code(400).send({
        error: "cost budget values must be positive numbers",
      });
    }

    const saved = await deps.store.setCostBudget(costBudget, "control-center");
    return { costBudget: saved, status: "updated" };
  });

  app.patch<{
    Body: {
      autoMergePolicyEnabled?: unknown;
      maxSafeDiffLines?: unknown;
      protectedPathFragments?: unknown;
    };
  }>("/admin/settings/merge-guardrails", async (request, reply) => {
    const maxSafeDiffLines = Number(request.body.maxSafeDiffLines);
    if (!Number.isInteger(maxSafeDiffLines) || maxSafeDiffLines < 1 || maxSafeDiffLines > 10_000) {
      return reply.code(400).send({ error: "maxSafeDiffLines must be an integer between 1 and 10000" });
    }
    if (typeof request.body.autoMergePolicyEnabled !== "boolean") {
      return reply.code(400).send({ error: "autoMergePolicyEnabled must be a boolean" });
    }
    const protectedPathFragments = normalizeProtectedPathFragments(request.body.protectedPathFragments);
    if (!protectedPathFragments.length) {
      return reply.code(400).send({ error: "protectedPathFragments must include at least one path fragment" });
    }

    const mergeGuardrails = await deps.store.setMergeGuardrailPolicy(
      {
        autoMergePolicyEnabled: request.body.autoMergePolicyEnabled,
        maxSafeDiffLines,
        protectedPathFragments,
      },
      "control-center",
    );
    return { mergeGuardrails, status: "updated" };
  });

  app.get<{ Params: { id: string } }>("/admin/work-items/:id", async (request, reply) => {
    const workItem = await deps.store.getWorkItem(request.params.id);
    if (!workItem) return reply.code(404).send({ error: "work item not found" });
    return workItem;
  });

  app.get<{ Params: { id: string } }>("/admin/work-items/:id/evidence", async (request, reply) => {
    const detail = await deps.store.getWorkItemDetail(request.params.id);
    if (!detail) return reply.code(404).send({ error: "work item not found" });
    return detail;
  });

  app.post<{ Params: { id: string } }>("/admin/work-items/:id/run", async (request, reply) => {
    const workItem = await deps.store.getWorkItem(request.params.id);
    if (!workItem) return reply.code(404).send({ error: "work item not found" });
    const costBudget = await deps.store.getCostBudget(defaultCostBudget(deps.config));
    const costBudgetUsage = await deps.store.getCostBudgetUsage();
    const budgetBlock = evaluateCostBudget(workItem, costBudget, costBudgetUsage);
    if (budgetBlock) {
      return reply.code(409).send({
        costBudget,
        costBudgetUsage,
        costEstimateUsd: workItem.costEstimate.amountUsd,
        error: budgetBlock.error,
        maxFeatureCostUsd: costBudget.maxFeatureCostUsd,
        reason: budgetBlock.reason,
        status: "blocked",
      });
    }
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

  app.post<{ Body: { featureId?: unknown; message?: string }; Params: { id: string } }>(
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
      const featureId = normalizeFeatureId(request.body.featureId);
      if (request.body.featureId !== undefined && !featureId) {
        return reply.code(400).send({ error: "featureId must be 1-80 characters of letters, numbers, dot, underscore, colon, or dash" });
      }

      await deps.store.markWorkItemReleased(request.params.id, request.body.message, featureId ?? undefined);
      return reply.code(202).send({ featureId, status: "shipped" });
    },
  );

  app.post<{
    Body: { approved?: unknown; reviewer?: unknown; reviewType?: unknown; summary?: unknown };
    Params: { id: string };
  }>("/admin/work-items/:id/review", async (request, reply) => {
    const workItem = await deps.store.getWorkItem(request.params.id);
    if (!workItem) return reply.code(404).send({ error: "work item not found" });
    if (typeof request.body.approved !== "boolean") {
      return reply.code(400).send({ error: "approved must be a boolean" });
    }
    const reviewType = request.body.reviewType === "agent" ? "agent" : "human";
    const actor =
      typeof request.body.reviewer === "string" && request.body.reviewer.trim().length > 0
        ? request.body.reviewer.trim()
        : "control-center";
    const summary =
      typeof request.body.summary === "string" && request.body.summary.trim().length > 0
        ? request.body.summary.trim()
        : request.body.approved
          ? "Reviewer approved this work for merge consideration."
          : "Reviewer rejected this work; it cannot auto-merge until another approval is recorded.";

    const reviewDecision = await deps.store.recordWorkItemReview({
      actor,
      approved: request.body.approved,
      reviewType,
      summary,
      workItemId: request.params.id,
    });
    return reply.code(202).send({ reviewDecision, status: request.body.approved ? "approved" : "rejected" });
  });

  app.post<{
    Body: { decisionCategory?: unknown; message?: unknown; status?: unknown };
    Params: { id: string };
  }>("/admin/work-items/:id/decision", async (request, reply) => {
    const workItem = await deps.store.getWorkItem(request.params.id);
    if (!workItem) return reply.code(404).send({ error: "work item not found" });

    const status = request.body.status;
    if (status !== "not_planned" && status !== "blocked") {
      return reply.code(400).send({ error: "status must be not_planned or blocked" });
    }

    const message =
      typeof request.body.message === "string" && request.body.message.trim().length > 0
        ? request.body.message.trim()
        : defaultDecisionMessage(status);
    const decisionCategory =
      typeof request.body.decisionCategory === "string" && request.body.decisionCategory.trim().length > 0
        ? request.body.decisionCategory.trim()
        : status;

    await deps.store.markWorkItemDecision({
      actor: "control-center",
      decisionCategory,
      message,
      status,
      workItemId: request.params.id,
    });
    return reply.code(202).send({ decisionCategory, message, status });
  });

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

  app.post<{ Params: { id: string } }>("/admin/work-items/:id/automerge", async (request, reply) => {
    const detail = await deps.store.getWorkItemDetail(request.params.id);
    if (!detail) return reply.code(404).send({ error: "work item not found" });
    const workItem = detail.workItem;
    const maxFeatureCostUsd = await deps.store.getMaxFeatureCostUsd(deps.config.maxFeatureCostUsd);
    const mergeGuardrails = await deps.store.getMergeGuardrailPolicy(defaultMergeGuardrailPolicy(deps));
    const reviewDecision = await deps.store.getWorkItemReviewDecision(workItem.id);
    const prUrl = workItem.githubPrUrl;
    const evidence = storedAutoMergeEvidence(detail, mergeGuardrails.maxSafeDiffLines);
    const externalReasons: string[] = [];

    if (!prUrl) externalReasons.push("missing_pr_url");
    if (deps.config.githubMode === "disabled") externalReasons.push("github_merge_mode_not_enabled");

    const github = prUrl && deps.config.githubMode !== "disabled" ? buildGithubClient(deps.config) : null;
    if (github && prUrl) {
      try {
        Object.assign(evidence, liveAutoMergeEvidence(workItem, await github.getPullRequestEvidence(prUrl)));
      } catch (error) {
        externalReasons.push("github_evidence_unavailable");
        await deps.store.recordAgentRun({
          agentName: "github-safe-automerge",
          metadata: {
            error: error instanceof Error ? error.message : String(error),
            prUrl,
          },
          runType: "automerge_evidence",
          status: "blocked",
          summary: "Could not fetch live GitHub PR evidence for auto-merge.",
          workItemId: workItem.id,
        });
      }
    }

    const evaluation = evaluateAutoMerge({
      autoMergeEnabled: deps.config.autoMergeEnabled && mergeGuardrails.autoMergePolicyEnabled,
      branchTrusted: evidence.branchTrusted,
      changedFiles: evidence.changedFiles,
      checksPassed: evidence.checksPassed,
      costActualUsd: evidence.costActualUsd,
      costCapUsd: maxFeatureCostUsd,
      diffLineCount: evidence.diffLineCount,
      maxDiffLineCount: mergeGuardrails.maxSafeDiffLines,
      protectedPathFragments: mergeGuardrails.protectedPathFragments,
      redactionWarnings: evidence.redactionWarnings,
      releaseHealthy: evidence.releaseHealthy,
      reviewerApproved: reviewDecision?.approved === true,
      riskTier: workItem.riskTier as WorkRiskTier,
      unresolvedAssumptions: workItem.unresolvedAssumptions,
    });
    evaluation.reasons.push(...externalReasons);

    if (!evaluation.eligible || evaluation.reasons.length > 0) {
      return reply.code(409).send({
        evaluation: { eligible: false, reasons: evaluation.reasons },
        evidence,
        status: "blocked",
      });
    }
    if (!prUrl) {
      return reply.code(409).send({ evaluation: { eligible: false, reasons: ["missing_pr_url"] }, status: "blocked" });
    }

    if (!github) {
      return reply.code(409).send({
        evaluation: { eligible: false, reasons: ["github_merge_mode_not_enabled"] },
        evidence,
        status: "blocked",
      });
    }

    const mergeOutput = await github.mergePullRequest(prUrl);
    const cleanupOutput = isGeneratedRunnerBranch(workItem.latestBranchName)
      ? await github.cleanupBranch(workItem.latestBranchName)
      : null;
    const runId = await deps.store.recordAgentRun({
      agentName: "github-safe-automerge",
      metadata: {
        cleanupOutput,
        evaluation,
        mergeOutput,
        prUrl,
        branchName: workItem.latestBranchName,
        evidence,
        mergeGuardrails,
        reviewDecision,
      },
      runType: "automerge",
      status: "succeeded",
      summary: "Safe-lane auto-merge was enabled and all gates passed.",
      workItemId: workItem.id,
    });

    return { cleanupOutput, evaluation, evidence, mergeOutput, runId, status: "merged" };
  });
}

async function githubRepositoryScopeStatus(deps: AppDeps, target = githubTarget(deps)) {
  const appConfigured = Boolean(
    deps.config.githubAppId && (deps.config.githubAppPrivateKey || deps.config.githubAppPrivateKeyPath),
  );
  const installationConfigured = Boolean(deps.config.githubAppInstallationId);
  const base = {
    appConfigured,
    installationConfigured,
    mode: deps.config.githubMode,
    repositories: [] as GitHubAccessibleRepository[],
    target,
    targetAccessible: false,
    totalCount: 0,
    truncated: false,
  };

  if (deps.config.githubMode !== "app") {
    return {
      ...base,
      missing: ["github_app_mode"],
      status: "disabled",
      summary: "GitHub App mode is not enabled.",
    };
  }

  const missing = [];
  if (!appConfigured) missing.push("github_app_credentials");
  if (missing.length > 0) {
    return {
      ...base,
      missing,
      status: "not_configured",
      summary: "GitHub App setup is incomplete.",
    };
  }

  try {
    const github = deps.githubClient ?? buildGithubClient(deps.config);
    const list = await github.listInstallationRepositories();
    const targetFullName = target.fullName.toLowerCase();
    const repositories = list.repositories.map(safeGithubRepository);
    const targetAccessible = repositories.some((repository) => repository.fullName.toLowerCase() === targetFullName);
    return {
      ...base,
      missing: targetAccessible ? [] : ["github_target_repository_scope"],
      repositories,
      status: targetAccessible ? "connected" : "target_missing",
      summary: targetAccessible
        ? `GitHub App can access ${target.fullName}.`
        : `GitHub App is installed but cannot access ${target.fullName}.`,
      targetAccessible,
      totalCount: list.totalCount,
      truncated: list.truncated,
    };
  } catch {
    return {
      ...base,
      missing: ["github_repository_scope_verification"],
      status: "error",
      summary: "GitHub App repository scope could not be verified.",
    };
  }
}

function githubTarget(deps: AppDeps) {
  const owner = deps.config.githubOwner;
  const repo = deps.config.githubRepo;
  return {
    fullName: `${owner}/${repo}`,
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}`,
  };
}

function githubTargetFromFullName(value: unknown, deps: AppDeps): ReturnType<typeof githubTarget> | null {
  if (value === undefined || value === null || value === "") return githubTarget(deps);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!match) return null;
  const owner = match[1];
  const repo = match[2];
  if (!owner || !repo) return null;
  return {
    fullName: `${owner}/${repo}`,
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}`,
  };
}

function blockedSdkInstallHandoff(input: {
  github: Awaited<ReturnType<typeof githubRepositoryScopeStatus>>;
  missing: string[];
  repositoryFullName: string;
  summary: string;
}) {
  return {
    github: input.github,
    issueUrl: null,
    missing: input.missing,
    prUrl: null,
    repositoryFullName: input.repositoryFullName,
    status: "blocked",
    summary: input.summary,
    workItemId: null,
  };
}

async function queueSdkInstallHandoff(
  deps: AppDeps,
  target: ReturnType<typeof githubTarget>,
): Promise<{ issueUrl: string | null; missing: string[]; summary: string; workItemId: string }> {
  const feedback: FeedbackInput = {
    message:
      `Install @open-feedback-factory/sdk@0.1.0 in ${target.fullName}, add the feedback launcher, ` +
      "wire it to the hosted OFF API, and keep existing app behavior unchanged.",
    metadata: {
      appName: target.fullName,
      surface: "connect_sdk_install",
      url: target.url,
    },
    severity: "medium",
    source: "connect_sdk_install",
    userId: "control-center",
  };
  const sanitized = sanitizeFeedback(feedback);
  const routed = routeFeedback({
    model: "gpt-5.5",
    sanitized,
    signalCount: 2,
  });
  const decision: ReturnType<typeof routeFeedback> = {
    ...routed,
    action: "create_work_item",
    category: "feature_request",
    clusterKey: sdkInstallClusterKey(target.fullName),
    riskTier: "guarded_review",
    shouldCreateIssue: true,
    title: "Install Open Feedback Factory SDK",
    userMessage:
      "OFF queued the SDK install request for this repository. It is not shipped yet and no PR exists until a worker opens one.",
    userStatus: "planned",
  };

  const intake = await deps.store.createFeedbackIntake({ decision, feedback, sanitized });
  if (!intake.workItemId) {
    throw new Error("SDK install handoff did not create or find a work item");
  }

  const existingIssueUrl = await existingGithubIssueUrl(deps, intake.workItemId);
  const workerMissing = await sdkInstallWorkerMissing(deps);
  if (existingIssueUrl) {
    return {
      issueUrl: existingIssueUrl,
      missing: workerMissing,
      summary: "SDK-install work is already queued with a sanitized GitHub issue. A PR has not been opened yet.",
      workItemId: intake.workItemId,
    };
  }

  try {
    const github = githubIssueClient(deps, target);
    const issueUrl = await github.createIssue(
      buildSanitizedGithubIssueInput({
        category: decision.category,
        clusterKey: decision.clusterKey,
        riskTier: decision.riskTier,
        summary: sanitized.sanitizedMessage,
        title: decision.title,
        workItemId: intake.workItemId,
      }),
    );
    await deps.store.recordGithubArtifact({
      artifactNumber: githubNumberFromUrl(issueUrl),
      artifactType: "issue",
      metadata: {
        clusterKey: decision.clusterKey,
        handoff: "sdk_install",
        repositoryFullName: target.fullName,
        riskTier: decision.riskTier,
      },
      url: issueUrl,
      workItemId: intake.workItemId,
    });
    return {
      issueUrl,
      missing: workerMissing,
      summary: "SDK-install work is queued with a sanitized GitHub issue. A PR has not been opened yet.",
      workItemId: intake.workItemId,
    };
  } catch {
    await deps.store.recordAgentRun({
      agentName: "github-issue-writer",
      metadata: {
        handoff: "sdk_install",
        repositoryFullName: target.fullName,
      },
      runType: "github_issue",
      status: "failed",
      summary: "GitHub issue creation failed during SDK-install handoff.",
      workItemId: intake.workItemId,
    });
    return {
      issueUrl: null,
      missing: ["github_issue_creation_failed", ...workerMissing],
      summary:
        "SDK-install work is queued, but the sanitized GitHub issue could not be created. A PR has not been opened yet.",
      workItemId: intake.workItemId,
    };
  }
}

async function sdkInstallWorkerMissing(deps: AppDeps): Promise<string[]> {
  const heartbeat = await deps.store.getLatestWorkerHeartbeat();
  const workerConnection = buildWorkerConnection(heartbeat);
  return deps.config.codexRunnerMode === "codex" && workerConnection.status === "online" ? [] : ["worker_offline"];
}

async function existingGithubIssueUrl(deps: AppDeps, workItemId: string): Promise<string | null> {
  const detail = await deps.store.getWorkItemDetail(workItemId);
  const issue = detail?.githubArtifacts.find((artifact) => artifact.artifactType === "issue");
  return issue?.url ?? null;
}

function githubIssueClient(
  deps: AppDeps,
  target: ReturnType<typeof githubTarget>,
): { createIssue(input: GitHubIssueInput): Promise<string> } {
  const createIssue = deps.githubClient?.createIssue;
  if (createIssue) {
    return {
      createIssue: (input) => createIssue(input),
    };
  }
  return buildGithubClient(deps.config, target);
}

function sdkInstallClusterKey(repositoryFullName: string): string {
  return `setup.sdk-install.${repositoryFullName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function githubNumberFromUrl(url: string): number | undefined {
  const lastSegment = url.split("/").filter(Boolean).at(-1);
  const number = Number(lastSegment);
  return Number.isInteger(number) ? number : undefined;
}

function safeGithubRepository(repository: GitHubAccessibleRepository): GitHubAccessibleRepository {
  return {
    fullName: repository.fullName,
    htmlUrl: repository.htmlUrl,
    name: repository.name,
    owner: repository.owner,
    permissions: repository.permissions,
    private: repository.private,
  };
}

function storedAutoMergeEvidence(detail: WorkItemDetail, maxSafeDiffLines: number): AutoMergeEvidence {
  const run = latestImplementationRun(detail.agentRuns);
  const changedFiles = stringArrayFromMetadata(run?.metadata.changedFiles);
  const branchName = stringFromMetadata(run?.metadata.branchName) ?? detail.workItem.latestBranchName;
  return {
    branchTrusted: isGeneratedRunnerBranch(branchName),
    changedFiles,
    checksPassed: false,
    costActualUsd: amountUsdFromActual(detail.workItem.latestActualCost) ?? detail.workItem.costEstimate.amountUsd,
    diffLineCount: positiveNumberFromMetadata(run?.metadata.diffLineCount) ?? maxSafeDiffLines + 1,
    evidenceSource: "stored_runner",
    headBranch: branchName,
    redactionWarnings: 0,
    releaseHealthy: true,
  };
}

function liveAutoMergeEvidence(workItem: WorkItemRow, evidence: GitHubPullRequestEvidence): AutoMergeEvidence {
  const latestBranch = workItem.latestBranchName;
  const branchTrusted =
    isGeneratedRunnerBranch(latestBranch) &&
    (!evidence.headBranch || evidence.headBranch === latestBranch || latestBranch.endsWith(`/${evidence.headBranch}`));
  return {
    branchTrusted,
    changedFiles: evidence.changedFiles,
    checksPassed: evidence.checksPassed,
    costActualUsd: amountUsdFromActual(workItem.latestActualCost) ?? workItem.costEstimate.amountUsd,
    diffLineCount: evidence.diffLineCount,
    evidenceSource: "github_live",
    headBranch: evidence.headBranch,
    redactionWarnings: 0,
    releaseHealthy: true,
  };
}

function latestImplementationRun(runs: AgentRunLedgerRow[]): AgentRunLedgerRow | null {
  return runs.find((run) => run.runType === "implementation" && run.status === "succeeded") ?? null;
}

function isGeneratedRunnerBranch(branchName: string | null): branchName is string {
  return Boolean(branchName && /^(off\/codex|codex\/off|agent)\/[a-zA-Z0-9/_-]+$/.test(branchName));
}

function amountUsdFromActual(value: Record<string, unknown> | null): number | null {
  const amount = value?.amountUsd;
  return typeof amount === "number" && Number.isFinite(amount) ? amount : null;
}

function positiveNumberFromMetadata(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function stringArrayFromMetadata(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function stringFromMetadata(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function defaultDecisionMessage(status: "blocked" | "not_planned"): string {
  if (status === "not_planned") {
    return "We reviewed this request and do not plan to build it right now.";
  }
  return "We reviewed this request and it is blocked from shipping without human intervention.";
}

function defaultMergeGuardrailPolicy(deps: AppDeps) {
  return {
    autoMergePolicyEnabled: true,
    maxSafeDiffLines: deps.config.maxSafeDiffLines,
    protectedPathFragments: deps.config.protectedPathFragments,
  };
}

function normalizeProtectedPathFragments(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return Array.from(
    new Set(
      raw
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0 && item.length <= 80 && /^[a-zA-Z0-9_./:-]+$/.test(item)),
    ),
  ).slice(0, 50);
}

function normalizeFeatureId(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[a-zA-Z0-9._:-]{1,80}$/.test(trimmed)) return null;
  return trimmed;
}
