# V1 Test Strategy

Open Feedback Factory V1 is successful only if the real feedback-to-feature loop
works and the product stays honest when something is missing or blocked. Tests
must cover happy paths, negative paths, no-fake-demo behavior, safety gates, cost
capture, release proof, and agent assumptions.

See [Implementation Status](implementation-status.md) for the current canonical
status map.

## Current Coverage Status

| Area | Status | Notes |
| --- | --- | --- |
| Deterministic CI tests | Done | Workspace `pnpm test`, `pnpm typecheck`, and `pnpm build` pass locally and in GitHub CI |
| Core policy tests | Done | Sanitization, clustering, routing, statuses, assumptions, and auto-merge gates are covered |
| API tests | Done | SDK intake/status/usage, admin config, runner gates, GitHub seams, release markers, rate limits, and user-safe decisions are covered |
| Database/RLS tests | Done | Postgres integration tests cover store behavior and workspace RLS when `TEST_DATABASE_URL` is available |
| SDK tests | Done | Client payload safety, usage events, and launcher contract are covered |
| Runner/GitHub seam tests | Done | Codex args, JSONL parsing, cost usage, GitHub App token flows, PR evidence, and branch cleanup are covered with seams/mocks |
| Control-center UI tests | Done for current internal UI | Final plant-app onboarding state still needs tests once implemented |
| LaunchBrief live proof | Done as interim proof | Proved real SDK runtime path; not the final demo target |
| Plant-care demo E2E | Partial | Sprout exists and is live-gated SDK-less; still needs OFF SDK-install PR, merge/redeploy, feedback request, implementation PR, release/user status |
| Public npm SDK install test | Partial | Local tarball install/import proof exists; public registry install remains held until Joe approves npm publish |
| Hosted control plane to local worker proof | Needs work | Must prove hosted `RUNNER_TOKEN` sync and real local CLI claim against hosted API |

## Test Principles

- Test product promises, not only functions.
- Prefer deterministic local tests for policy, sanitization, routing, status,
  and cost.
- Use mocked GitHub/Codex boundaries for normal CI.
- Use opt-in private dogfood tests for real GitHub/Codex runs.
- Every missing integration should produce a queued, blocked, or waiting status,
  not fake success.
- Any unresolved assumption affecting privacy, cost, merge safety, or release
  status should block auto-merge.

## Required Test Matrix

| Area | Required coverage |
| --- | --- |
| Core policy | Sanitization, clustering, routing, demand thresholds, cost estimates, status copy, auto-merge gates, assumption blocking, learning-informed router decisions that preserve hard gates |
| API | SDK feedback, user-safe status, feature usage, admin config, control-room snapshots, explicit not-planned/blocked decisions, demand-memory promotion, work-item evidence ledger, runner claims, release markers, GitHub webhooks, learning-event writes |
| Database | Migrations, feedback, clusters, signal counts, work items, work-item evidence detail, agent runs, assumptions, learning events, costs, GitHub artifacts, releases, notifications, usage, audit events, workspace scope, RLS policies when enabled |
| Security | Workspace/tenant isolation, RBAC, raw-feedback permissions, admin token gate, runner token gate, secret masking/storage, webhook signatures, prompt injection, SSRF/tunnel URL rejection, GitHub App installation boundaries, path traversal, command injection, branch-name injection, SQL injection, CSRF/CORS, rate limits, replay/idempotency, package-script sandboxing, token scope, audit tamper resistance, retention/delete |
| SDK | Feedback submission, floating suggestion launcher, status polling, feature usage, privacy-safe metadata |
| Runner | Disabled mode, manual approval, auto approval, Codex CLI args, `cli` auth, `api_key` auth, host worker installer generation, Docker API-key worker snippet, sanitized prompt, JSONL parsing, usage/cost capture, skipped checks, assumptions |
| GitHub | App manifest, localhost rejection, webhook reachability, signature validation, sanitized issue body, PR artifact storage, branch cleanup, guarded merge refusal |
| Control center | Setup states, queue states, realtime lifecycle view, demand-memory panel, worker install guidance, human-readable labels, no raw enum leaks, evidence ledger, assumptions panel, learning panel, cost panel, release state, follow-up state, missing-config explanations |
| Demo app | Real Daybook workflow, positive request, negative request, status display, feature usage event |
| Dry-run E2E | Docker stack starts, seeded data labeled, sample reset works, integration tests do not pollute the control center, no fake PRs, no fake costs, no fake agent runs, no fake releases, no fake shipped states |
| Private dogfood E2E | Real GitHub/Codex issue, branch, PR, usage record, cost or token actual, assumptions, release marker, user status |
| Reconciliation | Interrupted runs, stale branches/workspaces, failed checks, failed agent runs, missing release proof, rollback pause |

## Regression Tests That Must Exist

