# Specialist Booking Management Implementation Plan

## Overview

Close the two-sided transaction S-04 opened. A specialist accepts or declines a request; a request
nobody answers auto-expires; an accepted booking can be marked completed; and a client who made a
mistake can withdraw a request instead of being locked out of that specialist for 48 hours.

Roadmap slice S-05. PRD refs FR-011, FR-012.

## Current State Analysis

S-04 left this slice more groundwork than the roadmap entry suggests.

**Already built and deployed:**

- `public.booking_status` is the complete enum — `pending | accepted | declined | expired |
completed` (`supabase/migrations/20260807100000_bookings.sql:26`). Defined whole in S-04 precisely
  so this slice does not run `alter type` against a live database.
- `bookings.expires_at` is already computed as `least(created_at + 48h, proposed_at)` and indexed
  by `bookings_pending_expiry_idx`, partial to `status = 'pending'` (`:85`). The expiry job only
  has to act on it.
- The acceptance-gated read policy on `booking_contact_details` already exists (`:152-161`). This
  slice writes the transition that trips it — it does not rewrite the policy.
- `bookings_one_pending_per_pair`, a partial unique index on `(client_id, specialist_id) where
status = 'pending'` (`:90`).
- The client's read-only list at `/account/bookings` with badges for all five statuses.
- The migration closes with a note addressed to this slice (`:246-253`) specifying what the cron
  may and may not touch.

**Missing:**

- No UPDATE policy and no UPDATE grant on `public.bookings` for anyone. Nothing can change a status
  today.
- No background execution path of any kind. This is the first thing in the project that will run
  without a user session.
- No specialist-facing bookings screen. `Topbar.astro:32-36` gates its booking link on
  `role === "client"` and carries a comment marking the specialist slot as deliberately empty.

**Constraints discovered during planning:**

- `@astrojs/cloudflare@14.1.5` has **no `workerEntryPoint` option**. `wrangler.jsonc` points `main`
  straight at `node_modules/@astrojs/cloudflare/entrypoints/server`, whose entire content is
  `{ fetch: handle }`. Adding a `scheduled()` handler would mean repointing `main` at a hand-written
  entry importing `@astrojs/cloudflare/handler` — a change to a build path that currently works, and
  it would require the `service_role` key in Worker secrets.
- `pg_cron` **1.6.4 is available and in `shared_preload_libraries`** on the local stack, verified by
  creating and dropping the extension during planning. It is available on all Supabase tiers.
- `context/foundation/infrastructure.md:97` already ruled that a missed expiry run must be mitigated
  by an idempotent job **and** lazy expiry at read time. Both, not either.
- The mockup `context/foundation/design/web/booking-requests-specialist.html:56-58` shows the
  client's name and "Klientka od maja 2026" on a _pending_ request. Those fields live in
  `booking_contact_details`, private until acceptance. The mockup loses.
- `note` also lives in `booking_contact_details` (moved there by `20260807120000`), so a pending
  request carries no free text either.

## Desired End State

A specialist signs in, opens **Rezerwacje** from the top bar, and sees requests addressed to them:
service, proposed time, district, and nothing that identifies the person. They accept or decline.
On acceptance — and only then — the client's name, phone, street and note appear on that card. Once
the proposed time has passed, an accepted booking offers **Oznacz jako zakończoną**.

A client sees their own requests resolve. A request nobody answered reads "wygasłe" the moment its
window closes, without waiting for a job. A request the client withdrew reads differently from one
the specialist declined. Withdrawing frees the pair immediately, so they can request again.

Verified by: `supabase test db` green, `npm run lint` **exit 0**, `npm run build` clean, and the
manual walkthrough in Testing Strategy performed against production.

### Key Discoveries

- `request_booking()` (`20260807100000_bookings.sql:175-244`) is the exact template for the four
  transition functions: `security definer`, `set search_path = ''`, an explicit `auth.uid()` check,
  a role check, and error codes the TS layer maps to catalog keys.
- `discoverable_specialists` (`20260804120400`) is the template for the effective-status view:
  `with (security_invoker = true)`, one definition, many readers.
- `src/lib/services/bookings.ts:78-85` establishes the error-code-to-typed-error mapping, and
  `src/lib/services/bookings.ts:63-64` records why Supabase responses are not destructured
  (`no-unsafe-assignment` without generated database types).
- `src/pages/api/specialist/services/[id]/delete.ts` establishes the per-action endpoint pattern —
  one file per verb rather than a dispatching `[action].ts`.
