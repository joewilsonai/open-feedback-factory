import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  buildCodexCostActual,
  buildCodexBranchName,
  buildCodexCommitMessage,
  buildCodexExecArgs,
  buildCodexPrompt,
  costFromUsage,
  normalizeCodexEffort,
  parseCodexJsonlOutput,
} from "./codexCliRunner.js";
import { createGitHubAppJwt, GitHubClient, normalizePrivateKey } from "./githubClient.js";
import type { WorkItemRow } from "@open-feedback-factory/db";

const workItem: WorkItemRow = {
  autoMergeEligible: false,
  category: "theme",
  clusterKey: "feature.theme.dark-mode",
  costEstimate: {
    amountUsd: 1.5,
    confidence: "low",
    currency: "USD",
    model: "gpt-5.5",
    reason: "test",
  },
  createdAt: new Date(0).toISOString(),
  githubIssueUrl: null,
  githubPrUrl: null,
  id: "work_1",
  riskTier: "safe_auto_merge",
  shouldCreateIssue: true,
  status: "planned",
  summary: "Please add dark mode to settings",
  title: "Add a dark mode option",
  updatedAt: new Date(0).toISOString(),
  userStatus: "planned",
  unresolvedAssumptions: [],
};

test("buildCodexExecArgs uses local codex exec json mode with output schema", () => {
  assert.deepEqual(
    buildCodexExecArgs({
      cwd: "/repo",
      effort: "extra-high",
      model: "gpt-5.5",
      schemaPath: "/tmp/schema.json",
    }),
    [
      "exec",
      "--json",
      "--model",
      "gpt-5.5",
      "-c",
      'model_reasoning_effort="xhigh"',
      "--ignore-user-config",
      "--sandbox",
      "workspace-write",
      "--cd",
      "/repo",
      "--output-schema",
      "/tmp/schema.json",
      "-",
    ],
  );
});

test("normalizeCodexEffort maps product language to CLI enum", () => {
  assert.equal(normalizeCodexEffort("extra-high"), "xhigh");
  assert.equal(normalizeCodexEffort("HIGH"), "high");
});

test("buildCodexBranchName creates safe branch names", () => {
  assert.equal(buildCodexBranchName("work_1"), "off/codex/work_1");
  assert.equal(buildCodexBranchName("work:unsafe id", "agent"), "agent/work-unsafe-id");
});

test("buildCodexCommitMessage ties commits to work item ids", () => {
  assert.equal(buildCodexCommitMessage(workItem), "feat: Add a dark mode option (work_1)");
});

test("buildCodexPrompt contains sanitized work item context only", () => {
  const prompt = buildCodexPrompt(workItem);

  assert.match(prompt, /Please add dark mode to settings/);
  assert.match(prompt, /make only the requested file\/content change/i);
  assert.match(prompt, /Return structured output with assumptions/);
  assert.match(prompt, /Do not commit, push, or open a pull request/);
  assert.match(prompt, /Do not inspect or request raw private feedback/);
  assert.doesNotMatch(prompt, /joe@example.com|sk-/i);
});

test("parseCodexJsonlOutput extracts final structured result and usage", () => {
  const output = [
    '{"type":"thread.started","thread_id":"thread_1"}',
    '{"type":"item.completed","item":{"id":"item_1","type":"error","message":"non-fatal warning"}}',
    '{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"{\\"outcome\\":\\"implemented\\",\\"summary\\":\\"parser smoke\\",\\"changedFiles\\":[\\"apps/demo-app/src/App.tsx\\"],\\"assumptions\\":[\\"Assumed Daybook demo app is the target\\"],\\"checksRun\\":[\\"pnpm test\\"],\\"checksSkipped\\":[\\"No browser smoke in parser test\\"],\\"costSummary\\":\\"usage captured\\",\\"userMessage\\":\\"The requested change is ready for review.\\"}"}}',
    '{"type":"turn.completed","usage":{"input_tokens":22823,"cached_input_tokens":2432,"output_tokens":120,"reasoning_output_tokens":93}}',
  ].join("\n");

  const parsed = parseCodexJsonlOutput(output);

  assert.deepEqual(parsed.result, {
    assumptions: ["Assumed Daybook demo app is the target"],
    changedFiles: ["apps/demo-app/src/App.tsx"],
    checksRun: ["pnpm test"],
    checksSkipped: ["No browser smoke in parser test"],
    costSummary: "usage captured",
    outcome: "implemented",
    summary: "parser smoke",
    userMessage: "The requested change is ready for review.",
  });
  assert.deepEqual(parsed.usage, {
    cachedInputTokens: 2432,
    inputTokens: 22823,
    outputTokens: 120,
    reasoningOutputTokens: 93,
  });
  assert.equal(parsed.errors.includes("non-fatal warning"), true);
});

