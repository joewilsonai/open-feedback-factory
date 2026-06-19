# Open Feedback Factory V1 Design

## Objective

Build a standalone open-source feedback-to-feature platform for indie
developers and small teams. V1 is for our own use only, but it must be designed
as a product that can later be published and installed by others.

The first working promise:

> Add this to a GitHub-backed web app, let a user request a safe improvement,
> and watch the system create a sanitized issue, run Codex, open a PR,
> auto-merge only if policy allows, record cost, detect release, notify the
> user, and track whether the feature gets used.

HeyTelli is prior proof and inspiration, not a dependency, tenant, or product
assumption. The V1 system should not depend on HeyTelli schema, HeyTelli
infrastructure, dating-app language, or HeyTelli release paths.

## V1 Scope

V1 is a demo-first internal dogfood build. It proves the complete loop in a
bounded toy web app before becoming a public open-source launch.

Included:

- web SDK for feedback submission, status reads, and feature usage events;
- API service with Postgres;
- focused control center;
- GitHub App integration;
- Codex-only built-in runner;
- sanitized GitHub issue creation;
- PR creation;
- narrow policy-gated auto-merge;
- cost estimate and actual cost capture;
- user-facing status and notification, including negative outcomes;
- feature usage attribution;
- Docker Compose local install;
- toy app demo with positive and negative paths;
- doctor command for setup and safety checks.

Excluded from V1:

- HeyTelli-specific code or assumptions;
- public hosted product;
- hosted runners;
- mobile SDK;
- Jira or Linear sync;
- public voting board;
- agent marketplace;
- broad agent-provider support;
- enterprise approval workflows;
- enterprise reporting;
- general-purpose analytics product.

OpenRouter, Requesty, and OpenRouter Fusion remain architectural extension
points. They are documented optional or beta adapters, not required for the V1
working path.

## Product Shape

The public-facing category is feedback-to-feature infrastructure.

The product is not another coding agent and not another feedback board. It is
the control plane between user feedback, product judgment, GitHub, agent work,
review, merge, release, follow-up, and usage attribution.

V1 should prove two demo paths:

1. Positive path: user requests a safe improvement, a sanitized issue is
   created, Codex implements it, a PR opens, gates pass, the PR auto-merges,
   release is detected, the user is told it shipped, and feature usage is
   recorded.
2. Negative path: user requests something unsafe, out of scope, duplicate,
   not planned, or below threshold. No unsafe GitHub issue is created. The
   decision is recorded, the user is told why, and repeated demand can surface
   reconsideration later.

## Architecture

V1 has six primary components.

### Web SDK

Embeds in the customer app or toy demo app.

Responsibilities:

- submit feedback;
- read user-safe feedback status;
- record feature usage;
- avoid sending secrets, screenshots, raw transcripts, or large private blobs
  by default;
- attach privacy-safe metadata such as app version, route, surface, and user
  segment.

### API And Postgres

The API owns ingestion, auth, sanitization, control-center data, GitHub
webhooks, runner job state, release markers, notifications, and feature usage
events.

Postgres is the only V1 database. SQLite is intentionally excluded from V1 to
avoid a second schema and migration path.

### Work Router

The work router owns product policy.

It decides:

- whether feedback becomes work;
- whether feedback is grouped, blocked, not planned, waiting for signal, or
  actionable;
- risk tier;
- cost cap;
- queue mode;
- whether a sanitized GitHub issue can be created;
- whether Codex can run;
- whether a PR is eligible for auto-merge;
- user-facing status.

External model routers or gateways must not own these product decisions.

### GitHub App

The GitHub integration is a GitHub App, not a broad personal access token.

Responsibilities:

- create sanitized issues;
- apply labels;
- create branches and PRs;
- link PRs back to work items;
- read checks;
- merge only eligible safe-lane PRs;
- comment safe status updates;
- clean up generated branches;
- receive GitHub webhooks.

### Codex Runner

Codex is the only built-in V1 runner. The runner interface should be pluggable
later, but V1 should avoid pretending every agent is supported.

Responsibilities:

- consume sanitized work item context only;
- create a branch or workspace;
- implement the requested safe change;
- run configured checks;
- emit structured output;
- capture usage and cost when available;
- open a PR;
- report failure reasons and partial cost;
- never push directly to the default branch.

### Control Center

The control center is a focused operator console, not an enterprise admin
suite.

Core screens:

- setup checklist;
- system health;
- feedback inbox;
- clusters and demand;
- work queue;
- work item detail;
- agent runs;
- PR, check, and release status;
- cost estimate vs actual;
- auto-merge policy and status;
- user follow-up status;
- feature usage impact.

The work item detail screen is the demo centerpiece.

## Core Flow

1. User submits feedback in the toy web app through the SDK.
2. API stores raw feedback privately.
3. Sanitizer creates a safe summary and redacts secrets or private data.
4. Work router dedupes or clusters the request.
5. Work router assigns category, status, risk tier, threshold state, and cost
   estimate.
6. If actionable and safe, the GitHub App creates a sanitized issue.
7. Codex Runner receives only sanitized issue and work item context.
8. Codex creates a branch, implements the change, runs checks, records actual
   usage and cost, and opens a PR.
9. Review/check gates evaluate the PR.
10. If the work item is `safe_auto_merge` and every auto-merge gate passes, the
    GitHub App merges the PR.
11. Release detector observes the deployment or release marker.
12. User-facing status changes to shipped, blocked, not planned, needs more
    signal, already available, or another safe status.
13. SDK records feature usage events after the shipped feature is used.
14. Control center shows request-to-PR-to-ship-to-usage impact.

The private database is the source of truth. GitHub and Codex receive sanitized
context only.

## Guardrails And Auto-Merge

V1 includes auto-merge because the product demo needs to show feedback shipping
itself. Auto-merge is narrow, explicit, and policy-gated.

A PR can auto-merge only when all are true:

- repo owner explicitly enabled auto-merge;
- work item risk tier is `safe_auto_merge`;
- branch was created by the GitHub App or runner;
- only allowed paths changed;
- protected paths are untouched;
- diff size is under configured limits;
- configured checks pass;
- Codex structured output says the task completed;
- reviewer lane approves;
- cost stayed under cap;
- no secrets, PII, or redaction warnings were found;
- release and rollback policies are healthy.

Default protected categories:

- auth;
- billing;
- privacy;
- legal;
- encryption;
- data deletion;
- secrets and config;
- infrastructure;
- database migrations;
- release pipeline.

Everything outside the safe lane can still get a PR, but waits for human merge.

## Installation And Demo

Docker Compose is the primary V1 install path.

The repo should ship:

- API container;
- worker/runner container;
- Postgres container;
- control center web container;
- toy demo app container;
- migration command;
- seed command;
- doctor command.

Setup flow:

1. Clone the repo.
2. Run one bootstrap command.
3. Open the setup wizard.
4. Create or install the GitHub App.
5. Add OpenAI/Codex credentials.
6. Confirm repo permissions and protected paths.
7. Verify the request queues or blocks honestly until a real runner is enabled.
8. Enable real PR creation.
9. Optionally enable safe auto-merge.

The demo should work against a toy GitHub repo or toy app first. Users should
see the loop before trusting the product with a production repo.

## Data Model

V1 tables:

- `feedback_signals`;
- `feedback_clusters`;
- `work_items`;
- `agent_runs`;
- `cost_records`;
- `github_artifacts`;
- `release_events`;
- `user_notifications`;
- `feature_usage_events`;
- `policy_configs`;
- `audit_events`.

Raw feedback is private. Sanitized summaries are used for GitHub, Codex,
PR comments, control-center default views, and user-facing messages.

## API Surface

V1 API groups:

- SDK feedback submission;
- SDK status read;
- SDK feature usage event;
- admin and control-center reads;
- policy/config updates;
- GitHub webhook receiver;
- runner job claim and update;
- release/deploy webhook or marker;
- doctor and health endpoints.

The API should keep user-facing status small and safe. It should not expose
internal GitHub URLs, raw prompts, raw agent output, private feedback, or other
users' requests.

## Cost Model

Every actionable work item stores estimate and actual cost.

Estimate inputs:

- risk tier;
- expected model and effort;
- expected reviewer lane;
- expected check/release work;
- historical defaults;
- configured cost cap.

Actual inputs:

- model/provider;
- token usage when available;
- Codex usage totals when available;
- agent attempts;
- reviewer runs;
- check and release runs;
- elapsed time;
- retries.

The control center should show:

- estimated cost;
- actual cost;
- confidence;
- delta;
- cost per requesting user;
- cost per activated user when feature usage exists.

Internal dogfood V1 can tolerate rough estimates, but the actual-cost ledger
must be designed to improve as structured runner usage becomes available.

## Feature Usage Attribution

Feature usage is a V1 feature, not a later analytics add-on.

The SDK supports a minimal event:

```ts
trackFeatureUsage({
  featureId,
  userId,
  action,
  metadata,
});
```

The control center links shipped work items to feature usage events so an
operator can see:

- which requests shipped;
- which users or segments asked for them;
- which users were exposed;
- which users used the shipped feature;
- cost per activated user.

This must remain privacy-safe and intentionally limited. V1 should not become
a full analytics platform.

## Optional Gateway And Deliberation Adapters

Direct Codex/OpenAI is the required V1 path.

The architecture should include adapter seams for:

- OpenRouter as a broad model-provider aggregator;
- Requesty as a managed gateway for routing, policy, cost analytics, approved
  models, fallback, and EU routing;
- OpenRouter Fusion as an optional multi-model deliberation lane.

These adapters are not required for the V1 demo.

Fusion-style deliberation should be reserved for planning, review,
high-cost-of-being-wrong decisions, and disagreement resolution. It should not
be the default coding path.

## Testing And Verification

V1 must test the whole loop.

Required tests:

- SDK submits feedback without private leakage;
- sanitizer removes secrets and PII;
- router classifies safe vs blocked work;
- demand clustering is deterministic;
- GitHub issue body contains only sanitized context;
- Codex runner consumes sanitized context only;
- cost estimate and actual are recorded;
- auto-merge is blocked unless all gates pass;
- user status updates for shipped, not planned, blocked, and needs more signal;
- feature usage links back to shipped work;
- doctor catches missing credentials, GitHub App setup, migration drift,
  runner health, and unsafe policy config.

Failure handling:

- failed agent run records cost and reason;
- failed checks move PR to human review;
- release not detected keeps user status as merged or waiting for release, not
  shipped;
- bad auto-merge triggers incident pause and rollback workflow;
- stale branches and workspaces are cleaned by a system-owned reconciler.

## Implementation Boundaries

The first implementation plan should not attempt the entire PRD. It should
focus on the smallest internal dogfood loop:

1. Docker Compose skeleton.
2. Postgres schema and migrations.
3. Web SDK submit/status/usage.
4. Toy app feedback and feature usage.
5. API ingestion, sanitization, work items, and status.
6. GitHub App issue and PR integration.
7. Codex runner for one safe change class.
8. Safe auto-merge gates.
9. Release marker and user follow-up.
10. Focused control center.
11. Doctor command and loop tests.

After that loop works internally, the PRD can be compressed into a public
README, security model, install guide, and launch roadmap.

## Open Decisions For Later

- Product name.
- Public launch date.
- Hosted product architecture.
- Whether to add Requesty or OpenRouter as the first beta gateway adapter.
- Whether Fusion gets a visible control-center button or stays policy-only.
- Mobile SDK timing.
- Linear/Jira/webhook expansion.
- Public roadmap or changelog widget.

## Approved Design Decisions

- V1 is standalone and not HeyTelli-specific.
- V1 is internal dogfood before public release.
- Demo path is feedback to real PR to safe auto-merge to user follow-up.
- Docker Compose is the primary install.
- GitHub App is required.
- Codex is the only built-in runner.
- Auto-merge exists only for `safe_auto_merge`.
- User-facing follow-up is required for positive and negative outcomes.
- Feature usage attribution is required in V1.
- Direct Codex/OpenAI is the required model path.
- OpenRouter, Requesty, and Fusion are optional adapters.
- Control center is focused and operational.
- Postgres is the only V1 database.
- Web SDK ships before mobile SDK.