- `src/pages/account/bookings.astro:65-72` establishes filters as links, not JavaScript.

## What We're NOT Doing

- **No decline reason** — no free text, no dictionary. PRD Non-Goals rules out chat, and a one-way
  text field from specialist to client is a chat with one message and no moderation.
- **No `cancelled` enum value.** Withdrawal is `declined` plus `resolved_by = 'client'`.
- **No cancellation of an accepted booking.** Only pending requests can be withdrawn.
- **No auto-completion.** An accepted booking whose time has passed stays `accepted` and the inbox
  nags. The system does not know whether a visit happened; the specialist does.
- **No sidebar layout** for `/specialist/*`. The mockup's vertical nav (including "Zespół", which no
  FR covers) is not built here; the existing role-aware `Topbar` gains one link.
- **No client name on a pending request**, in any form — not full, not first-name-only, not
  "Katarzyna J.".
- **No notifications** of any kind. No FR asks for them and there is no email infrastructure.
- **No reviews.** `completed` is the precondition S-06 consumes; S-06 writes the review.

## Implementation Approach

Four `SECURITY DEFINER` functions own every transition, and `authenticated` gets no UPDATE grant on
`bookings` at all — so PostgREST cannot be used to PATCH a status, and the transition graph is
enforced in exactly one place per edge rather than spread across policies and triggers.

Expiry is defended twice, as `infrastructure.md:97` requires. `pg_cron` runs
`expire_stale_bookings()` every 15 minutes to keep the stored rows honest — which matters because
`bookings_one_pending_per_pair` reads the stored `status`, not the displayed one. `bookings_view`
computes `effective_status` so every reader shows the truth between runs. And each transition
function re-checks `expires_at` itself, so a stale row cannot be accepted even if both other layers
were skipped.

Choosing `pg_cron` over a Cloudflare Cron Trigger removes `service_role` from this slice entirely:
the function runs in the database as its owner, so there is no privileged key to store, leak, or
reason about. That also lets us revoke `service_role` on `bookings` (see Critical Implementation
Details), which nothing else needs and a leaked key currently reaches.

## Critical Implementation Details

**`service_role` on `bookings`.** The hosted project auto-grants full DML on every new table to
`service_role`, which also has `BYPASSRLS` (`context/foundation/lessons.md`). S-04 revoked it on
`booking_contact_details` and `client_profiles` but left it on `bookings`, on the assumption S-05's
cron would need it. `pg_cron` removes that need, so phase 1 revokes it. This is not housekeeping: a
legacy `service_role` JWT for this project was exposed during S-04, and until it is rotated that key
reads and writes every booking row. One `revoke` closes it.

**Custom SQLSTATEs.** The four functions must distinguish "wrong status", "already expired", and
"too early to complete" so the UI can say something true. Postgres reserves error classes `00`–`04`
and `A`–`H`; `Z0001`–`Z0003` are safe and are what this plan uses. Identity and role failures keep
`42501`, matching `request_booking()`.

**Ordering.** `bookings_view` must be created after `resolved_by` exists, because it selects `b.*`.
Phase 2's `create extension pg_cron` must precede the `cron.schedule` call in the same migration.

## Phase 1: Transitions in the database

### Overview

Everything needed to legally move a booking between states, with no way to move it illegally.

### Changes Required:

#### 1. Transition migration

**File**: `supabase/migrations/20260807130000_booking_transitions.sql`

**Intent**: Add the actor column, the four transition functions, the effective-status view, and the
`service_role` revoke. Written as one migration because the view depends on the column and the
functions are meaningless without each other.

**Contract**:

- `create type public.booking_actor as enum ('client', 'specialist', 'system');`
- `alter table public.bookings add column resolved_by public.booking_actor;` — nullable; null means
  still open. Set by every terminal transition including expiry (`'system'`).
- Four functions, each `returns void`, `language plpgsql`, `security definer`, `set search_path =
''`, each opening with the `auth.uid() is null → 42501` guard from `request_booking()`:

  | Function                              | Caller must be  | Source status | Extra precondition     | Writes                                    |
  | ------------------------------------- | --------------- | ------------- | ---------------------- | ----------------------------------------- |
  | `accept_booking(p_booking_id uuid)`   | `specialist_id` | `pending`     | `expires_at > now()`   | `accepted`, `resolved_by = 'specialist'`  |
  | `decline_booking(p_booking_id uuid)`  | `specialist_id` | `pending`     | `expires_at > now()`   | `declined`, `resolved_by = 'specialist'`  |
  | `complete_booking(p_booking_id uuid)` | `specialist_id` | `accepted`    | `proposed_at <= now()` | `completed`, `resolved_by = 'specialist'` |
  | `cancel_booking(p_booking_id uuid)`   | `client_id`     | `pending`     | `expires_at > now()`   | `declined`, `resolved_by = 'client'`      |