test("buildCodexCostActual preserves estimate and attaches token totals without pricing", () => {
  assert.deepEqual(
    buildCodexCostActual({
      estimateAmountUsd: 1.5,
      model: "gpt-5.5",
      usage: {
        cachedInputTokens: 100,
        inputTokens: 1000,
        outputTokens: 200,
        reasoningOutputTokens: 50,
      },
    }),
    {
      amountUsd: 1.5,
      confidence: "low",
      model: "gpt-5.5",
      tokens: 1250,
    },
  );
});

test("costFromUsage prices uncached, cached, output, and reasoning tokens", () => {
  assert.equal(
    costFromUsage(
      {
        cachedInputTokens: 100,
        inputTokens: 1100,
        outputTokens: 200,
        reasoningOutputTokens: 50,
      },
      {
        cachedInputUsdPerMillion: 0.25,
        inputUsdPerMillion: 1,
        outputUsdPerMillion: 10,
        reasoningOutputUsdPerMillion: 10,
      },
    ),
    0.003525,
  );
});

test("buildCodexCostActual uses configured pricing when usage is available", () => {
  const cost = buildCodexCostActual({
    estimateAmountUsd: 1.5,
    model: "gpt-5.5",
    pricing: {
      cachedInputUsdPerMillion: 0.25,
      inputUsdPerMillion: 1,
      outputUsdPerMillion: 10,
      reasoningOutputUsdPerMillion: 10,
    },
    usage: {
      cachedInputTokens: 100,
      inputTokens: 1100,
      outputTokens: 200,
      reasoningOutputTokens: 50,
    },
  });

  assert.equal(cost.amountUsd, 0.003525);
  assert.equal(cost.confidence, "high");
  assert.equal(cost.tokens, 1350);
});

test("createGitHubAppJwt signs a GitHub App JWT with expected claims", () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const token = createGitHubAppJwt({ appId: "12345", nowSeconds: 1_800_000_000, privateKey: pem });
  const [header, payload, signature] = token.split(".");

  assert.ok(header);
  assert.ok(payload);
  assert.ok(signature);
  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url").toString("utf8")), { alg: "RS256", typ: "JWT" });
  assert.deepEqual(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")), {
    exp: 1_800_000_540,
    iat: 1_799_999_940,
    iss: "12345",
  });
});

test("GitHubClient app mode creates sanitized issues with installation tokens", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const calls: Array<{ body: unknown; method: string; url: string }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({
      body: init?.body ? JSON.parse(String(init.body)) : null,
      method: init?.method ?? "GET",
      url: String(url),
    });
    if (String(url).endsWith("/repos/owner/repo/installation")) {
      assert.match((init?.headers as Record<string, string>).authorization ?? "", /^Bearer /);
      return jsonResponse({ id: 456 });
    }
    if (String(url).endsWith("/app/installations/456/access_tokens")) {
      return jsonResponse({ expires_at: new Date(Date.now() + 60_000).toISOString(), token: "installation-token" });
    }
    if (String(url).endsWith("/repos/owner/repo/issues")) {
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer installation-token");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        body: "Work item: work_1\nSanitized summary only.",
        labels: ["enhancement"],
        title: "Improve product copy",
      });
      return jsonResponse({ html_url: "https://github.com/owner/repo/issues/7" });
    }
    return new Response("not found", { status: 404 });
  };

  const client = new GitHubClient({
    appId: "123",
    appPrivateKey: normalizePrivateKey(pem.replace(/\n/g, "\\n")),
    cwd: "/repo",
    fetch: fetchImpl,
    mode: "app",
    owner: "owner",
    repo: "repo",
  });

  const url = await client.createIssue({
    body: "Work item: work_1\nSanitized summary only.",
    labels: ["enhancement"],
    title: "Improve product copy",
  });

  assert.equal(url, "https://github.com/owner/repo/issues/7");
  assert.deepEqual(
    calls.map((call) => `${call.method} ${call.url}`),
    [
      "GET https://api.github.com/repos/owner/repo/installation",
      "POST https://api.github.com/app/installations/456/access_tokens",
      "POST https://api.github.com/repos/owner/repo/issues",
    ],
  );
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}
