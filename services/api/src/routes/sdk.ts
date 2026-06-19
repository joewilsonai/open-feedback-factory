import { routeFeedback, sanitizeFeedback, type FeedbackInput } from "@open-feedback-factory/core";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.js";

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
    const decision = routeFeedback({
      model: "gpt-5.5",
      sanitized,
    });
    const intake = await deps.store.createFeedbackIntake({ decision, feedback, sanitized });

    return reply.code(201).send(intake);
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
