---
bootstrapped_at: 2026-07-27T14:38:15Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: arrivo
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

# Bootstrap verification — arrivo

## Hand-off

Verbatim copy of `context/foundation/tech-stack.md` frontmatter and rationale.

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: arrivo
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: custom
  quality_override: false
  self_check_answers:
    typed: true
    from_official_starter: true
    conventions: true
    docs_current: true
    can_judge_agent: true
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: true
```

**Why this stack** (from hand-off body): Solo developer shipping Arrivo, a
home-visit beauty marketplace, as a 3-week after-hours web MVP with
email/password auth for two roles (client, specialist). 10x-astro-starter
(Astro + React + TypeScript + Tailwind + Supabase + Cloudflare) clears all four
agent-friendly gates, ships auth + Postgres + edge deploy out of the box, and is
bootstrapper first-class. Auth is the only technology-forcing feature in scope;
payments, realtime, and AI are out per PRD non-goals. Background jobs are marked
in scope: FR-011's auto-expire for stale booking requests needs a recurring
scheduled task, which this starter covers via a Supabase scheduled function
rather than an external queue. Deployment lands on Cloudflare Pages (the starter
default); CI runs on GitHub Actions with auto-deploy-on-merge, matching a solo
cadence.

## Pre-scaffold verification

| Signal      | Value    | Severity | Notes                                                                                   |
| ----------- | -------- | -------- | --------------------------------------------------------------------------------------- |
| npm package | not run  | —        | `cmd_template` starts with `git clone` (not a `create-*` CLI); npm recency step skipped per pre-scaffold reference |
| GitHub repo | not run  | —        | `gh` CLI not installed and the curl fallback probe was declined; recency signal unavailable (non-gating) |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone (clone starter → strip upstream `.git/` → move files up into cwd)
**Exit code**: 0
**Files moved**: 20 top-level entries (`.env.example`, `.github`, `.gitignore`, `.husky`, `.nvmrc`, `.prettierrc.json`, `.vscode`, `CLAUDE.md.scaffold`, `README.md`, `astro.config.mjs`, `components.json`, `eslint.config.js`, `node_modules`, `package-lock.json`, `package.json`, `public`, `src`, `supabase`, `tsconfig.json`, `wrangler.jsonc`)
**Conflicts (.scaffold siblings)**: `CLAUDE.md.scaffold` (existing cwd `CLAUDE.md` preserved; scaffold copy sidelined)
**.gitignore handling**: moved silently (absent in cwd)
**context/ handling**: scaffold shipped no `context/`; cwd `context/` preserved verbatim
**.bootstrap-scaffold cleanup**: deleted (upstream `.git/` removed before move-up so starter history did not leak)

Notes:
- The scaffold's `.git/` was removed via `Remove-Item -Recurse -Force` (the bash `rm -rf` path was blocked in this environment; the move-up steps were run individually at the user's request).
- Environment note: local Node is v23.6.0, which is outside the starter's declared engine range (`^20.19 || ^22.13 || >=24`). `npm install` completed successfully (773 packages) despite `EBADENGINE` warnings, but a supported LTS (Node 22.x) is recommended before sustained work.

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 1 CRITICAL, 12 HIGH, 7 MODERATE, 2 LOW (22 total across 895 dependencies)
**Direct vs transitive**: 0/1/2/0 direct of total 1/12/7/2 — i.e. only 3 findings sit in directly-chosen dependencies; the rest are transitive. Every finding reports a fix available (`npm audit fix`).

#### CRITICAL findings
- **tar** — transitive. Fix available.

#### HIGH findings
- **astro** — **direct**. Fix available.
- **brace-expansion**, **devalue**, **fast-uri**, **js-yaml**, **miniflare**, **postcss**, **sharp**, **svgo**, **undici**, **vite**, **ws** — transitive. Fixes available.

#### MODERATE findings (log only)
- **supabase** — **direct**. Fix available.
- **wrangler** — **direct**. Fix available.
- **@astrojs/language-server**, **@cloudflare/vite-plugin**, **volar-service-yaml**, **yaml**, **yaml-language-server** — transitive. Fixes available.

#### LOW / INFO findings (log only)
- **@babel/core**, **esbuild** — transitive. Fixes available.

Bootstrapper does not auto-patch. Suggested manual follow-up: run `npm audit fix`
(or `npm audit fix --force` for breaking upgrades, reviewing the diff), then
re-run `npm audit` to confirm. Most findings are dev-toolchain packages (Vite,
Wrangler, language servers); weigh them against your risk tolerance.

## Hints recorded but not acted on

| Hint                     | Value                                                            |
| ------------------------ | --------------------------------------------------------------- |
| bootstrapper_confidence  | first-class                                                     |
| quality_override         | false                                                           |
| path_taken               | custom                                                          |
| self_check_answers       | typed:true, from_official_starter:true, conventions:true, docs_current:true, can_judge_agent:true |
| team_size                | solo                                                            |
| deployment_target        | cloudflare-pages                                                |
| ci_provider              | github-actions                                                  |
| ci_default_flow          | auto-deploy-on-merge                                            |
| has_auth                 | true                                                            |
| has_payments             | false                                                           |
| has_realtime             | false                                                           |
| has_ai                   | false                                                           |
| has_background_jobs      | true                                                            |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review the `CLAUDE.md.scaffold` sibling the conflict policy created and decide whether to merge any of the starter's agent guidance into your existing `CLAUDE.md`.
- Copy `.env.example` to `.env` and fill in Supabase + Cloudflare credentials before running the app.
- Consider switching to Node 22.x LTS (the starter's supported engine range) before sustained work.
- Address audit findings per your project's risk tolerance — the full breakdown is above; `npm audit fix` resolves all reported issues.
