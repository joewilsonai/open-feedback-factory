# Open Feedback Factory — Product Requirements Document

**Product:** Open Feedback Factory
**Working category:** Open-source feedback-to-feature infrastructure
**Audience:** Indie developers and small product teams
**Status:** Internal dogfood v0.1
**Distribution thesis:** Private dogfood first; open-source launch later

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

V1 is for private internal use and testing. The repo and product should be built
as if they will become open source, but publishing the repo, package, hosted
service, or launch materials is a later explicit decision after the dogfood loop
works with real GitHub, real Codex runs, real costs, and real follow-up.

## 2. Positioning

The product is not another coding agent and not another feedback board.

It should also not be positioned as "a tool that turns requests into
agent-built PRs." That is now the obvious middle of the category. Products such
as Lightsprint can already let an internal product team create a task, run cloud
agents, generate a preview, and open a pull request. That validates the market,
but it also means agent-created PRs alone are not a differentiated wedge.

It is the connective tissue between:

- customer feedback tools like Canny, Featurebase, Productboard, and Linear
  Customer Requests;
- coding agents like Codex, GitHub Copilot coding agent, OpenHands, Devin,
  Factory Droid, Claude Code, and similar tools;
- GitHub-native engineering workflows: issues, branches, PRs, reviews, checks,
  releases, and changelogs.

The wedge:

> The open-source feedback-to-feature loop: collect real user requests, validate
> demand, create guarded agent work, track cost, prove release, and tell users
> what shipped or why it did not.

Sharper launch wedge:

> Autonomous feature shipping for indie apps: user feedback in, guarded agent
> work out, shipped status back to users.

The launch story should emphasize that the product starts from real users
inside the app, not from an internal product manager typing a task into a coding
workspace.

Recommended launch framing:

> Let your users drive the roadmap, and let agents do the first implementation
> pass under your rules.

Avoid launch copy that sounds like a generic agentic product-team workspace:

- "PMs can build features without engineers."
- "Turn any idea into a PR."
- "Cloud agents for product teams."
- "A coding-agent dashboard for your repo."

Those phrases point at the broader AI-native product-platform category. Open
Feedback Factory should own the narrower, more visceral system around user
demand: in-app SDK, feedback clustering, thresholds, sanitization, decision
memory, cost ledger, guardrails, release proof, and user follow-up.

The indie developer emotional frame:

> You are one person or a tiny team. Your users are already telling you what to
> build. Open Feedback Factory lets the safe, high-signal requests move toward
> implementation automatically while you keep the rules, budget, and release
> gates.

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
- Be designed for open-source, self-hostable distribution from day one, while
  keeping V1 private until the internal dogfood loop is proven.
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
- No public launch, package publishing, hosted-product signup, or external
  promotion until the private dogfood loop is complete and explicitly approved.

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

Implementation or merge is not the same as shipped. V1 should require an
explicit release marker before user-facing status becomes shipped, and it should
refuse release markers for work that has not reached an implemented state.

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

The SDK should also provide a default embeddable suggestion launcher for web
apps. Indie developers should not have to design the feedback entry point from
scratch. The default should be a small floating button that opens the suggestion
UI, but the product should not hard-code a plus sign as the identity. The
launcher label, icon, placement, copy, source, metadata, and suggested prompts
should be configurable.

V1 web SDK launcher API:

```ts
mountFeedbackLauncher({
  client,
  title,
  description,
  buttonLabel,
  buttonIcon,
  position,
  source,
  metadata,
  suggestions,
  onSubmitted,
});
```

Launcher requirements:

- appear as a persistent floating affordance on the app UI;
- open a lightweight suggestion/report form;
- support preset suggestions without auto-submitting them;
- submit through the same privacy-safe SDK feedback endpoint;
- attach safe app metadata such as route, surface, app version, and feature
  context;
- expose a submitted callback so the host app can show status or lifecycle
  progress;
- be dismissible and keyboard-accessible;
- avoid collecting screenshots, raw session data, transcripts, secrets, or
  large private payloads by default;
- be visually customizable enough that indie apps can make it feel native.

The SDK must support privacy-safe metadata and avoid sending secrets, full
session recordings, raw screenshots, or large transcripts by default.

Feature usage tracking should be optional and privacy-safe. It should let the
system connect shipped feedback to real adoption without becoming a surveillance
tool.

V1 should support release-linked attribution: when an operator marks a work item
shipped, they can attach the app's stable `featureId`. Later SDK
`trackFeatureUsage` calls for that feature id should be attributed back to the
work item, feedback cluster, and requester count in the evidence ledger.

### 8.2 API and Database

Stores:

- raw private feedback;
- sanitized summaries;
- feedback clusters;
- work items;
- decisions and decision reasons;
- GitHub issue and PR links;
- agent runs;
- agent assumptions and unresolved questions;
- estimated and actual cost;
- feature exposure, usage, and outcome events;
- feedback-to-feature impact attribution;
- developer-defined guardrail and cost-control policies;
- release/deploy state;
- user notification history.

V1 should use workspace-scoped records from the start, even while the private
dogfood install has a single default workspace. Postgres tables should include a
workspace identifier, row-level-security scaffolding, and tests that verify the
policies exist. Hosted multi-tenant enforcement can mature later, but the schema
must not need a privacy rewrite before launch.

