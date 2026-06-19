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

## Docs

- [PRD](docs/feedback-to-feature-platform-prd.md)
- [Polished PRD HTML](docs/feedback-to-feature-platform-prd.html)
- [V1 design](docs/superpowers/specs/2026-06-19-open-feedback-factory-v1-design.md)
