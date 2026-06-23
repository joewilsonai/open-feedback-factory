import assert from "node:assert/strict";
import test from "node:test";
import { clusterKeyForFeedback, deterministicCluster } from "./cluster.js";

test("clusterKeyForFeedback groups dark mode phrasing variants", () => {
  const variants = [
    "Please add dark mode",
    "Can you add a night mode?",
    "I want a dark theme in settings",
  ];

  assert.deepEqual(
    variants.map((message) => clusterKeyForFeedback({ sanitizedMessage: message })),
    [
      "feature.theme.dark-mode",
      "feature.theme.dark-mode",
      "feature.theme.dark-mode",
    ],
  );
});

test("clusterKeyForFeedback keeps theme color choices distinct from dark mode", () => {
  assert.equal(
    clusterKeyForFeedback({ sanitizedMessage: "Please let me change app color themes" }),
    "feature.theme.color-options",
  );
  assert.equal(
    clusterKeyForFeedback({ sanitizedMessage: "add different theme colors to the UI so user can select" }),
    "feature.theme.color-options",
  );
  assert.equal(
    clusterKeyForFeedback({
      sanitizedMessage:
        "create multiple themes with different colors the user can pick from, they should work in both light and dark mode.",
    }),
    "feature.theme.color-options",
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

test("clusterKeyForFeedback groups Daybook todo requests", () => {
  assert.equal(
    clusterKeyForFeedback({ sanitizedMessage: "Add due dates to todos" }),
    "feature.daybook.due-date-todo",
  );
  assert.equal(
    clusterKeyForFeedback({ sanitizedMessage: "Please add pinned notes" }),
    "feature.daybook.pinned-note",
  );
});

test("deterministicCluster marks dedicated buckets precise and the generic fallback imprecise", () => {
  assert.equal(deterministicCluster({ sanitizedMessage: "Please add dark mode" }).precise, true);
  assert.equal(deterministicCluster({ sanitizedMessage: "the app crashes on launch" }).precise, true);
  assert.equal(deterministicCluster({ sanitizedMessage: "Add due dates to todos" }).precise, true);
  assert.equal(
    deterministicCluster({ sanitizedMessage: "Copy update: change the save button label" }).precise,
    true,
  );

  // Brittle path: paraphrases of the same intent scatter into distinct keys,
  // which is exactly what the semantic clusterer is allowed to override.
  const a = deterministicCluster({ sanitizedMessage: "send me a watering reminder for my plants" });
  const b = deterministicCluster({ sanitizedMessage: "notify me when my plants need water" });
  assert.equal(a.precise, false);
  assert.equal(b.precise, false);
  assert.notEqual(a.clusterKey, b.clusterKey);
});
