import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeIntentSlug,
  resolveClusterKey,
  type IntentClassification,
  type IntentClassifier,
} from "./semanticCluster.js";

function classifierReturning(
  result: IntentClassification | null,
  calls: string[] = [],
): IntentClassifier {
  return {
    async classify(message) {
      calls.push(message);
      return result;
    },
  };
}

test("dedicated (precise) buckets win without ever calling the classifier", async () => {
  const calls: string[] = [];
  const classifier = classifierReturning({ clusterKey: "should-not-be-used" }, calls);

  const resolved = await resolveClusterKey(
    { sanitizedMessage: "Please add dark mode", privacyRisk: "low" },
    { classifier },
  );

  assert.equal(resolved.clusterKey, "feature.theme.dark-mode");
  assert.equal(resolved.source, "deterministic");
  assert.equal(resolved.precise, true);
  assert.equal(resolved.attempted, false);
  assert.deepEqual(calls, [], "classifier must not be called for precise buckets");
});

test("generic-fallback paraphrases collapse onto the classifier's canonical key", async () => {
  const calls: string[] = [];
  const classifier = classifierReturning(
    { clusterKey: "watering-reminders", title: "Watering reminders" },
    calls,
  );

  const a = await resolveClusterKey(
    { sanitizedMessage: "send me a watering reminder when my plants need water", privacyRisk: "low" },
    { classifier },
  );
  const b = await resolveClusterKey(
    { sanitizedMessage: "push notifications for watering schedules please", privacyRisk: "medium" },
    { classifier },
  );

  assert.equal(a.clusterKey, "feature.intent.watering-reminders");
  assert.equal(a.source, "semantic");
  assert.equal(a.title, "Watering reminders");
  assert.equal(b.clusterKey, a.clusterKey, "paraphrases must land in the same cluster");
  assert.equal(calls.length, 2, "both generic-fallback messages consult the classifier");
});

test("resolveClusterKey offers existing clusters and reuses a returned key", async () => {
  let seenExisting: unknown = "unset";
  const classifier: IntentClassifier = {
    async classify(_message, existing) {
      seenExisting = existing;
      return { clusterKey: "feature.intent.watering-reminders", title: "Watering reminders" };
    },
  };
  const resolved = await resolveClusterKey(
    { sanitizedMessage: "ping me to water the plants", privacyRisk: "low" },
    {
      classifier,
      getExistingClusters: async () => [
        { clusterKey: "feature.intent.watering-reminders", title: "Watering reminders" },
      ],
    },
  );
  assert.deepEqual(seenExisting, [
    { clusterKey: "feature.intent.watering-reminders", title: "Watering reminders" },
  ]);
  assert.equal(resolved.clusterKey, "feature.intent.watering-reminders");
  assert.equal(resolved.source, "semantic");
  assert.equal(resolved.attempted, true);
});

test("existing-cluster loader is NOT called on the deterministic (precise) path", async () => {
  let loaderCalled = false;
  await resolveClusterKey(
    { sanitizedMessage: "please add dark mode", privacyRisk: "low" },
    {
      classifier: classifierReturning({ clusterKey: "x" }),
      getExistingClusters: async () => {
        loaderCalled = true;
        return [];
      },
    },
  );
  assert.equal(loaderCalled, false, "dedicated buckets must not pay for the cluster lookup");
});

test("a failing existing-cluster loader still classifies with empty context", async () => {
  let seenExisting: unknown = "unset";
  const classifier: IntentClassifier = {
    async classify(_message, existing) {
      seenExisting = existing;
      return { clusterKey: "new-intent" };
    },
  };
  const resolved = await resolveClusterKey(
    { sanitizedMessage: "some uncategorized widget request", privacyRisk: "low" },
    {
      classifier,
      getExistingClusters: async () => {
        throw new Error("db unavailable");
      },
    },
  );
  assert.deepEqual(seenExisting, []);
  assert.equal(resolved.clusterKey, "feature.intent.new-intent");
});

test("classifier only ever receives the sanitized message text", async () => {
  const calls: string[] = [];
  const classifier = classifierReturning({ clusterKey: "intent-x" }, calls);

  await resolveClusterKey(
    { sanitizedMessage: "a brand new feature idea that does not match any bucket", privacyRisk: "low" },
    { classifier },
  );

  assert.deepEqual(calls, ["a brand new feature idea that does not match any bucket"]);
});

