# Client Booking Request Implementation Plan

## Overview

Roadmap slice S-04 — the north star. A client requests a booking from a discovered specialist by
proposing a date and time. The request records the chosen service, the proposed moment, and the
client's address; the address is invisible to the specialist until they accept.

This is the validation milestone. Every slice before it exists to make this moment possible, and
every slice after it only matters if clients actually reach it.

## Current State Analysis

**What exists.** S-03 shipped discovery: a client saves a district and finds specialists who
declared it, filters by category and price, and opens a public profile. The profile and the
discovery cards already render booking CTAs — `disabled`, titled "Wkrótce" — precisely so this
slice swaps an attribute instead of rebuilding those screens
(`src/pages/specialists/[id].astro`).

**What this slice inherits.**

- `client_profiles` holds first name, last name, phone, `area_id`, street and postal code, with
  own-row-only RLS and **no public read of any kind**.
- `discoverable_specialists` is the single definition of who may be booked at all.
- `services` carries `category_id`, optional `subtype_id`, optional custom `name`, `price_cents`
  and optional `duration_minutes`.
- The whole error/message-key discipline: endpoints redirect with catalog keys, pages resolve them
  through `tUnknown`, success banners render only for a key `isMessageKey` recognises.
- `AreaPicker` in `single` mode with radio semantics; the `redirectTo` validation pattern from
  `src/pages/api/locale.ts`.

**What is missing.** There is no `bookings` table, no status vocabulary, and — most importantly —
no policy that ever lets a specialist read a client's address. That absence is deliberate:
`20260804120100_client_profiles.sql` records that the policy could not be written correctly
against a `bookings` table that did not exist. Writing it is this slice's central task.

## Desired End State

A signed-in client on a specialist's public profile picks a service, proposes a date and time,
confirms or edits the address carried over from their profile, optionally adds one logistical
note, and submits. The specialist sees a pending request showing the district, the service, the
proposed time and the note — and nothing that identifies the client. The client sees the request
on their own "Moje rezerwacje" screen with a `pending` badge.

Verify by: submitting a request as a client, then querying as that specialist through PostgREST
and confirming the address and phone are refused; flipping the row to `accepted` in SQL and
confirming they become readable.

### Key Discoveries

- **RLS is row-level, not column-level.** A specialist must read the booking row to know a request
  exists, so the address cannot live in that row. Column `GRANT`s exist but are static — they
  cannot depend on `status`, so they would hide the address *after* acceptance too. Hence the
  1:1 split.
- Booking CTAs are already in the layout at `src/pages/specialists/[id].astro` — header and one
  per service row.
- `src/lib/services/clients.ts` already has `NotAllowedError` carrying a catalog `key`, and the
  42501/23503 mapping that turns an RLS or FK refusal into a user-facing message.
- Cloudflare Workers has no local timezone: `new Date()` is UTC. Composing the form's date and
  time without an explicit zone silently shifts every booking by the Warsaw offset.
- `src/pages/api/locale.ts:12-20` already validates a `redirectTo` against open-redirect abuse —
  the same guard is needed for the return-to-booking flow.

## What We're NOT Doing

- **Accept, decline, expire, complete.** All S-05. This slice writes the `expires_at` value and
  the full status vocabulary, but only ever produces `pending`.
- **The specialist's request list.** Also S-05 — an inbox whose buttons do nothing is a worse
  version of the disabled-CTA problem, spread over a whole screen.
- **Reviews.** S-06. The `reviews` table exists with no write path.
- **Notifications of any kind.** No email, no push. The client learns the outcome by looking.
- **A message thread.** One note, written once, at request time. PRD Non-Goals rules out chat;
  this is half a sentence attached to a booking, not a channel.
- **Calendar availability.** PRD accepts blind request/accept for v1.
- **Payments.** PRD Non-Goals — payment happens at the visit.
- **A JS test runner.** Still out per CLAUDE.md; automated coverage stays pgTAP-only.

## Implementation Approach

Three phases, ordered by the privacy contract: the form cannot be written before it is settled
which table the address lands in.

**The privacy mechanism.** `bookings` carries what a specialist may see while deciding — district,
service snapshot, proposed time, note, status. `booking_contact_details` carries what they may see
only after accepting — street, postal code, phone, first and last name — in a 1:1 row whose
`select` policy requires the parent booking to be `accepted` and owned by the caller. Two tables
because RLS grants whole rows; there is no conditional column visibility in Postgres.

**Snapshots, not references.** The booking copies the service (name, price, duration) and the
address at submission time. A specialist who later raises their prices or a client who later
moves must not retroactively change what was agreed. It also means a deleted service leaves the
booking readable rather than cascading it away.

