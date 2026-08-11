<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Specialist Booking Management

- **Plan**: context/changes/specialist-booking-management/plan.md
- **Scope**: Phases 1–5 of 5 (full plan)
- **Date**: 2026-08-10
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Automated criteria re-run at HEAD (`275c6d1`): `npx eslint .` exit 0; `npm run build` exit 0;
`npx supabase test db` exit 0 (Files=5, Tests=118, PASS).

Scope discipline: every item in "What We're NOT Doing" is respected — no decline reason, no
`cancelled` enum value, no cancellation of accepted bookings, no auto-completion, no sidebar, no
client name on a pending request, no notifications, no reviews. The only files outside the plan's
file lists are `src/lib/schemas/specialist.ts` and `src/lib/schemas/booking.ts`, both one-line id
schemas supporting planned endpoints.

## Findings

### F1 — A client is told "wygasła" and then refused a re-request for up to 15 minutes

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260807130000_booking_transitions.sql:255 (view) vs supabase/migrations/20260807100000_bookings.sql:90 (index)
- **Detail**: `bookings_view.effective_status` reads `expired` the moment the window closes, but
  `bookings_one_pending_per_pair` is a partial unique index on the **stored** status, and
  `cancel_booking` raises `Z0002` once `expires_at` has passed. So in the window between lapse and
  the next cron run (up to 15 minutes) the client's list says "Wygasła", the withdraw button is
  correctly absent — and requesting that specialist again fails with `23505` →
  `AlreadyPendingError` → "Masz już oczekujące zapytanie u tego specjalisty". The screen and the
  error contradict each other. The plan anticipated the index gap (migration comment at :251-253)
  but not this user-visible consequence.
- **Fix A ⭐ Recommended**: Let `request_booking` treat a lapsed pending row as absent — expire it
  inline (or exclude `expires_at <= now()` rows from the uniqueness check via a partial index on
  the computed condition) before the insert.
  - Strength: Removes the contradiction at its source; the same fix also shortens the lockout the
    plan already called a "trap" in the `cancel_booking` comment.
  - Tradeoff: Touches `request_booking`, an S-04 function with its own pgTAP coverage; needs new
    assertions.
  - Confidence: MEDIUM — the transition functions are the established place for this rule, but the
    index interaction needs care to stay race-free.
  - Blind spot: Have not checked whether an inline expire inside `request_booking` would need its
    own `for update` to stay safe against a concurrent cron run.
- **Fix B**: Map `23505` to a distinct message when the blocking row has already lapsed.
  - Strength: Small, contained in the service layer plus one catalog key per language.
  - Tradeoff: Explains the contradiction rather than removing it — the client still cannot book.
  - Confidence: HIGH — the error-code-to-typed-error mapping already exists at
    src/lib/services/bookings.ts:78-85.
  - Blind spot: Requires a second query to learn why the row blocked, or passing the reason out of
    the function.
- **Decision**: FIXED via Fix A — `supabase/migrations/20260810120000_expire_lapsed_pair_on_request.sql`
  (`create or replace function public.request_booking`, narrow `update` of the pair's own lapsed
  pending row to `expired`/`system` before the insert). Covered by 3 new assertions in
  `supabase/tests/database/bookings_rls.test.sql` (plan 23 → 26; suite 118 → 121, PASS after
  `supabase db reset`). Not yet pushed to hosted.

### F2 — Completion permanently hides the address from the specialist who performed the visit

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/pages/specialist/bookings.astro:62; policy at supabase/migrations/20260807100000_bookings.sql:152-161
- **Detail**: The plan's Phase 4 §2 contract says `listContactDetails` should be passed "the ids of
  bookings the caller already sees as `accepted` **or `completed`**". The page passes accepted only.
  The code is right and the plan is wrong: `booking_contact_details_select_accepted_specialist` is
  scoped to `status = 'accepted'`, so completed bookings return nothing regardless. The consequence
  is new in this slice — before S-05 nothing could reach `completed`. A specialist who marks a visit
  completed immediately loses the address and phone of the visit they just performed, and the card
  falls back to the anonymous heading (`specialist.bookings.anonymous`), so a finished job reads
  "Zapytanie o rezerwację" in their own history.
