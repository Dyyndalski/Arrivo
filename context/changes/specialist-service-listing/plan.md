# Specialist Profile + Service Listing (S-02) — Implementation Plan

## Overview

A signed-in specialist can create and edit a provider profile (display name + declared service areas) and list services (a type from a fixed two-level taxonomy + a price). This is the supply side of the marketplace: without it, S-03's area-matched discovery has nothing to match against and nothing to show.

Roadmap slice S-02 (`context/foundation/roadmap.md`), PRD refs US-02, FR-004, FR-005.

## Current State Analysis

The domain data layer is one table deep. F-01 landed `public.profiles` (`id`, `role`, timestamps) with a `user_role` enum, a `SECURITY DEFINER` trigger as its sole writer, and own-row-only RLS. S-01 built the role-aware auth UI on top. Nothing else in the domain exists — no specialist identity beyond `role = 'specialist'`, no areas, no services.

Key constraints discovered:

- **`profiles` is deliberately write-sealed.** `supabase/migrations/20260728154212_profiles_roles_rls.sql:22-23` does `revoke all on public.profiles from anon, authenticated` and grants only `select`. That absence of a write path *is* the mechanism making `role` non-escalatable — `supabase/tests/database/profiles_rls.test.sql:49` asserts it (error `42501`). The F-01 plan-brief flags this as a live risk for later slices: *"if a future slice grants profile writes, it must exclude `role`."*
- **All RLS to date is own-row.** No policy in the project grants `anon` anything. S-02 is the first slice to open a public read surface, which PRD §Access Control requires ("unauthenticated visitors may browse public specialist listings").
- **Forms are progressively-enhanced HTML, not fetch.** `src/components/auth/SignUpForm.tsx:75` posts a native `<form method="POST" action="/api/...">`; the endpoint redirects back with `?error=` (`src/pages/api/auth/signup.ts:44`). Client-side validation is advisory (`noValidate` + `e.preventDefault()`), the server re-validates. HTML forms emit only GET/POST — no DELETE verb available.
- **Middleware gates on authentication only.** `src/middleware.ts:32-36` checks `PROTECTED_ROUTES` against `context.locals.user`. `context.locals.role` is resolved (`:22-28`) but never used for authorization yet.
- **`zod` is absent** from `package.json`. `context/foundation/lessons.md` carries an open rule: retrofit the auth endpoints onto schemas when zod lands for the first endpoint that genuinely needs it.
- **pgTAP is the only test runner.** `supabase test db` over `supabase/tests/database/`. No Vitest/Playwright, and CLAUDE.md places test strategy in a later module.
- **No `.gitattributes` at the repo root**, so the CRLF lint trap from `lessons.md` is still live: real `prettier/prettier` errors hide among CRLF-only ones.

## Desired End State

A user who signed up as a specialist can reach `/specialist/profile`, save a display name and tick the Warsaw districts they serve, then reach `/specialist/services` and add priced services chosen from a fixed category (+ optional subtype) list. Their card reports whether it is complete enough to be discoverable. A client-role or anonymous visitor cannot reach those routes. The tables are readable by anyone (including `anon`) and writable only by the owning specialist — proven by pgTAP, not just by the UI refusing.

Verify by: `supabase test db` green; a real specialist account round-trips profile + services on the hosted DB; a client account hitting `/specialist/profile` lands on `/dashboard`; sign-in/sign-up/reset still work after the zod retrofit.

### Key Discoveries:

- `supabase/migrations/20260728154212_profiles_roles_rls.sql:22` — the `revoke all` that makes `profiles` unwritable; do not undo it.
- `supabase/tests/database/profiles_rls.test.sql:10-18` — the pgTAP pattern for role-switched sub-tests (grant `usage`/`execute` on the pgtap schema to `authenticated` for the transaction, then `set local role`).
- `supabase/migrations/20260728162904_harden_handle_new_user.sql:5-9` — the standing privilege invariant: no `user_role` value may be privileged while sign-up metadata can self-assign it. S-02 must not introduce one.
- `src/middleware.ts:22-28` — role is already on `context.locals`; the role gate is an extension, not new plumbing.
- `src/components/auth/RoleToggle.tsx` — existing pattern for a controlled multi-choice input rendered as a React island.

## What We're NOT Doing

