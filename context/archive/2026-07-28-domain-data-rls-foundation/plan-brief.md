# Domain Roles + Address-Privacy Foundation (F-01) — Plan Brief

> Full plan: `context/changes/domain-data-rls-foundation/plan.md`

## What & Why

Build the minimal data foundation the whole Arrivo MVP sits on: a role-carrying profile per account, plus the Row-Level Security *pattern* that will keep a client's address private. Every later slice (accounts, listings, discovery, booking, reviews) needs roles and honors this privacy contract, and the guardrail is far cheaper to get right before any address or booking data exists.

## Starting Point

Auth is generic and working (Supabase email/password, `context.locals.user`, `/dashboard` gated), but there are no domain tables, no `profiles`/`role`, and no `supabase/migrations/`. Email confirmation is on, so the `auth.users` row exists at sign-up time. The app is live on Cloudflare Workers and reaches Supabase over the HTTP client only.

## Desired End State

Each account has a `profiles` row with a `role` (client|specialist), created automatically on sign-up. RLS lets a user read only their own profile and never change their own role. A pgTAP suite proves that isolation (the address-leak verification path). `context.locals.role` carries the role for downstream slices. The address-privacy contract for S-03/S-04 is written down.

## Key Decisions Made

| Decision                     | Choice                                              | Why (1 sentence)                                                        | Source |
| ---------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- | ------ |
| Role storage                 | `profiles` table + `role` enum, 1:1 to `auth.users` | Idiomatic Supabase, RLS-friendly, room for domain fields later          | Plan   |
| Profile creation             | `SECURITY DEFINER` trigger on `auth.users` insert   | Can't be bypassed, works with email confirmation, single source of truth | Plan   |
| Privacy scope for F-01       | Pattern only (defer address column to S-03/S-04)    | Matches roadmap scope guard; don't build entities before their slices   | Roadmap/Plan |
| RLS verification             | pgTAP via `supabase test db`                        | Standard Supabase DB/RLS test tool, CI-able, tests policy at the source | Plan   |
| Dev database                 | Local Supabase (Docker) + migrations pushed to hosted | Safe schema iteration without touching the hosted DB; pgTAP runs locally | Plan   |

## Scope

**In scope:** `profiles` + `role` enum; profile-creation trigger (reads role from sign-up metadata, defaults `client`); RLS (own-row read, no role self-escalation); pgTAP tests; backfill for existing users; role in `context.locals`; shared types; written privacy contract.

**Out of scope:** client address column + acceptance-gated visibility (S-03/S-04); role-selection UI + password recovery (S-01); services/bookings/reviews entities; CI wiring for `supabase test db`.

## Architecture / Approach

DB-first, bottom-up: stand up local Supabase + migrations → land schema/trigger/RLS with pgTAP proofs → push to hosted → wire the role into middleware/`context.locals`. The trigger is the only writer of `role`; the app reads roles via the existing HTTP Supabase client.

## Phases at a Glance

| Phase                                          | What it delivers                                   | Key risk                                              |
| ---------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------- |
| 1. Local Supabase + migration workflow         | Working local stack + linked hosted project + migration/test dirs | Requires Docker; hosted-link mismatch                 |
| 2. Profiles + role + trigger + RLS + pgTAP     | The schema, the privacy mechanism, and its proof   | RLS policy wrong → isolation fails silently (pgTAP catches it) |
| 3. App integration + privacy contract          | `context.locals.role`, shared types, documented contract | Extra per-request DB round-trip; missing-profile null handling |

**Prerequisites:** Docker running locally; `supabase` CLI (already a dependency); Cloudflare + Supabase already wired (done).
**Estimated effort:** ~2-3 sessions across 3 phases.

## Open Risks & Assumptions

- Role immutability depends on end users having *no* write path to `profiles.role` — if a future slice grants profile writes, it must exclude `role`.
- The middleware adds one Supabase round-trip per request; fine at MVP scale, revisit if hot.
- Migrations are forward-only (Worker rollback won't revert the DB); the app tolerates a briefly-absent profile (role → null).
- Open Roadmap Questions (area verification, thresholds) don't affect F-01.

## Success Criteria (Summary)

- `supabase test db` is green: a user sees only their own profile, new users get a `client` profile, no self-escalation of role.
- A real sign-up produces a correctly-roled profile row (hosted).
- The deployed app carries `context.locals.role` with no regression to landing/auth.
