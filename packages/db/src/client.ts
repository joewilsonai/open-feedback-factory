import { randomUUID } from "node:crypto";
import {
  buildAssumptionRecord,
  buildUserStatus,
  type AgentAssumptionRecord,
  type FeatureCostEstimate,
  type FeedbackInput,
  type MergeMode,
  type SanitizedFeedback,
  type UserClarificationQuestion,
  type UserFeedbackState,
  type UserFeedbackStatus,
  type WorkRoutingDecision,
} from "@open-feedback-factory/core";
import pg from "pg";

const { Pool } = pg;
const SAMPLE_ONLY_FEEDBACK_SOURCES = ["demo_seed", "sample_seed"];

export interface FeedbackIntakeResult {
  createdWorkItem: boolean;
  feedbackId: string;
  workItemId: string | null;
  status: UserFeedbackStatus;
}

export interface WorkItemRow {
  id: string;
  clusterKey: string;
  title: string;
  summary: string;
  category: string;
  riskTier: string;
  status: string;
  userStatus: string;
  costEstimate: FeatureCostEstimate;
  latestActualCost: Record<string, unknown> | null;
  latestBranchName: string | null;
  reviewDecision?: WorkItemReviewDecision | null;
  shouldCreateIssue: boolean;
  signalSources: string[];
  unresolvedAssumptions: AgentAssumptionRecord[];
  githubIssueUrl: string | null;
  githubPrUrl: string | null;
  autoMergeEligible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackClusterRow {
  activeWorkItemId: string | null;
  activeWorkItemStatus: string | null;
  category: string;
  clusterKey: string;
  latestSignalAt: string;
  latestStatus: string | null;
  latestUserMessage: string | null;
  signalCount: number;
  title: string;
  updatedAt: string;
}

export interface AgentRunLedgerRow {
  agentName: string;
  completedAt: string | null;
  costActual: Record<string, unknown> | null;
  createdAt: string;
  id: string;
  metadata: Record<string, unknown>;
  runType: string;
  status: string;
  summary: string;
  workItemId: string | null;
}

export interface AssumptionLedgerRow extends AgentAssumptionRecord {
  agentRunId: string | null;
  createdAt: string;
  id: string;
  workItemId: string | null;
}

export interface CostLedgerRow {
  amountUsd: number;
  confidence: string;
  createdAt: string;
  id: string;
  metadata: Record<string, unknown>;
  model: string;
  phase: string;
  workItemId: string | null;
}

export interface CostBudgetPolicy {
  maxDailyCostUsd: number;
  maxFeatureCostUsd: number;
  maxMonthlyCostUsd: number;
  maxTokensPerRun: number;
}

export interface CostBudgetUsage {
  monthActualTokens: number;
  monthActualUsd: number;
  todayActualTokens: number;
  todayActualUsd: number;
}

export interface GithubArtifactLedgerRow {
  artifactNumber: number | null;
  artifactType: string;
  createdAt: string;
  id: string;
  metadata: Record<string, unknown>;
  url: string;
  workItemId: string | null;
}

export interface ReleaseLedgerRow {
  createdAt: string;
  id: string;
  metadata: Record<string, unknown>;
  status: string;
  workItemId: string | null;
}

export interface NotificationLedgerRow {
  clarificationQuestions: UserClarificationQuestion[];
  createdAt: string;
  feedbackId: string | null;
  id: string;
  message: string;
  status: string;
  workItemId: string | null;
}

export interface AuditLedgerRow {
  actor: string;
  createdAt: string;
  event: string;
  id: string;
  metadata: Record<string, unknown>;
  targetId: string;
  targetType: string;
}

export interface WorkItemReviewDecision {
  actor: string;
  approved: boolean;
  createdAt: string;
  id: string;
  reviewType: "agent" | "human";
  summary: string;
}

export interface UsageAttributionRow {
  eventCount: number;
  featureId: string;
  latestUsageAt: string;
  requesterCount: number;
  uniqueUsers: number;
  workItemId: string;
}

export interface MergeGuardrailPolicy {
  autoMergePolicyEnabled: boolean;
  maxSafeDiffLines: number;
  protectedPathFragments: string[];
}

export interface WorkerHeartbeatInput {
  codexAuthMode: string;
  runnerMode: string;
  status: string;
  workerKind: string;
  workerName: string;
}

export interface WorkerHeartbeatRow extends WorkerHeartbeatInput {
  lastSeenAt: string;
}

export interface WorkItemDetail {
  agentRuns: AgentRunLedgerRow[];
  assumptions: AssumptionLedgerRow[];
  auditEvents: AuditLedgerRow[];
  costRecords: CostLedgerRow[];
  githubArtifacts: GithubArtifactLedgerRow[];
  releaseEvents: ReleaseLedgerRow[];
  usageAttribution: UsageAttributionRow[];
  userNotifications: NotificationLedgerRow[];
  workItem: WorkItemRow;
}

export interface AgentRunInput {
  agentName: string;
  assumptions?: AgentAssumptionRecord[];
  costActual?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  runType: string;
  status: string;
  summary: string;
  workItemId: string;
}

export interface RunnerJobCompletionInput extends AgentRunInput {
  status: "blocked" | "failed" | "succeeded";
}

export interface WorkItemDecisionInput {
  actor?: string;
  decisionCategory?: string;
  message: string;
  status: "blocked" | "not_planned";
  workItemId: string;
}

export interface WorkItemReviewInput {
  actor?: string;
  approved: boolean;
  reviewType?: "agent" | "human";
  summary: string;
  workItemId: string;
}

export interface GithubArtifactInput {
  artifactNumber?: number;
  artifactType: "issue" | "pull_request";
  metadata?: Record<string, unknown>;
  url: string;
  workItemId: string;
}

export interface GithubWebhookDeliveryInput {
  deliveryId?: string | null;
  event: string;
  metadata?: Record<string, unknown>;
}

export interface ControlRoomSnapshot {
  counts: {
    agentRuns: number;
    feedbackSignals: number;
    featureUsageEvents: number;
    openWorkItems: number;
  };
  feedbackClusters: FeedbackClusterRow[];
  recentAgentRuns: Array<Record<string, unknown>>;
  recentAssumptions: Array<Record<string, unknown>>;
  recentFeedback: Array<Record<string, unknown>>;
  recentUsage: Array<Record<string, unknown>>;
  workItems: WorkItemRow[];
}

export interface ReconciliationResult {
  failedWithoutPrIds: string[];
  implementedAwaitingReleaseIds: string[];
  staleInProgressRequeuedIds: string[];
}

export type ApprovalMode = "auto" | "manual";
export type CodexAuthMode = "api_key" | "cli";

export class OpenFeedbackStore {
  private readonly pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async createFeedbackIntake(input: {
    feedback: FeedbackInput;
    sanitized: SanitizedFeedback;
    decision: WorkRoutingDecision;
  }): Promise<FeedbackIntakeResult> {
    const client = await this.pool.connect();
    const feedbackId = `feedback_${randomUUID()}`;
    let createdWorkItem = false;
    let workItemId: string | null = null;
    let userMessage = input.decision.userMessage;
    let userStatus = input.decision.userStatus;

    try {
      await client.query("begin");
      await client.query(
        `insert into feedback_clusters (cluster_key, title, category, signal_count, latest_signal_at, updated_at)
         values ($1, $2, $3, 1, now(), now())
         on conflict (cluster_key) do update
         set signal_count = feedback_clusters.signal_count + 1,
             latest_signal_at = now(),
             updated_at = now()`,
        [input.decision.clusterKey, input.decision.title, input.decision.category],
      );

      if (input.decision.action === "create_work_item") {
        const existing = await client.query<{ id: string; status: string }>(
          `select id, status from work_items
           where cluster_key = $1 and status not in ('shipped', 'closed', 'not_planned', 'blocked', 'failed')
           order by created_at asc
           limit 1`,
          [input.decision.clusterKey],
        );

        workItemId = existing.rows[0]?.id ?? `work_${randomUUID()}`;
        if (existing.rows[0]) {
          const existingFollowUp = followUpForExistingWorkItem(existing.rows[0].status);
          userMessage = existingFollowUp.message;
          userStatus = existingFollowUp.status;
        } else {
          createdWorkItem = true;
          await client.query(
            `insert into work_items
             (id, cluster_key, title, summary, category, risk_tier, status, user_status,
              cost_estimate, should_create_issue)
             values ($1, $2, $3, $4, $5, $6, 'planned', $7, $8, $9)`,
            [
              workItemId,
              input.decision.clusterKey,
              input.decision.title,
              input.sanitized.sanitizedMessage,
              input.decision.category,
              input.decision.riskTier,
              input.decision.userStatus,
              JSON.stringify(input.decision.costEstimate),
              input.decision.shouldCreateIssue,
            ],
          );

          await client.query(
            `insert into cost_records (id, work_item_id, phase, amount_usd, confidence, model, metadata)
             values ($1, $2, 'estimate', $3, $4, $5, $6)`,
            [
              `cost_${randomUUID()}`,
              workItemId,
              input.decision.costEstimate.amountUsd,
              input.decision.costEstimate.confidence,
              input.decision.costEstimate.model,
              JSON.stringify({ reason: input.decision.costEstimate.reason }),
            ],
          );
        }
      }

      await client.query(
        `insert into feedback_signals
         (id, user_id, source, severity, raw_payload, sanitized_summary, sanitized_payload,
          privacy_risk, redactions, cluster_key, status, user_message)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          feedbackId,
          input.feedback.userId ?? null,
          input.feedback.source,
          input.feedback.severity ?? "medium",
          JSON.stringify(input.feedback),
          input.sanitized.sanitizedMessage,
          JSON.stringify({
            metadata: input.sanitized.safeMetadata,
            message: input.sanitized.sanitizedMessage,
          }),
          input.sanitized.privacyRisk,
          JSON.stringify(input.sanitized.redactions),
          input.decision.clusterKey,
          userStatus,
          userMessage,
        ],
      );

      await client.query(
        `insert into user_notifications (id, feedback_id, work_item_id, status, message)
         values ($1, $2, $3, $4, $5)`,
        [`note_${randomUUID()}`, feedbackId, workItemId, userStatus, userMessage],
      );
      await setLatestNotificationQuestions(client, feedbackId, workItemId, input.decision.clarificationQuestions);

      await client.query(
        `insert into audit_events (id, actor, event, target_type, target_id, metadata)
         values ($1, 'system', 'feedback_intake_created', 'feedback_signal', $2, $3)`,
        [
          `audit_${randomUUID()}`,
          feedbackId,
          JSON.stringify({
            action: input.decision.action,
            clusterKey: input.decision.clusterKey,
            workItemId,
          }),
        ],
      );

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    return {
      createdWorkItem,
      feedbackId,
      status: buildUserStatus({
        clarificationQuestions: input.decision.clarificationQuestions,
        feedbackId,
        message: userMessage,
        state: userStatus,
      }),
      workItemId,
    };
  }

  async getUserFeedbackStatus(feedbackId: string): Promise<UserFeedbackStatus | null> {
    const result = await this.pool.query<{
      clarification_questions: unknown;
      created_at: Date;
      message: string;
      status: UserFeedbackStatus["state"];
    }>(
      `select status, message, clarification_questions, created_at
       from user_notifications
       where feedback_id = $1
       order by created_at desc
       limit 1`,
      [feedbackId],
    );

    const row = result.rows[0];
    if (!row) return null;

    return buildUserStatus({
      clarificationQuestions: clarificationQuestionsFromRow(row.clarification_questions),
      createdAt: row.created_at.toISOString(),
      feedbackId,
      message: row.message,
      state: row.status,
    });
  }

  async getFeedbackClusterSignalCount(clusterKey: string): Promise<number> {
    const result = await this.pool.query<{ signal_count: number | string }>(
      `select signal_count
       from feedback_clusters
       where cluster_key = $1
       limit 1`,
      [clusterKey],
    );
    return Number(result.rows[0]?.signal_count ?? 0);
  }

  async listFeedbackClusters(): Promise<FeedbackClusterRow[]> {
    const result = await this.pool.query(
      `select fc.cluster_key, fc.title, fc.category, fc.signal_count, fc.latest_signal_at, fc.updated_at,
              latest.status as latest_status,
              latest.user_message as latest_user_message,
              active.id as active_work_item_id,
              active.status as active_work_item_status
       from feedback_clusters fc
       left join lateral (
         select fs.status, fs.user_message
         from feedback_signals fs
         where fs.cluster_key = fc.cluster_key
         order by fs.created_at desc
         limit 1
       ) latest on true
       left join lateral (
         select wi.id, wi.status
         from work_items wi
         where wi.cluster_key = fc.cluster_key
           and wi.status not in ('shipped', 'closed', 'not_planned', 'blocked', 'failed')
         order by wi.created_at asc
         limit 1
       ) active on true
       order by fc.latest_signal_at desc
       limit 50`,
    );
    return result.rows.map(feedbackClusterFromRow);
  }

  async listWorkItems(): Promise<WorkItemRow[]> {
    const result = await this.pool.query(
      `select wi.id, wi.cluster_key, wi.title, wi.summary, wi.category, wi.risk_tier, wi.status, wi.user_status,
              wi.cost_estimate, wi.should_create_issue, wi.github_issue_url, wi.github_pr_url,
              wi.auto_merge_eligible, wi.created_at, wi.updated_at,
              (
                select coalesce(array_agg(distinct fs.source order by fs.source), '{}'::text[])
                from feedback_signals fs
                where fs.cluster_key = wi.cluster_key
              ) as signal_sources,
              (
                select ar.cost_actual
                from agent_runs ar
                where ar.work_item_id = wi.id
                  and ar.cost_actual is not null
                  and ar.cost_actual <> 'null'::jsonb
                order by coalesce(ar.completed_at, ar.created_at) desc
                limit 1
              ) as latest_actual_cost,
              (
                select ar.metadata ->> 'branchName'
                from agent_runs ar
                where ar.work_item_id = wi.id
                  and ar.metadata ? 'branchName'
                order by coalesce(ar.completed_at, ar.created_at) desc
                limit 1
              ) as latest_branch_name,
              review.id as review_id,
              review.actor as review_actor,
              review.created_at as review_created_at,
              review.metadata ->> 'summary' as review_summary,
              review.metadata ->> 'reviewType' as review_type,
              review.metadata ->> 'approved' as review_approved,
              coalesce(
                (
                  select jsonb_agg(assumption_record_json(aa) order by aa.created_at desc)
                  from agent_assumptions aa
                  where aa.work_item_id = wi.id and aa.unresolved = true
                ),
                '[]'::jsonb
              ) as unresolved_assumptions
       from work_items wi
       left join lateral (
         select id, actor, metadata, created_at
         from audit_events ae
         where ae.target_id = wi.id and ae.event = 'work_item_review_recorded'
         order by ae.created_at desc
         limit 1
       ) review on true
       order by created_at desc
       limit 50`,
    );
    return result.rows.map(workItemFromRow);
  }

  async getWorkItem(id: string): Promise<WorkItemRow | null> {
    const result = await this.pool.query(
      `select wi.id, wi.cluster_key, wi.title, wi.summary, wi.category, wi.risk_tier, wi.status, wi.user_status,
              wi.cost_estimate, wi.should_create_issue, wi.github_issue_url, wi.github_pr_url,
              wi.auto_merge_eligible, wi.created_at, wi.updated_at,
              (
                select coalesce(array_agg(distinct fs.source order by fs.source), '{}'::text[])
                from feedback_signals fs
                where fs.cluster_key = wi.cluster_key
              ) as signal_sources,
              (
                select ar.cost_actual
                from agent_runs ar
                where ar.work_item_id = wi.id
                  and ar.cost_actual is not null
                  and ar.cost_actual <> 'null'::jsonb
                order by coalesce(ar.completed_at, ar.created_at) desc
                limit 1
              ) as latest_actual_cost,
              (
                select ar.metadata ->> 'branchName'
                from agent_runs ar
                where ar.work_item_id = wi.id
                  and ar.metadata ? 'branchName'
                order by coalesce(ar.completed_at, ar.created_at) desc
                limit 1
              ) as latest_branch_name,
              review.id as review_id,
              review.actor as review_actor,
              review.created_at as review_created_at,
              review.metadata ->> 'summary' as review_summary,
              review.metadata ->> 'reviewType' as review_type,
              review.metadata ->> 'approved' as review_approved,
              coalesce(
                (
                  select jsonb_agg(assumption_record_json(aa) order by aa.created_at desc)
                  from agent_assumptions aa
                  where aa.work_item_id = wi.id and aa.unresolved = true
                ),
                '[]'::jsonb
              ) as unresolved_assumptions
       from work_items wi
       left join lateral (
         select id, actor, metadata, created_at
         from audit_events ae
         where ae.target_id = wi.id and ae.event = 'work_item_review_recorded'
         order by ae.created_at desc
         limit 1
       ) review on true
       where wi.id = $1`,
      [id],
    );
    return result.rows[0] ? workItemFromRow(result.rows[0]) : null;
  }

  async getWorkItemDetail(id: string): Promise<WorkItemDetail | null> {
    const workItem = await this.getWorkItem(id);
    if (!workItem) return null;

    const [
      agentRuns,
      assumptions,
      costRecords,
      githubArtifacts,
      releaseEvents,
      userNotifications,
      auditEvents,
      usageAttribution,
    ] =
      await Promise.all([
        this.pool.query(
          `select id, work_item_id, run_type, agent_name, status, summary, cost_actual, metadata, created_at, completed_at
           from agent_runs
           where work_item_id = $1
           order by coalesce(completed_at, created_at) desc
           limit 50`,
          [id],
        ),
        this.pool.query(
          `select id, work_item_id, agent_run_id, assumptions, defaults_used, alternatives_skipped,
                  checks_run, checks_skipped, human_questions, impact_areas, confidence, notes, unresolved, created_at
           from agent_assumptions
           where work_item_id = $1
           order by created_at desc
           limit 50`,
          [id],
        ),
        this.pool.query(
          `select id, work_item_id, phase, amount_usd, confidence, model, metadata, created_at
           from cost_records
           where work_item_id = $1
           order by created_at desc
           limit 50`,
          [id],
        ),
        this.pool.query(
          `select id, work_item_id, artifact_type, url, artifact_number, metadata, created_at
           from github_artifacts
           where work_item_id = $1
           order by created_at desc
           limit 50`,
          [id],
        ),
        this.pool.query(
          `select id, work_item_id, status, metadata, created_at
           from release_events
           where work_item_id = $1
           order by created_at desc
           limit 50`,
          [id],
        ),
        this.pool.query(
          `select id, feedback_id, work_item_id, status, message, clarification_questions, created_at
           from user_notifications
           where work_item_id = $1
           order by created_at desc
           limit 50`,
          [id],
        ),
        this.pool.query(
          `select id, actor, event, target_type, target_id, metadata, created_at
           from audit_events
           where target_id = $1
           order by created_at desc
           limit 50`,
          [id],
        ),
        this.pool.query(
          `with requesters as (
             select count(distinct fs.user_id)::int as requester_count
             from feedback_signals fs
             join work_items wi on wi.cluster_key = fs.cluster_key
             where wi.id = $1 and fs.user_id is not null
           )
           select fue.feature_id,
                  coalesce(fue.metadata ->> 'attributedWorkItemId', $1) as work_item_id,
                  count(*)::int as event_count,
                  count(distinct fue.user_id)::int as unique_users,
                  max(fue.created_at) as latest_usage_at,
                  (select requester_count from requesters) as requester_count
           from feature_usage_events fue
           where fue.metadata ->> 'attributedWorkItemId' = $1
              or fue.metadata ->> 'workItemId' = $1
              or fue.feature_id in (
                select re.metadata ->> 'featureId'
                from release_events re
                where re.work_item_id = $1 and re.metadata ? 'featureId'
              )
           group by fue.feature_id, coalesce(fue.metadata ->> 'attributedWorkItemId', $1)
           order by max(fue.created_at) desc
           limit 20`,
          [id],
        ),
      ]);

    return {
      agentRuns: agentRuns.rows.map(agentRunLedgerFromRow),
      assumptions: assumptions.rows.map(assumptionLedgerFromRow),
      auditEvents: auditEvents.rows.map(auditLedgerFromRow),
      costRecords: costRecords.rows.map(costLedgerFromRow),
      githubArtifacts: githubArtifacts.rows.map(githubArtifactLedgerFromRow),
      releaseEvents: releaseEvents.rows.map(releaseLedgerFromRow),
      usageAttribution: usageAttribution.rows.map(usageAttributionFromRow),
      userNotifications: userNotifications.rows.map(notificationLedgerFromRow),
      workItem,
    };
  }

  async claimNextWorkItem(workerName = "worker", workItemId?: string, maxFeatureCostUsd?: number): Promise<WorkItemRow | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await client.query(
        `with next_work_item as (
         select id from work_items
           where status = 'planned'
             and ($1::text is null or id = $1)
             and ($2::numeric is null or (cost_estimate ->> 'amountUsd')::numeric <= $2)
             and exists (
               select 1
               from feedback_signals fs
               where fs.cluster_key = work_items.cluster_key
                 and fs.source <> all($3::text[])
             )
           order by created_at asc
           for update skip locked
           limit 1
         )
         update work_items wi
         set status = 'in_progress',
             user_status = 'in_progress',
             updated_at = now()
         from next_work_item
         where wi.id = next_work_item.id
         returning wi.id, wi.cluster_key, wi.title, wi.summary, wi.category, wi.risk_tier,
                   wi.status, wi.user_status, wi.cost_estimate, wi.should_create_issue,
                   wi.github_issue_url, wi.github_pr_url, wi.auto_merge_eligible,
                   (
                     select coalesce(array_agg(distinct fs.source order by fs.source), '{}'::text[])
                     from feedback_signals fs
                     where fs.cluster_key = wi.cluster_key
                   ) as signal_sources,
                   null::jsonb as latest_actual_cost,
                   null::text as latest_branch_name,
                   wi.created_at, wi.updated_at`,
        [workItemId ?? null, maxFeatureCostUsd ?? null, SAMPLE_ONLY_FEEDBACK_SOURCES],
      );

      const row = result.rows[0];
      if (!row) {
        await client.query("commit");
        return null;
      }

      const workItem = workItemFromRow(row);
      await upsertClusterUserMessage(client, {
        clusterKey: workItem.clusterKey,
        message: "An agent has picked this up and is working on it.",
        status: "in_progress",
        workItemId: workItem.id,
      });
      await client.query(
        `insert into audit_events (id, actor, event, target_type, target_id, metadata)
         values ($1, $2, 'work_item_claimed', 'work_item', $3, $4)`,
        [`audit_${randomUUID()}`, workerName, workItem.id, JSON.stringify({ workerName })],
      );
      await client.query("commit");
      return workItem;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async recordAgentRun(input: AgentRunInput): Promise<string> {
    const id = `run_${randomUUID()}`;
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into agent_runs
         (id, work_item_id, run_type, agent_name, status, summary, cost_actual, metadata, completed_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, case when $5 in ('succeeded', 'failed', 'blocked') then now() else null end)`,
        [
          id,
          input.workItemId,
          input.runType,
          input.agentName,
          input.status,
          input.summary,
          JSON.stringify(input.costActual ?? null),
          JSON.stringify(input.metadata ?? {}),
        ],
      );
      await insertAssumptionRecords(client, {
        agentRunId: id,
        assumptions: input.assumptions,
        workItemId: input.workItemId,
      });
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    return id;
  }

  async completeWorkItemRun(input: RunnerJobCompletionInput): Promise<string> {
    const client = await this.pool.connect();
    const runId = `run_${randomUUID()}`;
    const completion = completionStateForRun(input.status);
    const githubIssueUrl = stringFromMetadata(input.metadata, "githubIssueUrl");
    const githubPrUrl = stringFromMetadata(input.metadata, "githubPrUrl");

    try {
      await client.query("begin");
      await client.query(
        `insert into agent_runs
         (id, work_item_id, run_type, agent_name, status, summary, cost_actual, metadata, completed_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
        [
          runId,
          input.workItemId,
          input.runType,
          input.agentName,
          input.status,
          input.summary,
          JSON.stringify(input.costActual ?? null),
          JSON.stringify(input.metadata ?? {}),
        ],
      );
      await insertAssumptionRecords(client, {
        agentRunId: runId,
        assumptions: input.assumptions,
        workItemId: input.workItemId,
      });

      if (isActualCost(input.costActual)) {
        await client.query(
          `insert into cost_records (id, work_item_id, phase, amount_usd, confidence, model, metadata)
           values ($1, $2, 'actual', $3, $4, $5, $6)`,
          [
            `cost_${randomUUID()}`,
            input.workItemId,
            input.costActual.amountUsd,
            input.costActual.confidence,
            input.costActual.model,
            JSON.stringify({ agentRunId: runId, tokens: tokensFromCostActual(input.costActual) }),
          ],
        );
      }

      if (githubPrUrl) {
        await client.query(
          `insert into github_artifacts (id, work_item_id, artifact_type, url, artifact_number, metadata)
           values ($1, $2, 'pull_request', $3, $4, $5)`,
          [
            `gh_${randomUUID()}`,
            input.workItemId,
            githubPrUrl,
            githubNumberFromUrl(githubPrUrl) ?? null,
            JSON.stringify({ agentRunId: runId, source: "runner_completion" }),
          ],
        );
      }

      const workItemResult = await client.query<{ cluster_key: string }>(
        `update work_items
         set status = $2,
             user_status = $3,
             github_issue_url = coalesce($4, github_issue_url),
             github_pr_url = coalesce($5, github_pr_url),
             updated_at = now()
         where id = $1
         returning cluster_key`,
        [input.workItemId, completion.workItemStatus, completion.userStatus, githubIssueUrl, githubPrUrl],
      );

      const clusterKey = workItemResult.rows[0]?.cluster_key;
      if (clusterKey) {
        await upsertClusterUserMessage(client, {
          clusterKey,
          message: completion.message,
          status: completion.userStatus,
          workItemId: input.workItemId,
        });
      }

      await client.query(
        `insert into audit_events (id, actor, event, target_type, target_id, metadata)
         values ($1, $2, 'work_item_run_completed', 'work_item', $3, $4)`,
        [
          `audit_${randomUUID()}`,
          input.agentName,
          input.workItemId,
          JSON.stringify({
            runId,
            status: input.status,
            workItemStatus: completion.workItemStatus,
          }),
        ],
      );
      await client.query("commit");
      return runId;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async recordGithubArtifact(input: GithubArtifactInput): Promise<string> {
    const id = `gh_${randomUUID()}`;
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const artifact = await client.query<{ id: string }>(
        `with inserted as (
           insert into github_artifacts (id, work_item_id, artifact_type, url, artifact_number, metadata)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (work_item_id, artifact_type, url) do nothing
           returning id
         )
         select id from inserted
         union all
         select id from github_artifacts
         where work_item_id = $2 and artifact_type = $3 and url = $4
         limit 1`,
        [
          id,
          input.workItemId,
          input.artifactType,
          input.url,
          input.artifactNumber ?? null,
          JSON.stringify(input.metadata ?? {}),
        ],
      );
      const artifactId = artifact.rows[0]?.id ?? id;

      if (input.artifactType === "issue") {
        await client.query(
          `update work_items set github_issue_url = $2, updated_at = now() where id = $1`,
          [input.workItemId, input.url],
        );
      } else {
        await client.query(
          `update work_items set github_pr_url = $2, updated_at = now() where id = $1`,
          [input.workItemId, input.url],
        );
      }

      await client.query(
        `insert into audit_events (id, actor, event, target_type, target_id, metadata)
         values ($1, 'github', 'github_artifact_recorded', 'work_item', $2, $3)`,
        [
          `audit_${randomUUID()}`,
          input.workItemId,
          JSON.stringify({
            artifactId,
            artifactType: input.artifactType,
            url: input.url,
          }),
        ],
      );
      await client.query("commit");
      return artifactId;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async recordGithubWebhookDelivery(input: GithubWebhookDeliveryInput): Promise<boolean> {
    if (!input.deliveryId) return true;
    const result = await this.pool.query(
      `insert into audit_events (id, actor, event, target_type, target_id, metadata)
       values ($1, 'github', 'github_webhook_delivery', 'github_delivery', $2, $3)
       on conflict do nothing`,
      [
        `audit_${randomUUID()}`,
        input.deliveryId,
        JSON.stringify({
          event: input.event,
          ...(input.metadata ?? {}),
        }),
      ],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markWorkItemReleased(
    workItemId: string,
    message = "This request has shipped.",
    featureId?: string,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `update work_items
         set status = 'shipped', user_status = 'shipped', updated_at = now()
         where id = $1`,
        [workItemId],
      );
      await client.query(
        `update feedback_signals fs
         set status = 'shipped', user_message = $2, updated_at = now()
         from work_items wi
         where wi.id = $1 and wi.cluster_key = fs.cluster_key`,
        [workItemId, message],
      );
      await client.query(
        `insert into release_events (id, work_item_id, status, metadata)
         values ($1, $2, 'shipped', $3)`,
        [`release_${randomUUID()}`, workItemId, JSON.stringify(featureId ? { featureId } : {})],
      );
      await client.query(
        `insert into user_notifications (id, feedback_id, work_item_id, status, message)
         select $1 || '_' || fs.id, fs.id, $2, 'shipped', $3
         from feedback_signals fs
         join work_items wi on wi.cluster_key = fs.cluster_key
         where wi.id = $2`,
        [`note_${randomUUID()}`, workItemId, message],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async markWorkItemDecision(input: WorkItemDecisionInput): Promise<void> {
    const actor = input.actor ?? "operator";
    const message = input.message.trim() || decisionMessageForStatus(input.status);
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      const workItemResult = await client.query<{ cluster_key: string }>(
        `update work_items
         set status = $2, user_status = $2, updated_at = now()
         where id = $1
         returning cluster_key`,
        [input.workItemId, input.status],
      );
      const clusterKey = workItemResult.rows[0]?.cluster_key;
      if (!clusterKey) {
        await client.query("rollback");
        return;
      }

      await client.query(
        `update feedback_signals
         set status = $2, user_message = $3, updated_at = now()
         where cluster_key = $1`,
        [clusterKey, input.status, message],
      );
      await client.query(
        `insert into user_notifications (id, feedback_id, work_item_id, status, message)
         select $1 || '_' || fs.id, fs.id, $2, $3, $4
         from feedback_signals fs
         where fs.cluster_key = $5`,
        [`note_${randomUUID()}`, input.workItemId, input.status, message, clusterKey],
      );
      await client.query(
        `insert into audit_events (id, actor, event, target_type, target_id, metadata)
         values ($1, $2, 'work_item_decision_recorded', 'work_item', $3, $4)`,
        [
          `audit_${randomUUID()}`,
          actor,
          input.workItemId,
          JSON.stringify({
            decisionCategory: input.decisionCategory ?? input.status,
            message,
            status: input.status,
          }),
        ],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async recordWorkItemReview(input: WorkItemReviewInput): Promise<WorkItemReviewDecision> {
    const actor = input.actor?.trim() || "operator";
    const reviewType = input.reviewType ?? "human";
    const summary =
      input.summary.trim() ||
      (input.approved ? "Reviewer approved this work for merge consideration." : "Reviewer rejected this work.");
    const id = `audit_${randomUUID()}`;
    const createdAt = new Date();

    await this.pool.query(
      `insert into audit_events (id, actor, event, target_type, target_id, metadata, created_at)
       values ($1, $2, 'work_item_review_recorded', 'work_item', $3, $4, $5)`,
      [
        id,
        actor,
        input.workItemId,
        JSON.stringify({
          approved: input.approved,
          reviewType,
          summary,
        }),
        createdAt,
      ],
    );

    return {
      actor,
      approved: input.approved,
      createdAt: createdAt.toISOString(),
      id,
      reviewType,
      summary,
    };
  }

  async getWorkItemReviewDecision(workItemId: string): Promise<WorkItemReviewDecision | null> {
    const result = await this.pool.query(
      `select id, actor, created_at, metadata ->> 'summary' as summary,
              metadata ->> 'reviewType' as review_type,
              metadata ->> 'approved' as approved
       from audit_events
       where target_id = $1 and event = 'work_item_review_recorded'
       order by created_at desc
       limit 1`,
      [workItemId],
    );
    return reviewDecisionFromRow(result.rows[0]);
  }

  async reconcileWorkItems(input: {
    actor?: string;
    staleAfterMinutes?: number;
  } = {}): Promise<ReconciliationResult> {
    const staleAfterMinutes = Math.max(1, Math.floor(input.staleAfterMinutes ?? 60));
    const actor = input.actor ?? "reconciliation";
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      const stale = await client.query<{ cluster_key: string; id: string }>(
        `update work_items
         set status = 'planned',
             user_status = 'planned',
             updated_at = now()
         where status = 'in_progress'
           and updated_at < now() - ($1::text || ' minutes')::interval
         returning id, cluster_key`,
        [staleAfterMinutes],
      );

      for (const row of stale.rows) {
        await upsertClusterUserMessage(client, {
          clusterKey: row.cluster_key,
          message: "The previous agent run did not finish, so this is back in the queue for another attempt.",
          status: "planned",
          workItemId: row.id,
        });
      }

      const implementedAwaitingRelease = await client.query<{ id: string }>(
        `select wi.id
         from work_items wi
         where wi.status = 'implemented'
           and not exists (
             select 1 from release_events re where re.work_item_id = wi.id and re.status = 'shipped'
           )
         order by wi.updated_at desc
         limit 100`,
      );
      const failedWithoutPr = await client.query<{ id: string }>(
        `select id
         from work_items
         where status = 'failed' and github_pr_url is null
         order by updated_at desc
         limit 100`,
      );

      const result: ReconciliationResult = {
        failedWithoutPrIds: failedWithoutPr.rows.map((row) => row.id),
        implementedAwaitingReleaseIds: implementedAwaitingRelease.rows.map((row) => row.id),
        staleInProgressRequeuedIds: stale.rows.map((row) => row.id),
      };

      await client.query(
        `insert into audit_events (id, actor, event, target_type, target_id, metadata)
         values ($1, $2, 'reconciliation_completed', 'work_items', 'queue', $3)`,
        [`audit_${randomUUID()}`, actor, JSON.stringify(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async recordFeatureUsage(input: {
    action: string;
    featureId: string;
    metadata?: Record<string, unknown>;
    userId?: string;
  }): Promise<string> {
    const id = `usage_${randomUUID()}`;
    const attributedWorkItemId =
      stringFromMetadata(input.metadata, "workItemId") ??
      stringFromMetadata(input.metadata, "attributedWorkItemId") ??
      (await this.resolveReleasedFeatureWorkItem(input.featureId));
    const metadata = {
      ...(input.metadata ?? {}),
      ...(attributedWorkItemId
        ? {
            attributedWorkItemId,
            attributionSource: stringFromMetadata(input.metadata, "workItemId")
              ? "sdk_metadata"
              : "release_feature_id",
          }
        : {}),
    };
    await this.pool.query(
      `insert into feature_usage_events (id, feature_id, user_id, action, metadata)
       values ($1, $2, $3, $4, $5)`,
      [id, input.featureId, input.userId ?? null, input.action, JSON.stringify(metadata)],
    );
    return id;
  }

  async resolveReleasedFeatureWorkItem(featureId: string): Promise<string | null> {
    const result = await this.pool.query<{ work_item_id: string }>(
      `select work_item_id
       from release_events
       where metadata ->> 'featureId' = $1
       order by created_at desc
       limit 1`,
      [featureId],
    );
    return result.rows[0]?.work_item_id ?? null;
  }

  async recordWorkerHeartbeat(input: WorkerHeartbeatInput): Promise<WorkerHeartbeatRow> {
    const result = await this.pool.query(
      `insert into worker_heartbeats
       (worker_name, runner_mode, codex_auth_mode, worker_kind, status, last_seen_at, updated_at)
       values ($1, $2, $3, $4, $5, now(), now())
       on conflict (workspace_id, worker_name) do update
       set runner_mode = excluded.runner_mode,
           codex_auth_mode = excluded.codex_auth_mode,
           worker_kind = excluded.worker_kind,
           status = excluded.status,
           last_seen_at = now(),
           updated_at = now()
       returning worker_name, runner_mode, codex_auth_mode, worker_kind, status, last_seen_at`,
      [input.workerName, input.runnerMode, input.codexAuthMode, input.workerKind, input.status],
    );
    return workerHeartbeatFromRow(result.rows[0]);
  }

  async getLatestWorkerHeartbeat(): Promise<WorkerHeartbeatRow | null> {
    const result = await this.pool.query(
      `select worker_name, runner_mode, codex_auth_mode, worker_kind, status, last_seen_at
       from worker_heartbeats
       order by last_seen_at desc
       limit 1`,
    );
    return result.rows[0] ? workerHeartbeatFromRow(result.rows[0]) : null;
  }

  async getApprovalMode(defaultMode: ApprovalMode): Promise<ApprovalMode> {
    const result = await this.pool.query<{ mode: string | null }>(
      `select value ->> 'mode' as mode
       from policy_configs
       where key = 'approval_mode'
       limit 1`,
    );
    return approvalModeFromValue(result.rows[0]?.mode) ?? defaultMode;
  }

  async setApprovalMode(mode: ApprovalMode, actor = "operator"): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into policy_configs (id, key, value)
         values ($1, 'approval_mode', $2)
         on conflict (key) do update
         set value = excluded.value,
             updated_at = now()`,
        [`policy_${randomUUID()}`, JSON.stringify({ mode })],
      );
      await client.query(
        `insert into audit_events (id, actor, event, target_type, target_id, metadata)
         values ($1, $2, 'approval_mode_updated', 'policy_config', 'approval_mode', $3)`,
        [`audit_${randomUUID()}`, actor, JSON.stringify({ mode })],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async getCodexAuthMode(defaultMode: CodexAuthMode): Promise<CodexAuthMode> {
    const result = await this.pool.query<{ mode: string | null }>(
      `select value ->> 'mode' as mode
       from policy_configs
       where key = 'codex_auth_mode'
       limit 1`,
    );
    return codexAuthModeFromValue(result.rows[0]?.mode) ?? defaultMode;
  }

  async setCodexAuthMode(mode: CodexAuthMode, actor = "operator"): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into policy_configs (id, key, value)
         values ($1, 'codex_auth_mode', $2)
         on conflict (key) do update
         set value = excluded.value,
             updated_at = now()`,
        [`policy_${randomUUID()}`, JSON.stringify({ mode })],
      );
      await client.query(
        `insert into audit_events (id, actor, event, target_type, target_id, metadata)
         values ($1, $2, 'codex_auth_mode_updated', 'policy_config', 'codex_auth_mode', $3)`,
        [`audit_${randomUUID()}`, actor, JSON.stringify({ mode })],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async getCostBudget(defaultBudget: CostBudgetPolicy): Promise<CostBudgetPolicy> {
    const budget = await this.pool.query<{ value: Record<string, unknown> | null }>(
      `select value
       from policy_configs
       where key = 'cost_budget'
       limit 1`,
    );
    const value = recordFromRow(budget.rows[0]?.value);
    if (budget.rows.length > 0) {
      return normalizeCostBudget(value, defaultBudget);
    }

    const legacyMaxFeatureCostUsd = await this.getMaxFeatureCostUsd(defaultBudget.maxFeatureCostUsd);
    return {
      ...defaultBudget,
      maxFeatureCostUsd: legacyMaxFeatureCostUsd,
    };
  }

  async getCostBudgetUsage(): Promise<CostBudgetUsage> {
    const result = await this.pool.query<{
      month_actual_tokens: string | null;
      month_actual_usd: string | null;
      today_actual_tokens: string | null;
      today_actual_usd: string | null;
    }>(
      `select
         coalesce(sum(amount_usd) filter (where phase = 'actual' and created_at >= date_trunc('day', now())), 0)::text
           as today_actual_usd,
         coalesce(sum(amount_usd) filter (where phase = 'actual' and created_at >= date_trunc('month', now())), 0)::text
           as month_actual_usd,
         coalesce(sum(coalesce((metadata ->> 'tokens')::numeric, 0)) filter
           (where phase = 'actual' and created_at >= date_trunc('day', now())), 0)::text
           as today_actual_tokens,
         coalesce(sum(coalesce((metadata ->> 'tokens')::numeric, 0)) filter
           (where phase = 'actual' and created_at >= date_trunc('month', now())), 0)::text
           as month_actual_tokens
       from cost_records`,
    );
    const row = result.rows[0];
    return {
      monthActualTokens: Math.round(nonNegativeNumberFromValue(row?.month_actual_tokens) ?? 0),
      monthActualUsd: roundCurrency(nonNegativeNumberFromValue(row?.month_actual_usd) ?? 0),
      todayActualTokens: Math.round(nonNegativeNumberFromValue(row?.today_actual_tokens) ?? 0),
      todayActualUsd: roundCurrency(nonNegativeNumberFromValue(row?.today_actual_usd) ?? 0),
    };
  }

  async getMaxFeatureCostUsd(defaultCap: number): Promise<number> {
    const result = await this.pool.query<{ amount_usd: string | null }>(
      `select value ->> 'amountUsd' as amount_usd
       from policy_configs
       where key = 'max_feature_cost_usd'
       limit 1`,
    );
    const parsed = Number(result.rows[0]?.amount_usd);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultCap;
  }

  async getMergeMode(defaultMode: MergeMode): Promise<MergeMode> {
    const result = await this.pool.query<{ mode: string | null }>(
      `select value ->> 'mode' as mode
       from policy_configs
       where key = 'merge_mode'
       limit 1`,
    );
    return mergeModeFromValue(result.rows[0]?.mode) ?? defaultMode;
  }

  async setMergeMode(mode: MergeMode, actor = "operator"): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into policy_configs (id, key, value)
         values ($1, 'merge_mode', $2)
         on conflict (key) do update
         set value = excluded.value,
             updated_at = now()`,
        [`policy_${randomUUID()}`, JSON.stringify({ mode })],
      );
      await client.query(
        `insert into audit_events (id, actor, event, target_type, target_id, metadata)
         values ($1, $2, 'merge_mode_updated', 'policy_config', 'merge_mode', $3)`,
        [`audit_${randomUUID()}`, actor, JSON.stringify({ mode })],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async getMergeGuardrailPolicy(defaultPolicy: MergeGuardrailPolicy): Promise<MergeGuardrailPolicy> {
    const result = await this.pool.query<{ value: Record<string, unknown> | null }>(
      `select value
       from policy_configs
       where key = 'merge_guardrails'
       limit 1`,
    );
    const value = recordFromRow(result.rows[0]?.value);
    return {
      autoMergePolicyEnabled:
        typeof value.autoMergePolicyEnabled === "boolean"
          ? value.autoMergePolicyEnabled
          : defaultPolicy.autoMergePolicyEnabled,
      maxSafeDiffLines: positiveIntegerFromValue(value.maxSafeDiffLines) ?? defaultPolicy.maxSafeDiffLines,
      protectedPathFragments: nonEmptyStringArray(value.protectedPathFragments, defaultPolicy.protectedPathFragments),
    };
  }

  async setMergeGuardrailPolicy(policy: MergeGuardrailPolicy, actor = "operator"): Promise<MergeGuardrailPolicy> {
    const normalized: MergeGuardrailPolicy = {
      autoMergePolicyEnabled: policy.autoMergePolicyEnabled,
      maxSafeDiffLines: Math.max(1, Math.floor(policy.maxSafeDiffLines)),
      protectedPathFragments: nonEmptyStringArray(policy.protectedPathFragments, []),
    };
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into policy_configs (id, key, value)
         values ($1, 'merge_guardrails', $2)
         on conflict (key) do update
         set value = excluded.value,
             updated_at = now()`,
        [`policy_${randomUUID()}`, JSON.stringify(normalized)],
      );
      await client.query(
        `insert into audit_events (id, actor, event, target_type, target_id, metadata)
         values ($1, $2, 'merge_guardrails_updated', 'policy_config', 'merge_guardrails', $3)`,
        [`audit_${randomUUID()}`, actor, JSON.stringify(normalized)],
      );
      await client.query("commit");
      return normalized;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async setMaxFeatureCostUsd(amountUsd: number, actor = "operator"): Promise<void> {
    const normalized = roundCurrency(amountUsd);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into policy_configs (id, key, value)
         values ($1, 'max_feature_cost_usd', $2)
         on conflict (key) do update
         set value = excluded.value,
             updated_at = now()`,
        [`policy_${randomUUID()}`, JSON.stringify({ amountUsd: normalized })],
      );
      await client.query(
        `insert into audit_events (id, actor, event, target_type, target_id, metadata)
         values ($1, $2, 'cost_cap_updated', 'policy_config', 'max_feature_cost_usd', $3)`,
        [`audit_${randomUUID()}`, actor, JSON.stringify({ amountUsd: normalized })],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async setCostBudget(policy: CostBudgetPolicy, actor = "operator"): Promise<CostBudgetPolicy> {
    const normalized = normalizeCostBudget(policy, policy);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into policy_configs (id, key, value)
         values ($1, 'cost_budget', $2)
         on conflict (key) do update
         set value = excluded.value,
             updated_at = now()`,
        [`policy_${randomUUID()}`, JSON.stringify(normalized)],
      );
      await client.query(
        `insert into policy_configs (id, key, value)
         values ($1, 'max_feature_cost_usd', $2)
         on conflict (key) do update
         set value = excluded.value,
             updated_at = now()`,
        [`policy_${randomUUID()}`, JSON.stringify({ amountUsd: normalized.maxFeatureCostUsd })],
      );
      await client.query(
        `insert into audit_events (id, actor, event, target_type, target_id, metadata)
         values ($1, $2, 'cost_budget_updated', 'policy_config', 'cost_budget', $3)`,
        [`audit_${randomUUID()}`, actor, JSON.stringify(normalized)],
      );
      await client.query("commit");
      return normalized;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async getControlRoomSnapshot(): Promise<ControlRoomSnapshot> {
    const [counts, feedbackClusters, workItems, recentFeedback, recentAgentRuns, recentAssumptions, recentUsage] =
      await Promise.all([
      this.pool.query<{
        agent_runs: string;
        feedback_signals: string;
        feature_usage_events: string;
        open_work_items: string;
      }>(
        `select
          (select count(*) from feedback_signals)::text as feedback_signals,
          (select count(*) from work_items where status not in ('shipped', 'closed', 'not_planned', 'blocked', 'failed'))::text as open_work_items,
          (select count(*) from agent_runs)::text as agent_runs,
          (select count(*) from feature_usage_events)::text as feature_usage_events`,
      ),
      this.listFeedbackClusters(),
      this.listWorkItems(),
      this.pool.query(
        `select id, source, sanitized_summary, cluster_key, status, user_message, created_at
         from feedback_signals order by created_at desc limit 20`,
      ),
      this.pool.query(
        `select id, work_item_id, run_type, agent_name, status, summary, cost_actual, created_at, completed_at
         from agent_runs order by created_at desc limit 20`,
      ),
      this.pool.query(
        `select id, work_item_id, agent_run_id, assumptions, defaults_used, alternatives_skipped,
                checks_run, checks_skipped, human_questions, impact_areas, confidence, notes, unresolved, created_at
         from agent_assumptions order by created_at desc limit 20`,
      ),
      this.pool.query(
        `select id, feature_id, user_id, action, metadata, created_at
         from feature_usage_events order by created_at desc limit 20`,
      ),
    ]);

    const countRow = counts.rows[0];
    return {
      counts: {
        agentRuns: Number(countRow?.agent_runs ?? 0),
        feedbackSignals: Number(countRow?.feedback_signals ?? 0),
        featureUsageEvents: Number(countRow?.feature_usage_events ?? 0),
        openWorkItems: Number(countRow?.open_work_items ?? 0),
      },
      feedbackClusters,
      recentAgentRuns: recentAgentRuns.rows,
      recentAssumptions: recentAssumptions.rows,
      recentFeedback: recentFeedback.rows,
      recentUsage: recentUsage.rows,
      workItems,
    };
  }
}

function workItemFromRow(row: Record<string, unknown>): WorkItemRow {
  return {
    autoMergeEligible: Boolean(row.auto_merge_eligible),
    category: String(row.category),
    clusterKey: String(row.cluster_key),
    costEstimate: row.cost_estimate as FeatureCostEstimate,
    createdAt: (row.created_at as Date).toISOString(),
    githubIssueUrl: row.github_issue_url ? String(row.github_issue_url) : null,
    githubPrUrl: row.github_pr_url ? String(row.github_pr_url) : null,
    id: String(row.id),
    latestActualCost: actualCostFromRow(row.latest_actual_cost),
    latestBranchName: stringOrNull(row.latest_branch_name),
    reviewDecision: reviewDecisionFromRow(row, "review_id"),
    riskTier: String(row.risk_tier),
    shouldCreateIssue: Boolean(row.should_create_issue),
    signalSources: stringArrayFromRow(row.signal_sources),
    status: String(row.status),
    summary: String(row.summary),
    title: String(row.title),
    unresolvedAssumptions: assumptionRecordsFromRow(row.unresolved_assumptions),
    updatedAt: (row.updated_at as Date).toISOString(),
    userStatus: String(row.user_status),
  };
}

function reviewDecisionFromRow(
  row: Record<string, unknown> | undefined,
  idField: "id" | "review_id" = "id",
): WorkItemReviewDecision | null {
  if (!row?.[idField]) return null;
  const approved = row.review_approved ?? row.approved;
  const reviewType = row.review_type === "agent" ? "agent" : "human";
  return {
    actor: String(row.review_actor ?? row.actor ?? "operator"),
    approved: approved === true || approved === "true",
    createdAt: dateString(row.review_created_at ?? row.created_at),
    id: String(row[idField]),
    reviewType,
    summary: String(row.review_summary ?? row.summary ?? "Review decision recorded."),
  };
}

function feedbackClusterFromRow(row: Record<string, unknown>): FeedbackClusterRow {
  return {
    activeWorkItemId: stringOrNull(row.active_work_item_id),
    activeWorkItemStatus: stringOrNull(row.active_work_item_status),
    category: String(row.category),
    clusterKey: String(row.cluster_key),
    latestSignalAt: dateString(row.latest_signal_at),
    latestStatus: stringOrNull(row.latest_status),
    latestUserMessage: stringOrNull(row.latest_user_message),
    signalCount: Number(row.signal_count ?? 0),
    title: String(row.title),
    updatedAt: dateString(row.updated_at),
  };
}

function agentRunLedgerFromRow(row: Record<string, unknown>): AgentRunLedgerRow {
  return {
    agentName: String(row.agent_name),
    completedAt: dateOrNull(row.completed_at),
    costActual: actualCostFromRow(row.cost_actual),
    createdAt: dateString(row.created_at),
    id: String(row.id),
    metadata: recordFromRow(row.metadata),
    runType: String(row.run_type),
    status: String(row.status),
    summary: String(row.summary),
    workItemId: stringOrNull(row.work_item_id),
  };
}

function assumptionLedgerFromRow(row: Record<string, unknown>): AssumptionLedgerRow {
  return {
    ...buildAssumptionRecord({
      alternativesSkipped: stringArrayFromRow(row.alternatives_skipped),
      assumptions: stringArrayFromRow(row.assumptions),
      checksRun: stringArrayFromRow(row.checks_run),
      checksSkipped: stringArrayFromRow(row.checks_skipped),
      confidence: confidenceFromRow(row.confidence),
      defaultsUsed: stringArrayFromRow(row.defaults_used),
      humanQuestions: stringArrayFromRow(row.human_questions),
      impactAreas: stringArrayFromRow(row.impact_areas) as AgentAssumptionRecord["impactAreas"],
      notes: String(row.notes),
      unresolved: row.unresolved === true,
    }),
    agentRunId: stringOrNull(row.agent_run_id),
    createdAt: dateString(row.created_at),
    id: String(row.id),
    workItemId: stringOrNull(row.work_item_id),
  };
}

function costLedgerFromRow(row: Record<string, unknown>): CostLedgerRow {
  return {
    amountUsd: Number(row.amount_usd ?? 0),
    confidence: String(row.confidence),
    createdAt: dateString(row.created_at),
    id: String(row.id),
    metadata: recordFromRow(row.metadata),
    model: String(row.model),
    phase: String(row.phase),
    workItemId: stringOrNull(row.work_item_id),
  };
}

function githubArtifactLedgerFromRow(row: Record<string, unknown>): GithubArtifactLedgerRow {
  return {
    artifactNumber: row.artifact_number === null || row.artifact_number === undefined ? null : Number(row.artifact_number),
    artifactType: String(row.artifact_type),
    createdAt: dateString(row.created_at),
    id: String(row.id),
    metadata: recordFromRow(row.metadata),
    url: String(row.url),
    workItemId: stringOrNull(row.work_item_id),
  };
}

function releaseLedgerFromRow(row: Record<string, unknown>): ReleaseLedgerRow {
  return {
    createdAt: dateString(row.created_at),
    id: String(row.id),
    metadata: recordFromRow(row.metadata),
    status: String(row.status),
    workItemId: stringOrNull(row.work_item_id),
  };
}

function notificationLedgerFromRow(row: Record<string, unknown>): NotificationLedgerRow {
  return {
    clarificationQuestions: clarificationQuestionsFromRow(row.clarification_questions),
    createdAt: dateString(row.created_at),
    feedbackId: stringOrNull(row.feedback_id),
    id: String(row.id),
    message: String(row.message),
    status: String(row.status),
    workItemId: stringOrNull(row.work_item_id),
  };
}

function clarificationQuestionsFromRow(value: unknown): UserClarificationQuestion[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id.trim() : "";
      const question = typeof record.question === "string" ? record.question.trim() : "";
      const placeholder = typeof record.placeholder === "string" ? record.placeholder.trim() : "";
      if (!id || !question) return null;
      return {
        id,
        ...(placeholder ? { placeholder } : {}),
        question,
      };
    })
    .filter((item): item is UserClarificationQuestion => item !== null);
}

function usageAttributionFromRow(row: Record<string, unknown>): UsageAttributionRow {
  return {
    eventCount: Number(row.event_count ?? 0),
    featureId: String(row.feature_id),
    latestUsageAt: dateString(row.latest_usage_at),
    requesterCount: Number(row.requester_count ?? 0),
    uniqueUsers: Number(row.unique_users ?? 0),
    workItemId: String(row.work_item_id),
  };
}

function auditLedgerFromRow(row: Record<string, unknown>): AuditLedgerRow {
  return {
    actor: String(row.actor),
    createdAt: dateString(row.created_at),
    event: String(row.event),
    id: String(row.id),
    metadata: recordFromRow(row.metadata),
    targetId: String(row.target_id),
    targetType: String(row.target_type),
  };
}

function workerHeartbeatFromRow(row: Record<string, unknown>): WorkerHeartbeatRow {
  return {
    codexAuthMode: String(row.codex_auth_mode),
    lastSeenAt: dateString(row.last_seen_at),
    runnerMode: String(row.runner_mode),
    status: String(row.status),
    workerKind: String(row.worker_kind),
    workerName: String(row.worker_name),
  };
}

function actualCostFromRow(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function recordFromRow(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function dateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.length > 0) return new Date(value).toISOString();
  return new Date(0).toISOString();
}

function dateOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return dateString(value);
}

function confidenceFromRow(value: unknown): AgentAssumptionRecord["confidence"] {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "low";
}

function stringArrayFromRow(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function nonEmptyStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const clean = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
  return clean.length > 0 ? clean : fallback;
}

function positiveIntegerFromValue(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number <= 0) return null;
  return number;
}

function nonNegativeNumberFromValue(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return number;
}

function positiveNumberFromValue(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return number;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeCostBudget(value: Record<string, unknown> | CostBudgetPolicy, fallback: CostBudgetPolicy): CostBudgetPolicy {
  return {
    maxDailyCostUsd: roundCurrency(positiveNumberFromValue(value.maxDailyCostUsd, fallback.maxDailyCostUsd)),
    maxFeatureCostUsd: roundCurrency(positiveNumberFromValue(value.maxFeatureCostUsd, fallback.maxFeatureCostUsd)),
    maxMonthlyCostUsd: roundCurrency(positiveNumberFromValue(value.maxMonthlyCostUsd, fallback.maxMonthlyCostUsd)),
    maxTokensPerRun: Math.round(positiveNumberFromValue(value.maxTokensPerRun, fallback.maxTokensPerRun)),
  };
}

function tokensFromCostActual(costActual: Record<string, unknown>): number | null {
  const tokens = nonNegativeNumberFromValue(costActual.tokens);
  return tokens === null ? null : Math.round(tokens);
}

async function insertAssumptionRecords(
  client: pg.PoolClient,
  input: {
    agentRunId: string;
    assumptions?: AgentAssumptionRecord[];
    workItemId: string;
  },
): Promise<void> {
  for (const raw of input.assumptions ?? []) {
    const record = buildAssumptionRecord(raw);
    await client.query(
      `insert into agent_assumptions
       (id, work_item_id, agent_run_id, assumptions, defaults_used, alternatives_skipped,
        checks_run, checks_skipped, human_questions, impact_areas, confidence, notes, unresolved)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        `assumption_${randomUUID()}`,
        input.workItemId,
        input.agentRunId,
        JSON.stringify(record.assumptions),
        JSON.stringify(record.defaultsUsed),
        JSON.stringify(record.alternativesSkipped),
        JSON.stringify(record.checksRun),
        JSON.stringify(record.checksSkipped),
        JSON.stringify(record.humanQuestions),
        JSON.stringify(record.impactAreas),
        record.confidence,
        record.notes,
        record.unresolved,
      ],
    );
  }
}

function assumptionRecordsFromRow(value: unknown): AgentAssumptionRecord[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => buildAssumptionRecord(item as Partial<AgentAssumptionRecord>));
}

async function setLatestNotificationQuestions(
  client: pg.PoolClient,
  feedbackId: string,
  workItemId: string | null,
  questions: UserClarificationQuestion[],
): Promise<void> {
  if (questions.length === 0) return;
  await client.query(
    `update user_notifications
     set clarification_questions = $3
     where id = (
       select id
       from user_notifications
       where feedback_id = $1 and work_item_id is not distinct from $2
       order by created_at desc
       limit 1
     )`,
    [feedbackId, workItemId, JSON.stringify(questions)],
  );
}

async function upsertClusterUserMessage(
  client: pg.PoolClient,
  input: {
    clusterKey: string;
    message: string;
    status: UserFeedbackState;
    workItemId: string;
  },
): Promise<void> {
  await client.query(
    `update feedback_signals
     set status = $2, user_message = $3, updated_at = now()
     where cluster_key = $1`,
    [input.clusterKey, input.status, input.message],
  );
  await client.query(
    `insert into user_notifications (id, feedback_id, work_item_id, status, message)
     select $1 || '_' || fs.id, fs.id, $2, $3, $4
     from feedback_signals fs
     where fs.cluster_key = $5`,
    [`note_${randomUUID()}`, input.workItemId, input.status, input.message, input.clusterKey],
  );
}

function completionStateForRun(status: RunnerJobCompletionInput["status"]): {
  message: string;
  userStatus: UserFeedbackState;
  workItemStatus: string;
} {
  if (status === "succeeded") {
    return {
      message: "An agent implemented this and it is waiting for review or release.",
      userStatus: "implemented",
      workItemStatus: "implemented",
    };
  }
  if (status === "blocked") {
    return {
      message: "We reviewed this, but it is blocked and will not ship without human intervention.",
      userStatus: "blocked",
      workItemStatus: "blocked",
    };
  }
  return {
    message: "An agent tried this, but it failed and needs human review before it can ship.",
    userStatus: "blocked",
    workItemStatus: "failed",
  };
}

function decisionMessageForStatus(status: WorkItemDecisionInput["status"]): string {
  if (status === "not_planned") {
    return "We reviewed this request and do not plan to build it right now.";
  }
  return "We reviewed this request and it is blocked from shipping without human intervention.";
}

function followUpForExistingWorkItem(status: string): { message: string; status: UserFeedbackState } {
  if (status === "implemented") {
    return {
      message: "A matching request has been implemented and is waiting for review or release. It is not shipped yet.",
      status: "implemented",
    };
  }
  if (status === "in_progress") {
    return {
      message: "An agent is already working on a matching request. It is not shipped yet.",
      status: "in_progress",
    };
  }
  return {
    message: "Thanks, we saved this and grouped it with matching feedback already in the queue. It is not shipped yet.",
    status: "grouped",
  };
}

function isActualCost(value: Record<string, unknown> | undefined): value is {
  amountUsd: number;
  confidence: "high" | "medium" | "low";
  model: string;
} {
  return (
    typeof value?.amountUsd === "number" &&
    (value.confidence === "high" || value.confidence === "medium" || value.confidence === "low") &&
    typeof value.model === "string"
  );
}

function stringFromMetadata(metadata: Record<string, unknown> | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function githubNumberFromUrl(url: string): number | undefined {
  const raw = url.split("/").filter(Boolean).at(-1);
  const value = Number(raw);
  return Number.isInteger(value) ? value : undefined;
}

function approvalModeFromValue(value: string | null | undefined): ApprovalMode | null {
  if (value === "auto" || value === "manual") return value;
  return null;
}

function codexAuthModeFromValue(value: string | null | undefined): CodexAuthMode | null {
  if (value === "api_key" || value === "cli") return value;
  return null;
}

function mergeModeFromValue(value: string | null | undefined): MergeMode | null {
  if (value === "agent_reviewed_auto_merge" || value === "human_exception_required" || value === "implement_only") {
    return value;
  }
  return null;
}
