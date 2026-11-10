# Open Feedback Factory

**Your users ask for things inside your app. Open Feedback Factory turns those asks into guarded pull requests, and tells each user what happened.**

Built for indie developers and small teams who want a coding agent working their feedback queue without handing it the keys.

## How it works

1. **Capture.** Your app embeds a small browser SDK. Users send feedback from a floating launcher and can watch its status from the same widget.
2. **Sanitize.** Emails, phone numbers, keys, tokens and private keys are redacted before anything is stored. Feedback that carried a secret is blocked outright.
3. **Route.** Feedback is grouped with similar requests, given a risk tier and a cost estimate, and either queued as work, held until enough people ask, sent back with clarifying questions, or blocked.
4. **Build.** A worker you run claims a queued item and hands the Codex CLI the sanitized summary only. Codex makes the change on its own branch and the worker opens a pull request.
5. **Gate.** A reviewer decision is recorded on the work item, CI runs on the pull request, and a merge only happens when every policy gate passes. Auto-merge is off until you turn it on.
6. **Close the loop.** Work is only `shipped` once a release is recorded. Then the user who asked sees it in the widget, and feature usage is attributed back to the request.

```mermaid
flowchart LR
    A[User asks in your app] --> B[Sanitize<br/>redact or block]
    B --> C{Route}
    C -->|blocked or protected| X[Told why, in the widget]
    C -->|not enough demand yet| M[Demand memory keeps counting]
    M --> C
    C -->|safe to build| D[Worker runs Codex<br/>on a fresh branch]
    D --> E[Pull request + CI]
    E --> F{Review + policy gates}
    F -->|pass| G[Merge, record release]
    F -->|fail| H[Stays blocked, reasons shown]
    G --> I[User sees Shipped]
```

## What makes it different

**It says no out loud.** Most of the work is deciding what not to build. Secret-bearing feedback never reaches GitHub or an agent. Requests that touch auth, billing, privacy, legal, encryption or bulk export are blocked for human product review. Low-demand requests wait in demand memory until enough people ask. In every case the user gets a plain answer instead of silence.

**Safety is a design rule, not a setting.**

- Raw feedback stays in your database. Agents, GitHub issues and the optional clustering model only ever see the sanitized text.
- The merge gate reads its evidence from stored runner output or live GitHub data, never from fields a caller sends in a request.
- A recorded reviewer approval is required. Passing `reviewerApproved: true` in a one-off request does nothing.
- Unresolved assumptions that touch privacy, cost, merge safety or release status block auto-merge until someone resolves them.
- Merged is not shipped. The release endpoint refuses work that is still planned or in progress.

**You stay in charge.** Out of the box the stack runs in its most conservative shape:

| Waits for you by default | Runs on its own |
| --- | --- |
| Starting work on an item (`APPROVAL_MODE=manual`) | Sanitizing, clustering and routing new feedback |
| Any code execution (`CODEX_RUNNER_MODE=disabled`) | Telling users their request was received, grouped, held or blocked |
| Any GitHub write (`GITHUB_MODE=disabled`) | Counting demand on held requests |
| Any merge (`AUTO_MERGE_ENABLED=false`, `MERGE_MODE=implement_only`) | Enforcing cost caps before model spend |
| Marking work shipped (an explicit release marker) | Rate limiting every route group |

Turn each one on when you trust it. `AUTO_MERGE_ENABLED=false` stays a hard kill switch even if the policy in the control center allows auto-merge.

**It never fakes progress.** If the runner, GitHub or a release is not configured, the control center shows queued, blocked or needs-configuration states and the exact thing that is missing. The sample seed creates real feedback records only. It does not invent pull requests, costs, agent runs or releases.

## Quick start

You need Node 24 or newer (CI uses 24), pnpm 10.28.1 and a Postgres database you control.

