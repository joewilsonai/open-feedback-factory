# V1 Dogfood Build Checklist

This checklist is the build handoff for the first private Open Feedback Factory
dogfood version. The goal is not a public launch. The goal is a real internal
feedback-to-feature loop that we can use, inspect, trust, and improve.

## Target Outcome

A beta user in the Daybook demo app submits a real feature request. Open Feedback
Factory stores the raw feedback privately, creates a sanitized work item, routes
it through policy, creates a GitHub issue, runs Codex, opens a PR, records
estimated and actual cost, gates merge, records release proof, updates the
user-facing status, and tracks whether the shipped feature gets used.

The system must also handle a negative request: unsafe, out-of-scope, duplicate,
not planned, or below threshold. It should store the decision category, explain
the outcome to the user, and keep repeated requests available for
reconsideration when allowed.

## Non-Negotiable Rules

- No fake PR URLs, fake agent runs, fake costs, fake releases, or fake shipped
  states.
- Raw feedback stays private. GitHub, agents, PR bodies, and user-facing
  messages receive sanitized summaries only.
- GitHub App is the V1 install path. `gh` is an internal dogfood fallback only.
- Codex is the only built-in V1 runner.
- Postgres is the only V1 database.
- Dry-run mode is honest local education, not simulated success.
- Auto approval means an attached worker can claim eligible queued work. It does
  not mean auto-merge.
- Auto-merge requires separate review/check/policy/provenance/cost/release gates.
- Every agent run records assumptions and unresolved questions.
- Any assumption affecting privacy, cost, merge safety, or release status blocks
  auto-merge until resolved.

## Required Modes

### Dry-Run Demo

Use this to understand the product loop without live mutation.

Required behavior:

- runs locally through Docker Compose;
- shows Daybook, API, worker, Postgres, and control center;
- uses clearly labeled seeded/sample feedback;
- shows queued or blocked states when integrations are missing;
- never reports real PRs, costs, releases, shipped states, or agent runs unless
  they happened.

### Private Dogfood Demo

Use this for the real internal test.

Required behavior:

- GitHub App configured, or explicit `GITHUB_MODE=gh` internal fallback;
- `ADMIN_TOKEN` and `RUNNER_TOKEN` configured before using any tunnel or shared
  network URL;
- Codex configured through local CLI subscription or server-side API key;
- worker attached with `CODEX_RUNNER_MODE=codex`;
- approval mode selected in the control center;
- cost rates configured, or token-only actuals shown honestly;
- release marker or deployment detector configured;
- PR and merge behavior controlled by policy gates.

## Build Phases

1. Product foundations:
   confirm V1 defaults, safe env values, AGENTS instructions, no-fake-demo
   contract, and assumption-record contract.

2. Core/domain:
   implement sanitization, clustering, routing, status machine, demand
   thresholds, stored signal-count promotion, cost estimates, auto-merge gates,
   live cost-cap enforcement, and assumption-record blocking.

3. API/Postgres:
   persist feedback, clusters, work items, decisions, agent runs, assumptions,
   costs, GitHub artifacts, release events, user notifications, feature usage,
   policy configs, and audit events.

4. SDK/Daybook:
   ship a real notepad/todo-style demo app with the SDK floating suggestion
   launcher, feedback submission, status polling, and feature usage events.

5. Control center:
   show setup health, queues, demand memory, a realtime feature lifecycle view,
   work item detail, assumptions, agent runs, PRs, release state, cost estimate
   vs actual, user follow-up, feature usage, and policy blockers using
   human-readable labels. Each work item should expose an evidence ledger for
   agent runs, cost records, assumptions, GitHub artifacts, release proof, user
   notifications, and audit events. The lifecycle view should visually show the
   path from feedback intake through usage measurement, with every stage backed
   by append-only evidence.

   The work item detail should also show what the system learned from each run:
   cost calibration, model/provider performance, repeated assumptions,
   guardrail hits, rejected-feature reconsideration signals, rollback/failure
   patterns, and suggested eval or regression cases.

6. GitHub:
   support GitHub App manifest/install/webhook flow, sanitized issue creation,
   branch/PR creation, check reads, comments, guarded merge, and branch cleanup.

7. Codex worker:
   claim eligible jobs, read live `/doctor` approval/auth settings, run
   `codex exec --json`, capture usage, capture assumptions, create commits/PRs
   when enabled, and report failures honestly.

