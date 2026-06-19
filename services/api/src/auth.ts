import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ApiConfig } from "./config.js";

export async function registerAccessControls(app: FastifyInstance, config: ApiConfig): Promise<void> {
  app.addHook("preHandler", async (request, reply) => {
    if (request.url.startsWith("/admin/")) {
      return requireToken({
        configuredToken: config.adminToken,
        error: "admin_auth_required",
        headerName: "x-off-admin-token",
        reply,
        request,
      });
    }
    if (request.url.startsWith("/runner/")) {
      return requireToken({
        configuredToken: config.runnerToken,
        error: "runner_auth_required",
        headerName: "x-off-runner-token",
        reply,
        request,
      });
    }
  });
}

export function accessControlStatus(config: ApiConfig): {
  adminAuthRequired: boolean;
  runnerAuthRequired: boolean;
} {
  return {
    adminAuthRequired: Boolean(config.adminToken),
    runnerAuthRequired: Boolean(config.runnerToken),
  };
}

function requireToken(input: {
  configuredToken: string | undefined;
  error: string;
  headerName: string;
  reply: FastifyReply;
  request: FastifyRequest;
}): FastifyReply | undefined {
  if (!input.configuredToken) return undefined;
  const supplied = readToken(input.request, input.headerName);
  if (supplied && tokensEqual(supplied, input.configuredToken)) return undefined;

  return input.reply
    .code(401)
    .header("www-authenticate", "Bearer")
    .send({
      error: input.error,
      status: "blocked",
    });
}

function readToken(request: FastifyRequest, headerName: string): string | undefined {
  const direct = request.headers[headerName];
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const authorization = request.headers.authorization;
  if (typeof authorization !== "string") return undefined;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

function tokensEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