```bash
git clone https://github.com/joewilsonai/open-feedback-factory.git
cd open-feedback-factory
pnpm install

# Point the stack at your Postgres, then create the schema.
export DATABASE_URL=postgres://off:off@127.0.0.1:55432/open_feedback_factory
pnpm db:migrate

# API, worker, control center and demo app together.
pnpm dev
```

In a second terminal, add sample data:

```bash
pnpm demo:seed
```

Then open:

| What | Where |
| --- | --- |
| Control center | http://localhost:5173/ops/ |
| Demo app (Daybook, a notes and todo app using the SDK) | http://localhost:5174 |
| API | http://localhost:4100 (try `/health` and `/doctor`) |

The seed sends three requests through the real SDK path. Two become queued work items. The third ("Export every private note and email it to me") is blocked as a protected-area request, which is the point. `pnpm demo:reset` clears sample rows again.

You can watch the sanitizer work directly:

```bash
curl -s localhost:4100/sdk/feedback \
  -H 'content-type: application/json' \
  -d '{"message":"login fails, my api_key=abc123secretvalue","source":"curl","userId":"sample-user"}'
```

The response says `"state":"blocked"` with the message the user would see: it included secret-looking details and will not be sent to GitHub or an agent.

There is also a Docker Compose stack in [docker-compose.yml](docker-compose.yml) that starts Postgres, the API, the worker, the control center and the demo app together, with `.env.example` as its starting config.

### Checks

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm run doctor
```

Set `TEST_DATABASE_URL` to a throwaway Postgres database to include the Postgres-backed tests, which cover the store and row-level workspace isolation. `pnpm run doctor` checks your config, ports and the running API, and reports what is safe to expose.

## Connect your app

The SDK is published on npm as [`@open-feedback-factory/sdk`](https://www.npmjs.com/package/@open-feedback-factory/sdk).

```bash
pnpm add @open-feedback-factory/sdk
```

Mount the launcher:

```ts
import {
  createOpenFeedbackClient,
  mountFeedbackLauncher,
} from "@open-feedback-factory/sdk";

const client = createOpenFeedbackClient({
  apiBaseUrl: "https://off-api.example.com", // your Open Feedback Factory API
  userId: currentUser.id,
  metadata: { appVersion: "1.4.0", platform: "web" },
});

const launcher = mountFeedbackLauncher({
  client,
  title: "Suggest an improvement",
  description: "Tell us what would make this app better.",
  suggestions: [
    { label: "Add dark mode", message: "I'd like a dark theme." },
  ],
});

// When your app unmounts the surface:
launcher.destroy();
```

The launcher submits feedback, remembers the latest request in browser storage, polls its status while open, and asks plain-language follow-up questions when the backend needs more detail.

You can also call the client directly:

```ts
const { feedbackId, status } = await client.submitFeedback({
  message: "Let me filter plants by room.",
});

await client.getFeedbackStatus(feedbackId);

