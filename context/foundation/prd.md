---
project: "Arrivo"
version: 1
status: draft
created: 2026-07-27
context_type: greenfield
product_type: web-app
target_scale:
  users: enterprise
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-08-17
  after_hours_only: true
---

# Arrivo — Product Requirements Document

> Timeline note: hard deadline moved from 2026-08-04 to 2026-08-17 to align
> with the 3-week after-hours MVP estimate (the original date was ~12 days
> out — too tight against the estimate). Scope is unchanged; no further cuts
> made as part of this decision.

## Vision & Problem Statement

Getting to a salon is a barrier that excludes two groups of clients: the
time-poor, who can't fit a salon visit into their schedule, and the elderly or
limited-mobility, who physically struggle to travel for a haircut or cosmetic
treatment. Today they either skip the service or endure the trip. On the other
side, independent hairdressers and beauticians are locked out or squeezed by
the cost of owning or renting commercial premises they may not need.

The insight: existing booking apps are built salon-first — the mobile,
come-to-your-home visit is an afterthought bolted onto a salon-centric model.
This product is home-visit-first: travelling to the client is the default
transaction, not the exception. That reframing serves the underserved
access-constrained client and removes the premises-cost barrier for the
provider in a single move.

## User & Persona

**Primary persona — the home-visit client (demand side).** The MVP is
optimized for the person booking a service. Two sub-segments share the same
core need (a service without the trip):
- *Time-poor professional* — wants a service at home/work on their schedule.
- *Elderly / limited-mobility client* — physically can't easily reach a salon.

The client's moment: they need a haircut/styling/cosmetic treatment, open the
app, and want to find a nearby specialist, see who's trusted, and book a visit
to their address.

### Secondary persona — the specialist (supply side)
Independent hairdresser or beautician operating without fixed premises. Lists
services, receives bookings, travels to the client. Essential to the
marketplace but the MVP wins the demand side first; supply follows.

> Marketplace note: two-sided cold-start problem acknowledged — demand-first
> bet. Revisit seeding strategy downstream (not a PRD concern).

## Success Criteria

Scoped v1 flow (the thing that, working end-to-end, proves the product):
Specialist lists a service with declared service areas → client filters and
finds a specialist that serves their area → client requests a booking (proposes
a date/time) → specialist accepts → after the completed visit the client leaves
a rating + review.

**v1 scope-down decisions (from Phase 3):**
- Travel-time computation replaced by *declared service areas* (no maps/routing
  integration in v1).
- Booking is *request/accept*, not calendar-slot scheduling (no availability
  subsystem in v1).
- Reviews kept, but only a client with a booking marked *completed* can review;
  no separate moderation in v1.

### Primary
- ≥ 50% of onboarded specialists receive at least one booking within the first
  month (the core two-sided transaction actually completes for most supply).
- The scoped v1 flow works end-to-end (list → filter by area → book → accept →
  review).

### Secondary
- ≥ 10 specialists create a profile within the first month (supply seeding).

### Guardrails
- Average specialist rating stays above 4.0 / 5 — a quality floor; if trust
  erodes below this, the marketplace is failing even if bookings happen.
- Client home addresses are never publicly exposed — visible only to a
  specialist whose booking the client has accepted. Leakage is a regression
  even if every other metric holds.

## User Stories

### US-01: Client finds a nearby specialist and requests a booking
- **Given** a signed-in client who has set their area
- **When** they browse the list, filter by service type and price, and
  restrict to specialists serving their area
- **Then** they see matching specialists with a rating summary, can open a
  profile, and can request a booking by proposing a date/time
#### Acceptance Criteria
- Results include only specialists whose declared service areas cover the
  client's area when the "serves my area" filter is on.
- A booking request records the chosen service, the proposed date/time, and
  the client's address (visible to the specialist only after acceptance).

### US-02: Specialist lists a service
- **Given** a signed-in specialist with a profile
- **When** they add a service with a type, price, and declared service areas
- **Then** the service becomes discoverable to clients whose area it covers
#### Acceptance Criteria
- A service with no declared area is not shown under any "serves my area" filter.

### US-03: Client reviews a completed visit
- **Given** a client whose booking a specialist has marked completed
- **When** they submit a star rating (free-text review deferred to v2)
- **Then** the rating updates the specialist's average once the ratings
  threshold is met; below the threshold the profile shows "New specialist"
