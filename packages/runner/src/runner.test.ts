import assert from "node:assert/strict";
import test from "node:test";
import { buildCodexExecArgs, buildCodexPrompt } from "./codexCliRunner.js";
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
      'model_reasoning_effort="extra-high"',
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

test("buildCodexPrompt contains sanitized work item context only", () => {
  const prompt = buildCodexPrompt(workItem);

  assert.match(prompt, /Please add dark mode to settings/);
  assert.match(prompt, /Do not inspect or request raw private feedback/);
  assert.doesNotMatch(prompt, /joe@example.com|sk-/i);
});
