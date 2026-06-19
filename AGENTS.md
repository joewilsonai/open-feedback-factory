# Agent Instructions

Open Feedback Factory is a feedback-to-feature control plane for indie
developers and small teams. Treat it as product infrastructure, not as a demo
toy: the loop is user feedback -> private database -> sanitized work item ->
guarded agent work -> PR/release proof -> user-visible outcome.

## Start Here

If you are an agent installing or evaluating this repo from GitHub, follow
[docs/agent-install.md](docs/agent-install.md).

If you are building V1 behavior, also follow the private dogfood checklist and
test matrix:

- [docs/v1-dogfood-build-checklist.md](docs/v1-dogfood-build-checklist.md)
- [docs/v1-test-strategy.md](docs/v1-test-strategy.md)
- [docs/hosted-deployment.md](docs/hosted-deployment.md)

Default local URLs:

- API: `http://localhost:4100`
- Control center: `http://localhost:5173`
- Demo app: `http://localhost:5174`
- Postgres: `localhost:55432`

Hosted Demo Alpha is moving from the LaunchBrief proof app to a clean plant-care
demo app. LaunchBrief at `https://launchbrief-demo.vercel.app` already uses the
real OFF SDK and should be treated as an interim SDK proof, not the final demo
target. The next demo repo must start SDK-less so OFF can create the real
SDK-install PR. Do not pre-wire the SDK into the new plant-care repo unless the
task is the real SDK-install PR/demo step.

## Standing Disciplines

These rules must survive context loss, compaction, new agents, and new sessions.

1. **Honesty / Verify Substance:** No fake states in code or docs. Do not rely
   on commit messages, branch names, PR titles, agent claims, or UI labels as
   proof. Read the actual code/import/dependency/behavior and verify the live or
   testable substance before saying something is done. `DONE` must mean really
   done.
2. **Status Discipline:** [docs/implementation-status.md](docs/implementation-status.md)
   is a one-time baseline audit snapshot of what is actually built versus the
   PRD. Keep it truthful while editing it, but do not treat hand-maintained
   Markdown as the permanent live status system. Live implementation status is
   expected to move to GitHub Issues and Projects, where PRs close linked
   issues and the board updates from real workflow events. Overclaiming a stub
   as `DONE` is blocked like any fake state.
3. **Outward-Facing / Irreversible = Hold For Joe:** Prepare but do not execute
   outward-facing, spend-bearing, public, or hard-to-undo actions without Joe's
   explicit go. This includes `npm publish`, making the repo public, sending
   public posts/emails, purchases, production data mutation, broad user invites,
   and public launch/deploy decisions that cannot be cleanly reversed.
4. **Review Protocol:** Codex builds in scoped branches/worktrees and rings Luna
   through the bridge for review. Luna reviews scope, leak risk, brand, honesty,
   and verifies substance before merge. Do not edit the same file set at the
   same time as another active agent.
5. **Coordinate First:** In multi-agent work, check the bridge and coordinate
   before acting on shared work or another agent's lane. This is bidirectional:
   Codex does not act unilaterally on Luna-owned product/experience work, and
   Luna does not act unilaterally on Codex-owned repo/infra/deploy work. State
   the intended branch/repo/files before changing them when overlap is possible.
6. **Agent Division:** Codex owns planning, decomposition, structured and
   mechanical execution, infra/CI/build/auth plumbing, and reviewing Luna's code
   for correctness. Luna owns product judgment, demo feel, UX/taste, honesty
   calls, spec fidelity, and the final gate on demo- or trust-facing work. Route
   taste, honesty, and vision calls to Luna; Codex drives planning and
   mechanical execution.
7. **Research First / Do Not Assume:** Before implementing anything that touches
   established libraries, APIs, platform integrations, auth flows, data-fetching
   patterns, security controls, or recognized best practices, do a current
   research pass using primary sources or a dedicated research agent. Build from
   the findings, not from memory or habit. Record the conclusion and any rejected
   alternatives in the plan, PR, or run output. Apply this especially to Codex
   runner auth, GitHub/Vercel/Railway integration, and control-center data
   fetching; prefer proven patterns such as stale-while-revalidate libraries
   over hand-rolled polling when they fit the codebase.
