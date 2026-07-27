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
- **Reaching Supabase from the edge (deploy target is Cloudflare Workers):** use the HTTP `supabase-js` / PostgREST client — **never a direct Postgres / `node-postgres` connection**. Workers has no persistent TCP pooling at the edge, so raw connections fail intermittently under concurrency. If direct SQL is unavoidable, use Supabase's Supavisor *transaction* pooler with prepared statements disabled (or Hyperdrive). See @context/foundation/infrastructure.md.

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

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit — Module 1, Lesson 5

Pick a deployment platform and ship to production with the **infra chain**:

```
(/10x-init  →  /10x-shape  →  /10x-prd  →  /10x-tech-stack-selector  →  /10x-bootstrapper  →  /10x-agents-md  →  /10x-rule-review  →  /10x-lesson)  →  /10x-infra-research  →  Plan Mode deploy
```

The full Module 1 chain ships from Lessons 1–4 (re-included so you can fix any earlier contract mid-flight). `/10x-infra-research` is the lesson's main topic; the deploy step itself uses the host's built-in **Plan Mode** rather than a dedicated skill — the artifact (`context/deployment/deploy-plan.md`) is what carries forward.

### Task Router — Where to start

| Skill | Use it when |
| --- | --- |
| **Infrastructure (lesson focus)** | |
| `/10x-infra-research [path-to-tech-stack-or-prd]` | You have a `context/foundation/tech-stack.md` (and ideally a `prd.md`) and need to pick an MVP deployment platform. The skill loads the stack as a hard constraint, runs a 5-question developer interview (persistent connections, cost sensitivity, existing familiarity, global reach, co-location preference), spawns parallel subagent research across six candidate platforms, scores them Pass/Partial/Fail across the five agent-friendly criteria from `references/agent-friendly-criteria.md`, shortlists the top three, and runs a three-lens anti-bias cross-check on the leader (devil's advocate, pre-mortem, unknown unknowns) before writing `context/foundation/infrastructure.md`. Use AFTER `/10x-tech-stack-selector`, BEFORE `/10x-implement`. |
| **Deploy (host built-in, not a skill)** | |
| Plan Mode deploy | You have `infrastructure.md` + `tech-stack.md` and want a read-only plan reviewed before any mutation hits the platform. Activate the host's plan mode (Claude Code: `Shift+Tab` cycles default → auto-accept → plan; IDE: dedicated button) with the prompt "Wykonajmy pierwsze wdrożenie w oparciu o `@infrastructure.md`, zgodnie ze stackiem z `@tech-stack.md`". Read the plan, demand corrections, approve, then let the agent execute. The approved plan persists at `context/deployment/deploy-plan.md` so the next lesson's milestone planning can reference what's already deployed and which secrets are already wired. |
| **Re-run upstream if needed** | |
| `/10x-init` / `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` / `/10x-bootstrapper` / `/10x-agents-md` / `/10x-rule-review` / `/10x-lesson` / `/10x-stack-assess` / `/10x-health-check` | Bundled so you can patch any earlier contract mid-flight. If the anti-bias cross-check forces a platform swap that pushes a stack-shaped decision (e.g. "this DB doesn't fit any platform we'd accept"), re-run `/10x-tech-stack-selector` to keep `tech-stack.md` and `infrastructure.md` aligned. |

### How the chain hands off

- `/10x-infra-research` reads `context/foundation/tech-stack.md` (language, framework, runtime, database) as **hard constraints** — platforms that can't run the stack are dropped before scoring. It also reads `context/foundation/prd.md` (scale, latency, uptime expectations) as **soft weights** when scoring. Both inputs are optional but strongly recommended; without them the skill proceeds but warns.
- The skill writes `context/foundation/infrastructure.md` as the third foundation contract: frontmatter (`project`, `researched_at`, `recommended_platform`, `runner_up`, `context_type`, `tech_stack`) plus a body covering recommendation, full platform comparison with scoring matrix, anti-bias findings, operational story (preview / secrets / rollback / approval / logs), and a risk register tying every entry back to the lens that surfaced it. On collision the skill prompts: overwrite, save as `infrastructure-v2.md`, or abort.
- Plan Mode reads `infrastructure.md` and `tech-stack.md` together. The agent emits a step-by-step plan covering automated steps it owns, manual setup gates (account creation, secret configuration), exact deploy commands (Pages vs Workers commands are NOT interchangeable on Cloudflare — the plan must specify), and verification steps. The plan is rejected/edited until it's right; only then does Plan Mode exit and execution begin. The approved plan lands at `context/deployment/deploy-plan.md` and is consumed downstream by milestone-planning skills as ground truth for "what's already deployed".

### What the lesson's skills capture (and what they do NOT)

- **`/10x-infra-research` captures**: platform shortlist scored against five agent-friendly criteria (CLI quality, managed/serverless degree, agent-readable docs, stable/scriptable deploy API, MCP or first-class agent integration), three anti-bias outputs on the leader (numbered weaknesses, 150–200-word failure narrative, 3–5 unknown-unknowns), an operational story with one concrete answer per axis (not categories), and a risk register where every row names its source lens (`Devil's advocate` / `Pre-mortem` / `Unknown unknowns` / `Research finding`). Status of every non-GA feature is captured inline (`beta` / `preview` / `region-limited` / `deprecated`) with the date the status was checked.
- **`/10x-infra-research` does NOT** build Docker images or write Dockerfiles, configure CI/CD pipelines, or plan beyond MVP scope (multi-region HA is explicitly out of scope). It does NOT decide for you — the user accepts, swaps to runner-up, or aborts after the cross-check, and that decision is recorded in the output.
- **Plan Mode** captures: an explicit human gate between "agent has a plan" and "agent mutates production". The artifact (`deploy-plan.md`) is the audit trail for "what was supposed to happen" when the live run goes sideways. Plan Mode does NOT replace `/10x-infra-research` (the platform decision must already be made — Plan Mode plans the deploy, it doesn't pick where to deploy).

### The five agent-friendly criteria (and why they're load-bearing)

The criteria that make `/10x-infra-research`'s scoring matrix are not generic "good platform" axes — they're the specific traits that determine whether an agent can operate this platform from a session without you holding its hand:

1. **CLI-first** — every routine operation has a documented command; the agent doesn't need to click in a panel.
2. **Managed / serverless** — fewer moving pieces means fewer ways the agent (or you) breaks something the platform was supposed to handle.
3. **Agent-readable docs** — markdown / `llms.txt` / GitHub-hosted docs the agent can fetch and parse, not JS-rendered marketing pages.
4. **Stable, scriptable deploy API** — predictable exit codes, structured output, no interactive prompts mid-deploy.
5. **MCP server or first-class agent integration** — bonus, not required. CLI alone is fine for MVP; MCP earns its keep when the agent makes dozens of structured queries against live state.

Hard filters apply before scoring (persistent-connection requirement drops Netlify/Vercel serverless-only; tech-stack runtime mismatch drops the platform entirely). Interview answers reweight criteria after — cost sensitivity penalizes expensive base tiers, familiarity breaks ties, global-reach preference favours edge-native platforms, co-location preference favours integrated databases.

### Anti-bias as a decision discipline (not theatre)

Every research conversation with an LLM has a built-in tilt toward whatever the user already signalled. `/10x-infra-research` runs three structured lenses against the leader BEFORE the file is written, not after:

- **Devil's advocate** — *find the weaknesses, hidden costs, and failure modes specific to deploying `<this stack>` on `<this platform>`*. Output is a numbered list of 3–5 specifics, not categories.
- **Pre-mortem** — *six months later, this decision turned out to be a complete disaster; walk through the assumptions and underestimated risks that led there*. Output is a 150–200-word narrative; narratives surface concrete failure shapes that abstract risk lists hide.
- **Unknown unknowns** — *what's true about this combination that the marketing page and docs don't make obvious?* Output is 3–5 non-obvious risks.

After the cross-check the user has three real options: **proceed with the leader and absorb the risks into the register**, **swap to runner-up** (and re-run the cross-check on the new leader), or **swap to third place**. The third option is rare; if it never happens across many runs, the cross-check has degraded into a ritual and should be rewritten.

Two additional techniques (no skill required, raw prompts) belong in the same toolbox: forcing the model to compare three alternatives in a markdown table (structure beats "the same answer in different words"), and role-rotation (the same decision through a frontend dev's, security person's, and cost owner's eyes — surface the cost each role pays and propose alternatives if any of them flinch).

### CLI vs MCP for live-infra operability

After deploy, the agent needs a way to talk to the running platform. Two paths, complementary not competing:

- **CLI** (`wrangler`, `flyctl`, `vercel`, `gh`) — explicit and auditable, output stays in the terminal, safer defaults for irreversible actions (e.g. `netlify deploy` is draft by default; `--prod` must be passed). Best for MVP: minimal setup, low context cost (no tool schemas pre-loaded), and the agent has to know the command (which is where a per-tool skill helps).
- **MCP** — a dedicated server exposing structured tools with schemas (`pages_deployments_list`, etc.). Each connected MCP server adds tool definitions to the context window, so cost compounds across servers. Earns its keep when the agent makes many discovery-style queries against live state (logs, deployment diffs) and structured JSON beats parsing CLI output.

Sensible default: start with CLI, add MCP when you notice a recurring pattern of `--help` traversal the agent has to do to answer a class of questions. Anthropic's own [building-agents-that-reach-production](https://claude.com/blog/building-agents-that-reach-production-systems-with-mcp) framing is "API, CLI, and MCP are three complementary paths" — pick by task, not by hype.

### Production-access boundary (minimal permissions, human-on-irreversibles)

Both CLI and MCP can give the agent direct access to production. The lesson sets a default posture:

- **Tokens are scoped, not master keys.** On Cloudflare: an API token limited to Pages or Workers for one project, no DNS, no Workers Secrets for unrelated projects, no billing. AWS / GCP equivalent: scoped IAM role with `console-only-user` or read-only on production, full access on staging.
- **Tokens live in env vars, not in `.mcp.json` committed to the repo.** The agent picks them up via the MCP server or CLI's env-discovery, not via plaintext in conversation.
- **Destructive actions are human-only.** Drop a database, rotate a primary secret, delete a project — those are panel-by-hand operations, even if the agent suggests them. Manual click costs 30 seconds; cleanup after an automated mistake costs hours.

This is the MVP posture. As the project matures, the natural evolution is staging gets full agent access, production becomes read-only — covered in later modules.

### Foundation paths used by this lesson

- `context/foundation/tech-stack.md` — input (Lesson 2 hand-off, hard constraints)
- `context/foundation/prd.md` — input (Lesson 1 hand-off, soft weights)
- `context/foundation/infrastructure.md` — output (the third foundation contract)
- `context/deployment/deploy-plan.md` — output of Plan Mode deploy (audit trail of "what was supposed to happen")
- `context/foundation/lessons.md` — recurring rules & pitfalls (use `/10x-lesson` from Lesson 4 if you spot a class of agent failure during research or deploy)
- `docs/reference/contract-surfaces.md` — load-bearing names registry

### Universal language

The shipped skill carries no 10xDevs / cohort / certification references. The candidate platform list (Cloudflare, Vercel, Netlify, Fly.io, Railway, Render) is the starting research lens, not a recommendation set — the scoring + interview + cross-check pipeline is what's load-bearing, and a platform absent from the default list can be added by extending the research step. The five agent-friendly criteria are the artifact's true core; `/10x-infra-research` re-reads them from `references/agent-friendly-criteria.md` so they evolve as platforms do.

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