- **The discovery / browse query** (which specialists a given client sees) — that is S-03. S-02 opens the data for public read and defines the completeness rule, but ships no client-facing list, no area filter, no price filter, and no `public_specialists` view. Building the query before its slice has a consumer would leave it unverified.
- **Free-text bio (FR-015)** — nice-to-have, parked in the roadmap.
- **Client home address** — S-03. F-01's privacy contract is untouched by this slice.
- **Ratings on the specialist card** — S-06.
- **Editing the taxonomy or the area dictionary from the app** — both are seed data, changed only by migration. No admin role exists in v1.
- **Deleting a specialist profile** — account deletion cascades; no in-app delete path.
- **A JS test runner** — pgTAP + manual verification only, per CLAUDE.md.
- **Multi-city support** — the dictionary carries a `city` column so a second city is a pure `INSERT`, but only Warsaw is seeded.

## Implementation Approach

DB-first, mirroring F-01: land schema + seed + RLS with pgTAP proofs, then the validated write layer, then UI. The load-bearing choice is to put specialist data in **a new `specialist_profiles` table keyed 1:1 to `profiles.id`**, rather than adding columns to `profiles`. Extending `profiles` would require granting `update` to `authenticated` and then carefully excluding `role` from it — trading a structural guarantee (no write path at all) for a policy that has to be right. A separate table sidesteps the F-01 warning instead of navigating it.

Role enforcement for writes lives in the RLS `with check` clause (a subquery against `profiles`), not in a `check` constraint — constraints cannot see other tables. The app also gates the routes, but the database is the boundary that must hold.

## Critical Implementation Details

**Subtype↔category integrity.** `services` stores both `category_id` and a nullable `subtype_id`, and the subtype must belong to that category. A plain FK on each column cannot express this. Use a composite foreign key against a redundant unique key on the parent:

```sql
-- on service_subtypes
unique (id, category_id)

-- on services
foreign key (subtype_id, category_id) references public.service_subtypes (id, category_id)
```

With `subtype_id` null the composite FK is not enforced (MATCH SIMPLE semantics), which is exactly the "subtype optional" behaviour wanted.

**Completeness is derived, never stored.** A card counts as discoverable when it has a `display_name`, at least one row in `specialist_areas`, and at least one row in `services`. No column, no flag, no trigger — recompute it at read time. S-02's only consumer is the specialist's own status banner; S-03 will apply the same predicate in its discovery query. Storing it would create a second source of truth that drifts on every area/service delete.

## Phase 1: Schema, dictionaries and RLS

### Overview

All tables, seed data, grants, policies, and the pgTAP suite that proves the write boundary and the public read boundary. Nothing in `src/` changes.

### Changes Required:

#### 1. Dictionary tables + seed

**File**: `supabase/migrations/<ts>_service_taxonomy_and_areas.sql`

**Intent**: Create the two fixed vocabularies the rest of the slice references — service areas (Warsaw districts) and the two-level service taxonomy — and seed them. These are reference data: readable by everyone, writable by no one through the API.

**Contract**:
- `public.service_areas` — `id` (identity PK), `slug` (unique), `name`, `city` (not null, default `'Warszawa'`), `sort_order`.
- `public.service_categories` — `id` (identity PK), `slug` (unique), `name`, `sort_order`.
- `public.service_subtypes` — `id` (identity PK), `category_id` → `service_categories`, `slug`, `name`, `sort_order`, `unique (category_id, slug)`, plus `unique (id, category_id)` to support the composite FK from `services`.
- Seed: Warsaw's 18 districts; 6 categories (`fryzjerstwo-damskie`, `fryzjerstwo-meskie`, `paznokcie`, `makijaz`, `kosmetyka-twarzy`, `depilacja`) each with 2–4 subtypes.
- RLS enabled on all three; `select` granted to `anon` and `authenticated`; no insert/update/delete granted to either.

#### 2. Specialist entities

**File**: `supabase/migrations/<ts>_specialist_profiles_and_services.sql`

**Intent**: The specialist's card, the districts they declare, and their priced services.

**Contract**:
- `public.specialist_profiles` — `id uuid PK references public.profiles(id) on delete cascade`, `display_name text not null` (length-checked 2–60), `created_at`, `updated_at`.
- `public.specialist_areas` — `specialist_id` → `specialist_profiles` (cascade), `area_id` → `service_areas`, PK on the pair. Join table: editing means delete + insert, so no `update` path is needed.
- `public.services` — `id uuid PK`, `specialist_id` → `specialist_profiles` (cascade), `category_id` (not null) → `service_categories`, `subtype_id` (nullable), `price_cents integer not null check (price_cents > 0)`, timestamps, and the composite FK from *Critical Implementation Details*.
- Price is stored in grosze as an integer — no floating point for money. Currency is implicitly PLN in v1; no column.