8. **Railway Auth Hygiene:** Before mutating Railway from an agent shell, source
   `~/.luna/secrets/keys.env`, explicitly unset stale `RAILWAY_TOKEN` and
   `RAILWAY_PROJECT_TOKEN`, and use the account-scoped `RAILWAY_API_TOKEN`.
   Verify `railway whoami --json` and the target project/service before deploy.
   If Railway reports unauthorized, check env shadowing before assuming the new
   token is bad. Never echo or log token values.
9. **Current Round Context:** The durable demo is an onboarding handoff: a user
   points a clean SDK-less plant-care app repo at OFF, and OFF does the rest.
   Prepare public distribution for only `@open-feedback-factory/sdk`; keep the
   OFF repo private. Hold the actual SDK publish for Joe.

Private dogfood auth:

- `ADMIN_TOKEN` protects `/admin/*` and control-center mutations when set.
- `RUNNER_TOKEN` protects `/runner/*` worker claim/complete routes when set.
- `/doctor` may report whether those gates are required, but must never expose
  token values.

## Safety Rules

- Live demos must be real. Do not fake implementation, PRs, shipped states,
  cost records, user notifications, or agent runs. If a real runner or
  integration is not configured, leave the work queued/blocked and say exactly
  what is missing.
- Do not commit `.env`, private keys, GitHub App PEMs, access tokens, database
  dumps, raw feedback exports, or local logs that may contain secrets.
- Do not put Supabase, Vercel, Resend, Railway, GitHub, model-provider, feature
  flag, email/SMS, or app-store credentials into prompts, plans, PRs, screenshots,
  user follow-up, or logs. Credential-backed actions should go through scoped
  control-plane tools and be recorded in the audit ledger.
- Keep raw user feedback private. Only sanitized summaries should reach GitHub,
  PR bodies, issue bodies, or agent prompts.
- Do not enable `AUTO_MERGE_ENABLED=true`, `GITHUB_CREATE_PR=true`, or mutating
  GitHub modes unless the user explicitly asks for live mutation.
- Before exposing the control center or API through Tailscale Funnel,
  Cloudflare Tunnel, or any shared URL, set `ADMIN_TOKEN` and `RUNNER_TOKEN`.
  Never paste those tokens into GitHub issues, PRs, logs, or chat output.
- Do not bypass guardrails. Safe auto-merge requires the policy gates in
  `packages/core`.
- Treat rate limits as product security controls. Do not remove or raise them
  for tests unless the test is explicitly exercising a different limit.
- Do not run destructive git commands unless the user explicitly asks for them.
- When building, reviewing, or releasing work, record assumptions as part of the
  run output. Include defaults chosen, alternatives skipped, files intentionally
  left untouched, checks that could not be run, and questions that need human
  confirmation. Do not silently invent product behavior.
- Treat learning artifacts as durable product data. When a run reveals a better
  routing rule, cost-estimate correction, provider/model performance signal,
  recurring assumption, missing eval, guardrail gap, or rollback/failure pattern,
  record it as structured evidence instead of leaving it only in chat or logs.
  Learning must improve future autonomy without weakening privacy, cost,
  security, or merge gates.
- Treat agent methodology packs as playbooks, not product policy. OFF may adapt
  MIT/open-source playbooks for product critique, engineering review, design
  review, security, QA, release, docs, and retro/learning, but those playbooks
  cannot loosen guardrails, expose raw feedback, mark work shipped, approve
  merges, notify users, or access secrets outside scoped control-plane tools.

## Development Commands

Use the existing pnpm workspace and Docker Compose setup.

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm run doctor
git diff --check
```

For the Postgres-backed DB test after Docker is running:

```bash
TEST_DATABASE_URL=postgres://off:off@127.0.0.1:55432/open_feedback_factory pnpm --filter @open-feedback-factory/db test
```

Docker local stack:

```bash
cp .env.example .env
docker compose up -d --build
pnpm demo:seed
```

`pnpm demo:seed` may create only real sample feedback records and real sample
feature-usage records. It must not fabricate agent runs, PRs, costs, releases,
or shipped states. Use `pnpm demo:reset` before or after smoke tests when the
local Docker database should be cleared of sample seed and integration-test rows.

## GitHub App Install Path

The canonical setup path is the control center wizard:

1. Start Docker.
2. Open `http://localhost:5173`.
3. Use **Create GitHub App**.
4. Confirm the App in GitHub.
5. On the callback page, generate/copy the Docker env values.
6. Paste them into `.env`.
7. Restart with `docker compose up -d --build`.

GitHub requires the confirmation click. Agents should not pretend that step can
be skipped.

