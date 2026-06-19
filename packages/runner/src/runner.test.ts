import assert from "node:assert/strict";
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
import { DemoRunner } from "./demoRunner.js";
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
};

test("DemoRunner returns deterministic safe result", async () => {
  const result = await new DemoRunner().run(workItem);

  assert.equal(result.status, "succeeded");
  assert.deepEqual(result.changedFiles, ["apps/demo-app/src/styles.css"]);
  assert.equal(result.branchName, "off/demo/work_1");
});

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
  assert.match(prompt, /Do not commit, push, or open a pull request/);
  assert.match(prompt, /Do not inspect or request raw private feedback/);
  assert.doesNotMatch(prompt, /joe@example.com|sk-/i);
});

test("parseCodexJsonlOutput extracts final structured result and usage", () => {
  const output = [
    '{"type":"thread.started","thread_id":"thread_1"}',
    '{"type":"item.completed","item":{"id":"item_1","type":"error","message":"non-fatal warning"}}',
    '{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"{\\"outcome\\":\\"implemented\\",\\"summary\\":\\"parser smoke\\",\\"changedFiles\\":[\\"apps/demo-app/src/App.tsx\\"]}"}}',
    '{"type":"turn.completed","usage":{"input_tokens":22823,"cached_input_tokens":2432,"output_tokens":120,"reasoning_output_tokens":93}}',
  ].join("\n");

  const parsed = parseCodexJsonlOutput(output);

  assert.deepEqual(parsed.result, {
    changedFiles: ["apps/demo-app/src/App.tsx"],
    outcome: "implemented",
    summary: "parser smoke",
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
