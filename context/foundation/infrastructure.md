---
project: Arrivo
researched_at: 2026-07-27
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript / JavaScript
  framework: Astro 7 (SSR) + React 19
  runtime: Cloudflare Workers (workerd)
---

## Recommendation

**Deploy on Cloudflare Workers.**

For a stateless (request/response) Astro 7 SSR MVP with an external Supabase database, Cloudflare Workers scores a clean 5/5 on the agent-friendly criteria, runs effectively free at MVP traffic (100k requests/day free — this app's `<100k/month` is $0), and is already wired into the stack (`@astrojs/cloudflare` adapter, `wrangler.jsonc`, `output: "server"`). The developer already knows Cloudflare (interview tie-break), and its edge-by-default model hedges the still-undecided geographic reach. Every capability needed — SSR deploy, Cron Triggers for the FR-011 auto-expire job, CLI deploy/rollback/logs, and an MCP server — is GA as of 2026-07-27.

## Platform Comparison

Scored Pass (✅) / Partial (◐) / Fail (❌) against the five agent-friendly criteria. Hard filters: none triggered — interview Q1 = stateless, so no platform was dropped for lacking persistent processes, and all six support Astro SSR via an adapter. Interview weights applied: Cloudflare familiarity (tie-break), undecided geography (favors edge), external DB acceptable (does not penalize serverless), cost ≈ DX (mild preference for $0 options).

| Platform | CLI-first | Managed/serverless | Agent-readable docs | Stable deploy API | MCP / integration | Total | MVP cost |
|---|---|---|---|---|---|---|---|
| **Cloudflare Workers** | ✅ | ✅ | ✅ (`llms.txt`) | ✅ | ✅ (GA) | **5.0** | **~$0** |
| **Vercel** | ✅ | ✅ | ✅ | ✅ | ◐ (beta) | 4.5 | $0\* / $20 |
| **Netlify** | ◐ (rollback UI-only) | ✅ | ✅ | ✅ | ✅ (GA) | 4.5 | ~$0 |
| **Railway** | ✅ | ✅ | ✅ | ✅ | ◐ (beta) | 4.5 | ~$5 |
| **Render** | ✅ | ✅ | ✅ | ✅ | ✅ (GA) | 5.0 | ~$7–8 |
| **Fly.io** | ◐ (multi-step rollback) | ◐ (Docker + own migrations) | ❌ (no `llms.txt`) | ✅ | ✅ | 3.0 | ~$2–5 |

\* Vercel Hobby is $0 but **non-commercial only**; a real booking product must move to Pro ($20/seat/mo).

Per-platform notes:

- **Cloudflare Workers** — `@astrojs/cloudflare` v14 deploys to **Workers** via `wrangler deploy` (Pages support was dropped from the adapter; `wrangler pages deploy` is a different, legacy command). `wrangler` covers deploy / `rollback` / `tail`. Cron Triggers, D1/KV/R2/Queues, and the Cloudflare MCP server are all GA. Free tier is 100k req/**day**. Supabase must be reached over its HTTP client (or Supavisor transaction pooler / Hyperdrive) — no raw TCP pooling at the edge.
- **Vercel** — `@astrojs/vercel` is first-class; routes deploy as scale-to-zero Node functions (full Node runtime, unlike the edge). `vercel rollback` is a real CLI command. Cron Jobs GA (Hobby capped at once/day — fine for the daily job). MCP is public **beta**. The catch: Hobby forbids commercial use, so a live product needs Pro.
- **Netlify** — `@astrojs/netlify` SSR + Scheduled Functions + official **Claude Code MCP** all GA; $0 at this scale. Two dents: function cold starts ~0.8–1.5s hurt SSR TTFB, and rollback is UI-only (no CLI command — an agent can't revert unattended).
- **Railway** — Full CLI loop (`railway up` / `logs` / `redeploy`), near-zero-config Astro-on-Node, agent-readable docs. ~$5/mo (no free tier); MCP is **beta**; disable App Sleep to avoid billing surprises. A clean container-PaaS option if the app ever needs a persistent full-Node server.
- **Render** — Also 5/5 on criteria (official GA MCP + `llms.txt` + skills), but costs ~$7 (Starter web service, since the free tier cold-starts after 15 min) + ~$1/mo per cron job, and cron requires a paid workspace.
- **Fly.io** — Capable but the highest operational overhead (you own the Dockerfile and migrations), **no `llms.txt`**, and ~$2–5/mo. Its one differentiator — persistent processes — is exactly what this stateless MVP does not need.

### Shortlisted Platforms

The interview constraints (stateless, low-ops, external Supabase) point at **serverless**, so the two alternatives are kept serverless too — a container PaaS would add operational overhead this MVP doesn't need.

#### 1. Cloudflare Workers (Recommended)

Wins on every axis that matters here: 5/5 agent-friendly criteria (all GA), ~$0 at MVP traffic, already the stack's configured adapter, developer familiarity, and edge-by-default as a hedge on undecided geography. The one thing to internalize is the runtime model — CPU-metered edge, HTTP-based Supabase access — which the risk register and operational story address.

#### 2. Vercel

The strongest escape hatch if Cloudflare's **edge runtime constraints** bite (a Node-only dependency, CPU-heavy SSR): Vercel runs the same app on a full Node runtime with best-in-class Astro DX and a real `vercel rollback` CLI. Gap vs. the recommendation: MCP is still beta, and — decisively for a revenue product — the free Hobby tier is non-commercial, so it's effectively $20/mo.

#### 3. Netlify

The strongest **$0** serverless alternative: GA SSR adapter, GA Scheduled Functions, and an official GA Claude Code MCP server. Gap vs. the recommendation: ~1s function cold starts add SSR latency, and rollback is dashboard-only — an agent can deploy but cannot revert unattended, which weakens the CLI-first story.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **The limit is CPU time, not wall-clock.** Free = 10 ms CPU/invocation. The listing page (join specialists → filter by service area → aggregate ratings, i.e. the core business rule) rendered per request at the edge can blow the CPU budget as the catalog grows — errors or a forced move to the paid plan.
2. **Supabase-from-Workers is a hidden decision.** No persistent TCP pooling at the edge. You must use the HTTP `supabase-js`/PostgREST client, or Supavisor's transaction pooler (prepared statements disabled), or Hyperdrive. An agent that reaches for `node-postgres` directly will produce intermittent failures under concurrency.
3. **Node compatibility gaps.** `workerd` is not full Node. A dependency added later (PDF/image generation, `bcrypt`, some crypto/fs paths) may fail despite `nodejs_compat`, forcing a rewrite or a move off Workers.
4. **Pages↔Workers drift.** `tech-stack.md` says "cloudflare-pages," but the current adapter deploys to **Workers** (`wrangler deploy`). Following Pages tutorials or `wrangler pages deploy` will not deploy this app and will burn hours.
5. **Cron limits + a real incident.** Cron Triggers are capped at 3 per Worker, and a cron outage occurred 2026-07-08. A silently missed auto-expire run (FR-011) leaves stale "pending" bookings, with no built-in alerting.

### Pre-Mortem — How This Could Fail

The team shipped Arrivo on Cloudflare Workers. Early on it was free and fast. Six months in it unraveled. The listing page — joining specialists, filtering by service area, aggregating ratings — grew heavier with the catalog; the 10 ms CPU budget began throwing errors under real traffic, and moving to the paid plan didn't fully fix tail latency because the join ran per request at the edge. An agent-generated direct Postgres connection worked in dev but, through the pooler under concurrency, threw "prepared statement already exists," causing flaky bookings. A PDF-invoice library depended on Node APIs `workerd` lacked; ripping it out cost a week. During a Cloudflare cron incident the auto-expire job silently skipped runs, leaving stale "pending" requests and client complaints. None were individually fatal, but the edge runtime kept forcing workarounds the solo developer hadn't budgeted — the "free and simple" platform quietly taxed every feature that didn't fit the edge model.

### Unknown Unknowns

- **`astro dev` now runs on `workerd`, not Node.** Dev/prod fidelity is high, but a library that works under a plain-Node dev server elsewhere can behave differently here — the local runtime *is* the edge runtime.
- **The "cloudflare-pages" label in your own `tech-stack.md` is already stale.** The adapter targets Workers; `wrangler pages deploy` is a different legacy command. Any teammate or tutorial assuming Pages wastes hours.
- **The free tier is per-day (100k req/day), not per-month.** A traffic spike or bot can blow the daily cap; the free plan doesn't overage-bill, it *limits* — which reads as an outage.
- **CPU time excludes I/O waits.** Waiting on Supabase doesn't count against the budget, but rendering/JSON work does — so the constraint stays invisible until a page gets computationally heavier.
- **Supabase connection strategy is load-dependent.** The wrong choice (session pooling, prepared statements on, or double-pooling Hyperdrive + Supavisor) only fails under concurrency, never in dev.

## Operational Story

- **Preview deploys**: `npx wrangler versions upload` publishes a new version with a preview URL (`<version>-arrivo.<subdomain>.workers.dev`) without promoting to production; CI posts it on the PR. Preview URLs are public on `*.workers.dev` — put Cloudflare Access in front if previews must be gated. Fork PRs won't have repo secrets, so their preview builds are limited by design.
- **Secrets**: `npx wrangler secret put SUPABASE_URL` / `SUPABASE_KEY` store encrypted Workers Secrets, scoped per environment; values are **write-only** (not retrievable after being set — only overwritten). CI authenticates with a `CLOUDFLARE_API_TOKEN` held in GitHub Actions secrets. Rotation = run `wrangler secret put` again with the new value, then redeploy.
- **Rollback**: `npx wrangler rollback [<version-id>] [--message "reason"]` reverts to a prior deployed version, near-instant. Caveat: it reverts **only the Worker** — Supabase schema migrations are not rolled back, so keep migrations forward-only / backward-compatible.
- **Approval**: a human gates production promotion (`wrangler deploy` / promoting a version) and any rotation of the primary Supabase key or secrets. An agent may run `wrangler versions upload` (preview), `wrangler tail` (logs), and read-only checks unattended.
- **Logs**: `npx wrangler tail` streams live runtime logs read-only (add `--format json` for structured output); CI/build logs are read via the GitHub Actions run (`gh run view` or the Actions UI). Persistent Workers Logs are available in the dashboard.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Edge CPU budget exceeded by heavy per-request SSR joins (area-match + rating aggregation) | Devil's advocate / Pre-mortem | M | M | Push the match/rating query into Supabase (SQL view / RPC), not per-request JS; cache hot listing results in KV; move to the $5 plan if CPU-bound |
| Supabase connection misconfigured from Workers (wrong pooler / direct TCP) | Devil's advocate / Unknown unknowns | M | H | Use the `supabase-js` HTTP client (PostgREST); if direct Postgres is needed, Supavisor transaction pooler with prepared statements disabled — never `node-postgres` direct; document the rule in `CLAUDE.md` |
| A later dependency is Node-incompatible on `workerd` | Devil's advocate / Pre-mortem | M | M | Vet new deps for Workers / `nodejs_compat` before adding; keep Vercel (full Node) as the documented escape hatch (runner-up) |
| Pages-vs-Workers deploy confusion | Unknown unknowns / Research finding | M | M | Deploy only via `wrangler deploy`; correct the "cloudflare-pages" label in `tech-stack.md`; never `wrangler pages deploy` |
| Missed cron run leaves stale "pending" bookings (FR-011) | Devil's advocate | L | M | Make auto-expire idempotent **and** enforce expiry lazily at read time (treat past-window pending as expired in queries); add a heartbeat/alert on the cron |
| Daily free-tier request cap hit by a spike or bot | Unknown unknowns | L | M | Monitor request volume; add basic rate limiting / bot protection; upgrade to the $5 plan (10M req) before launch traffic |

## Getting Started

Version-accurate for `@astrojs/cloudflare` v14 + Astro 7 (checked 2026-07-27):

1. **Confirm the app targets Workers, not Pages.** In `astro.config.mjs`: `output: "server"` + `adapter: cloudflare()`. In `wrangler.jsonc`: `main` points at the Astro server entry (`@astrojs/cloudflare/entrypoints/server`), and `compatibility_flags: ["nodejs_compat"]` is set.
2. **Authenticate wrangler**: `npx wrangler login` locally; for CI, create a `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit) and store it in GitHub Actions secrets.
3. **Set server secrets** (match the `astro:env` schema): `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`.
4. **Deploy**: `npm run build && npx wrangler deploy` — **not** `wrangler pages deploy`.
5. **Wire the FR-011 cron**: add a `[triggers] crons` entry in `wrangler.jsonc` plus a `scheduled()` handler for the daily auto-expire; verify with `npx wrangler tail`.
6. **Reach Supabase over HTTP**: use the `supabase-js` client from the Worker; only fall back to Supavisor's transaction pooler (prepared statements disabled) or Hyperdrive if you need direct Postgres.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
