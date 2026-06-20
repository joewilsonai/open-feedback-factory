# Open Feedback Factory

Open Feedback Factory is a standalone feedback-to-feature control plane for
indie developers and small teams.

The wedge is autonomous feature shipping for indie apps: real users ask for
improvements inside the app, the system clusters demand, safe work becomes
guarded agent implementation, and users get told what shipped or why it did not.

The goal is simple: let an app listen to real user demand, decide what is worth
acting on, turn safe requests into guarded agent work, track cost and release
proof, notify users what happened, and measure whether shipped features get
used.

Agent-built pull requests are becoming table stakes. Open Feedback Factory's
wedge is the managed loop around them: in-app feedback intake, privacy
sanitization, demand thresholds, decision memory, cost controls, release proof,
and user follow-up.

The product should also improve itself over time. Every request, decision,
agent run, PR, review, release marker, usage event, rejection, rollback, and
blocked policy result should become structured learning evidence for future
routing, cost estimation, guardrails, provider/model choice, and eval coverage.

V1 is an internal dogfood build. It is designed as an open-source product, but
the first implementation should prove the loop privately before public launch.
See [docs/v1-dogfood-build-checklist.md](docs/v1-dogfood-build-checklist.md)
for the exact private dogfood completion gate.

## Hosted Private Stack

The private hosted stack is now split across Railway and Vercel:

- Railway: API, control center, demo app, disabled worker, and Postgres.
- Vercel: public landing page from `apps/landing`.
- Hostinger: DNS for `openfeedbackfactory.com`, `.dev`, and `.org`.

Current private Railway URLs and the target custom-domain map are documented in
[docs/hosted-deployment.md](docs/hosted-deployment.md).

The hosted stack starts honest and safe: manual approval, runner disabled,
GitHub disabled, auto-merge disabled, and admin/runner tokens required. It can
receive real feedback and show real queued work, but it should not claim PRs,
cost actuals, releases, or shipped state until the corresponding integrations
are configured.

## V1 Direction

- Docker Compose local install.
- Hosted trial/sandbox path for developers who want to test before installing.
- Web SDK first, including a floating suggestion launcher with automatic
  in-widget request status tracking.
- Hosted landing page and a clean plant-care demo for developers who need to
  see the loop before self-hosting. The plant app must start without the OFF
  SDK so the demo can show a real SDK-install PR. LaunchBrief is only an
  interim real-SDK proof app.
- Postgres database.
- GitHub App integration.
- Codex-only built-in runner.
- Policy-gated safe auto-merge.
- User-facing shipped, blocked, not-planned, and needs-more-signal statuses.
- Demand memory for below-threshold and blocked feedback clusters.
- Feature usage attribution.
- Focused operator control center with a realtime feature lifecycle view.
- Recursive learning events that make routing, cost estimates, guardrails, and
  agent/provider selection smarter without weakening safety gates.
- Agent playbook layer for product critique, engineering review, design review,
  security, QA, release, docs, and retro/learning. OFF can adapt MIT/open-source
  methodology packs, but the work router still owns privacy, cost, policy,
  merge, release, and user-follow-up decisions.
- Codebase health/readiness scoring that turns repo and integration findings
  into normal work items.
- Secure integration secrets vault for scoped Supabase, Vercel, Resend, GitHub,
  provider, and deployment credentials.

Hosted trial/sandbox should let a developer connect a test or starter repo,
install the SDK snippet, submit real feedback, watch the lifecycle, and see a
guarded PR path without pretending that anything shipped.

## SDK Package Status

The web SDK package is prepared for public npm distribution under
`@open-feedback-factory/sdk`: it builds to `packages/sdk/dist`, exports
declaration files, has package-local install docs, and passes `npm pack`
dry-run plus a disposable tarball import smoke test.

The actual `npm publish --access public` step is intentionally held for Joe.
Until that hold is lifted, any SDK-install demo that does not install from the
public npm registry must be labeled interim.

The admin SDK-install handoff endpoint is wired to stay honest while that hold
is in place: `POST /admin/connect/sdk-install-pr` verifies GitHub App repo
access and then returns a blocked state with no work item, issue, or PR URL
until the SDK publish and worker/PR lane are real.

Future/V2: requester-first rollout can expose a shipped feature first to the
users or cohort who asked for it, collect lightweight feedback, watch health
and usage, then fall back to the operator's normal rollout policy.

## Local Development

V1 uses a pnpm TypeScript workspace and Docker Compose.

