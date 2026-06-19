import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.js";

const LOCAL_WEBHOOK_PLACEHOLDER_URL = "https://example.com/open-feedback-factory/webhook-disabled";

export async function registerGithubRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.get("/github/app/manifest", async () => buildGithubAppManifest(deps));

  app.get("/github/app/setup", async (request, reply) => {
    const ownerType = queryString(request.query, "owner_type") === "organization" ? "organization" : "user";
    const owner = queryString(request.query, "owner") ?? deps.config.githubOwner;
    const webhooksEnabled = githubWebhooksEnabledForBaseUrl(deps.config.publicBaseUrl);
    const action =
      ownerType === "organization"
        ? `https://github.com/organizations/${encodeURIComponent(owner)}/settings/apps/new`
        : "https://github.com/settings/apps/new";
    const manifest = JSON.stringify(buildGithubAppManifest(deps));

    if (!webhooksEnabled) {
      return reply.type("text/html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Prepare Open Feedback Factory GitHub App</title>
  </head>
  <body>
    <main>
      <h1>Prepare GitHub App Setup</h1>
      <p>GitHub will not create a manifest-based App from localhost URLs. Start a public HTTPS tunnel, set <code>PUBLIC_BASE_URL</code> to that tunnel URL, restart Docker, then return here.</p>
      <pre>pnpm run tunnel:tailscale
tailscale funnel status</pre>
      <p>Cloudflared also works if Tailscale Funnel is not enabled:</p>
      <pre>cloudflared tunnel --url http://localhost:4100</pre>
      <p>After the tunnel prints an HTTPS URL:</p>
      <pre>PUBLIC_BASE_URL=https://your-tunnel.trycloudflare.com
docker compose up -d --build</pre>
      <p><a href="/github/app/manifest">View current local manifest</a></p>
    </main>
  </body>
</html>`);
    }

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
      <p>Webhook events are enabled because PUBLIC_BASE_URL is publicly reachable.</p>
      <form method="post" action="${escapeHtml(action)}">
        <input type="hidden" name="manifest" value="${escapeHtml(manifest)}">
        <input type="hidden" name="state" value="open-feedback-factory">
        <button type="submit">Create GitHub App</button>
      </form>
    </main>
  </body>
</html>`);
  });

  app.get("/github/app/installed", async (request, reply) => {
    const code = queryString(request.query, "code");
    const installationId = queryString(request.query, "installation_id");
    const setupAction = queryString(request.query, "setup_action");
    const state = queryString(request.query, "state");
    const wantsJson = String(request.headers.accept ?? "").includes("application/json");
    const payload = { code, installationId, ok: true, setupAction, state };
    if (wantsJson) return payload;

    return reply.type("text/html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Open Feedback Factory GitHub App Installed</title>
    <style>
      body { margin: 0; color: #161a1f; background: #edeff0; font: 16px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      main { max-width: 900px; margin: 0 auto; padding: clamp(24px, 5vw, 56px); }
      h1 { margin: 0 0 12px; font-size: clamp(40px, 8vw, 76px); line-height: .92; letter-spacing: 0; }
      p { max-width: 70ch; margin: 0 0 18px; color: #52605a; }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; margin: 24px 0; background: rgba(22,26,31,.16); border: 1px solid rgba(22,26,31,.16); }
      .cell { min-height: 96px; padding: 16px; background: rgba(255,255,255,.86); }
      dt { color: #65706c; font-size: 12px; font-weight: 850; letter-spacing: .06em; text-transform: uppercase; }
      dd { margin: 6px 0 0; font-weight: 750; overflow-wrap: anywhere; }
      pre { overflow: auto; padding: 16px; background: #161a1f; color: #f4f6f8; border-radius: 7px; }
      .actions { display: flex; gap: 12px; flex-wrap: wrap; margin: 0 0 18px; }
      .primary { border-color: #255bc7; color: #fff; background: #255bc7; }
      .output { min-height: 132px; white-space: pre-wrap; }
      a, button { color: #255bc7; font-weight: 800; }
      button { min-height: 42px; border: 1px solid rgba(22,26,31,.22); border-radius: 7px; padding: 0 14px; background: white; cursor: pointer; }
      button.primary { color: #fff; }
      @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main>
      <h1>GitHub App Returned</h1>
      <p>GitHub created the temporary manifest code. Convert it locally, add the generated values to <code>.env</code>, then restart the stack.</p>
      <dl class="grid">
        <div class="cell"><dt>Temporary code</dt><dd>${escapeHtml(code ?? "missing")}</dd></div>
        <div class="cell"><dt>Installation</dt><dd>${escapeHtml(installationId ?? "created after repo install")}</dd></div>
        <div class="cell"><dt>Setup action</dt><dd>${escapeHtml(setupAction ?? "none")}</dd></div>
        <div class="cell"><dt>State</dt><dd>${escapeHtml(state ?? "none")}</dd></div>
      </dl>
      ${
        code
          ? `<p>Generate the local Docker values from this temporary code, then paste them into <code>.env</code> and restart Docker.</p>
      <div class="actions">
        <button class="primary" id="convert" type="button">Generate env values</button>
        <button id="copy" type="button">Copy env values</button>
      </div>
      <pre class="output" id="env-output">Waiting to convert the GitHub manifest code.</pre>
      <p>Fallback command:</p>
      <pre>curl -s -X POST ${escapeHtml(deps.config.publicBaseUrl)}/github/app/manifest/conversions \\
  -H 'content-type: application/json' \\
  -d '{"code":"${escapeHtml(code)}"}'</pre>`
          : "<p>No temporary code was present in the callback. Start again from the setup wizard.</p>"
      }
      <p><a href="${escapeHtml(deps.config.controlCenterUrl)}">Return to the control center</a></p>
    </main>
    ${
      code
        ? `<script>
      const manifestCode = ${jsonForScript(code)};
      const output = document.getElementById("env-output");
      document.getElementById("convert")?.addEventListener("click", async () => {
        output.textContent = "Converting manifest code...";
        try {
          const response = await fetch("/github/app/manifest/conversions", {
            body: JSON.stringify({ code: manifestCode }),
            headers: { "content-type": "application/json" },
            method: "POST"
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || "GitHub conversion failed");
          output.textContent = body.envSnippet;
        } catch (error) {
          output.textContent = error instanceof Error ? error.message : "GitHub conversion failed";
        }
      });
      document.getElementById("copy")?.addEventListener("click", async () => {
        await navigator.clipboard.writeText(output.textContent || "");
      });
    </script>`
        : ""
    }
  </body>
</html>`);
  });

  app.post<{ Body: { code?: string } }>("/github/app/manifest/conversions", async (request, reply) => {
    if (!request.body.code) return reply.code(400).send({ error: "code is required" });
    const converted = await convertGithubAppManifestCode(request.body.code);
    return {
      appId: converted.id,
      clientId: converted.client_id,
      envSnippet: buildGithubAppEnvSnippet(converted),
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
  const manifest: Record<string, unknown> = {
    callback_urls: [`${deps.config.publicBaseUrl}/github/app/installed`],
    default_permissions: {
      contents: "write",
      issues: "write",
      pull_requests: "write",
    },
    description:
      "Open Feedback Factory turns sanitized user feedback into guarded GitHub issues and PRs.",
    hook_attributes: {
      active: false,
      url: LOCAL_WEBHOOK_PLACEHOLDER_URL,
    },
    name: "Open Feedback Factory",
    public: false,
    redirect_url: `${deps.config.publicBaseUrl}/github/app/installed`,
    url: `https://github.com/${deps.config.githubOwner}/${deps.config.githubRepo}`,
  };

  if (githubWebhooksEnabledForBaseUrl(deps.config.controlCenterUrl)) {
    manifest.setup_url = deps.config.controlCenterUrl;
  }

  if (githubWebhooksEnabledForBaseUrl(deps.config.publicBaseUrl)) {
    manifest.default_events = ["issues", "pull_request", "push"];
    manifest.hook_attributes = {
      active: true,
      url: `${deps.config.publicBaseUrl}/github/webhook`,
    };
  }

  return manifest;
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

function jsonForScript(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function buildGithubAppEnvSnippet(converted: Record<string, unknown>): string {
  const appId = String(converted.id ?? "");
  const pem = String(converted.pem ?? "").replace(/\n/g, "\\n");
  const webhookSecret = String(converted.webhook_secret ?? "");
  return [
    "GITHUB_MODE=app",
    `GITHUB_APP_ID=${appId}`,
    `GITHUB_APP_PRIVATE_KEY=${pem}`,
    `GITHUB_WEBHOOK_SECRET=${webhookSecret}`,
  ].join("\n");
}

export function githubWebhooksEnabledForBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
    if (host === "0.0.0.0" || host === "::1") return false;
    if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return false;

    const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (!ipv4) return true;

    const octets = ipv4.slice(1).map(Number);
    const a = octets[0] ?? -1;
    const b = octets[1] ?? -1;
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    return true;
  } catch {
    return false;
  }
}
