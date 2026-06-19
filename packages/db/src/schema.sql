create table if not exists feedback_signals (
  id text primary key,
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
  title text not null,
  category text not null,
  signal_count integer not null default 0,
  latest_signal_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists work_items (
  id text primary key,
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

create table if not exists cost_records (
  id text primary key,
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
  work_item_id text references work_items(id),
  artifact_type text not null,
  url text not null,
  artifact_number integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists release_events (
  id text primary key,
  work_item_id text references work_items(id),
  status text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists user_notifications (
  id text primary key,
  feedback_id text references feedback_signals(id),
  work_item_id text references work_items(id),
  status text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists feature_usage_events (
  id text primary key,
  feature_id text not null,
  user_id text,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists policy_configs (
  id text primary key,
  key text not null unique,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_events (
  id text primary key,
  actor text not null,
  event text not null,
  target_type text not null,
  target_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists feedback_signals_cluster_key_idx on feedback_signals(cluster_key);
create index if not exists work_items_cluster_key_idx on work_items(cluster_key);
create index if not exists agent_runs_work_item_id_idx on agent_runs(work_item_id);
create index if not exists feature_usage_events_feature_id_idx on feature_usage_events(feature_id);
