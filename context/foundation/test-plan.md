---
project: Arrivo
version: 1
status: active
created: 2026-09-05
updated: 2026-09-05
prd_version: 1
---

# Test Plan: Arrivo

> What this project tests, why it tests exactly that, and what it deliberately does not test.
> Every risk below names the assertions that cover it. Run the suite with
> `npx supabase test db ; echo $?` — **144 assertions across 6 files**, and the exit code is the
> verdict (see `lessons.md`, "A grep over lint output cannot tell clean from crashed").

## Why the tests live in the database

There is **no JavaScript test runner** in this project — no Vitest, no Playwright, no `test`
script. That is a decision, not an omission, and it follows from where the risk actually sits.

Arrivo's load-bearing rules are not written in TypeScript. They are RLS policies, column grants,
`SECURITY DEFINER` functions and a booking state machine, all of them in Postgres. The application
layer mostly _asks_ the database questions; the database decides. A test suite that mocked
Supabase would assert that the mock behaves as written, and would have caught none of the four
real defects this project has hit — every one of them was a policy, a grant, or a join.

So the automated coverage is **pgTAP against a real Postgres instance with real RLS**, exercising
each boundary from both sides: the caller who may, and the caller who may not.

The cost is stated plainly: the browser-facing layer has no automated tests. See _Not covered_.

## Risks and the assertions that cover them

### R1 — A client's home address is readable before the specialist accepts

**Why it matters.** The PRD makes this a launch guardrail in its own words: leakage "is a
regression even if every other metric holds". The whole product asks people to hand over their
home address to a stranger who will come to it. The window between "I asked" and "you agreed" is
the one where the address must not be visible.

**Covered by** — `bookings_rls.test.sql`, `booking_transitions.test.sql`, `discovery_rls.test.sql`:

- the addressed specialist CANNOT read the address while the request is pending
- BEFORE accepting, the addressed specialist cannot read the address
- AFTER accepting, the addressed specialist can read the address / the address revealed is the one the client saved
- accepting one booking does not open its address to a different specialist
- an unrelated specialist cannot see somebody else's request
- an expired request never reveals the address
- declining never reveals the address
- a specialist cannot read a client's address before any booking exists (F-01 privacy contract)
- the note is NOT on bookings — everything the client typed sits behind acceptance
- client_profiles is still closed — a specialist reads the booking snapshot, never the profile

The last two are the non-obvious ones: a free-text note can contain an address, so it lives with
the address rather than on the booking row; and the specialist reads a _snapshot_ on the booking,
never the client's profile.

### R2 — `service_role` bypasses every policy, and hosted grants differ from local

**Why it matters.** `service_role` is `BYPASSRLS`, so policies are invisible to it, and hosted
Supabase carries `ALTER DEFAULT PRIVILEGES … GRANT ALL … TO service_role` that `supabase start`
does not reproduce. This project has already been burned: 18 local assertions "proved" a boundary
that production did not have (`lessons.md`, entry 5). Only an explicit `revoke` is a real
boundary, and only a catalog assertion proves the revoke is still there.

**Covered by** — `bookings_rls.test.sql`, `reviews_rls.test.sql`:

- service_role has no DML on booking_contact_details — it bypasses RLS, so this is the only boundary
- service_role has no DML on client_profiles, for the same reason
- service_role has no DML on reviews — it bypasses RLS, so this is the only boundary

**Known limit:** these read the local catalog. They cannot prove the hosted state — that needs
`supabase db diff --linked`, which is recorded in the PRD's NFR verification note.

### R3 — A specialist can work out who gave them a bad rating

**Why it matters.** v1 has no moderation and no admin role, so the only available answer to
retaliation is that authorship is not published. This risk is here because the project got it
**wrong once**: S-06 withheld `reviews.client_id` with a column grant and believed that closed it,
while `booking_id` stayed joinable to `bookings.client_id`. The assertion that "proved" the
boundary only tested the direct column read, so it passed against a database that did not have the
property (impl-review F1).

**Covered by** — `reviews_rls.test.sql`:

- the specialist reads no review row of their own
- **the specialist CANNOT re-derive the author by joining bookings on booking_id** ← the join itself, not a proxy for it
- the specialist CANNOT learn who wrote it
- even the rating's own author cannot read client_id back
- authenticated holds no SELECT on reviews.client_id
- the specialist still sees their own rating COUNT through the aggregate

The last one is a positive control: closing the vector must not blank the average, which is the
product's whole trust signal.

### R4 — Ratings can be forged, repeated, or left on visits that never happened

**Why it matters.** FR-013 allows exactly one rating per completed booking, by the client who was
visited. The rating average is the only trust signal in the product and the PRD guards it with a
floor of 4.0, so anything that lets a rating be manufactured makes that number meaningless.

**Covered by** — `reviews_rls.test.sql`:

- the client on a completed booking can rate it
- the same booking cannot be rated twice
- an accepted-but-not-completed booking cannot be rated
- a client cannot rate somebody else's visit
- the specialist on the booking cannot rate their own visit
- a client cannot insert a rating directly, bypassing the function
- a booking that does not exist is refused as "not yours", not as "not found"
- anon cannot execute submit_review

The "not found" one guards a subtler risk: distinguishing "no such booking" from "not yours" would
turn the function into an oracle for whether a uuid names a real booking.

### R5 — The booking state machine can be driven by the wrong party or into an illegal state

**Why it matters.** Accept, decline, withdraw and complete are four transitions with two actors
and overlapping legality. FR-011 and FR-012 assign each act to exactly one party. Getting this
wrong lets a specialist withdraw on a client's behalf, or a client mark their own visit completed
and then rate it — which loops straight back into R4.

**Covered by** — `booking_transitions.test.sql` (42 assertions), including:

- a specialist cannot accept / decline a request addressed to somebody else
- a specialist cannot withdraw a request — that is the client's act
- a client cannot accept their own request
- a client cannot mark a visit completed
- accepting an already-accepted booking is refused
- an accepted visit two days away cannot be marked completed yet
- withdrawal is recorded as declined / attributed to the client, not the specialist
- an unknown booking id is refused with the same code as one belonging to somebody else

### R6 — A request sits pending forever, or expires in a way the UI disagrees with

**Why it matters.** FR-011 auto-expires stale requests so a client is never blocked indefinitely.
There are two mechanisms — a `pg_cron` job every 15 minutes, and `bookings_view.effective_status`,
which reports `expired` the instant the window closes. They must agree, and the pair
(client, specialist) must be freed at the right moment or the client cannot re-request.

**Covered by** — `booking_transitions.test.sql`, `bookings_rls.test.sql`:

- the view reads expired for a past-window pending row BEFORE the job runs
- the stored status is still pending — which is why the job is needed as well
- the view leaves a non-pending status alone
- a client cannot withdraw a request whose window has closed
- a specialist cannot accept / decline a request whose window has closed
- withdrawal frees the client-specialist pair at once
- a client whose request already lapsed can request that specialist again, before any cron run
- the lapsed row is closed as expired/system, not as a withdrawal
- expiry never outlives the moment the booking proposes

### R7 — A specialist writes to another specialist's card or services

**Why it matters.** Ownership is the whole authorization model on the supply side. This risk grew
when the service **edit** path shipped: `services_update_own` and the update grant had existed
since S-02 but nothing called them, so the path went from "granted" to "reachable" without ever
having been asserted.

**Covered by** — `specialist_listing_rls.test.sql`:

- specialist cannot list a service under someone else's card
- **specialist cannot move their service onto someone else's card (WITH CHECK, not USING)**
- specialist can edit a service on their own card / the edit is persisted, not just permitted
- specialist cannot create a card under another user's id
- a client-role account cannot create a specialist card
- a client-role account cannot list a service (refused by FK, not by policy)
- anon cannot write a specialist card

The `WITH CHECK` assertion is the load-bearing one. `USING` decides which rows an update can see;
only `WITH CHECK` decides what they may become, and it is the half quietly lost when a policy is
rewritten.

### R8 — A user escalates their own role

**Why it matters.** Role is the top-level authorization split. If an account can set its own role
to `specialist`, every supply-side policy opens at once.

**Covered by** — `profiles_rls.test.sql`:

- end user cannot update their own role (privilege denied)
- garbage role metadata defaults to client without erroring
- absent role metadata defaults to client
- RLS: user A sees exactly one profile (their own)

Failing **closed** on garbage input is the point: an unparseable role must become the least
privileged one, not error out or default upward.

### R9 — Discovery shows a card that cannot be booked, or a trust label that misleads

**Why it matters.** This is the product wedge. A card that appears in results but has no service
wastes the client's only interaction, and an average shown too early makes a single five-star
rating look like a track record — which is exactly what the > 4.0 guardrail would then be
measuring.

**Covered by** — `discovery_rls.test.sql`, `reviews_rls.test.sql`:

- a card with a name but no areas and no services is NOT discoverable
- a card with an area but no service is NOT discoverable
- a card with a name, an area and a service IS discoverable
- removing the last service makes the card undiscoverable again
- rating_avg is null with no reviews — not 0, which would read as a one-star specialist
- rating_count is 0 with no reviews
- min_price_cents reports the cheapest service
- discoverable_specialists counts / averages the new rating

### R10 — Validation drifts between the zod schemas and the database constraints

**Why it matters.** Bounds are written twice — once in `src/lib/schemas/` for the message a user
sees, once as a `check` constraint that actually holds. Nothing structural keeps them in step, so
a bound moved in a migration turns into input that passes validation and then fails at the
database with an untranslated error.

**Covered by** — `specialist_listing_rls.test.sql`:

- DB bound matches schema: a 61-character display_name is refused
- DB bound matches schema: an untrimmed display_name is refused
- DB bound matches schema: a zero price is refused
- a postal code outside the NN-NNN format is refused (`discovery_rls.test.sql`)
- an untrimmed first name is refused

These assertions name the schema file on purpose, so the failure points at the second copy.

## Not covered — and why

Stated so nobody mistakes silence for coverage.

- **No browser or end-to-end tests.** The UI is verified by hand; the S-06 pass is recorded in
  that change's archived plan, step by step. A Playwright suite is the obvious next investment
  and is not in v1.
- **No unit tests for the TypeScript service layer.** Those modules are thin wrappers that
  translate Postgres error codes into typed errors carrying catalog keys. The codes they map are
  asserted at the database; the mapping itself is a lookup table.
- **The hosted database is not under test.** Every assertion runs locally. `service_role` grants
  and default privileges genuinely differ on hosted (R2), so local green is necessary and not
  sufficient — `supabase db diff --linked` is the check, run by hand at deploy time.
- **No load or performance tests.** The p95 numbers in the PRD's NFR note are one-off
  measurements, not a regression gate.
- **No accessibility test suite.** Tap targets and reduced motion were measured once in the
  browser and recorded in the PRD; nothing re-checks them.

## Running it

```bash
npx supabase db reset && npx supabase test db ; echo $?
```

The suite is idempotent — it passes twice in a row without a reset, and that is itself asserted by
habit rather than by a test. The reset is still the honest way to attribute a red run: a failure
that survives one belongs to the diff.

**Check the exit code, never a grep over the output.** A crashing test file produces no failure
lines and an empty grep reads as success. This project has been caught by that once already
(`lessons.md`, entry 2).
