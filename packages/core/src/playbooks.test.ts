import assert from "node:assert/strict";
import test from "node:test";
import { getPlaybook, listPlaybooks, playbooksForLifecycleStage } from "./playbooks.js";

test("listPlaybooks exposes the native OFF lifecycle team", () => {
  const playbooks = listPlaybooks();

  assert.deepEqual(
    playbooks.map((playbook) => playbook.id),
    [
      "feedback-interviewer",
      "product-critic",
      "product-planner",
      "engineering-reviewer",
      "design-reviewer",
      "security-privacy-reviewer",
      "qa-browser-runner",
      "release-manager",
      "docs-release-notes-writer",
      "retro-learning-writer",
    ],
  );

  for (const playbook of playbooks) {
    assert.equal(playbook.source, "off_native");
    assert.equal(playbook.license, "OFF-native");
    assert.equal(playbook.policyBoundary.canAccessSecrets, false);
    assert.equal(playbook.policyBoundary.canApproveMerge, false);
    assert.equal(playbook.policyBoundary.canChangePolicy, false);
    assert.equal(playbook.policyBoundary.canMarkShipped, false);
    assert.equal(playbook.policyBoundary.canNotifyUsers, false);
    assert.ok(playbook.version);
    assert.ok(playbook.requiredOutputSchema.length > 0);
    assert.ok(playbook.contractChecks.length > 0);
    assert.ok(playbook.lifecycleEvents.length > 0);
  }
});

test("getPlaybook returns immutable playbook metadata by id", () => {
  const playbook = getPlaybook("security-privacy-reviewer");

  assert.equal(playbook?.title, "Security / Privacy Reviewer");
  assert.equal(playbook?.canImplement, false);
  assert.deepEqual(playbook?.allowedRiskTiers, ["guarded_review", "extra_review", "plan_only"]);
});

test("playbooksForLifecycleStage returns ordered stage playbooks", () => {
  assert.deepEqual(
    playbooksForLifecycleStage("review").map((playbook) => playbook.id),
    ["engineering-reviewer", "design-reviewer", "security-privacy-reviewer"],
  );
  assert.deepEqual(
    playbooksForLifecycleStage("learn").map((playbook) => playbook.id),
    ["retro-learning-writer"],
  );
});