#### Acceptance Criteria
- Only a client with a booking in "completed" state for that specialist can
  submit a rating (one rating per completed booking).

## Functional Requirements

### Accounts & Access
- FR-001: A visitor can sign up as either a client or a specialist using email + password (single-role account). Priority: must-have
  > Socratic: dual-use (a hairdresser who is also a client) considered. Resolution: kept single-role for v1 — simpler permissions and UI; dual-role account deferred to v2.
- FR-002: A registered user can sign in, sign out, and recover a forgotten password via email. Priority: must-have
  > Socratic: minimal sign-in/out considered. Resolution: added password recovery — forgotten passwords are common in the target elderly segment and lockout has no other workaround.
- FR-003: A client can set and edit a saved home address. Priority: must-have
  > Socratic: store-less design (area-only profile + per-booking address) considered. Resolution: kept saved address for convenience. Privacy guardrail still binds — the exact address is revealed to a specialist only after they accept the booking.

### Specialist listings
- FR-004: A specialist can create and edit a provider profile with a name and declared service areas. Priority: must-have
  > Socratic: full profile-as-must-have considered. Resolution: split — name + declared areas is the discovery minimum (must-have); free-text bio demoted to nice-to-have (FR-015).
- FR-005: A specialist can list a service by choosing a type from a fixed service-type taxonomy and setting a price. Priority: must-have
  > Socratic: free-text service types considered. Resolution: chose a fixed taxonomy so the type filter (FR-007) is reliable across specialists.
- FR-015: A specialist can add a free-text bio to their profile. Priority: nice-to-have
  > Demoted from FR-004 during the Socratic round; polish, not required for discovery.

### Discovery
- FR-006: A client can browse a filterable list of specialists and their services. Priority: must-have
  > Socratic: free-text search considered. Resolution: dropped for v1 — the launch catalog is small (<10 specialists per success metric); filters suffice. Search returns in v2 as the catalog grows.
- FR-007: A client can filter results by service type and price. Priority: must-have
  > Socratic: a rating filter was considered and dropped for v1 — unrated new specialists would be hidden during cold-start. Ratings are still displayed (FR-014), just not filterable yet.
- FR-008: A client can restrict results to specialists whose declared areas cover the client's area. Priority: must-have
  > Socratic: self-declared areas can be gamed ("serves everywhere"). Resolution: accepted for v1 as a known limitation; area verification routed to Open Questions.
- FR-009: A client can view a specialist's profile, including their services and a star-rating summary. Priority: must-have
  > Socratic: showing free-text reviews before any moderation exists risks abuse (no admin role in v1). Resolution: v1 shows star ratings only; free-text review text deferred to v2, when a moderation path exists.

### Booking
- FR-010: A client can request a booking for a service, proposing a date/time. Priority: must-have
  > Socratic: blind proposals (no visible availability) cause declines and back-and-forth. Resolution: accepted for v1 — availability/calendar is a deferred v2 piece; request/accept is the scoped transaction.
- FR-011: A specialist can accept or decline a booking request; a request the specialist does not act on within a set window auto-expires. Priority: must-have
  > Socratic: an unresponsive specialist leaves the client stuck pending forever. Resolution: added auto-expire so pending requests always resolve.
- FR-012: A specialist can mark an accepted booking as completed. Priority: must-have
  > Socratic: specialist-controlled completion gates who can review (FR-013), which can bias ratings. Resolution: accepted for v1; two-sided completion confirmation routed to Open Questions.

### Reviews
- FR-013: A client can leave a star rating for a booking the specialist has marked completed (one rating per completed booking). Priority: must-have
  > Socratic: specialist-gated completion biases ratings upward. Resolution: kept for v1 with the integrity risk logged as an Open Question. Free-text review text deferred to v2 (per FR-009).
- FR-014: The app shows a specialist's average rating once they reach a threshold number of ratings; below the threshold the profile shows a "New specialist" label instead of an average. Priority: must-have
  > Socratic: an average from 1–2 ratings is noisy and misleads clients. Resolution: added a minimum-ratings threshold before an average is shown.

## Non-Functional Requirements

- A client's exact home address is not visible to anyone until the specialist
  has accepted that client's booking; before acceptance, only the client's
  coarse area is used for matching.
- Browsing and filtering the specialist list returns visible results in under
  one second as perceived by the user (p95).
- The product remains usable on the latest two major versions of the mainstream
  desktop and mobile web browsers.

## Business Logic

