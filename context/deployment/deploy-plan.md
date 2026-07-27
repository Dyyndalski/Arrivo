# Deploy Plan / Record — Arrivo

First production deployment, executed 2026-07-27 under the plan-gated (Lesson 5) flow. This file is the ground-truth record of what is deployed and which secrets are wired; downstream milestone planning reads it.

## Current deployment

| Field | Value |
|---|---|
| Platform | Cloudflare Workers (per `context/foundation/infrastructure.md`) |
| Worker name | `arrivo` (set in `wrangler.jsonc`) |
| Live URL | https://arrivo.dyndalski.workers.dev |
| Deployed at | 2026-07-27 |
| Version ID | `c5301aa9-57b8-4801-876e-5d9a1941a8ef` |
| Adapter | `@astrojs/cloudflare` v14 (`output: "server"`) — deploys to **Workers** via `wrangler deploy` (NOT Pages) |
| Runtime bindings | `ASSETS` (static), `IMAGES`, `SESSION` (KV, inherited) |
| Deployed scope | The 10x-astro-starter scaffold as-is — **no Arrivo domain features yet** |

## Secrets wired (Workers Secrets)

| Name | Value / source | Notes |
|---|---|---|
| `SUPABASE_URL` | `https://lhruerozshudatypngna.supabase.co` | project API URL (`.co`) |
| `SUPABASE_KEY` | Supabase **publishable** key (`sb_publishable_…`) | RLS-respecting client key; read server-side via `astro:env/server` |

Secrets are write-only in Cloudflare (not retrievable after set). To rotate: `npx wrangler secret put <NAME>` again.

> Security note: a Supabase **secret** key (`sb_secret_…`) was briefly pasted into the setup chat and must be rotated/revoked in Supabase → Settings → API keys. It was never set as a Worker secret and never committed. The deployed app uses only the publishable key.

## Verification (2026-07-27, all passed)

- `GET /` → 200 (landing renders).
- `GET /dashboard` → 302 → `/auth/signin` (auth middleware + Supabase client working — not a null-client crash).
- `GET /auth/signup` → 200; `GET /auth/signin` → 200.
- Not run: full signup POST (would create a real user + confirmation email) — test manually in the browser.

## Deploy / operate commands

- Build: `npm run build`
- Deploy: `npx wrangler deploy`
- Live logs: `npx wrangler tail`
- List versions: `npx wrangler deployments list`
- Rollback: `npx wrangler rollback [<version-id>] [--message "reason"]` — reverts the Worker only; no DB migrations are involved yet, so nothing to reconcile.

## Not yet done (follow-ups)

- **CI auto-deploy** — GitHub Actions deploy step using a `CLOUDFLARE_API_TOKEN` repo secret; the existing `ci.yml` currently runs lint + build only.
- **FR-011 cron** — add a `[triggers] crons` entry in `wrangler.jsonc` + a `scheduled()` handler for booking auto-expire, once that feature exists.
- **Custom domain** — staying on `*.workers.dev` for the MVP.
- **workers.dev subdomain** — registered during this deploy (`dyndalski`); first-deploy one-time gate, now done.