- **Fix A ⭐ Recommended**: Keep the behaviour, correct the plan's contract line and record the
  decision in the migration comment.
  - Strength: Preserves the PRD's launch guardrail exactly as written and keeps the policy the
    pgTAP suite pins; no schema change against a live database.
  - Tradeoff: A specialist's own completed-visit history is address-less, which may surface as a
    support question later.
  - Confidence: HIGH — the policy is quoted by the PRD guardrail and asserted from both sides in
    supabase/tests/database/bookings_rls.test.sql.
  - Blind spot: Have not checked whether S-06 (reviews) or any invoicing need assumes the specialist
    retains the address after completion.
- **Fix B**: Widen the policy to `status in ('accepted', 'completed')`.
  - Strength: Matches what the plan actually specified and what a working specialist likely expects.
  - Tradeoff: Extends address visibility indefinitely past the visit — a real widening of the
    guardrail the PRD calls load-bearing, and it needs new assertions plus a hosted push.
  - Confidence: MEDIUM — mechanically simple, but it is a privacy-boundary change and those have
    already bitten this project once (lessons.md, local-vs-hosted `service_role`).
  - Blind spot: No retention rule exists anywhere in the project to bound how long that stays true.
- **Decision**: FIXED via Fix A — plan.md Phase 4 §2 contract corrected with a blockquote recording
  why `completed` is excluded and what it costs; the same decision restated at
  src/pages/specialist/bookings.astro:62. No schema or behaviour change.

### F3 — `create view … select b.*` freezes the column list at creation

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: supabase/migrations/20260807130000_booking_transitions.sql:259
- **Detail**: Postgres expands `b.*` when the view is created. A later `alter table public.bookings
add column` will not appear in `bookings_view` until the view is recreated — while
  `BookingView extends Booking` (src/types.ts:199) will claim the field exists, so it reads as
  `undefined` at runtime with no type error. This slice added `resolved_by` to `bookings` one
  migration earlier, so the next column is a realistic near-term event.
- **Fix**: Add a line to the view's comment block stating that any future column on `bookings`
  requires a `create or replace view public.bookings_view` in the same migration.
- **Decision**: FIXED — warning added to the `--` block above the view in
  20260807130000_booking_transitions.sql (inert text, so no divergence from the applied migration)
  and to the `BookingView` docstring in src/types.ts, which is where the type makes the promise.

### F4 — Two exports named `bookingIdSchema` differing only by error key

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/schemas/specialist.ts:104 and src/lib/schemas/booking.ts:26
- **Detail**: Both are `z.uuid({ error })`; they differ only in whether a malformed id resolves to a
  `specialist.*` or a `bookings.*` catalog key. The split is deliberate and commented, but the
  identical export name means an auto-import in a future endpoint can silently pick the wrong one
  and redirect a client to a specialist-namespaced message.
- **Fix**: Rename the client one to `clientBookingIdSchema` (one definition, one import site).
- **Decision**: FIXED — renamed in src/lib/schemas/booking.ts; both references in
  src/pages/api/bookings/[id]/cancel.ts updated.

### F5 — `TooEarlyError` caught where it cannot be raised

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/specialist/bookings/[id]/accept.ts:44, .../decline.ts:41
- **Detail**: `Z0003` is raised only by `complete_booking`. Accept and decline list `TooEarlyError`
  in their catch chain, so the branch is dead. Harmless uniformity, but it suggests the error is
  reachable there. The cancel endpoint (src/pages/api/bookings/[id]/cancel.ts:44) handles the same
  situation the other way and explains it in a comment.
- **Fix**: Drop `TooEarlyError` from the accept and decline catch chains, or add the one-line
  comment the cancel endpoint uses.
- **Decision**: FIXED — dropped from the import and the catch chain in both accept.ts and
  decline.ts, each with a one-line comment saying why it is absent.

### F6 — Planned `src/components/booking/strings.ts` never touched

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: N/A (context/changes/specialist-booking-management/plan.md, Phase 4 §5)
- **Detail**: Phase 4 §5 lists `src/components/booking/strings.ts` among the files it touches. It
  was not modified. The reason is sound: that module exists to hand resolved strings to React
  islands, and the specialist inbox is pure Astro (`RequestCard.astro`), so nothing crosses into a
  client bundle — which is also why criterion 4.3 passes trivially. The deviation is correct but
  undocumented.
- **Fix**: Note in the plan that no island was needed, so no string props were required.
- **Decision**: FIXED — blockquote added under plan.md Phase 4 §5 recording that the inbox is pure
  Astro, so `strings.ts` had nothing to carry, and naming the condition (an island in this inbox)
  under which it would.
