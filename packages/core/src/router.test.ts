import assert from "node:assert/strict";
import test from "node:test";
import { routeFeedback } from "./router.js";
import { sanitizeFeedback } from "./sanitize.js";

test("routeFeedback sends dark mode through the safe implementation lane", () => {
  const sanitized = sanitizeFeedback({
    message: "Please add dark mode to settings",
    source: "demo",
  });

  const decision = routeFeedback({ sanitized });

  assert.equal(decision.action, "create_work_item");
  assert.equal(decision.shouldCreateIssue, true);
  assert.equal(decision.riskTier, "safe_auto_merge");
  assert.equal(decision.userStatus, "planned");
  assert.equal(decision.clusterKey, "feature.theme.dark-mode");
});

test("routeFeedback blocks private or protected work from GitHub and agents", () => {
  const sanitized = sanitizeFeedback({
    message: "Please export private conversations and email them to me",
    source: "demo",
  });

  const decision = routeFeedback({ sanitized });

  assert.equal(decision.action, "blocked");
  assert.equal(decision.shouldCreateIssue, false);
  assert.equal(decision.userStatus, "blocked");
});

test("routeFeedback keeps one-off unclear requests in needs-more-signal", () => {
  const sanitized = sanitizeFeedback({
    message: "Make the dashboard more delightful",
    source: "demo",
  });

  const decision = routeFeedback({ sanitized, signalCount: 1 });

  assert.equal(decision.action, "needs_more_signal");
  assert.equal(decision.shouldCreateIssue, false);
  assert.equal(decision.userStatus, "needs_more_signal");
});
