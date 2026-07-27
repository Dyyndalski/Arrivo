---
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
---

## Why this stack

Solo developer shipping Arrivo, a home-visit beauty marketplace, as a 3-week
after-hours web MVP with email/password auth for two roles (client, specialist).
10x-astro-starter (Astro + React + TypeScript + Tailwind + Supabase +
Cloudflare) clears all four agent-friendly gates, ships auth + Postgres + edge
deploy out of the box, and is bootstrapper first-class. Auth is the only
technology-forcing feature in scope; payments, realtime, and AI are out per
PRD non-goals. Background jobs are marked in scope: FR-011's auto-expire for
stale booking requests needs a recurring scheduled task, which this starter
covers via a Supabase scheduled function rather than an external queue.
Deployment lands on Cloudflare Pages (the starter default); CI runs on GitHub
Actions with auto-deploy-on-merge, matching a solo cadence. 