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

test("routeFeedback names theme color requests distinctly from dark mode", () => {
  const sanitized = sanitizeFeedback({
    message: "create multiple themes with different colors the user can pick from, they should work in both light and dark mode.",
    source: "daybook_demo_app",
  });

  const decision = routeFeedback({ sanitized });

  assert.equal(decision.action, "create_work_item");
  assert.equal(decision.shouldCreateIssue, true);
  assert.equal(decision.riskTier, "safe_auto_merge");
  assert.equal(decision.title, "Add theme color choices");
  assert.equal(decision.clusterKey, "feature.theme.color-options");
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

test("routeFeedback promotes repeated unclear requests into guarded work", () => {
  const sanitized = sanitizeFeedback({
    message: "Make the dashboard more delightful",
    source: "demo",
  });

  const decision = routeFeedback({ sanitized, signalCount: 2 });

  assert.equal(decision.action, "create_work_item");
  assert.equal(decision.shouldCreateIssue, true);
  assert.equal(decision.riskTier, "guarded_review");
  assert.equal(decision.userStatus, "planned");
  assert.equal(decision.title, "Review repeated feature request");
});

test("routeFeedback queues safe Daybook todo features", () => {
  const sanitized = sanitizeFeedback({
    message: "Add due dates to todos",
    source: "demo",
  });

  const decision = routeFeedback({ sanitized });

  assert.equal(decision.action, "create_work_item");
  assert.equal(decision.shouldCreateIssue, true);
  assert.equal(decision.riskTier, "safe_auto_merge");
  assert.equal(decision.title, "Add due dates to todos");
  assert.equal(decision.userStatus, "planned");
  assert.equal(decision.clusterKey, "feature.daybook.due-date-todo");
});

test("routeFeedback names editable open task requests distinctly", () => {
  const sanitized = sanitizeFeedback({
    message: "allow the user to edit tasks that are still open",
    source: "daybook_demo_app",
  });

  const decision = routeFeedback({ sanitized });

  assert.equal(decision.action, "create_work_item");
  assert.equal(decision.shouldCreateIssue, true);
  assert.equal(decision.riskTier, "safe_auto_merge");
  assert.equal(decision.title, "Edit open tasks");
  assert.equal(decision.clusterKey, "feature.daybook.allow-user-edit-todo-that-are-still-open");
});
