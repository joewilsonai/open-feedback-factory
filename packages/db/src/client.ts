import { randomUUID } from "node:crypto";
import {
  buildUserStatus,
  type FeatureCostEstimate,
  type FeedbackInput,
  type SanitizedFeedback,
  type UserFeedbackStatus,
  type WorkRoutingDecision,
} from "@open-feedback-factory/core";
import pg from "pg";

const { Pool } = pg;

export interface FeedbackIntakeResult {
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
  shouldCreateIssue: boolean;
  githubIssueUrl: string | null;
  githubPrUrl: string | null;
  autoMergeEligible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRunInput {
  agentName: string;
  costActual?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  runType: string;
  status: string;
  summary: string;
  workItemId: string;
}

export interface ControlRoomSnapshot {
  counts: {
    agentRuns: number;
    feedbackSignals: number;
    featureUsageEvents: number;
    openWorkItems: number;
  };
  recentAgentRuns: Array<Record<string, unknown>>;
  recentFeedback: Array<Record<string, unknown>>;
  recentUsage: Array<Record<string, unknown>>;
  workItems: WorkItemRow[];
}

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
    let workItemId: string | null = null;

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
          input.decision.userStatus,
          input.decision.userMessage,
        ],
      );

      if (input.decision.action === "create_work_item") {
        const existing = await client.query<{ id: string }>(
          `select id from work_items
           where cluster_key = $1 and status not in ('shipped', 'closed', 'not_planned', 'blocked')
           order by created_at asc
           limit 1`,
          [input.decision.clusterKey],
        );

        workItemId = existing.rows[0]?.id ?? `work_${randomUUID()}`;
        if (!existing.rows[0]) {
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
        `insert into user_notifications (id, feedback_id, work_item_id, status, message)
         values ($1, $2, $3, $4, $5)`,
        [
          `note_${randomUUID()}`,
          feedbackId,
          workItemId,
          input.decision.userStatus,
          input.decision.userMessage,
        ],
      );

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
      feedbackId,
      status: buildUserStatus({
        feedbackId,
        message: input.decision.userMessage,
        state: input.decision.userStatus,
      }),
      workItemId,
    };
  }

  async getUserFeedbackStatus(feedbackId: string): Promise<UserFeedbackStatus | null> {
    const result = await this.pool.query<{
      created_at: Date;
      message: string;
      status: UserFeedbackStatus["state"];
    }>(
      `select status, message, created_at
       from user_notifications
       where feedback_id = $1
       order by created_at desc
       limit 1`,
      [feedbackId],
    );

    const row = result.rows[0];
    if (!row) return null;

    return buildUserStatus({
      createdAt: row.created_at.toISOString(),
      feedbackId,
      message: row.message,
      state: row.status,
    });
  }

  async listWorkItems(): Promise<WorkItemRow[]> {
    const result = await this.pool.query(
      `select id, cluster_key, title, summary, category, risk_tier, status, user_status,
              cost_estimate, should_create_issue, github_issue_url, github_pr_url,
              auto_merge_eligible, created_at, updated_at
       from work_items
       order by created_at desc
       limit 50`,
    );
    return result.rows.map(workItemFromRow);
  }

  async getWorkItem(id: string): Promise<WorkItemRow | null> {
    const result = await this.pool.query(
      `select id, cluster_key, title, summary, category, risk_tier, status, user_status,
              cost_estimate, should_create_issue, github_issue_url, github_pr_url,
              auto_merge_eligible, created_at, updated_at
       from work_items
       where id = $1`,
      [id],
    );
    return result.rows[0] ? workItemFromRow(result.rows[0]) : null;
  }

  async recordAgentRun(input: AgentRunInput): Promise<string> {
    const id = `run_${randomUUID()}`;
    await this.pool.query(
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
    return id;
  }

  async markWorkItemReleased(workItemId: string, message = "This request has shipped."): Promise<void> {
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
         values ($1, $2, 'shipped', '{}'::jsonb)`,
        [`release_${randomUUID()}`, workItemId],
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

  async recordFeatureUsage(input: {
    action: string;
    featureId: string;
    metadata?: Record<string, unknown>;
    userId?: string;
  }): Promise<string> {
    const id = `usage_${randomUUID()}`;
    await this.pool.query(
      `insert into feature_usage_events (id, feature_id, user_id, action, metadata)
       values ($1, $2, $3, $4, $5)`,
      [id, input.featureId, input.userId ?? null, input.action, JSON.stringify(input.metadata ?? {})],
    );
    return id;
  }

  async getControlRoomSnapshot(): Promise<ControlRoomSnapshot> {
    const [counts, workItems, recentFeedback, recentAgentRuns, recentUsage] = await Promise.all([
      this.pool.query<{
        agent_runs: string;
        feedback_signals: string;
        feature_usage_events: string;
        open_work_items: string;
      }>(
        `select
          (select count(*) from feedback_signals)::text as feedback_signals,
          (select count(*) from work_items where status not in ('shipped', 'closed'))::text as open_work_items,
          (select count(*) from agent_runs)::text as agent_runs,
          (select count(*) from feature_usage_events)::text as feature_usage_events`,
      ),
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
      recentAgentRuns: recentAgentRuns.rows,
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
    riskTier: String(row.risk_tier),
    shouldCreateIssue: Boolean(row.should_create_issue),
    status: String(row.status),
    summary: String(row.summary),
    title: String(row.title),
    updatedAt: (row.updated_at as Date).toISOString(),
    userStatus: String(row.user_status),
  };
}
