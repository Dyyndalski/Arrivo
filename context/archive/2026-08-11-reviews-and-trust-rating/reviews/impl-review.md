<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Reviews and Trust Rating (S-06)

- **Plan**: `context/changes/reviews-and-trust-rating/plan.md`
- **Scope**: Phases 1–4 of 4 (full plan)
- **Date**: 2026-08-31
- **Verdict**: REJECTED (one critical finding, caught before the migration is pushed)
- **Findings**: 1 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Success criteria re-run (2026-08-31)

| Check | Result |
|---|---|
| `npx eslint . ; echo $?` | 0 |
| `npm run build` | 0 |
| `npx supabase test db` (after `db reset`) | 0 — 139 tests, was 121, +18 |
| `npx supabase test db` (without reset) | **1** — see F4 |

Manual items 3.3, 3.4, 4.5–4.10 remain unchecked in `## Progress`; 4.9 (`db push`) and 4.10
(`wrangler deploy`) have not run, which is why F1 is still cheap to fix.

## Findings

### F1 — A specialist can still identify who rated them, via `booking_id`

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; the fix touches the view the aggregate reads
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260811120000_review_write_path.sql:80-96`, and the assertion at `supabase/tests/database/reviews_rls.test.sql:171-176`
- **Detail**:
  The migration withholds `reviews.client_id` from `authenticated` with a column-level grant, and
  states the goal in its own comment: "a specialist can join their own bookings against reviews and
  learn exactly which client gave them one star … the only available answer to retaliation is not to
  publish the authorship."

  The grant keeps `booking_id`, and `bookings_select_addressed_specialist`
  (`20260807100000_bookings.sql:135-137`) gives a specialist a table-wide `select` on every booking
  where `specialist_id = auth.uid()` — `client_id` included. `reviews_select_all` is still
  `using (true)`. So the join `reviews.booking_id → bookings.id` re-derives the author with no
  reference to `reviews.client_id` at all.

  Verified empirically against the local stack as role `authenticated` with the specialist's JWT:

  ```
  --- ATTACK: specialist joins own bookings to reviews via booking_id ---
   rating |          created_at           |           author_uncovered           |          proposed_at
  --------+-------------------------------+--------------------------------------+-------------------------------
        1 | 2026-08-31 07:27:56.399189+00 | fa000000-0000-0000-0000-0000000000ac | 2026-08-29 07:27:56.399189+00
  ```

  This is reachable from the app's own API surface, not only from raw SQL: the FK exists, so
  `supabase.from("reviews").select("rating, bookings(client_id)")` — or simply two queries — works
  with the anon key plus the specialist's own session.

  The compounding half is the test. `reviews_rls.test.sql:171` asserts "the specialist CANNOT learn
  who wrote it" by reading `client_id` directly. It passes, and it makes the suite state a property
  the database does not have — the same failure shape `lessons.md` entry 5 records for
  `service_role`.

- **Fix A ⭐ Recommended**: Restrict the row policy to the author, and move the aggregate off the caller's rights.
  Replace `reviews_select_all using (true)` with `using (client_id = (select auth.uid()))` — RLS
  predicates are not subject to the caller's column privileges, so this works despite the withheld
  grant, and `listOwnRatings` (which reads only the caller's own bookings) keeps working unchanged.
  Then give `discoverable_specialists` its rating numbers from a `security definer` function instead
  of a correlated subquery, so `security_invoker = true` no longer zeroes every average. Extend
  `reviews_rls.test.sql` with the join above as a negative assertion.
  - Strength: Closes the vector at the layer that actually holds, and replaces a false assertion
    with one that would fail if the vector reopened. Empirically reproducible both before and after.
  - Tradeoff: One migration touching a shipped view plus new assertions — the largest single piece
    of work left on this slice. The `security definer` function becomes a boundary of its own and
    must be revoked from `public, anon` like every other function here.
  - Confidence: HIGH — the exploit is reproduced, and the migration already documents why a plain
    revoke on the table would break the aggregate, which is exactly what the function sidesteps.
  - Blind spot: Have not measured the view's plan with a function call in place of the two
    correlated subqueries; on cold-start data volumes this is unlikely to matter.
- **Fix B**: Accept the exposure and stop claiming otherwise.
  Leave the grants as they are, rewrite the migration comment to say authorship is *not* hidden, and
  delete or re-word the `reviews_rls.test.sql:171` assertion so the suite stops vouching for it.
  - Strength: Zero risk to the aggregate, minutes of work, and honest — a specialist who performed
    the visit already knows who they visited, so the uuid adds less than it first appears.
  - Tradeoff: The retaliation vector stays open in a v1 that has no moderation and no admin to
    appeal to, and per-booking ratings stay individually attributable no matter how many land.
  - Confidence: MEDIUM — defensible as a scoped v1 limitation, but it contradicts the reasoning the
    slice was designed around.
  - Blind spot: Whether any reviewer of this project reads the migration comment as a claim about
    production behaviour.
- **Decision**: FIXED via Fix A — new migration `supabase/migrations/20260831093000_hide_review_authorship.sql` (row policy narrowed to the author + aggregate moved to a `security definer` function), plus two new pgTAP assertions including the join itself.

### F2 — Polish copy addresses every user as male

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/lib/i18n/messages/pl.ts:397`
- **Detail**:
  `"reviews.error.alreadyRated": "Tę wizytę już oceniłeś — oceny nie można zmienić"` — `oceniłeś` is
  masculine second-person past. It is the only gendered past-tense form in the whole 404-line
  catalog; everything else stays neutral (`"Nie jesteś zalogowany"`, `"Wybierz, czy jesteś
  klientem…"`). On a beauty/hair marketplace the majority of clients will read a form that does not
  fit them.
