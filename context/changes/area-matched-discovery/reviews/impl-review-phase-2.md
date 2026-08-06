<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Area-Matched Specialist Discovery — Phase 2

- **Plan**: `context/changes/area-matched-discovery/plan.md`
- **Scope**: Phase 2 of 5 — schema and data
- **Commit**: `7968171` (12 files, +875/−11), pushed to the hosted project
- **Date**: 2026-08-04
- **Verdict**: NEEDS ATTENTION → resolved (F1–F3 fixed; F4 skipped, captured in a migration comment)
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | WARNING |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

**Evidence base**: `supabase db reset` applies all 11 migrations from scratch; `supabase test db`
is 53 assertions green across three files; `npm run build`, `npm run check` (0 errors) and the
CRLF-aware lint check are clean. Verified against the hosted project after `db push`: the existing
specialist's areas 1 and 4 still resolve to Bemowo and Mokotów in Warszawa, the view returns him
to `anon`, `client_profiles` is refused (401), and a review insert is refused (401). PostgREST
embedding through the view was confirmed working, including `!inner` and the combined
area × category × price filter phase 5 needs.

## Findings

### F1 — The live specialist area picker became unusable when this phase pushed to production

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: `src/lib/services/specialists.ts:61-65`, `src/components/specialist/AreaPicker.tsx:39`
- **Detail**: `getServiceAreas()` is `select("*").order("sort_order")` — a flat list with no city
  grouping — and `AreaPicker` renders `{area.name}` and nothing else. That was correct for one
  city with 18 uniquely-named districts. This phase replaced that dictionary with 67 areas across
  10 cities, where `sort_order` restarts at 10 per city, and pushed it to hosted.

  What a signed-in specialist sees at `/specialist/profile` on production right now, in this
  order:

  ```
   10  Całe miasto           Katowice
   10  Całe miasto           Szczecin
   10  Całe miasto           Bydgoszcz
   10  Całe miasto           Lublin
   10  Stare Miasto          Wrocław
   10  Śródmieście           Gdańsk
   10  Bemowo                Warszawa
   ...
  ```

  — except the city column does not exist in the UI. Four identical "Całe miasto" checkboxes,
  three "Stare Miasto", four "Śródmieście", interleaved across cities, 67 of them. A specialist
  cannot tell which one is theirs, and the declared-area selection is the single input the whole
  product wedge reads.

  Production is live (`arrivo.dyndalski.workers.dev` returns 200; `/specialist/profile` 302s to
  sign-in, so the route serves for authenticated specialists). Nothing crashes — `area.name` still
  exists — which is why no automated criterion caught it.

  The plan is where this went wrong, not the implementation: it sequenced the data change into
  phase 2 and the two-step picker into phase 4, and never asked what the *existing* picker does
  with the new data in between. The phase-2 manual criteria checked that the production
  specialist's saved areas still resolve — they do — but not whether he could still edit them.
- **Fix A ⭐ Recommended**: Bring the ordering fix forward into a small phase-2 follow-up — order
  by city then `sort_order`, and have `AreaPicker` render a city label per group. Leave the
  two-step city→district picker in phase 4 as planned.
  - Strength: Restores a usable screen in a change of a few lines, without pulling phase 4's
    component rework forward into a phase that is already committed and pushed. The grouped list
    is also the fallback the two-step picker degrades to.
  - Tradeoff: Touches `AreaPicker` twice — once now, once properly in phase 4.
  - Confidence: HIGH — the defect and the fix were both observed directly against hosted data.
  - Blind spot: Not verified how a 67-item grouped list behaves on a narrow viewport; phase 4's
    picker is what actually solves that.
- **Fix B**: Pull phase 4's two-step picker forward to immediately after phase 2.
  - Strength: Fixes it once, properly, and the picker is needed by phase 5's client screen anyway.
  - Tradeoff: Reorders the plan mid-flight and drags the specialist-panel retrofit ahead of the
    auth retrofit that phase 3 gates with a regression pass.
  - Confidence: MEDIUM — the component is not written yet, so its cost is estimated.
  - Blind spot: Whether the picker can be built without the phase-3 i18n retrofit it will want.
- **Decision**: FIXED via Fix A. `getServiceAreas()` is replaced by `getAreaDictionary()`, which
  returns cities alongside areas sorted by the city's own order then the district order — the
  sort is in TypeScript rather than the query because `sort_order` restarts per city and ordering
  by `city_id` would silently depend on the identity sequence. `AreaPicker` now renders one
  labelled group per city, and each button carries `aria-label="<district>, <city>"` so a screen
  reader does not announce "Całe miasto" four times. Verified against live hosted data: 10 groups,
  67 areas, every repeated name now disambiguated by its heading. The two-step picker remains
  phase 4's.

