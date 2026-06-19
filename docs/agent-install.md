# Agent Install Guide

This guide is written for Codex, Claude Code, GitHub Copilot agents, and other
coding agents that are pointed at the GitHub repo and asked to install or run
Open Feedback Factory.

## One-Paste Agent Prompt

```text
Install and verify Open Feedback Factory from this repo.
Follow AGENTS.md and docs/agent-install.md.
Use Docker Compose for the local stack.
Do not commit secrets or enable live GitHub mutation unless I explicitly ask.
Report the local URLs, verification commands, and any blocker.
Record assumptions made during install and verification.
```

## Preconditions

Check these first:

```bash
node --version
pnpm --version
docker --version
git --version
```

Optional tools:

```bash
gh auth status
codex --version
```

`gh` is only needed for GitHub CLI mutation mode. `codex` is only needed for
real Codex runner mode; disabled runner mode does not need it.

Setup should ask whether the install uses the local Codex CLI subscription path
or a server-side API key. Both paths use the Codex CLI runner in V1: `cli`
uses the local signed-in subscription, while `api_key` injects the saved
`OPENAI_API_KEY` into the Codex process.

## Fresh Clone Install

```bash
git clone https://github.com/joewilsonai/open-feedback-factory.git
cd open-feedback-factory
pnpm install
cp .env.example .env
pnpm run doctor
docker compose up -d --build
```

For local-only setup, `ADMIN_TOKEN` and `RUNNER_TOKEN` may stay blank. Before
exposing the stack through Tailscale Funnel, Cloudflare Tunnel, or any shared
network URL, set both values in `.env` and restart Docker:

```bash
ADMIN_TOKEN=replace-with-a-long-random-admin-token
RUNNER_TOKEN=replace-with-a-long-random-runner-token
```

The control center asks for `ADMIN_TOKEN` when `/doctor` reports
`adminAuthRequired=true`. Workers send `RUNNER_TOKEN` automatically when the
value is present in `.env`.

Wait for the stack:

```bash
docker compose ps
curl -s http://localhost:4100/health
curl -s http://localhost:4100/doctor
```

Open or report:

- Control center: `http://localhost:5173`
- Demo app: `http://localhost:5174`
- API doctor: `http://localhost:4100/doctor`

Optional sample feedback:

```bash
pnpm demo:seed
```

The seed command sends real Daybook feedback through the SDK and records one real
sample usage event. It does not fake PRs, model costs, agent runs, releases, or
shipped states. Live workers leave sample-only seed work queued so dry-run data
does not burn real agent runs. To clear sample seed rows and local
integration-test rows from Docker Postgres, run:

```bash
pnpm demo:reset
```

## Verify The Install

Run the normal gates:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm run doctor
git diff --check
```

Run the database integration test against Docker Postgres:

```bash
TEST_DATABASE_URL=postgres://off:off@127.0.0.1:55432/open_feedback_factory pnpm --filter @open-feedback-factory/db test
```

## GitHub App Setup

Use the control center wizard as the primary path. GitHub will not create a
manifest-based App from `localhost` URLs, so local installs need a public HTTPS
tunnel first.

1. Set `ADMIN_TOKEN` and `RUNNER_TOKEN` in `.env`, restart Docker, then start
   the Tailscale demo/control/API tunnel: `pnpm run tunnel:tailscale`.
2. Get the HTTPS URL from the printed `tailscale funnel status` output.
3. Put the printed HTTPS URL in `.env` as `PUBLIC_BASE_URL`.
4. If Tailscale Funnel is not enabled, use `cloudflared tunnel --url http://localhost:4100` for the API-only wizard path,
   but still set `ADMIN_TOKEN` and `RUNNER_TOKEN` before exposing admin or
   runner routes.
5. Restart Docker: `docker compose up -d --build`.
6. Open `http://localhost:5173` locally or `/ops` on the public Funnel URL.
7. In **Install wizard**, click **Create GitHub App**.
8. GitHub opens a required confirmation screen.
9. After confirmation, GitHub returns to `/github/app/installed`.
10. Click **Generate env values**.
11. Copy the generated values into `.env`.
12. Restart:

```bash
docker compose up -d --build
curl -s http://localhost:4100/doctor
```

Expected result after credentials are configured:

- `githubMode` is `app` when `.env` contains `GITHUB_MODE=app`.
- `githubAppConfigured` is `true`.
- The Funnel root serves the demo app, `/ops` serves the control center, and
  `/sdk`, `/admin`, `/runner`, `/doctor`, `/health`, and `/github` route to the API.

Do not print the private key or webhook secret in chat. Summarize only that
credentials were added.

## Real Codex Runner Mode

Disabled mode is the default:

```bash
CODEX_RUNNER_MODE=disabled
```

