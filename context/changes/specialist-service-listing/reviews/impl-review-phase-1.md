<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Specialist Profile + Service Listing (S-02)

- **Plan**: `context/changes/specialist-service-listing/plan.md`
- **Scope**: Phase 1 of 3 — Schema, dictionaries and RLS
- **Date**: 2026-08-03
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension          | Verdict |
| ------------------ | ------- |
| Plan Adherence     | PASS    |
| Scope Discipline   | PASS    |
| Safety & Quality   | PASS    |
| Architecture       | WARNING |
| Pattern Consistency| WARNING |
| Success Criteria   | PASS    |

**Evidence base**: diff `HEAD~1..HEAD` contains exactly the six files the plan named — no unplanned files. `npx supabase test db` re-run during review: Files=2, Tests=21, Result: PASS. An ad-hoc probe was run against the local DB to test the transitive role-gate claim empirically rather than by reasoning (see F3).

## Findings

### F1 — Count assertions break the isolation-robust precedent set in F-01

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `supabase/tests/database/specialist_listing_rls.test.sql:118-122`
- **Detail**: The anon block asserts unscoped totals — `count(*) from public.specialist_profiles = 1`, `services = 1`, `specialist_areas = 2`, `service_areas = 18`, `service_categories = 6`. F-01's suite deliberately avoided this: `profiles_rls.test.sql:39` scopes its count to the fixture ids and labels the choice "(scoped, isolation-robust)". These assertions silently encode "the table is empty at test start" and "the seed will never grow". A future `supabase/seed.sql` with demo specialists, or a second city added to the area dictionary, breaks them with a failure that points at the wrong thing.
- **Fix**: Scope the entity counts to the fixture ids (`where specialist_id in (...)` / `where id = '4444…'`) and the dictionary counts to their seed predicate (`where city = 'Warszawa'`).
- **Decision**: FIXED

### F2 — Role check inside the RLS policy depends on F-01's own read policy

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: `supabase/migrations/20260803120100_specialist_profiles_and_services.sql:120-126`
- **Detail**: `specialist_profiles_insert_own` / `_update_own` gate on `exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'specialist')`. That subquery is itself evaluated under the caller's RLS, so it depends on F-01's `profiles_select_own` policy continuing to expose the caller's own row. If that policy is ever narrowed, the subquery returns no rows and **every specialist write starts failing** — safely (fail-closed) but with no signal pointing at the cause. The coupling is invisible from either migration.
- **Fixed via Fix A.**
- **Fix A ⭐ Recommended**: Add a pgTAP assertion pinning the dependency — a specialist can read their own `profiles.role` — so a narrowing of F-01's policy fails a named test instead of surfacing as "specialists can't save anything".
  - Strength: Turns a silent coupling into a named, failing test; costs three lines.
  - Tradeoff: Documents the coupling rather than removing it.
  - Confidence: HIGH — the same suite already switches roles and reads `profiles`.
  - Blind spot: Doesn't help if someone deletes the pinning test along with the policy.
- **Fix B**: Move the role check into a `SECURITY DEFINER` helper function that bypasses RLS on `profiles`.
  - Strength: Removes the dependency entirely; the check works regardless of read policies.
  - Tradeoff: Adds a `SECURITY DEFINER` function — the same privilege-escalation surface F-01's `harden_handle_new_user` migration warns about; more machinery than the problem warrants at MVP scale.
  - Confidence: MEDIUM — correct, but it trades a documented coupling for a privileged code path.
  - Blind spot: Not benchmarked; a function call per write row.
- **Decision**: FIXED

### F3 — A client-role write is refused as a foreign-key error, not a permission error

- **Severity**: 📋 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260803120100_specialist_profiles_and_services.sql:132-134`
- **Detail**: Probed directly: a client-role account inserting into `public.services` with its own id is refused with `23503 services_specialist_id_fkey` ("Key is not present in table specialist_profiles") — **not** `42501`. The migration comment claims children "inherit the role gate transitively", which is true, but the enforcing mechanism is the foreign key, not the role policy. Phase 2 maps DB errors to user-facing messages; if it treats only `42501` as "not allowed", this path yields a raw FK error to a user. No test covers it — the suite asserts the client is blocked on `specialist_profiles`, never on `services`.
- **Fix**: Add a pgTAP assertion for the client-role-inserts-a-service path expecting `23503`, and note the code in the migration comment so Phase 2's error mapping is written against reality.
- **Decision**: FIXED

### F4 — `set_updated_at()` trigger added beyond the plan's contract

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `supabase/migrations/20260803120100_specialist_profiles_and_services.sql:14-20`
- **Detail**: The plan's Contract listed `created_at` / `updated_at` columns but named no keeper. A trigger function plus two triggers were added so `updated_at` doesn't freeze at insert time. This was disclosed before the commit and appears in the approved commit message, so it is documented scope rather than silent drift — but no test exercises it, so a broken trigger would go unnoticed.
- **Fix**: Add one pgTAP assertion that an UPDATE moves `updated_at`, and add the trigger to the plan's Phase 1 Contract as an addendum.
- **Decision**: FIXED

### F5 — Inconsistent FK delete actions across the dictionaries

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: `supabase/migrations/20260803120000_service_taxonomy_and_areas.sql:38`
- **Detail**: `service_subtypes.category_id` uses `on delete cascade` while every other dictionary reference (`specialist_areas.area_id`, `services.category_id`, the composite subtype FK) uses `on delete restrict`. Deleting a category would therefore try to cascade its subtypes and then be blocked by the restrict from `services` — safe, but the failure would be confusing. Impact is theoretical today: dictionaries are migration-only and v1 has no admin role.
- **Fix**: Change `service_subtypes.category_id` to `on delete restrict` so every dictionary reference behaves the same way.
- **Decision**: FIXED

### F6 — The database stores untrimmed display names

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260803120100_specialist_profiles_and_services.sql:29`
- **Detail**: The CHECK validates `char_length(btrim(display_name)) between 2 and 60` but the column stores the raw value, so `'  Ala  '` passes and is persisted with its padding. Phase 2's zod schema is planned to trim, which covers the app path — but PostgREST is reachable directly, and the DB is the boundary that has to hold everywhere else in this slice.
- **Fix**: Store the trimmed value — either trim in the `set_updated_at` trigger (rename it accordingly) or make the CHECK `display_name = btrim(display_name)` so untrimmed input is rejected outright.
- **Decision**: FIXED
