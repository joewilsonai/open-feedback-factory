# Hosted Deployment

Open Feedback Factory supports two paths:

- self-hosted installs for developers who want every service and secret in
  their own infrastructure;
- a hosted control plane for developers who want to test the loop before they
  install or operate the full stack.

The hosted version must follow the same truth rules as the self-hosted version:
no fake PRs, no fake costs, no fake shipped state, and no simulated agent runs.
If GitHub, provider keys, runners, release proof, or app integrations are not
configured, the hosted UI should show queued, blocked, disabled, or
needs-configuration states.

## Current Private Hosted Stack

The private hosted stack is deployed on Railway, with the landing page on
Vercel:

| Service | URL | Current V1 role |
| --- | --- | --- |
| Landing | `https://openfeedbackfactory.com` | Public landing page |
| API | `https://api.openfeedbackfactory.com` | Feedback intake, admin API, runner API, GitHub App setup, doctor/health |
| Control center | `https://app.openfeedbackfactory.com/ops/` | Private operator UI |
| Demo app | `https://demo.openfeedbackfactory.com` | Hosted Daybook SDK demo |
| Worker | Railway private service | Deployed but disabled until real runner credentials are configured |
| Postgres | Railway private service | Hosted V1 database |

Temporary provider URLs still exist for recovery/debugging:

- landing: `https://open-feedback-factory.vercel.app`;
- API: `https://api-production-d6ee.up.railway.app`;
- control center: `https://control-center-production-02f0.up.railway.app/ops/`;
- demo app: `https://demo-app-production-9a5a.up.railway.app`.

The local hosted admin token is stored outside git at:

```text
.off/hosted-admin-token.txt
```

Do not commit this file. `.off/` is ignored by git.

## Intended Domain Map

Use Vercel for the public landing page and Railway for the app/runtime services:

| Domain | Target |
| --- | --- |
| `openfeedbackfactory.com` | Vercel landing page |
| `www.openfeedbackfactory.com` | Vercel landing page or redirect to apex |
| `app.openfeedbackfactory.com` | Railway control center |
| `api.openfeedbackfactory.com` | Railway API |
| `demo.openfeedbackfactory.com` | Railway hosted Daybook demo |
| `openfeedbackfactory.dev` | Redirect or developer docs later |
| `openfeedbackfactory.org` | Redirect later |

Hostinger owns the domains, so DNS changes should be made through the
Hostinger DNS integration. Vercel should own the landing deployment and Railway
should own the API/app/demo custom-domain records.

Live DNS records:

- `@ A 76.76.21.21`;
- `www CNAME openfeedbackfactory.com.`;
- `api CNAME jnthpvfp.up.railway.app.`;
- `app CNAME gi71e9eo.up.railway.app.`;
- `demo CNAME euq3gk7u.up.railway.app.`;
- `_railway-verify.api TXT ...`;
- `_railway-verify.app TXT ...`;
- `_railway-verify.demo TXT ...`.

## Railway Notes

The repo uses one deployable image with service routing:

- root `pnpm start` runs `scripts/railway-start.mjs`;
- `OFF_SERVICE=api` starts API plus migrations;
- `OFF_SERVICE=control-center` starts Vite preview for the built control
  center;
- `OFF_SERVICE=demo-app` starts Vite preview for the built demo app;
- `OFF_SERVICE=worker` starts the worker.

Railway injects `PORT`. Runtime code must prefer `PORT` over local defaults.
Local defaults remain:

- API: `4100`;
- control center: `5173`;
- demo app: `5174`.

Do not hard-code Railway public domains into product logic when a custom domain
is configured. Use `PUBLIC_BASE_URL`, `CONTROL_CENTER_URL`, and
`VITE_API_BASE_URL`.

## Hosted Truth Defaults

The first private hosted stack intentionally starts safe:

- `APPROVAL_MODE=manual`;
- `AUTO_MERGE_ENABLED=false`;
- `CODEX_RUNNER_MODE=disabled`;
- `CODEX_AUTH_MODE=api_key`;
- `GITHUB_MODE=disabled`;
- admin and runner tokens enabled;
- GitHub App not configured yet;
- OpenAI API key not configured yet.

This means hosted feedback can be received, sanitized, clustered, cost-estimated,
and shown in the control center. It should not claim agent implementation,
GitHub issue creation, PR creation, cost actuals, release proof, or shipped
status until the relevant real integrations are configured.

## Landing Page

The public landing page lives in `apps/landing`.

Useful commands:

```bash
pnpm landing:dev
pnpm landing:build
```

The Vercel project should use:

- root directory: `apps/landing`;
- framework: Vite;
- build command: `pnpm build`;
- output directory: `dist`.

The current landing page uses a real screenshot of the hosted control center:

```text
apps/landing/public/control-center-live.png
```

Only use real product screenshots. If the hosted state changes, recapture the
asset from the live control center instead of drawing fake rows.

## Integration Secrets Vault

Self-hosted V1 can use ignored `.env` files for simple local setup, but the
hosted product needs a real integration secrets vault.

The vault should store scoped credentials for services such as:

- Supabase;
- Vercel;
- Resend;
- Railway;
- GitHub App private keys;
- model providers;
- feature flag providers;
- email/SMS providers.

Requirements:

- encrypt secrets at rest;
- mask values in the UI and API responses;
- store metadata such as provider, scope, owner, created/rotated dates, and
  allowed repositories/environments;
- support test connection without exposing the secret;
- expose secrets to agents only through narrow, audited tools;
- require policy approval before an agent can use a credential that mutates an
  external system;
- record every credential access request and use;
- support rotation, revocation, and disabled states;
- prevent secrets from appearing in plans, prompts, PRs, logs, screenshots, or
  user follow-up messages.

Example: if an agent needs to apply a Supabase migration, it should not receive
a raw Supabase service key in its prompt. It should call a narrow tool such as
`apply_supabase_migration(work_item_id, migration_sql)` after policy approval,
and the control plane should perform the operation with the stored credential,
log the action, and redact the secret from all outputs.
