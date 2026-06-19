# Hosted Demo Alpha

Hosted Demo Alpha is the near-term demo path for Open Feedback Factory.

The goal is not multi-user hosted alpha yet. The goal is a polished, truthful,
repo-connected demo that shows the product loop with controlled internal repos
and real infrastructure.

## Demo Surfaces

| Surface | URL | Purpose |
| --- | --- | --- |
| Landing | `https://openfeedbackfactory.com` | Public narrative and entry point |
| Control center | `https://app.openfeedbackfactory.com/ops/` | Operator view for the lifecycle |
| API | `https://api.openfeedbackfactory.com` | Feedback, admin, runner, and GitHub APIs |
| Demo app | `https://launchbrief-demo.vercel.app` | Clean user app with no OFF SDK installed |
| Demo app repo | `https://github.com/joewilsonai/launchbrief-demo` | Real repo OFF should connect and mutate |

## Important Constraint

LaunchBrief intentionally starts without the Open Feedback Factory SDK.

That is the demo. OFF should connect to the repo, inspect it, and create a real
PR that installs the SDK launcher. The demo should not start from an app that is
already wired to OFF, because that hides the most important onboarding moment.

## Demo Story

1. Open LaunchBrief.
2. Show it is a normal app: launch tasks, beta signals, no feedback launcher.
3. Open the OFF control center.
4. Show the hosted demo panel: LaunchBrief app, LaunchBrief repo, SDK missing,
   GitHub App state, worker state, and next action.
5. Connect the LaunchBrief repo through the OFF GitHub App.
6. Approve a work item to install the SDK launcher.
7. OFF creates a sanitized GitHub issue or directly creates a branch/PR,
   depending on the configured lane.
8. The worker installs the SDK launcher and opens a PR.
9. The operator reviews/merges the PR.
10. LaunchBrief redeploys.
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
- LaunchBrief has no OFF SDK dependency, no SDK API calls, and no feedback
  launcher.
- OFF hosted control center has a Hosted Demo Alpha panel that links to the app
  and repo and derives setup readiness from `/doctor`.
- Hosted workers remain prepared but disabled until a real runner credential is
  configured.

## Definition of Done

- LaunchBrief clean app builds and deploys.
- LaunchBrief repo is connected to the OFF GitHub App.
- Control center shows repo/app/setup status without refresh.
- OFF can create a real sanitized issue for the SDK install request.
- OFF can run a real worker against the LaunchBrief repo after manual approval.
- Worker opens a real PR that installs the SDK launcher.
- PR includes assumptions, checks, and cost evidence.
- The merged/redeployed app can send real feedback through the installed
  launcher.
- Control center shows that feedback as a real routed work item.

