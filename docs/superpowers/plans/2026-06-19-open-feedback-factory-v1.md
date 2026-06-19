# Open Feedback Factory V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first internal dogfood version of Open Feedback Factory: a Docker Compose TypeScript monorepo with API/Postgres, web SDK, Daybook demo app, control center, Codex CLI runner seam, GitHub App integration seam, safe auto-merge policy, user follow-up statuses, feature usage attribution, tests, and local run commands.

**Current status:** Mostly implemented for local/internal dogfood. Deterministic
tests, typecheck, build, and GitHub CI are green. Remaining work is the durable
public SDK package path, clean SDK-less plant-care demo repo, hosted
control-plane to local-worker proof, real SDK-install PR from npm, and full
plant-app feedback-to-feature loop. See
[docs/implementation-status.md](../../implementation-status.md).

**Architecture:** Use a pnpm workspace with focused packages for core policy, database access, SDK, runner, API service, control center, and demo app. Keep raw feedback private in Postgres, send only sanitized summaries to GitHub/runner surfaces, and make the Daybook notepad/todo app exercise the same SDK/API path a real app would use. V1 runs locally through Docker Compose with implementation disabled by default or through the local Codex CLI monthly-subscription path when explicitly enabled.

**Tech Stack:** TypeScript, pnpm workspaces, Fastify, Postgres, node-postgres, Vite React, Node test runner, Docker Compose, GitHub CLI/API seam, Codex CLI seam.

## Global Constraints

- V1 is standalone and not HeyTelli-specific.
- V1 is internal dogfood before public release.
- Docker Compose is the primary install.
- Postgres is the only V1 database.
- Web SDK ships before mobile SDK.
- Codex is the only built-in runner.
- Direct Codex/OpenAI is the required model path; OpenRouter, Requesty, and Fusion remain optional adapters.
- Raw feedback stays private; GitHub, agents, PR comments, and user-facing messages use sanitized summaries.
- Auto-merge exists only for `safe_auto_merge`, explicitly enabled repos, allowed paths, clean checks, reviewer approval, and cost-cap compliance.
- Feature usage attribution is required in V1.
- Every planner, builder, reviewer, and release task must record assumptions, defaults chosen, alternatives skipped, checks not run, and unresolved human questions.
- If an assumption affects privacy, cost, merge safety, or release status, the work item must not auto-merge until it is resolved.

---

## File Structure

- `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`: workspace, scripts, and shared compiler settings.
- `.env.example`: all local configuration for API, Postgres, GitHub App, Codex runner mode, ports, and safety limits.
- `docker-compose.yml`: Postgres, API, worker, control center, and demo app services.
- `packages/core`: pure policy/domain logic: types, sanitizer, clustering, work router, cost model, statuses, auto-merge gates.
- `packages/db`: Postgres migration SQL and data access helpers.
- `packages/sdk`: browser SDK consumed by the demo app.
- `packages/runner`: Codex CLI runner implementation and GitHub client.
- `services/api`: Fastify API for SDK, admin console, GitHub webhooks, runner jobs, release markers, health, and doctor data.
- `apps/control-center`: Vite React operator console.
- `apps/demo-app`: Vite React Daybook notepad/todo app that submits feedback, reads status, and records feature usage.
- `scripts/doctor.mjs`: local environment and safety checker.
- `scripts/render-prd-html.mjs`: existing PRD renderer.
- `docs/v1-test-strategy.md`: required test matrix for implementation agents.

