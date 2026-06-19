# Agent Instructions

Open Feedback Factory is a feedback-to-feature control plane for indie
developers and small teams. Treat it as product infrastructure, not as a demo
toy: the loop is user feedback -> private database -> sanitized work item ->
guarded agent work -> PR/release proof -> user-visible outcome.

## Start Here

If you are an agent installing or evaluating this repo from GitHub, follow
[docs/agent-install.md](docs/agent-install.md).

Default local URLs:

- API: `http://localhost:4100`
- Control center: `http://localhost:5173`
- Demo app: `http://localhost:5174`
- Postgres: `localhost:55432`

## Safety Rules

- Do not commit `.env`, private keys, GitHub App PEMs, access tokens, database
  dumps, raw feedback exports, or local logs that may contain secrets.
- Keep raw user feedback private. Only sanitized summaries should reach GitHub,
  PR bodies, issue bodies, or agent prompts.
- Do not enable `AUTO_MERGE_ENABLED=true`, `GITHUB_CREATE_PR=true`, or mutating
  GitHub modes unless the user explicitly asks for live mutation.
- Do not bypass guardrails. Safe auto-merge requires the policy gates in
  `packages/core`.
- Do not run destructive git commands unless the user explicitly asks for them.

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

Local `localhost` installs intentionally use a disabled placeholder webhook and
subscribe to no GitHub webhook events. To test webhooks, set `PUBLIC_BASE_URL`
to an HTTPS tunnel or deployed URL before starting the wizard.

## Codex Runner Path

`CODEX_RUNNER_MODE=demo` is the safe default.

For a real local Codex subscription run, prefer running the worker on the host
so it can use the signed-in Codex CLI:

```bash
docker compose stop worker
pnpm --filter @open-feedback-factory/worker dev
```

Use `WORKER_WORK_ITEM_ID=work_...` and `WORKER_RUN_ONCE=true` for targeted
smoke tests.

## Codebase Map

- `packages/core`: sanitization, routing, user statuses, guardrail policy.
- `packages/db`: Postgres schema/store.
- `packages/sdk`: app-facing web SDK.
- `packages/runner`: demo runner, Codex CLI runner, GitHub client.
- `services/api`: Fastify API, GitHub App routes, admin/runner endpoints.
- `services/worker`: polling worker loop.
- `apps/control-center`: operator dashboard.
- `apps/demo-app`: sample app that submits feedback and usage events.