- Raw feedback never leaves the private database in GitHub issue bodies, PR
  bodies, agent prompts, user-facing status, or logs intended for GitHub.
- The web SDK exposes a floating suggestion launcher that opens feedback UI,
  submits through the SDK, supports preset suggestions without auto-submitting
  them, automatically tracks the submitted request status without a manual
  refresh button, and does not collect screenshots, raw transcripts, secrets,
  or large private payloads by default.
- Vague feedback can return context-aware, end-user-safe clarification
  questions in the SDK UI, without exposing technical workflow terms such as
  acceptance criteria, repro steps, scope, routing, or PR.
- Workspace/tenant-scoped users, API keys, workers, and admins cannot read or
  mutate another workspace's feedback, work items, agent runs, costs, GitHub
  artifacts, release events, notifications, feature usage, policy config, or
  audit events.
- Postgres row-level security policies deny cross-workspace reads and writes
  when enabled, including direct SQL attempts that bypass application helpers.
- Postgres integration tests must prove RLS with a non-owner app role, not only
  assert that policy metadata exists. RLS tables should force row security so
  accidental owner-style connections do not silently bypass tenant policies.
- Users without raw-feedback permission can see sanitized summaries and
  user-safe status only.
- Non-owner roles cannot rotate secrets, enable auto-merge, broaden protected
  paths, raise cost caps, toggle the kill switch, or weaken policy.
- When configured, `ADMIN_TOKEN` is required for `/admin/*` routes and
  `RUNNER_TOKEN` is required for `/runner/*` routes; `/doctor` exposes only
  auth-required booleans and never returns token values.
- GitHub webhook requests without a valid signature are rejected and do not
  write artifacts.
- GitHub App tokens are installation-scoped, the admin API can verify the
  installation's accessible repository list without leaking credentials or raw
  provider errors, and the product refuses to mutate repos outside the
  configured installation/repo.
- Prompt-injection text inside feedback is treated as user content and cannot
  make the runner request raw feedback, expose secrets, change policy, or bypass
  guardrails.
- Localhost, private-network, metadata-service, and malformed webhook/tunnel URLs
  are rejected for public GitHub webhook setup unless explicitly in local-only
  development mode.
- Secrets saved through the control center are stored outside git, masked in
  responses, never returned to the browser, and never copied into GitHub
  artifacts or agent prompts.
- Generated host worker service files source `.env` at startup and do not copy
  `OPENAI_API_KEY`, GitHub App private keys, tokens, or raw feedback into
  LaunchAgent/systemd files.
- User-controlled strings cannot escape file/path boundaries, create unsafe
  branch names, inject shell arguments, inject SQL, or alter generated YAML,
  Markdown, PR bodies, issue bodies, or config files in unsafe ways.
- Generated branch names, commit messages, issue titles, labels, PR titles, and
  file paths are normalized and length-limited before use in git, GitHub, shell,
  or filesystem operations.
- Admin mutation endpoints require valid admin auth, reject cross-origin writes
  unless explicitly configured, and are protected from CSRF in browser-based
  deployments.
- Feedback, status, feature-usage, and admin endpoints have rate limits or abuse
  controls appropriate for their exposure mode.
- Public SDK feedback intake, status polling, and feature-usage endpoints have
  separate per-user, per-device/session, per-IP, per-workspace, and burst-limit
  tests.
- Admin write endpoints, policy changes, cost-cap changes, secret operations,
  runner actions, and release-marker operations have stricter rate-limit tests
  and produce audit events for throttled attempts.
- Runner job claim/complete endpoints enforce per-worker, per-workspace, and
  concurrency limits so a broken worker cannot claim the queue or create runaway
  retries.
- GitHub webhooks are rate-limited and replay/idempotency-tested by delivery id,
  installation, repo, and source trust where available.
- Model/agent execution is limited by spend and attempt caps separate from HTTP
  rate limits: per work item, per day, per month, per workspace, and per runner.
- Manual runs, targeted runner claims, automatic runner claims, and auto-merge
  gates respect the live max feature cost cap before spending model time.
- Safe auto-merge reads live merge guardrail policy for max diff lines,
  protected path fragments, and policy-level auto-merge allowance. The env
  `AUTO_MERGE_ENABLED` switch remains a hard kill switch.
- Safe auto-merge reads branch provenance, changed files, diff size, check
  status, and cost evidence from stored runner output or live GitHub PR data,
  not from caller-supplied request fields.
- Rate-limit responses are user-safe and observable: they do not silently drop
  feedback, and they either queue, defer, or return a clear retry/status path.
- Webhook delivery is idempotent and replay-resistant enough that duplicate
  GitHub events cannot create duplicate runs, duplicate costs, duplicate release
  markers, or duplicate notifications.
- Package install/test scripts from target repos are treated as untrusted code
  and cannot access Open Feedback Factory secrets, raw feedback, production
  databases, or broader network access than the sandbox allows.