**Expiry.** `expires_at` is the **earlier** of `created_at + 48 hours` and `proposed_at`. The
48-hour window came from the product decision; the second bound exists because same-day bookings
are allowed, and a request cannot meaningfully outlive the moment it proposes. S-05 acts on this
column; S-04 only computes it.

## Critical Implementation Details

**Timezone.** The form posts a date and a time as separate strings. They must be composed into an
instant in `Europe/Warsaw` and stored as `timestamptz`. Workers runs in UTC, so any code path that
builds a `Date` from those strings without naming the zone produces a booking one or two hours off
depending on the season — and it will look correct in every test run in winter.

**Atomicity across two tables.** PostgREST has no cross-request transaction, and a booking whose
contact details failed to insert is a request the specialist can accept and then not travel to.
Insert through a single `SECURITY DEFINER` function that writes both rows in one statement, or
accept a compensating delete on failure and prove it. Do not write two independent inserts and
hope.

## Phase 1: Schema and the privacy contract

### Overview

Every table, type, policy and index the rest of the slice depends on. No UI.

### Changes Required:

#### 1. Status vocabulary

**File**: `supabase/migrations/20260807NNNNNN_bookings.sql` (new)

**Intent**: Define the whole lifecycle now, even though S-04 only ever writes `pending`.

**Contract**: `create type public.booking_status as enum ('pending', 'accepted', 'declined',
'expired', 'completed')`. The full set is required here rather than grown later because the
contact-details policy below must reference `accepted` — the same coupling that blocked this
policy from being written in S-03. Matches the `profiles.role` enum precedent.

#### 2. `bookings`

**File**: same migration

**Intent**: What a specialist may see while deciding whether to accept.

**Contract**: `client_id` → `profiles`, `specialist_id` → `specialist_profiles`, `service_id` →
`services` `on delete set null`, plus the service snapshot (`service_name`, `price_cents`,
`duration_minutes`, `category_id`) taken at submission. `area_id` → `service_areas` (the coarse
location, safe to show). `proposed_at timestamptz not null`, `expires_at timestamptz not null`,
`note text` bounded and trimmed, `status booking_status not null default 'pending'`, timestamps
with the `set_updated_at` trigger.

Partial unique index enforcing one live request per pair:
`create unique index bookings_one_pending_per_pair on public.bookings (client_id, specialist_id) where status = 'pending'`.

Access: a client reads and inserts their own rows; a specialist reads rows addressed to them.
Nobody updates in this slice — S-05 adds the transition policies. Grants follow the project
pattern: `revoke all`, then the narrow grants back.

#### 3. `booking_contact_details`

**File**: same migration

**Intent**: The half of a booking that F-01's privacy contract and the PRD's launch guardrail are
about.

**Contract**: `booking_id uuid primary key references bookings on delete cascade`, plus
`first_name`, `last_name`, `phone`, `street`, `postal_code` with the same CHECK bounds as
`client_profiles`.

Two select policies and nothing else:
- the client who owns the parent booking, always;
- the specialist the parent booking is addressed to, **only when that booking's `status =
  'accepted'`**.

Insert is the client's own, gated on owning the parent booking. No update, no delete — a booking's
contact details are what they were at submission.

A comment must record that this table, not `client_profiles`, is what a specialist ever reads, and
that `client_profiles` therefore stays closed. Also record the `service_role` decision explicitly,
per `context/foundation/lessons.md`: S-05's expiry cron changes `bookings.status` and needs no
access here.

#### 4. Atomic submission

**File**: same migration

**Intent**: One statement writes both rows, so a request cannot exist without the address it needs.

**Contract**: `create function public.request_booking(...) returns uuid language plpgsql security
definer` that inserts into both tables and returns the booking id. `security definer` demands a
pinned `search_path` and an explicit check that `auth.uid()` equals the client being written —
without it the function is a hole straight through the RLS above. Grant execute to `authenticated`
only.

#### 5. Database tests

**File**: `supabase/tests/database/bookings_rls.test.sql` (new)

**Intent**: Pin the guardrail in both directions.

**Contract**: pgTAP assertions covering — a specialist reads the booking row but is refused the
contact row while `pending`; the same specialist reads the contact row once `status = 'accepted'`;
another specialist reads neither; the client reads both throughout; a second `pending` request to
the same specialist violates the partial unique index; `request_booking` refuses to write a
booking for a different `client_id`; deleting the referenced service leaves the booking and its
snapshot intact.

#### 6. Shared types

**File**: `src/types.ts`, `src/lib/schemas/limits.ts`

**Intent**: Mirror the schema.

**Contract**: `BookingStatus`, `Booking`, `BookingContactDetails`. `limits.ts` gains
`NOTE_MAX`, `BOOKING_WINDOW_HOURS = 48`, `BOOKING_MIN_LEAD_HOURS = 3`, `BOOKING_MAX_AHEAD_DAYS = 90`.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` applies every migration cleanly from scratch
- `npx supabase test db` is green, including all three pre-existing suites
- `npm run build`, `npm run check` and the CRLF-aware lint check pass

