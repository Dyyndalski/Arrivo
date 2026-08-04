<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Specialist Profile + Service Listing (S-02)

- **Plan**: `context/changes/specialist-service-listing/plan.md`
- **Scope**: Phase 2 of 3 — Validated write layer
- **Date**: 2026-08-03
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | WARNING |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

**Evidence base**: the phase-2 diff (commit 42f4264) contains exactly the files the plan named, plus the `smallint` bound added mid-phase. `npm run build` passes; the CRLF-aware lint check is empty. The endpoints were exercised end-to-end against the local stack with real session cookies. F1 and F2 below were then confirmed by running the schemas directly under `node --experimental-strip-types` — neither is reachable through the current happy path, which is exactly why they survived the E2E pass.

## Findings

### F1 — An absent `subtype_id` is rejected instead of read as "not chosen"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/schemas/specialist.ts:44-48`
- **Detail**: `subtype_id` is `z.union([z.literal(""), dictionaryId(...)]).optional()`. `.optional()` admits `undefined` — but `FormData.get()` returns **`null`** for a field that is not present in the POST, and null falls through to the numeric branch where `Number(null)` coerces to `0` and fails `.positive()`. Confirmed directly:
  `FAIL subtype_id absent (form.get -> null) -> "Choose a valid option for that service type"`.
  The E2E pass never caught it because every request sent `subtype_id=""`. Phase 3 renders a select that will normally post an empty string, so this stays latent until any form variant, progressive-enhancement path, or non-browser client omits the field — and then a valid "category only" listing is refused for no visible reason. Subtype-optional is a decision the whole taxonomy shape rests on.
- **Fix**: Normalize before validating rather than enumerating empty representations — `z.preprocess((v) => (v === "" || v == null ? null : v), dictionaryId(...).nullable())`. This also removes the union, which fixes F2.
- **Decision**: FIXED

### F2 — Union failures leak zod's internal wording to the user

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/schemas/specialist.ts:44-48`, `src/lib/schemas/parse.ts:19`
- **Detail**: A union reports failure as a single `invalid_union` issue whose message is the generic `"Invalid input"`; the per-branch `error:` labels never surface. Since `parseOrError` returns `issues[0].message` verbatim and the endpoint puts it straight into `?error=`, the user is shown `"Invalid input"`. Confirmed:
  `FAIL subtype_id garbage text -> "Invalid input"`.
  Every other field in this slice produces a written, actionable sentence; this one silently does not.
- **Fix**: Same edit as F1 — dropping the union lets the field's own message through. `parseOrError`'s fallback stays as the last resort it was meant to be.
- **Decision**: FIXED

### F3 — A failed area insert leaves the specialist with no areas at all

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: `src/lib/services/specialists.ts:112-127`
- **Detail**: `upsertOwnCard` replaces areas by DELETE-then-INSERT across two PostgREST calls with no enclosing transaction. If the INSERT fails — a stale `area_id` after a dictionary change, a dropped connection at the edge — the DELETE has already committed. The specialist is left with **zero** declared areas, which by the completeness rule silently makes their card undiscoverable, and the only feedback is a generic "Could not save your profile". The existing comment acknowledges the window but understates it: this is not just a retry, it is a state strictly worse than before the request.
- **Fixed via Fix A.**
- **Fix A ⭐ Recommended**: Invert the order — upsert the new rows first (`onConflict: "specialist_id,area_id"`, ignore duplicates), then delete the rows whose `area_id` is not in the new set. A failure at step 1 changes nothing; a failure at step 2 leaves a superset. Neither outcome loses data, and no new database object is needed.
  - Strength: Removes the destructive window entirely with a reordering, staying inside the existing two-call shape.
  - Tradeoff: A step-2 failure leaves stale areas — over-declaring rather than under-declaring. Safer, but the specialist may briefly serve areas they meant to drop.
  - Confidence: HIGH — same primitives, same round-trip count.
  - Blind spot: Not exercised under a real mid-request failure; the reasoning is about ordering, not measured.
- **Fix B**: Move both statements into a `SECURITY INVOKER` Postgres function called through `supabase.rpc()`.
  - Strength: Genuinely atomic — the only option that makes replace-areas all-or-nothing.
  - Tradeoff: A new database object plus a migration to hosted for a two-row edit; the app's data access stops being uniform PostgREST calls.
  - Confidence: MEDIUM — correct, but heavier than the problem at MVP scale.
  - Blind spot: Adds a migration to a slice whose schema work is already pushed and reviewed.
- **Decision**: FIXED

### F4 — Deleting a service that isn't yours reports success

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/services/specialists.ts:139-142`
- **Detail**: The delete is correctly scoped by `id` **and** `specialist_id`, so nothing unauthorized is ever removed — the boundary holds. But PostgREST reports no error when zero rows match, so a stale tab, a double submit, or a hand-crafted id all redirect with "Service removed" while nothing was removed. The UI then contradicts itself on reload.
- **Fix**: Ask for the deleted rows back (`.select()`) and report "Service removed" only when one came back; otherwise a neutral "That service is no longer there".
- **Decision**: FIXED

### F5 — `NotAllowedError` renders a misleading message on the services endpoint

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/specialist/services.ts:44-47`
- **Detail**: `NotAllowedError` is raised for both `23503` (no card yet) and `42501` (a genuine policy refusal), but the services endpoint answers both with "Save your profile first, then add services". A real permission failure would therefore send the user to re-save a profile they already have. The sibling endpoints use `err.message` and stay accurate. The two causes are already distinguishable at the point they are caught — the distinction is just discarded.
- **Fix**: Carry the SQLSTATE on `NotAllowedError` and branch on it, or raise a distinct `NoCardError` for `23503`.
- **Decision**: FIXED

### F6 — Validation bounds are duplicated between zod and the migrations with nothing enforcing agreement

- **Severity**: 📋 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: `src/lib/schemas/specialist.ts:4-11,37`, `supabase/migrations/20260803120100_specialist_profiles_and_services.sql:29`
- **Detail**: The name bounds (2..60), the `smallint` ceiling (32767) and the price range exist twice — once as zod rules, once as CHECK constraints and column types. Three comments say "keep the two in step", which is the only thing keeping them in step. Drift is silent and asymmetric: loosening zod turns a friendly message into a raw constraint error, tightening the database makes valid-looking input fail after passing validation. This is inherent to validating in two places and cannot be fully removed; the question is whether it is worth a guard.
- **Fix**: Add a pgTAP assertion pinning the DB-side bounds (a 61-character name is refused, a 1-grosz price is accepted) so a migration that moves them fails a test that names the schema file as its counterpart.
- **Decision**: FIXED
