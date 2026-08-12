# Reviews and Trust Rating (S-06) Implementation Plan

## Overview

Open the write path for star ratings: a client can rate a booking the specialist marked
`completed`, once, permanently. The read half — the aggregate, the threshold and the "New
specialist" label — already shipped with S-03 and is not rebuilt here.

The same migration narrows the read surface on `public.reviews`. Its current `grant select … to
anon, authenticated` was justified by a public specialist profile, and that profile stopped being
public on 2026-08-11. Leaving it as-is while opening the write path would let a specialist read
which client gave them one star.

## Current State Analysis

`public.reviews` exists (`supabase/migrations/20260804120300_reviews.sql`) and is **empty on every
environment** — nothing has ever been able to write to it. S-03 created it for the read side only
and left an explicit brief for this slice at `:11-14`:

> S-06 adds, in one migration: `booking_id uuid not null references public.bookings`, a unique
> constraint on it, the insert grant, and the insert policy.

Today the table has:

- `id`, `specialist_id` → `specialist_profiles`, `client_id` → `profiles`, `rating smallint`
  (`check between 1 and 5`), `created_at`.
- `reviews_specialist_id_idx`, which the aggregate groups by.
- RLS enabled, `revoke all … from anon, authenticated` then `grant select … to anon, authenticated`,
  and policy `reviews_select_all … using (true)`.
- **No insert grant and no insert policy.** `:39-40` states this is the enforcement, not an
  oversight: "Do not add one without the booking-completed check from FR-013."

The read side is complete. `RATING_THRESHOLD = 3` (`src/lib/schemas/limits.ts:70`) is read in exactly
one place, `ratingLabel()` (`src/lib/services/discovery.ts:51`), which returns `{kind: "new"}` below
the threshold and drives the "Nowy specjalista" / "New specialist" label on both
`src/components/discovery/SpecialistCard.astro:59` and `src/pages/specialists/[id].astro:104`.
`discoverable_specialists` computes `rating_count` and `rating_avg` as correlated subqueries over
`reviews` (`20260804120400:32-33`).

### Key Discoveries:

- **The project's write pattern is the opposite of what S-03 predicted.** S-05 rejected grant +
  policy for four `SECURITY DEFINER` functions and no write grant at all
  (`20260807130000:16-17`: "The absence of the grant is the guarantee. Do not add one."). The
  reasoning there was that a policy cannot express a state transition; that argument does not apply
  to an insert, but consistency and the error-code vocabulary do.
- **Error-code vocabulary already exists** (`20260807130000:40-49`): `42501` = not the party named
  on the row (and also "no such row", deliberately, so the function is not an oracle for uuids),
  `Z0001` = wrong source status. `src/lib/services/bookings.ts:78-85` shows the mapping to typed
  errors carrying catalog keys.
- **Functions are declared `security definer` + `set search_path = ''`** with fully-qualified
  identifiers, and granted with `grant execute on function … to authenticated`
  (`20260807130000:63-66, 227-230`).
- **`BookingRow.astro:93` already carries an `action` slot**, documented at `:16-18` as the place
  "a later slice can put something else … without touching this file".
- **Both views are `security_invoker = true`** (`20260804120400:22`, `20260807130000:264`, where it
  is called load-bearing). The aggregate therefore reads `reviews` under the caller's rights, so
  revoking `select` outright would silently zero every average. A **column-level** grant keeps the
  aggregate working while withholding `client_id`.
- **`service_role` is `BYPASSRLS` and holds `GRANT ALL` on hosted via default privileges**
  (`context/foundation/lessons.md`, entry 5). A policy is invisible to it; only an explicit
  `revoke` is a real boundary. `reviews` links a person to an opinion, so the rule applies.
- **Verification is by exit code, never by grepping output** (`lessons.md`, entry 2).

## Desired End State

A client opening `/account/bookings` sees a five-star control on every `completed` visit they have
not yet rated. Submitting stores one row and the control is replaced by the rating they gave.
Submitting twice is impossible — the control is gone, and the database refuses anyway. A specialist
cannot rate anyone, cannot rate on a client's behalf, and cannot learn who rated them. Once a
specialist has three ratings their card and profile stop saying "New specialist" and start showing
the average, with no code change — that path already exists and this slice only starts feeding it.