## Task 1: Workspace Scaffold And Runtime Configuration

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.env.example`
- Create: `docker-compose.yml`
- Create: `services/api/package.json`
- Create: `apps/control-center/package.json`
- Create: `apps/demo-app/package.json`
- Create: `packages/core/package.json`
- Create: `packages/db/package.json`
- Create: `packages/sdk/package.json`
- Create: `packages/runner/package.json`
- Modify: `README.md`

**Interfaces:**
- Produces root commands: `pnpm install`, `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm dev`, `pnpm docker:up`, `pnpm run doctor`.
- Produces service ports: API `4100`, control center `5173`, demo app `5174`, Postgres `55432`.

- [x] Create pnpm workspace files and package manifests.
- [x] Add Docker Compose with Postgres, API, worker, control center, and demo app.
- [x] Add `.env.example` with safe defaults and disabled real Codex/GitHub mutations by default.
- [x] Update README with local quickstart and the selected V1 ports.
- [x] Confirm the implementation tracks the required coverage in `docs/v1-test-strategy.md`.
- [x] Run `pnpm install`.
- [x] Run `pnpm typecheck` and verify the scaffold compiles.

## Task 2: Core Domain Logic

**Files:**
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/sanitize.ts`
- Create: `packages/core/src/cluster.ts`
- Create: `packages/core/src/router.ts`
- Create: `packages/core/src/cost.ts`
- Create: `packages/core/src/automerge.ts`
- Create: `packages/core/src/status.ts`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/src/*.test.ts`
- Modify: `packages/core/package.json`

**Interfaces:**
- Produces `sanitizeFeedback(input): SanitizedFeedback`.
- Produces `clusterKeyForFeedback(input): string`.
- Produces `routeFeedback(input): WorkRoutingDecision`.
- Produces `estimateFeatureCost(input): FeatureCostEstimate`.
- Produces `evaluateAutoMerge(input): AutoMergeEvaluation`.
- Produces `buildUserStatus(input): UserFeedbackStatus`.
- Produces `buildAssumptionRecord(input): AgentAssumptionRecord`.

- [x] Write tests for redaction of emails, phone numbers, obvious secrets, and raw screenshots/transcripts.
- [x] Write tests for deterministic clustering of phrasing variants like dark mode/color/theme requests.
- [x] Write tests for routing safe feature requests, blocked unsafe/private requests, and needs-more-signal requests.
- [x] Write tests for auto-merge gate failures and one passing safe lane.
- [x] Write tests that assumption records block auto-merge when they affect privacy, cost, merge safety, or release status.
- [x] Implement core logic until tests pass.
- [x] Run `pnpm --filter @open-feedback-factory/core test`.

## Task 3: Postgres Schema And Data Access

**Files:**
- Create: `packages/db/src/schema.sql`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/migrate.ts`
- Create: `packages/db/src/demoSeed.ts`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/src/client.test.ts`
- Modify: `packages/db/package.json`

**Interfaces:**
- Produces `migrateDatabase(databaseUrl): Promise<void>`.
- Produces `OpenFeedbackStore` with methods for feedback signals, clusters, work items, agent runs, assumption records, cost records, GitHub artifacts, release events, notifications, feature usage, policy configs, and audit events.

- [x] Add schema tables from the V1 design.
- [x] Implement migration runner using `pg`.
- [x] Implement store methods with JSONB metadata and timestamp normalization.
- [x] Persist agent assumptions on agent runs and expose unresolved assumptions on work items.
- [x] Add tests that run store logic against a temporary schema when `TEST_DATABASE_URL` is available and skip with a clear message otherwise.
- [x] Run `pnpm --filter @open-feedback-factory/db test`.

## Task 4: API Service

**Files:**
- Create: `services/api/src/app.ts`
- Create: `services/api/src/config.ts`
- Create: `services/api/src/server.ts`
- Create: `services/api/src/routes/sdk.ts`
- Create: `services/api/src/routes/admin.ts`
- Create: `services/api/src/routes/runner.ts`
- Create: `services/api/src/routes/github.ts`
- Create: `services/api/src/routes/health.ts`
- Create: `services/api/src/app.test.ts`
- Modify: `services/api/package.json`

**Interfaces:**
- Produces SDK endpoints:
  - `POST /sdk/feedback`
  - `GET /sdk/feedback/:id/status`
  - `POST /sdk/features/:featureId/usage`
- Produces admin endpoints:
  - `GET /admin/control-room`
  - `GET /admin/work-items/:id`
  - `POST /admin/work-items/:id/run`
  - `POST /admin/work-items/:id/release`
- Produces runner endpoints:
  - `POST /runner/jobs/claim`
  - `POST /runner/jobs/:id/complete`
- Produces GitHub endpoints:
  - `POST /github/webhook`
  - `GET /github/app/manifest`
- Produces `GET /health` and `GET /doctor`.

- [x] Write API tests using an in-memory store adapter for fast route verification.
- [x] Implement feedback ingestion with sanitization, routing, cost estimate, cluster/work item creation, and user-safe status.
- [x] Implement feature usage attribution endpoint.
- [x] Implement control-room snapshot endpoint with queues, costs, follow-ups, and usage counts.
- [x] Implement runner/release/admin mutation endpoints.
- [x] Implement GitHub App manifest endpoint and webhook receiver seam.
- [x] Run `pnpm --filter @open-feedback-factory/api test`.

## Task 5: Web SDK

**Files:**
- Create: `packages/sdk/src/client.ts`
- Create: `packages/sdk/src/index.ts`
- Create: `packages/sdk/src/client.test.ts`
- Modify: `packages/sdk/package.json`

**Interfaces:**
- Produces `createOpenFeedbackClient({ apiBaseUrl, userId, metadata })`.
- Produces client methods `submitFeedback`, `getFeedbackStatus`, and `trackFeatureUsage`.

- [x] Write SDK tests with a mocked `fetch`.
- [x] Implement privacy-safe payload construction.
- [x] Implement status and usage helpers.
- [x] Run `pnpm --filter @open-feedback-factory/sdk test`.

## Task 6: Runner And GitHub/Codex Seams

**Files:**
- Create: `packages/runner/src/types.ts`
- Create: `packages/runner/src/codexCliRunner.ts`
- Create: `packages/runner/src/githubClient.ts`
- Create: `packages/runner/src/index.ts`
- Create: `packages/runner/src/*.test.ts`
- Modify: `packages/runner/package.json`

**Interfaces:**
- Produces `CodexCliRunner.run(workItem): Promise<RunnerResult>`.
- Produces `GitHubClient` seam for issue, branch, PR, checks, merge, comments, and cleanup.

- [x] Write tests for disabled runner behavior and Codex CLI command construction.
- [x] Keep the default runner disabled so queued work cannot be reported as implemented.
- [x] Implement Codex CLI runner path using local `codex exec --json` with `cli` auth by default and `api_key` auth only when configured.
- [x] Require structured runner output to include `outcome`, `summary`, `assumptions`, `checksRun`, `checksSkipped`, `costSummary`, and `userMessage`.
- [x] Implement GitHub client seam for internal dogfood and GitHub App paths.
- [x] Run `pnpm --filter @open-feedback-factory/runner test`.

## Task 7: Toy Demo App

**Files:**
- Create: `apps/demo-app/index.html`
- Create: `apps/demo-app/src/App.tsx`
- Create: `apps/demo-app/src/main.tsx`
- Create: `apps/demo-app/src/styles.css`
- Create: `apps/demo-app/src/App.test.tsx`
- Modify: `apps/demo-app/package.json`

**Interfaces:**
- Consumes SDK client.
- Produces the positive demo feedback path and negative demo feedback path.
- Produces feature usage event for the shipped demo feature.

- [x] Build a real first-screen notepad/todo app, not a landing page.
- [x] Add feedback entry through the SDK launcher path.
- [x] Add status tracking through the SDK launcher path.
- [x] Add feature usage trigger for the demo feature.
- [x] Run `pnpm --filter @open-feedback-factory/demo-app test`.

## Task 8: Control Center

**Files:**
- Create: `apps/control-center/index.html`
- Create: `apps/control-center/src/App.tsx`
- Create: `apps/control-center/src/main.tsx`
- Create: `apps/control-center/src/styles.css`
- Create: `apps/control-center/src/App.test.tsx`
- Modify: `apps/control-center/package.json`

**Interfaces:**
- Consumes `/admin/control-room` and `/admin/work-items/:id`.
- Produces operator console for setup health, feedback inbox, queue, work items, agent runs, assumption records, PR/release status, costs, auto-merge state, follow-ups, and feature usage.

- [x] Build focused operator console with dense but readable sections.
- [x] Add setup health, queue, work items, agent runs, assumptions, cost, user follow-up, and feature usage panels.
- [x] Add run/release action buttons that call admin endpoints.
- [x] Run `pnpm --filter @open-feedback-factory/control-center test`.

## Task 9: Doctor, Demo Seed, And Local Verification

**Files:**
- Create: `scripts/doctor.mjs`
- Create: `scripts/demo-seed.mjs`
- Modify: `README.md`
- Modify: `docker-compose.yml`

**Interfaces:**
- Produces `pnpm run doctor`.
- Produces `pnpm demo:seed`.
- Produces documented local URLs.

- [x] Implement doctor checks for Node, pnpm, Docker, Codex CLI auth/version, gh auth, env vars, ports, migration state, and safe auto-merge config.
- [x] Implement demo seed command with clearly labeled sample states.
- [x] Run `pnpm run doctor`.
- [ ] Run `pnpm demo:seed` against local API in the current plant-demo cycle.
- [x] Run `pnpm test`, `pnpm typecheck`, and `pnpm build`.
- [ ] Run `docker compose up --build` and verify API, demo app, and control center URLs for the current cycle.
- [x] Verify dry-run demo never shows fake PRs, fake costs, fake releases, fake shipped states, or fake agent runs in deterministic tests and copy.
- [ ] Verify private dogfood mode blocks with explicit missing requirements until GitHub, Codex, cost settings, and release proof are truly configured in the plant-app demo.
- [x] Record which tests are deterministic CI tests and which are opt-in private dogfood tests.

## Task 10: Finish, Commit, Push, And Keep Goal Active If Not Fully Verified

**Files:**
- All changed files.

**Interfaces:**
- Produces pushed implementation branch and verification notes.

- [x] Run final gates for current main: `pnpm test`, `pnpm typecheck`, `pnpm build`, `git diff --check`.
- [ ] Run `pnpm run doctor` in the current cycle.
- [x] Confirm `docs/v1-test-strategy.md` coverage has explicit status markers.
- [x] Commit coherent implementation changes for the current mainline slices.
- [x] Push current mainline slices.
- [ ] Verify Docker Compose and local URLs for the current plant-demo cycle; keep remaining blockers explicit until verified.