### F2 — `min_price_cents` ignores the filter the client actually applied

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: `supabase/migrations/20260804120400_discoverable_specialists.sql`
- **Detail**: The view computes `min(price_cents)` over *all* of a specialist's services. The
  discovery card in `discover.html` renders that as "od 90 zł" directly beneath the category the
  client filtered by.

  So a specialist offering a 70 zł men's haircut and a 150 zł manicure, shown in a search filtered
  to Paznokcie, advertises "od 70 zł" for a service that costs 150 zł. The number is true about
  the specialist and false about the search — and the price filter has the same split: a
  `price_cents <= 10000` filter admits that specialist on the strength of the haircut, then the
  card quotes the haircut too, so the client only discovers the real price on the profile.

  Not reachable today (the one production specialist has a single service), which is exactly why
  it needs recording now rather than being found in phase 5's manual pass.
- **Fix**: In phase 5, derive the displayed minimum from the *embedded* (already filtered)
  services and fall back to the view's `min_price_cents` only when no category or price filter is
  active. The view keeps reporting the unfiltered truth; the card stops mislabelling it.
- **Decision**: FIXED by writing the contract into the plan rather than changing the view. Phase
  5's "Discovery query" section now specifies `displayPriceFrom(specialist, filters)` and states
  why the view's value must not be rendered under an active filter; a new automated criterion
  (5.6) greps for it. The view is left alone deliberately — it has no consumer yet, and removing
  a column that is correct for the unfiltered case would cost a production migration to prevent a
  misuse the plan now forbids.

### F3 — The `service_role` lesson was not discharged either way

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: all five migrations in `supabase/migrations/20260804*`
- **Detail**: `context/foundation/lessons.md` carries an accepted rule from S-02: *"When a slice
  adds a table that a scheduled job or server-side task will need, grant that access explicitly in
  the same migration — or decide deliberately that the job will use a `SECURITY DEFINER` function
  instead. Do not assume Supabase's defaults left `service_role` with access."*

  This phase added three tables and a view. None of the five migrations mentions `service_role`,
  in a grant or in a comment. The conclusion happens to be "nothing here needs it" — S-05's
  auto-expire cron touches `bookings`, and every S-03 path runs under a user session — but the
  rule asks for that to be a recorded decision, because the next person reading these migrations
  cannot tell the difference between "considered and unnecessary" and "not considered".
- **Fix**: Add one comment to `20260804120100_client_profiles.sql` and
  `20260804120300_reviews.sql` recording that no server-side path needs `service_role` on them,
  and that S-05/S-06 must revisit when the cron and the review writer arrive.
- **Decision**: FIXED — both migrations now record the decision explicitly, including the
  recommendation to prefer a `SECURITY DEFINER` function over a blanket grant on
  `client_profiles` should a job ever need it, since a blanket grant there hands away exactly what
  the privacy guardrail protects. Comment-only edits to already-applied files: verified that the
  diff adds no non-comment lines, and that `db reset` plus the 53-assertion pgTAP suite are still
  green.

### F4 — `reviews.client_id` has no role constraint

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: `supabase/migrations/20260804120300_reviews.sql`
- **Detail**: `client_id` references `public.profiles`, which holds both roles, so a
  specialist-role id is structurally acceptable in that column. Unreachable today — nobody holds
  the insert grant — and correctly so, since the real gate (FR-013: a completed booking) is
  S-06's. Recorded so S-06 adds the role check with the booking check rather than only the
  booking check.
- **Fix**: None here. S-06's insert policy must assert `profiles.role = 'client'` alongside the
  completed-booking predicate.
- **Decision**: SKIPPED as a separate action — but the requirement was captured incidentally
  while fixing F3: the `service_role` comment in `20260804120300_reviews.sql` now states that
  S-06's insert policy needs both the completed-booking check and a role check, and why. Not
  recorded in `change.md`, which is where a reader of the next slice would look first.

## Notes

- The pgTAP plan count was written as 24 against 26 assertions and corrected before the suite went
  green; worth remembering that `plan(N)` failures report as a parse error, not as a failed test.
- Phase-2 verification found `client_profiles` closed at two layers rather than one: `anon` holds
  no `SELECT` grant at all, so PostgREST refuses before RLS is consulted. The test now asserts the
  outer layer.