Disabled mode can intake feedback and queue work, but it must not claim work,
create implementation records, invent costs, create PRs, or mark anything
shipped.

For a real local Codex subscription run, the Codex CLI auth usually lives on
the host machine, not inside Docker. The durable path is the host worker
installer:

```bash
docker compose stop worker
pnpm worker:install:host
pnpm worker:status:host
```

On macOS this creates a LaunchAgent. On Linux this creates a user systemd
service. The generated service sources `.env` at startup and does not copy
secrets into the service file.

To remove it:

```bash
pnpm worker:uninstall:host
```

To run the same lane manually instead of installing a service:

```bash
docker compose stop worker
CODEX_RUNNER_MODE=codex pnpm --filter @open-feedback-factory/worker dev
```

For a targeted one-item run:

```bash
WORKER_RUN_ONCE=true WORKER_WORK_ITEM_ID=work_... CODEX_RUNNER_MODE=codex pnpm --filter @open-feedback-factory/worker dev
```

Only enable PR creation when explicitly requested:

```bash
CODEX_MANAGE_GIT=true
GITHUB_CREATE_PR=true
```

Use `GITHUB_MODE=app` for installable GitHub App auth, or `GITHUB_MODE=gh` for
local dogfood with the GitHub CLI.

The control center can also save a server-side OpenAI API key to
`CODEX_SECRETS_PATH` and switch `CODEX_AUTH_MODE` between `cli` and `api_key`.
The key is masked in the UI and is never returned to the browser. See
[`docs/agent-runner-setup.md`](./agent-runner-setup.md) for the exact manual
and auto worker commands.

For the Docker API-key lane:

```bash
pnpm worker:print:docker-api
docker compose up -d --build worker
```

When `CODEX_RUNNER_MODE=codex`, Compose installs `@openai/codex` in the API and
worker containers. Use `CODEX_CLI_VERSION` to pin that container install and
`DOCKER_CODEX_CLI=codex` for the container binary path. Keep host-specific paths
such as `/opt/homebrew/bin/codex` in `CODEX_CLI` for host workers only.
The Docker worker leaves work queued in `cli` auth mode because it cannot access
host Codex subscription auth; use the host worker for `cli` auth or Docker with
`api_key` auth.

The control center **Worker install** panel shows the same commands and marks
the recommended lane based on the selected Codex auth mode.

## Rate Limits And Abuse Controls

Local V1 uses fixed-window in-memory limits so SDK, admin, runner, and GitHub
paths fail in a visible way instead of accepting unlimited traffic. Defaults
live in `.env.example`:

```bash
RATE_LIMIT_WINDOW_MS=60000
SDK_RATE_LIMIT_MAX=120
ADMIN_RATE_LIMIT_MAX=120
RUNNER_RATE_LIMIT_MAX=300
GITHUB_RATE_LIMIT_MAX=300
```

If a request receives `429 rate_limited`, report the route group and retry
window. Do not raise limits to hide a test failure unless the user is explicitly
testing a higher-capacity install.

## Reconciliation And Release Proof

The control center has a **Run reconciliation** action. It calls
`/admin/reconciliation/run`, requeues stale in-progress work, and reports
implemented items that still need release proof.

Use the release marker only after implementation exists:

```bash
curl -s -X POST http://localhost:4100/admin/work-items/work_.../release \
  -H 'content-type: application/json' \
  -d '{"featureId":"daybook-note-search","message":"This request has shipped."}'
```

If the work item is still queued or in progress, the API should return a
blocked response instead of marking it shipped.
Use the same stable `featureId` from your app's SDK `trackFeatureUsage` calls so
the evidence ledger can attribute adoption back to the shipped request.

Use the control center to adjust V1 policy knobs after startup: max feature cost,
max safe diff lines, protected path fragments, and policy-level safe auto-merge
allowance. `AUTO_MERGE_ENABLED=false` still wins as the hard environment kill
switch.

## What To Report Back

After installation, report:

- whether Docker is running and healthy;
- the control center and demo app URLs;
- which verification commands passed;
- whether GitHub App mode is configured;
- whether `ADMIN_TOKEN` and `RUNNER_TOKEN` are configured before any public
  tunnel is used;
- whether approval mode is `manual` or `auto`;
- whether Codex auth mode is `cli` or `api_key`;
- whether runner mode is `disabled` or `codex`;
- whether the host worker service is installed/running or the Docker worker is
  the selected lane;
- any required human action, especially GitHub confirmation screens.
- assumptions made, defaults chosen, checks skipped, and unresolved questions.

Never include secrets, private keys, tokens, or raw user feedback in the report.
Never fake demo results. Report queued or blocked states when the real runner,
GitHub, or release proof is not configured.