#### 3. RLS policies and grants

**File**: same migration as #2

**Intent**: Open a public read surface for the first time in this project, while keeping writes owner-only *and* role-checked at the database level.

**Contract**: For each of the three tables — `select` to `anon` + `authenticated` with a `using (true)` policy; `insert`/`update`/`delete` to `authenticated` only, scoped to rows the caller owns (`id = (select auth.uid())` for the profile; `specialist_id = (select auth.uid())` for the two children). The `insert`/`update` `with check` on `specialist_profiles` additionally requires the caller's `profiles.role = 'specialist'`, so a client-role account cannot create a card even by calling PostgREST directly. `profiles` grants are untouched.

#### 4. RLS proof

**File**: `supabase/tests/database/specialist_listing_rls.test.sql`

**Intent**: Prove the two new boundaries the way F-01 proved its own — at the database, under role switching, not through the UI.

**Contract**: pgTAP suite following the `set local role authenticated` + `request.jwt.claims` pattern from `profiles_rls.test.sql:42-46`. Assertions: (a) a specialist can insert and read back their own card, areas, and services; (b) a specialist cannot insert a service pointing at another specialist's `specialist_id`; (c) a **client-role** account is refused on `specialist_profiles` insert; (d) an `anon` session can `select` all three tables; (e) `anon` is refused on insert; (f) a mismatched `subtype_id`/`category_id` pair raises a foreign-key violation.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` applies every migration cleanly from scratch
- `npx supabase test db` is green, including `specialist_listing_rls.test.sql`
- Seed counts are correct: 18 areas, 6 categories, every subtype attached to a category

#### Manual Verification:

- `npx supabase db push` lands the migrations on the hosted project without drift
- Tables and seed rows are visible in Supabase Studio
- The pre-existing `profiles_rls.test.sql` still passes (no collateral damage to F-01)

**Implementation Note**: Pause here for manual confirmation before Phase 2.

---

## Phase 2: Validated write layer

### Overview

`zod` enters the project, the specialist write endpoints are built on it, and the four existing auth endpoints are retrofitted onto schemas — closing the open rule in `lessons.md`. No UI yet.

### Changes Required:

#### 1. Add zod + shared schemas

**File**: `package.json`, `src/lib/schemas/specialist.ts`

**Intent**: One schema module both the endpoints and (where useful) the React islands can import, so client and server agree on the rules instead of restating them.

**Contract**: `zod` as a dependency. `specialistProfileSchema` — `display_name` trimmed, 2–60 chars; `area_ids` a non-empty array of positive integers, deduplicated. `serviceSchema` — `category_id` positive int, `subtype_id` optional positive int or null, `price` accepted as a decimal string in PLN and coerced to `price_cents` (min 1 zł, max 100 000 zł). Both parse `FormData` values, which arrive as strings — coercion belongs in the schema, not the handler.

#### 2. Data-access helpers

**File**: `src/lib/services/specialists.ts`

**Intent**: Keep Supabase query construction out of the route handlers, and give the completeness rule exactly one definition.

**Contract**: Functions for reading the caller's own card (profile + areas + services), upserting the card with its areas, inserting a service, and deleting a service by id. Plus `isCardComplete(card)` implementing the derived rule from *Critical Implementation Details*. All go through the request-scoped `createClient` from `@/lib/supabase` so RLS applies as the calling user — never a service-role key.

#### 3. Specialist endpoints

**File**: `src/pages/api/specialist/profile.ts`, `src/pages/api/specialist/services.ts`, `src/pages/api/specialist/services/[id]/delete.ts`

**Intent**: Accept the form posts, validate, write, redirect — matching the auth endpoints' shape so the codebase keeps one request style.

**Contract**: `POST` handlers only. Each re-checks `context.locals.role === "specialist"` before touching data (the RLS policy is the real boundary; this is the friendly-error layer). Success redirects back to the originating page with a `?message=`; validation failure redirects with `?error=`. Area replacement is delete-then-insert scoped to the caller. `DELETE` is not used — HTML forms cannot emit it.

#### 4. Auth endpoint retrofit