Verified by: the pgTAP suite growing by at least 12 assertions and staying green; `npx eslint .` and
`npm run build` exiting 0; and a manual pass where a completed booking is rated and the average
appears on the specialist's card once the third rating lands.

## What We're NOT Doing

- **No free-text review bodies.** FR-009 defers them to v2 pending a moderation path, and there is
  no admin role to own one.
- **No editing or withdrawing a rating.** One insert per booking, permanent. No update grant, no
  delete grant, no `updated_at`.
- **No deadline.** A visit completed six months ago can still be rated.
- **No change to the threshold or to `ratingLabel()`.** FR-014 shipped with S-03; this slice
  confirms `RATING_THRESHOLD = 3` and closes the PRD's Open Question #6 rather than reopening it.
- **No rating display on the specialist's own screens.** No FR requires it; a specialist sees their
  average on their own discovery card, which S-02 already renders.
- **No moderation, reporting, or dispute path.**
- **No rewrite of `discoverable_specialists`.** The aggregate stays exactly as S-03 wrote it.
- **No retrofit of the nine API endpoints that redirect a wrong-role caller to `/dashboard`.** The
  new endpoint matches its siblings; changing all ten is its own change.

## Implementation Approach

Four phases, mirroring S-05's shape: the database first and alone, then the assertions that pin it,
then the service layer, then the screen. The database phase is the one that carries risk — it
alters a table that exists on production and it decides a privacy boundary — so it lands and is
pushed before any code depends on it.

The write path is a single `SECURITY DEFINER` function. The caller passes a booking id and a
rating and nothing else: `specialist_id` and `client_id` are read off the booking row inside the
function, so there is no shape of request that can attribute a rating to the wrong pair. No insert
grant is added, which means the only way to write a review remains that one function.

## Critical Implementation Details

**`not null` on an existing table.** `booking_id` is added as `not null` with no default. That is
only safe because `public.reviews` is empty — which is guaranteed by the absence of any write path
since S-03, not by assumption. Confirm with `select count(*) from public.reviews` against the
**hosted** project before pushing; if it is ever non-zero, stop and re-plan, because a default would
attribute existing ratings to an arbitrary booking.

**Policy roles cannot be altered in place.** `reviews_select_all` names `anon, authenticated`.
Removing `anon` means `drop policy` then `create policy` — `alter policy` changes the expression,
not the roles.

**Column-level grants are subtractive in a way that surprises.** After `grant select (…) on
public.reviews to authenticated` without `client_id`, a query that so much as mentions `client_id`
in a `where` clause fails — Postgres requires `SELECT` on every column referenced, not only on
those projected. This is what makes "has this client already rated?" a lookup by `booking_id`
rather than by `client_id`, and it is the reason Phase 3 reads that way.

## Phase 1: Database — write path and narrowed reads

### Overview

