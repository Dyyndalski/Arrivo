---
change_id: role-aware-accounts
title: Role-aware accounts
status: impl_reviewed
created: 2026-07-28
updated: 2026-07-28
archived_at: null
---

## Notes

Implements roadmap item **S-01** (see `@context/foundation/roadmap.md`) — the first vertical slice, sitting on the completed F-01 foundation.

- **Outcome:** a visitor can sign up as either a **client** or a **specialist**, sign in and out, and recover a forgotten password.
- **PRD refs:** FR-001 (role-aware sign-up), FR-002 (sign in/out + password recovery).
- **Prerequisite:** F-01 (`domain-data-rls-foundation`) — **done**. The role model, `handle_new_user` trigger, RLS, and `context.locals.role` already exist.
- **Key contract from F-01:** sign-up passes the role via `supabase.auth.signUp({ options: { data: { role } } })` — the trigger reads metadata key **`role`** and defaults to `client` for absent/invalid values. So this slice's job is the **UI + wiring** (role choice on the sign-up form + pass it through `src/pages/api/auth/signup.ts`), not the DB.
- **New vs existing:** sign-in/out already exist (generic Supabase auth); this slice adds **role selection at sign-up** and **password recovery** (a new flow — reset request + update-password pages/endpoints).
- **Baseline:** `src/pages/auth/{signin,signup,confirm-email}.astro`, `src/pages/api/auth/{signin,signup,signout}.ts`, `src/components/auth/*` (React forms), middleware already attaches `context.locals.role`.
