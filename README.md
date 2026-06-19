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

Safety defaults:

- real auto-merge is disabled by default;
- GitHub mutations are disabled by default;
- runner mode defaults to deterministic demo mode;
- Codex CLI mode uses the local Codex subscription/auth path instead of an
  OpenAI API key.

## Docs

- [PRD](docs/feedback-to-feature-platform-prd.md)
- [Polished PRD HTML](docs/feedback-to-feature-platform-prd.html)
- [V1 design](docs/superpowers/specs/2026-06-19-open-feedback-factory-v1-design.md)
- [Implementation plan](docs/superpowers/plans/2026-06-19-open-feedback-factory-v1.md)