The API should apply separate rate-limit groups for SDK intake/status/usage,
admin writes, runner claim/complete, and GitHub webhook/setup paths. Rate-limit
responses must be explicit, user-safe, and observable; they should never
silently drop feedback or pretend work was queued.

For private dogfood V1, admin and runner routes should support simple shared
token gates before a full multi-user auth system exists:

- `ADMIN_TOKEN` protects `/admin/*` and control-center mutations when set;
- `RUNNER_TOKEN` protects `/runner/*` job claim and completion routes when set;
- `/doctor` may expose whether those gates are required, but must never expose
  token values;
- local-only development may leave the tokens blank, but any public tunnel or
  shared dogfood URL should require both tokens;
- helper scripts that expose `/admin` or `/runner` routes should refuse to start
  public tunnels while those tokens are missing.

Postgres is the only V1 database. SQLite is intentionally deferred until after
the private dogfood loop works, because supporting two persistence paths would
increase migration, test, and support complexity before the core product is
proven.

### 8.3 Control Center

A web dashboard for developers.

Primary views:

- incoming feedback;
- clusters and demand count;
- work item status;
- realtime feature lifecycle view;
- agent lanes;
- estimated vs actual cost;
- PR/release state;
- feature usage and impact attribution;
- decisions not to build;
- guardrail and cost-control configuration;
- latest actual cost and token evidence after runner completion;
- reconciliation actions for stale in-progress work and missing release proof;
- reconsideration candidates;
- user follow-up status;
- worker attachment/install guidance for host CLI workers and Docker API-key
  workers.

The control center should make the loop easy to demo without exposing private
feedback.

#### Realtime Feature Lifecycle View

The control center should include a visual lifecycle view for each feature or
feedback cluster. This should not be a static kanban board. It should be a live,
evidence-backed map of what is happening now, what already happened, and what is
waiting on a human, agent, system, or external integration.

The view should show the full feature path:

```text
feedback received -> clustered -> threshold/decision -> sanitized work item
-> cost estimate -> agent queued -> planning -> implementation -> checks
-> PR opened -> review -> merge -> release proof -> user notified
-> usage measured
```

Every stage should show one of a small set of visible states:

- waiting;
- active;
- passed;
- blocked;
- failed;
- skipped by policy;
- needs human decision;
- not planned;
- shipped.

Each lifecycle node should be clickable and open the exact log/evidence behind
that state:

- feedback count and representative sanitized summaries;
- decision reason and demand threshold;
- policy and guardrail result;
- estimated cost and remaining cap;
- agent claim time, worker identity, model/provider, and run id;
- files inspected, commands run, checks run, skipped checks, and test output;
- assumptions and unresolved questions;
- GitHub issue, branch, PR, changed files, diff size, and check status;
- reviewer decision and merge gate result;
- release/deploy proof;
- user-safe notification text and delivery status;
- feature usage attribution after release.

The lifecycle view should update in near real time from append-only audit
events. If websocket/SSE infrastructure is unavailable in V1, polling is
acceptable, but the product behavior should still feel live: new logs appear,
nodes change state, blockers become visible, and retries/reviews/release proof
show immediately after the backend records them.

Design requirements:

- show progress visually as a horizontal or vertical pipeline depending on
  viewport;
- show one compact summary row/card for the feature and an expandable detail
  panel for logs;
- keep raw private feedback hidden by default;
- never show optimistic "done" states without corresponding evidence;
- make the next action obvious, such as approve, retry, split, mark not
  planned, resolve assumption, request review, or record release proof;
- preserve a readable chronological log alongside the visual map so developers
  can debug failures without guessing.

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

Webhook handling must be idempotent. Duplicate GitHub deliveries with the same
delivery id should be acknowledged but must not create duplicate artifacts,
agent runs, costs, release markers, or user notifications. GitHub artifact
storage should also be idempotent by work item, artifact type, and URL.

V1 should use a GitHub App for installable GitHub integration, narrow
permissions, webhook delivery, and auditable merge behavior. `GITHUB_MODE=gh`
can remain an internal dogfood fallback for local testing, but the product
should not teach broad personal access tokens as the normal install path.

### 8.5 Agent Runner

The runner performs implementation work in an isolated workspace.

Supported V1 runner modes:

- local runner;
- GitHub Actions runner;
- optional hosted runner later.

The runner interface should be designed so more agents can be added later, but
Codex is the only built-in V1 runner. V1 should optimize for Codex because Codex
already supports noninteractive runs, cloud tasks, GitHub issue/PR workflows,
review, MCP, image input, structured output, and usage capture. Other agents and
gateways are adapter work after the dogfood loop is stable.

Required runner behavior:

- create a branch or worktree;
- read only sanitized context;
- check the configured guardrail and cost policy before starting;
- run an implementation agent;
- run configured tests/checks;
- collect token and cost data when available;
- record assumptions the agent made, defaults it selected, alternatives it
  skipped, and questions that still need human/product confirmation;
- return structured fields for outcome, changed files, assumptions, checks run,
  skipped checks, cost summary, and user-safe follow-up;
- open a PR;
- never merge unless gates allow it;
- clean up temporary workspace state.

V1 should include an operator-triggered reconciliation pass that requeues stale
in-progress work and reports implemented items still waiting for release proof.
This is not a full production scheduler yet; it is the minimum honest recovery
lane for local dogfood and demos.

V1 must productize worker attachment rather than relying on one-off local
machine setup. The supported install lanes are:

- host Codex CLI worker for local subscription auth, installed through a
  generated macOS LaunchAgent or Linux user systemd service;
- Docker API-key worker for installs that save a server-side OpenAI API key in
  the control center and keep the worker inside Docker;
- manual one-item worker command for targeted review, retries, and demos.

Docker workers must install and use their own Codex CLI inside the container
when `CODEX_RUNNER_MODE=codex`; they must not inherit host-only paths such as
`/opt/homebrew/bin/codex`. Expose separate `DOCKER_CODEX_CLI` and
`CODEX_CLI_VERSION` settings for the container lane. Docker workers should leave
work queued in `cli` auth mode because host subscription auth is not available
inside the container; use the host worker for `cli` auth or the Docker worker
with `api_key` auth.

The generated host service should source the ignored `.env` file at startup and
set only worker-specific defaults such as `CODEX_RUNNER_MODE=codex`,
`WORKER_RUN_ONCE=false`, `WORKER_API_BASE_URL`, `RUNNER_WORKSPACE`, and
`CODEX_SECRETS_PATH`. It must not copy API keys, GitHub App private keys, or
tokens into generated service files. It should also translate the Docker-only
`WORKER_API_BASE_URL=http://api:4100` default to the host-reachable
`http://localhost:4100` when generating local host worker services.

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

Merge modes must be explicit product settings, not implied by whether an agent
can open a PR:

- `implement_only`: builder agents create a branch and PR, then stop;
- `agent_reviewed_auto_merge`: builder agents create a PR, separate reviewer
  agents evaluate it, CI passes, the policy engine verifies guardrails, and the
  system can merge without a human when every required gate passes;
- `human_exception_required`: the work is blocked from auto-merge and routed to
  a human only because a policy, reviewer, CI, release, cost, or risk gate
  failed or requires explicit approval.

The desired default for real indie repos is not "a person reviews every PR."
The default should be "agents do the routine implementation and review work;
humans handle exceptions." The PR remains the audit artifact and rollback point,
but human review is a policy outcome, not the universal bottleneck.

Approval to run and approval to merge are separate controls. `auto` approval
allows an attached worker to claim eligible queued work. It does not mean the PR
can merge. Auto-merge requires separate reviewer agents, passing checks,
guardrail evaluation, provenance checks, and cost/release policy compliance.
Reviewer approval must be persisted as a work-item review decision before it can
unlock any merge path. A transient API request flag or UI assumption is not
enough evidence for auto-merge.
Branch provenance, changed files, diff size, check status, and cost evidence
must come from stored runner output or live GitHub PR data, not caller-supplied
request fields.

Agent-reviewed auto-merge requires at minimum:

- a separate reviewer agent from the builder agent;
- passing GitHub checks;
- no protected-path violations;
- cost within configured cap;
- diff size within configured cap;
- no privacy/security redaction warnings that require escalation;
- no reviewer-agent disagreement;
- branch and PR provenance tied to the work item;
- generated runner branch cleanup after a guarded merge;
- release/deploy health checks when configured.

The evidence ledger must show the latest reviewer decision, reviewer identity,
review type, summary, timestamp, and whether the decision was approving or
rejecting. A later rejection overrides an earlier approval until another valid
approval is recorded.

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

Codex is the only built-in V1 implementation runner. The product should keep an
adapter boundary so other agents can be added later, but V1 should not claim
provider-agnostic implementation before the Codex dogfood loop works.

As of the June 2026 research pass, useful Codex surfaces include:

- Codex Cloud and GitHub issue/PR delegation for sanitized GitHub issues;
- Codex Cloud environments for disposable containerized work;
- noninteractive `codex exec --json` for local/self-hosted runners, lifecycle
  events, usage capture, and actual cost accounting;
- `codex exec --json` should support both local CLI subscription auth and a
  server-side API-key mode where the saved OpenAI API key is injected only into
  the worker process;
- `--output-schema` for stable final run summaries such as outcome, PR URL,
  shipped status, cost summary, assumptions, skipped checks, and user-safe
  follow-up copy;
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

V1 should persist the core merge guardrails in policy config: policy-level
auto-merge allowance, max safe diff lines, and protected path fragments. These
settings should be visible in `/doctor`, editable in the control center, and
used by the auto-merge evaluator. The environment-level `AUTO_MERGE_ENABLED`
switch remains a hard kill switch above the live policy.
The evaluator should use recorded runner/GitHub evidence for branch provenance,
changed files, diff size, checks, and cost instead of trusting a request-body
shortcut.

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

Agent assumptions should be first-class audit data, not buried in logs. Every
planner, builder, reviewer, and release agent should emit:

- assumptions made from incomplete product context;
- defaults chosen from configuration;
- alternatives considered and skipped;
- files or surfaces intentionally left untouched;
- tests or checks that could not be run;
- follow-up questions for a human operator;
- confidence level and reason.

These assumptions should appear on the work item detail screen, be attached to
the run record, and be summarized in the PR body or PR comment when safe. If an
assumption affects product behavior, privacy, cost, release, or merge safety, it
should prevent auto-merge until a reviewer lane or human operator resolves it.

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