test("blocked feedback is never sent to the classifier", async () => {
  const calls: string[] = [];
  const classifier = classifierReturning({ clusterKey: "intent-x" }, calls);

  const resolved = await resolveClusterKey(
    { sanitizedMessage: "generic request with [REDACTED] secret", privacyRisk: "blocked" },
    { classifier },
  );

  assert.equal(resolved.source, "deterministic");
  assert.deepEqual(calls, [], "blocked feedback must not leave the box");
});

test("protected-area feedback is never sent to the classifier", async () => {
  const calls: string[] = [];
  const classifier = classifierReturning({ clusterKey: "intent-x" }, calls);

  // Generic-fallback shape (not a dedicated bucket) but touches a protected
  // area — the router would block it from agents, so the model must not see it.
  const resolved = await resolveClusterKey(
    { sanitizedMessage: "please add a password reset flow to the login screen", privacyRisk: "low" },
    { classifier },
  );

  assert.equal(resolved.source, "deterministic");
  assert.deepEqual(calls, [], "protected-area content must not reach the model");
});

test("high privacy-risk feedback is never sent to the classifier", async () => {
  const calls: string[] = [];
  const classifier = classifierReturning({ clusterKey: "intent-x" }, calls);

  const resolved = await resolveClusterKey(
    { sanitizedMessage: "add a widget dashboard please", privacyRisk: "high" },
    { classifier },
  );

  assert.equal(resolved.source, "deterministic");
  assert.deepEqual(calls, [], "high privacy-risk content must not reach the model");
});

test("a classifier that never settles times out and falls back deterministically", async () => {
  const hanging: IntentClassifier = {
    classify() {
      return new Promise(() => {
        /* never resolves */
      });
    },
  };

  const resolved = await resolveClusterKey(
    { sanitizedMessage: "a different uncategorized widget request", privacyRisk: "low" },
    { classifier: hanging, timeoutMs: 20 },
  );

  assert.equal(resolved.source, "deterministic");
  assert.ok(resolved.clusterKey.startsWith("feedback."));
});

test("null classification keeps the deterministic key (attempted)", async () => {
  const resolved = await resolveClusterKey(
    { sanitizedMessage: "some uncategorized request about widgets", privacyRisk: "low" },
    { classifier: classifierReturning(null) },
  );

  assert.equal(resolved.source, "deterministic");
  assert.equal(resolved.attempted, true);
  assert.ok(resolved.clusterKey.startsWith("feedback."));
});

test("an unusable classifier key falls back deterministically (attempted)", async () => {
  const resolved = await resolveClusterKey(
    { sanitizedMessage: "yet another uncategorized widget request", privacyRisk: "low" },
    { classifier: classifierReturning({ clusterKey: "!!!" }) },
  );

  assert.equal(resolved.source, "deterministic");
  assert.equal(resolved.attempted, true);
  assert.ok(resolved.clusterKey.startsWith("feedback."));
});

test("a throwing classifier never breaks intake — falls back deterministically", async () => {
  const throwing: IntentClassifier = {
    async classify() {
      throw new Error("model timeout");
    },
  };

  const resolved = await resolveClusterKey(
    { sanitizedMessage: "another uncategorized widget request", privacyRisk: "low" },
    { classifier: throwing },
  );

  assert.equal(resolved.source, "deterministic");
  assert.equal(resolved.attempted, true, "fell back, but the classifier was attempted");
  assert.ok(resolved.clusterKey.startsWith("feedback."));
});

test("with no classifier configured, behavior is pure deterministic", async () => {
  const resolved = await resolveClusterKey({
    sanitizedMessage: "send me a watering reminder for my plants",
    privacyRisk: "low",
  });
  assert.equal(resolved.source, "deterministic");
});

test("normalizeIntentSlug sanitizes untrusted model output", () => {
  assert.equal(normalizeIntentSlug("Watering Reminders"), "watering-reminders");
  assert.equal(normalizeIntentSlug("feature.intent.dark-mode"), "dark-mode");
  assert.equal(normalizeIntentSlug("  Spaces  &  Symbols!! "), "spaces-symbols");
  assert.equal(normalizeIntentSlug(""), null);
  assert.equal(normalizeIntentSlug("!!!"), null);
  assert.equal(normalizeIntentSlug(undefined), null);
  const capped = normalizeIntentSlug("a".repeat(200));
  assert.ok(capped);
  assert.equal(capped.length, 64);
});
