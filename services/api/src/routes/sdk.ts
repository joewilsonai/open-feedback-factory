import { clusterKeyForFeedback, routeFeedback, sanitizeFeedback, type FeedbackInput } from "@open-feedback-factory/core";
import type { GitHubIssueInput } from "@open-feedback-factory/runner";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.js";
import { buildGithubClient } from "../githubClient.js";

interface FeedbackBody {
  message?: string;
  metadata?: Record<string, unknown>;
  severity?: FeedbackInput["severity"];
  source?: string;
  userId?: string;
}

interface UsageBody {
  action?: string;
  metadata?: Record<string, unknown>;
  userId?: string;
}

export async function registerSdkRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.post<{ Body: FeedbackBody }>("/sdk/feedback", async (request, reply) => {
    if (!request.body.message || !request.body.source) {
      return reply.code(400).send({ error: "message and source are required" });
    }

    const feedback: FeedbackInput = {
      message: request.body.message,
      metadata: request.body.metadata ?? {},
      severity: request.body.severity ?? "medium",
      source: request.body.source,
      userId: request.body.userId,
    };
    const sanitized = sanitizeFeedback(feedback);
    const clusterKey = clusterKeyForFeedback(sanitized);
    const previousSignalCount = await deps.store.getFeedbackClusterSignalCount(clusterKey);
    const decision = routeFeedback({
      model: "gpt-5.5",
      sanitized,
      signalCount: previousSignalCount + 1,
    });
    const intake = await deps.store.createFeedbackIntake({ decision, feedback, sanitized });
    let githubIssueError: string | null = null;
    let githubIssueUrl: string | null = null;
    if (intake.createdWorkItem && intake.workItemId && deps.config.githubMode !== "disabled" && decision.shouldCreateIssue) {
      try {
        githubIssueUrl = await createSanitizedGithubIssue(deps, {
          category: decision.category,
          clusterKey: decision.clusterKey,
          summary: sanitized.sanitizedMessage,
          title: decision.title,
          riskTier: decision.riskTier,
          workItemId: intake.workItemId,
        });
      } catch (error) {
        githubIssueError = error instanceof Error ? error.message : String(error);
        await deps.store.recordAgentRun({
          agentName: "github-issue-writer",
          metadata: {
            error: githubIssueError,
            mode: deps.config.githubMode,
          },
          runType: "github_issue",
          status: "failed",
          summary: "GitHub issue creation failed after feedback intake.",
          workItemId: intake.workItemId,
        });
      }
    }

    return reply.code(201).send({ ...intake, githubIssueError, githubIssueUrl });
  });

  app.get<{ Params: { id: string } }>("/sdk/feedback/:id/status", async (request, reply) => {
    const status = await deps.store.getUserFeedbackStatus(request.params.id);
    if (!status) return reply.code(404).send({ error: "feedback status not found" });
    return status;
  });

  app.post<{ Body: UsageBody; Params: { featureId: string } }>(
    "/sdk/features/:featureId/usage",
    async (request, reply) => {
      if (!request.body.action) {
        return reply.code(400).send({ error: "action is required" });
      }

      const usageId = await deps.store.recordFeatureUsage({
        action: request.body.action,
        featureId: request.params.featureId,
        metadata: request.body.metadata ?? {},
        userId: request.body.userId,
      });

      return reply.code(201).send({ usageId });
    },
  );
}

async function createSanitizedGithubIssue(
  deps: AppDeps,
  input: {
    category: string;
    clusterKey: string;
    riskTier: string;
    summary: string;
    title: string;
    workItemId: string;
  },
): Promise<string | null> {
  const github = buildGithubClient(deps.config);
  const url = await github.createIssue(buildSanitizedGithubIssueInput(input));
  await deps.store.recordGithubArtifact({
    artifactNumber: githubNumberFromUrl(url),
    artifactType: "issue",
    metadata: {
      clusterKey: input.clusterKey,
      riskTier: input.riskTier,
    },
    url,
    workItemId: input.workItemId,
  });
  return url;
}

export function buildSanitizedGithubIssueInput(input: {
  category: string;
  clusterKey: string;
  riskTier: string;
  summary: string;
  title: string;
  workItemId: string;
}): GitHubIssueInput {
  return {
    body: [
      "## Sanitized Feedback",
      "",
      input.summary,
      "",
      "## Routing",
      "",
      `- Work item: ${input.workItemId}`,
      `- Cluster: ${input.clusterKey}`,
      `- Category: ${input.category}`,
      `- Risk tier: ${input.riskTier}`,
      "",
      "Raw user feedback stays in the Open Feedback Factory database and is not posted to GitHub.",
    ].join("\n"),
    labels: ["enhancement"],
    title: input.title,
  };
}

function githubNumberFromUrl(url: string): number | undefined {
  const lastSegment = url.split("/").filter(Boolean).at(-1);
  const number = Number(lastSegment);
  return Number.isInteger(number) ? number : undefined;
}
