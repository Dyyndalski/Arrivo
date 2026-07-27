# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

**Arrivo** — a home-visit beauty/hair services marketplace (web MVP). It connects clients who can't or won't travel to a salon with independent specialists who travel to the client. Two roles: **client** (books a visit to their own address) and **specialist** (lists services with declared service areas, accepts/declines bookings). The load-bearing domain rule: a client sees only specialists whose declared service areas cover them, annotated by a trust rating aggregated from completed visits.

The full product spec — personas, functional requirements (FR-001…FR-015), business logic, access control, and non-goals — is the source of truth for scope and lives in @context/foundation/prd.md. Read it before implementing a feature. Load-bearing scope decisions that are easy to get wrong: **no payments** and **no in-app chat** in v1; booking is **request/accept**, not calendar scheduling; reviews are **star-rating only** (no free text); there is **no admin role**.

> Current state: the codebase is still the unmodified 10x-astro-starter scaffold — **none of Arrivo's domain features exist yet**. `src/pages/` and `src/components/` carry the starter's demo auth flow and landing page, not Arrivo screens.

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
- **API routes:** uppercase handler exports (`GET`, `POST`, …); validate input with zod.
- **Supabase migrations:** `supabase/migrations/`, named `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables with granular per-operation, per-role policies — the client/specialist split (see the PRD's access control) is the core authorization boundary.
- **Shared entity/DTO types** go in `src/types.ts`; extracted business logic in `src/lib/` (or `src/lib/services/`).

## Environment & known traps

- **Node 22.x LTS is required** (`.nvmrc`). Newer majors (23+) emit `EBADENGINE` warnings and are unsupported by the toolchain — install may still succeed, but switch to 22.x for real work.
- **Local secrets:** copy `.env.example` → `.env` (Node) and/or `.dev.vars` (Cloudflare local dev; gitignored). Local Supabase stack: `npx supabase start` (needs Docker; Studio at `http://localhost:54323`). Full setup steps are in @README.md.
- **CI is currently inert:** `.github/workflows/ci.yml` triggers on `branches: [master]`, but this repo's default branch is **`main`** — so lint+build never run on push/PR. Retarget the trigger to `main` (and add `SUPABASE_URL` / `SUPABASE_KEY` repo secrets) before trusting CI.
- **Docs drift:** the README and the starter's own `CLAUDE.md.scaffold` say "Astro 6 / Node 22.14", but `package.json` was bumped to **Astro 7** (`astro@^7.1.4`), ESLint 10, and Vite 7 (pinned via `overrides`). When they disagree, trust `package.json`.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit — Module 1, Lesson 4

Onboard the agent to the project you scaffolded in Lesson 3 with the **agent-context chain**:

```
(/10x-init  →  /10x-shape  →  /10x-prd  →  /10x-tech-stack-selector  →  /10x-bootstrapper)  →  /10x-agents-md  →  /10x-rule-review  →  /10x-lesson
```

The PRD → tech-stack → bootstrap chain ships from Lessons 1–3 (re-included so you can fix the project mid-flight). `/10x-agents-md`, `/10x-rule-review`, and `/10x-lesson` are the lesson's main topics. The chain extends in Lesson 5 to the infra/deploy step.

### Task Router — Where to start

| Skill | Use it when |
| --- | --- |
| **Agent context (lesson focus)** | |
| `/10x-agents-md` | The repo is scaffolded but the agent has no project-specific onboarding. Inspects the repo (package manifest, README, scripts, lint/test config, layout, commit history) and writes a concise, ordered "Repository Guidelines" to `AGENTS.md` (or, when invoked from a subdirectory, a directory-level `AGENTS.md` reframed around local conventions and the dominant unit). Use as an alternative to the host's built-in `/init` or as a fallback for tools without one. Repo-level body targets ~200 lines; directory-level guides target 120–250 words. |
| `/10x-rule-review <path>` | You have a rules-for-AI file (`AGENTS.md`, `CLAUDE.md`, `.cursor/rules/*.mdc`, `.github/copilot-instructions.md`, `.windsurfrules`, nested per-area files) and want a 5-axis scorecard: length, embedded code/config snippets, precision of language, redundancy with public knowledge, and rule ordering. Tool-agnostic — scores the artifact's condition, not the project. Default output is read-only; only Check 5 (reorder) may edit, and only with explicit approval. |
| `/10x-lesson [seed]` | You spotted a recurring rule worth surfacing for future runs of `/10x-frame`, `/10x-research`, `/10x-plan`, `/10x-plan-review`, `/10x-implement`, and `/10x-impl-review`. Appends a single entry (Context / Problem / Rule / Applies to) to `context/foundation/lessons.md`. Self-bootstraps the file with the canonical `# Lessons Learned` header on first use. Append-only — never reorders or rewrites prior entries. |
| **Re-run upstream if needed** | |
| `/10x-init` / `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` / `/10x-bootstrapper` / `/10x-stack-assess` / `/10x-health-check` | Bundled so you can fix the PRD, swap the stack, or re-scaffold mid-flight. If `/10x-rule-review` flags a `FAIL` you can't shrink your way out of, that often points back to ambiguous PRD or stack decisions — re-run the upstream skill rather than padding `AGENTS.md` with corrections. |