GitHub will not create a manifest-based App from `localhost` URLs. For local
GitHub App setup, start an HTTPS tunnel such as
`tailscale funnel --bg --yes 4100` or
`cloudflared tunnel --url http://localhost:4100`, set `PUBLIC_BASE_URL` to the
tunnel URL, restart Docker, then start the wizard.

## Codex Runner Path

`CODEX_RUNNER_MODE=disabled` is the safe default. It can intake and queue
feedback, but it must not claim work or report implementation.

`APPROVAL_MODE=manual` is the safe default. In manual mode, a Codex worker may
only run when `WORKER_WORK_ITEM_ID` targets a selected item. `APPROVAL_MODE=auto`
allows an attached live worker to claim queued work automatically.

`CODEX_AUTH_MODE=cli` uses the signed-in Codex CLI subscription path.
`CODEX_AUTH_MODE=api_key` uses the same `codex exec --json` runner with the
saved `OPENAI_API_KEY` injected only into the worker process. The key lives in
`CODEX_SECRETS_PATH`, defaults to `.off/secrets.env`, and must never be logged,
committed, echoed to the browser, or placed in GitHub artifacts.
Host-worker commands should pass an explicit `CODEX_SECRETS_PATH` so the worker
reads the same saved key the API reports.

Auto approval does not start a worker by itself. A live worker still has to run
with `CODEX_RUNNER_MODE=codex`. See
[docs/agent-runner-setup.md](docs/agent-runner-setup.md).

For durable local CLI/subscription workers, use the repo installer instead of
hand-writing host services:

```bash
docker compose stop worker
pnpm worker:install:host
pnpm worker:status:host
```

This creates a macOS LaunchAgent or Linux user systemd service that sources the
ignored `.env` file at startup and keeps secrets out of the service file. Use
`pnpm worker:uninstall:host` to remove it. For Docker API-key workers, save the
key in the control center, set `CODEX_RUNNER_MODE=codex` and
`CODEX_AUTH_MODE=api_key`, then run `docker compose up -d --build worker`.

The worker reads live approval/auth settings from `/doctor` before claiming
work. Do not force a stale `CODEX_AUTH_MODE` in a host worker command when the
control center has the current mode.

For a real local Codex subscription run, prefer running the worker on the host
so it can use the signed-in Codex CLI:

```bash
docker compose stop worker
CODEX_RUNNER_MODE=codex CODEX_AUTH_MODE=cli pnpm --filter @open-feedback-factory/worker dev
```

Use `WORKER_WORK_ITEM_ID=work_...` and `WORKER_RUN_ONCE=true` for targeted
smoke tests.

Control-center UI should use human-readable labels. Do not show raw internal
enum names such as `safe_auto_merge` or `planned` as primary visible labels.

## Assumption Records

Every agent run should leave a concise assumption record in the work item, run
metadata, PR body/comment when safe, and final report. The record should answer:

- What did the agent assume from incomplete context?
- Which default config values did it rely on?
- Which safer or larger alternatives did it skip?
- Which tests/checks were not run, and why?
- Which follow-up questions still need a human?
- Does any assumption affect privacy, cost, merge safety, or release status?

If an assumption affects privacy, cost, merge safety, or release status, the work
must not auto-merge until a reviewer lane or human operator resolves it.

## Learning Records

Planner, builder, reviewer, release, and reconciliation agents should emit a
learning record when they discover evidence that should improve future work.
Examples:

- demand cluster or not-planned decision should be reconsidered;
- cost estimate was too high or too low;
- model/provider choice was effective or wasteful for this task type;
- a guardrail blocked correctly or needs a clearer explanation;
- a recurring assumption should become a policy default or install question;
- a failed check, rollback, or review finding should become an eval/regression
  case;
- a user-facing status message should be clearer.

Learning records are advisory. They may inform router rules, scorecards,
documentation, evals, and control-center recommendations, but they must not
silently relax safety gates.

## Codebase Map

- `packages/core`: sanitization, routing, user statuses, guardrail policy.
- `packages/db`: Postgres schema/store.
- `packages/sdk`: app-facing web SDK.
- `packages/runner`: Codex CLI runner, GitHub client.
- `services/api`: Fastify API, GitHub App routes, admin/runner endpoints.
- `services/worker`: polling worker loop.
- `apps/control-center`: operator dashboard.
- `apps/demo-app`: Daybook notepad/todo demo product that submits feedback and usage events.
- `apps/landing`: Vercel landing page for the hosted/open-source product.