- Error codes: `42501` when the caller is not the party named on the row (this covers the
  not-found case too — do not distinguish, or the function becomes an existence oracle for booking
  ids); `Z0001` wrong source status; `Z0002` pending but past `expires_at`; `Z0003` completing
  before `proposed_at`.
- `revoke all on function … from public, anon;` then `grant execute … to authenticated;` for each,
  mirroring `20260807100000_bookings.sql:238-239`.
- **No `grant update on public.bookings to authenticated`.** Its absence is the guarantee that these
  functions are the only path; state it in a comment so a later migration does not "fix" it.
- `create view public.bookings_view with (security_invoker = true) as select b.*, case when b.status
= 'pending' and b.expires_at <= now() then 'expired'::public.booking_status else b.status end as
effective_status from public.bookings b;` plus `grant select on public.bookings_view to
authenticated;`. `security_invoker` is what makes the two existing SELECT policies apply to view
  readers.
- `revoke all on public.bookings, public.bookings_view from service_role;` with the rationale from
  Critical Implementation Details as a comment.

#### 2. Types

**File**: `src/types.ts`

**Intent**: Expose the new column and the view's computed status to the app.

**Contract**: `BookingActor = "client" | "specialist" | "system"`; `resolved_by: BookingActor | null`
on `Booking`; a `BookingView extends Booking` carrying `effective_status: BookingStatus`.

### Success Criteria:

#### Automated Verification:

- Migration applies from scratch: `npx supabase db reset`
- Existing suite still green: `npx supabase test db`
- Lint passes by **exit code**: `npx eslint . ; echo $?` prints `0`
- Build passes: `npm run build`

#### Manual Verification:

- `\d public.bookings` shows `resolved_by`, and `\dp public.bookings` shows no UPDATE for
  `authenticated` and nothing at all for `service_role`
- Selecting `bookings_view` as a signed-in client returns only that client's rows

---

## Phase 2: Auto-expiry via pg_cron

### Overview

The scheduled half of the expiry defence. Idempotent, narrow, and privileged to nothing it does not
need.

### Changes Required:

#### 1. Expiry migration

**File**: `supabase/migrations/20260807140000_booking_expiry_cron.sql`

**Intent**: Create the expiry function and schedule it, in the database, with no external key.

**Contract**:

- `create extension if not exists pg_cron;`
- `public.expire_stale_bookings() returns integer`, `security definer`, `set search_path = ''`:
  updates `public.bookings set status = 'expired', resolved_by = 'system' where status = 'pending'
and expires_at <= now()`, returns the affected count. It touches no other status — an `accepted`
  booking is never expired by this job — and re-running it immediately affects zero rows, which is
  what "idempotent" means here.
- `revoke all on function public.expire_stale_bookings() from public, anon, authenticated;` — the
  cron job runs as the scheduling role, so nothing else needs execute.
- Scheduling must be re-runnable, because `supabase db reset` replays migrations:
  `select cron.unschedule('expire-stale-bookings') where exists (select 1 from cron.job where
jobname = 'expire-stale-bookings');` then `select cron.schedule('expire-stale-bookings', '*/15 *
  - - *', $$select public.expire_stale_bookings()$$);`
- A comment recording why this is not a Cloudflare Cron Trigger, pointing at the adapter constraint
  and the `service_role` argument — `infrastructure.md` says Worker cron, and a future reader
  deserves to know this was a decision rather than an oversight.

#### 2. Infrastructure note

**File**: `context/foundation/infrastructure.md`

**Intent**: Record the departure so the document stops disagreeing with the code.

**Contract**: Amend the FR-011 cron item (step 5 of its checklist, and the risk row at line 97) to
state that expiry runs in `pg_cron`, that lazy read-time expiry ships alongside it, and why the
Worker path was rejected.

### Success Criteria:

#### Automated Verification:

- Reset applies both migrations twice in a row without a duplicate-job error: `npx supabase db reset`
- `select count(*) from cron.job where jobname = 'expire-stale-bookings'` returns exactly `1`
- Lint passes by **exit code**: `npx eslint . ; echo $?` prints `0`