### How the chain hands off

- `/10x-agents-md` writes (or surgically updates) `AGENTS.md` at the resolved scope. Repo-level scope = the file lives at the repo root and frames the project as a whole; directory-level scope = the file lives next to the code it governs and reframes around the local unit, dropping repo-wide framing entirely. The skill never silently overwrites — it switches to an update flow when the target exists.
- `/10x-rule-review` reads any rules-for-AI markdown file you point it at and prints a 5-check scorecard (`OK` / `WARN` / `FAIL`) with concrete fixes. It does not depend on `/10x-agents-md` having run; you can review `.cursor/rules/`, copilot instructions, or a hand-written `CLAUDE.md` the same way.
- `/10x-lesson` self-bootstraps `context/foundation/lessons.md` on first use, then appends one Context/Problem/Rule/Applies-to entry per invocation. The file is consumed as a prior by the planning- and review-phase skills introduced later in the workflow — `/10x-frame`, `/10x-research`, `/10x-plan`, `/10x-plan-review`, `/10x-implement`, `/10x-impl-review`.

### What the lesson's skills capture (and what they do NOT)

- **`/10x-agents-md` captures**: project structure, build/test/lint commands actually present in scripts, commit conventions inferred from history, repo-specific tripwires the agent would otherwise miss, references to canonical files via `@`-paths instead of pasting their content. Directory-level scope additionally captures: local naming/layout patterns inferred from siblings, allowed/forbidden imports, the test pattern used by neighbours, and tripwires visible in the immediate area.
- **`/10x-agents-md` does NOT** paste in the contents of `tsconfig.json` / `eslint.config` / framework docs the agent already knows; it does NOT generate generic "write clean code" intentions; it does NOT replace the host's built-in `/init` when one exists — it's positioned as an alternative or fallback, not a default.
- **`/10x-rule-review` captures**: a length verdict (OK ≤ 200 non-empty lines, WARN 201–500, FAIL 501+), code/config blocks that should be `@`-references instead, vague-intention language, redundancy with framework docs the agent already has from training, and a Check 5 reorder proposal that surfaces critical rules to the top.
- **`/10x-rule-review` does NOT** edit the file by default; it does NOT score project content (architecture, stack choices) — it scores the rule artifact's condition; it does NOT generate a "fixed version" of the file (Check 5 may move sections with explicit approval, never rewrite rule wording).
- **`/10x-lesson` captures**: one entry per invocation with a short imperative H2 title (the title IS the rule), Context (subsystem / phase / file pattern, specific enough to pattern-match), Problem (what concretely breaks without the rule, ideally with a past incident), Rule (1–2 imperative sentences pasteable verbatim into a future review finding), Applies to (subset of `frame`, `research`, `plan`, `plan-review`, `implement`, `impl-review`, or `all`).
- **`/10x-lesson` does NOT** edit or remove existing lessons — the file is append-only by design (rewriting recurring rules without thought is the failure mode this convention prevents); it does NOT batch multiple rules per invocation; it does NOT pre-fill fields proactively (the user does the writing — that's the price of capturing rules outside a structured review).

### The inclusion test (the filter for AGENTS.md / CLAUDE.md)

Before you add a rule to any rules-for-AI file, ask: *could the agent know this without this file? Could public training data — books, blogs, repos in this stack — have prepared it for this?* If yes, drop it. If no, keep it. The file is onboarding for an agent that already knows TypeScript / Python / your framework but does NOT know your local conventions.

Belongs:
- non-obvious project conventions (error-response shape, file naming, allowed import paths)
- project-specific traps and "embarrassing" workarounds tied to history or dependency bugs
- referenced canonical files via `@`-paths (e.g. `@src/features/users/user.service.ts` as a pattern reference, not pasted code)

Does NOT belong:
- mainstream framework documentation
- README content the agent will read anyway (link with `@README.md`)
- popular generic advice ("use TypeScript strict mode") that's already enforced by config
- intention statements ("write clean code", "follow good practices") — convert to a checkable behaviour or drop

### U-shaped attention and granular rules

LLMs attend most strongly to the start and end of context (Lost-in-the-Middle / U-shaped attention). A long monolithic `CLAUDE.md` puts its middle rules in the weakest attention zone. Two practical consequences:

1. **Most important rules go to the top** of any rule file.
2. **Per-area rules belong next to their code** — nested `AGENTS.md` / `CLAUDE.md` inside `src/api/`, `.cursor/rules/*.mdc` with file globs, etc. Granular files are loaded selectively and arrive whole near the start of their own section, instead of being buried at line 400 of one big file.

`/10x-rule-review` Check 5 (reorder) operationalizes consequence (1); the inclusion test plus directory-level `/10x-agents-md` operationalizes consequence (2).

### The five-pattern calibration drill

Before writing a rule, validate that the agent actually breaks the convention without it. Pick one pattern from your project (error-response shape, file naming, import style, module structure, date handling). Then:

1. Ask the agent to implement against the pattern 3–5 times from a clean state, no rule.
2. Note where it broke the convention; capture run time, files explored, and visible cost/tokens if the host surfaces them.
3. Add a 1–3-sentence rule to the appropriate scope (root or area-level).
4. Re-run the same task in a fresh session and compare convention adherence, time, files, and iterations.

If the agent already trends toward the convention without the rule, you don't need the rule. If it systematically picks the wrong pattern, you've found a high-leverage rule to add. This drill is what "earning a rule from a recurring failure" actually looks like.

### Hierarchy and tool interop

- **Claude Code** loads `CLAUDE.md` from the user dir (`~/.claude/CLAUDE.md`), the repo root, and any subdirectory the agent works under. Deeper files override or supplement higher ones.
- **Codex** and **GitHub Copilot** load `AGENTS.md` from the current directory upward — closest file wins.
- One canonical file is preferable to three duplicates. A common pattern: `AGENTS.md` as source of truth, `CLAUDE.md` as a thin Claude-Code shim with `@AGENTS.md` import, `.github/copilot-instructions.md` only if Copilot needs its own additions. Symlink (`ln -s AGENTS.md CLAUDE.md`) is the simplest deduplication when tools require both names.
- Auto-memory (e.g. Claude Code's `~/.claude/projects/<dir-with-slashes-as-dashes>/memory/MEMORY.md`) is local to the machine and not a substitute for `AGENTS.md`. Team-binding rules live in the repo; auto-memory is a personal cache, periodically reviewable.

### Inner-loop hooks (deterministic feedback without prompting)

Mechanical, non-pickable checks belong in hooks (e.g. Claude Code's `PostToolUse`), not in the rule file. The agent finishes an edit; a formatter or fast lint runs; the result feeds back without you reminding it. Settings template (`settings.json.template`) ships in the lesson pack as the wiring entry point. Keep procedural workflows (deeper review, release checklist, deploy on sandbox) in skills, and reserve hooks for deterministic tool signals.

### Foundation paths used by this lesson

- `AGENTS.md` / `CLAUDE.md` (and per-area variants) — `/10x-agents-md` output
- `context/foundation/lessons.md` — `/10x-lesson` output (append-only register, consumed by future planning/review skills)
- `context/foundation/prd.md`, `context/foundation/tech-stack.md` — inputs from earlier lessons, still present
- `docs/reference/contract-surfaces.md` — load-bearing names registry (scaffolded by `/10x-init`)

### Universal language

The shipped skills carry no 10xDevs / cohort / certification references. `/10x-agents-md` discovers from the repo it's invoked in; `/10x-rule-review` is tool-agnostic and treats every file as "a rules-for-AI artifact"; `/10x-lesson` writes one entry shape regardless of project domain. The 5-pattern calibration drill is illustrative — substitute patterns from your own stack.

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