8. Release/user follow-up:
   add explicit release marker in V1, prevent merged work from being called
   shipped until release proof exists, and return safe user statuses for every
   outcome. Not-planned and blocked operator decisions should update matching
   requesters and create audit evidence.

9. Reconciliation:
   clean stale workspaces/branches, recover interrupted runs, record failure
   reasons and partial costs, and keep queued/blocked states honest.

10. Recursive learning:
    persist learning events from feedback decisions, assumptions, agent runs,
    reviews, costs, releases, usage, blocked policy results, and rollbacks.
    Feed those events back into deterministic router rules and scorecards while
    preserving hard privacy, cost, security, and merge gates.

11. Verification:
    run local unit tests, DB tests when Postgres is available, typecheck, build,
    doctor, Docker Compose smoke, dry-run demo, and private dogfood demo.

## Required Test Coverage

The detailed matrix lives in [docs/v1-test-strategy.md](v1-test-strategy.md).
At minimum, V1 must include tests for:

- sanitizer privacy boundaries;
- workspace/tenant isolation and RLS policies when enabled;
- RBAC for raw feedback, secrets, cost caps, auto-merge, kill switch, and policy
  changes;
- webhook signature verification and unsafe public URL rejection;
- rate limits for SDK, admin, runner, webhook, and model/agent execution paths;
- prompt-injection attempts inside feedback;
- GitHub App installation/repo permission boundaries;
- secret storage, masking, and no-leak behavior;
- admin and runner token gates when configured, including `/doctor` no-token
  leakage;
- routing, demand thresholds, and not-built decisions;
- user-safe statuses for positive and negative outcomes;
- cost estimate and actual/token capture;
- disabled runner honesty;
- manual approval vs auto approval;
- auto approval vs auto-merge separation;
- GitHub App setup and sanitized issue creation;
- Codex runner structured output, assumptions, and skipped checks;
- release marker required before shipped status;
- feature usage attribution;
- recursive learning events and router scorecards;
- dry-run no-fake-state behavior;
- private dogfood real GitHub/Codex path;
- cleanup and reconciliation for interrupted work.

## Agent Assumption Record

Every planner, builder, reviewer, and release agent must produce an assumption
record with:

- assumptions made from incomplete context;
- defaults selected;
- alternatives skipped;
- files or surfaces intentionally left untouched;
- checks/tests run;
- checks/tests skipped and why;
- unresolved questions;
- confidence level and reason;
- whether any assumption affects privacy, cost, merge safety, or release status.

Assumptions should be saved on the run, visible in the control center, and
summarized in the PR body or PR comment when safe.

Each run should also produce a learning record when relevant:

- what should affect future routing or thresholds;
- what changed cost-estimate confidence;
- what changed model/provider confidence;
- what guardrail, test, or eval should be added;
- what user-facing explanation should improve;
- whether a not-planned or blocked decision should be reconsidered after more
  demand.

## Verification Commands

```bash
pnpm install
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

## Done Means

- Dry-run mode works and never fakes success.
- Private dogfood mode can run one real safe request end to end.
- Tunnels refuse to expose admin/runner paths unless admin and runner tokens are
  configured.
- A real GitHub issue and PR are created from sanitized context.
- Codex produces a real result with actual usage capture.
- Cost estimate and actual/token-only actual are recorded honestly.
- Auto approval and auto-merge are separate and visibly explained.
- Safe auto-merge is possible only when every gate passes.
- Cost caps, max diff lines, protected paths, and policy-level auto-merge
  allowance are live control-center policy, with the env auto-merge switch as a
  hard kill switch.
- Auto-merge evidence comes from stored runner output and live GitHub PR data,
  not caller-supplied request fields.
- Reviewer approval is recorded as a durable work-item decision before
  auto-merge can pass; the system never trusts a request-body shortcut.
- A release marker is required before a user sees shipped.
- Release proof can include the app's stable feature id, and matching SDK usage
  events appear as aggregate usage attribution on the work item.
- Negative outcomes tell the user why the item will not be worked on.
- Not-built categories and repeated demand are stored for reconsideration.
- Assumptions are recorded and can block auto-merge.
- Learning events are recorded and visible without weakening hard safety gates.
- README, AGENTS, setup docs, PRD, and control-center copy agree.
