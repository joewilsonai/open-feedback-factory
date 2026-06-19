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
    const uniqueSuffix = Date.now().toString(36);
    const feedback = {
      message: `Please add a dashboard focus meter ${uniqueSuffix}`,
      metadata: { route: "/settings", surface: "settings" },
      source: "test",
      userId: "user-1",
    };
    const sanitized = sanitizeFeedback(feedback);
    const decision = routeFeedback({ sanitized, signalCount: 2 });
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

    const claimed = await store.claimNextWorkItem("db-test-worker", intake.workItemId ?? undefined);
    assert.equal(claimed?.id, intake.workItemId);
    assert.equal(claimed?.status, "in_progress");

    const runId = await store.completeWorkItemRun({
      agentName: "db-test-worker",
      costActual: { amountUsd: 1.25, confidence: "low", model: "gpt-5.5" },
      metadata: {
        changedFiles: ["apps/demo-app/src/styles.css"],
        githubPrUrl: "https://github.com/joewilsonai/open-feedback-factory/pull/123",
      },
      runType: "implementation",
      status: "succeeded",
      summary: "Implemented by the DB integration test.",
      workItemId: claimed?.id ?? "",
    });
    assert.match(runId, /^run_/);

    const completed = await store.getWorkItem(claimed?.id ?? "");
    assert.equal(completed?.status, "implemented");
    assert.equal(completed?.githubPrUrl, "https://github.com/joewilsonai/open-feedback-factory/pull/123");

    const progressedStatus = await store.getUserFeedbackStatus(intake.feedbackId);
    assert.equal(progressedStatus?.state, "in_progress");
  } finally {
    await store.close();
  }
});
