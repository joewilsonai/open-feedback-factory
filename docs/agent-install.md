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
or a server-side API key. The CLI path is implemented in V1. The API-key path
must stay blocked until a real API-backed runner is added.

## Fresh Clone Install

```bash
git clone https://github.com/joewilsonai/open-feedback-factory.git
cd open-feedback-factory
pnpm install
cp .env.example .env
pnpm run doctor
docker compose up -d --build
```

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

Seed a sample feedback-to-feature loop:

```bash
pnpm demo:seed
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

1. Start the Tailscale demo/control/API tunnel: `pnpm run tunnel:tailscale`.
2. Get the HTTPS URL from the printed `tailscale funnel status` output.
3. Put the printed HTTPS URL in `.env` as `PUBLIC_BASE_URL`.
4. If Tailscale Funnel is not enabled, use `cloudflared tunnel --url http://localhost:4100` for the API-only wizard path.
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
the host machine, not inside Docker. Stop the Docker worker and run the worker
locally:

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

## What To Report Back

After installation, report:

- whether Docker is running and healthy;
- the control center and demo app URLs;
- which verification commands passed;
- whether GitHub App mode is configured;
- whether approval mode is `manual` or `auto`;
- whether Codex auth mode is `cli` or `api_key`;
- whether runner mode is `disabled` or `codex`;
- any required human action, especially GitHub confirmation screens.

Never include secrets, private keys, tokens, or raw user feedback in the report.
Never fake demo results. Report queued or blocked states when the real runner,
GitHub, or release proof is not configured.
