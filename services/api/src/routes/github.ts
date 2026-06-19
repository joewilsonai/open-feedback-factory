import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.js";

export async function registerGithubRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.get("/github/app/manifest", async () => ({
    default_events: ["check_suite", "issues", "pull_request", "push"],
    default_permissions: {
      checks: "read",
      contents: "write",
      issues: "write",
      metadata: "read",
      pull_requests: "write",
    },
    description:
      "Open Feedback Factory turns sanitized user feedback into guarded GitHub issues and PRs.",
    hook_attributes: {
      active: true,
      url: `${deps.config.publicBaseUrl}/github/webhook`,
    },
    name: "Open Feedback Factory",
    public: false,
    redirect_url: `${deps.config.publicBaseUrl}/github/app/installed`,
    setup_url: `${deps.config.publicBaseUrl}/admin/control-room`,
    url: `https://github.com/${deps.config.githubOwner}/${deps.config.githubRepo}`,
  }));

  app.get("/github/app/installed", async (request) => ({
    installationId: queryString(request.query, "installation_id"),
    ok: true,
    setupAction: queryString(request.query, "setup_action"),
  }));

  app.post("/github/webhook", async (request, reply) => {
    const rawBody = (request as typeof request & { rawBody?: string }).rawBody ?? JSON.stringify(request.body ?? {});
    if (!verifyGithubSignature(rawBody, request.headers["x-hub-signature-256"], deps.config.githubWebhookSecret)) {
      return reply.code(401).send({ error: "invalid github signature" });
    }

    const event = String(request.headers["x-github-event"] ?? "unknown");
    const body = request.body as Record<string, unknown>;
    const result = await handleGithubWebhook(deps, event, body);
    return {
      ...result,
      event,
      mode: deps.config.githubMode,
      ok: true,
    };
  });
}

export async function handleGithubWebhook(
  deps: AppDeps,
  event: string,
  body: Record<string, unknown>,
): Promise<{ action: string | null; artifactId: string | null; workItemId: string | null }> {
  const action = typeof body.action === "string" ? body.action : null;
  const payload = event === "pull_request" ? asRecord(body.pull_request) : event === "issues" ? asRecord(body.issue) : null;
  const workItemId = extractWorkItemId(payload);
  const url = htmlUrl(payload);

  if (!workItemId || !url || (event !== "pull_request" && event !== "issues")) {
    return { action, artifactId: null, workItemId };
  }

  const artifactId = await deps.store.recordGithubArtifact({
    artifactNumber: numberFrom(payload, "number"),
    artifactType: event === "pull_request" ? "pull_request" : "issue",
    metadata: {
      action,
      event,
      state: stringFrom(payload, "state"),
    },
    url,
    workItemId,
  });

  await deps.store.recordAgentRun({
    agentName: "github-webhook",
    metadata: {
      action,
      artifactId,
      event,
      url,
    },
    runType: "github_webhook",
    status: "succeeded",
    summary: `Recorded GitHub ${event} artifact for ${workItemId}.`,
    workItemId,
  });

  return { action, artifactId, workItemId };
}

export function verifyGithubSignature(
  rawBody: string,
  signatureHeader: string | string[] | undefined,
  secret: string,
): boolean {
  if (!secret) return true;
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!signature?.startsWith("sha256=")) return false;

  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function extractWorkItemId(payload: Record<string, unknown> | null): string | null {
  const text = [stringFrom(payload, "body"), stringFrom(payload, "title")]
    .filter(Boolean)
    .join("\n");
  return text.match(/\bwork_[a-zA-Z0-9-]+\b/)?.[0] ?? null;
}

function htmlUrl(payload: Record<string, unknown> | null): string | null {
  return stringFrom(payload, "html_url");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function numberFrom(value: Record<string, unknown> | null, key: string): number | undefined {
  const raw = value?.[key];
  return typeof raw === "number" ? raw : undefined;
}

function queryString(value: unknown, key: string): string | null {
  const record = asRecord(value);
  const item = record?.[key];
  return typeof item === "string" ? item : null;
}

function stringFrom(value: Record<string, unknown> | null, key: string): string | null {
  const raw = value?.[key];
  return typeof raw === "string" ? raw : null;
}