#### Manual Verification:

- `npx supabase db push` lands on hosted without drift
- Querying `booking_contact_details` as the addressed specialist is refused while the booking is
  `pending`, and succeeds after flipping it to `accepted` in SQL
- `client_profiles` remains unreadable by anyone but its owner — this slice must not have loosened it

---

## Phase 2: Submitting a request

### Overview

The form, the endpoint, and the CTA that finally does something.

### Changes Required:

#### 1. Validation

**File**: `src/lib/schemas/booking.ts` (new)

**Intent**: One schema for the posted form; catalog keys, not sentences.

**Contract**: `service_id` (uuid), `date` and `time` as strings, optional `note`, plus the address
fields carried from the profile and editable. The date/time pair resolves to an instant in
`Europe/Warsaw` and is rejected outside `BOOKING_MIN_LEAD_HOURS` … `BOOKING_MAX_AHEAD_DAYS`. The
composition helper belongs in `src/lib/time.ts` so the endpoint and the display path share it.

#### 2. Service layer

**File**: `src/lib/services/bookings.ts` (new)

**Intent**: Call the atomic function; map refusals to catalog keys.

**Contract**: `requestBooking(supabase, input)` invoking the RPC and translating 23505 (the partial
unique index) into a distinct "you already have a pending request with this specialist" key rather
than a generic failure — that is a normal user state, not an error. `listOwnBookings(supabase,
userId)` for phase 3.

#### 3. The form

**File**: `src/pages/specialists/[id]/book/[serviceId].astro` (new),
`src/components/booking/BookingForm.tsx` (new), `src/components/booking/strings.ts` (new)

**Intent**: The mockup's step 2 (`context/foundation/design/web/booking-request.html`), minus the
step indicator — service choice happens by clicking a specific service, so there is no step 1 to
show.

**Contract**: Service summary card, date and time inputs, address prefilled from the profile and
editable, the privacy note verbatim in intent, an optional note field. Server-resolved strings as
props, as every island in this project does. A specialist reaching this route is redirected to
`/dashboard`; a signed-out visitor to `/auth/signin`.

#### 4. Endpoint

**File**: `src/pages/api/bookings/index.ts` (new)

**Intent**: Validate, submit, redirect with a key.

**Contract**: `POST`, role-gated to `client`, redirecting to the client's booking list on success.
Follows the shape of `src/pages/api/account/profile.ts` exactly.

#### 5. Activating the CTAs

**File**: `src/pages/specialists/[id].astro`, `src/middleware.ts`

**Intent**: The attribute swap this was all staged for.

**Contract**: Both booking buttons become links to the form route. A client with no saved
`area_id` is sent to `/account/profile?redirectTo=<the booking route>`; the account page honours
that parameter after saving, validated with the same guard as
`src/pages/api/locale.ts:12-20`. `/api/bookings` needs no middleware entry — endpoints carry their
own role checks by project convention.

### Success Criteria:

#### Automated Verification:

- `npm run build`, `npm run check`, CRLF-aware lint all pass
- No disabled booking CTA remains: `grep -rn "discovery.profile.book" src/` shows no `disabled`

#### Manual Verification:

- A client submits a request; both rows exist and the redirect lands on the booking list
- A second request to the same specialist is refused with the "already pending" message, not a
  generic error
- A time under 3 hours away and one over 90 days out are both rejected
- A booking proposed for 18:00 Warsaw time reads back as 18:00 — not 16:00 or 20:00
- A client with no saved district is routed through the profile screen and returns to the same
  booking form
- Both locales render the form with no untranslated strings

---

## Phase 3: My bookings

### Overview

The client's read-only view of what they asked for. Closes the loop the north star measures.

### Changes Required:

#### 1. The list

**File**: `src/pages/account/bookings.astro` (new),
`src/components/booking/BookingRow.astro` (new)

**Intent**: `context/foundation/design/web/bookings-client.html`, honestly reduced to the one
status that can exist.

**Contract**: Rows showing the service snapshot, the specialist, the proposed time and a status
badge — `Badge` already has `pending`, `accepted`, `completed` and `declined` variants from phase 1
of S-03. Status filter chips follow the discovery pattern: links, not form controls, so they apply
on click without JavaScript. The address shown is the client's own, so no privacy branch is needed
on this screen.

#### 2. Navigation

**File**: `src/components/Topbar.astro`, `src/pages/dashboard.astro`

