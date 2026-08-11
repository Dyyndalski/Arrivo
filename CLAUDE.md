# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

**Arrivo** — a home-visit beauty/hair services marketplace (web MVP). It connects clients who can't or won't travel to a salon with independent specialists who travel to the client. Two roles: **client** (books a visit to their own address) and **specialist** (lists services with declared service areas, accepts/declines bookings). The load-bearing domain rule: a client sees only specialists whose declared service areas cover them, annotated by a trust rating aggregated from completed visits.

The full product spec — personas, functional requirements (FR-001…FR-015), business logic, access control, and non-goals — is the source of truth for scope and lives in @context/foundation/prd.md. Read it before implementing a feature. Load-bearing scope decisions that are easy to get wrong: **no payments** and **no in-app chat** in v1; booking is **request/accept**, not calendar scheduling; reviews are **star-rating only** (no free text); there is **no admin role**.

> Current state (2026-08-11): the scaffold is gone and six roadmap items have shipped and been archived — F-01 (roles + address privacy), S-01 (accounts), S-02 (specialist listings), S-03 (area-matched discovery), S-04 (booking request), S-05 (specialist accept/decline/expire/complete). `src/pages/` carries Arrivo screens, not the starter's demo. The app is deployed to Cloudflare Workers against hosted Supabase. **S-06 (reviews + trust rating) is the only must-have slice left** — see `@context/foundation/roadmap.md`.

Two routing rules that are easy to violate because they are not visible from any single file:

- **Landing is role-aware and lives in one place.** `homeFor(role)` in `src/lib/routes.ts` decides where an account lands; `/` is a dispatcher that redirects there (or to sign-in), and `src/pages/index.astro` renders nothing. Wrong-role redirects on pages go to `homeFor(role)`, never to a hardcoded path. There is no marketing landing page.
- **Nothing is public.** `/specialists` is in `PROTECTED_ROUTES` alongside `/dashboard`, `/specialist` and `/account`, so every application URL bounces a signed-out visitor to sign-in carrying `redirectTo`. This **deliberately diverges** from the PRD's original Access Control; the PRD records the amendment. Do not "restore" public browsing on the strength of an older comment or an FR that predates it.

## Project context & guardrails

- Recurring, hard-earned rules get appended to `@context/foundation/lessons.md` via `/10x-lesson` — check it before adding a PRD feature or touching auth, the data layer, or migrations.
- Never write to `context/archive/` — it's immutable. If a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

## Commands

- `npm run dev` — dev server on the Cloudflare `workerd` runtime (via `@astrojs/cloudflare`), not plain Node
- `npm run build` — production SSR build
- `npm run preview` — preview the built output
- `npm run lint` / `npm run lint:fix` — ESLint with type-checked rules
- `npm run format` — Prettier (astro + tailwindcss plugins)
- `npx astro sync` — regenerate `astro:env` / content types; run it after editing the `env.schema` in `astro.config.mjs` (CI runs it before lint)
- `npx supabase test db` — the pgTAP suite (5 files, 121 assertions), the project's only automated tests. Needs the local stack running; run `npx supabase db reset` first when a migration changed.

**There is no JS test runner** — no `test` script, no Vitest/Playwright. Do not assume they exist. Automated coverage is pgTAP against the database, which is where the RLS policies and booking transitions that actually need pinning live; a change to a policy or a transition function is expected to come with assertions in `supabase/tests/database/`.

Pre-commit (husky + lint-staged) auto-runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Architecture

Astro SSR app (`output: "server"` in `astro.config.mjs`) with React 19 islands, Tailwind 4, Supabase auth, deployed to Cloudflare Workers. The pieces that span multiple files:

- **Server-rendered by default.** With `output: "server"`, every route is dynamic (SSR). Opt a route *into* static generation with `export const prerender = true` — never assume static output.
- **Auth is middleware-driven, not per-page.** `src/middleware.ts` runs on every request, resolves the Supabase user, and attaches it to `context.locals.user`. To gate a route, add its path to the `PROTECTED_ROUTES` array there — do not hand-roll auth checks in individual pages. Auth endpoints live in `src/pages/api/auth/{signin,signup,signout}.ts`; auth pages in `src/pages/auth/*`; `src/pages/dashboard.astro` is the example protected page.
- **Supabase client is SSR + cookie-based.** `src/lib/supabase.ts` builds it with `@supabase/ssr`. The secrets `SUPABASE_URL` / `SUPABASE_KEY` are read from `astro:env/server` (declared in `astro.config.mjs` `env.schema`) — they are **server-only**; never import them into client/React code.
- **Reaching Supabase from the edge (deploy target is Cloudflare Workers):** use the HTTP `supabase-js` / PostgREST client — **never a direct Postgres / `node-postgres` connection**. Workers has no persistent TCP pooling at the edge, so raw connections fail intermittently under concurrency. If direct SQL is unavoidable, use Supabase's Supavisor *transaction* pooler with prepared statements disabled (or Hyperdrive). See @context/foundation/infrastructure.md.

