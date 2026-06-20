# Agent Runner Setup

Open Feedback Factory separates feedback intake from code execution. Feedback
can be collected while the runner is paused. Work is implemented only when a
real Codex worker is attached.

See [Implementation Status](implementation-status.md) for the current canonical
DONE / PARTIAL / NOT-STARTED / DEFERRED map.

## Required Pieces

- API, database, control center, and demo app running.
- A clean git checkout of the target repo.
- Codex CLI installed on the worker machine.
- GitHub auth configured when PR creation is enabled.
- Approval mode selected in the control center.
- Codex auth mode selected in the control center.
- Runner process started with `CODEX_RUNNER_MODE=codex`.

The worker reads live approval/auth settings from `/doctor` before each claim.
That means `CODEX_AUTH_MODE` can be changed in the control center and the host
worker will pick it up. `CODEX_RUNNER_MODE=codex` still has to be set on the
worker process because it is the switch that attaches real execution.
If `RUNNER_TOKEN` is set, the worker sends it to `/runner/*` as
`x-off-runner-token`; unauthenticated claim/complete requests are rejected.
When the runner is attached, it also posts a token-gated `/runner/heartbeat`
before trying to claim work. `/doctor` and the control center expose only a
safe liveness summary: worker name, host-vs-Docker kind, runner/auth mode, last
seen time, and online/stale/offline status. They never expose `RUNNER_TOKEN`,
API keys, or Codex session material.

The control center's **Worker install** panel exposes the supported install
commands and the current **Worker connection** status. Users should not need to
hand-wire LaunchAgents, systemd units, or Docker worker snippets from memory.

## Approval Modes

`manual` means feedback queues until an operator runs one selected work item.
Use this for first installs, demos, and risky repos.

`auto` means an attached live worker can claim queued work without a specific
`WORKER_WORK_ITEM_ID`. Auto mode does not create a worker by itself. It only
allows a running worker to claim work.

## Codex Auth Modes

`cli` uses the signed-in Codex CLI subscription path on the worker machine.
This is the $0 incremental-cost lane for indie developers who already have
Codex access through ChatGPT. OFF does not store the user's ChatGPT session in
the control plane; the trusted worker machine owns the Codex login.

`api_key` uses a server-side OpenAI API key. The control center saves the key to
`CODEX_SECRETS_PATH`, defaulting to `.off/secrets.env` for direct local runs and
`/workspace/.off/secrets.env` in Docker Compose. This path is ignored by git.
The key is masked in the UI and is never returned to the browser. The worker
injects it only into the Codex process for API-key runs.

The control center exposes both paths in **Agent credentials**:

- **Codex subscription:** run a trusted host worker where Codex is already
  signed in. Use `codex login --device-auth` when a browser callback is brittle,
  and `codex login status` to verify the session.
- **OpenAI API key:** save a BYO API key for a paid server-side worker. This is
  useful for Docker or managed workers, but it is billed through the user's
  OpenAI Platform account.

For hosted control-plane installs, `cli` still means "the worker machine has a
signed-in Codex CLI session." It does not mean Railway, Docker, or a public
server can borrow the user's subscription automatically. To use a Codex
subscription with the hosted control plane, run the host worker on a trusted
developer machine and point it at the hosted API:

```bash
WORKER_API_BASE_URL=https://api.openfeedbackfactory.com
CODEX_AUTH_MODE=cli
CODEX_RUNNER_MODE=codex
GITHUB_OWNER=joewilsonai
GITHUB_REPO=sprout-demo
RUNNER_WORKSPACE=/path/to/sprout-demo
```

If the hosted API requires `RUNNER_TOKEN`, put that token in the worker's
ignored environment file before starting the host worker. Do not paste it into
GitHub, prompts, PRs, screenshots, or logs.

For repo-specific jobs such as the hosted SDK-install handoff, the claimed job
includes a target repository. Configure `GITHUB_OWNER`, `GITHUB_REPO`, and
`RUNNER_WORKSPACE` for that repository. The worker checks the target before
running Codex and blocks if the job targets a different repo or if the checkout
remote points somewhere else. This prevents a hosted Sprout install request from
accidentally mutating the OFF repo checkout.

Generic hosted/container workers cannot use a developer's local Codex
subscription session. Those workers should stay disabled or use the Docker
API-key lane until a provider-supported delegated subscription token flow is
available for the target account type.

Current official Codex auth surfaces support ChatGPT login for local CLI/app
flows, API-key auth for usage-based workflows, device-code login for local
clients, and Business/Enterprise access tokens for trusted automation. Do not
describe hosted Plus/Pro subscription delegation as available until OpenAI or
another supported provider exposes an appropriate delegated token path for that
account type.

## Manual One-Item Run

Use this when approval mode is manual:

```bash
cd /path/to/open-feedback-factory

WORKER_RUN_ONCE=true \
WORKER_WORK_ITEM_ID=work_... \
CODEX_RUNNER_MODE=codex \
CODEX_MANAGE_GIT=true \
GITHUB_CREATE_PR=true \
GITHUB_MODE=gh \
GITHUB_PR_BASE=codex/open-feedback-factory-v1 \
WORKER_API_BASE_URL=http://localhost:4100 \
GITHUB_OWNER=joewilsonai \
GITHUB_REPO=open-feedback-factory \
RUNNER_WORKSPACE=/path/to/open-feedback-factory \
CODEX_SECRETS_PATH="$PWD/.off/secrets.env" \
CODEX_MODEL=gpt-5.5 \
CODEX_EFFORT=extra-high \
CODEX_TIMEOUT_MS=900000 \
pnpm --filter @open-feedback-factory/worker dev
```

