import { randomUUID } from "node:crypto";
import {
  buildUserStatus,
  type FeatureCostEstimate,
  type FeedbackInput,
  type SanitizedFeedback,
  type UserFeedbackState,
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

export interface RunnerJobCompletionInput extends AgentRunInput {
  status: "blocked" | "failed" | "succeeded";
}

export interface GithubArtifactInput {
  artifactNumber?: number;
  artifactType: "issue" | "pull_request";
  metadata?: Record<string, unknown>;
  url: string;
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
        message: userMessage,
        state: userStatus,
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

  async claimNextWorkItem(workerName = "worker", workItemId?: string): Promise<WorkItemRow | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await client.query(
        `with next_work_item as (
         select id from work_items
           where status = 'planned'
             and ($1::text is null or id = $1)
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
                   wi.created_at, wi.updated_at`,
        [workItemId ?? null],
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
            JSON.stringify({ agentRunId: runId }),
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
      await client.query(
        `insert into github_artifacts (id, work_item_id, artifact_type, url, artifact_number, metadata)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          id,
          input.workItemId,
          input.artifactType,
          input.url,
          input.artifactNumber ?? null,
          JSON.stringify(input.metadata ?? {}),
        ],
      );

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
            artifactId: id,
            artifactType: input.artifactType,
            url: input.url,
          }),
        ],
      );
      await client.query("commit");
      return id;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
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
          (select count(*) from work_items where status not in ('shipped', 'closed', 'not_planned', 'blocked', 'failed'))::text as open_work_items,
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
      userStatus: "in_progress",
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

function followUpForExistingWorkItem(status: string): { message: string; status: UserFeedbackState } {
  if (status === "implemented") {
    return {
      message: "An agent implemented a matching request and it is waiting for review or release.",
      status: "in_progress",
    };
  }
  if (status === "in_progress") {
    return {
      message: "An agent is already working on a matching request.",
      status: "in_progress",
    };
  }
  return {
    message: "We grouped this with a matching request that is already in the queue.",
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