## Conventions (the non-obvious ones)

- **Path alias:** `@/*` → `src/*`.
- **Astro for static/layout; React only where interactivity is required.** There are no Next.js directives here — `"use client"` etc. are meaningless. Extract React hooks to `src/components/hooks/`.
- **Tailwind class merging:** use the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge). Do not concatenate class strings by hand.
- **shadcn/ui** components live in `src/components/ui/` ("new-york" variant). Add new ones via `npx shadcn@latest add <name>` — don't hand-write them.
- **API routes:** uppercase handler exports (`GET`, `POST`, …); validate request input before use with `zod` (v4, already a dependency) through the `parseOrError` helper in `src/lib/schemas/parse.ts`. Schemas live in `src/lib/schemas/`, one module per domain. Validation failures redirect with `?error=<catalog key>` — a message-catalog key, never a sentence; the page translates it.
- **Supabase migrations:** `supabase/migrations/`, named `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables with granular per-operation, per-role policies — the client/specialist split (see the PRD's access control) is the core authorization boundary.
- **Shared entity/DTO types** go in `src/types.ts`; extracted business logic in `src/lib/` (or `src/lib/services/`).

## Environment & known traps

- **Node 22.x LTS is required** (`.nvmrc`). Newer majors (23+) emit `EBADENGINE` warnings and are unsupported by the toolchain — install may still succeed, but switch to 22.x for real work.
- **Local secrets:** copy `.env.example` → `.env` (Node) and/or `.dev.vars` (Cloudflare local dev; gitignored). Local Supabase stack: `npx supabase start` (needs Docker; Studio at `http://localhost:54323`). Full setup steps are in @README.md.
- **CI:** `.github/workflows/ci.yml` runs lint + build on push/PR to `main`. The `build` step reads `SUPABASE_URL` / `SUPABASE_KEY` from repo secrets (the env schema marks them optional, so it also builds without them).
- **Docs drift:** the README is still the starter's — it is titled "10x Astro Starter", points `git clone` at the starter repo, and describes none of Arrivo. Its Astro version claim was corrected to v7 (`astro@^7.1.4`); everything else in it predates the product. When it and `package.json` disagree, trust `package.json`.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 3

Review AI-generated code before merge with the **implementation review chain**:

```
/10x-implement -> /10x-impl-review -> triage -> (/10x-lesson | fix | skip | disagree)
```

`/10x-impl-review` is the lesson focus. Review is a quality gate, not an instruction to fix every finding.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Code review (lesson focus)** | |
| `/10x-impl-review <change-id>` | You have implemented code and want a structured review before merge. The skill checks plan adherence, scope discipline, safety and quality, architecture, pattern consistency, and success criteria, then presents findings for triage. |
| **Recurring lesson outcome** | |
| `/10x-lesson` | A finding reveals a recurring project rule or agent failure pattern. Record it in `context/foundation/lessons.md` instead of treating it as a one-off note. |

### Triage discipline

- Severity says how bad the finding is. Impact says how much the decision matters now.
- Valid outcomes: fix now, fix differently, skip, accept as risk, record as recurring rule (`/10x-lesson`), disagree.
- Fix critical findings. Do not burn hours on low-impact observations just because the agent found them.
- Conscious skipping of low-impact findings is a valid review outcome, not negligence.
- If you disagree with a finding, record why. Wrong agent reasoning is also signal.

### Review boundaries

- This lesson reviews implemented code. It does not create the plan, execute new phases, or teach CI review.
- Testing strategy and quality gates are introduced in Module 3.
- Do not use `/10x-contract` as a triage outcome in this lesson.

### Paths used by this lesson

- `context/changes/<change-id>/plan.md` - expected implementation contract
- `context/changes/<change-id>/reviews/` - review output
- `context/foundation/lessons.md` - recurring lessons

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