Given a client's location and chosen service, the app shows only specialists
whose declared service areas cover that client, annotated by an aggregated
trust rating derived from completed visits.

The rule consumes user-facing inputs: the client's saved area/address, the
service type and price range they filter by, and — on the supply side — each
specialist's declared service areas, their listed services, and the ratings
left after completed bookings. Its output is a filtered, trust-annotated list
of specialists a client can actually book for a home visit: anyone whose area
does not cover the client is excluded, and each remaining specialist carries
either an average rating or a "New specialist" marker until enough ratings
exist to be meaningful.

The client encounters the rule in two places: the browsable results view (only
serving, matching specialists appear, filtered by type and price) and the
specialist profile (services plus the trust summary). The rule is what turns a
flat directory into a home-visit marketplace — it decides *who can serve you*
and *how trusted they are*, rather than just listing everyone.

## Access Control

Multi-user, account-based. Sign-up and sign-in via **email + password**.

Two distinct roles, chosen at sign-up:
- **Client** — browses specialists and services, books visits to their own
  address, reads/writes reviews for services they've received.
- **Specialist** — creates a provider profile, lists services (with price and
  service area), receives and manages bookings.

Role → capability separation:
- A client cannot list services; a specialist cannot book another specialist
  (single-role accounts in the MVP).
- Unauthenticated visitors may not reach any application screen. Browsing,
  search, specialist profiles, booking and listing all require an account; a
  link pasted while signed out lands on sign-in and returns the visitor to that
  link once they have signed in.

> **Amended 2026-08-11.** This bullet previously read: "Unauthenticated visitors
> may browse/search public specialist listings and reviews, but must sign in to
> book or to list." It was implemented that way through S-03 and S-04 —
> `/specialists` and `/specialists/<id>` were deliberately public, and S-02 fixed
> a bug where they were accidentally gated. The rule was reversed by product
> decision: no URL should render app content to a signed-out visitor. The cost is
> accepted and worth stating, because it works against the demand-first bet in
> the Vision — a first-time visitor can no longer see that supply exists before
> creating an account, so sign-up now carries the whole top of the funnel.
> Enforced in `src/middleware.ts` (`PROTECTED_ROUTES`), which carries the
> requested path through sign-in as `redirectTo`.
>
> `version:` is intentionally not bumped: `context/foundation/roadmap.md` pins
> `prd_version: 1`, and this amendment does not change any FR.

No admin/moderator role in the MVP (deliberate scope cut). Consequence: review
moderation and dispute handling have no in-app owner in v1 — routed to Open
Questions.

## Non-Goals

Functional non-goals (v1 will not build these):
- **No online / in-app payments** — payment happens directly with the
  specialist at the visit; the app never processes money in v1.
- **No in-app chat or messaging** — no client↔specialist message thread; the
  booking request/accept flow carries the necessary coordination.
- **No native mobile apps** — web only for v1; iOS/Android deferred.
- **No external calendar sync, loyalty programs, discounts, or promotions** —
  none of these in v1.

Non-functional non-goals:
- **No accessibility conformance target in v1** — see Open Question #8 (flagged
  as a tension with the elderly/limited-mobility persona).

## Open Questions
1. **Who moderates reviews / handles disputes without an admin role?** — Owner:
   user. Deferred for MVP; may need a lightweight moderation path before public
   launch.
2. **What does the home-visit flow get wrong in salon-first incumbents?** —
   Owner: user. Sharpens the core insight; not blocking.
3. **How are self-declared service areas verified?** — Owner: user. v1 trusts
   specialists; "serves everywhere" gaming is a known limitation (FR-008).
4. **Should booking completion be two-sided?** — Owner: user. v1 lets the
   specialist mark completed (FR-012), which gates and can bias reviews.
5. **Review integrity: does specialist-gated completion inflate ratings?** —
   Owner: user. Relevant to the >4.0 rating guardrail's meaning (FR-013).
6. **What is the ratings threshold before an average is shown?** — Owner: user.
   Needs a concrete N for FR-014 (e.g. 3).
7. **What is the auto-expire window for pending booking requests?** — Owner:
   user. Needs a concrete duration for FR-011 (e.g. 3 days — consider whether
   24–48h fits better given clients likely want a near-term visit).
8. **Is accessibility really out of scope for v1?** — Owner: user. The primary
   persona includes elderly / limited-mobility users, yet accessibility was
   not selected as a v1 NFR. Flagged as a possible tension, not a blocker.