- **Fix**: Rewrite impersonally: `"Ta wizyta została już oceniona — oceny nie można zmienić"`.
- **Decision**: FIXED — `pl.ts` now reads "Ta wizyta została już oceniona — oceny nie można zmienić".

### F3 — Star buttons announce a value, not an action

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/components/booking/RatingForm.astro:33-34`, `src/lib/i18n/messages/{pl,en}.ts` (`reviews.star`)
- **Detail**:
  Each star is a submit button whose accessible name is `"{count} z 5"` / `"{count} out of 5"`. A
  screen-reader user hears "button, 3 z 5" with no indication that pressing it files a permanent,
  unchangeable rating. The same key is also the `title`, so the visual tooltip reads the same way.
  Accessibility is a PRD non-goal for v1 (Open Question 6), which is why this is an observation and
  not a warning — but the persona this product is built for is the elderly and limited-mobility
  client.
- **Fix**: Change the copy to name the action — `"Oceń na {count} z 5"` / `"Rate {count} out of 5"`.
  One key, both catalogs, no component change.
- **Decision**: FIXED — `reviews.star` now names the action: "Oceń na {count} z 5" / "Rate {count} out of 5".

### F4 — The pgTAP suite is only green on a freshly reset database

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `supabase/tests/database/bookings_rls.test.sql:39` (pre-existing, S-04)
- **Detail**:
  Running `npx supabase test db` twice without an intervening `npx supabase db reset` fails:

  ```
  ERROR: duplicate key value violates unique constraint "specialist_areas_pkey"
  DETAIL: Key (specialist_id, area_id)=(65f698a5-…, 4) already exists.
  Bad plan. You planned 26 tests but ran 0.  →  Result: FAIL, exit 1
  ```

  Fixtures leak across runs. This first run of the review reported a red suite that looked exactly
  like an S-06 regression and was not one — the plan's criterion "`npx supabase test db ; echo $?`
  prints 0" is not reproducible on its own terms, and `lessons.md` entry 2 makes the exit code the
  thing this project trusts. Not introduced by S-06; surfaced by it.
- **Fix**: Make the criterion honest and the suite self-contained — state the reset as part of the
  command in the plan (`npx supabase db reset && npx supabase test db`), and file the fixture
  collision so a later slice makes each test file idempotent. Good candidate for `/10x-lesson`.
- **Decision**: FIXED + ACCEPTED-AS-RULE — lesson appended to `context/foundation/lessons.md` ("A green pgTAP suite requires a reset first"); the plan's three database criteria now read `npx supabase db reset && npx supabase test db`. The fixture collision itself is left to a later slice.

### F5 — Two documented deviations from the plan's letter

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; nothing to change
- **Dimension**: Plan Adherence
- **Location**: `src/lib/services/reviews.ts:29`, `src/lib/schemas/limits.ts:72-77`, `src/pages/account/bookings.astro:165`
- **Detail**:
  Three small departures, each an improvement and each documented at the site:
  `NotYoursError` → `NotYourVisitError` (avoids a same-named export colliding with
  `services/bookings.ts` on auto-import — cites the previous slice's review); `RATING_MIN`/`RATING_MAX`
  added to `limits.ts` rather than hardcoded in the schema and the form; and the already-rated state
  reuses the existing `components/ui/Stars.astro` instead of a new static display. Recorded so a
  later reader does not mistake them for drift.
- **Fix**: None needed.
- **Decision**: ACKNOWLEDGED — deviations reviewed and kept; nothing to change.
