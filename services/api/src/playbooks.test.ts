import assert from "node:assert/strict";
import test from "node:test";
import { listPlaybooks } from "@open-feedback-factory/core";

test("native playbook registry keeps playbooks advisory to product policy", () => {
  const playbooks = listPlaybooks();

  assert.equal(playbooks.length, 10);
  assert.equal(playbooks.some((playbook) => playbook.canImplement), true);
  assert.equal(
    playbooks.every(
      (playbook) =>
        !playbook.policyBoundary.canAccessSecrets &&
        !playbook.policyBoundary.canApproveMerge &&
        !playbook.policyBoundary.canChangePolicy &&
        !playbook.policyBoundary.canMarkShipped &&
        !playbook.policyBoundary.canNotifyUsers,
    ),
    true,
  );
});