#### Manual Verification:

- Insert a pending booking with `expires_at` in the past, call `expire_stale_bookings()`, confirm it
  returns `1` and the row is `expired` / `resolved_by = 'system'`; call it again and confirm `0`
- Confirm an `accepted` booking with a past `proposed_at` is untouched by the function
- After deploy, `cron.job_run_details` shows successful runs on the hosted project

---

## Phase 3: pgTAP coverage

### Overview

The transitions and the privacy boundary are places where a mistake is silent — a wrong policy does
not raise, it just permits. Tests are the only thing that notices.

### Changes Required:

#### 1. Transition test suite

**File**: `supabase/tests/database/booking_transitions.test.sql`

**Intent**: Pin every edge of the transition graph, the moment the address becomes visible, and the
job's idempotence.

**Contract**: Following the fixture style of `supabase/tests/database/bookings_rls.test.sql`.
Coverage, roughly 30–40 assertions:

- **Legal**: each of the four transitions succeeds for the right actor and leaves the right
  `status` + `resolved_by`.
- **Wrong actor**: the client cannot accept, decline or complete; the specialist cannot cancel; a
  third party can do none of them (all `42501`).
- **Wrong source status**: accepting an already-accepted booking, completing a pending one,
  cancelling a declined one (`Z0001`).
- **Expired**: a pending booking past `expires_at` cannot be accepted, declined or cancelled
  (`Z0002`).
- **Too early**: completing an accepted booking before `proposed_at` (`Z0003`).
- **Privacy**: `booking_contact_details` is invisible to the specialist while pending, visible after
  `accept_booking()`, and — the assertion that matters most — **invisible again is not required**,
  but it must stay invisible after `decline_booking()` and after expiry.
- **No side door**: `update public.bookings set status = 'accepted'` as `authenticated` fails on the
  missing grant.
- **View**: `effective_status` reads `expired` for a past-window pending row whose stored `status`
  is still `pending`, and equals `status` otherwise.
- **Job**: `expire_stale_bookings()` flips only past-window pending rows, returns the count, is a
  no-op on a second call, and leaves `accepted` rows alone.

### Success Criteria:

#### Automated Verification:

- Full suite green by **exit code**: `npx supabase test db ; echo $?` prints `0`
- Assertion count reported by the run has grown by at least 30

#### Manual Verification:

- Deliberately break one function (e.g. drop the `expires_at` check) and confirm a test goes red —
  a suite that cannot fail proves nothing

---

## Phase 4: Specialist inbox

### Overview

The screen S-04 refused to build until its buttons could work.

### Changes Required:

#### 1. Service layer

**File**: `src/lib/services/bookings.ts`

**Intent**: Add the specialist's read path and the four actions, mapping SQLSTATEs to typed errors.

**Contract**: `listSpecialistBookings(supabase, specialistId)` reading `bookings_view` ordered by
`proposed_at`; `acceptBooking` / `declineBooking` / `completeBooking` / `cancelBooking`, each a
single `supabase.rpc(...)`. New typed errors carrying catalog keys, in the style of the existing
`AlreadyPendingError`: `NotYoursError` (42501), `StaleStateError` (Z0001), `ExpiredError` (Z0002),
`TooEarlyError` (Z0003). Do not destructure the Supabase response — see the note at line 63.

#### 2. Contact details reader

**File**: `src/lib/services/bookings.ts`

**Intent**: Fetch addresses for accepted bookings only.

**Contract**: `listContactDetails(supabase, bookingIds)` → `Map<string, BookingContactDetails>`. Pass
only the ids of bookings the caller already sees as `accepted` or `completed`; RLS enforces it
regardless, but the call should not ask for what it must not get.

#### 3. Action endpoints

**Files**: `src/pages/api/specialist/bookings/[id]/accept.ts`, `…/decline.ts`, `…/complete.ts`

**Intent**: One POST per verb, matching `src/pages/api/specialist/services/[id]/delete.ts`.

**Contract**: Each validates the session and `role === "specialist"`, calls its service function,
and redirects back to `/specialist/bookings` with `?message=<key>` or `?error=<key>` — message
catalog **keys**, never sentences (the rule S-02 set).

#### 4. Inbox page

**File**: `src/pages/specialist/bookings.astro`

**Intent**: Render the mockup's card list, minus everything the privacy split forbids.

