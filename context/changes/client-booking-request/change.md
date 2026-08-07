---
change_id: client-booking-request
title: Client booking request
status: implemented
created: 2026-08-07
updated: 2026-08-07
archived_at: null
---

## Notes

Roadmap slice S-04 — **the north star**. The validation milestone: the smallest end-to-end flow
whose success proves the demand-first hypothesis. Everything before it exists to make this
possible; everything after it only matters if clients actually reach this step.

Outcome per the roadmap: a client requests a booking from a discovered specialist by proposing a
date/time; the request records the chosen service, the proposed date/time, and the client's
address — revealed to the specialist only after acceptance. PRD refs US-01, FR-010.

Prerequisite S-03 is done and archived (`context/archive/2026-08-04-area-matched-discovery/`).

### What this slice inherits, already built

- **Disabled booking CTAs are already in the layout** — one in the profile header, one per service
  row (`src/pages/specialists/[id].astro`). S-04 swaps an attribute rather than rebuilding those
  screens; that was the explicit reason for rendering them inert rather than omitting them.
- **`client_profiles`** holds first name, last name, phone, area, street and postal code, with
  own-row-only RLS and no public read of any kind.
- **`discoverable_specialists`** is the single definition of who may be booked at all — the same
  view the search and the specialist's own visibility banner read.
- **Error/message keys**, the `tUnknown` fallback rule and `isMessageKey` for success banners.
- **`AreaPicker`** in `single` mode with radio semantics, if an address ever needs confirming at
  booking time.

### The load-bearing decision this slice owns

F-01's privacy contract and the PRD's launch guardrail stop being theory here. `client_profiles`
is currently readable **only by its owner** — deliberately, because the policy that opens it could
not be written correctly against a `bookings` table that did not exist
(`supabase/migrations/20260804120100_client_profiles.sql`).

S-04 must add exactly one policy: a specialist may read the row of a client **whose booking they
have accepted**, and no other. Getting this wrong is the one failure the PRD calls a regression
"even if every other metric holds".

### Open questions the plan must resolve

- Blind proposals (no visible availability) cause back-and-forth. PRD accepts request/accept for
  v1; calendar availability is deferred. Owner: user, non-blocking.
- Where does the address come from at request time — the saved `client_profiles` row, or a
  per-booking override? FR-003 kept the saved address "for convenience", which implies the former.
- S-05 owns accept/decline/expire/complete. S-04 must define the `pending` state and the columns
  those transitions will need, without building them.

### Carried in from earlier slices

- `context/foundation/lessons.md` — `service_role` has no DML on domain tables. S-05's auto-expire
  cron is the first thing that will hit this; decide it here if the schema lands here.
- S-06's review insert policy must assert `profiles.role = 'client'` alongside the
  completed-booking check — `reviews.client_id` references `profiles`, which holds both roles
  (recorded in `supabase/migrations/20260804120300_reviews.sql`).
