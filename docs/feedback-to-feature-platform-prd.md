# Open Feedback Factory — Product Requirements Document

**Product:** Open Feedback Factory
**Working category:** Open-source feedback-to-feature infrastructure
**Audience:** Indie developers and small product teams
**Status:** Draft v0.1
**Distribution thesis:** Open-source first; hosted product later

---

## 1. Product Thesis

Beta users should be able to ask for improvements from inside a product and
receive a real answer: shipped, already available, planned, needs more signal,
not planned, blocked, or unsafe to build.

Developers should not have to manually copy feedback into GitHub, decide
whether it is actionable, ask an agent to work on it, track the PR, calculate
cost, ship the release, and remember to follow up with the user.

This product turns user feedback into a controlled product-development loop:

```text
user feedback -> private signal -> triage -> sanitized issue -> agent work
-> PR -> review -> merge/deploy -> user follow-up
```

The goal is not to replace product judgment. The goal is to make the full loop
observable, repeatable, safe, and dramatically faster for small teams.

## 2. Positioning

The product is not another coding agent and not another feedback board.

It is the connective tissue between:

- customer feedback tools like Canny, Featurebase, Productboard, and Linear
  Customer Requests;
- coding agents like Codex, GitHub Copilot coding agent, OpenHands, Devin,
  Factory Droid, Claude Code, and similar tools;
- GitHub-native engineering workflows: issues, branches, PRs, reviews, checks,
  releases, and changelogs.

The wedge:

> Add this to your app and your beta users can request features, watch status,
> trigger safe agent work, and get told what shipped or why it will not.

## 3. Target Users

### Primary

Indie developers, solo founders, and small teams with active beta users.

They are building web apps, iOS apps, SaaS products, developer tools, or open
source projects. They already use GitHub and are experimenting with AI coding
agents, but they do not have a reliable system for turning feedback into
shipped improvements.

### Secondary

Open-source maintainers with many issues and limited review bandwidth.

### Later

Larger teams and enterprises with Jira, Linear, SOC2, approval workflows,
audit requirements, and more complex permissions.

Enterprise is intentionally out of scope for the open-source launch story.

## 4. Problems

### User feedback disappears

Beta users submit requests, bug reports, or confusing error reports, then never
hear what happened. Even when the founder builds the feature, the user often
does not know their feedback mattered.

### Agents lack product context

Coding agents can implement GitHub issues, but most beta feedback is not a good
GitHub issue. It may be private, vague, duplicated, emotional, incomplete, or
not yet worth building.

### Developers lack control and trust

Small teams are excited by agentic coding but afraid of repository damage,
privacy leaks, runaway costs, low-quality PRs, and noisy automation.

### Feedback tools stop too early

Feedback products collect, cluster, and prioritize requests, but they usually
stop before implementation. The developer still has to manually bridge the gap
from "users want this" to "a tested PR exists."

### Cost is invisible

Agent-driven development has real model and infrastructure cost. Developers
need an estimate before work starts and actual cost after it finishes.

## 5. Goals

- Make feedback submission easy to embed in web and mobile apps.
- Keep raw user feedback private by default.
- Convert safe, actionable feedback into sanitized GitHub issues.
- Cluster duplicates and use repeated demand to reconsider earlier decisions.
- Let agents implement only work that passes policy gates.
- Let developers define their own guardrails, approval rules, and cost limits.
- Always create PRs, never push directly to `main`.
- Run checks and review lanes before merge.
- Track estimated and actual agent cost per feature.
- Notify users when something ships, already exists, is not planned, needs more
  signal, or is blocked.
- Be open-source and self-hostable from day one.
- Provide a demo that feels magical within minutes.

## 6. Non-Goals

- No enterprise approval trees in V1.
- No Jira-first or Linear-first workflow in V1.
- No public voting board in V1.
- No autonomous direct commits to default branches.
- No raw private feedback in GitHub issues, PRs, CI logs, or agent prompts.
- No promise that every user request will be built.
- No general-purpose coding-agent replacement.
- No agent marketplace in V1.

## 7. Core Product Loop

1. A user submits feedback inside an app.
2. The SDK sends the signal to the product API.
3. The API stores raw feedback privately and creates a sanitized summary.
4. Triage clusters similar feedback and assigns category, priority, risk, and
   decision state.
5. If safe and actionable, the system creates or updates a GitHub issue.
6. A planner turns the issue into a PR-sized implementation plan.
7. An agent runner creates an isolated workspace, implements the change, runs
   checks, records actual cost, pushes a branch, and opens a PR.
8. Reviewer agents and GitHub checks gate merge.
9. Release tracking watches for deployment or TestFlight availability.
10. The original users are notified with a clear outcome.

## 8. V1 Product Surface

### 8.1 SDK

Small SDKs for web and mobile apps.

V1 functions:

```ts
submitFeedback({
  message,
  source,
  severity,
  userId,
  metadata,
});

captureClientError({
  error,
  route,
  userId,
  metadata,
});

getFeedbackStatus({
  feedbackId,
});

trackFeatureExposure({
  featureId,
  userId,
  metadata,
});

trackFeatureUsage({
  featureId,
  userId,
  action,
  metadata,
});

trackFeatureOutcome({
  featureId,
  userId,
  outcome,
  metadata,
});
```

The SDK must support privacy-safe metadata and avoid sending secrets, full
session recordings, raw screenshots, or large transcripts by default.

Feature usage tracking should be optional and privacy-safe. It should let the
system connect shipped feedback to real adoption without becoming a surveillance
tool.

### 8.2 API and Database

Stores:

- raw private feedback;
- sanitized summaries;
- feedback clusters;
- work items;
- decisions and decision reasons;
- GitHub issue and PR links;
- agent runs;
- estimated and actual cost;
- feature exposure, usage, and outcome events;
- feedback-to-feature impact attribution;
- developer-defined guardrail and cost-control policies;
- release/deploy state;
- user notification history.

V1 should support Postgres. A lightweight SQLite mode is desirable for local
demo and open-source adoption, but it should not block launch.

### 8.3 Control Center

A web dashboard for developers.

Primary views:

- incoming feedback;
- clusters and demand count;
- work item status;
- agent lanes;
- estimated vs actual cost;
- PR/release state;
- feature usage and impact attribution;
- decisions not to build;
- guardrail and cost-control configuration;
- reconsideration candidates;
- user follow-up status.

The control center should make the loop easy to demo without exposing private
feedback.

### 8.4 GitHub Integration

V1 is GitHub-first.

Capabilities:

- create sanitized issues;
- apply labels;
- comment status updates;
- create branches and PRs;
- link PRs back to issues;
- read check status;
- close issues when shipped or resolved;
- clean up generated branches/workspaces.

The preferred long-term shape is a GitHub App. The early open-source version
may support a GitHub token for setup simplicity.

### 8.5 Agent Runner

The runner performs implementation work in an isolated workspace.

Supported V1 runner modes:

