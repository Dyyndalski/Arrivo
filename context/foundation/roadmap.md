---
project: Arrivo
version: 1
status: draft
created: 2026-07-28
updated: 2026-09-01
prd_version: 1
main_goal: market-feedback
top_blocker: time
---

# Roadmap: Arrivo

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Arrivo is a home-visit-first marketplace for beauty/hair services: it connects clients who can't or won't travel to a salon with independent specialists who travel to the client. The product wedge — the one trait that, if removed, makes it just another salon-booking app — is that discovery is driven by whether a specialist's **declared service area covers the client**, annotated by a trust rating from completed visits. The bet is demand-first: win the access-constrained client, and supply follows.

## North star

**S-04: Client requests a booking from an area-matched specialist** — this is the validation milestone: the smallest end-to-end flow whose success proves the core demand-first hypothesis (a real client finds a specialist who serves their area and asks to book). It's placed as early as its Prerequisites allow, because every later slice only matters if this transaction actually happens.

## At a glance

| ID   | Change ID                     | Outcome (user can …)                                                                                     | Prerequisites | PRD refs                               | Status |
| ---- | ----------------------------- | -------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------- | ------ |
| F-01 | domain-data-rls-foundation    | (foundation) roles link accounts to client/specialist; address stays private until a booking is accepted | —             | Access Control, NFR (privacy)          | done   |
| S-01 | role-aware-accounts           | sign up as a client or specialist, sign in/out, recover a password                                       | F-01          | FR-001, FR-002                         | done   |
| S-02 | specialist-service-listing    | (specialist) create a profile with declared areas and list a service                                     | S-01          | US-02, FR-004, FR-005                  | done   |
| S-03 | area-matched-discovery        | (client) set your area and find specialists who serve it, filtered by type/price, with a rating summary  | S-01, S-02    | FR-003, FR-006, FR-007, FR-008, FR-009 | done   |
| S-04 | client-booking-request        | (client) request a booking from a matched specialist, proposing a date/time                              | S-03          | US-01, FR-010                          | done   |
| S-05 | specialist-booking-management | (specialist) accept/decline a request, auto-expire stale ones, mark completed                            | S-04          | FR-011, FR-012                         | done   |
| S-06 | reviews-and-trust-rating      | (client) rate a completed visit; profiles show an average once enough ratings exist                      | S-05, S-03    | US-03, FR-013, FR-014                  | done   |

## Baseline

What's already in place in the codebase as of 2026-07-28 (auto-researched + user-confirmed). Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 7 SSR + React 19 islands, Tailwind 4, shadcn/ui (`src/components/ui`).
- **Backend / API:** present — Astro server routes, incl. `src/pages/api/auth/*`.
- **Data:** absent (domain) — Supabase is provisioned as the external database with `auth.users`, but there is no schema/migrations/models for specialists, services, areas, bookings, or reviews, and no shared entity types.
- **Auth:** present (generic) — Supabase email/password sign-in/up/out with cookie sessions and route middleware (`context.locals.user`, `PROTECTED_ROUTES`). No role distinction or password recovery yet.
- **Deploy / infra:** present — Cloudflare Workers, live at `arrivo.dyndalski.workers.dev`; CI runs lint + build on `main` (no auto-deploy step yet).
- **Observability:** partial — Cloudflare observability enabled in `wrangler.jsonc`; no error tracking.

## Foundations

### F-01: Domain roles + address-privacy policy

- **Outcome:** (foundation) every account is linked to a client or specialist identity, and the data layer enforces that a client's exact address is never readable by anyone until the specialist accepts that client's booking — the coarse area alone is used for matching before then.
- **Change ID:** domain-data-rls-foundation
- **PRD refs:** Access Control (client/specialist roles), NFR (address not visible until acceptance), Success Criteria Guardrail (addresses never publicly exposed)
- **Unlocks:** S-01 (role-aware sign-up), and the privacy contract that S-03 (address) and S-04 (booking) must honor; reduces the "how is address privacy enforced" unknown; establishes the address-leak verification path every later slice relies on.
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sequenced first because it is the smallest cross-cutting contract every slice needs, and because the address-privacy guardrail is a launch-blocking property that is far cheaper to get right before any address or booking data exists than to retrofit. Kept minimal — it establishes roles + the privacy policy pattern only; each slice adds its own entities on top.
- **Status:** done

## Slices

### S-01: Role-aware accounts

- **Outcome:** a visitor can sign up as either a client or a specialist, sign in and out, and recover a forgotten password.
- **Change ID:** role-aware-accounts
- **PRD refs:** FR-001, FR-002
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Extends the generic Supabase auth that already exists (baseline) with the role choice and recovery the domain needs; must land before either side can act. Small, but it's the gate every downstream slice sits behind.
- **Status:** done

### S-02: Specialist profile + service listing