Even if the first private dogfood is single-tenant, the database model should be
designed with workspace/tenant boundaries from the start. Tables that contain
feedback, users, work items, runs, costs, GitHub artifacts, release events,
notifications, feature usage, policy config, secrets metadata, and audit events
should carry a workspace or installation scope. When Postgres row-level security
is enabled for a deployed multi-workspace mode, tests must prove cross-workspace
reads and writes are denied.

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

### 15.12 Testing and Verification Requirements

V1 needs tests for the product loop, not only package-level code coverage. The
test suite should prove that the system stays honest when integrations are
missing, when agents fail, when costs are unavailable, and when a request should
not be built.

Required test tiers:

- unit tests for sanitization, clustering, routing, status generation, demand
  thresholds, cost estimation, auto-merge gates, and assumption-record blocking;
- security tests for workspace/tenant isolation, Postgres row-level security
  policies when enabled, admin RBAC, raw-feedback permissions, secret storage,
  webhook verification, prompt injection, SSRF/tunnel URL rejection, and
  GitHub App permission boundaries;
- Postgres RLS tests must use a non-owner app role and prove direct SQL
  cross-workspace reads and writes are denied, not only inspect policy metadata;
- abuse and hardening tests for path traversal, command injection, branch-name
  injection, SQL injection, admin CSRF/CORS, rate limiting, webhook replay,
  idempotency, package-script sandboxing, token-scope minimization, audit-log
  tamper resistance, retention/delete behavior, and secret leakage into
  artifacts;
- API contract tests for SDK feedback submission, status reads, feature usage,
  control-center snapshots, runner claims, release markers, admin config, and
  GitHub webhooks;
- Postgres integration tests for migrations, store methods, audit records,
  agent assumptions, cost records, GitHub artifacts, release events, and feature
  usage attribution, including RLS policy enforcement in a security test schema;
- runner tests for disabled mode, manual approval, auto approval, Codex CLI
  command construction, API-key auth, sanitized prompts, structured output,
  usage parsing, cost calculation, and skipped-check/assumption capture;
- GitHub integration tests for App manifest generation, webhook reachability,
  signature verification, sanitized issue bodies, PR artifact storage, branch
  cleanup, and guarded merge refusal;
- control-center tests for setup states, queue states, human-readable labels,
  raw enum hiding, assumption visibility, cost display, user follow-up, and
  blocked/missing-configuration explanations;
- SDK/demo-app tests for real feedback submission, user-safe status polling,
  feature usage events, and negative outcomes;
- dry-run end-to-end tests that prove the local demo never shows fake PRs, fake
  costs, fake releases, fake shipped states, or fake agent runs;
- private dogfood end-to-end tests that use real GitHub/Codex configuration to
  create a real issue, real branch, real PR, real usage record, real cost or
  token-only actual, real assumption record, and real release marker;
- reconciliation tests for interrupted runs, stale workspaces, stale branches,
  failed agent runs, failed checks, missing release proof, and rollback pause.

Required high-value regressions:

- raw feedback never appears in GitHub issue bodies, PR bodies, prompts,
  browser-visible status, logs intended for GitHub, or user follow-up;
- a user, API key, worker, or admin scoped to one workspace cannot read or mutate
  another workspace's feedback, work items, costs, GitHub artifacts, release
  events, notifications, feature usage, policy config, or audit trail;
- Postgres RLS policies deny cross-workspace access when enabled, including
  direct SQL attempts that bypass application helpers;
- users without raw-feedback permission can see sanitized summaries and status
  only, not raw payloads or private metadata;
- non-owner roles cannot rotate secrets, enable auto-merge, change protected
  paths, change cost caps upward, toggle the kill switch, or weaken policy;
- GitHub webhook requests without a valid signature are rejected and do not write
  artifacts;
- GitHub App tokens are installation-scoped and the product refuses to mutate
  repos outside the configured installation/repo;
- prompt-injection text inside feedback is treated as user content and cannot
  cause the runner to request raw feedback, expose secrets, change policy, or
  bypass guardrails;
- localhost, private-network, metadata-service, and malformed webhook/tunnel URLs
  are rejected for public GitHub webhook setup unless explicitly in local-only
  development mode;
- secrets saved through the control center are stored outside git, masked in
  responses, never returned to the browser, and never copied into GitHub
  artifacts or agent prompts;
- user-controlled strings cannot escape file/path boundaries, create unsafe
  branch names, inject shell arguments, inject SQL, or alter generated YAML,
  Markdown, PR bodies, issue bodies, or config files in unsafe ways;
- generated branch names, commit messages, issue titles, labels, PR titles, and
  file paths are normalized and length-limited before use in git, GitHub, shell,
  or filesystem operations;
- admin mutation endpoints require valid admin auth, reject cross-origin writes
  unless explicitly configured, and are protected from CSRF in browser-based
  deployments;
- feedback, status, feature-usage, and admin endpoints have rate limits or abuse
  controls appropriate for their exposure mode;
- public SDK feedback intake, status polling, and feature-usage endpoints have
  separate per-user, per-device/session, per-IP, per-app/workspace, and burst
  limits;
- admin write endpoints, policy changes, cost-cap changes, secret operations,
  runner actions, and release-marker operations have stricter rate limits and
  audit events for throttled attempts;
- runner job claim/complete endpoints have per-worker, per-workspace, and
  concurrency limits so a broken worker cannot claim the queue or create runaway
  retries;
- GitHub webhook endpoints have replay/idempotency protection plus rate limits
  by delivery id, installation, repo, and source IP/header trust where available;
