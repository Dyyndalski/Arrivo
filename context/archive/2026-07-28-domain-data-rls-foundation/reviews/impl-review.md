<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Domain Roles + Address-Privacy Foundation (F-01)

- **Plan**: context/changes/domain-data-rls-foundation/plan.md
- **Scope**: Phase 3 of 3 (full plan)
- **Date**: 2026-07-28
- **Verdict**: NEEDS ATTENTION → triaged (F1/F2/F3 fixed; F4/F5 skipped)
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — pgTAP count assertion is not isolation-robust

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: supabase/tests/database/profiles_rls.test.sql:31
- **Detail**: `select is((select count(*)::int from public.profiles), 3, ...)` asserted a GLOBAL profile count of 3. It passed only on a freshly-reset DB. During this review the suite FAILED (test 4) because leftover demo users inserted during the 2.4 manual demo made the count 5; after `supabase db reset && supabase test db` it was 7/7 again. Brittle — depended on the DB being empty.
- **Fix**: Scope the count to the test fixtures (`where id in ('1111…','2222…','3333…')`) so it is independent of pre-existing rows; run `supabase test db` after `supabase db reset`.
- **Decision**: FIXED — count scoped to the 3 fixture ids; pgTAP 7/7 on a clean reset.

### F2 — Trigger insert is non-idempotent (no ON CONFLICT)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260728154217_handle_new_user.sql:10
- **Detail**: The trigger insert had no `on conflict (id) do nothing`; a replayed/duplicated `auth.users` insert or future pre-create flow would raise `unique_violation` and abort sign-up. Inconsistent with the idempotent backfill.
- **Fix**: Add `on conflict (id) do nothing` via a forward-only follow-up migration (`create or replace function`).
- **Decision**: FIXED — new migration `20260728162904_harden_handle_new_user.sql` redefines `handle_new_user` with `on conflict (id) do nothing`.

### F3 — Role is fully client-controlled; privilege invariant undocumented in the trigger

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260728154217_handle_new_user.sql:14
- **Detail**: `role` comes verbatim from client sign-up metadata; safe today (no privileged enum value) but a latent footgun if a privileged role (e.g. `admin`) is ever added to `user_role`.
- **Fix**: Pin the invariant with a comment in the trigger and gate privileged roles out of the metadata path when one is introduced.
- **Decision**: FIXED — invariant pinned in a comment in the `20260728162904_harden_handle_new_user.sql` function definition.

### F4 — SECURITY DEFINER search_path could be hardened

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260728154217_handle_new_user.sql:8
- **Detail**: `set search_path = public` satisfies the linter; the stricter pattern is `set search_path = ''` with fully-qualified objects (`::public.user_role`). Exploitability low (runs as `supabase_auth_admin`, not the end user).
- **Fix**: Use `set search_path = ''` and `::public.user_role`.
- **Decision**: SKIPPED — kept `set search_path = public`; passes the linter and exploitability is low. Revisit if a hardening pass is done later.

### F5 — updated_at has no maintenance trigger (future S-03)

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260728154212_profiles_roles_rls.sql:13
- **Detail**: `updated_at` defaults to `now()` but no `BEFORE UPDATE` trigger bumps it. Correct now (no update path); goes stale once an update path lands.
- **Fix**: Add a `moddatetime`/`updated_at` trigger when the first `profiles` update path is introduced (S-03).
- **Decision**: SKIPPED — parked for S-03 (per the user); the `updated_at` trigger lands with the first profiles update path.

## Resolved during review

- **SUPABASE_KEY is the anon/publishable key, not `service_role`** — verified SAFE: the Workers secret set during deployment is the `sb_publishable_…` key, so RLS is active for the middleware client.

## Affirmations

- Role immutability enforced at the grant layer (`revoke all … from anon, authenticated` + `grant select` only), proven by pgTAP SQLSTATE `42501`.
- Client-controlled role metadata validated before cast; safe `client` default for absent/empty/garbage (test covers `"role":"root"`).
- Own-row read isolation holds (pgTAP: user A sees exactly one row, their own).
- Migration is non-destructive, forward-only; backfill is idempotent.
- App tolerates a missing profile (`.maybeSingle()` + `?? null`) — a positive deviation from the plan's `.single()`.
- Pattern compliance clean: shared `createClient`, `@supabase/ssr` HTTP client only (honors the CLAUDE.md edge rule), idiomatic `.overrideTypes`.
- Plan adherence: all 14 planned items MATCH; the two deviations (`maybeSingle`, 42501-vs-zero-rows) both honor stated intent.