- **Outcome:** a signed-in specialist can create/edit a provider profile (name + declared service areas) and list a service by choosing a type from a fixed taxonomy and setting a price.
- **Change ID:** specialist-service-listing
- **PRD refs:** US-02, FR-004, FR-005
- **Prerequisites:** S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Fixed service-type taxonomy — what are the initial categories? Owner: user. Block: no (a small seed list can be chosen at plan time).
- **Risk:** Supply must exist before discovery has anything to show, so it precedes the client-facing slices despite the product being demand-first. The declared-area model here is what S-03's matching reads.
- **Status:** done

### S-03: Area-matched discovery

- **Outcome:** a signed-in client can set/edit their saved home address, browse a filterable list of specialists, filter by service type and price, restrict results to specialists whose declared areas cover them, and open a profile showing services plus a star-rating summary.
- **Change ID:** area-matched-discovery
- **PRD refs:** FR-003, FR-006, FR-007, FR-008, FR-009
- **Prerequisites:** S-01, S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Self-declared areas can be gamed ("serves everywhere"). Owner: user. Block: no (PRD accepts self-declared areas for v1 as a known limitation; verification is deferred).
- **Risk:** This is the wedge — the area-match rule made real. Sequenced right before the north star because a client must be able to _find_ a serving specialist before they can request one. Address handling here must honor F-01's privacy policy (coarse area for matching; exact address stays private).
- **Status:** done

### S-04: Client booking request _(north star)_

- **Outcome:** a client can request a booking from a discovered specialist by proposing a date/time; the request records the chosen service, the proposed date/time, and the client's address (revealed to the specialist only after acceptance).
- **Change ID:** client-booking-request
- **PRD refs:** US-01, FR-010
- **Prerequisites:** S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Blind proposals (no visible availability) may cause back-and-forth. Owner: user. Block: no (PRD accepts request/accept for v1; calendar availability is deferred).
- **Risk:** The validation milestone. Everything before it exists to make this possible; everything after it only matters if clients actually reach this step. Applies F-01's privacy contract to the address captured on the request.
- **Status:** done

### S-05: Specialist booking management

- **Outcome:** a specialist can accept or decline a booking request; a request not acted on within a set window auto-expires; a specialist can mark an accepted booking as completed.
- **Change ID:** specialist-booking-management
- **PRD refs:** FR-011, FR-012
- **Prerequisites:** S-04
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Auto-expire window — concrete duration? Owner: user. Block: no (PRD suggests ~3 days as a default; the scheduled job maps to a Cloudflare Cron Trigger per infrastructure.md).
  - Two-sided completion — should completion be mutual rather than specialist-marked? Owner: user. Block: no (PRD accepts specialist-marked completion for v1).
- **Risk:** Closes the two-sided transaction the north star opens. The auto-expire piece is the only background/scheduled work in the MVP; it must resolve every pending request so clients never sit blocked forever.
- **Status:** done

### S-06: Reviews + trust rating

