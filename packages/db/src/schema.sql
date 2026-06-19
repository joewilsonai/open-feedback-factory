create table if not exists feedback_signals (
  id text primary key,
  workspace_id text not null default 'default',
  user_id text,
  source text not null,
  severity text not null,
  raw_payload jsonb not null,
  sanitized_summary text not null,
  sanitized_payload jsonb not null,
  privacy_risk text not null,
  redactions jsonb not null,
  cluster_key text not null,
  status text not null,
  user_message text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists feedback_clusters (
  cluster_key text primary key,
  workspace_id text not null default 'default',
  title text not null,
  category text not null,
  signal_count integer not null default 0,
  latest_signal_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists work_items (
  id text primary key,
  workspace_id text not null default 'default',
  cluster_key text not null references feedback_clusters(cluster_key),
  title text not null,
  summary text not null,
  category text not null,
  risk_tier text not null,
  status text not null,
  user_status text not null,
  cost_estimate jsonb not null,
  should_create_issue boolean not null default false,
  github_issue_url text,
  github_pr_url text,
  auto_merge_eligible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_runs (
  id text primary key,
  workspace_id text not null default 'default',
  work_item_id text references work_items(id),
  run_type text not null,
  agent_name text not null,
  status text not null,
  summary text not null,
  cost_actual jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists agent_assumptions (
  id text primary key,
  workspace_id text not null default 'default',
  work_item_id text references work_items(id),
  agent_run_id text references agent_runs(id),
  assumptions jsonb not null default '[]'::jsonb,
  defaults_used jsonb not null default '[]'::jsonb,
  alternatives_skipped jsonb not null default '[]'::jsonb,
  checks_run jsonb not null default '[]'::jsonb,
  checks_skipped jsonb not null default '[]'::jsonb,
  human_questions jsonb not null default '[]'::jsonb,
  impact_areas jsonb not null default '[]'::jsonb,
  confidence text not null,
  notes text not null,
  unresolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists cost_records (
  id text primary key,
  workspace_id text not null default 'default',
  work_item_id text references work_items(id),
  phase text not null,
  amount_usd numeric(10, 4) not null,
  confidence text not null,
  model text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists github_artifacts (
  id text primary key,
  workspace_id text not null default 'default',
  work_item_id text references work_items(id),
  artifact_type text not null,
  url text not null,
  artifact_number integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists release_events (
  id text primary key,
  workspace_id text not null default 'default',
  work_item_id text references work_items(id),
  status text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists user_notifications (
  id text primary key,
  workspace_id text not null default 'default',
  feedback_id text references feedback_signals(id),
  work_item_id text references work_items(id),
  status text not null,
  message text not null,
  clarification_questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists feature_usage_events (
  id text primary key,
  workspace_id text not null default 'default',
  feature_id text not null,
  user_id text,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists policy_configs (
  id text primary key,
  workspace_id text not null default 'default',
  key text not null unique,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_events (
  id text primary key,
  workspace_id text not null default 'default',
  actor text not null,
  event text not null,
  target_type text not null,
  target_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function assumption_record_json(input_row agent_assumptions)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'assumptions', input_row.assumptions,
    'defaultsUsed', input_row.defaults_used,
    'alternativesSkipped', input_row.alternatives_skipped,
    'checksRun', input_row.checks_run,
    'checksSkipped', input_row.checks_skipped,
    'humanQuestions', input_row.human_questions,
    'impactAreas', input_row.impact_areas,
    'confidence', input_row.confidence,
    'notes', input_row.notes,
    'unresolved', input_row.unresolved
  )
$$;

alter table feedback_signals add column if not exists workspace_id text not null default 'default';
alter table feedback_clusters add column if not exists workspace_id text not null default 'default';
alter table work_items add column if not exists workspace_id text not null default 'default';
alter table agent_runs add column if not exists workspace_id text not null default 'default';
alter table agent_assumptions add column if not exists workspace_id text not null default 'default';
alter table cost_records add column if not exists workspace_id text not null default 'default';
alter table github_artifacts add column if not exists workspace_id text not null default 'default';
alter table release_events add column if not exists workspace_id text not null default 'default';
alter table user_notifications add column if not exists workspace_id text not null default 'default';
alter table user_notifications add column if not exists clarification_questions jsonb not null default '[]'::jsonb;
alter table feature_usage_events add column if not exists workspace_id text not null default 'default';
alter table policy_configs add column if not exists workspace_id text not null default 'default';
alter table audit_events add column if not exists workspace_id text not null default 'default';

create or replace function off_workspace_id()
returns text
language sql
stable
as $$
  select coalesce(nullif(current_setting('app.workspace_id', true), ''), 'default')
$$;

alter table feedback_signals enable row level security;
alter table feedback_clusters enable row level security;
alter table work_items enable row level security;
alter table agent_runs enable row level security;
alter table agent_assumptions enable row level security;
alter table cost_records enable row level security;
alter table github_artifacts enable row level security;
alter table release_events enable row level security;
alter table user_notifications enable row level security;
alter table feature_usage_events enable row level security;
alter table policy_configs enable row level security;
alter table audit_events enable row level security;

alter table feedback_signals force row level security;
alter table feedback_clusters force row level security;
alter table work_items force row level security;
alter table agent_runs force row level security;
alter table agent_assumptions force row level security;
alter table cost_records force row level security;
alter table github_artifacts force row level security;
alter table release_events force row level security;
alter table user_notifications force row level security;
alter table feature_usage_events force row level security;
alter table policy_configs force row level security;
alter table audit_events force row level security;

drop policy if exists feedback_signals_workspace_isolation on feedback_signals;
create policy feedback_signals_workspace_isolation on feedback_signals using (workspace_id = off_workspace_id()) with check (workspace_id = off_workspace_id());
drop policy if exists feedback_clusters_workspace_isolation on feedback_clusters;
create policy feedback_clusters_workspace_isolation on feedback_clusters using (workspace_id = off_workspace_id()) with check (workspace_id = off_workspace_id());
drop policy if exists work_items_workspace_isolation on work_items;
create policy work_items_workspace_isolation on work_items using (workspace_id = off_workspace_id()) with check (workspace_id = off_workspace_id());
drop policy if exists agent_runs_workspace_isolation on agent_runs;
create policy agent_runs_workspace_isolation on agent_runs using (workspace_id = off_workspace_id()) with check (workspace_id = off_workspace_id());
drop policy if exists agent_assumptions_workspace_isolation on agent_assumptions;
create policy agent_assumptions_workspace_isolation on agent_assumptions using (workspace_id = off_workspace_id()) with check (workspace_id = off_workspace_id());
drop policy if exists cost_records_workspace_isolation on cost_records;
create policy cost_records_workspace_isolation on cost_records using (workspace_id = off_workspace_id()) with check (workspace_id = off_workspace_id());
drop policy if exists github_artifacts_workspace_isolation on github_artifacts;
create policy github_artifacts_workspace_isolation on github_artifacts using (workspace_id = off_workspace_id()) with check (workspace_id = off_workspace_id());
drop policy if exists release_events_workspace_isolation on release_events;
create policy release_events_workspace_isolation on release_events using (workspace_id = off_workspace_id()) with check (workspace_id = off_workspace_id());
drop policy if exists user_notifications_workspace_isolation on user_notifications;
create policy user_notifications_workspace_isolation on user_notifications using (workspace_id = off_workspace_id()) with check (workspace_id = off_workspace_id());
drop policy if exists feature_usage_events_workspace_isolation on feature_usage_events;
create policy feature_usage_events_workspace_isolation on feature_usage_events using (workspace_id = off_workspace_id()) with check (workspace_id = off_workspace_id());
drop policy if exists policy_configs_workspace_isolation on policy_configs;
create policy policy_configs_workspace_isolation on policy_configs using (workspace_id = off_workspace_id()) with check (workspace_id = off_workspace_id());
drop policy if exists audit_events_workspace_isolation on audit_events;
create policy audit_events_workspace_isolation on audit_events using (workspace_id = off_workspace_id()) with check (workspace_id = off_workspace_id());

create index if not exists feedback_signals_cluster_key_idx on feedback_signals(cluster_key);
create index if not exists work_items_cluster_key_idx on work_items(cluster_key);
create index if not exists agent_runs_work_item_id_idx on agent_runs(work_item_id);
create index if not exists agent_assumptions_work_item_id_idx on agent_assumptions(work_item_id);
create index if not exists agent_assumptions_agent_run_id_idx on agent_assumptions(agent_run_id);
create unique index if not exists github_artifacts_work_item_type_url_idx on github_artifacts(work_item_id, artifact_type, url);
create index if not exists feature_usage_events_feature_id_idx on feature_usage_events(feature_id);
create unique index if not exists audit_events_github_delivery_idx on audit_events(target_id) where event = 'github_webhook_delivery';