**Contract**: Redirects a client to `/dashboard`, matching `src/pages/account/bookings.astro:25-27`.
Status chips as links (`?status=`), same as the client list, driven by `effective_status`. A pending
card shows service, proposed time, district, and a generic avatar — **no name, no note, no phone**.
An accepted card additionally renders the contact panel. An accepted card whose `proposed_at` has
passed shows the completion action. Terminal cards show status only, and for `declined` distinguish
`resolved_by = 'client'` from `'specialist'`.

#### 5. Navigation and strings

**Files**: `src/components/Topbar.astro`, the i18n catalogs, `src/components/booking/strings.ts`

**Intent**: Fill the specialist slot the Topbar comment reserves; add Polish and English copy.

**Contract**: `role === "specialist"` gains `/specialist/bookings` under the existing `bookings` key.
New keys for the four actions, their success and error messages, the empty state, the "do
domknięcia" nudge, and both decline variants — in both catalogs. Catalogs must not reach the client
bundle; islands receive resolved strings as props.

### Success Criteria:

#### Automated Verification:

- Lint passes by **exit code**: `npx eslint . ; echo $?` prints `0`
- Build passes: `npm run build`
- No catalog import from a `.tsx` file: `grep -rn "i18n/messages" src/components/` returns nothing

#### Manual Verification:

- As a specialist with a pending request: the card shows no name, no phone, no note
- Accept it; the contact panel appears with the client's street and note
- Decline a different one; it moves to the declined filter and no address is ever shown
- The completion button is absent before `proposed_at` and present after
- Signing in as a client and opening `/specialist/bookings` redirects to `/dashboard`
- Both language versions render with no missing-key fallbacks

---

## Phase 5: Client withdrawal and close-out

### Overview

The other side of the transaction, and the deploy.

### Changes Required:

#### 1. Cancel endpoint

**File**: `src/pages/api/bookings/[id]/cancel.ts`

**Intent**: Let a client withdraw a pending request.

**Contract**: POST, session + `role === "client"`, calls `cancelBooking`, redirects to
`/account/bookings` with a message key.

#### 2. Client list

**File**: `src/pages/account/bookings.astro`

**Intent**: Show the truth between cron runs, offer withdrawal, and name who closed a request.

**Contract**: Read `bookings_view` instead of `bookings` (via `listOwnBookings`); filter and badge on
`effective_status`. A pending row gains a withdraw action. A `declined` row renders one of two
labels depending on `resolved_by`. Remove the "Read-only: every transition belongs to S-05" comment
at the top of the file — it stops being true here.

#### 3. Row component

**File**: `src/components/booking/BookingRow.astro`

**Intent**: Accept the computed status and the optional action.

**Contract**: Takes `effective_status` for its badge; renders an optional action slot so the client
list can pass a withdraw button without the component knowing what it is.

### Success Criteria:

#### Automated Verification:

- Lint passes by **exit code**: `npx eslint . ; echo $?` prints `0`
- Build passes: `npm run build`
- Full database suite still green: `npx supabase test db ; echo $?` prints `0`

#### Manual Verification:

- A pending request older than its window shows "wygasłe" to the client **before** any cron run
- Withdrawing a pending request lets the client immediately request the same specialist again
- A request the specialist declined and one the client withdrew read differently
- Migrations pushed to the hosted project: `npx supabase db push`
- Deployed: `npx wrangler deploy`, then the full walkthrough repeated against production
- `cron.job_run_details` on the hosted project shows the job running every 15 minutes

---

## Testing Strategy

### Database Tests (pgTAP — the only automated suite in this project):

Phase 3 covers the transition graph, the privacy boundary, the view, and the job. See that phase.

### Manual Testing Steps:

1. Sign in as a client, request a booking from a discoverable specialist.
2. Sign in as that specialist. Confirm the pending card carries **no** name, phone or note.
3. Accept. Confirm the address panel appears and matches what the client entered.
4. Confirm the completion button is hidden until the proposed time passes.
5. As the client, request from a second specialist, then withdraw it. Confirm you can immediately
   request that same specialist again.
6. As the second specialist, decline a request. Confirm the client sees a decline attributable to
   the specialist, and that no address was ever visible.
7. Set a booking's `expires_at` into the past directly in SQL. Confirm both sides read "wygasłe"
   immediately, and that the specialist's accept action fails with the expired message.
8. Repeat 1–4 against production after deploy.

## Performance Considerations

