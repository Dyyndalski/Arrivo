# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

**Arrivo** — a home-visit beauty/hair services marketplace (web MVP). It connects clients who can't or won't travel to a salon with independent specialists who travel to the client. Two roles: **client** (books a visit to their own address) and **specialist** (lists services with declared service areas, accepts/declines bookings). The load-bearing domain rule: a client sees only specialists whose declared service areas cover them, annotated by a trust rating aggregated from completed visits.

The full product spec — personas, functional requirements (FR-001…FR-015), business logic, access control, and non-goals — is the source of truth for scope and lives in @context/foundation/prd.md. Read it before implementing a feature. Load-bearing scope decisions that are easy to get wrong: **no payments** and **no in-app chat** in v1; booking is **request/accept**, not calendar scheduling; reviews are **star-rating only** (no free text); there is **no admin role**.

> Current state: the codebase is still the unmodified 10x-astro-starter scaffold — **none of Arrivo's domain features exist yet**. `src/pages/` and `src/components/` carry the starter's demo auth flow and landing page, not Arrivo screens.

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

**No test runner is configured** — there is no `test` script and no test framework in `package.json`. Do not assume Vitest/Playwright exist; add and wire one before writing tests.

Pre-commit (husky + lint-staged) auto-runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Architecture

Astro SSR app (`output: "server"` in `astro.config.mjs`) with React 19 islands, Tailwind 4, Supabase auth, deployed to Cloudflare Workers. The pieces that span multiple files:

- **Server-rendered by default.** With `output: "server"`, every route is dynamic (SSR). Opt a route *into* static generation with `export const prerender = true` — never assume static output.
- **Auth is middleware-driven, not per-page.** `src/middleware.ts` runs on every request, resolves the Supabase user, and attaches it to `context.locals.user`. To gate a route, add its path to the `PROTECTED_ROUTES` array there — do not hand-roll auth checks in individual pages. Auth endpoints live in `src/pages/api/auth/{signin,signup,signout}.ts`; auth pages in `src/pages/auth/*`; `src/pages/dashboard.astro` is the example protected page.
- **Supabase client is SSR + cookie-based.** `src/lib/supabase.ts` builds it with `@supabase/ssr`. The secrets `SUPABASE_URL` / `SUPABASE_KEY` are read from `astro:env/server` (declared in `astro.config.mjs` `env.schema`) — they are **server-only**; never import them into client/React code.

## Conventions (the non-obvious ones)

- **Path alias:** `@/*` → `src/*`.
- **Astro for static/layout; React only where interactivity is required.** There are no Next.js directives here — `"use client"` etc. are meaningless. Extract React hooks to `src/components/hooks/`.
- **Tailwind class merging:** use the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge). Do not concatenate class strings by hand.
- **shadcn/ui** components live in `src/components/ui/` ("new-york" variant). Add new ones via `npx shadcn@latest add <name>` — don't hand-write them.
- **API routes:** uppercase handler exports (`GET`, `POST`, …); validate request input with a schema validator before use. `zod` is the intended choice but is **not yet in `package.json`** — add it when you build the first endpoint.
- **Supabase migrations:** `supabase/migrations/`, named `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables with granular per-operation, per-role policies — the client/specialist split (see the PRD's access control) is the core authorization boundary.
- **Shared entity/DTO types** go in `src/types.ts`; extracted business logic in `src/lib/` (or `src/lib/services/`).

## Environment & known traps

- **Node 22.x LTS is required** (`.nvmrc`). Newer majors (23+) emit `EBADENGINE` warnings and are unsupported by the toolchain — install may still succeed, but switch to 22.x for real work.
- **Local secrets:** copy `.env.example` → `.env` (Node) and/or `.dev.vars` (Cloudflare local dev; gitignored). Local Supabase stack: `npx supabase start` (needs Docker; Studio at `http://localhost:54323`). Full setup steps are in @README.md.
- **CI:** `.github/workflows/ci.yml` runs lint + build on push/PR to `main`. The `build` step reads `SUPABASE_URL` / `SUPABASE_KEY` from repo secrets (the env schema marks them optional, so it also builds without them).
- **Docs drift:** the README still says "Astro 6", but `package.json` is on **Astro 7** (`astro@^7.1.4`) with ESLint 9 and Vite 8 (no `overrides`). When they disagree, trust `package.json`; update the README so this note can go.