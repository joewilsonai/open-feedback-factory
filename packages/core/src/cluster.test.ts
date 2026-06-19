import assert from "node:assert/strict";
import test from "node:test";
import { clusterKeyForFeedback } from "./cluster.js";

test("clusterKeyForFeedback groups dark mode phrasing variants", () => {
  const variants = [
    "Please add dark mode",
    "Can you add a night mode?",
    "I want a dark theme in settings",
    "Please let me change app color themes",
  ];

  assert.deepEqual(
    variants.map((message) => clusterKeyForFeedback({ sanitizedMessage: message })),
    [
      "feature.theme.dark-mode",
      "feature.theme.dark-mode",
      "feature.theme.dark-mode",
      "feature.theme.dark-mode",
    ],
  );
});

test("clusterKeyForFeedback keeps unrelated copy requests separate", () => {
  assert.equal(
    clusterKeyForFeedback({ sanitizedMessage: "Copy update: change the save button label to Done" }),
    "safe.copy.change-save-button-done",
  );
  assert.equal(
    clusterKeyForFeedback({ sanitizedMessage: "Copy update: create docs codex runner smoke file" }),
    "safe.copy.docs-codex-runner-smoke-file",
  );
});
