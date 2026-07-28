# Role-aware Accounts (S-01) — Plan Brief

> Full plan: `context/changes/role-aware-accounts/plan.md`

## What & Why

Roadmap slice S-01: let a visitor **choose a role (client | specialist) at sign-up** and add a **full in-app password-recovery flow**. This is the first user-facing slice on the completed F-01 foundation — the role choice makes the two-sided marketplace real, and recovery is a must-have (FR-002) for the target audience (elderly/limited-mobility users forget passwords, and lockout has no other workaround).

## Starting Point

Sign-in/sign-out already work (generic Supabase auth: React form islands → `/api/auth/*` endpoints → `supabase.auth.*`). Sign-up exists but passes no role, and there is **no password-recovery flow**. F-01 is done: its `handle_new_user` trigger already reads `raw_user_meta_data.role`, so sign-up only needs to pass the metadata — **no DB work**.

## Desired End State

A visitor picks client or specialist at sign-up and the created profile carries that role. A user who forgot their password requests a reset from the sign-in page, gets an email, clicks through to set a new password, and signs in with it.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Role selector UX | Segmented toggle | Clearest binary choice; fits the existing form style | Plan |
| Role requirement | Required (no default) | FR-001 "sign up as either"; avoids mis-roled single-role accounts | Plan |
| Recovery UI | Custom in-app pages | Consistent with the starter's custom auth; full UX control; works on edge | Plan |
| Reset-form validation | Same as sign-up (pw + confirm + min 6) | Reuse the known pattern/components | Plan |
| After successful reset | Redirect to sign-in with a message | Explicit, simple session model | Plan |
| Invalid/expired reset link | Redirect to forgot-password with a message | Clear recovery path for the user | Plan |

## Scope

**In scope:** role choice at sign-up (wired to F-01's trigger + server validation); forgot-password request page/form/endpoint + "check email" page; PKCE callback that exchanges the code for a recovery session; reset-password page/form/endpoint; success + error routing.

**Out of scope:** DB changes (F-01 owns them); role change after sign-up / dual-role; email-confirmation changes; custom email templates; a test-runner.

## Architecture / Approach

Follows the existing auth pattern: React form islands POST to `/api/auth/*` endpoints that call `supabase.auth.*` via the `@supabase/ssr` HTTP client. Recovery is a PKCE flow: `resetPasswordForEmail({ redirectTo: /auth/callback })` → email → `/auth/callback` exchanges the `code` for a session → `/auth/reset-password` (session-gated) → `updateUser({ password })`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Role at sign-up | Role toggle + `options.data.role` wiring | Small; must validate role server-side too |
| 2. Recovery — request | Forgot-password page/endpoint + reset email | Hosted redirect-URL allow-list must be configured |
| 3. Recovery — reset | PKCE callback + set-new-password flow | Recovery session gating; token-exchange correctness |

**Prerequisites:** F-01 done (✓); local Supabase running (Mailpit at `:54324` for email testing); Docker/Rancher up.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- The `/auth/callback` URL must be allow-listed in the hosted Supabase Auth config (and `config.toml` locally) or the reset link is rejected — a manual step.
- Assumes Supabase's default recovery email is acceptable (no custom template).
- `updateUser({ password })` relies on the recovery session established by the code exchange; direct visits to reset-password without a session bounce to forgot-password.

## Success Criteria (Summary)

- Local sign-up as specialist → `profiles.role = specialist`; unpicked role is blocked.
- Reset email lands in Mailpit; the link sets a new password and returns to sign-in.
- End-to-end recovery works on the deployed URL after the redirect-URL config.
