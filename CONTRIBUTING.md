# Contributing to Open Feedback Factory

Open Feedback Factory is product infrastructure for turning user feedback into
guarded agent work. Contributions should make that loop more truthful, safer,
or easier to operate.

## Before You Start

Read these first:

- [AGENTS.md](AGENTS.md)
- [docs/agent-install.md](docs/agent-install.md)
- [docs/governance.md](docs/governance.md)
- [docs/threat-model.md](docs/threat-model.md)
- [docs/implementation-status.md](docs/implementation-status.md)

If you are working on runner auth, GitHub, Railway, Vercel, provider routing,
secrets, security controls, or established library behavior, do a research
pass from primary sources before coding.

## What We Accept

Good contributions usually fit one of these lanes:

- product correctness: feedback, routing, status, release proof, user follow-up;
- safety: privacy, sanitization, credential handling, policy gates, rate limits;
- runner reliability: worker claim/complete, evidence capture, PR publication;
- operator clarity: control center states, docs, setup, install health;
- demo honesty: real SDK/app/PR/release proof, no fabricated artifacts;
- tests and regressions for discovered failure modes.

## Non-Negotiables

- Do not fake PRs, releases, shipped states, costs, agent runs, or user
  notifications.
- Do not expose raw user feedback, private app data, credentials, logs with
  secrets, or provider tokens.
- Do not bypass guardrails to make a demo look faster.
- Do not mark work `DONE` unless implementation and verification support it.
- Do not enable mutating integrations, public launch actions, or spend-bearing
  paths without explicit maintainer approval.

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm run doctor
git diff --check
```

For Postgres-backed tests:

```bash
TEST_DATABASE_URL=postgres://off:off@127.0.0.1:55432/open_feedback_factory pnpm --filter @open-feedback-factory/db test
```

Use focused tests while developing, then run the broader checks before opening a
PR. If a check cannot run, explain why in the PR.

## Pull Requests

Every PR should include:

- what changed;
- what proof was run;
- any assumptions or skipped alternatives;
- whether any privacy, cost, merge, release, or user-facing status behavior
  changed;
- known limits that remain partial.

Docs and status updates are part of the work when behavior changes. Keep
[docs/implementation-status.md](docs/implementation-status.md) honest, but do
not over-build it into the permanent source of truth.

## Maintainer Review

Maintainers review for:

- substance, not labels;
- leak risk;
- policy and security boundaries;
- test coverage proportional to risk;
- truthfulness of docs, UI copy, and status labels.

Trust-facing or demo-facing work may need a second product/honesty review before
merge.
