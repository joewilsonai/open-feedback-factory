import assert from "node:assert/strict";
import test from "node:test";
import { routeFeedback, sanitizeFeedback } from "@open-feedback-factory/core";
import { OpenFeedbackStore } from "./client.js";
import { migrateDatabase } from "./migrate.js";

const databaseUrl = process.env.TEST_DATABASE_URL;

test("OpenFeedbackStore creates feedback, work item, status, and usage", { skip: !databaseUrl }, async () => {
  assert.ok(databaseUrl);
  await migrateDatabase(databaseUrl);
  const store = new OpenFeedbackStore(databaseUrl);

  try {
    const feedback = {
      message: "Please add dark mode to settings",
      metadata: { route: "/settings", surface: "settings" },
      source: "test",
      userId: "user-1",
    };
    const sanitized = sanitizeFeedback(feedback);
    const decision = routeFeedback({ sanitized });
    const intake = await store.createFeedbackIntake({ decision, feedback, sanitized });

    assert.match(intake.feedbackId, /^feedback_/);
    assert.match(intake.workItemId ?? "", /^work_/);
    assert.equal(intake.status.state, "planned");

    const status = await store.getUserFeedbackStatus(intake.feedbackId);
    assert.equal(status?.state, "planned");

    const usageId = await store.recordFeatureUsage({
      action: "enabled",
      featureId: "dark-mode",
      userId: "user-1",
    });
    assert.match(usageId, /^usage_/);

    const snapshot = await store.getControlRoomSnapshot();
    assert.equal(snapshot.counts.feedbackSignals > 0, true);
    assert.equal(snapshot.counts.featureUsageEvents > 0, true);
    assert.equal(snapshot.workItems.length > 0, true);
  } finally {
    await store.close();
  }
});
