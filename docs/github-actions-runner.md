# GitHub Actions Worker Template

Open Feedback Factory can run a one-item worker from GitHub Actions by copying
`templates/github-actions/off-worker.yml` into an installed repository's
`.github/workflows/off-worker.yml`.

This is an optional API-key lane. It is useful for teams that cannot keep a
trusted local host worker online, but it is not the default subscription lane.
GitHub-hosted runners do not have a user's local Codex subscription session, so
the template requires `OPENAI_API_KEY` and runs `CODEX_AUTH_MODE=api_key`.

## Required Secrets

Set these as GitHub Actions repository secrets in the repository that owns the
workflow:

- `OFF_API_BASE_URL`: the OFF API, for example `https://api.example.com`.
- `OFF_RUNNER_TOKEN`: the runner token configured on the OFF API.
- `OPENAI_API_KEY`: the OpenAI API key used by Codex in CI.

For private target repositories outside the workflow repository, also set:

- `OFF_TARGET_REPO_TOKEN`: a GitHub token with permission to check out the
  target repo, push a branch, and open a pull request.

Do not put these values in workflow inputs, issue bodies, PR bodies, or logs.

## Manual Run

The workflow is intentionally manual:

1. Open **Actions** in the repository that contains the copied workflow.
2. Run **Open Feedback Factory worker**.
3. Set `repository_full_name` to the target app repo, such as `owner/app`.
4. Optionally set `work_item_id` for a targeted one-item run.

The workflow checks out the OFF worker code and the target app repo, installs
the Codex CLI, sends a runner heartbeat, claims one eligible job, and lets the
normal OFF worker path record cost, assumptions, branch, PR, and completion
state.

## Honest Status

This template does not prove a live hosted Actions worker is installed. Until a
real repository has the workflow, secrets, target checkout, and a successful
run, the control center should show this lane as prepared or partial, not live.