- local runner;
- GitHub Actions runner;
- optional hosted runner later.

The runner should be agent-provider agnostic, but the initial implementation
can optimize for Codex because Codex already supports noninteractive runs,
cloud tasks, GitHub issue/PR workflows, review, MCP, image input, structured
output, and usage capture.

Required runner behavior:

- create a branch or worktree;
- read only sanitized context;
- check the configured guardrail and cost policy before starting;
- run an implementation agent;
- run configured tests/checks;
- collect token and cost data when available;
- open a PR;
- never merge unless gates allow it;
- clean up temporary workspace state.

### 8.6 Review Gates

V1 risk tiers:

- `safe_auto_merge`: low-risk copy/docs/small UI fixes after checks pass;
- `guarded_auto_merge`: normal product changes requiring reviewer lanes;
- `extra_review`: auth, privacy, payments, release, or data changes;
- `plan_only`: safe to analyze, not safe to implement automatically.

Reviewer lanes:

- code review;
- product review;
- privacy/security review;
- test review;
- release review when applicable.

### 8.7 User Follow-Up

Every submitted item must eventually have a user-safe status.

Statuses:

- received;
- grouped with similar requests;
- planned;
- in progress;
- shipped;
- already available;
- needs more signal;
- not planned;
- not reproducible;
- blocked by privacy/safety;
- out of scope.

The follow-up message should be specific enough to feel human and honest, but
should not expose internal GitHub links, private reasoning, raw agent output,
or other users' feedback.

### 8.8 Codex Integration Strategy

Codex should be the default first implementation target, while the product
remains agent-provider agnostic.

As of the June 2026 research pass, useful Codex surfaces include:

- Codex Cloud and GitHub issue/PR delegation for sanitized GitHub issues;
- Codex Cloud environments for disposable containerized work;
- noninteractive `codex exec --json` for local/self-hosted runners, lifecycle
  events, usage capture, and actual cost accounting;
- `--output-schema` for stable final run summaries such as outcome, PR URL,
  shipped status, cost summary, and user-safe follow-up copy;
- Codex SDK as the longer-term server-side control-plane integration after the
  MVP moves beyond shelling out;
- Codex GitHub Action as a CI-native lane for review, release prep, failed CI
  repair, and guardrail checks;
- Codex GitHub code review as a reviewer lane before guarded auto-merge;
- MCP as the safe bridge between agents and the private control plane.

The product should expose safe MCP tools for agent access, such as:

- `get_sanitized_feedback`;
- `get_work_item`;
- `record_decision`;
- `record_cost`;
- `notify_user`;
- `check_release_status`.

Agents should not query raw private feedback directly. Raw beta data should not
be sent to Codex Cloud. The private database remains the source of truth; Codex
receives sanitized summaries and narrow tool access.

Experimental Codex surfaces such as app-server, exec-server, and remote-control
should not be core MVP dependencies. They can be revisited later if they become
stable and materially simplify hosted execution.

The admin UI should include a Codex capability health panel showing:

- local CLI version;
- latest known version;
- auth state;
- GitHub Action installation state;
- MCP server configuration;
- cloud environment IDs;
- model and effort defaults;
- JSON usage capture status;
- last successful runner health check.

Primary Codex documentation references:

- [Codex changelog](https://developers.openai.com/codex/changelog)
- [Codex Cloud](https://developers.openai.com/codex/cloud)
- [Cloud environments](https://developers.openai.com/codex/cloud/environments)
- [Noninteractive mode](https://developers.openai.com/codex/noninteractive)
- [Codex SDK](https://developers.openai.com/codex/sdk)
- [GitHub Action](https://developers.openai.com/codex/github-action)
- [GitHub integration](https://developers.openai.com/codex/integrations/github)
- [MCP](https://developers.openai.com/codex/mcp)
- [Agent improvement loop cookbook](https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop)

## 9. Cost Model

Each work item should store both estimate and actual.

Estimate inputs:

- model/provider;
- effort setting;
- risk tier;
- expected reviewer agents;
- expected test/release runs;
- historical averages;
- request frequency.

Actual inputs:

- model/provider;
- input/output/reasoning tokens when available;
- agent attempts;
- reviewer runs;
- CI runs;
- release runs;
- elapsed time;
- retries.

Display:

- estimated total cost;
- actual total cost;
- range/confidence;
- cost per requesting user;
- delta from estimate.

Cost is a product feature, not just an internal metric. Indie developers need
to know whether a feature request is economically reasonable before letting an
agent run.

## 10. Two-Router Architecture

The product should separate product-level work routing from lower-level model
routing.

### 10.1 Work Router

The work router is core product logic and should be owned by this product.

It decides:

- whether feedback should become work at all;
- whether a work item is ignored, blocked, waiting for signal, plan-only, or
  executable;
- risk tier;
- priority;
- cost cap;
- agent provider;
- model/effort tier;
- allowed files and forbidden files;
- required reviewer lanes;
- retry limits;
- auto-merge eligibility;
- user-facing follow-up status.

No external router or gateway should be allowed to define product policy. The
meaning of "safe to run", "too expensive", "requires approval", "not planned",
or "eligible for auto-merge" belongs to this product.

### 10.2 Model Gateway

The model gateway is lower-level infrastructure. It handles provider access and
model-call routing.

It may handle:

- OpenAI/Anthropic/Gemini/Bedrock/etc. provider access;
- OpenRouter as an optional provider aggregator for broad model access with one
  key;
- OpenRouter Fusion as an optional multi-model deliberation lane for research,
  critique, planning, and high-cost-of-being-wrong decisions;
- Requesty as an optional managed AI gateway for OpenAI-compatible routing,
  fallback policies, approved model lists, spend limits, EU routing, usage
  analytics, and cost governance;
- model fallbacks;
- rate limits;
- provider failover;
- virtual keys;
- low-level spend logs;
- request-level guardrails;
- caching;
- load balancing;
- latency and token observability.

The product should support direct provider execution first, OpenRouter and
Requesty as optional managed setup paths, then optional integration with
open-source gateways such as LiteLLM, Portkey Gateway, Helicone AI Gateway,
Envoy AI Gateway, or similar tools.

The gateway should be wrapped behind a narrow adapter interface so the product
does not become dependent on one gateway's internal behavior.

Example adapter:

```ts
interface ModelGateway {
  run(input: ModelRequest): Promise<ModelResult>;
  estimate(input: ModelEstimateRequest): Promise<ModelEstimate>;
  health(): Promise<ModelGatewayHealth>;
}
```

### 10.3 Forking Policy

The default approach should be wrap, pin, and test rather than fork.

Required practices:

- pin exact package or Docker image versions;
- use contract tests around gateway behavior;
- keep direct OpenAI/Anthropic/OpenRouter/Requesty/Codex/Claude execution as a
  fallback path;
- avoid letting gateway configuration become product policy;
- make "bring your own gateway" possible for advanced users;
- fork only after repeated friction proves that the gateway layer is a
  strategic bottleneck.

The product should own the work router. It should treat model gateways as
replaceable infrastructure.

### 10.4 Managed Gateway Partner Candidates

OpenRouter and Requesty should both be supported, but they should be framed
slightly differently.

OpenRouter is useful as a broad model-access aggregator with one key. It is a
good fit for experimentation, developer choice, and fast access to many hosted
models.

Requesty is useful as a managed AI gateway for production-ish routing and
governance. Its docs position it as an OpenAI-compatible gateway that can route
requests through one base URL, apply fallback policies, enforce approved model
lists, set per-key or project spend limits, route through EU endpoints, and
provide usage/cost analytics.

Because there is a founder relationship, Requesty could be a strong early
partner integration. The product should still implement Requesty through the
same narrow gateway adapter as every other provider, with contract tests and a
direct-provider fallback path.

Requesty-specific setup should support:

- Requesty API key;
- global or EU base URL;
- approved model list inspection;
- fallback policy selection;
- spend limit visibility;
- analytics/cost reconciliation;
- health checks for routing, model availability, and tool-calling support.

### 10.5 OpenRouter Fusion Deliberation Lane

OpenRouter Fusion should be supported as an optional multi-model deliberation
lane, not as the default implementation agent.

Fusion can be called through the OpenRouter `openrouter/fusion` model alias or
as the `openrouter:fusion` server tool. The useful product concept is a
temporary model council: several models analyze the same sanitized prompt in
parallel, a judge model compares their outputs, and the final answer is written
from the structured analysis.

The work router should decide when Fusion is allowed. Fusion should be reserved
for cases where the cost of a bad decision is higher than the extra model
spend.

Good Fusion use cases:

- ambiguous feedback triage;
- duplicate and cluster validation;
- product strategy decisions;
- "not planned" or "needs more signal" reasoning;
- architecture planning before implementation;
- privacy/security review;
- reviewer disagreement resolution;
- risky release or rollback analysis;
- market, legal, technical, or UX research that benefits from multiple
  perspectives.

Fusion should not be the default for:

- routine coding;
- small copy changes;
- simple bug fixes;
- high-volume low-risk triage;
- any prompt that would include raw private feedback.

Fusion configuration should support:

- disabled, budget, high-quality, and custom modes;
- per-category and per-risk-tier enablement;
- max estimated cost per Fusion call;
- max panel size;
- approved analysis models;
- approved judge models;
- max tool calls;
- forced invocation versus model-decided invocation;
- whether OpenRouter web search and web fetch tools are allowed;
- a requirement that only sanitized context can be sent.

Fusion cost tracking should be explicit. The cost model should treat Fusion as
multiple underlying model calls, not as one ordinary completion. Estimates
should include panel calls, judge calls, final response calls, expected latency,
and confidence range. Actuals should record model list, judge model, token use,
router metadata, latency, whether Fusion was invoked, and whether it changed
the work router decision.

Recommended default: Fusion is off for new installs, available as an opt-in
review or planning lane, and first exposed through a "Use multi-model review"
button in the control center.

OpenRouter Fusion references:

- [Fusion plugin docs](https://openrouter.ai/docs/guides/features/plugins/fusion)
- [Fusion Router docs](https://openrouter.ai/docs/guides/routing/routers/fusion-router)
- [Fusion announcement](https://openrouter.ai/blog/announcements/fusion-beats-frontier/)

## 11. Developer Guardrails and Cost Controls

Developers must be able to define how autonomous the system is allowed to be.
The default should be conservative, but the product should support teams that
want more automation after trust is earned.

Guardrails should be configurable at the repo, environment, category, and risk
tier level.

Examples:

- never touch authentication, billing, privacy, legal, encryption, or data
  deletion code without explicit approval;
- never open more than a set number of PRs per day;
- never auto-merge changes touching configured paths;
- require extra review for migrations, native mobile release code, infra,
  permissions, or customer-facing pricing;
- only work on issues with specific labels;
- only use sanitized issue text, not raw feedback;
- block tasks that mention secrets, credentials, private keys, PII, or unsafe
  product changes;
- cap agent attempts and retries per work item;
- pause the runner when CI failure rate crosses a threshold;
- pause auto-merge when rollback or production incident signals are active.

Cost controls should be explicit and visible before work starts.

Examples:

- maximum estimated cost per feature;
- maximum actual spend per day/week/month;
- maximum token budget per work item;
- maximum reviewer-agent count by risk tier;
- lower-cost model for triage, stronger model for implementation/review;
- require manual approval when estimated cost exceeds a threshold;
- stop or downgrade work when actual spend crosses the estimate by a configured
  percentage;
- prioritize repeated requests by cost per requesting user.

The control center should show whether a work item is blocked by policy, over
budget, waiting for approval, safe to run, or eligible for auto-merge.

Policy decisions should be stored and auditable. When work is blocked by a
custom guardrail or cost limit, the original user should receive a respectful
product-safe follow-up if the developer exposes feedback status.

## 12. Execution Cadence and Queues

Developers should control when feedback turns into agent work. Not every
incoming request should immediately wake up an implementation agent.

The product should support queue modes:

- `manual`: collect feedback; developer chooses what runs.
- `scheduled_batch`: run daily, weekly, monthly, or on a custom cron.
- `threshold_based`: run when a cluster reaches enough users, severity, impact,
  or confidence.
- `immediate_safe_lane`: allow tiny low-risk items to run as they arrive.
- `hybrid`: combine modes by category and risk tier.

Execution cadence helps with:

- cost control;
- avoiding noisy PR spam;
- batching similar feedback;
- giving demand time to accumulate;
- letting indie founders work in product cycles;
- preventing agents from thrashing on one-off requests.

Cadence should be configurable by category and risk tier.

Example:

```yaml
cadence:
  bug:
    safe_auto_merge: immediate
    guarded_auto_merge: daily
    extra_review: manual

  feature_request:
    safe_auto_merge: weekly
    guarded_auto_merge: weekly
    extra_review: manual

  ux_confusion:
    safe_auto_merge: daily
    guarded_auto_merge: weekly
```

The admin UI should make pending work visible by queue: immediate, next daily
batch, next weekly batch, waiting for threshold, and manual approval.

Cadence is part of the product operating rhythm. Coding agents are usually
task-triggered; this product should let developers run a calm, predictable
feedback-to-feature cycle.

## 13. Demand Thresholds and Backlog Promotion

The product should let developers define how many similar requests it takes to
create a backlog item, start planning, or allow implementation.

Thresholds should be relative to the size and shape of the user base, not only
raw request counts. Two similar requests can be meaningful in a 12-person beta
and meaningless in a 10,000-user SaaS unless severity is high.

Threshold inputs:

- raw request count;
- unique requesting users;
- percentage of active users;
- percentage of affected users when known;
- severity;
- paid user or revenue signal;
- strategic category;
- recency;
- confidence;
- estimated cost;
- risk tier.

Default threshold templates:

```yaml
demand_thresholds:
  tiny_beta:
    active_users: "1-50"
    backlog_candidate:
      min_unique_users: 2
    plan_candidate:
      min_unique_users: 3
      min_active_user_percent: 10
    implementation_candidate:
      min_unique_users: 3
      min_active_user_percent: 10

  small_app:
    active_users: "51-500"
    backlog_candidate:
      min_unique_users: 2
    plan_candidate:
      min_unique_users: 5
      min_active_user_percent: 3
    implementation_candidate:
      min_unique_users: 10
      min_active_user_percent: 5

  growing_app:
    active_users: "501-5000"
    backlog_candidate:
      min_unique_users: 5
    plan_candidate:
      min_unique_users: 15
      min_active_user_percent: 1
    implementation_candidate:
      min_unique_users: 30
      min_active_user_percent: 2

  larger_indie:
    active_users: "5000+"
    backlog_candidate:
      min_unique_users: 10
    plan_candidate:
      min_unique_users: 50
      min_active_user_percent: 0.5
    implementation_candidate:
      min_unique_users: 100
      min_active_user_percent: 1
```

Developers should be able to choose a preset:

- aggressive beta mode;
- balanced;
- conservative;
- custom.

The product can also compute a demand score:

```text
demand_score =
  unique_requesting_users
  + active_user_percentage
  + severity
  + paid_user_or_revenue_signal
  + strategic_category
  + recency
  - estimated_cost
  - risk
```

Promotion behavior:

- below threshold: store and cluster only;
- backlog threshold: visible backlog candidate;
- planning threshold: eligible for agent research/planning;
- implementation threshold: eligible for agent work if guardrails, cost caps,
  and cadence allow;
- severe bug, security, privacy, crash, or data-loss signal: bypass demand
  thresholds and route immediately, while still respecting risk gates.

The admin UI should show why an item is or is not promoted: "2 of 5 requests
needed", "3.2% of active users", "blocked by cost cap", or "bypassed threshold
because severity is critical."

## 14. Privacy and Safety Requirements

- Raw feedback stays in the product database.
- GitHub only receives sanitized summaries.
- Prompts sent to agents must be sanitized.
- Secrets, credentials, PII, screenshots, transcripts, and private support
  context must be redacted before GitHub or agent handoff.
- The system should store why something was not built.
- Privacy/safety-blocked items should not auto-reopen from demand alone.
- Generated PRs must be clearly labeled as agent-created.
- All destructive operations must be opt-in and scoped.

## 15. Operational, Security, and Governance Requirements

### 15.1 Runner Sandbox and Code Execution

The highest-risk surface is not the feedback API. It is letting agents clone
repos, install dependencies, run tests, and execute commands.

Agent runners must have a strict sandbox story:

- no broad secrets by default;
- isolated workspaces per run;
- ephemeral worktrees or containers where possible;
- controlled network egress;
- explicit allowlist/denylist for dangerous commands;
- no direct access to production databases by default;
- no direct writes to default branches;
- no deployment credentials unless the release step explicitly needs them;
- artifact and workspace cleanup;
- immutable run logs and audit events;
- clear display of what code and commands ran.

Repo code executed during installs/tests should be treated as untrusted. The
runner must assume package scripts, test setup, and local tooling can execute
arbitrary code.

### 15.2 Open-Source Governance

If the product is meant to spread through open source, the repository must
communicate trust from day one.

Launch governance should include:

- license;
- contribution guide;
- code of conduct;
- security disclosure policy;
- issue templates;
- PR templates;
- public roadmap;
- release notes;
- threat model;
- "safe agent patterns" philosophy;
- clear maintainer boundaries.

The project should avoid normalizing unsafe agent patterns, even when they make
demos look faster.

### 15.3 Admin Auth and Roles

The admin UI needs roles, even for small teams.

Suggested roles:

- owner: all settings, billing, secrets, and destructive controls;
- developer: work items, queues, PRs, agent runs, and approvals;
- reviewer: review gates and approval decisions;
- viewer: read-only dashboard access;
- billing/admin: cost, billing, and provider configuration;
- privacy/admin: raw feedback access and retention controls.

Permissions should control:

- who can change policies;
- who can enable real agent execution;
- who can approve agent runs;
- who can view raw feedback;
- who can view or rotate secrets;
- who can toggle the kill switch;
- who can delete or export data.

### 15.4 Data Retention and Deletion

Developers need control over how long raw feedback and derived data are kept.

The product should support:

- raw feedback retention windows;
- automatic raw payload purging;
- keeping aggregate demand counts after raw data deletion;
- user deletion requests;
- workspace deletion;
- export;
- backup and restore;
- audit-safe deletion records;
- retention policies by signal source.

Privacy-sensitive products should be able to purge raw feedback while keeping
sanitized clusters, demand counts, and product decision history.

### 15.5 Rollback and Failure Handling

The system needs a path for bad agent changes.

Required capabilities:

- failed-run classification;
- automatic pause when failure rates spike;
- rollback/incident state on work items;
- revert PR creation;
- release rollback tracking;
- user notification correction when needed;
- post-merge monitoring hook;
- incident pause mode;
- root-cause notes for agent failure.

The admin UI should make it obvious when an agent change merged but failed to
deploy, was rolled back, or needs human intervention.

### 15.6 Feature Flags and Gradual Rollout

The product should support staged rollout rather than assuming every merged
feature reaches every user immediately.

Potential integrations:

- feature flag providers;
- app-specific rollout APIs;
- beta cohorts;
- "ship to requesting users first";
- percentage rollout;
- kill switch per shipped feature;
- rollout metrics tied to usage tracking.

This is especially important when feature usage attribution is enabled. The
system should know who was exposed before judging whether a shipped feature was
used.

### 15.7 Product Strategy Override

Demand should inform product decisions, not blindly drive them.

Developers need strategy controls:

- founder bet;
- strategic priority;
- wrong customer segment;
- never build;
- defer until later;
- needs research;
- duplicate of broader initiative;
- blocked by business model;
- blocked by brand/product direction.

The system should let developers override demand-driven recommendations and
store the reason. Repeated future demand can still surface reconsideration
candidates unless the category is configured as non-reopenable.

### 15.8 Multi-Model Deliberation

The product should support optional multi-model deliberation for decisions that
benefit from more than one model perspective.

OpenRouter Fusion is the first concrete candidate for this lane. The work
router should be able to escalate a sanitized work item to Fusion when:

- confidence is low;
- risk is high;
- user demand is high but product fit is unclear;
- a reviewer agent disagrees with an implementation agent;
- a feature is expensive enough that better planning could prevent wasted work;
- a not-planned decision needs a stronger explanation.

Fusion output should be stored as advisory evidence, not as an automatic
decision. The work router remains responsible for final state transitions,
budget enforcement, user-facing status, and whether an agent run starts.

### 15.9 Agent Quality Evaluation

The product should evaluate agent quality over time.

Reports should include:

- PR acceptance rate;
- PR merge rate;
- rollback rate;
- review findings per PR;
- failed checks;
- repeated retries;
- cost per merged PR;
- time to PR;
- time to accepted PR;
- model/provider performance by category;
- which agent/model/effort combinations perform best;
- failure patterns by repo and task type.

This should feed the work router so low-risk tasks can use cheaper models while
risky tasks receive stronger models and stricter review.

### 15.10 Integration Surface and Webhooks

V1 should expose outbound webhooks, even if native integrations come later.

Webhook events:

- feedback received;
- cluster promoted;
- work item planned;
- issue created;
- agent run started/completed/failed;
- PR opened/merged/closed;
- deployment detected;
- feature exposed/used;
- user notified;
- work blocked by policy;
- threshold reached;
- spend threshold reached.

Webhooks let indie developers connect Slack, Discord, Linear, Jira, PostHog,
Sentry, email, or their own scripts without waiting for native integrations.

### 15.11 Config Versioning and Upgrades

Self-hosted users need safe upgrades.

Required:

- versioned config schema;
- migration commands;
- backup before migration;
- deprecated setting detection;
- doctor checks;
- policy validation;
- rollback guidance;
- changelog with breaking changes;
- compatibility checks for agents, gateways, and database migrations.

Upgrades must not silently weaken security policies, broaden agent access, or
turn on real execution.

## 16. Open-Source Launch Strategy

The open-source repo should be useful without the hosted product.

Launch package:

- one-command local setup;
- sample app;
- sample GitHub repo flow;
- local control center;
- Codex-based runner;
- GitHub token setup;
- Postgres Docker compose;
- demo feedback items;
- security disclosure policy and threat model;
- README with a short video/GIF.

The viral demo:

1. Run the sample app.
2. Submit feedback as a beta user.
3. Watch it appear in the control center.
4. See it become a GitHub issue.
5. Watch the agent open a PR.
6. Merge/deploy.
7. See the user-facing status change to shipped.

The story should be simple:

> Your beta users do not just file feedback. They start a safe, observable
> feature-creation loop.

## 17. Installation and Admin UI

Installation has to be stupid easy without becoming a security nightmare.
OpenClaw-style virality proves that developers will try magical agent tools,
but the product should avoid hard installation, unclear privileges, and unsafe
defaults.

The product should optimize for:

- two-minute demo value;
- clear upgrade path from demo to production;
- strict security defaults;
- easy maintenance;
- obvious visibility into what agents can access and do.

### 17.1 Installation Paths

#### Demo Mode

Demo mode should require no real GitHub mutations, no production secrets, and
no model spend.

Example target flow:

```bash
npx create-feedback-factory
cd my-feedback-factory
pnpm demo
```

It should launch:

- sample app;
- local control center;
- local API;
- fake or seeded feedback;
- simulated agent run;
- simulated PR lifecycle;
- user-facing status updates.

This is the viral path. A developer should understand the product loop in a few
minutes before connecting real infrastructure.

#### Indie Self-Hosted Mode

Self-hosted mode should work on common indie-friendly infrastructure.

Targets:

- Docker Compose;
- Railway template;
- Render/Fly/DigitalOcean/VPS deployment;
- optional GitHub Actions runner for implementation work.

It should include:

- API service;
- worker service;
- database;
- queue if needed;
- control center;
- optional model gateway adapter;
- setup wizard for GitHub and model/provider credentials.

The happy path should be: copy environment variables, run one command, open the
admin UI, and complete a setup checklist.

#### Local Device Testing Mode

Developers should be able to run the product locally in Docker and test it from
real devices before deploying it.

Docker Compose should be able to run:

- feedback API;
- worker;
- database;
- queue if needed;
- control center UI;
- optional model gateway.

Supported local exposure modes:

- `localhost`: safest default for browser-only demo;
- `lan`: test from another device on the same Wi-Fi network;
- `tailscale`: private testing from a phone, laptop, or remote device on the
  developer's tailnet;
- `tunnel`: temporary public testing through tools such as ngrok or Cloudflare
  Tunnel;
- `production`: hosted domain with proper TLS and production secrets.

Example local-device path:

```text
iPhone beta app -> Tailscale URL -> local Docker feedback API -> local DB
```

Security defaults:

- local Docker binds to `127.0.0.1` by default;
- LAN, Tailscale, and tunnel exposure require explicit enabling;
- the admin UI clearly shows when the instance is reachable beyond localhost;
- temporary tunnel URLs should be treated as development-only;
- production mode should require a real domain, TLS, backups, and production
  secrets.

#### Production Mode

Production mode adds stricter controls and operational tooling.

Required:

- GitHub App rather than broad personal access token as the preferred path;
- narrow repository permissions;
- separate runner secrets;
- database backups;
- migrations;
- health checks;
- audit logs;
- policy-as-code;
- global pause/kill switch;
- upgrade and rollback guidance.

### 17.2 Admin UI Onboarding

The admin UI should be wizard-driven.

Setup steps:

1. Connect GitHub repo.
2. Choose install mode: dry-run, PR-only, guarded auto-merge.
3. Add model provider, OpenRouter key, Requesty key, or model gateway.
4. Set cost caps.
5. Pick guardrail template: web app, iOS app, SaaS app, or open-source
   library.
6. Choose execution cadence: manual, immediate safe lane, daily batch, weekly
   batch, threshold-based, or hybrid.
7. Choose demand threshold preset: aggressive beta, balanced, conservative, or
   custom.
8. Install SDK snippet.
9. Submit test feedback.
10. Watch a dry-run issue/PR simulation.
11. Explicitly enable real agent execution.

The default path should start in dry-run. Real GitHub mutations and real model
spend should require explicit enabling.

### 17.3 Admin UI Control Surfaces

The admin UI should always answer:

- What is connected?
- What can agents access?
- What did agents do?
- What did it cost?
- What is blocked and why?
- What is queued and when will it run?
- What is below threshold and how close is it?
- What needs approval?
- What reached users?
- What were users told?
- What is paused or unhealthy?

Core admin views:

- setup checklist;
- overview;
- feedback inbox;
- demand and backlog;
- queues;
- work items;
- agent runs;
- cost center;
- releases;
- policies;
- integrations health;
- OpenRouter provider health when configured;
- Requesty gateway health when configured;
- Codex capability health;
- user follow-up tracker;
- audit log;
- reports;
- maintenance/doctor page.

The admin UI should be the mission control and audit room for the product. A
developer should be able to understand the whole system without reading server
logs.

#### Overview

The overview should show:

- current feedback volume;
- queued work;
- backlog candidates;
- active agent runs;
- open PRs;
- blocked items;
- spend today/week/month;
- shipped items this week;
- shipped-feature usage and adoption;
- unhealthy integrations.

#### Provider And Gateway Health

Provider and gateway health views should show:

- configured direct providers;
- configured managed gateways;
- active base URL or endpoint region;
- API key status;
- approved or allowed model list;
- fallback and routing policy status;
- OpenRouter Fusion availability and selected default preset when configured;
- spend limit status;
- tool-calling support by selected model;
- recent provider errors, timeouts, and fallbacks.

When Requesty is configured, the view should make the selected Requesty base
URL, approved models, fallback policy, spend caps, EU routing mode, and recent
analytics sync state visible without requiring the developer to open the
Requesty dashboard for basic diagnosis.

#### Feedback Inbox

The feedback inbox should show:

- raw/private feedback access, gated by permissions;
- sanitized summary;
- source app/version/user segment;
- severity;
- category;
- cluster assignment;
- user-facing status;
- whether the user was notified.

#### Demand and Backlog

The demand/backlog view should show:

- clusters by request count;
- unique requesting users;
- percentage of active users;
- threshold progress;
- backlog candidates;
- reconsideration candidates;
- demand trend over time;
- estimated impact;
- post-ship usage impact where available;
- users or segments whose requests tend to produce highly used features.

#### Queues

The queue view should show:

- immediate queue;
- daily/weekly/monthly batch queues;
- threshold queue;
- manual approval queue;
- blocked-by-policy queue;
- next scheduled run;
- why each item is queued or held.

#### Work Items

The work item view should show:

- status machine state;
- GitHub issue/PR;
- assigned agent/router decision;
- risk tier;
- guardrails applied;
- cost estimate;
- actual cost;
- post-ship feature usage;
- cost per activated user;
- timeline.

#### Agent Runs

The agent run view should show every agent invocation:

- provider/model/effort;
- prompt version or sanitized prompt reference;
- sanitized input reference;
- tools used;
- files changed;
- checks run;
- result;
- tokens/cost;
- duration;
- retry count;
- failure reason.

Raw prompts and raw private feedback should not be exposed by default.

#### Cost Center

The cost center should show:

- cost per feature;
- cost by model/provider;
- cost by gateway or direct provider path;
- cost by deliberation lane, including OpenRouter Fusion panel and judge costs;
- cost by stage: triage, planning, build, review, release;
- estimate vs actual;
- cost per requesting user;
- daily/weekly/monthly budget;
- projected monthly spend;
- prevented spend from guardrails.

When Requesty is configured, the cost center should reconcile internal run
costs with Requesty usage analytics where possible, including request count,
tokens, cache savings, fallback behavior, and spend by model or routing policy.

When OpenRouter Fusion is configured, the cost center should show the panel
models, judge model, estimated versus actual Fusion cost, latency, invocation
reason, and whether the fused result changed a triage, planning, review, or
release decision.

#### Releases

The release view should show:

- what merged;
- what deployed;
- what reached users;
- TestFlight/App Store/web deployment state when available;
- release failures;
- rollback state;
- users notified;
- feature exposure and usage after release.

#### Feature Impact

The feature impact view should show:

- shipped features linked to original feedback clusters;
- requesting users;
- exposed users;
- activated users;
- repeat users;
- usage count;
- request-to-usage conversion;
- cost per activated user;
- user segments that predicted broader usage;
- shipped features with low adoption;
- high-usage features that should influence future prioritization.

This should be an internal developer view, not a public user leaderboard.

#### Policies

The policy view should show and edit:

- guardrails;
- cost caps;
- cadence;
- thresholds;
- protected paths;
- roles and permissions;
- retention settings;
- rollout settings;
- auto-merge rules;
- model/router rules;
- approval rules.

#### Audit Log

The audit log should record every meaningful system event:

- feedback received;
- feedback sanitized;
- feedback clustered;
- decision made;
- issue created;
- agent started/stopped;
- policy blocked;
- PR opened/merged/closed;
- deploy detected;
- user notified;
- settings changed;
- credentials changed;
- retention/deletion action;
- role or permission changed;
- kill switch toggled.

Audit entries should be append-only and filterable by work item, user, agent
run, policy, integration, and time range.

#### Reports

Reports should be simple enough for indie developers to use weekly:

- what users asked for this week;
- what shipped because of feedback;
- what the system said no to;
- what agents cost;
- which shipped feedback produced real usage;
- which users or segments suggested high-impact features;
- what is waiting on the developer;
- what is becoming popular;
- where agents are failing;
- which requests are closest to threshold.
- which agent/model combinations are performing best.

The admin UI should show the whole causal chain:

```text
user asked -> system decided -> agent worked -> PR shipped -> user notified
-> cost recorded
```

### 17.4 Security Defaults

Default behavior must be conservative:

- dry-run by default;
- no direct commits to `main`;
- no auto-merge until enabled;
- GitHub App preferred over broad personal access token;
- raw feedback never sent to GitHub by default;
- raw feedback never sent to agent prompts by default;
- secrets and PII redacted from prompts/logs;
- auth, billing, privacy, legal, data deletion, encryption, infra,
  permissions, and production-release code are review-only or blocked by
  default;
- agent work happens in isolated temporary workspaces;
- all generated branches and PRs are clearly labeled;
- global pause button;
- per-run and monthly budget caps;
- full audit log for policy decisions and agent actions.

### 17.5 Maintenance Commands

The CLI should make maintenance boring.

Target commands:

```bash
feedback-factory doctor
feedback-factory upgrade
feedback-factory migrate
feedback-factory backup
feedback-factory verify-security
feedback-factory validate-config
feedback-factory demo
```

The product should prefer boring, explicit maintenance over hidden magic.

## 18. Hosted Product Strategy

The hosted product can monetize convenience, reliability, and trust.

Potential paid features:

- hosted control plane;
- hosted runners;
- GitHub App installation;
- managed secrets;
- managed guardrail and budget policy templates;
- team roles;
- managed backups and retention policies;
- webhook delivery logs;
- feature flag/rollout integrations;
- higher run concurrency;
- release tracking integrations;
- advanced cost analytics;
- agent quality analytics;
- Slack/Discord/email notifications;
- custom domains/status pages;
- priority support.

The open-source product should remain credible and useful. The hosted product
should win on setup, reliability, observability, and scale.

## 19. MVP Requirements

### Must Have

- Web SDK feedback submission.
- API with feedback, work item, run, and cost tables.
- Control center showing queue, status, PRs, cost, and decisions.
- Wizard-driven setup and strict dry-run default.
- Triage and dedupe.
- Sanitized GitHub issue creation.
- Owned work router for risk, budget, agent, and merge decisions.
- Configurable execution cadence and queue modes.
- Demand thresholds for backlog, planning, and implementation promotion.
- Local or GitHub Actions runner that can run Codex noninteractively.
- Developer-configurable guardrails and cost caps.
- Strict runner sandbox and command/network controls.
- Basic admin roles.
- Audit log.
- PR creation.
- Basic reviewer gate.
- Estimated and actual cost capture.
- User-safe status endpoint.
- Optional feature usage tracking and feedback-impact attribution.
- Demo app and seed scenario.
- Maintenance/doctor command.
- Versioned config and migration path.

### Should Have

- iOS SDK/example.
- Error capture.
- Release/deploy tracking.
- Feature exposure/usage/outcome tracking.
- Data retention controls.
- Rollback/revert workflow.
- Outbound webhooks.
- Reconsideration thresholds for repeated requests.
- Configurable risk policy.
- Guardrail templates for common repo types.
- Per-category cadence templates.
- User-base-size threshold presets.
- Optional model gateway adapter.
- OpenRouter provider support.
- OpenRouter Fusion deliberation lane support.
- Requesty gateway/provider support.
- MCP tool surface for agent-safe access to work items.
- Codex capability health panel.
- GitHub App install path.
- Feature flag/rollout hooks.
- Agent quality reporting.
- OpenTelemetry or similar trace export.

### Could Have

- Linear sync.
- Jira sync.
- Slack notifications.
- Hosted runner.
- Agent provider marketplace.
- Public changelog widget.
- Feedback voting board.

## 20. Detailed Requirements Draft

This section is intentionally rough and expansive. It captures the requirement
universe before the official product brainstorm and cleanup pass.

### 20.1 Product Requirements

These requirements define the experience and value, independent of
implementation details.

Beta users need a simple way to submit feedback from inside the app. This could
be a feedback button, bug report, feature request form, or automatic error
capture. It should feel lightweight, not like filing a support ticket.

Developers need a control center where they can see what users are asking for,
how often it has come up, what the system decided, whether an agent is working
on it, what PR exists, what it cost, and whether it shipped.

Every request needs a status. The important thing is that nothing disappears. A
request can be shipped, already available, planned, waiting for more signal,
blocked, out of scope, not reproducible, or not planned.

The system must be able to say no. A good product system does not build
everything users ask for. It should store the reason and tell the user in a
respectful, product-safe way.

Repeated similar requests should matter. If one user asks for something and it
is not planned, that may be fine. If many users ask for the same thing, the
system should surface it as a reconsideration candidate.

Developers need configurable guardrails and cost controls. They should be able
to decide which paths, categories, risk levels, models, budgets, and merge
behaviors are allowed.

Developers need configurable execution cadence. They should be able to collect
feedback continuously but choose whether agents run manually, immediately for
small safe work, on a daily/weekly/monthly batch, or when enough users request
the same thing.

Developers need demand thresholds that scale with their user base. The product
should distinguish between one-off feedback, backlog-worthy demand,
planning-worthy demand, and implementation-worthy demand.

Developers need to know which requests created product value after shipping.
The system should connect shipped work back to feature exposure, usage,
activation, repeat use, and cost per activated user when the SDK integration
supports it.

Developers need strategic override controls so demand does not blindly drive
the roadmap. They should be able to mark items as founder bets, strategic
priorities, wrong segment, never build, defer, needs research, or blocked by
product direction.

The open-source version must be useful by itself. It cannot feel like fake open
source where the real value is locked behind hosting. The hosted version should
win on convenience, reliability, and scale.

### 20.2 Workflow Requirements

These requirements define the end-to-end pipeline.

The system ingests feedback from the SDK, API, errors, or manual developer
entry.

It sanitizes feedback before anything leaves the private database. Raw user
text may include private details, secrets, screenshots, emotional context, or
personal information. GitHub and agents should receive only safe summaries.

It classifies each request by category, priority, risk, and likely action. For
example: bug, feature request, UX confusion, performance issue, privacy
concern, or support issue.

It deduplicates similar requests into clusters. This is how the system knows
whether something is a one-off or emerging demand.

It evaluates each cluster against demand thresholds relative to the active user
base, affected user base, severity, paid-user signal, estimated cost, and risk.

It decides the next action: ignore, wait for more signal, block, create an
issue, plan only, or implement.

It assigns executable work to the correct queue based on developer cadence
settings, risk tier, category, demand threshold, and budget policy.

If the request is safe and actionable, it creates a sanitized GitHub issue with
labels, priority, risk tier, and enough context for an agent.

A planner turns that issue into a PR-sized plan. Broad requests need to be
split before implementation.

An implementation agent runs in an isolated workspace. It should create a
branch, edit code, run checks, and never directly touch `main`.

The system opens a PR, links it back to the issue and work item, and records
actual cost.

Reviewer agents and CI checks decide whether the PR can merge, needs changes,
or must be blocked.

After merge, release tracking watches whether the change actually reached
users. For web this may be deployment status; for iOS this may be TestFlight or
App Store status.

After release, optional SDK events track feature exposure, usage, and outcomes
so the system can attribute shipped feature impact back to feedback clusters
and requesting users or segments.

For staged rollouts, the system should know who was exposed before judging
feature usage or notifying users that something reached them.

Finally, the system updates the original user-facing status: shipped, already
available, not planned, blocked, needs more signal, or another safe outcome.

### 20.3 Technical Requirements

These requirements define the components needed to build the product.

A web SDK should come first because it is easiest for indie developers to
adopt. It should support feedback submission, error capture, and status reads.

An iOS SDK or example should follow because the story is especially strong for
beta mobile apps.

An API server owns ingestion, auth, sanitization, status reads, control center
data, and webhooks.

The database needs tables for feedback signals, sanitized summaries, clusters,
work items, decisions, agent runs, cost estimates, actual cost, policies,
GitHub links, release status, feature usage events, impact attribution, and
notifications.

The control center is the developer UI. It shows the queue, clusters, statuses,
PRs, agents, costs, guardrails, blocked items, and reconsideration candidates.

The queue system should support immediate jobs, scheduled batches, threshold
queues, manual approval queues, and per-category cadence rules.

The promotion system should support user-base-size presets and custom
thresholds for backlog, planning, and implementation eligibility.

The GitHub integration should create issues, apply labels, comment status, open
PRs, read checks, close resolved issues, and clean up generated branches.

The agent runner should be abstract. Codex can be first, but the platform
should eventually support other agents.

A Codex runner should use noninteractive runs, structured output, usage
capture, and review mode where possible.

The work router should be owned by this product. It decides risk, budget,
agent, model tier, review lanes, merge policy, and whether work runs at all.

The model gateway should be optional and replaceable. It can use direct
providers, managed gateways such as OpenRouter or Requesty, or open-source
tools for provider routing, fallbacks, rate limits, and low-level spend logs,
but product policy should remain in the work router.

A policy engine enforces guardrails: allowed files, forbidden files, risk
tiers, cost caps, model limits, auto-merge settings, and approval rules.

A cost system estimates before work starts and records actual spend after
completion.

A queue and worker system runs triage, planning, implementation, review,
release tracking, notification, cleanup, and reconciliation.

Runner infrastructure must isolate code execution, restrict secrets, control
network egress, clean up artifacts, and log commands/actions.

The product should expose outbound webhooks for major lifecycle events.

Configuration should be versioned, validated, migratable, and safe to upgrade.

The local demo setup needs to be excellent: one command, sample app, sample
feedback, GitHub flow, control center, and visible PR.

The admin UI should be wizard-driven, start in dry-run, and make security,
permissions, cost caps, connected repos, agent access, blocked work, and
maintenance health obvious.

The hosted version later needs multi-tenant auth, billing, hosted workers, team
roles, managed secrets, managed backups, and webhook delivery monitoring.

### 20.4 Trust, Safety, and Control Requirements

These requirements make people willing to run the product on their repos.

Raw feedback must stay private by default. The system can store it internally,
but GitHub issues, PRs, CI logs, and agent prompts should receive sanitized
context only.

Feature usage tracking must be optional, configurable, and privacy-safe. It
should avoid raw session recordings or sensitive behavior capture by default.

Secrets and PII must be redacted. This includes tokens, API keys, credentials,
emails, phone numbers, private user details, screenshots, transcripts, and
sensitive support context.

Agents must never commit directly to `main`. They work through branches and
PRs.

Repo code run by agents should be treated as untrusted. Package install scripts,
test setup, and project tooling can execute arbitrary code and must be
sandboxed accordingly.

Certain categories should be blocked or review-only by default: auth, billing,
privacy, legal, data deletion, encryption, infrastructure, permissions, and
production release logic.

Cost caps must be enforced before and during work. If a feature is estimated
above budget, it waits. If actual cost exceeds the configured limit, the system
stops or escalates.

There needs to be an audit trail for every decision: why it was built, blocked,
not planned, merged, reopened, or reconsidered.

Admin auth and roles are required so raw feedback, secrets, policy changes,
approvals, deletion, billing, and kill-switch access are not all controlled by
one undifferentiated admin permission.

Data retention and deletion are required so developers can purge raw feedback,
delete users/workspaces, and keep aggregate demand history where appropriate.

The developer needs a kill switch. One control should pause agent execution
while still allowing feedback intake.

Dry-run mode is required. Indie developers should be able to see what would
happen before letting agents touch code.

Cadence controls are required. Developers should be able to pause immediate
execution, batch work, or require manual approval without turning off feedback
intake.

Demand thresholds are required. Developers should be able to prevent one-off
requests from becoming agent work while still letting severe bugs and
high-severity safety/security issues bypass normal demand thresholds.

Production setup should prefer GitHub Apps and narrow permissions over broad
personal access tokens.

The system needs cleanup and reconciliation. Branches, worktrees, labels, stuck
work items, failed runs, and stale PR states should not pile up forever.

Rollback and failure handling are required. Bad agent changes should be
classifiable, revertable, reportable, and able to trigger incident pause mode.

The user-facing follow-up must be safe and respectful. It should not expose
internal GitHub links, raw agent reasoning, other users' requests, or private
operational details.

The concise requirement:

> The product is not just an agent that makes PRs. It is intake, judgment,
> control, cost, implementation, release, rollout, learning, and follow-up.

## 21. Success Metrics

Open-source launch:

- stars;
- installs;
- completed demos;
- time to first local demo;
- time to first safe dry-run;
- successful local demos;
- Discord/GitHub discussion activity;
- external demo videos/posts;
- number of repos with the GitHub integration installed.

Product value:

- feedback-to-issue conversion rate;
- issue-to-PR conversion rate;
- PR merge rate;
- average queue wait time by cadence mode;
- average time from feedback to PR;
- average time from feedback to shipped;
- percentage of users receiving follow-up;
- estimated vs actual cost accuracy;
- reopened/reconsidered requests from repeated demand;
- backlog promotion rate by threshold template;
- implementation promotion rate by threshold template;
- request-to-usage conversion;
- cost per activated user;
- shipped-feature adoption by feedback cluster;

Trust:

- blocked unsafe handoffs;
- redaction success rate;
- failed/rolled-back agent PRs;
- rollback/revert rate;
- review findings per agent PR;
- cost cap violations;
- sandbox/policy violations blocked;
- webhook delivery success rate;
- config migration success rate;
- agent PR acceptance rate by model/provider;
- agent failure rate by category;
- work items blocked by developer policy;
- estimated spend prevented by policy;
- manual intervention rate.

## 22. Competitive Landscape

### Coding agents

GitHub Copilot coding agent, Codex, OpenHands, Devin, Factory Droid, Claude
Code, and similar systems can work from tasks or issues and produce code.

They are not primarily feedback intake, product-decision, cost-accounting, or
user-follow-up systems.

### Feedback tools

Canny, Featurebase, Productboard, Linear Customer Requests, and similar tools
capture and organize user feedback.

They are not primarily agent implementation systems.

### Error tools

Sentry Seer and similar systems can use production error data to review or fix
bugs.

They are not primarily product-request systems.

### Differentiation

This product owns the whole loop between user request and shipped outcome,
with an open-source wedge and GitHub-native developer workflow.

## 23. Open Questions

- What is the product name?
- Should V1 support only Codex, or a pluggable agent interface from day one?
- Should SQLite be part of V1 for dead-simple local setup?
- Should hosted runners exist at launch, or wait until OSS demand is proven?
- Which OSS model gateway should be the default optional adapter, if any?
- Should OpenRouter be a first-class setup option in V1 or a documented
  provider adapter?
- Should OpenRouter Fusion ship as a visible planning/review button in V1 or
  remain an advanced policy option?
- What default Fusion presets should ship for budget, high-quality, and custom
  review lanes?
- Should Requesty be a first-class setup option in V1, especially as a possible
  early partner integration?
- Which install path should be the launch default: Docker Compose, Railway
  template, GitHub Actions, or all three?
- What sandbox model is strict enough for local and hosted agent execution?
- What admin roles should ship in V1?
- What raw feedback retention default should ship in V1?
- Which feature flag/rollout providers should be first-class integrations?
- Which outbound webhook events should ship in V1?
- What execution cadence should be the default for new installs?
- Which demand threshold preset should be the default for new installs?
- What is the default cost cap for indie developers?
- What guardrail templates should ship by default for web apps, iOS apps,
  open-source libraries, and SaaS products?
- What is the minimum useful iOS SDK?
- Should user notifications be owned by the product or exposed as webhook-only
  in V1?

## 24. First Demo Script

The demo should use a tiny real app, not a mock dashboard.

Scenario:

1. A beta user says: "Please add dark mode to the settings screen."
2. The control center receives and clusters the request.
3. The system estimates cost and marks it safe.
4. A sanitized GitHub issue is created.
5. The agent opens a PR adding dark mode.
6. Tests pass.
7. The PR merges.
8. The demo app deploys.
9. The user sees: "Shipped: dark mode is now available in settings."

The demo must also show a negative path:

1. A user asks for something unsafe or out of scope.
2. No GitHub issue is created.
3. The request is stored as a decision category.
4. The user sees a respectful reason.
5. Repeated similar requests can trigger reconsideration if the category allows
   it.

## 25. Product Principle

The product should feel like a trustworthy product operator, not an overeager
agent.

It should be fast, but not reckless. It should be autonomous, but explainable.
It should make users feel heard and developers feel in control.
