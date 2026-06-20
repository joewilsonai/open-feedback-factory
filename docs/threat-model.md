# Threat Model

Open Feedback Factory coordinates user feedback, private app context, GitHub,
agent workers, costs, and release proof. The main risk is not only code
execution; it is over-trusting automation and accidentally turning private user
signals into public artifacts.

## Assets

- raw feedback and requester identity;
- sanitized work items and demand clusters;
- repository contents and generated branches;
- GitHub App private keys and installation tokens;
- admin and runner tokens;
- integration credentials for providers such as Supabase, Vercel, Resend,
  Railway, GitHub, and model gateways;
- cost budgets and usage ledgers;
- release proof and user notification state;
- hosted control-plane data.

## Trust Boundaries

| Boundary | Risk |
| --- | --- |
| SDK to API | Malicious or noisy clients, private data in metadata, rate-limit bypass |
| API to GitHub | Unsanitized feedback in issues, over-scoped GitHub App access |
| API to worker | Unauthorized claims, stale approval state, wrong target repo |
| Worker to target repo | Arbitrary repo scripts, command/network abuse, branch/PR spoofing |
| Control center to API | Admin-token leakage, policy mutation by the wrong role |
| Secrets vault to tools | Plaintext secret exposure, unscoped external mutations |
| Release marker to user status | Calling merged work shipped without deployment proof |

## Primary Threats

1. Raw user feedback leaks into GitHub, logs, PRs, prompts, or screenshots.
2. A worker claims or completes work without the right runner token or approval.
3. A worker modifies the wrong repository.
4. A target repository test or package script executes unexpected code.
5. GitHub artifacts are forged or trusted without live evidence.
6. A missing integration is represented as working.
7. Cost caps or merge gates are bypassed to keep automation moving.
8. Secrets are committed, echoed, or passed into agent-visible context.
9. Hosted control-plane requests are confused with local demo state.
10. User-facing status says shipped before release proof exists.

## Existing Controls

- deterministic sanitization tests;
- admin and runner token gates;
- scoped RBAC role gates for admin actions;
- GitHub App webhook signature verification;
- target-repo mismatch blocking in the worker;
- Codex sandbox, network, and command policy checks;
- cost budget caps before model spend;
- explicit merge modes;
- secrets vault metadata-only admin responses;
- release marker separate from implemented/merged states;
- status discipline in docs and control-center copy.

## Required Review for High-Risk Changes

Require explicit maintainer review for changes touching:

- sanitization;
- auth and RBAC;
- runner claim/complete routes;
- Codex command, sandbox, or network policy;
- GitHub App credentials, webhooks, issue creation, branch creation, PR evidence,
  or merge behavior;
- integration secrets;
- cost caps;
- release proof;
- user notifications.

## Open Gaps

- full hosted multi-user identity and team RBAC;
- provider-specific credential-backed action tools;
- live proof for the hosted local-worker claim path;
- live proof for GitHub Actions worker execution;
- end-to-end hosted trial path;
- public security contact and disclosure SLA;
- final license and public roadmap.