- model/agent execution has spend and attempt limits separate from HTTP rate
  limits: per work item, per day, per month, per workspace, and per runner;
- rate-limit responses are user-safe and observable. They should not silently
  drop feedback; they should queue, defer, or return a clear retry/status path
  depending on endpoint type;
- webhook delivery is idempotent and replay-resistant enough that duplicate
  GitHub events cannot create duplicate runs, duplicate costs, duplicate release
  markers, or duplicate notifications;
- package install/test scripts from target repos are treated as untrusted code
  and cannot access Open Feedback Factory secrets, raw feedback, production
  databases, or broader network access than the sandbox allows;
- access tokens and GitHub App installation tokens are scoped to the minimum
  required permissions and are not logged, cached longer than necessary, or
  reused across workspaces/installations;
- audit events for policy changes, secret changes, runner claims, merge
  decisions, release markers, and user notifications are append-only from the
  application perspective and tamper-evident enough for dogfood debugging;
- raw-feedback retention and deletion tests prove raw payloads are purged while
  sanitized aggregates, demand counts, and audit-safe deletion records remain;
- disabled runner queues work without creating runs, costs, commits, PRs, or
  shipped states;
- auto approval lets an attached worker claim eligible work, but never bypasses
  review/check/policy/provenance/cost/release merge gates;
- merged work remains waiting for release until a release marker or deployment
  detector proves availability;
- missing cost rates show real token usage and low-confidence dollar estimates,
  not invented actual spend;
- unresolved assumptions affecting privacy, cost, merge safety, or release
  status block auto-merge;
- not-planned, unsafe, duplicate, already-available, and below-threshold
  outcomes produce respectful user-safe explanations and decision categories.