For CLI subscription auth, set `CODEX_AUTH_MODE=cli` and omit the API key.

## Persistent Host CLI Worker

Use this when the install should use the signed-in Codex CLI subscription on the
local machine. The helper detects macOS and Linux:

```bash
pnpm worker:install:host
pnpm worker:status:host
pnpm worker:uninstall:host
```

On macOS it writes a LaunchAgent. On Linux it writes a user systemd service. The
service sources the ignored `.env` file at startup, then sets worker-only
defaults such as `CODEX_RUNNER_MODE=codex`, `WORKER_RUN_ONCE=false`,
`RUNNER_WORKSPACE`, `WORKER_API_BASE_URL`, and `CODEX_SECRETS_PATH`.
If `.env` still contains the Docker-internal `WORKER_API_BASE_URL=http://api:4100`,
the host helper translates it to `http://localhost:4100`; custom host URLs are
left alone.

The generated service file does not copy API keys, GitHub App private keys, or
tokens out of `.env`. If `.env` changes, restart the host worker service. The
worker still reads live approval/auth settings from `/doctor` before each job.

To inspect without installing:

```bash
pnpm worker:print:host
```

Host worker logs are written to `.off/logs/host-worker.log` and
`.off/logs/host-worker.error.log`.

## Docker API-Key Worker

Use this when the install should keep the worker inside Docker and use a
server-side OpenAI API key.

1. Save the API key in the control center **Agent credentials** panel.
2. Set these values in `.env`:

```bash
CODEX_RUNNER_MODE=codex
CODEX_AUTH_MODE=api_key
DOCKER_CODEX_CLI=codex
CODEX_CLI_VERSION=0.141.0
```

3. Restart the worker:

```bash
docker compose up -d --build worker
```

To print the exact helper snippet:

```bash
pnpm worker:print:docker-api
```

Compose installs `@openai/codex` inside the API and worker containers when
runner mode is `codex`. `CODEX_CLI_VERSION` pins that container install.
`DOCKER_CODEX_CLI` is the container executable path; leave host-only Codex paths
in `CODEX_CLI` for the host worker lane.
Docker workers intentionally leave work queued in `cli` auth mode because they
cannot access host Codex subscription auth. Use the host worker for `cli` auth,
or switch the Docker worker to `api_key` auth.

## Auto Worker

Use this when approval mode is auto:

```bash
cd /path/to/open-feedback-factory

CODEX_RUNNER_MODE=codex \
CODEX_MANAGE_GIT=true \
GITHUB_CREATE_PR=true \
GITHUB_MODE=gh \
GITHUB_PR_BASE=codex/open-feedback-factory-v1 \
WORKER_API_BASE_URL=http://localhost:4100 \
RUNNER_WORKSPACE=/path/to/open-feedback-factory \
CODEX_SECRETS_PATH="$PWD/.off/secrets.env" \
CODEX_MODEL=gpt-5.5 \
CODEX_EFFORT=extra-high \
CODEX_TIMEOUT_MS=900000 \
pnpm --filter @open-feedback-factory/worker dev
```

The worker polls `/doctor` for live settings, polls `/runner/jobs/claim`, runs
`codex exec --json`, commits real
changes when `CODEX_MANAGE_GIT=true`, optionally opens a PR, records actual
token usage, records cost when pricing rates are configured, records assumptions
and skipped checks, and posts the run result back to the API.
Those records appear in the control center work-item evidence ledger alongside
GitHub artifacts, release proof, user notifications, and audit events.

The runner's final structured result must include:

- `outcome`;
- `summary`;
- `changedFiles`;
- `assumptions`;
- `checksRun`;
- `checksSkipped`;
- `costSummary`;
- `userMessage`.

If Codex fails before returning that shape, the worker records a failed run with
an unresolved merge-safety assumption and skipped-check note. If implementation
succeeds but PR publication fails, the work is also marked failed rather than
pretending a PR exists.

## Cost Capture

The runner captures Codex JSON usage totals. To convert usage into actual
dollars, configure:

```bash
CODEX_INPUT_USD_PER_1M=
CODEX_CACHED_INPUT_USD_PER_1M=
CODEX_OUTPUT_USD_PER_1M=
CODEX_REASONING_OUTPUT_USD_PER_1M=
```

Without these rates, the system stores real token totals but keeps the original
dollar estimate as a low-confidence amount.

## What Must Never Be Faked

- Do not mark work shipped unless it is released or explicitly marked by an
  operator.
- Do not create fake PR URLs, fake agent runs, fake costs, or fake releases.
- Do not expose raw feedback, private user data, API keys, or private agent
  output to GitHub issues or PRs.
- If a worker is not attached, say queued.
- If credentials are missing, say blocked and show the missing requirement.
- If GitHub is disabled, implement locally but do not pretend a PR exists.
- Do not omit assumptions. If an assumption affects privacy, cost, merge safety,
  or release status, block auto-merge until it is resolved.
