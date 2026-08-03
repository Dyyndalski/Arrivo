<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Specialist Profile + Service Listing (S-02)

- **Plan**: `context/changes/specialist-service-listing/plan.md`
- **Scope**: Full plan (phases 1–3), with emphasis on phase 3 and cross-phase interactions
- **Date**: 2026-08-03
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

**Scope note**: phases 1 and 2 were each reviewed and fully triaged already (12 findings, all fixed — see `impl-review-phase-1.md`, `impl-review-phase-2.md`). This pass therefore covers phase 3, which had no review of its own, plus interactions between phases. Findings already fixed are not repeated.

**Evidence base**: `npm run build` and the CRLF-aware lint check are clean; pgTAP is 27 assertions across 2 files, all passing; production is deployed (version `cf65a752`) and its routes gate correctly. The client bundle was inspected directly on disk to confirm F1.

## Findings

### F1 — zod ships to the browser to deliver four numbers

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/components/specialist/ProfileForm.tsx:7`, `src/components/specialist/ServiceForm.tsx:6`, `src/lib/schemas/specialist.ts`
- **Detail**: Both React islands import bounds (`DISPLAY_NAME_MIN/MAX`, `PRICE_MIN_CENTS/MAX`) from `@/lib/schemas/specialist`. That module calls `import { z } from "zod"` and constructs its schemas at module scope, so the import cannot be tree-shaken down to the constants — the whole library follows them into the island. Measured in the deployed output: `dist/client/_astro/specialist.oTcJN1d4.js` is **65 KB** and contains zod's runtime (`ZodError`, `_zod` markers), making it the largest client chunk after React itself. Nothing in the browser ever calls a zod schema; validation runs in the endpoint.
  This lands badly against two things the PRD is explicit about: the p95 "results in under a second" NFR, and a primary persona of elderly / limited-mobility clients who are not on fast devices. It is also a pattern the next slices will copy — S-03's filter UI will want the same constants.
- **Fix**: Move the shared bounds into a dependency-free module (e.g. `src/lib/schemas/limits.ts`) and have both `specialist.ts` and the two islands import from there. The server keeps validating through zod; the browser gets four numbers.
- **Decision**: PENDING

### F2 — The load-failure path shows an empty form and blames the wrong thing

- **Severity**: 📋 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/pages/specialist/profile.astro:19-21`, `src/pages/specialist/services.astro:22-24`
- **Detail**: When the card cannot be loaded, both pages fall back to the empty default (`{ profile: null, area_ids: [], services: [] }`) and render normally — so a specialist with a saved profile sees a blank name, no districts ticked, and a banner saying their card is not visible. The accompanying message is `"Supabase is not configured"`, which is also emitted for `!user`, a different cause entirely. No data is actually at risk (submitting an empty form is blocked by validation), but the screen states something false about the specialist's saved work.
- **Fix**: Separate the two causes, and on a load failure render the error in place of the form rather than around an empty one.
- **Decision**: PENDING

### F3 — Route prefixes match more than they name

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: `src/middleware.ts:5-15`
- **Detail**: Both lists are tested with `startsWith`, so `/specialist` also claims `/specialists`, `/specialist-signup`, and anything else sharing the prefix — as `/dashboard` already did before this slice. Harmless today because no such route exists, and it fails closed (an unintended match is gated, not exposed). It becomes a trap the moment someone adds a public `/specialists` browse page, which is exactly what S-03 is: that page would silently require a specialist account to view.
- **Fix**: Match on a path boundary — `pathname === route || pathname.startsWith(route + "/")`.
- **Decision**: PENDING

### F4 — The completeness rule is a cross-slice contract with nothing enforcing it

- **Severity**: 📋 OBSERVATION
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architecture
- **Location**: `src/lib/services/specialists.ts:158-172`
- **Detail**: `isCardComplete()` decides what a specialist is told about their own visibility. S-03's discovery query will decide what clients actually see. These are two implementations of one rule in two slices, and they are only kept in agreement by intent. If they diverge, the failure is silent and asymmetric in the worst direction: a specialist reads "Your card is live" while no client can find them — supply that believes it is participating and is not, against a success metric of "≥50% of specialists receive a booking". This is recorded in `change.md`, but a note is not a guard.
- **Fix**: When S-03 lands, have the discovery query consume the same predicate — either by building the query from it, or by adding a test that asserts a card `isCardComplete()` accepts is one discovery returns. Decide the mechanism when the query exists, not now.
- **Decision**: PENDING

### F5 — No automated coverage for anything above the database

- **Severity**: 📋 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `package.json`
- **Detail**: The slice added 27 pgTAP assertions and no JS tests, per plan and per CLAUDE.md (test strategy is a later module). The consequence is visible in this change's own history: phase 2's F1/F2 were confirmed only because the schemas were run by hand under `node --experimental-strip-types`, and both had already survived a full end-to-end pass. The validation layer and the completeness rule are pure functions with no I/O — the cheapest possible things to test — and they are precisely where the bugs were.
- **Fix**: Out of scope to fix here. Worth raising when the test-runner decision is made, with `src/lib/schemas/` and `isCardComplete` as the first candidates.
- **Decision**: PENDING
