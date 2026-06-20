# Implementation Status

Last updated: 2026-06-20

This is a one-time baseline audit snapshot of what Open Feedback Factory has
actually built versus the PRD. The PRD is the product vision; this file captures
the current implementation reality so the team can stop relying on memory.

Do not over-build this Markdown file into the permanent live-status mechanism.
The durable live pattern should move to GitHub Issues and Projects: PRD
capabilities decompose into issues with acceptance criteria, PRs use
`Closes #N`, merges close issues, and the project board updates from real
workflow events.

For this audit, `DONE` must mean implemented and verified. `PARTIAL` must name
the exact gap. `NOT-STARTED` means no meaningful implementation exists.
`DEFERRED` means intentionally held for product, security, cost, or sequencing
reasons.

## Status Legend

- **DONE:** implemented, verified, and safe to describe as working.
- **PARTIAL:** partially implemented, blocked by a known gap, or not yet proven
  in the durable demo path.
- **NOT-STARTED:** planned but not implemented.
- **DEFERRED:** intentionally waiting for Joe's explicit go or a later release.

## Capability Matrix

| Feature / capability | Status | Notes | Last-touched |
| --- | --- | --- | --- |
| Product thesis and PRD | DONE | PRD exists and is rendered to HTML; it remains the aspirational vision, not the implementation audit snapshot | 2026-06-19 |
| Core sanitizer | DONE | Redacts private contact and obvious secret data in deterministic tests | 2026-06-19 |
| Core clustering and routing | DONE | Handles safe work, blocked/private work, needs-more-signal, repeated-demand promotion, and clarification questions | 2026-06-19 |
| User-facing status model | DONE | Supports planned, grouped, in-progress, implemented, shipped, not planned, already available, blocked, and needs-more-signal copy | 2026-06-19 |
| Cost estimates | DONE | Estimates exist in core/API; exact actual dollars require usage plus configured pricing | 2026-06-19 |
| Budget caps | DONE | API exposes and enforces per-work-item, daily, monthly, and per-run token budget caps before model spend | 2026-06-20 |
| Actual token/cost capture | PARTIAL | Runner parses Codex JSONL usage and can price when rates exist; live dogfood cost proof still needed for the next demo loop | 2026-06-19 |
| Assumption records | DONE | Assumptions can be stored, displayed, and can block auto-merge when unresolved safety/cost/release issues remain | 2026-06-19 |
| Learning records | PARTIAL | Data model and product rules exist; recursive improvement loop still needs richer control-center workflows and eval feedback | 2026-06-19 |
| Postgres schema and store | DONE | Store tests and Postgres-backed integration tests pass, including cleanup behavior | 2026-06-19 |
| RLS / workspace isolation tests | DONE | Postgres integration tests verify RLS scaffolding and cross-workspace blocking | 2026-06-19 |
| SDK feedback API | DONE | Browser SDK can submit feedback, read status, and record feature usage | 2026-06-19 |
| SDK floating launcher | DONE | Real launcher opens in-app UI and shows user-visible tracking receipt without control-center access | 2026-06-19 |
| SDK public npm distribution | PARTIAL | Package metadata, `dist` exports, README, `npm pack --dry-run`, and local tarball import proof are prepared; actual `npm publish --access public` is held for Joe | 2026-06-20 |
| SDK CDN distribution | NOT-STARTED | Planned option only | 2026-06-19 |
| API service | DONE | SDK, admin, runner, GitHub, health, doctor, release, rate-limit, and guardrail tests pass | 2026-06-19 |
| Admin token gate | DONE | `/admin/*` requires token when configured and `/doctor` never exposes token values | 2026-06-19 |
| Runner token gate | DONE | `/runner/*` requires token when configured and worker sends configured token | 2026-06-19 |
| Public rate limits | DONE | SDK/admin/runner/GitHub route groups have deterministic tests | 2026-06-19 |
| Control center core UI | DONE | Operator UI shows setup, lifecycle, queue, cost, worker connection liveness, Codex auth lanes, and honest states | 2026-06-19 |
| Control center final plant-app onboarding UI | PARTIAL | Existing UI needs the clean plant-care repo flow, SDK-missing detection, and install-PR status proof | 2026-06-19 |
| Realtime / no-refresh control center behavior | PARTIAL | Current UI is improved; final realtime lifecycle proof for plant-app demo still needed | 2026-06-19 |
| GitHub App manifest/setup/webhook seam | DONE | Manifest, localhost/public tunnel behavior, callback, webhooks, signature verification, and artifact storage are tested | 2026-06-19 |
| GitHub App scoped live demo install | PARTIAL | Backend/admin repo-scope verification is tested via `/admin/github/repositories`; SDK-install handoff also verifies target repo access before proceeding; still needs live proof that the final plant-care demo repo is the scoped installation target before mutation | 2026-06-20 |
| Sanitized GitHub issue creation | DONE | API/runner tests cover sanitized issue bodies and duplicate prevention | 2026-06-19 |
| Branch and PR creation | PARTIAL | Runner/GitHub client seams exist; next durable proof is a real SDK-install PR in the clean plant-care repo | 2026-06-19 |
| Branch cleanup | DONE | GitHub client branch cleanup path is tested | 2026-06-19 |
| Codex CLI runner | DONE | Runner builds `codex exec --json` args, parses structured JSONL, captures usage, and handles disabled/missing CLI states honestly | 2026-06-19 |
| Local subscription worker | PARTIAL | Host worker path exists, sends token-gated heartbeats, and `/doctor` / control center expose online/stale/offline worker liveness plus the trusted host worker + `codex login --device-auth` path; hosted-control-plane to local-worker claim still needs `RUNNER_TOKEN` sync and live proof | 2026-06-19 |
| Hosted API-key worker | DEFERRED | Supported as a paid/managed future lane and shown as the OpenAI API-key path, but not default alpha path because Joe wants subscription/free local worker path first | 2026-06-19 |
| Delegated Codex subscription auth for hosted workers | NOT-STARTED | `/doctor` / control center explicitly state this is not supported without a trusted runner or provider-supported delegated token path; do not imply hosted Plus/Pro subscription delegation exists | 2026-06-19 |
| Safe auto-merge policy | DONE | Guardrail policy, protected paths, diff/check/provenance/cost assumptions, and reviewer-decision requirements are tested | 2026-06-19 |
| Explicit merge modes | DONE | `merge_mode` is persisted, visible in doctor/control center, defaults to implement-only, and auto-merge requires `agent_reviewed_auto_merge` plus every guardrail | 2026-06-20 |
| Public/demo auto-merge | DEFERRED | Must wait for full review, release, rollback, and user-status proof gates | 2026-06-19 |
| Release marker | DONE | API can mark implemented work released and update user status after proof | 2026-06-19 |
| Automatic deployment/release detection | PARTIAL | Product rule exists; V1 still relies on explicit release marker unless app-specific deployment proof is added | 2026-06-19 |
| User notification / follow-up endpoint | DONE | User-safe statuses are returned and admin not-planned/blocked decisions update matching requesters | 2026-06-19 |
| Outbound email/SMS/webhook notifications | NOT-STARTED | Later integration work | 2026-06-19 |
| Feature usage attribution | DONE | SDK and API can record usage events and control-center counts | 2026-06-19 |
| Daybook local demo app | DONE | Real local demo app exercises SDK/API path | 2026-06-19 |
| LaunchBrief proof app | DONE | Live app uses the real SDK at runtime; this is proof only, not the final demo concept | 2026-06-19 |
| Final plant-care demo app | DONE | Sprout exists at `https://sprout-demo-chi.vercel.app`, starts SDK-less, and was live-gated across Today, My Plants, and detail views | 2026-06-20 |
| OFF SDK-install PR demo | PARTIAL | Clean Sprout repo exists, `@open-feedback-factory/sdk@0.1.0` is published, Sprout repo access is verified, and backend handoff queues a real work item plus sanitized GitHub issue; durable proof still requires a live worker-created SDK-install PR | 2026-06-20 |
| Full plant-app feedback-to-feature demo | NOT-STARTED | Needs repo connect, SDK-install PR, merge/redeploy, beta feedback, agent PR, release proof, user status, and usage attribution | 2026-06-19 |
| Hosted landing page | DONE | `openfeedbackfactory.com` is live with current OFF brand | 2026-06-19 |
| Hosted API/control center stack | PARTIAL | Hosted services exist; SDK-install claim includes target-repo metadata and worker blocks repo mismatches; final demo still needs plant-app flow and local-worker claim proof | 2026-06-20 |
| Docker Compose local install | PARTIAL | Compose files and docs exist; current cycle still needs fresh end-to-end smoke after plant-demo changes | 2026-06-19 |
| Agent install docs | PARTIAL | Existing docs work for local setup; need npm SDK and plant-demo updates once package path is real | 2026-06-19 |
| Secrets vault / third-party credential storage | PARTIAL | Rules and masked storage paths exist for Codex key; generalized Supabase/Vercel/Resend scoped secrets vault is not done | 2026-06-19 |
| Playbook / methodology packs | PARTIAL | Product rules exist; richer in-product agent playbook management is not complete | 2026-06-19 |
| OpenRouter / Requesty routing | DEFERRED | PRD contains adapter direction; V1 built-in runner remains Codex-only | 2026-06-19 |
| Mobile SDKs | NOT-STARTED | Web SDK first | 2026-06-19 |
| Hosted multi-user alpha | NOT-STARTED | Later than private demo | 2026-06-19 |
| Public open-source launch | DEFERRED | Wait for Joe's explicit go | 2026-06-19 |

## Current Demo Direction

LaunchBrief proved that the real SDK can run in a live app, but it is not the
final demo concept. It is too close to OFF's own product domain and makes the
story harder to understand.

The current durable demo app is Sprout, a clean, SDK-less plant-care app in a
separate repo.
The demo story is:

1. A developer connects the clean Sprout repo to OFF.
2. OFF detects that the SDK is missing.
3. OFF opens a real SDK-install PR using the public npm package.
4. The developer merges the PR and the app redeploys with the launcher.
5. A beta user requests a plant-care feature, such as a humidity tracker.
6. OFF sanitizes, routes, estimates, builds, opens a PR, records assumptions and
   costs, waits for release proof, and updates the user-facing status.

Until the SDK is actually published to npm, any SDK-install demo using a private
git dependency or prebuilt Vercel deploy must be labeled interim.