- **Outcome:** a client can leave a star rating for a booking the specialist has marked completed (one rating per completed booking); a specialist's profile shows an average rating once a threshold number of ratings exists, otherwise a "New specialist" label.
- **Change ID:** reviews-and-trust-rating
- **PRD refs:** US-03, FR-013, FR-014
- **Prerequisites:** S-05, S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Ratings threshold before an average is shown — concrete N? Owner: user. Block: no (PRD suggests e.g. 3).
  - Specialist-gated completion may bias ratings upward. Owner: user. Block: no (integrity risk logged; relevant to the >4.0 guardrail's meaning).
- **Risk:** Feeds the trust half of the wedge (ratings shown in discovery, S-03) and the >4.0 average guardrail. Last on the must-have path because it needs completed bookings to exist; free-text review text is deferred to v2.
- **Status:** done

## Backlog Handoff

| Roadmap ID | Change ID                     | Suggested issue title                                     | Ready for `/10x-plan` | Notes                                                                |
| ---------- | ----------------------------- | --------------------------------------------------------- | --------------------- | -------------------------------------------------------------------- |
| F-01       | domain-data-rls-foundation    | Domain roles + address-privacy policy foundation          | yes                   | Run `/10x-plan domain-data-rls-foundation` — unlocks the whole chain |
| S-01       | role-aware-accounts           | Role-aware accounts (client/specialist sign-up, recovery) | no                    | After F-01                                                           |
| S-02       | specialist-service-listing    | Specialist profile + service listing                      | no                    | After S-01; needs a seed service-type taxonomy                       |
| S-03       | area-matched-discovery        | Area-matched specialist discovery                         | no                    | After S-02; the wedge                                                |
| S-04       | client-booking-request        | Client booking request (north star)                       | no                    | After S-03; validation milestone                                     |
| S-05       | specialist-booking-management | Specialist booking accept/decline/expire/complete         | no                    | After S-04; includes the auto-expire cron                            |
| S-06       | reviews-and-trust-rating      | Reviews + trust rating display                            | no                    | After S-05                                                           |

## Open Roadmap Questions

1. **Who moderates reviews / handles disputes without an admin role?** — Owner: user. Block: roadmap-wide (post-launch; no in-app owner in v1).
2. **How are self-declared service areas verified?** — Owner: user. Block: none (S-03 ships with self-declared areas as a known v1 limitation).
3. **What is the auto-expire window for pending requests?** — Owner: user. Block: none for planning (S-05 can adopt the ~3-day default; confirm before launch).
4. **What is the ratings threshold N before an average is shown?** — Owner: user. Block: none for planning (S-06 can adopt e.g. 3).
5. **Should booking completion be two-sided, and does specialist-gated completion inflate ratings?** — Owner: user. Block: none (S-05/S-06 ship the v1 model; revisit against the >4.0 guardrail).
6. **Is accessibility really out of scope for v1?** — Owner: user. Block: none (flagged tension with the elderly/limited-mobility persona; currently a Non-Goal).
7. **What do salon-first incumbents get wrong about the home-visit flow?** — Owner: user. Block: none (sharpens positioning, not sequencing).

## Parked

- ~~**Free-text specialist bio (FR-015, nice-to-have)**~~ — **DELIVERED, unparked 2026-09-01.** Parked on the reasoning that it was polish behind the must-have path, then shipped anyway inside S-02 without anyone moving this entry: the bio is editable at `/specialist/profile` (`src/lib/schemas/specialist.ts` `bio`, `src/pages/api/specialist/profile.ts`), stored on `specialist_profiles.bio`, and rendered to clients at `src/pages/specialists/[id].astro:126`. This is the PRD's only nice-to-have, so v1 now covers FR-001…FR-015 in full.
- **Online / in-app payments** — Why parked: PRD §Non-Goals — payment happens directly with the specialist at the visit in v1.
- **In-app chat / messaging** — Why parked: PRD §Non-Goals — the request/accept flow carries the needed coordination.
- **Native mobile apps** — Why parked: PRD §Non-Goals — web only for v1.
- **External calendar sync, loyalty, discounts, promotions** — Why parked: PRD §Non-Goals.
- **Availability / calendar scheduling** — Why parked: v1 uses request/accept (implied by FR-010's Socratic resolution); deferred to v2.
- **Free-text (moderated) reviews** — Why parked: v1 is star-rating only (FR-009/FR-013 resolutions); needs a moderation path that has no owner in v1.
- **Accessibility conformance target** — Why parked: PRD §Non-Goals for v1 (see Open Roadmap Question 6).

## Done

- **F-01: (foundation) roles link accounts to client/specialist; address stays private until a booking is accepted** — Archived 2026-07-28 → `context/archive/2026-07-28-domain-data-rls-foundation/`. Lesson: —.
- **S-01: a visitor can sign up as either a client or a specialist, sign in and out, and recover a forgotten password** — Archived 2026-07-29 → `context/archive/2026-07-28-role-aware-accounts/`. Lesson: —.
- **S-02: a signed-in specialist can create/edit a provider profile (name + declared service areas) and list a service by choosing a type from a fixed taxonomy and setting a price** — Archived 2026-08-04 → `context/archive/2026-08-03-specialist-service-listing/`. Lesson: —.
- **S-03: a signed-in client can set/edit their saved home address, browse a filterable list of specialists, filter by service type and price, restrict results to specialists whose declared areas cover them, and open a profile showing services plus a star-rating summary** — Archived 2026-08-07 → `context/archive/2026-08-04-area-matched-discovery/`. Lesson: —.
- **S-04 (north star): a client can request a booking from a discovered specialist by proposing a date/time; the request records the chosen service, the proposed date/time, and the client's address, revealed to the specialist only after acceptance** — Archived 2026-08-07 → `context/archive/2026-08-07-client-booking-request/`. Lesson: two — `service_role` grants differ between local and hosted and it bypasses RLS; a grep over lint output cannot tell "clean" from "crashed".
- **S-05: a specialist can accept or decline a booking request; a request not acted on within a set window auto-expires; a specialist can mark an accepted booking as completed** — Archived 2026-08-11 → `context/archive/2026-08-07-specialist-booking-management/`. Lesson: —.
- **S-06: a client can leave a star rating for a booking the specialist has marked completed (one rating per completed booking); a specialist's profile shows an average rating once a threshold number of ratings exists, otherwise a "New specialist" label** — Archived 2026-08-31 → `context/archive/2026-08-11-reviews-and-trust-rating/`. Lesson: one, in two halves — a column grant cannot hide a value that a joinable key re-derives (withholding `reviews.client_id` left `booking_id` joinable to `bookings.client_id`, and the pgTAP assertion that "proved" otherwise only tested the direct column read); and a test that sets up data it does not own turns any later fixture into a false regression (`bookings_rls.test.sql` seeded every specialist in the database, not its own two).
