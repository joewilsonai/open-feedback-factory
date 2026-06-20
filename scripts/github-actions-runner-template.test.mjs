import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("GitHub Actions worker template is manual and secret-backed", async () => {
  const workflow = await readFile(new URL("../templates/github-actions/off-worker.yml", import.meta.url), "utf8");

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /work_item_id:/);
  assert.match(workflow, /repository_full_name:/);
  assert.match(workflow, /OFF_API_BASE_URL:/);
  assert.match(workflow, /OFF_RUNNER_TOKEN:/);
  assert.match(workflow, /OPENAI_API_KEY:/);
  assert.match(workflow, /CODEX_AUTH_MODE: api_key/);
  assert.match(workflow, /WORKER_RUN_ONCE: "true"/);
  assert.match(workflow, /WORKER_WORK_ITEM_ID: \${{ inputs\.work_item_id }}/);
  assert.match(workflow, /RUNNER_TOKEN: \${{ secrets\.OFF_RUNNER_TOKEN }}/);
  assert.match(workflow, /GITHUB_CREATE_PR: "true"/);
  assert.doesNotMatch(workflow, /sk-[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(workflow, /-----BEGIN [A-Z ]+PRIVATE KEY-----/);
});
