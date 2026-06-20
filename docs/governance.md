# Open-Source Governance

This document captures the governance starter set for Open Feedback Factory. It
is intentionally conservative: the repo is still private dogfood, so some public
launch choices remain held for Joe and future maintainers.

## Governance Status

| Area | Status | Notes |
| --- | --- | --- |
| Contribution guide | Present | See [CONTRIBUTING.md](../CONTRIBUTING.md) |
| Code of conduct | Present | See [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) |
| Security disclosure | Present | See [SECURITY.md](../SECURITY.md) |
| Issue templates | Present | See `.github/ISSUE_TEMPLATE` |
| PR template | Present | See `.github/PULL_REQUEST_TEMPLATE.md` |
| Threat model | Present | See [docs/threat-model.md](threat-model.md) |
| Safe agent patterns | Present | See this document and [AGENTS.md](../AGENTS.md) |
| Release notes | Starter | See [CHANGELOG.md](../CHANGELOG.md) |
| Public roadmap | Partial | Current live status is GitHub Issues/Projects; public roadmap waits for launch |
| License | Held | Do not add or assume a license until Joe chooses one |

## Maintainer Boundaries

Maintainers own:

- privacy, security, and credential boundaries;
- repository visibility and license choice;
- public launch and public communications;
- package publishing and public distribution;
- merge policy and release proof;
- access to hosted services and secrets;
- final calls on product scope and demo truthfulness.

Agents and contributors can prepare PRs, docs, tests, and staged configuration,
but should not execute irreversible or outward-facing actions without explicit
maintainer approval.

## Safe Agent Patterns

OFF should model the behavior it sells:

- verify substance before claiming a state is done;
- keep raw feedback private;
- pass only sanitized work items to GitHub and agent prompts;
- leave work queued or blocked when a worker, credential, repo scope, release
  proof, or user-notification channel is missing;
- record assumptions and learning artifacts;
- make cost and release status observable;
- keep demo data, preview data, live data, and generated artifacts clearly
  labeled.

Unsafe patterns are rejected even if they make a demo faster:

- fake PR links, fake releases, fake costs, fake shipped states, or fake user
  notifications;
- raw credential exposure in prompts, logs, docs, issues, or PRs;
- broad repo/app access when scoped access would work;
- agent execution that bypasses policy gates;
- auto-merge without durable review and release-proof gates.

## Issue Triage

Issues should be labeled and triaged by:

- product value and user demand;
- privacy or security impact;
- cost and blast radius;
- whether a live worker or integration is required;
- whether the request is safe for autonomous work;
- whether it needs human product judgment.

Rejected or not-planned decisions should include the reason and, when useful,
the demand threshold that would cause reconsideration.

## PR Review

PR review should confirm:

- implementation matches the issue;
- tests or verification match the risk;
- no secrets or raw feedback are exposed;
- docs/status copy does not overclaim;
- assumptions are recorded;
- partial work stays partial.

## Release Governance

Merged is not shipped. Shipped requires release proof appropriate to the target
app or deployment path.

Release notes should name:

- what changed;
- what proof exists;
- what is still partial;
- rollback or follow-up needs;
- user-facing status changes.

## Public Launch Holds

These remain held until explicitly approved:

- making the repo public;
- choosing or changing the license;
- public announcements;
- broad user invites;
- paid/spend-bearing hosted workers;
- production mutations for third-party services outside scoped control-plane
  tools.
