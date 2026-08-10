---
change_id: specialist-booking-management
title: Specialist booking management
status: implementing
created: 2026-08-07
updated: 2026-08-10
archived_at: null
---

## Notes

Roadmap slice S-05. Closes the two-sided transaction the north star opened: a specialist accepts
or declines a request, an unanswered request auto-expires, and an accepted booking can be marked
completed. PRD refs FR-011, FR-012.

Prerequisite S-04 is done and archived
(`context/archive/2026-08-07-client-booking-request/`).

### What this slice inherits, already built

- **The full status vocabulary** — `booking_status` is already
  `pending | accepted | declined | expired | completed`. S-04 defined it whole precisely so this
  slice changes no type on a live database.
- **`expires_at`** is already computed and indexed: `least(created_at + 48h, proposed_at)`, with
  `bookings_pending_expiry_idx` on it, partial to `status = 'pending'`. The cron only has to act.
- **The acceptance-gated policy already exists** — `booking_contact_details` becomes readable to
  the addressed specialist the moment `status = 'accepted'`. This slice does not write that
  policy; it writes the transition that trips it, which is why getting the transition right
  matters as much as the policy did.
- **The client's read-only list** at `/account/bookings`, with badge variants for every status
  already ported.
- **`service_role` grants**: `UPDATE` on `public.bookings` is deliberately present on hosted;
  `booking_contact_details` and `client_profiles` are deliberately revoked (20260807110000).

### The decisions this slice owns

- **The expiry job.** The only background work in the MVP. Cloudflare Cron Trigger per
  `context/foundation/infrastructure.md`. It runs with no user session — the first thing in this
  project to do so — so `context/foundation/lessons.md`'s `service_role` rule applies directly,
  and the answer is already half-written: it needs `UPDATE` on `bookings.status` and **must not**
  be given anything on `booking_contact_details`. A job that flips a status has no business
  reading addresses.
- **Transition policies.** `bookings` currently has no UPDATE policy at all. Every legal
  transition — pending→accepted, pending→declined, pending→expired, accepted→completed — needs
  one, and each must be impossible in the wrong direction or by the wrong party.
- **The specialist's inbox.** S-04 deliberately did not build it: an inbox whose buttons do
  nothing is worse than none. Now the buttons work.

### Carried in from earlier slices

- **`expires_at` honours the earlier of two bounds.** Same-day bookings are allowed, so a request
  can expire at its proposed time rather than 48h after creation. The cron must respect the
  column, not recompute a 48-hour rule.
- **S-06's review insert policy** must assert `profiles.role = 'client'` alongside the
  completed-booking check — `reviews.client_id` references `profiles`, which holds both roles
  (recorded in `20260804120300_reviews.sql`).
- **Two open PRD questions land here**: the concrete auto-expire window (S-04 chose 48h and the
  copy now states both bounds) and whether completion should be two-sided (PRD accepts
  specialist-marked for v1).