One migration that adds the booking link, opens the single write path, and closes the read surface
S-03 left open for a page that no longer exists.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20260811120000_review_write_path.sql`

**Intent**: Give `reviews` its booking link and its one-per-booking rule, replace the blanket read
grant with the narrowest one the aggregate can still work under, and add the only function that may
write a rating.

**Contract**:

- `alter table public.reviews add column booking_id uuid not null references public.bookings (id) on delete cascade;`
  and `alter table public.reviews add constraint reviews_one_per_booking unique (booking_id);` — the
  unique constraint IS FR-013's "one rating per completed booking"; no application check duplicates it.
- Read grants: `revoke select on public.reviews from anon;` and replace the `authenticated` grant
  with a column list covering `id, specialist_id, booking_id, rating, created_at` — deliberately
  **not** `client_id`. Drop and recreate `reviews_select_all` naming `authenticated` only.
- `revoke all on public.reviews from service_role;` with the `lessons.md` entry quoted at the
  revoke site, as `20260807110000` does for `booking_contact_details`.
- `create function public.submit_review(p_booking_id uuid, p_rating smallint) returns uuid`,
  `security definer`, `set search_path = ''`, fully-qualified identifiers, mirroring the four
  functions in `20260807130000`. Order of checks, each raising the code the catalog already knows:
  1. no `auth.uid()` → `42501`
  2. booking absent, or its `client_id` is not the caller → `42501` (one branch, so the function
     cannot be used to test whether a uuid names a real booking)
  3. `status <> 'completed'` → `Z0001`
  4. insert `(booking_id, specialist_id, client_id, rating)` taking `specialist_id` and `client_id`
     from the booking row, never from an argument; return the new id.
  A second submission surfaces as the unique violation, `23505`, which Phase 3 maps.
- `grant execute on function public.submit_review(uuid, smallint) to authenticated;` and **no**
  insert grant on the table.

### Success Criteria:

#### Automated Verification:

- Migration applies from scratch: `npx supabase db reset ; echo $?` prints `0`
- Existing suite still green: `npx supabase test db ; echo $?` prints `0`
- Lint passes by exit code: `npx eslint . ; echo $?` prints `0`

#### Manual Verification:

- `select count(*) from public.reviews` on the hosted project returns 0 **before** the push
- `information_schema.column_privileges` shows `authenticated` holding no `SELECT` on `client_id`
- `information_schema.role_table_grants` shows `service_role` with no privileges on `reviews`
- A specialist card with no ratings still renders "Nowy specjalista" (the aggregate survived the
  grant change)

---

## Phase 2: pgTAP coverage

### Overview

Pin the rules the function and the grants encode, from both sides. The suite is this project's only
automated coverage, and every boundary it does not assert is a boundary a later edit can remove
silently.

### Changes Required:

#### 1. Review access tests

**File**: `supabase/tests/database/reviews_rls.test.sql`

**Intent**: Assert who may write a rating, who may not, and what a rating leaks.

**Contract**: A new file following the shape of `bookings_rls.test.sql` — `plan(N)`, fixtures
creating a client, a second client, a specialist and bookings in several statuses, `set local role`
switching. Assertions, at minimum:

- the client on a `completed` booking can `submit_review` and gets an id back
- the same client submitting again raises `23505`
- the OTHER client raises `42501`; the specialist on the booking raises `42501`
- a booking that is `pending`, `accepted`, `declined` or `expired` raises `Z0001`
- a non-existent uuid raises `42501`, not a not-found code
- `authenticated` selecting `client_id` fails; selecting `rating` succeeds
- `anon` selecting from `reviews` fails
- `service_role` has no privileges on `reviews`
- `discoverable_specialists.rating_count` / `rating_avg` reflect a submitted rating

### Success Criteria:

#### Automated Verification:

- Full suite green by exit code: `npx supabase test db ; echo $?` prints `0`
- Assertion count grows by at least 12

#### Manual Verification:

- Deliberately weakening one check in `submit_review` (e.g. dropping the `completed` test) turns a
  test red rather than passing quietly

---

## Phase 3: Service layer and endpoint

### Overview

The typed seam between the function's error codes and the message catalog, plus the one route the
form posts to.

### Changes Required:

#### 1. Rating schema

**File**: `src/lib/schemas/review.ts`

**Intent**: Reject a malformed rating before it reaches the database.

**Contract**: `ratingSchema` — an integer 1–5 coerced from the form value, with a `reviews.*` catalog
key as its error. Parsed through `parseOrError` like every other endpoint input.

#### 2. Review service

**File**: `src/lib/services/reviews.ts`

**Intent**: Wrap the RPC and the read-back, converting Postgres error codes into errors that carry
catalog keys.

**Contract**:

- `submitReview(supabase, bookingId, rating): Promise<string>` calling `supabase.rpc("submit_review", …)`,
  mapping `23505` → `AlreadyRatedError`, `42501` → `NotYoursError`, `Z0001` → `NotCompletedError`,
  each with a `readonly key` like the classes in `src/lib/services/bookings.ts:12-38`.
- `listOwnRatings(supabase, bookingIds): Promise<Map<string, number>>` — booking id → rating, read
  by `booking_id` and never by `client_id`, for the reason in Critical Implementation Details. An
  empty input returns an empty map without a query, as `listContactDetails` does.

#### 3. Endpoint

**File**: `src/pages/api/bookings/[id]/review.ts`

**Intent**: Accept the form post, submit the rating, redirect back to the list with a catalog key.

**Contract**: `POST`, gated on a signed-in `client` role, mirroring
`src/pages/api/bookings/[id]/cancel.ts` — including its `/dashboard` redirect for a wrong role, so
the ten endpoints agree with each other. Booking id through `clientBookingIdSchema`, rating through
`ratingSchema`. Each typed error maps to its own `?error=` key; success redirects with
`?message=reviews.message.submitted`.

#### 4. Shared type

**File**: `src/types.ts`

**Intent**: Name the row now that it has a booking link.

**Contract**: A `Review` interface covering the columns `authenticated` may actually read — id,
specialist_id, booking_id, rating, created_at — with a docstring saying `client_id` is deliberately
absent from the type because it is absent from the grant.

### Success Criteria:

#### Automated Verification:

- Lint passes by exit code: `npx eslint . ; echo $?` prints `0`
- Build passes: `npm run build`

#### Manual Verification:

- Posting a rating for someone else's booking redirects with the "not found" key, not a stack trace
- Posting twice redirects with the "already rated" key

---

## Phase 4: Client UI, copy, and PRD close-out

### Overview

The five stars, the already-rated state, both catalogs, and the one-line amendment that stops the
PRD from asking a question the code answered in S-03.

### Changes Required:

#### 1. Rating control

**File**: `src/components/booking/RatingForm.astro`

**Intent**: Five stars that post a rating for one booking.

**Contract**: Props: `bookingId`, and the resolved strings. A plain `<form method="POST">` to
`/api/bookings/<id>/review` with five submit buttons carrying `value="1".."5"` — no island, so no
catalog reaches the client bundle and `src/components/booking/strings.ts` stays untouched, matching
how the specialist inbox was built in S-05.

#### 2. Bookings list

**File**: `src/pages/account/bookings.astro`

**Intent**: Show the control on unrated completed visits and the given rating on rated ones.

**Contract**: After loading bookings, call `listOwnRatings` with the ids of rows whose
`effective_status` is `completed` — only those, mirroring the "ask only for what the caller is
entitled to" note at `src/pages/specialist/bookings.astro:62`. Pass `RatingForm` into
`BookingRow`'s `action` slot when the map has no entry for that booking, and a static star display
when it does. `BookingRow.astro` itself is not modified.

#### 3. Copy

**Files**: `src/lib/i18n/messages/pl.ts`, `src/lib/i18n/messages/en.ts`

**Intent**: Polish and English for the control, the success message and every error the endpoint can
redirect with.

**Contract**: A `reviews.*` block — prompt, star aria-labels, the given-rating line, `message.submitted`,
and `error.{alreadyRated,notYours,notCompleted,invalidRating,actionFailed}`. Both catalogs, no
missing-key fallbacks.

#### 4. PRD close-out

**File**: `context/foundation/prd.md`

**Intent**: Close Open Question #6 with the value that has been live since S-03.

**Contract**: Mark question 6 resolved at **3 ratings**, pointing at `RATING_THRESHOLD` as the single
place it is expressed. Dated amendment in the style of the Access Control entry; `version:` not
bumped, since no FR changes.

### Success Criteria:

#### Automated Verification:

- Lint passes by exit code: `npx eslint . ; echo $?` prints `0`
- Build passes: `npm run build`
- No catalog import from a `.tsx` file
- Full database suite still green: `npx supabase test db ; echo $?` prints `0`

#### Manual Verification:

- A completed booking shows five stars; a pending, accepted, declined or expired one shows none
- Submitting replaces the stars with the rating given, and surviving a page reload
- A third rating flips that specialist's card from "Nowy specjalista" to an average
- Both language versions render with no missing-key fallbacks
- Migration pushed: `npx supabase db push`
- Deployed and walked through against production: `npx wrangler deploy`

---

## Testing Strategy

### Database (pgTAP — the only automated layer):

- Authorization: the booking's client may write; the other client, the specialist and an anonymous
  caller may not.
- State: only `completed`; the other four statuses rejected with `Z0001`.
- Cardinality: the second rating for a booking fails on the unique constraint.
- Confidentiality: `client_id` unreadable by `authenticated`; `reviews` unreadable by `anon`; no
  `service_role` privileges.
- Aggregate: `rating_count` and `rating_avg` move when a rating lands.

### Manual:

1. Complete a booking as the specialist, then rate it as the client.
2. Reload — the stars are gone and the rating is shown.
3. Try the endpoint with another client's booking id: "not found", no leak of whether it exists.
4. Rate three bookings for one specialist and confirm the card flips to an average.

## Performance Considerations

One extra query per render of `/account/bookings`, bounded by the caller's own completed bookings —
the same shape and cost as `listContactDetails` in the specialist inbox. The aggregate is unchanged:
two correlated subqueries over `reviews_specialist_id_idx`, which already exists.

## Migration Notes

`booking_id` is added `not null` to a table that must be empty. Verify on hosted before pushing (see
Critical Implementation Details). The grant changes are not reversible by re-running the migration —
rolling back means writing a new one that restores the previous grants — so the column-privilege and
`service_role` assertions in Phase 2 are what stop a later migration from quietly widening them.

## References

- S-03's brief for this slice: `supabase/migrations/20260804120300_reviews.sql:11-14, 39-47`
- The write pattern this follows: `supabase/migrations/20260807130000_booking_transitions.sql:16-17, 40-49`
- Error-code to typed-error mapping: `src/lib/services/bookings.ts:78-85`
- The slot the control goes in: `src/components/booking/BookingRow.astro:93`
- The threshold this does not change: `src/lib/services/discovery.ts:44-57`
- `service_role` and local-vs-hosted grants: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database — write path and narrowed reads

#### Automated

- [x] 1.1 Migration applies from scratch: `npx supabase db reset ; echo $?` prints `0` — 01635a1
- [x] 1.2 Existing suite still green: `npx supabase test db ; echo $?` prints `0` — 01635a1
- [x] 1.3 Lint passes by exit code: `npx eslint . ; echo $?` prints `0` — 01635a1

#### Manual

- [x] 1.4 `select count(*) from public.reviews` on hosted returns 0 before the push — 01635a1
- [x] 1.5 `authenticated` holds no SELECT on `client_id` — 01635a1
- [x] 1.6 `service_role` has no privileges on `reviews` — 01635a1
- [x] 1.7 An unrated specialist card still renders "Nowy specjalista" — 01635a1

### Phase 2: pgTAP coverage

#### Automated

- [x] 2.1 Full suite green by exit code: `npx supabase test db ; echo $?` prints `0`
- [x] 2.2 Assertion count grows by at least 12

#### Manual

- [x] 2.3 Weakening a check in `submit_review` turns a test red

### Phase 3: Service layer and endpoint

#### Automated

- [ ] 3.1 Lint passes by exit code: `npx eslint . ; echo $?` prints `0`
- [ ] 3.2 Build passes: `npm run build`

#### Manual

- [ ] 3.3 Rating someone else's booking redirects with the "not found" key
- [ ] 3.4 Rating twice redirects with the "already rated" key

### Phase 4: Client UI, copy, and PRD close-out

#### Automated

- [ ] 4.1 Lint passes by exit code: `npx eslint . ; echo $?` prints `0`
- [ ] 4.2 Build passes: `npm run build`
- [ ] 4.3 No catalog import from a `.tsx` file
- [ ] 4.4 Full database suite still green: `npx supabase test db ; echo $?` prints `0`

#### Manual

- [ ] 4.5 Stars appear only on completed bookings
- [ ] 4.6 Submitting replaces the stars with the given rating, surviving a reload
- [ ] 4.7 A third rating flips the card to an average
- [ ] 4.8 Both language versions render with no missing-key fallbacks
- [ ] 4.9 Migrations pushed: `npx supabase db push`
- [ ] 4.10 Deployed and walked through against production: `npx wrangler deploy`
