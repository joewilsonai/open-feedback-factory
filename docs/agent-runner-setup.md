# Agent Runner Setup

Open Feedback Factory separates feedback intake from code execution. Feedback
can be collected while the runner is paused. Work is implemented only when a
real Codex worker is attached.

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

## Approval Modes

`manual` means feedback queues until an operator runs one selected work item.
Use this for first installs, demos, and risky repos.

`auto` means an attached live worker can claim queued work without a specific
`WORKER_WORK_ITEM_ID`. Auto mode does not create a worker by itself. It only
allows a running worker to claim work.

## Codex Auth Modes

`cli` uses the signed-in Codex CLI subscription path on the worker machine.

`api_key` uses a server-side OpenAI API key. The control center saves the key to
`CODEX_SECRETS_PATH`, defaulting to `.off/secrets.env` for direct local runs and
`/workspace/.off/secrets.env` in Docker Compose. This path is ignored by git.
The key is masked in the UI and is never returned to the browser. The worker
injects it only into the Codex process for API-key runs.

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
RUNNER_WORKSPACE=/path/to/open-feedback-factory \
CODEX_SECRETS_PATH="$PWD/.off/secrets.env" \
CODEX_MODEL=gpt-5.5 \
CODEX_EFFORT=extra-high \
CODEX_TIMEOUT_MS=900000 \
pnpm --filter @open-feedback-factory/worker dev
```

For CLI subscription auth, set `CODEX_AUTH_MODE=cli` and omit the API key.

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
