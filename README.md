# Open Feedback Factory

Open Feedback Factory is a standalone feedback-to-feature control plane for
indie developers and small teams.

The goal is simple: let users request improvements from inside an app, turn
safe requests into sanitized GitHub issues, let agents implement tightly
guarded work, track cost, ship through PRs, notify users what happened, and
measure whether shipped features get used.

V1 is an internal dogfood build. It is designed as an open-source product, but
the first implementation should prove the loop privately before public launch.
See [docs/v1-dogfood-build-checklist.md](docs/v1-dogfood-build-checklist.md)
for the exact private dogfood completion gate.

## V1 Direction

- Docker Compose local install.
- Web SDK first.
- Postgres database.
- GitHub App integration.
- Codex-only built-in runner.
- Policy-gated safe auto-merge.
- User-facing shipped, blocked, not-planned, and needs-more-signal statuses.
- Feature usage attribution.
- Focused operator control center.

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
- SDK, admin, runner, and GitHub endpoints have separate fixed-window rate-limit
  defaults that can be tuned from `.env`.

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
with `pnpm worker:print:docker-api`.

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

The control center shows estimated cost before work starts and latest actual
cost after a runner reports completion. It also exposes a reconciliation action
that requeues stale in-progress work and identifies implemented work still
waiting for release proof.

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
safe risk tier, trusted branch, reviewer approval, passing checks, release
health, cost cap, allowed paths, and an attached PR URL.

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

GitHub webhook deliveries are recorded by delivery id so redelivered events are
acknowledged without duplicating artifacts or agent-run records. GitHub
artifacts are idempotent per work item/type/URL, and generated runner branches
are eligible for cleanup after a guarded merge.

## CI And Safe Merge

The default GitHub Actions workflow runs tests, typecheck, build, and the
Postgres-backed DB integration test on pull requests. Safe auto-merge depends
on that check lane plus the Open Feedback Factory policy gates; it is disabled
until `AUTO_MERGE_ENABLED=true` and GitHub mutation mode are explicitly set.

Merged or implemented work is not user-facing `shipped` until an explicit
release marker is recorded. The release endpoint refuses still-planned or
in-progress work.

## Docs

- [Agent instructions](AGENTS.md)
- [Agent install guide](docs/agent-install.md)
- [Agent runner setup](docs/agent-runner-setup.md)
- [V1 dogfood build checklist](docs/v1-dogfood-build-checklist.md)
- [V1 test strategy](docs/v1-test-strategy.md)
- [PRD](docs/feedback-to-feature-platform-prd.md)
- [Polished PRD HTML](docs/feedback-to-feature-platform-prd.html)
- [V1 design](docs/superpowers/specs/2026-06-19-open-feedback-factory-v1-design.md)
- [Implementation plan](docs/superpowers/plans/2026-06-19-open-feedback-factory-v1.md)
