import assert from "node:assert/strict";
import test from "node:test";
import { buildAssumptionRecord, routeFeedback, sanitizeFeedback } from "@open-feedback-factory/core";
import pg, { type PoolClient } from "pg";
import { OpenFeedbackStore } from "./client.js";
import { migrateDatabase } from "./migrate.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const { Pool } = pg;

test("OpenFeedbackStore creates feedback, work item, status, and usage", { skip: !databaseUrl }, async () => {
  assert.ok(databaseUrl);
  await migrateDatabase(databaseUrl);
  await cleanupDatabaseTestRows(databaseUrl);
  const store = new OpenFeedbackStore(databaseUrl);
  const uniqueSuffix = Date.now().toString(36);
  const testSource = `test_${uniqueSuffix}`;

  try {
    const feedback = {
      message: `Please add a dashboard focus meter ${uniqueSuffix}`,
      metadata: { route: "/settings", surface: "settings" },
      source: testSource,
      userId: `test-user-${uniqueSuffix}-1`,
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
    assert.equal(await store.getFeedbackClusterSignalCount(decision.clusterKey), 2);

    const usageId = await store.recordFeatureUsage({
      action: "enabled",
      featureId: "dark-mode",
      metadata: { source: testSource },
      userId: `test-user-${uniqueSuffix}-1`,
    });
    assert.match(usageId, /^usage_/);

    const snapshot = await store.getControlRoomSnapshot();
    assert.equal(snapshot.counts.feedbackSignals > 0, true);
    assert.equal(snapshot.counts.featureUsageEvents > 0, true);
    assert.equal(snapshot.workItems.length > 0, true);
    assert.equal(
      snapshot.feedbackClusters.some(
        (cluster) => cluster.clusterKey === decision.clusterKey && cluster.signalCount >= 2,
      ),
      true,
    );
    assert.equal(await store.getMaxFeatureCostUsd(5), 5);
    await store.setMaxFeatureCostUsd(2.25, "db-test");
    assert.equal(await store.getMaxFeatureCostUsd(5), 2.25);
    assert.deepEqual(
      await store.getMergeGuardrailPolicy({
        autoMergePolicyEnabled: true,
        maxSafeDiffLines: 120,
        protectedPathFragments: ["auth"],
      }),
      {
        autoMergePolicyEnabled: true,
        maxSafeDiffLines: 120,
        protectedPathFragments: ["auth"],
      },
    );
    await store.setMergeGuardrailPolicy(
      {
        autoMergePolicyEnabled: false,
        maxSafeDiffLines: 24,
        protectedPathFragments: ["auth", "billing"],
      },
      "db-test",
    );
    assert.deepEqual(
      await store.getMergeGuardrailPolicy({
        autoMergePolicyEnabled: true,
        maxSafeDiffLines: 120,
        protectedPathFragments: ["auth"],
      }),
      {
        autoMergePolicyEnabled: false,
        maxSafeDiffLines: 24,
        protectedPathFragments: ["auth", "billing"],
      },
    );

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
    assert.equal(completed?.reviewDecision, null);
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

    const reviewDecision = await store.recordWorkItemReview({
      actor: "db-reviewer-agent",
      approved: true,
      reviewType: "agent",
      summary: "Reviewed the implementation, test evidence, and merge policy.",
      workItemId: claimed?.id ?? "",
    });
    assert.equal(reviewDecision.approved, true);
    assert.equal(reviewDecision.reviewType, "agent");
    const currentReview = await store.getWorkItemReviewDecision(claimed?.id ?? "");
    assert.equal(currentReview?.summary, "Reviewed the implementation, test evidence, and merge policy.");
    const reviewed = await store.getWorkItem(claimed?.id ?? "");
    assert.equal(reviewed?.reviewDecision?.actor, "db-reviewer-agent");
    assert.equal(reviewed?.reviewDecision?.approved, true);

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

    await store.markWorkItemReleased(claimed?.id ?? "", "Dashboard focus meter has shipped.", "dashboard-focus-meter");
    await store.recordFeatureUsage({
      action: "opened",
      featureId: "dashboard-focus-meter",
      metadata: { source: testSource },
      userId: `test-user-${uniqueSuffix}-3`,
    });
    const detail = await store.getWorkItemDetail(claimed?.id ?? "");
    assert.equal(detail?.workItem.status, "shipped");
    assert.equal(detail?.agentRuns[0]?.id, runId);
    assert.equal(detail?.costRecords.some((cost) => cost.phase === "estimate"), true);
    assert.equal(detail?.costRecords.some((cost) => cost.phase === "actual" && cost.amountUsd === 1.25), true);
    assert.equal(detail?.assumptions[0]?.notes, "A release-health assumption should block auto-merge until resolved.");
    assert.equal(detail?.githubArtifacts.some((artifact) => artifact.url.endsWith("/pull/123")), true);
    assert.equal(detail?.releaseEvents[0]?.status, "shipped");
    assert.equal(detail?.releaseEvents[0]?.metadata.featureId, "dashboard-focus-meter");
    assert.equal(detail?.usageAttribution[0]?.featureId, "dashboard-focus-meter");
    assert.equal(detail?.usageAttribution[0]?.eventCount, 1);
    assert.equal(detail?.usageAttribution[0]?.uniqueUsers, 1);
    assert.equal(detail?.userNotifications[0]?.message, "Dashboard focus meter has shipped.");
    assert.equal(detail?.auditEvents.some((event) => event.event === "work_item_review_recorded"), true);
    assert.equal(detail?.auditEvents.some((event) => event.event === "work_item_run_completed"), true);

    const staleFeedback = {
      message: `Please add pinned notes stale ${uniqueSuffix}`,
      metadata: { route: "/daybook", surface: "notes" },
      source: testSource,
      userId: `test-user-${uniqueSuffix}-2`,
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

    const capBlockedClaim = await store.claimNextWorkItem("db-test-worker", staleClaimed?.id ?? "", 1);
    assert.equal(capBlockedClaim, null);
    const capAllowedClaim = await store.claimNextWorkItem("db-test-worker", staleClaimed?.id ?? "", 2);
    assert.equal(capAllowedClaim?.id, staleClaimed?.id);

    await store.markWorkItemDecision({
      actor: "db-test",
      decisionCategory: "out_of_scope",
      message: "Pinned notes are not planned for this beta.",
      status: "not_planned",
      workItemId: staleClaimed?.id ?? "",
    });
    const notPlanned = await store.getWorkItem(staleClaimed?.id ?? "");
    assert.equal(notPlanned?.status, "not_planned");
    const notPlannedStatus = await store.getUserFeedbackStatus(staleIntake.feedbackId);
    assert.equal(notPlannedStatus?.state, "not_planned");
    assert.equal(notPlannedStatus?.message, "Pinned notes are not planned for this beta.");
    const notPlannedDetail = await store.getWorkItemDetail(staleClaimed?.id ?? "");
    assert.equal(
      notPlannedDetail?.auditEvents.some((event) => event.event === "work_item_decision_recorded"),
      true,
    );
  } finally {
    await store.close();
    await cleanupDatabaseTestRows(databaseUrl);
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
      `select c.relname as tablename
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = any($1)
         and c.relrowsecurity = true
         and c.relforcerowsecurity = true`,
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

test("workspace RLS blocks cross-workspace reads and writes for app roles", { skip: !databaseUrl }, async () => {
  assert.ok(databaseUrl);
  await migrateDatabase(databaseUrl);
  await cleanupDatabaseTestRows(databaseUrl);
  const uniqueSuffix = Date.now().toString(36).toLowerCase();
  const roleName = `off_rls_${uniqueSuffix}`;
  const password = `pw_${uniqueSuffix}`;
  const adminPool = new Pool({ connectionString: databaseUrl });

  try {
    await adminPool.query(`drop role if exists ${quoteIdentifier(roleName)}`);
    await adminPool.query(`create role ${quoteIdentifier(roleName)} login password ${quoteLiteral(password)}`);
    await adminPool.query(`grant usage on schema public to ${quoteIdentifier(roleName)}`);
    await adminPool.query(`grant select, insert, update, delete on all tables in schema public to ${quoteIdentifier(roleName)}`);

    const roleUrl = databaseUrlWithCredentials(databaseUrl, roleName, password);
    const rolePool = new Pool({ connectionString: roleUrl });
    try {
      await rolePool.query(`set app.workspace_id = 'workspace_a'`);
      await rolePool.query(
        `insert into feedback_clusters (workspace_id, cluster_key, title, category)
         values ('workspace_a', $1, 'Workspace A request', 'feature_request')`,
        [`rls.cluster.a.${uniqueSuffix}`],
      );
      await rolePool.query(
        `insert into feedback_signals
         (id, workspace_id, user_id, source, severity, raw_payload, sanitized_summary, sanitized_payload,
          privacy_risk, redactions, cluster_key, status, user_message)
         values ($1, 'workspace_a', 'rls-user-a', 'test_rls', 'medium', '{}'::jsonb, 'Workspace A feedback',
                 '{}'::jsonb, 'low', '[]'::jsonb, $2, 'planned', 'Queued')`,
        [`feedback_rls_a_${uniqueSuffix}`, `rls.cluster.a.${uniqueSuffix}`],
      );

      const visibleInA = await rolePool.query<{ count: string }>(
        `select count(*)::text as count from feedback_signals where source = 'test_rls'`,
      );
      assert.equal(visibleInA.rows[0]?.count, "1");

      await rolePool.query(`set app.workspace_id = 'workspace_b'`);
      const hiddenInB = await rolePool.query<{ count: string }>(
        `select count(*)::text as count from feedback_signals where source = 'test_rls'`,
      );
      assert.equal(hiddenInB.rows[0]?.count, "0");

      await assert.rejects(
        rolePool.query(
          `insert into feedback_signals
           (id, workspace_id, user_id, source, severity, raw_payload, sanitized_summary, sanitized_payload,
            privacy_risk, redactions, cluster_key, status, user_message)
           values ($1, 'workspace_a', 'rls-user-b', 'test_rls', 'medium', '{}'::jsonb, 'Cross workspace write',
                   '{}'::jsonb, 'low', '[]'::jsonb, $2, 'planned', 'Queued')`,
          [`feedback_rls_cross_${uniqueSuffix}`, `rls.cluster.a.${uniqueSuffix}`],
        ),
        /row-level security policy|violates row-level security/i,
      );
    } finally {
      await rolePool.end();
    }
  } finally {
    await cleanupDatabaseTestRows(databaseUrl);
    await adminPool.query(`drop owned by ${quoteIdentifier(roleName)}`);
    await adminPool.query(`drop role if exists ${quoteIdentifier(roleName)}`);
    await adminPool.end();
  }
});

async function cleanupDatabaseTestRows(url: string): Promise<void> {
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  const feedbackSources = ["test"];

  try {
    await client.query("begin");
    await client.query(`delete from feedback_signals where source = 'test_rls'`);
    await client.query(`delete from feedback_clusters where cluster_key like 'rls.cluster.%'`);
    const sourceClusters = await ids(
      client,
      `select distinct cluster_key as id
       from feedback_signals
       where source = any($1::text[]) or source like 'test_%'`,
      [feedbackSources],
    );
    const feedbackIds = await ids(
      client,
      `select id
       from feedback_signals
       where source = any($1::text[]) or source like 'test_%'`,
      [feedbackSources],
    );
    const workItemIds = sourceClusters.length
      ? await ids(client, `select id from work_items where cluster_key = any($1::text[])`, [sourceClusters])
      : [];
    const runIds = workItemIds.length
      ? await ids(client, `select id from agent_runs where work_item_id = any($1::text[])`, [workItemIds])
      : [];

    if (workItemIds.length || runIds.length) {
      await client.query(
        `delete from agent_assumptions
         where work_item_id = any($1::text[])
            or agent_run_id = any($2::text[])`,
        [workItemIds, runIds],
      );
      await client.query(`delete from github_artifacts where work_item_id = any($1::text[])`, [workItemIds]);
      await client.query(`delete from release_events where work_item_id = any($1::text[])`, [workItemIds]);
      await client.query(`delete from cost_records where work_item_id = any($1::text[])`, [workItemIds]);
      await client.query(`delete from agent_runs where work_item_id = any($1::text[])`, [workItemIds]);
      await client.query(`delete from user_notifications where work_item_id = any($1::text[])`, [workItemIds]);
      await client.query(`delete from audit_events where target_id = any($1::text[])`, [workItemIds]);
      await client.query(`delete from work_items where id = any($1::text[])`, [workItemIds]);
    }

    if (feedbackIds.length) {
      await client.query(`delete from user_notifications where feedback_id = any($1::text[])`, [feedbackIds]);
    }

    await client.query(`delete from feedback_signals where id = any($1::text[])`, [feedbackIds]);
    if (sourceClusters.length) {
      await client.query(
        `delete from feedback_clusters fc
         where fc.cluster_key = any($1::text[])
           and not exists (select 1 from feedback_signals fs where fs.cluster_key = fc.cluster_key)`,
        [sourceClusters],
      );
    }
    await client.query(
      `delete from feature_usage_events
       where metadata ->> 'source' like 'test_%'
          or user_id like 'test-user-%'
          or user_id = 'user-1'`,
    );
    await client.query(`delete from audit_events where target_id = 'max_feature_cost_usd'`);
    await client.query(`delete from audit_events where target_id = 'merge_guardrails'`);
    await client.query(`delete from policy_configs where key = 'max_feature_cost_usd'`);
    await client.query(`delete from policy_configs where key = 'merge_guardrails'`);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function ids(client: PoolClient, sql: string, params: unknown[]): Promise<string[]> {
  const result = await client.query<{ id: string }>(sql, params);
  return result.rows.map((row) => row.id);
}

function databaseUrlWithCredentials(url: string, username: string, password: string): string {
  const parsed = new URL(url);
  parsed.username = username;
  parsed.password = password;
  return parsed.toString();
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