If you are pointing Codex, Claude Code, GitHub Copilot, or another coding
agent at this repo, start with [AGENTS.md](AGENTS.md) and
[docs/agent-install.md](docs/agent-install.md).

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm run doctor
pnpm dev
```

Landing page:

```bash
pnpm landing:dev
pnpm landing:build
```

Default local ports:

- API: `http://localhost:4100`
- Control center: `http://localhost:5173`
- Demo app: `http://localhost:5174`
- Postgres: `localhost:55432`

Docker path:

```bash
cp .env.example .env
pnpm docker:up
```

Optional sample data after the stack is up:

```bash
pnpm demo:seed
```

`pnpm demo:seed` submits real Daybook feedback through the SDK and records one
real feature-usage event. It does not create fake PRs, fake costs, fake agent
runs, fake release events, or fake shipped states. Use `pnpm demo:reset` to clear
sample seed and local integration-test rows from the Docker database without
touching real `daybook_demo_app` submissions.
Live workers leave sample-only seed work queued so dry-run data does not burn
real agent runs.

The Docker stack starts Postgres, the API, the worker, the control center, and
the Daybook notepad/todo demo app. The worker polls `/runner/jobs/claim`, runs the configured runner,
and posts results back to `/runner/jobs/:id/complete`.

Safety defaults:

- real auto-merge is disabled by default;
- GitHub mutations are disabled by default;
- approval mode defaults to manual, so live workers only run targeted items;
- runner mode defaults to disabled, so feedback is queued until a real runner is attached;
- Codex auth can use either the local Codex CLI subscription path or a
  server-side OpenAI API key saved outside git.
- admin and runner token gates are available through `ADMIN_TOKEN` and
  `RUNNER_TOKEN`; set both before exposing a tunnel or shared dogfood URL.
- SDK, admin, runner, and GitHub endpoints have separate fixed-window rate-limit
  defaults that can be tuned from `.env`.

## Private Access Gates

Local-only development can leave `ADMIN_TOKEN` and `RUNNER_TOKEN` blank. Before
using Tailscale Funnel, Cloudflare Tunnel, or any shared network URL, set both
values in `.env` and restart the stack.
`pnpm run tunnel:tailscale` refuses to expose the local stack until both tokens
are present.

Local Vite dev servers automatically allow localhost and Tailscale `.ts.net`
hosts. For other tunnel domains, add a comma-separated list to
`VITE_ALLOWED_HOSTS` in `.env`, then restart `pnpm dev`.

`ADMIN_TOKEN` protects `/admin/*` routes and the control center queue/settings
actions. The control center reads `/doctor`, asks for the token when required,
stores it in local browser storage, and sends it as a bearer token for admin
requests.

`RUNNER_TOKEN` protects `/runner/*` claim and completion routes. Docker and host
workers read the same `.env` value and send it as `x-off-runner-token`.

## Approval And Credential Modes

`APPROVAL_MODE=manual` requires an operator to run a selected work item. It is
the default for local demos and beta installs.

`APPROVAL_MODE=auto` lets a live Codex worker claim safe queued work without
selecting a specific work item. It still uses real runners, real PRs, and real
guardrails.

`CODEX_AUTH_MODE=cli` uses the signed-in local Codex CLI subscription path.

`CODEX_AUTH_MODE=api_key` can be selected from the control center, and the
control center can save a server-side OpenAI API key to
`CODEX_SECRETS_PATH` without echoing it back to the browser. The worker injects
that key only when `CODEX_AUTH_MODE=api_key`.

## Runner Modes

`CODEX_RUNNER_MODE=disabled` is the default. It accepts feedback and creates
queued work items, but it does not claim work, report implementation, create
agent runs, produce costs, or tell users something shipped.

`CODEX_RUNNER_MODE=codex` uses `codex exec --json`. In `cli` auth mode, it uses
the signed-in local Codex subscription path. In `api_key` auth mode, the worker
loads `OPENAI_API_KEY` from `CODEX_SECRETS_PATH` or the environment and injects
it into the Codex process.

For local CLI/subscription installs, run the worker on the host so it can use
the installed Codex CLI:

```bash
docker compose stop worker
pnpm worker:install:host
pnpm worker:status:host
```

The helper creates a macOS LaunchAgent or Linux user systemd service, sources
the ignored `.env` file at startup, and avoids copying secrets into the service
file. Remove it with `pnpm worker:uninstall:host`.