// After a feature ships, record that people use it.
await client.trackFeatureUsage({ featureId: "room-filter", action: "opened" });
```

Usage events are attributed to the shipped work item and the cluster of people who asked for it, without exposing anyone's raw feedback.

The client drops metadata keys that look like transcripts, screenshots, passwords, tokens or secrets, and only sends primitive values. Even so, keep private user content, credentials and raw logs out of metadata. More in the [SDK README](packages/sdk/README.md).

## Architecture

A pnpm TypeScript workspace.

| Path | What it is |
| --- | --- |
| `packages/sdk` | Browser client and floating launcher. Published to npm. |
| `packages/core` | The rules: sanitizer, clusterer, router, user statuses, cost estimates, the auto-merge gate, assumption checks, agent playbooks. |
| `packages/db` | Postgres schema, store, migrations, sample seed and reset, row-level workspace isolation. |
| `packages/runner` | Codex CLI runner (sandbox mode, network off by default, command allow and deny rules) and the GitHub client. |
| `services/api` | Fastify API: `/sdk` for apps, `/admin` for the owner, `/runner` for workers, `/github` for the GitHub App, plus `/doctor` and `/health`. |
| `services/worker` | Polls `/runner/jobs/claim`, runs Codex, optionally pushes a branch and opens a pull request, then reports to `/runner/jobs/:id/complete`. |
| `apps/control-center` | The owner console: queue, demand memory, evidence ledger, policy settings, GitHub App setup, readiness. |
| `apps/demo-app` | Daybook, a small notes and todo app wired to the SDK. |
| `apps/landing` | The landing page. |
| `templates/github-actions` | A manual, one-item worker you can run in GitHub Actions with an API key. |

### Running a real worker

The worker uses the Codex CLI. Two ways to authenticate it:

- **Your Codex subscription, on your machine.** Run the worker on the host so it can use your signed-in CLI. `pnpm worker:install:host` installs it as a macOS LaunchAgent or Linux user service that reads your `.env` at startup without copying secrets into the service file.
- **An OpenAI API key.** Save the key from the control center. It is stored server-side and never echoed back to the browser. The worker injects it into the Codex process only in `api_key` mode.

Then set `CODEX_RUNNER_MODE=codex`, which is the explicit opt-in to running code. Add `CODEX_MANAGE_GIT=true` for a fresh branch per run, and `GITHUB_CREATE_PR=true` with a GitHub mode to open pull requests. Full setup is in [docs/agent-runner-setup.md](docs/agent-runner-setup.md).

### GitHub

`GITHUB_MODE=app` is the installable path. The control center has a GitHub App wizard that uses GitHub's manifest flow, so registration is a confirmation screen rather than a form. GitHub will not create a manifest App from `localhost`, so expose the stack through a tunnel first (`pnpm run tunnel:tailscale` refuses to run until admin and runner tokens are set). `GET /admin/github/repositories` confirms which repositories the installation can see. Webhook deliveries are deduplicated by delivery id.

`GITHUB_MODE=gh` uses the GitHub CLI and is meant for dogfooding.

## Safety model

| Layer | What happens |
| --- | --- |
| Intake | Messages are redacted for emails, phone numbers, API keys, `key=value` secrets and PEM private keys. Only allow-listed metadata keys with primitive values are kept. |
| Routing | Any secret blocks the request entirely. Protected product areas are blocked for human review. Unclear requests get clarifying questions instead of agent work. |
| External models | Optional semantic clustering (off until `ANTHROPIC_API_KEY` is set) sees only sanitized text, never blocked or protected-area feedback, and falls back to deterministic keys on any error or timeout. |
| Agent | Codex gets the sanitized summary, a sandbox mode, network access off unless you enable it, and command rules you control. It is told not to commit, push or open pull requests itself. |
| Spend | Per-item, daily and monthly dollar caps and a per-run token cap are checked before any model time is spent. Over-budget work stays queued. |
| Merge | Every one of these must pass: auto-merge enabled, a merge mode that allows it, the `safe_auto_merge` risk tier, a runner-created branch, passing checks, recorded reviewer approval, healthy release state, a diff under the size cap, cost under the cap, no blocking assumptions, and no protected paths touched. |
| Access | `ADMIN_TOKEN` protects `/admin/*`; scoped viewer, operator and admin tokens are supported. `RUNNER_TOKEN` protects `/runner/*`. Set both before anything leaves localhost. |
| Proof | Every work item has an evidence ledger: agent runs, cost estimates and actuals, assumptions, GitHub artifacts, review decisions, release markers, user notifications and feature usage. |

Deeper reading: [threat model](docs/threat-model.md), [security policy](SECURITY.md), [governance](docs/governance.md).

## Configuration

Everything is environment variables, documented in [.env.example](.env.example). The ones you will touch first:

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | none | Postgres connection for the API. |
| `APPROVAL_MODE` | `manual` | `auto` lets a live worker claim safe queued work without you picking it. |
| `CODEX_RUNNER_MODE` | `disabled` | `codex` runs real code. |
| `CODEX_AUTH_MODE` | `cli` | `cli` for your subscription, `api_key` for a saved key. |
| `GITHUB_MODE` | `disabled` | `app` or `gh`. |
| `MERGE_MODE` | `implement_only` | Stop at the pull request. |
| `AUTO_MERGE_ENABLED` | `false` | Hard kill switch for merges. |
| `MAX_FEATURE_COST_USD` | `5` | Per-item cap. Daily and monthly caps sit beside it. |
| `MAX_SAFE_DIFF_LINES` | `120` | Larger diffs never auto-merge. |
| `PROTECTED_PATHS` | auth, billing, privacy, legal, ... | Path fragments that block auto-merge. |
| `WORK_CADENCE_MODE` | `immediate` | `threshold` waits for repeat asks; `scheduled` batches work into a window. |

The control center can change approval mode, Codex auth, cost caps, merge guardrails and work cadence at runtime. The worker reads live settings from `/doctor` before every claim.

## Status

This is an early alpha, version 0.1.0. Be clear-eyed about what that means:

- The SDK is on npm. The API, worker, runner, control center and gates are implemented and covered by tests that run in CI.
- The full loop from a user's request to a released, attributed feature has more proof to collect in the open. [docs/implementation-status.md](docs/implementation-status.md) lists what is done, partial and not started, and why.
- The hosted stack is private. Self-hosting is the way to try it today.
- Codex is the only built-in runner.
- There are no stable public releases, and no license has been chosen yet.

## On the way

These are built on an unreleased branch and are not part of `main` yet. They will land here when they are ready.

- **A product take before any code.** The fixer writes down what was asked, what the bare minimum would be, and what the better version is, then builds the better version inside the request's area. Each app can set its own taste notes, and bigger ideas become tickets for the owner rather than scope creep.
- **Apps that report their own errors.** An SDK call for crash and error reporting, one ticket per cause with a count and first and last seen, and a cause that comes back after its fix reopens.
- **An owner board.** Lanes for just in, waiting, being fixed, review and shipped, with the live steps of a fix in progress and why a failed fix failed.
- **A lane that ships and watches.** A fix gets an independent review, has to pass every gate, lands on its own, and is watched after release, with an automatic rollback if new errors appear. A fix that cannot pass is held with the reasons shown, and never blocks the rest.
- **Whole-payload checks and warnings that stick.** Everything a tester or an agent writes is checked whole for credentials and personal details at every boundary before it is stored or sent, and any work that ever carried a warning keeps it and cannot ship on its own.
- **Several apps on one install**, and capped retries for failed fixes.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) first. The short version: make the loop more truthful, safer or easier to operate, never fake a pull request, release, cost or shipped state, and say what you ran to prove a change. Pointing a coding agent at this repo? Start it on [AGENTS.md](AGENTS.md) and [docs/agent-install.md](docs/agent-install.md).

Please report vulnerabilities privately as described in [SECURITY.md](SECURITY.md), not in a public issue. Conduct expectations are in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Docs

- [Agent install guide](docs/agent-install.md) and [runner setup](docs/agent-runner-setup.md)
- [GitHub Actions worker](docs/github-actions-runner.md)
- [Hosted deployment](docs/hosted-deployment.md) and [hosted demo alpha](docs/hosted-demo-alpha.md)
- [Threat model](docs/threat-model.md) and [governance](docs/governance.md)
- [Implementation status](docs/implementation-status.md), [V1 test strategy](docs/v1-test-strategy.md), [V1 dogfood checklist](docs/v1-dogfood-build-checklist.md)
- [Product requirements](docs/feedback-to-feature-platform-prd.md), [V1 design](docs/superpowers/specs/2026-06-19-open-feedback-factory-v1-design.md), [implementation plan](docs/superpowers/plans/2026-06-19-open-feedback-factory-v1.md)
