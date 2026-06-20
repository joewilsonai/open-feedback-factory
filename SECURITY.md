# Security Policy

Open Feedback Factory handles sensitive operational paths: private feedback,
repository access, runner execution, cost controls, GitHub artifacts, release
proof, and integration credentials. Please report security issues carefully.

## Supported Versions

Open Feedback Factory is currently a private dogfood alpha. There are no public
stable release lines yet.

| Version | Supported |
| --- | --- |
| `main` private alpha | Security fixes accepted |
| public releases | Not available yet |

## Reporting a Vulnerability

Do not open a public GitHub issue for vulnerabilities or suspected credential
exposure.

Until a public security contact is published, report issues directly to the
maintainers through the private project channel. Include:

- a short impact summary;
- affected component or route;
- reproduction steps if safe to share;
- whether credentials, raw feedback, repository contents, or user data may be
  exposed;
- any logs with secrets removed.

Maintainers should acknowledge confirmed reports, triage impact, and record a
private remediation task. Public disclosure waits until the fix is available or
the maintainer explicitly approves disclosure.

## High-Risk Areas

Treat these areas as security-sensitive:

- raw feedback and sanitized GitHub issue creation;
- `/admin/*` and `/runner/*` auth gates;
- GitHub App private keys, installation tokens, and webhook signatures;
- Codex/worker execution policy, sandbox, network, and command allowlists;
- integration secrets for Supabase, Vercel, Resend, Railway, GitHub, model
  providers, and deployment tools;
- cost caps, merge modes, release markers, and user notification paths;
- hosted control-plane to local-worker trust boundaries.

## Secret Handling

Never commit, paste, screenshot, or log:

- `.env` files;
- private keys or PEM files;
- API keys or provider tokens;
- raw feedback exports;
- database dumps;
- logs containing secrets or private user data.

Credential-backed actions should go through scoped control-plane tools and leave
only redacted evidence in logs, PRs, and user-facing output.

## Security Fix Expectations

Security fixes must preserve honesty:

- do not hide a failed integration behind a fake success state;
- do not mark a release shipped without proof;
- do not silently relax guardrails to unblock a run;
- add regression tests for the vulnerability class when practical.
