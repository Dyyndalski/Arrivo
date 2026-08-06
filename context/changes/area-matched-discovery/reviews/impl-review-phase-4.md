<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Area-Matched Specialist Discovery — Phase 4

- **Plan**: `context/changes/area-matched-discovery/plan.md`
- **Scope**: Phase 4 of 5 — specialist panel, new fields, two-step area picker
- **Commit**: `4e4d023` (19 files, +1058/−382)
- **Date**: 2026-08-06
- **Verdict**: NEEDS ATTENTION → resolved (F1–F3 fixed; F4 skipped deliberately)
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

**Evidence base**: `npm run build`, `npm run check` (0 errors, 74 files) and the CRLF-aware lint
check re-run green. `isCardComplete` has zero callers — the single grep hit is a docstring
recording what replaced it. Behaviour verified against real endpoints on the local stack: areas
from two cities persist together, Polish diacritics survive the round trip, a service saves with a
custom name / 120 min / `320,50` → 32050 grosze, and the banner tracks the view through
add → delete in both directions.

## Findings

### F1 — The banner's docstring describes a safeguard the component does not implement

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/components/specialist/CardStatus.astro:26-28`, `:39`, `:42`
- **Detail**: The component's own comment states:

  > "If they ever disagree this renders 'live' above a list of missing pieces — visibly
  > incoherent, which is deliberate. The failure that costs a specialist their bookings is the
  > silent one."

  It does not do that. Both the title and the body branch on `discoverable` alone:

  ```
  {discoverable ? t("…liveTitle") : t("…incompleteTitle")}
  {discoverable ? t("…liveBody")  : t("…incompleteBody", { missing: missingText })}
  ```

  When the view says discoverable, `missing` is discarded entirely. So the disagreement in the
  direction that actually matters — view says live, `missingPieces()` says a piece is absent —
  renders a plain "your card is live" and nothing else. Silent. That is precisely the failure
  class F4 was raised to eliminate, reintroduced one layer above the fix.

  This is reachable, not hypothetical. `getOwnCard()` and `isDiscoverable()` are two separate
  round trips issued from one `Promise.all` in both pages; a service deleted between them produces
  a real disagreement.

  The opposite direction is not silent but is malformed: with `missing` empty the body interpolates
  to "Brakuje: ." — a dangling period after nothing.

  The implementation is fine; the comment is a false claim about the property this phase exists to
  guarantee, which is worse than no comment because a future reader will trust it.
- **Fix**: Render the missing list whenever it is non-empty, independently of `discoverable`, and
  omit the sentence entirely when the list is empty. The banner then shows "live" *and* the
  contradiction whenever the two sources disagree, which is what the comment already promises.
  - Strength: Makes the documented failure mode real in about five lines, and removes the
    "Brakuje: ." rendering at the same time.
  - Tradeoff: The happy path gains a branch that is almost never taken.
  - Confidence: HIGH — read directly from the component; the race is visible in both pages' Promise.all.
  - Blind spot: Not measured how often the race actually fires; likely never in practice, which is
    an argument about frequency, not about the comment being wrong.
- **Decision**: FIXED — the headline still follows the view, but the missing-pieces line now
  renders whenever the list is non-empty, independently of `discoverable`, and is omitted entirely
  when the list is empty. A disagreement therefore shows as "your card is live" above a list of
  what it is missing, in either direction, and "Brakuje: ." is gone. The docstring was rewritten to
  describe what the component does — including *why* branching the list on `discoverable` was the
  wrong instinct.

### F2 — The area picker announces radios as toggle buttons

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/components/ui/AreaPicker.tsx` — `role="group"` wrapper, `aria-pressed` on each button
- **Detail**: Both modes use `role="group"` with `aria-pressed`. That is right for `multi`, where
  each district is an independent toggle. It is wrong for `single`, where exactly one may be
  chosen and the semantics are a radio group — `RoleToggle.tsx` in this same codebase already does
  it correctly with `role="radiogroup"` / `role="radio"` / `aria-checked`.

  No consumer of `single` exists yet; phase 5's client address screen is the first, and it is the
  screen aimed at a persona the PRD describes as elderly or limited-mobility.
- **Fix**: Switch the wrapper and item roles on `mode` — `radiogroup`/`radio`/`aria-checked` for
  single, the current pair for multi.
- **Decision**: FIXED — done before phase 5 builds the client address screen on it, so the first
  consumer of `single` gets the correct semantics rather than inheriting a fix later.

### F3 — An unknown success key claims a specific action happened

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/specialist/services.astro`, `src/pages/specialist/profile.astro`
- **Detail**: `tUnknown(locale, message, "specialist.message.serviceAdded")` — an unrecognised
  `?message=` resolves to "Usługa dodana". For `?error=` a generic fallback is right, because
  something did go wrong and we merely do not know what. For a success message the fallback
  asserts that a specific thing succeeded, which nothing has established: a hand-edited URL renders
  a green "Service added" over an unchanged list.
- **Fix**: Render the banner only when the key is recognised — `isMessageKey(message)` is already
  exported from `src/lib/i18n/t.ts` — rather than falling back to a claim.
- **Decision**: FIXED on both specialist screens. `tUnknown` stays for `?error=`, where a generic
  fallback is honest because something did go wrong; success banners now render only for a key the
  catalog knows.

### F4 — Saving the profile always writes `bio`, including absent

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: `src/lib/services/specialists.ts` — `upsertOwnCard`
- **Detail**: The schema normalises a missing or empty `bio` to `null` and `upsertOwnCard` writes
  it unconditionally, so any POST to `/api/specialist/profile` that omits the field clears an
  existing bio. Correct for the current form, which always submits the textarea. It becomes a
  silent data-loss path the moment a second, narrower form posts to the same endpoint — a partial
  save that wipes a field the user never saw.
- **Fix**: None required now. Worth a note on the endpoint that it is a full-record save, or
  distinguishing "absent" from "cleared" if a partial form ever appears.
- **Decision**: SKIPPED — correct for the only form that posts there today. Recorded here so a
  second, narrower form triggers the question rather than the data loss.

## Notes

- `SpecialistNav.astro` and the old `specialist/AreaPicker.tsx` were deleted rather than left
  orphaned; `bg-cosmic` is down to its last caller, the starter landing page, as the phase-3
  comment predicted.
- The specialist's identity block (avatar, email, role badge) lives in the sidebar footer, which is
  `hidden md:flex`. Below 720px there is no indication of which account is signed in, in an app
  with two roles and different panels per role. Not filed as a finding — the mockup's own
  stylesheet hides the sidebar at the same breakpoint — but worth deciding deliberately in phase 5,
  which adds the client-side screens.