**Intent**: Fill the nav slot that has been deliberately empty since phase 3 of S-03.

**Contract**: A "Moje rezerwacje" entry for clients, and a matching dashboard card. Both were
omitted rather than disabled precisely so this slice could add them without moving anything.

### Success Criteria:

#### Automated Verification:

- `npm run build`, `npm run check`, CRLF-aware lint all pass
- `/account/bookings` emits no client-side island script

#### Manual Verification:

- A submitted request appears with a `pending` badge and the correct proposed time
- The status filters narrow the list and survive the back button
- A client sees only their own bookings — signing in as another client shows none
- Both locales render with no untranslated strings
- The whole flow works on production after deploy

---

## Testing Strategy

### Database (pgTAP — the only automated suite)

The guardrail, from both sides: a specialist refused the contact row while pending and granted it
once accepted; a different specialist refused throughout; the client always allowed. Plus the
partial unique index, the `security definer` function's identity check, and the service-deletion
path.

### Manual

1. Client with a saved district books a service; both rows land; the list shows it.
2. The same client tries again with the same specialist — refused with the specific message.
3. Client without a district clicks book, is routed through the profile, and returns.
4. Query the contact row as the specialist before and after flipping status in SQL.
5. Time zone: propose 18:00, read it back on both screens.

### Not covered

No JS test runner, so the date/time composition, the schema and the expiry computation have no
automated coverage — and the timezone helper is the single most likely place for a silent bug in
this slice. It should be first in line when a runner is chosen.

## Performance Considerations

Nothing here is hot. The booking list is one query per client scoped by `client_id`; the form is
one read of the service plus the profile. The `SECURITY DEFINER` function turns two inserts into
one round trip, which matters more for correctness than for latency.

## Migration Notes

Forward-only, following the project precedent. The new tables are empty on every environment, so
the constraints can be added directly rather than backfilled. `client_profiles` is not altered by
this slice — that is the point.

## References

- Roadmap slice S-04 (north star): `context/foundation/roadmap.md`
- PRD US-01, FR-010; NFR on address privacy; Non-Goals on chat: `context/foundation/prd.md`
- The deferred policy this slice writes: `supabase/migrations/20260804120100_client_profiles.sql`
- Mockups: `context/foundation/design/web/{booking-request,bookings-client}.html`
- Disabled CTAs to activate: `src/pages/specialists/[id].astro`
- Redirect guard to reuse: `src/pages/api/locale.ts:12-20`
- `service_role` rule: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema and the privacy contract

#### Automated

- [x] 1.1 `npx supabase db reset` applies every migration cleanly from scratch
- [x] 1.2 `npx supabase test db` is green, including all three pre-existing suites
- [x] 1.3 `npm run build`, `npm run check` and the CRLF-aware lint check pass
- [x] 1.7 `service_role` holds no DML on `booking_contact_details` or `client_profiles`

#### Manual

- [x] 1.4 `npx supabase db push` lands on hosted without drift
- [x] 1.5 The addressed specialist is refused the contact row while pending, and allowed once accepted (behaviour proven locally by 20 pgTAP assertions; policy AND grant identity on hosted confirmed by zero drift from `supabase db diff --linked` — a live re-test would have needed two production accounts that cannot be deleted without the service_role key)
- [x] 1.6 `client_profiles` remains unreadable by anyone but its owner
- [x] 1.8 `supabase db diff --linked` shows no `service_role` grant on either private table on hosted

### Phase 2: Submitting a request

#### Automated

- [ ] 2.1 `npm run build`, `npm run check`, CRLF-aware lint all pass
- [ ] 2.2 No disabled booking CTA remains

#### Manual

- [ ] 2.3 A client submits a request; both rows exist and the redirect lands on the booking list
- [ ] 2.4 A second request to the same specialist is refused with the "already pending" message
- [ ] 2.5 A time under 3 hours away and one over 90 days out are both rejected
- [ ] 2.6 A booking proposed for 18:00 Warsaw time reads back as 18:00
- [ ] 2.7 A client with no saved district is routed through the profile and returns to the form
- [ ] 2.8 Both locales render the form with no untranslated strings

### Phase 3: My bookings

#### Automated

- [ ] 3.1 `npm run build`, `npm run check`, CRLF-aware lint all pass
- [ ] 3.2 `/account/bookings` emits no client-side island script

#### Manual

- [ ] 3.3 A submitted request appears with a `pending` badge and the correct proposed time
- [ ] 3.4 The status filters narrow the list and survive the back button
- [ ] 3.5 A client sees only their own bookings
- [ ] 3.6 Both locales render with no untranslated strings
- [ ] 3.7 The whole flow works on production after deploy