`expire_stale_bookings()` scans `bookings_pending_expiry_idx`, which is partial to
`status = 'pending'` — the working set is live requests only, and 96 runs a day of a near-empty
index scan is free. `bookings_view` adds a `case` per row over a query already bounded by RLS to one
user's bookings.

## Migration Notes

Two forward-only migrations, no data backfill: `resolved_by` is nullable and existing rows are all
`pending`, which legitimately has no resolver. `create extension if not exists pg_cron` and the
guarded `cron.unschedule` make both migrations safe to replay through `supabase db reset`.

Rollback: dropping the two migrations' objects restores S-04 behaviour exactly — nothing here
alters an existing column or policy.

## References

- Slice definition: `context/foundation/roadmap.md` → S-05
- The migration this builds on, including its note to this slice:
  `supabase/migrations/20260807100000_bookings.sql:246-253`
- Function template: `supabase/migrations/20260807100000_bookings.sql:175-244`
- View template: `supabase/migrations/20260804120400_discoverable_specialists.sql`
- Cron and lazy-expiry ruling: `context/foundation/infrastructure.md:97`
- `service_role` rules: `context/foundation/lessons.md`
- Mockup (partially superseded): `context/foundation/design/web/booking-requests-specialist.html`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Transitions in the database

#### Automated

- [x] 1.1 Migration applies from scratch: `npx supabase db reset` — 7ca8c18
- [x] 1.2 Existing suite still green: `npx supabase test db` — 7ca8c18
- [x] 1.3 Lint passes by exit code: `npx eslint . ; echo $?` prints `0` — 7ca8c18
- [x] 1.4 Build passes: `npm run build` — 7ca8c18

#### Manual

- [x] 1.5 `resolved_by` present; no UPDATE for `authenticated`, nothing for `service_role` — 7ca8c18
- [x] 1.6 `bookings_view` returns only the caller's rows as a signed-in client — 7ca8c18

### Phase 2: Auto-expiry via pg_cron

#### Automated

- [x] 2.1 Reset applies both migrations twice without a duplicate-job error — 010de4a
- [x] 2.2 Exactly one `expire-stale-bookings` row in `cron.job` — 010de4a
- [x] 2.3 Lint passes by exit code: `npx eslint . ; echo $?` prints `0` — 010de4a

#### Manual

- [x] 2.4 Function expires a past-window pending row, returns 1, then returns 0 on re-run — 010de4a
- [x] 2.5 An accepted booking with a past `proposed_at` is untouched — 010de4a
- [ ] 2.6 `cron.job_run_details` shows successful runs on the hosted project

### Phase 3: pgTAP coverage

#### Automated

- [x] 3.1 Full suite green by exit code: `npx supabase test db ; echo $?` prints `0` — 0d82e21
- [x] 3.2 Assertion count has grown by at least 30 — 0d82e21

#### Manual

- [x] 3.3 Deliberately breaking a function turns a test red — 0d82e21

### Phase 4: Specialist inbox

#### Automated

- [x] 4.1 Lint passes by exit code: `npx eslint . ; echo $?` prints `0` — 4b0bf5c
- [x] 4.2 Build passes: `npm run build` — 4b0bf5c
- [x] 4.3 No catalog import from a `.tsx` file — 4b0bf5c

#### Manual

- [x] 4.4 Pending card shows no name, phone or note — 4b0bf5c
- [x] 4.5 Accepting reveals the contact panel — 4b0bf5c
- [x] 4.6 Declining never reveals an address — 4b0bf5c
- [x] 4.7 Completion button absent before `proposed_at`, present after — 4b0bf5c
- [x] 4.8 A client opening `/specialist/bookings` is redirected to `/dashboard` — 4b0bf5c
- [x] 4.9 Both language versions render with no missing-key fallbacks — 4b0bf5c

### Phase 5: Client withdrawal and close-out

#### Automated

- [x] 5.1 Lint passes by exit code: `npx eslint . ; echo $?` prints `0`
- [x] 5.2 Build passes: `npm run build`
- [x] 5.3 Full database suite still green: `npx supabase test db ; echo $?` prints `0`

#### Manual

- [x] 5.4 A past-window pending request reads "wygasłe" before any cron run
- [x] 5.5 Withdrawing frees the pair immediately
- [x] 5.6 Specialist-declined and client-withdrawn read differently
- [x] 5.7 Migrations pushed: `npx supabase db push`
- [x] 5.8 Deployed and walked through against production: `npx wrangler deploy`
- [ ] 5.9 `cron.job_run_details` on hosted shows 15-minute runs