Minimum verification before a dogfood release:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm run doctor
git diff --check
```

With Docker Postgres running:

```bash
TEST_DATABASE_URL=postgres://off:off@127.0.0.1:55432/open_feedback_factory pnpm --filter @open-feedback-factory/db test
docker compose up --build
```

The control center should surface test and verification state: last test run,
last doctor run, required checks for auto-merge, failed checks, skipped checks,
and whether a work item is blocked because verification is incomplete.

## 16. Private Dogfood and Open-Source Launch Strategy

V1 is a private dogfood build. It should be engineered with open-source
distribution in mind, but the repo should not be promoted publicly until the
internal loop has been proven against real feedback, real Codex runs, real PRs,
real cost records, and honest shipped/not-shipped outcomes.

The eventual open-source repo should be useful without the hosted product.

Private dogfood package:

- Docker Compose local setup;
- Daybook sample app;
- local control center;
- local API;
- Postgres Docker Compose;
- Codex-based runner;
- GitHub App setup path, with `gh` fallback only for internal dogfood;
- clear dry-run mode;
- real dogfood mode with GitHub/Codex connected;
- doctor command;
- security notes and no-fake-demo rules.

Eventual open-source launch package:

- one-command local setup;
- sample app;
- sample GitHub repo flow;
- local control center;
- Codex-based runner;
- GitHub App setup;
- Postgres Docker compose;
- clearly labeled sample feedback items;
- security disclosure policy and threat model;
- README with a short video/GIF.

The private dogfood demo:

1. Run the sample app.
2. Submit feedback as a beta user.
3. Watch it appear in the control center.
4. See it become a GitHub issue.
5. Watch the agent open a PR.
6. Watch reviewer/check/policy gates decide whether it can merge.
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

#### Dry-Run Demo Mode

Dry-run demo mode should require no real GitHub mutations, no production
secrets, and no model spend. It exists to show the shape of the loop without
pretending work happened.

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
- clearly seeded sample feedback, labeled as sample input;
- sample reset command that removes seed/test rows without touching real app
  submissions;
- live workers leave sample-only seed work queued so dry-run data does not burn
  real agent runs;
- queued or blocked agent lane unless a real runner is configured;
- no fake PR URLs, fake costs, fake agent runs, fake releases, or fake shipped
  state;
- user-facing status updates.

This is the trust-building path. A developer should understand the product loop
in a few minutes before connecting real infrastructure, without pretending that
agent work, PRs, release proof, or costs happened.

#### Private Dogfood Demo Mode

Private dogfood demo mode is the real internal test. It connects GitHub, Codex,
and cost capture, then runs the Daybook sample app through the same path a
customer app would use.

It should require:

- a configured GitHub App, or explicit internal `gh` fallback;
- a real target repo and clean branch;
- Codex CLI subscription auth or server-side API-key auth;
- explicit approval mode;
- explicit merge mode;
- configured cost rates or a clearly labeled token-only actual;
- release marker or deployment detector.

Private dogfood mode must create real GitHub artifacts and record real run
results. If any dependency is missing, the UI should say queued, blocked, or
waiting for configuration. It must never substitute seeded data for real PRs,
costs, releases, or shipped outcomes.

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
2. Choose install mode: dry-run demo, implement-only PR mode,
   agent-reviewed auto-merge, or human-exception-required.
3. Add Codex auth mode: local CLI subscription or server-side API key.
4. Attach a worker: host Codex CLI service, Docker API-key worker, or manual
   one-item command.
5. Set cost caps.
6. Pick guardrail template: web app, iOS app, SaaS app, or open-source
   library.
7. Choose execution cadence: manual, immediate safe lane, daily batch, weekly
   batch, threshold-based, or hybrid.
8. Choose demand threshold preset: aggressive beta, balanced, conservative, or
   custom.
9. Install SDK snippet.
10. Submit test feedback.
11. Watch it queue, block, or run against real configured integrations.
12. Explicitly enable real agent execution.
13. Optionally configure OpenRouter, Requesty, or Fusion adapters after the
    direct Codex path works.

The default path should start disabled and honest. Real GitHub mutations and
real model spend should require explicit enabling.

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
- API key status, masked fingerprint, storage source, and whether the key is
  held in environment variables or local secret storage;
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
- no auto-merge until explicitly enabled;
- when auto-merge is enabled, it still requires CI, reviewer-agent approval,
  policy gates, provenance checks, and configured release-health gates;
- human review is required for exceptions, protected categories, failed gates,
  reviewer disagreement, high-cost runs, large diffs, and configured approval
  categories, not for every routine safe PR;
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

### 17.5 V1 Dogfood Defaults

New installs should start with conservative defaults that still let our private
dogfood run be real once explicitly enabled.

V1 defaults:

- product name: Open Feedback Factory;
- visibility: private internal dogfood;
- database: Postgres only;
- admin access: local-open by default, `ADMIN_TOKEN` required before tunnels or
  shared URLs;
- runner access: local-open by default, `RUNNER_TOKEN` required before tunnels
  or shared URLs;
- install path: Docker Compose;
- GitHub path: GitHub App required, with `gh` fallback for internal dogfood;
- built-in runner: Codex only;
- Codex auth: local CLI subscription first, API-key mode optional;
- runner mode: disabled until explicitly attached;
- host worker installer: macOS LaunchAgent or Linux user systemd service;
- Docker worker lane: API-key mode after the key is saved server-side;
- approval mode: manual by default;
- merge mode: implement-only by default;
- auto-merge: off until explicitly enabled and still limited to
  `safe_auto_merge`;
- default cadence: manual, with immediate safe lane available only after the
  operator enables real execution;
- default threshold preset: balanced;
- default work-item cap: `$5` estimated cost;
- default daily cap: `$25`;
- default monthly cap: `$100`;
- raw feedback retention: 30 days by default, with sanitized summaries, demand
  counts, decisions, audit logs, and cost records retained longer;
- guardrail templates: web app and open-source library in V1; iOS and SaaS
  templates after the web path works;
- release proof: explicit release marker in V1, deployment integrations later;
- outbound notifications: user-safe status endpoint in V1, outbound webhooks as
  integration surface, native email/Slack/Discord later.

### 17.6 Maintenance Commands

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
- GitHub App install path and webhook receiver, with `gh` fallback only for
  internal dogfood.
- Owned work router for risk, budget, agent, and merge decisions.
- Configurable execution cadence and queue modes.
- Demand thresholds for backlog, planning, and implementation promotion.
- Local or GitHub Actions runner that can run Codex noninteractively.
- Developer-configurable guardrails and cost caps.
- Strict runner sandbox and command/network controls.
- Basic admin roles.
- Audit log.
- PR creation.
- Agent reviewer gate.
- Durable review-decision ledger that safe auto-merge reads instead of trusting
  a one-off request flag.
- Durable merge-evidence path that reads stored runner output and live GitHub PR
  data instead of trusting caller-supplied branch, diff, check, or cost fields.
- Policy-governed merge modes: implement-only, agent-reviewed auto-merge, and
  human-exception-required.
- Estimated and actual cost capture.
- Minimal release marker so merged work is not called shipped until release is
  explicitly proven.
- User-safe status endpoint for shipped, planned, already available, not
  planned, blocked, unsafe, needs more signal, and waiting-for-release states.
- Feature usage tracking and feedback-impact attribution.
- Real Daybook demo app and seed scenario with no fake PRs, fake costs, fake
  releases, or fake shipped states.
- Sample seed/reset path that keeps dry-run installs honest and prevents
  integration-test rows from polluting the control center.
- Maintenance/doctor command.
- Versioned config and migration path.

### Should Have

- iOS SDK/example.
- Error capture.
- Deployment-provider tracking beyond the V1 release marker.
- Advanced feature exposure/usage/outcome reporting.
- Data retention controls.
- Rollback/revert workflow.
- Outbound webhooks.
- Reconsideration thresholds for repeated requests.
- Configurable risk policy.
- Guardrail templates for common repo types.
- Per-category cadence templates.
- User-base-size threshold presets.
- Optional model gateway adapter.
- OpenRouter provider adapter.
- OpenRouter Fusion deliberation adapter.
- Requesty gateway/provider adapter.
- MCP tool surface for agent-safe access to work items.
- Codex capability health panel.
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
GitHub links, release status, agent assumptions, unresolved questions, feature
usage events, impact attribution, and notifications.

The control center is the developer UI. It shows the queue, clusters, statuses,
PRs, agents, costs, guardrails, blocked items, and reconsideration candidates.
Each work item should expose an evidence ledger with agent runs, cost records,
assumption records, GitHub artifacts, release markers, user notifications, and
audit events so an operator can prove whether a feature was merely queued,
implemented, waiting for release, shipped, blocked, or rejected.

The queue system should support immediate jobs, scheduled batches, threshold
queues, manual approval queues, and per-category cadence rules.

The promotion system should support user-base-size presets and custom
thresholds for backlog, planning, and implementation eligibility.
V1 should at minimum use stored cluster signal counts during routing so a
below-threshold request can become a guarded work item when another matching
request arrives. This demand memory should also show in the control center.

The GitHub integration should create issues, apply labels, comment status, open
PRs, read checks, close resolved issues, and clean up generated branches.

Codex should be the only built-in V1 runner. The runner boundary should still be
designed as an adapter interface so the platform can support other agents later
without moving product policy out of the work router.

A Codex runner should use noninteractive runs, structured output, usage
capture, assumption records, and review mode where possible.

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

The setup UI must make worker attachment explicit. Auto approval allows a live
worker to claim queued work, but does not itself create a worker. The UI and
docs must show the exact command or deployment path for manual one-item workers,
host CLI auto-polling workers, and Docker API-key workers, including
`CODEX_RUNNER_MODE`, `CODEX_AUTH_MODE`, `CODEX_SECRETS_PATH`, `CODEX_CLI` for
host workers, `DOCKER_CODEX_CLI` and `CODEX_CLI_VERSION` for Docker workers,
GitHub PR settings, model, effort, timeout, and workspace. The host install
helper should generate macOS LaunchAgent and Linux user systemd files, provide
status and uninstall commands, write logs under `.off/logs`, and avoid
embedding secrets directly in generated service files.

Admin and beta-user surfaces must not leak raw internal enum names. Labels such
as `planned`, `safe_auto_merge`, `guarded_review`, and `not_planned` should be
rendered as human-readable product states such as "Queued", "Low-risk auto
lane", "Needs review", and "Not planned". Raw enum values can remain in APIs
and audit logs, but not as the primary visible control-center language.

The hosted version later needs multi-tenant auth, billing, hosted workers, team
roles, managed secrets, managed backups, and webhook delivery monitoring.

### 20.4 Trust, Safety, and Control Requirements

These requirements make people willing to run the product on their repos.

Raw feedback must stay private by default. The system can store it internally,
but GitHub issues, PRs, CI logs, and agent prompts should receive sanitized
context only.

Feature usage tracking must be optional, configurable, and privacy-safe. It
should avoid raw session recordings or sensitive behavior capture by default.
The default attribution contract should use stable feature ids and aggregate
event/user counts, not raw session replay, raw text, screenshots, or sensitive
behavior streams.

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
The V1 control center should let an operator change the max feature cost cap
without editing environment files, and runner/admin execution must read that
live policy before spending model time.

There needs to be an audit trail for every decision: why it was built, blocked,
not planned, merged, reopened, or reconsidered.

The evidence ledger should be the operator-facing version of that audit trail.
It must avoid raw feedback leakage while still showing sanitized summaries,
agent run results, estimate-vs-actual cost, unresolved assumptions, persisted
review decisions, release proof, and user-safe follow-up status.

When an operator decides not to build something, the system should provide an
explicit decision action. That action must update the work item, notify matching
requesters with a user-safe explanation, store the decision category, and add an
audit event. Rejected work should never disappear as an unspoken queue change.

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

### AI-native product-team platforms

Lightsprint and similar platforms are close enough to treat as category
validation and competitive pressure. A Lightsprint-style workflow lets an
internal team member connect a repository, create a product task, run cloud
agents, produce a preview deployment, and open a pull request for review.

That overlaps with the middle of this product's loop: task -> agent -> branch
-> PR -> preview. Open Feedback Factory should not compete primarily on that
middle step. The differentiated surface is what happens before and after the
agent run:

- real in-app user feedback as the source of demand;
- deduping, clustering, demand thresholds, and decision memory;
- privacy sanitization before GitHub, agents, logs, or PRs see user context;
- configurable cost controls and actual-cost capture;
- required assumptions, guardrails, reviewer evidence, and merge policy;
- release proof that distinguishes "implemented" from "shipped";
- user-facing outcomes for shipped, already available, not planned, needs more
  signal, blocked, or unsafe requests;
- open-source, self-hostable control-plane infrastructure for indie teams.

The strategic conclusion: agent-built PRs are becoming table stakes. The product
must sell and demonstrate the managed user-feedback-to-shipping loop.

Useful product patterns to adapt, without copying the positioning:

- **Connect existing repository first.** The install path should make "connect
  my real repo" the obvious path, with repo discovery, branch/PR base settings,
  and clear GitHub App status. Templates can exist, but the magic is acting on
  a repo the developer already ships.
- **Provider connection clarity.** Agent setup should show Codex CLI, Codex API
  key, future OpenRouter/Requesty, and other providers as explicit connection
  cards with health, scopes, missing secrets, and whether each lane can run
  locally, in Docker, or remotely.
- **Live run logs.** Every agent attempt needs a readable timeline: planning,
  files inspected, commands run, tests, blocked reasons, assumptions, cost, PR,
  review, release marker, and user notification. Logs should be honest enough
  that a failed sandbox or missing credential is understandable in seconds.
- **Task lifecycle UI.** Work items should have visible stages such as queued,
  planning, building, checking, PR opened, awaiting review, merged, awaiting
  release proof, shipped, blocked, not planned, and needs more signal.
- **Review hub.** Operators need one place to inspect the diff, checks,
  assumptions, cost, policy gates, reviewer decisions, protected paths, and
  user impact before approving merge or release.
- **Health page.** The product should continuously report repo connection,
  GitHub webhook health, worker health, provider auth, queue age, failure rate,
  cost caps, and release-proof gaps.
- **Bug report with logs and UI state.** The control center and SDK should be
  able to submit bug/error reports with safe diagnostics attached, so the same
  feedback-to-feature loop can handle product bugs without screenshots or raw
  private data leaking into GitHub.
- **In-product cost and credits visibility.** Indie developers need predictable
  spend. Billing may be later, but V1 should make budget, estimated cost,
  actual cost, remaining cap, and prevented spend visible.
- **Agent follow-up affordances.** After an agent run, the product should make
  the next useful actions obvious: explain assumptions, retry with narrower
  scope, split into subtasks, ask for reviewer pass, mark not planned, or
  request release proof.

Patterns to avoid copying:

- making the PM/designer task workspace the center of the product;
- competing on general cloud-agent execution alone;
- generic "build anything from a prompt" launch copy;
- hiding failed provisioning, missing repo attachment, or missing credentials
  behind optimistic statuses.

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

## 23. V1 Decisions and Deferred Questions

### Resolved V1 Decisions

- Product name: Open Feedback Factory.
- Current phase: private internal dogfood, not public open-source launch.
- Positioning: do not lead with generic "agent-built PRs"; lead with the
  open-source managed loop that turns real user demand into guarded agent work,
  cost/release evidence, and user follow-up.
- Launch wedge: indie-dev autonomous shipping with guardrails. The product
  should make safe user-requested features auto-creatable without becoming a
  generic PM/designer task workspace.
- Public launch: deferred until the real dogfood loop proves feedback intake,
  GitHub issue creation, Codex implementation, PR creation, gate evaluation,
  cost capture, release marker, and user follow-up.
- Built-in runner: Codex only.
- Runner extensibility: keep an adapter interface, but do not claim broad agent
  support in V1.
- Database: Postgres only.
- Install default: Docker Compose.
- GitHub integration: GitHub App as the installable path; `gh` fallback only for
  internal dogfood.
- Hosted runners: deferred.
- Model/gateway default: direct Codex/OpenAI first.
- Codex auth modes: local CLI subscription and server-side API key.
- OpenRouter: documented optional adapter, not a launch blocker.
- Requesty: documented optional adapter and possible early partner path, not a
  launch blocker.
- OpenRouter Fusion: optional policy/deliberation lane, off by default, not the
  primary coding path.
- Sandbox model: local isolated workspace/container plus strict policy checks in
  V1; hosted disposable workers later.
- Admin roles: owner, developer/operator, reviewer, viewer, billing/admin, and
  privacy/admin.
- Raw feedback retention default: 30 days.
- Status ownership: the product owns the user-safe status endpoint and
  notification records in V1.
- Release proof: explicit release marker in V1; deployment-provider
  integrations later.
- Execution cadence default: manual.
- Demand threshold default: balanced.
- Cost defaults: `$5` per work item, `$25` per day, `$100` per month.
- Guardrail templates: web app and open-source library in V1; iOS and SaaS
  templates later.
- Mobile SDK: deferred; web SDK ships first.
- Feature flag providers: generic release marker/webhook hooks first, native
  provider integrations later.

### Deferred Post-V1 Questions

- When to publish the repo publicly.
- Whether the first hosted product should use managed runners or only managed
  control-plane hosting.
- Which provider adapter should become first-class first: OpenRouter, Requesty,
  or another gateway.
- Whether Fusion deserves a visible control-center action or should remain a
  policy-only escalation.
- Which Fusion presets should ship for budget, high-quality, and custom review
  lanes.
- When to add mobile SDKs.
- When to add Linear, Jira, Slack, Discord, and email integrations.
- Whether to add a public roadmap, changelog widget, or voting board.

## 24. First Demo Script

The demo should use a tiny real app, not a mock dashboard.

The first demo has two modes:

- dry-run demo: local education mode with seeded/sample data clearly labeled,
  no GitHub mutation, no model spend, no fake PR/cost/release claims, and a
  reset path for sample/test rows;
- private dogfood demo: real internal mode with GitHub and Codex connected,
  real PRs, real run results, real cost records, and release/user status updates
  only when proven.

Scenario:

1. A beta user says: "Please add note search so I can find older notes."
2. The control center receives and clusters the request.
3. The system estimates cost and marks it safe.
4. A sanitized GitHub issue is created.
5. The agent opens a PR adding note search.
6. Tests pass.
7. Reviewer, check, policy, cost, and provenance gates pass.
8. The PR merges only if the configured merge mode allows it.
9. A release marker or deployment detector proves the change is available.
10. The user sees: "Shipped: note search is now available."

The demo must also show a negative path:

1. A user asks for something unsafe or out of scope.
2. No GitHub issue is created.
3. The request is stored as a decision category.
4. The user sees a respectful reason.
5. Repeated similar requests can trigger reconsideration if the category allows
   it.

If the runner is disabled, the demo should say queued. If GitHub is missing, it
should say waiting for GitHub configuration. If Codex auth is missing, it should
say waiting for runner configuration. If cost rates are missing, it should show
real token usage and a low-confidence dollar estimate rather than invented
actual spend.

## 25. Product Principle

The product should feel like a trustworthy product operator, not an overeager
agent.

It should be fast, but not reckless. It should be autonomous, but explainable.
It should make users feel heard and developers feel in control.