For Docker API-key installs, save the API key in the control center, set
`CODEX_RUNNER_MODE=codex` and `CODEX_AUTH_MODE=api_key`, then restart the worker
service with `docker compose up -d --build worker`. Print the helper snippet
with `pnpm worker:print:docker-api`. Docker installs `@openai/codex` in the API
and worker containers when runner mode is `codex`; use `CODEX_CLI_VERSION` to
pin that container CLI version and `DOCKER_CODEX_CLI` for the in-container
binary path. Host workers can keep using `CODEX_CLI` for a host-specific path.
The Docker worker intentionally leaves work queued in `cli` auth mode because it
cannot use your host Codex subscription auth; switch it to `api_key` or use the
host worker.

The worker reads live approval/auth settings from `/doctor` before each claim,
so changing Codex auth mode in the control center is picked up by an attached
worker. The worker process still needs `CODEX_RUNNER_MODE=codex` because that is
the explicit opt-in to real code execution. Host workers should pass an
absolute `CODEX_SECRETS_PATH` or `CODEX_SECRETS_PATH="$PWD/.off/secrets.env"` so
they read the same saved key the API reports.

`CODEX_MANAGE_GIT=true` lets the Codex runner create a work branch before it
runs. `GITHUB_CREATE_PR=true` plus `GITHUB_MODE=gh` lets the worker push that
branch and open a pull request after a successful Codex run.

Set the optional `CODEX_*_USD_PER_1M` rate variables to convert captured Codex
JSON usage totals into actual dollar cost records. Without rates, V1 records
actual tokens and keeps the configured estimate as the dollar amount.

GitHub Actions can also run a manual one-item worker through the copyable
template in [docs/github-actions-runner.md](docs/github-actions-runner.md).
That lane uses API-key auth in CI, not a developer's local Codex subscription.

Set `WORKER_WORK_ITEM_ID=work_...` with `WORKER_RUN_ONCE=true` to run one
specific queued item. This is useful for demos, retries, and Codex PR smoke
tests where another worker should not claim the oldest queue item.

Live demos must be real. If Codex, GitHub, or release proof is not configured,
the product should show queued/blocked states and the exact missing requirement,
not simulated implementation.

Runner completions store structured assumptions, checks run, skipped checks,
actual token/cost data when available, and a user-safe message. Any unresolved
assumption that affects privacy, cost, merge safety, or release status blocks
safe auto-merge until a reviewer lane or human operator resolves it.

Reviewer approval is also durable evidence. The control center records review
approval or rejection on the work item ledger, and safe auto-merge reads that
latest stored decision. Passing `reviewerApproved` in a one-off request is not a
merge gate; the review must be recorded first by a reviewer agent or human.

The control center shows estimated cost before work starts and latest actual
cost after a runner reports completion. It also exposes a reconciliation action
that requeues stale in-progress work and identifies implemented work still
waiting for release proof.

Each selected work item also has an evidence ledger. The ledger shows agent
runs, estimate and actual cost records, all recorded assumptions, GitHub
artifacts, review decisions, release markers, user-facing follow-up
notifications, feature-usage attribution, and audit events. This is the
operator proof trail for "what happened, what did it cost, what assumptions were
made, who reviewed it, what PR exists, is it actually shipped, and is it being
used?"

Learning is part of that ledger. Runs should record what the system learned:
cost-estimate calibration, repeated assumptions, provider/model performance,
guardrail hits, missed tests, rollback causes, and suggested eval/regression
cases. The router should use those records to make better future decisions, but
learning artifacts must never silently relax privacy, cost, security, or merge
guards.

Feature usage attribution is tied to release proof. When marking a work item
shipped, record the app's stable `featureId`; later SDK calls to
`trackFeatureUsage({ featureId })` are attributed back to the shipped work item,
requesting feedback cluster, and requester count without exposing raw feedback.

Below-threshold feedback is not thrown away. The API stores it in feedback
clusters, increments the cluster signal count on later matching requests, and
routes repeated unclear requests into a guarded work item once the V1 threshold
is reached. The control center's demand-memory panel shows these clusters,
their latest safe decision, and whether they have promoted into work.

Operators can also record explicit not-planned or blocked decisions from the
control center. That updates the work item, writes a user-safe notification for
matching requesters, and stores an audit event so rejected work is explained
instead of silently disappearing.

The control center can update the max feature cost cap, max safe diff size,
protected path fragments, and policy-level auto-merge allowance. `/doctor`,
manual runs, runner claims, and safe auto-merge all read live policy config, so
over-budget work stays queued instead of spending model time and over-broad PRs
stay blocked. `AUTO_MERGE_ENABLED=false` remains the hard env kill switch even
when the policy-level auto-merge allowance is on.

## Rate Limits

V1 includes local fixed-window HTTP rate limits. Defaults are intentionally high
for private dogfood, but visible and configurable:

- `SDK_RATE_LIMIT_MAX=120`
- `ADMIN_RATE_LIMIT_MAX=120`
- `RUNNER_RATE_LIMIT_MAX=300`
- `GITHUB_RATE_LIMIT_MAX=300`
- `RATE_LIMIT_WINDOW_MS=60000`

Hosted installs should back these with shared storage such as Redis; the V1
in-memory limiter exists so local and Docker installs exercise the same failure
shape instead of silently accepting abuse.

## GitHub Modes

`GITHUB_MODE=disabled` is the default.

`GITHUB_MODE=gh` enables internal dogfood mutations through the GitHub CLI. In
that mode, newly accepted sanitized feedback can create a GitHub issue and store
the URL on the work item. Safe auto-merge still requires every gate to pass:
safe risk tier, trusted branch, persisted reviewer approval, passing checks,
release health, cost cap, allowed paths, and an attached PR URL.
Branch, diff, check, and cost evidence is read from stored runner output or live
GitHub PR data, not caller-supplied request fields.

`GITHUB_MODE=app` is the installable GitHub App path. Configure
`GITHUB_APP_ID` plus either `GITHUB_APP_PRIVATE_KEY` or
`GITHUB_APP_PRIVATE_KEY_PATH`; `GITHUB_APP_INSTALLATION_ID` is optional because
the client can resolve it from the configured owner/repo. In App mode, sanitized
issues, PR creation, PR comments, branch cleanup, and guarded merges use
installation tokens instead of a personal GitHub CLI session.

The control center shows a GitHub App install wizard at
`http://localhost:5173` locally and `/ops` through the Tailscale HTTPS demo URL.
Use **Create GitHub App** to start GitHub's
manifest-based App registration flow. GitHub still requires a confirmation
screen, then it returns to the local callback page where you can generate and
copy the `GITHUB_MODE=app` env values for Docker. GitHub will not create a
manifest-based App from `localhost` URLs. For local testing, run
`pnpm run tunnel:tailscale`, set `PUBLIC_BASE_URL` to the printed HTTPS URL,
restart Docker, then use the wizard. The helper maps `/` to the demo app and
`/ops` to the control center, while keeping `/sdk`, `/admin`, `/runner`,
`/doctor`, `/health`, and `/github` pointed at the API so the demo app, control
center, and GitHub webhook callback work on one hostname.
If Tailscale Funnel is not available, `cloudflared tunnel --url
http://localhost:4100` can expose the API-only wizard path, but it will not serve
the demo app unless you add equivalent routing.

The API also exposes `/github/app/manifest`, `/github/app/setup`,
`/github/app/installed`, and `/github/webhook` for the App installation and
webhook flow.

After App credentials are configured, operators can verify the installation
scope with `GET /admin/github/repositories` using the admin token. That endpoint
lists the repositories visible to the GitHub App installation, reports whether
the configured `GITHUB_OWNER/GITHUB_REPO` target is accessible, and returns a
safe blocked/error summary instead of raw provider errors. It never returns the
App private key, installation token, webhook secret, or admin token.

GitHub webhook deliveries are recorded by delivery id so redelivered events are
acknowledged without duplicating artifacts or agent-run records. GitHub
artifacts are idempotent per work item/type/URL, and generated runner branches
are eligible for cleanup after a guarded merge.

## CI And Safe Merge

The default GitHub Actions workflow runs tests, typecheck, build, and the
Postgres-backed DB integration test on pull requests. Safe auto-merge depends
on that check lane plus the Open Feedback Factory policy gates; it is disabled
until `AUTO_MERGE_ENABLED=true` and GitHub mutation mode are explicitly set.
The DB integration test includes a non-owner app role RLS check that proves one
workspace cannot read or write another workspace's rows through direct SQL.

Merged or implemented work is not user-facing `shipped` until an explicit
release marker is recorded. The release endpoint refuses still-planned or
in-progress work.

## Docs

- [Agent instructions](AGENTS.md)
- [Agent install guide](docs/agent-install.md)
- [Agent runner setup](docs/agent-runner-setup.md)
- [Hosted deployment](docs/hosted-deployment.md)
- [Hosted Demo Alpha](docs/hosted-demo-alpha.md)
- [V1 dogfood build checklist](docs/v1-dogfood-build-checklist.md)
- [V1 test strategy](docs/v1-test-strategy.md)
- [PRD](docs/feedback-to-feature-platform-prd.md)
- [Polished PRD HTML](docs/feedback-to-feature-platform-prd.html)
- [V1 design](docs/superpowers/specs/2026-06-19-open-feedback-factory-v1-design.md)
- [Implementation plan](docs/superpowers/plans/2026-06-19-open-feedback-factory-v1.md)