- Access tokens and GitHub App installation tokens are scoped to the minimum
  required permissions and are not logged, cached longer than necessary, or
  reused across workspaces/installations.
- Audit events for policy changes, secret changes, runner claims, merge
  decisions, release markers, and user notifications are append-only from the
  application perspective and tamper-evident enough for dogfood debugging.
- Raw-feedback retention and deletion tests prove raw payloads are purged while
  sanitized aggregates, demand counts, and audit-safe deletion records remain.
- Disabled runner queues work without creating agent runs, costs, commits, PRs,
  or shipped states.
- Local sample seeding is idempotent enough for repeated smoke runs and can be
  reset without deleting real Daybook feedback.
- Postgres integration tests clean their own rows, so running the test suite
  against the Docker database does not leave test work items in the control
  center.
- Auto approval lets an attached worker claim eligible work but does not merge.
- Auto-merge is denied unless reviewer, check, policy, provenance, cost, and
  release gates pass.
- Reviewer approval is not accepted as a transient request flag. A reviewer
  agent or human must record an approval decision in the work-item ledger, and
  auto-merge must read that persisted latest decision.
- Merged work is not called shipped until release proof exists.
- Missing pricing rates store real token usage and low-confidence estimated
  dollars instead of fake actual spend.
- Not-planned, unsafe, duplicate, already-available, and below-threshold
  decisions produce user-safe explanations and decision categories.
- Admin not-planned and blocked decisions update the work item, notify matching
  requesters, and write audit evidence.
- Repeated below-threshold feedback uses stored cluster signal counts and
  promotes into backlog or guarded work when the configured threshold is met.
- Assumptions affecting privacy, cost, merge safety, or release status prevent
  auto-merge.
- Learning records from feedback decisions, assumptions, agent runs, reviews,
  costs, releases, usage, blocked policy results, and rollbacks are persisted as
  evidence and visible in the control center.
- Learning-informed router recommendations explain which historical evidence
  influenced them and cannot silently relax privacy, cost, security, rate-limit,
  or merge gates.
- Cost-estimate calibration samples update confidence and future estimates
  without overwriting actual token/cost records.
- Model/provider score events are scoped by workspace/repo/category/risk tier
  and cannot leak raw feedback or secrets.
- Repeated demand after a not-planned or blocked decision creates a
  reconsideration candidate when policy allows it, and leaves non-reopenable
  categories closed when configured.
- Failed checks, rollbacks, bad assumptions, and privacy/security findings can
  generate suggested eval/regression cases without auto-applying unsafe code
  changes.
- The admin evidence endpoint and control center work-item ledger show agent
  runs, estimate and actual cost records, assumptions, GitHub artifacts, review
  decisions, release markers, feature-usage attribution, user notifications, and
  audit events without exposing raw feedback.
- The control center lifecycle view shows every feature stage from feedback
  intake through usage measurement, and each visual state is backed by an audit
  event, run record, cost record, GitHub artifact, release marker, or
  notification record. It must not show "done", "merged", or "shipped" without
  the corresponding evidence.
- Release markers can include a stable feature id, and later SDK usage events
  for that feature id are attributed back to the shipped work item and requester
  cluster using aggregate counts only.

## Local Verification Commands

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm run doctor
git diff --check
```

With Docker Postgres:

```bash
TEST_DATABASE_URL=postgres://off:off@127.0.0.1:55432/open_feedback_factory pnpm --filter @open-feedback-factory/db test
docker compose up --build
```

## Private Dogfood Verification

Private dogfood tests are opt-in because they mutate GitHub and spend real model
tokens.

Required preconditions:

- `GITHUB_MODE=app` with GitHub App credentials, or explicit `GITHUB_MODE=gh`
  internal fallback;
- `GITHUB_CREATE_PR=true`;
- `CODEX_RUNNER_MODE=codex`;
- `CODEX_AUTH_MODE=cli` or `CODEX_AUTH_MODE=api_key`;
- approval mode selected in the control center;
- release marker path configured;
- cost rates configured, or token-only actuals accepted explicitly.

Expected dogfood proof:

- one positive Daybook request creates a real sanitized issue and PR;
- Codex produces real output and usage totals;
- assumptions and skipped checks are stored;
- the PR only merges if every gate passes;
- user status remains waiting for release until release proof is recorded;
- after release proof, user status becomes shipped;
- one negative request records a decision category and user-safe reason without
  creating unsafe GitHub work.

## CI Expectations

Normal CI should run deterministic tests only: unit tests, API tests, UI tests,
runner boundary tests, GitHub boundary tests with mocks, typecheck, build, and
diff checks. Real GitHub/Codex dogfood tests should be manually triggered or run
in a protected environment with explicit credentials and spend caps.
