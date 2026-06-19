import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.js";

export async function registerGithubRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.get("/github/app/manifest", async () => buildGithubAppManifest(deps));

  app.get("/github/app/setup", async (request, reply) => {
    const ownerType = queryString(request.query, "owner_type") === "organization" ? "organization" : "user";
    const owner = queryString(request.query, "owner") ?? deps.config.githubOwner;
    const action =
      ownerType === "organization"
        ? `https://github.com/organizations/${encodeURIComponent(owner)}/settings/apps/new`
        : "https://github.com/settings/apps/new";
    const manifest = JSON.stringify(buildGithubAppManifest(deps));

    return reply.type("text/html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Create Open Feedback Factory GitHub App</title>
  </head>
  <body>
    <main>
      <h1>Create Open Feedback Factory GitHub App</h1>
      <p>This posts the V1 GitHub App manifest to GitHub. GitHub will ask you to confirm the app name and permissions.</p>
      <form method="post" action="${escapeHtml(action)}">
        <input type="hidden" name="manifest" value="${escapeHtml(manifest)}">
        <input type="hidden" name="state" value="open-feedback-factory">
        <button type="submit">Create GitHub App</button>
      </form>
    </main>
  </body>
</html>`);
  });

  app.get("/github/app/installed", async (request) => ({
    code: queryString(request.query, "code"),
    installationId: queryString(request.query, "installation_id"),
    ok: true,
    setupAction: queryString(request.query, "setup_action"),
    state: queryString(request.query, "state"),
  }));

  app.post<{ Body: { code?: string } }>("/github/app/manifest/conversions", async (request, reply) => {
    if (!request.body.code) return reply.code(400).send({ error: "code is required" });
    const converted = await convertGithubAppManifestCode(request.body.code);
    return {
      appId: converted.id,
      clientId: converted.client_id,
      pem: converted.pem,
      webhookSecret: converted.webhook_secret,
    };
  });

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

export function buildGithubAppManifest(deps: AppDeps): Record<string, unknown> {
  return {
    callback_urls: [`${deps.config.publicBaseUrl}/github/app/installed`],
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
  };
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

async function convertGithubAppManifestCode(code: string): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`, {
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
    },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`GitHub App manifest conversion failed ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
