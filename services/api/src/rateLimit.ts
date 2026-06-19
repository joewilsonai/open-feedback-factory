import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ApiConfig } from "./config.js";

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimitOptions {
  max: number;
  now?: () => number;
  windowMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export function createFixedWindowRateLimiter(options: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();
  const now = options.now ?? Date.now;

  return {
    check(key: string): RateLimitDecision {
      if (options.max <= 0) {
        return { allowed: true, remaining: Number.POSITIVE_INFINITY, retryAfterSeconds: 0 };
      }

      const current = now();
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= current) {
        buckets.set(key, { count: 1, resetAt: current + options.windowMs });
        return { allowed: true, remaining: options.max - 1, retryAfterSeconds: 0 };
      }

      if (bucket.count >= options.max) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - current) / 1000)),
        };
      }

      bucket.count += 1;
      return {
        allowed: true,
        remaining: Math.max(0, options.max - bucket.count),
        retryAfterSeconds: 0,
      };
    },
  };
}

export async function registerRateLimits(app: FastifyInstance, config: ApiConfig): Promise<void> {
  const windowMs = config.rateLimitWindowMs ?? 60_000;
  const limiters = {
    admin: createFixedWindowRateLimiter({ max: config.adminRateLimitMax ?? 120, windowMs }),
    github: createFixedWindowRateLimiter({ max: config.githubRateLimitMax ?? 300, windowMs }),
    runner: createFixedWindowRateLimiter({ max: config.runnerRateLimitMax ?? 300, windowMs }),
    sdk: createFixedWindowRateLimiter({ max: config.sdkRateLimitMax ?? 120, windowMs }),
  };

  app.addHook("preHandler", async (request, reply) => {
    const group = routeGroupForUrl(request.url);
    if (!group) return;

    const actorKey = actorKeyForRequest(group, request);
    const decision = limiters[group].check(`${group}:${actorKey}`);
    if (decision.allowed) return;

    return sendRateLimited(reply, decision);
  });
}

function routeGroupForUrl(url: string): "admin" | "github" | "runner" | "sdk" | null {
  if (url.startsWith("/admin/")) return "admin";
  if (url.startsWith("/github/")) return "github";
  if (url.startsWith("/runner/")) return "runner";
  if (url.startsWith("/sdk/")) return "sdk";
  return null;
}

function actorKeyForRequest(group: string, request: FastifyRequest): string {
  const body = typeof request.body === "object" && request.body ? (request.body as Record<string, unknown>) : {};
  const bodyActor =
    (group === "runner" && typeof body.workerName === "string" && body.workerName) ||
    (group === "runner" && typeof body.agentName === "string" && body.agentName) ||
    (group === "sdk" && typeof body.userId === "string" && body.userId);

  return bodyActor || String(request.headers["x-forwarded-for"] ?? request.ip ?? "local");
}

function sendRateLimited(reply: FastifyReply, decision: RateLimitDecision): FastifyReply {
  return reply
    .code(429)
    .header("retry-after", String(decision.retryAfterSeconds))
    .send({
      error: "rate_limited",
      retryAfterSeconds: decision.retryAfterSeconds,
    });
}
