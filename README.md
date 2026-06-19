# Open Feedback Factory

Open Feedback Factory is a standalone feedback-to-feature control plane for
indie developers and small teams.

The goal is simple: let users request improvements from inside an app, turn
safe requests into sanitized GitHub issues, let agents implement tightly
guarded work, track cost, ship through PRs, notify users what happened, and
measure whether shipped features get used.

V1 is an internal dogfood build. It is designed as an open-source product, but
the first implementation should prove the loop privately before public launch.

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

Seed the local loop after the stack is up:

```bash
pnpm demo:seed
```

The Docker stack starts Postgres, the API, the worker, the control center, and
the toy app. The worker polls `/runner/jobs/claim`, runs the configured runner,
and posts results back to `/runner/jobs/:id/complete`.

Safety defaults:

- real auto-merge is disabled by default;
- GitHub mutations are disabled by default;
- runner mode defaults to deterministic demo mode;
- Codex CLI mode uses the local Codex subscription/auth path instead of an
  OpenAI API key.

## Runner Modes

`CODEX_RUNNER_MODE=demo` is the default. It produces deterministic agent runs,
actual-cost records, and user follow-up statuses without changing GitHub.

`CODEX_RUNNER_MODE=codex` uses `codex exec --json` through the local Codex CLI
auth/subscription path. For local dogfood, run the worker on the host with
`pnpm --filter @open-feedback-factory/worker dev` so it can use your installed
Codex CLI.

`CODEX_MANAGE_GIT=true` lets the Codex runner create a work branch before it
runs. `GITHUB_CREATE_PR=true` plus `GITHUB_MODE=gh` lets the worker push that
branch and open a pull request after a successful Codex run.

Set the optional `CODEX_*_USD_PER_1M` rate variables to convert captured Codex
JSON usage totals into actual dollar cost records. Without rates, V1 records
actual tokens and keeps the configured estimate as the dollar amount.

## GitHub Modes

`GITHUB_MODE=disabled` is the default.

`GITHUB_MODE=gh` enables internal dogfood mutations through the GitHub CLI. In
that mode, newly accepted sanitized feedback can create a GitHub issue and store
the URL on the work item. Safe auto-merge still requires every gate to pass:
safe risk tier, trusted branch, reviewer approval, passing checks, release
health, cost cap, allowed paths, and an attached PR URL.

`GITHUB_MODE=app` is reserved for the installable GitHub App path. The API
already exposes `/github/app/manifest` and `/github/webhook` as the V1
integration seam.

## CI And Safe Merge

The default GitHub Actions workflow runs tests, typecheck, build, and the
Postgres-backed DB integration test on pull requests. Safe auto-merge depends
on that check lane plus the Open Feedback Factory policy gates; it is disabled
until `AUTO_MERGE_ENABLED=true` and GitHub mutation mode are explicitly set.

## Docs

- [PRD](docs/feedback-to-feature-platform-prd.md)
- [Polished PRD HTML](docs/feedback-to-feature-platform-prd.html)
- [V1 design](docs/superpowers/specs/2026-06-19-open-feedback-factory-v1-design.md)
- [Implementation plan](docs/superpowers/plans/2026-06-19-open-feedback-factory-v1.md)
