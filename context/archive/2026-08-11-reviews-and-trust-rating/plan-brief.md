# Reviews and Trust Rating (S-06) — Plan Brief

> Full plan: `context/changes/reviews-and-trust-rating/plan.md`

## What & Why

A client can give a completed visit a star rating — once, permanently. This is FR-013, the write
half of the trust rating, and the last must-have slice on the roadmap. It feeds the average that
S-03 already knows how to display, which is the trust half of the product's wedge: discovery ranks
specialists by whether they serve your area, annotated by what previous clients thought.

## Starting Point

`public.reviews` already exists and is empty on every environment. S-03 built it for the read side
and deliberately shipped it with **no insert grant and no insert policy**, leaving a brief in the
migration header naming exactly what this slice adds. The display side is finished: the aggregate
lives in `discoverable_specialists`, `RATING_THRESHOLD = 3` is read in one place, and the "New
specialist" label already renders on cards and profiles in both languages.

## Desired End State

`/account/bookings` shows five stars on every completed visit the client has not rated, and the
rating they gave on the ones they have. A specialist cannot rate anyone, cannot rate on a client's
behalf, and cannot learn who rated them. On the third rating a specialist's card stops saying "New
specialist" and starts showing an average — through code that already exists and is not touched.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Write path | `SECURITY DEFINER` function, no insert grant | Matches the only write pattern in the project (S-05's four transition functions) and reuses an error-code vocabulary the UI already maps; S-03 predicted a policy, and this deliberately diverges |
| Attribution | `specialist_id` / `client_id` read off the booking inside the function | No request shape can attribute a rating to the wrong pair |
| Read surface | Revoke `anon`; column-level `select` for `authenticated` without `client_id` | Removes the retaliation vector while keeping the aggregate working — the views are `security_invoker`, so revoking outright would zero every average |
| `service_role` | Explicit `revoke all` | It is `BYPASSRLS` and holds `GRANT ALL` on hosted; only a revoke is a real boundary (`lessons.md`) |
| Mutability | None — one insert, no update or delete | The unique constraint alone enforces FR-013; no extra grants, no second UI path |
| Deadline | None | PRD is silent, and at cold start every rating counts toward a threshold of 3 |
| "Already rated?" lookup | By `booking_id`, no new column | A column-level grant makes `client_id` unusable even in a `where`; avoids a `create or replace view` on a live database |
| UI placement | The existing `action` slot on the bookings row | `BookingRow.astro` was built for this and needs no change |
| Threshold | Confirm 3, close PRD Open Question #6 | The value has been live since S-03; the PRD is the only place still asking |

## Scope

**In scope:** the `booking_id` link and one-per-booking constraint; `submit_review`; narrowed read
grants; pgTAP coverage; schema, service and endpoint; the star control, the already-rated state and
both catalogs; the PRD amendment.

**Out of scope:** free-text reviews; editing or withdrawing a rating; any deadline; moderation or
reporting; changing the threshold or `ratingLabel()`; rating display on the specialist's own
screens; rewriting the aggregate; retrofitting the nine sibling endpoints' `/dashboard` redirect.

## Architecture / Approach

One migration carries the whole security surface: the booking link, the unique constraint, the
narrowed grants and the single function permitted to write. The client posts a plain form to
`/api/bookings/<id>/review`, which parses the rating with zod and calls the RPC through a service
module that turns `23505` / `42501` / `Z0001` into typed errors carrying message-catalog keys. The
page reads back what has been rated by booking id. Nothing in the discovery read path changes.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Database | Booking link, unique constraint, `submit_review`, narrowed grants | `not null` on a table that exists in production — safe only because it is empty; grant changes are not re-runnable |
| 2. pgTAP | Assertions pinning who may write and what leaks | A boundary left unasserted is one a later edit removes silently |
| 3. Service + endpoint | Schema, typed errors, the POST route | Error codes mapped to the wrong catalog keys read as generic failures |
| 4. UI, copy, PRD | Stars, already-rated state, both catalogs, Open Question #6 closed | The control has to fit a narrow slot beside the badge and price |

**Prerequisites:** S-05 archived (done); local Supabase stack running; hosted `reviews` confirmed
empty before the Phase 1 push.
**Estimated effort:** ~4 sessions, one per phase, front-loaded on Phase 1.

## Open Risks & Assumptions

- **Assumes `public.reviews` is empty on hosted.** Guaranteed by the absence of any write path since
  S-03, but Phase 1 verifies it before pushing rather than trusting the argument.
- **Specialist-gated completion biases ratings upward** — a specialist who expects a bad review can
  simply never mark the visit completed. Logged in the PRD as an Open Question and accepted for v1;
  it makes the ">4.0 average" guardrail weaker than it reads.
- **Cold start.** With a threshold of 3, every specialist shows "New specialist" until three
  separate completed visits are rated. That is correct behaviour and will still look like an empty
  product for a while.
- **The grant change is a one-way door within this slice.** Restoring the previous read surface
  means a new migration, not a re-run.

## Success Criteria (Summary)

- A client rates a completed visit once, and cannot rate it again or rate anything else.
- A specialist can neither write a rating nor discover who wrote one about them.
- A specialist's card flips from "New specialist" to an average on the third rating, with no change
  to the code that decides it.