**File**: `src/pages/api/auth/{signup,signin,forgot-password,reset-password}.ts`, `src/lib/schemas/auth.ts`

**Intent**: Discharge the standing rule in `lessons.md` — parse `formData` through a schema before use, instead of the current ad-hoc casts (`form.get("email") as string`) and hand-rolled guards.

**Contract**: Schemas for each endpoint's fields (email format, password min length matching the 6-char client rule, the `role` enum for signup). Every existing behaviour is preserved exactly: signup's already-registered detection (`src/pages/api/auth/signup.ts:30-41`) and its role guard's error copy, the reset-password flow, and every redirect target. This is a substitution of the validation mechanism, not a change in behaviour.

#### 5. Shared types

**File**: `src/types.ts`

**Intent**: Entity types for the new tables, alongside the existing `Profile`.

**Contract**: `ServiceArea`, `ServiceCategory`, `ServiceSubtype`, `SpecialistProfile`, `Service`, and a composed `SpecialistCard` (profile + areas + services) used by the page loaders.

### Success Criteria:

#### Automated Verification:

- `npm run build` passes
- `npm run lint` passes — and the CRLF-aware check from `lessons.md` is empty: real `prettier/prettier` errors must be distinguished from `Delete ␍` noise, not filtered wholesale
- `zod` is present in `package.json` dependencies

#### Manual Verification:

- Posting a valid profile form (curl or a hand-built form) creates the card and its areas on the local stack
- An over-long name, an empty area list, and a negative price are each rejected with a redirect carrying `?error=`
- A client-role session posting to `/api/specialist/profile` is refused
- **Regression check:** sign-up, sign-in, forgot-password and reset-password all still work end-to-end after the retrofit, including the already-registered-email redirect

**Implementation Note**: Pause here for manual confirmation before Phase 3.

---

## Phase 3: Specialist UI and role gating

### Overview

The two screens, their entry point from the dashboard, and the first role-based route gate in the project.

### Changes Required:

#### 1. Role gate in middleware

**File**: `src/middleware.ts`

**Intent**: Keep a client-role account out of specialist routes, using the role already resolved onto `context.locals`.

**Contract**: A `SPECIALIST_ROUTES` prefix list evaluated after the existing `PROTECTED_ROUTES` check: no user → `/auth/signin` (existing behaviour); a user whose role is not `specialist` → `/dashboard`. The existing auth and reset-password branches are unchanged.

#### 2. Profile screen

**File**: `src/pages/specialist/profile.astro`, `src/components/specialist/ProfileForm.tsx`, `src/components/specialist/AreaPicker.tsx`

**Intent**: Let a specialist name their card and tick the districts they serve, and tell them plainly whether the card is discoverable yet.

**Contract**: The Astro page loads the area dictionary and the caller's current card server-side and passes them to the island; the island posts to `/api/specialist/profile`. `AreaPicker` is a controlled multi-select of districts, following the controlled-input shape of `RoleToggle`. A status banner renders the `isCardComplete` result and names what is missing (name / at least one district / at least one service). Client-side validation mirrors the zod rules and is advisory — `noValidate` + `preventDefault`, as in `SignUpForm.tsx:75`.

#### 3. Services screen

**File**: `src/pages/specialist/services.astro`, `src/components/specialist/ServiceForm.tsx`, `src/components/specialist/ServiceList.tsx`

**Intent**: Add and remove priced services against the fixed taxonomy.

**Contract**: A cascading pair of selects — category is required, subtype narrows to that category and may be left unset — plus a price input in PLN. `ServiceList` renders existing services with a per-row POST form to the delete endpoint. The taxonomy is loaded server-side and passed in; the subtype options are filtered client-side from the selected category.

#### 4. Dashboard entry point

**File**: `src/pages/dashboard.astro`

**Intent**: Give the two screens a way in, and make the dashboard role-aware for the first time.

**Contract**: For `role === "specialist"`, render links to the profile and services screens; for a client, leave the current content as-is. Styling follows the existing card treatment in the file.

### Success Criteria:

#### Automated Verification:

- `npm run build` passes
- `npm run lint` passes, CRLF-aware check empty (see Phase 2)

#### Manual Verification:

- A specialist account creates a card, ticks districts, adds two services, deletes one — all persisting across a reload
- The completeness banner flips from incomplete to complete when the last missing piece is added
- A **client** account visiting `/specialist/profile` is redirected to `/dashboard`
- A **signed-out** visitor visiting `/specialist/profile` is redirected to `/auth/signin`
- Subtype options change when the category changes, and a service saves with no subtype selected
- The whole flow works on production after deploy (`arrivo.dyndalski.workers.dev`)

---

## Testing Strategy

### Database (pgTAP — the only automated suite):

- Owner-only writes on all three new tables
- Client-role refused on `specialist_profiles` insert (the role boundary, enforced in `with check`)
- `anon` can read all three, cannot write
- Cross-specialist write attempt refused
- Subtype/category mismatch raises an FK violation
- Existing `profiles_rls.test.sql` continues to pass

### Manual:

1. Sign up a fresh specialist → `/specialist/profile` → save name + 3 districts → banner reports "brakuje usługi"
2. `/specialist/services` → add a service with a subtype and one without → banner reports complete
3. Delete a service → banner reverts to incomplete
4. Sign in as a client → `/specialist/profile` redirects to `/dashboard`
5. Sign out → `/specialist/services` redirects to `/auth/signin`
6. Re-run the four auth flows (sign-up, sign-in, forgot, reset) as a post-retrofit regression pass

## Performance Considerations

Negligible at MVP scale — the dictionaries are tens of rows and each page issues 2–3 point queries under RLS. The one thing to keep in view: middleware already costs a `profiles` round-trip per request (an accepted F-01 tradeoff), and the specialist pages add their own. If S-03's discovery query later shows up hot, the fix is a shaped read there, not caching here.

## Migration Notes

Migrations are forward-only, matching F-01 — a Worker rollback does not revert the database. Land Phase 1 on the hosted project before deploying any code that reads the new tables, so a deploy never runs against a schema that lacks them. Seed data is inserted by migration and is idempotent-safe (`on conflict do nothing`) so a re-run cannot duplicate districts or categories.

## References

- Roadmap slice S-02: `context/foundation/roadmap.md`
- PRD US-02, FR-004, FR-005: `context/foundation/prd.md`
- Standing rules: `context/foundation/lessons.md` (CRLF lint trap; zod retrofit)
- F-01 privacy/immutability contract: `context/archive/2026-07-28-domain-data-rls-foundation/plan-brief.md`
- RLS test pattern: `supabase/tests/database/profiles_rls.test.sql:10-18`
- Form/endpoint pattern: `src/components/auth/SignUpForm.tsx:75`, `src/pages/api/auth/signup.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema, dictionaries and RLS

#### Automated

- [x] 1.1 `npx supabase db reset` applies every migration cleanly from scratch
- [x] 1.2 `npx supabase test db` is green, including `specialist_listing_rls.test.sql`
- [x] 1.3 Seed counts are correct: 18 areas, 6 categories, every subtype attached to a category

#### Manual

- [x] 1.4 `npx supabase db push` lands the migrations on the hosted project without drift
- [ ] 1.5 Tables and seed rows are visible in Supabase Studio
- [x] 1.6 The pre-existing `profiles_rls.test.sql` still passes

### Phase 2: Validated write layer

#### Automated

- [ ] 2.1 `npm run build` passes
- [ ] 2.2 `npm run lint` passes and the CRLF-aware `prettier/prettier` check is empty
- [ ] 2.3 `zod` is present in `package.json` dependencies

#### Manual

- [ ] 2.4 A valid profile post creates the card and its areas on the local stack
- [ ] 2.5 Over-long name, empty area list, and negative price are each rejected with `?error=`
- [ ] 2.6 A client-role session posting to `/api/specialist/profile` is refused
- [ ] 2.7 Regression: sign-up, sign-in, forgot-password and reset-password all still work after the retrofit

### Phase 3: Specialist UI and role gating

#### Automated

- [ ] 3.1 `npm run build` passes
- [ ] 3.2 `npm run lint` passes, CRLF-aware check empty

#### Manual

- [ ] 3.3 A specialist creates a card, ticks districts, adds two services, deletes one — all persisting
- [ ] 3.4 The completeness banner flips from incomplete to complete when the last piece is added
- [ ] 3.5 A client account visiting `/specialist/profile` is redirected to `/dashboard`
- [ ] 3.6 A signed-out visitor visiting `/specialist/profile` is redirected to `/auth/signin`
- [ ] 3.7 Subtype options follow the selected category, and a service saves with no subtype
- [ ] 3.8 The whole flow works on production after deploy
