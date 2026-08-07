# Client Booking Request — Plan Brief

> Full plan: `context/changes/client-booking-request/plan.md`

## What & Why

Roadmap slice S-04, the **north star**. A client requests a booking from a discovered specialist by
proposing a date and time; the request records the chosen service, the proposed moment and the
client's address, revealed to the specialist only after acceptance.

This is the validation milestone. Everything before it exists to make this moment possible;
everything after it only matters if clients actually reach it.

## Starting Point

S-03 shipped discovery and, deliberately, the seams this slice needs: the booking CTAs are already
in the profile layout as `disabled` buttons, `client_profiles` holds the address behind own-row-only
RLS, and `discoverable_specialists` answers who may be booked at all.

What is missing is the policy that ever lets a specialist see a client's address. Its absence is
recorded in `20260804120100_client_profiles.sql` — it could not be written against a `bookings`
table that did not exist. Writing it is this slice's central task.

## Desired End State

A client on a specialist's profile picks a service, proposes a date and time, confirms the address
carried over from their profile, optionally adds one logistical note, and submits. The specialist
sees a pending request showing the district, the service, the time and the note — and nothing that
identifies the client. The client sees it on "Moje rezerwacje" with a pending badge.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Address storage | Snapshot on the booking, editable before submit | The specialist travels to the address agreed for *this* visit; a later profile edit must not silently redirect them |
| Pre-acceptance visibility | District, service, time, note — nothing identifying | What the NFR requires and the mockup shows: enough to decide, not enough to identify |
| Privacy mechanism | Separate 1:1 `booking_contact_details` table | RLS grants whole rows; column grants are static and would hide the address *after* acceptance too |
| Scope vs S-05 | Request + client's read-only list | A client who submits and has nowhere to look cannot validate anything — and the loop is what the north star measures |
| Proposed time | `timestamptz`, composed explicitly in `Europe/Warsaw` | Workers runs in UTC; composing without a named zone shifts every booking by the offset, invisibly |
| Time bounds | 3 hours to 90 days ahead | Same-day visits are a real need in this trade; the upper bound catches a mistyped year |
| Expiry | Earlier of `created_at + 48h` and `proposed_at` | 48h was the product choice; the second bound exists because a request cannot outlive the moment it proposes |
| Note field | One optional note, written once | "Ring doorbell 12" has no other channel in v1; that is not a chat thread |
| Duplicates | One pending request per client–specialist pair | Enforced by a partial unique index; nothing costs anything in v1, so the database has to hold the line |
| Status vocabulary | Full enum now, only `pending` written | The contact-details policy must reference `accepted` — the same coupling that blocked this in S-03 |
| Deleted service | Snapshot + `on delete set null` | A tidied price list must not silently delete someone's booking |
| Missing address | Redirect to profile, return to the booking form | The client is at peak intent; a wall with no way back is the worst possible moment for one |

## Scope

**In scope:** `bookings` and `booking_contact_details` with their RLS; the atomic submission
function; the booking form; CTA activation; the client's read-only bookings list; nav wiring; pgTAP
covering the guardrail from both sides.

**Out of scope:** accept/decline/expire/complete (S-05); the specialist's request inbox (S-05);
reviews (S-06); notifications of any kind; a message thread; calendar availability; payments; a JS
test runner.

## Architecture / Approach

`bookings` carries what a specialist may see while deciding — district, service snapshot, proposed
time, note, status. `booking_contact_details` carries what they may see only after accepting, in a
1:1 row whose select policy requires the parent booking to be `accepted` and addressed to them.
Two tables, because Postgres has no conditional column visibility.

Both rows are written by one `SECURITY DEFINER` function: PostgREST has no cross-request
transaction, and a booking whose contact details failed to insert is a request the specialist can
accept and then not travel to.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema and the privacy contract | Both tables, the enum, the policies, the atomic function, pgTAP | The guardrail the PRD calls a launch-blocking regression; a `SECURITY DEFINER` function without an identity check is a hole straight through the RLS |
| 2. Submitting a request | Form, endpoint, CTA activation, redirect-with-return | Timezone: a booking composed without a named zone is wrong by the offset and looks right all winter |
| 3. My bookings | Read-only list, status filters, nav wiring | Low — one query scoped by `client_id` |

**Prerequisites:** S-03 archived (done, `context/archive/2026-08-04-area-matched-discovery/`);
Supabase local stack with Docker.

**Estimated effort:** ~3 sessions, one per phase. Deadline 2026-08-17.

## Open Risks & Assumptions

- The privacy guardrail is the whole point of phase 1. The PRD calls leakage a regression "even if
  every other metric holds", so the pgTAP assertions on both directions are not optional.
- `SECURITY DEFINER` bypasses RLS by design. Without a pinned `search_path` and an explicit
  `auth.uid()` check it becomes a way to write bookings as any client.
- The timezone helper has no automated coverage and is the most likely place for a silent bug —
  a winter-only test passes at the wrong offset.
- Same-day bookings plus a 48-hour window were chosen independently and conflict; the
  earlier-of-two expiry resolves it, but S-05 must honour that rule when it builds the cron.
- One pending request per pair means a client wanting two different services from the same
  specialist must wait. Accepted as the cost of the anti-spam guarantee.

## Success Criteria (Summary)

- A client can request a booking from a specialist they found, and see it afterwards.
- A specialist can see a request without being able to identify or contact the client until they
  accept — verified in both directions by pgTAP, not by intent.
- A booking proposed for 18:00 reads back as 18:00 on every screen.
