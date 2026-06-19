import pg, { type PoolClient } from "pg";

const { Pool } = pg;

export async function resetDemoData(databaseUrl = process.env.DATABASE_URL): Promise<{
  deletedFeedbackSignals: number;
  deletedWorkItems: number;
  feedbackSources: string[];
  usageMetadataSources: string[];
}> {
  const resolvedDatabaseUrl = databaseUrl ?? "postgres://off:off@127.0.0.1:55432/open_feedback_factory";
  const feedbackSources = (process.env.DEMO_RESET_FEEDBACK_SOURCES ?? "demo_seed,sample_seed,test")
    .split(",")
    .map((source) => source.trim())
    .filter(Boolean);
  const usageMetadataSources = (process.env.DEMO_RESET_USAGE_SOURCES ?? "demo-seed,sample-seed")
    .split(",")
    .map((source) => source.trim())
    .filter(Boolean);

  const pool = new Pool({ connectionString: resolvedDatabaseUrl });
  const client = await pool.connect();

  try {
    await client.query("begin");

    const feedbackIds = await ids(
      client,
      `select id from feedback_signals where source = any($1::text[]) or source like 'test_%'`,
      [feedbackSources],
    );
    const sourceClusters = await ids(
      client,
      `select distinct cluster_key as id
       from feedback_signals
       where source = any($1::text[]) or source like 'test_%'`,
      [feedbackSources],
    );
    const deletableClusters = sourceClusters.length
      ? await ids(
          client,
          `select fc.cluster_key as id
           from feedback_clusters fc
           where fc.cluster_key = any($1::text[])
             and not exists (
               select 1
               from feedback_signals fs
               where fs.cluster_key = fc.cluster_key
                 and fs.source <> all($2::text[])
                 and fs.source not like 'test_%'
             )`,
          [sourceClusters, feedbackSources],
        )
      : [];
    const workItemIds = deletableClusters.length
      ? await ids(client, `select id from work_items where cluster_key = any($1::text[])`, [deletableClusters])
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
       where metadata ->> 'source' = any($1::text[])
          or user_id in ('sample-user', 'demo-user')
          or user_id like 'test-user-%'
          or user_id = 'user-1'`,
      [usageMetadataSources],
    );

    await client.query("commit");
    return {
      deletedFeedbackSignals: feedbackIds.length,
      deletedWorkItems: workItemIds.length,
      feedbackSources,
      usageMetadataSources,
    };
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

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(await resetDemoData(), null, 2));
}
