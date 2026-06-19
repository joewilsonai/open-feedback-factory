import assert from "node:assert/strict";
import test from "node:test";
import { buildAssumptionRecord, routeFeedback, sanitizeFeedback } from "@open-feedback-factory/core";
import pg from "pg";
import { OpenFeedbackStore } from "./client.js";
import { migrateDatabase } from "./migrate.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const { Pool } = pg;

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

    const duplicateBeforeRun = await store.createFeedbackIntake({ decision, feedback, sanitized });
    assert.equal(duplicateBeforeRun.workItemId, intake.workItemId);
    assert.equal(duplicateBeforeRun.status.state, "grouped");
    assert.match(duplicateBeforeRun.status.message, /matching request/);

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
      assumptions: [
        buildAssumptionRecord({
          assumptions: ["Release health is assumed because this DB test does not deploy."],
          checksRun: ["db integration test"],
          checksSkipped: ["release health probe"],
          impactAreas: ["release_status"],
          notes: "A release-health assumption should block auto-merge until resolved.",
          unresolved: true,
        }),
      ],
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
    assert.equal(completed?.latestActualCost?.amountUsd, 1.25);
    assert.equal(completed?.latestBranchName, null);
    assert.equal(completed?.unresolvedAssumptions.length, 1);
    assert.deepEqual(completed?.unresolvedAssumptions[0]?.impactAreas, ["release_status"]);

    const artifactOne = await store.recordGithubArtifact({
      artifactType: "pull_request",
      url: "https://github.com/joewilsonai/open-feedback-factory/pull/123",
      workItemId: claimed?.id ?? "",
    });
    const artifactTwo = await store.recordGithubArtifact({
      artifactType: "pull_request",
      url: "https://github.com/joewilsonai/open-feedback-factory/pull/123",
      workItemId: claimed?.id ?? "",
    });
    assert.equal(artifactTwo, artifactOne);

    assert.equal(
      await store.recordGithubWebhookDelivery({ deliveryId: `delivery_${uniqueSuffix}`, event: "pull_request" }),
      true,
    );
    assert.equal(
      await store.recordGithubWebhookDelivery({ deliveryId: `delivery_${uniqueSuffix}`, event: "pull_request" }),
      false,
    );

    const completedSnapshot = await store.getControlRoomSnapshot();
    assert.equal(completedSnapshot.recentAssumptions.length > 0, true);

    const progressedStatus = await store.getUserFeedbackStatus(intake.feedbackId);
    assert.equal(progressedStatus?.state, "implemented");

    const duplicateAfterRun = await store.createFeedbackIntake({ decision, feedback, sanitized });
    assert.equal(duplicateAfterRun.workItemId, intake.workItemId);
    assert.equal(duplicateAfterRun.status.state, "implemented");
    assert.match(duplicateAfterRun.status.message, /waiting for review or release/);

    const staleFeedback = {
      message: `Please add pinned notes stale ${uniqueSuffix}`,
      metadata: { route: "/daybook", surface: "notes" },
      source: "test",
      userId: "user-2",
    };
    const staleSanitized = sanitizeFeedback(staleFeedback);
    const staleDecision = routeFeedback({ sanitized: staleSanitized, signalCount: 2 });
    const staleIntake = await store.createFeedbackIntake({
      decision: staleDecision,
      feedback: staleFeedback,
      sanitized: staleSanitized,
    });
    const staleClaimed = await store.claimNextWorkItem("db-test-worker", staleIntake.workItemId ?? undefined);
    assert.equal(staleClaimed?.status, "in_progress");

    const pool = new Pool({ connectionString: databaseUrl });
    try {
      await pool.query("update work_items set updated_at = now() - interval '2 hours' where id = $1", [
        staleClaimed?.id,
      ]);
    } finally {
      await pool.end();
    }

    const reconciliation = await store.reconcileWorkItems({ staleAfterMinutes: 30 });
    assert.deepEqual(reconciliation.staleInProgressRequeuedIds, [staleClaimed?.id]);
    const requeued = await store.getWorkItem(staleClaimed?.id ?? "");
    assert.equal(requeued?.status, "planned");
  } finally {
    await store.close();
  }
});

test("schema migration enables workspace RLS scaffolding", { skip: !databaseUrl }, async () => {
  assert.ok(databaseUrl);
  await migrateDatabase(databaseUrl);
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const tables = [
      "feedback_signals",
      "feedback_clusters",
      "work_items",
      "agent_runs",
      "agent_assumptions",
      "cost_records",
      "github_artifacts",
      "release_events",
      "user_notifications",
      "feature_usage_events",
      "policy_configs",
      "audit_events",
    ];
    const rowSecurity = await pool.query<{ tablename: string }>(
      `select tablename
       from pg_tables
       where schemaname = 'public'
         and tablename = any($1)
         and rowsecurity = true`,
      [tables],
    );
    assert.deepEqual(
      rowSecurity.rows.map((row) => row.tablename).sort(),
      tables.slice().sort(),
    );

    const policies = await pool.query<{ tablename: string }>(
      `select tablename
       from pg_policies
       where schemaname = 'public'
         and tablename = any($1)
         and policyname like '%workspace_isolation'`,
      [tables],
    );
    assert.deepEqual(
      policies.rows.map((row) => row.tablename).sort(),
      tables.slice().sort(),
    );
  } finally {
    await pool.end();
  }
});
