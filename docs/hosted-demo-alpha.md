# Hosted Demo Alpha

Hosted Demo Alpha is the near-term demo path for Open Feedback Factory.

The goal is not multi-user hosted alpha yet. The goal is a polished, truthful,
repo-connected demo that shows the product loop with controlled internal repos
and real infrastructure.

See [Implementation Status](implementation-status.md) for the current canonical
DONE / PARTIAL / NOT-STARTED / DEFERRED map.

## Demo Surfaces

| Surface | URL | Purpose |
| --- | --- | --- |
| Landing | `https://openfeedbackfactory.com` | Public narrative and entry point |
| Control center | `https://app.openfeedbackfactory.com/ops/` | Operator view for the lifecycle |
| API | `https://api.openfeedbackfactory.com` | Feedback, admin, runner, and GitHub APIs |
| Current proof app | `https://launchbrief-demo.vercel.app` | Verified real-SDK proof; not the final demo concept |
| Current proof app repo | `https://github.com/joewilsonai/launchbrief-demo` | Real repo that currently imports the SDK |
| Next demo app | `https://sprout-demo-chi.vercel.app` | Clean SDK-less consumer app that stands in for a user's product |
| Next demo app repo | `https://github.com/joewilsonai/sprout-demo` | Real repo OFF should connect, inspect, and mutate |

## Important Constraint

The durable demo app must intentionally start without the Open Feedback Factory
SDK.

That is the demo. OFF should connect to the repo, inspect it, and create a real
PR that installs the SDK launcher. The demo should not start from an app that is
already wired to OFF, because that hides the most important onboarding moment.

LaunchBrief has now served as a real-SDK proof, but it is not the final demo
target. Sprout is the current clean plant-care app: clearly consumer, clearly
labeled as a sample stand-in for a user's product, and de-emphasized so OFF
remains the star.

## Demo Story

1. Open the clean plant-care sample app.
2. Show it is a normal consumer app: plant list, watering reminders, plant
   notes, no OFF feedback launcher.
3. Open the OFF control center.
4. Show the hosted demo panel: plant app, plant repo, SDK missing, GitHub App
   state, worker state, and next action.
5. Connect the plant repo through the OFF GitHub App.
6. Approve a work item to install the SDK launcher.
7. OFF creates a sanitized GitHub issue or directly creates a branch/PR,
   depending on the configured lane.
8. The worker installs the SDK launcher and opens a PR.
9. The operator reviews/merges the PR.
10. Sprout redeploys.
11. The user submits real feedback through the newly installed launcher.
12. The control center shows the real feedback lifecycle, cost estimate,
    assumptions, GitHub artifacts, and any blocked/disabled states.

## Truth Rules

- Do not fake SDK installation.
- Do not fake GitHub issues, PRs, costs, agent runs, merge, deployment, or user
  follow-up.
- If the GitHub App is missing, show GitHub as needed.
- If the worker is disabled, show worker disabled.
- If no release proof exists, show implemented or merged work as waiting for
  release proof.
- If actual token/cost capture is unavailable, show the estimate and state that
  actual cost is unavailable.

## Current State

- LaunchBrief repo exists and is private.
- LaunchBrief production deployment is live on Vercel.
- LaunchBrief uses the real `@open-feedback-factory/sdk` at runtime and proved
  the in-app launcher path.
- LaunchBrief is an interim proof app, not the final demo app.
- The durable demo now uses Sprout, a clean plant-care repo that starts
  SDK-less.
- Durable SDK installation needs public npm distribution for
  `@open-feedback-factory/sdk`. The package is prepared for npm distribution,
  but the actual publish step is on hold for Joe's explicit go.
- OFF hosted control center has a Hosted Demo Alpha panel that links to the app
  and repo and derives setup readiness from `/doctor`.
- Hosted Railway workers remain disabled for alpha.
- The real alpha implementation lane is a local host Codex CLI worker attached
  to the hosted API. This lets the demo use a developer's signed-in Codex
  subscription instead of per-token API-key spend.
- The local worker must receive the hosted `RUNNER_TOKEN` through its ignored
  environment file before it can claim hosted work items.

## Definition of Done

| Item | Status | Notes |
| --- | --- | --- |
| LaunchBrief real-SDK proof app builds and deploys | Done | Useful proof, but not final demo concept |
| Control center shows repo/app/setup status without refresh | Needs work | UI exists, but final plant-app setup flow still needs proof |
| Public SDK package exists for normal installs | Prepared, held | Package metadata/readme/dist exports and pack proof are staged; actual publish is held for Joe |
| Clean plant-care app repo exists and starts SDK-less | Done | Sprout is live at `https://sprout-demo-chi.vercel.app` and has no OFF SDK |
| Plant repo is connected to the OFF GitHub App | Needs live proof | Backend repo-scope verification is ready; must verify Sprout is the accessible target before mutation |
| OFF creates a real sanitized issue or work item for SDK install | Needs work | Existing seams exist; needs plant-app proof |
| Local host Codex CLI worker can claim hosted work after manual approval | Needs work | Requires hosted `RUNNER_TOKEN` sync and live proof |
| Worker opens a real PR that installs SDK from npm | Needs work | Blocked on Joe-approved public package publish |
| PR includes assumptions, checks, and cost evidence | Needs work | Must be proven in plant-app run |
| Merged/redeployed app sends real feedback through installed launcher | Needs work | LaunchBrief proves runtime path; plant-app flow pending |
| Control center shows feedback lifecycle as a real routed work item | Needs work | Needs plant-app end-to-end run |
