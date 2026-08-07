# Area-Matched Specialist Discovery — Plan Brief

> Full plan: `context/changes/area-matched-discovery/plan.md`

## What & Why

Roadmap slice S-03 — the product wedge. A client saves where they live and sees only specialists
whose declared service areas cover them, filtered by service type and price, annotated by a trust
rating. This is the last thing that must exist before the north star (S-04, the booking request):
a client cannot request a visit from someone they cannot find.

Three cross-cutting concerns ride along by explicit decision: the supplied mockups become the
app's design system, the UI becomes bilingual with Polish as the default, and the existing auth
and specialist screens are retrofitted onto both.

## Starting Point

S-02 shipped the supply side and, deliberately, the read surface discovery needs: `select` is
already granted to `anon` and `authenticated` on all three specialist tables, with the reverse
index for "who serves this area" already in place. No read-side RLS work is required.

What is missing is everything client-side — no saved address, no reviews, and a `service_areas`
dictionary holding Warsaw only. Visually the repo is on three unrelated palettes (shadcn neutral in
`global.css`, a purple/blue starter theme in the specialist components, English literals
everywhere) and none of them resembles the mockups.

## Desired End State

A client saves their city, district, street and contact details, opens `/specialists`, narrows by
category and price, and keeps only specialists who serve their district. Opening a card shows the
specialist's bio, services with price and duration, and either an average rating or a "New
specialist" label. Booking CTAs are visible but disabled until S-04.

Every screen except the landing page renders in the mockups' visual language, in Polish by
default, switchable to English. The specialist's "your card is live" banner and the client's
search results read the same database view, so they cannot disagree.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Client area | District picked from the same `service_areas` dictionary specialists use; street/postcode stored separately | Exact matching by `area_id` equality, no geocoding — PRD replaced travel-time with declared areas precisely to avoid maps | Plan |
| Geography | 10 cities; districts for Warszawa, Kraków, Wrocław, Poznań, Łódź, Gdańsk; whole-city area for the other four | Districts matter where the city is large; forcing 27 checkboxes on a Lublin specialist invites them to tick three and vanish from results | Plan |
| Area picker | Two-step: city → districts, selection persists across switches | Never more than 18 fields on screen; "whole city" is two clicks; one component serves specialist (multi) and client (single) | Plan |
| Ratings | `reviews` table + read-only aggregate now; writing, the completed-booking rule and the rating UI in S-06 | Discovery reads real data from day one; the write rule needs `bookings`, which does not exist until S-05 | Plan |
| Rating threshold | 3 | PRD's suggested value — damps the noise of a single review while staying reachable in the first month | Plan |
| i18n | Locale in `locals` from a cookie, `t()` helper, no URL prefixes | No route, redirect or middleware path changes, so the tested auth flow is untouched; catalogs never reach the browser | Plan |
| Dictionary translations | `name_en` columns in the four dictionary tables | A new district is one migration, not a migration plus a code change | Plan |
| Completeness contract (S-02 F4) | A single `discoverable_specialists` view read by both discovery and the specialist's banner | Divergence becomes structurally impossible rather than test-enforced; `missingPieces()` stays for wording only | Plan |
| Filters | Category chips, price range, sort by price; no rating sort | FR-007 literally; rating sort would be inert while everyone has zero ratings, and PRD dropped rating filtering to protect cold-start specialists | Plan |
| Out-of-PRD mockup fields | Bio, service duration, custom service name, client name/phone — all in | Accepted during planning; the custom name supplements the taxonomy rather than replacing it, so FR-007's filter stays reliable | Plan |
| Booking CTAs | Rendered disabled, labelled "coming soon" | Card and profile layout is final, so S-04 swaps an attribute instead of rebuilding two screens | Plan |
| Retrofit boundary | Everything except the landing page | Landing is the one screen with no mockup — designing it here would be guesswork | Plan |

## Scope

**In scope:** design-system port with self-hosted fonts; PL/EN i18n incl. server error keys; cities
+ multi-city area dictionary; `client_profiles`; bio, duration, custom service name; `reviews`
schema and read path; `discoverable_specialists` view; retrofit of auth, shell, dashboard and the
specialist panel; two-step area picker; client address screen; filterable results; public
specialist profile.

**Out of scope:** bookings; writing reviews; free-text review bodies; rating sort/filter; profile
photos; account deletion; the landing page; teams/employees; dashboard statistics; maps and
geocoding; translating user-generated content; a JS test runner.

## Architecture / Approach

Locale is resolved once in middleware and attached to `context.locals` alongside user and role.
Astro pages resolve strings through `t()` and pass them into React islands as props, so the message
catalogs never enter the client bundle — the same reasoning that produced `src/lib/schemas/limits.ts`
after zod leaked into an island in S-02.

Discovery reads a single view rather than the base tables. `discoverable_specialists` (declared with
`security_invoker` so RLS still evaluates as the caller) defines "has a name, at least one area, at
least one service" once; `src/lib/services/discovery.ts` layers the area, category and price
predicates on top. Filtering is a plain GET form with query parameters and no client JS, which
serves both the sub-second p95 NFR and a primary persona that is not on fast devices.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Visual + i18n foundation | Tokens, self-hosted fonts, locale layer, UI primitives | Font subset missing `latin-ext` breaks every Polish diacritic |
| 2. Schema and data | Cities, `name_en`, `client_profiles`, bio/duration/name, `reviews`, the view, pgTAP | `service_areas.city` → `city_id` runs against live data; re-inserting Warsaw rows would silently reassign who serves where |
| 3. Retrofit — shell, auth, dashboard | Auth and shell on the new system, server messages become keys | Regression in a sign-in/recovery flow that already works |
| 4. Retrofit — specialist panel | Sidebar shell, new fields, two-step picker, banner reads the view | Selection state lost when switching cities |
| 5. Discovery | Client address, filterable results, public profile | Discovery and the banner disagreeing — the failure phase 2's view exists to prevent |

**Prerequisites:** S-01 and S-02 archived (done); mockups and stylesheet committed (`e26bdb3`,
`984b3b8`); Supabase local stack with Docker for `db reset` / `test db`.

**Estimated effort:** ~5 sessions, one per phase, phases 1 and 5 the largest. Deadline
2026-08-17, after-hours.

## Open Risks & Assumptions

- Phase 2's city migration touches a hosted database that already has a specialist with declared
  Warsaw areas. Backfill-then-drop and in-place updates are specified; a mistake here is silent.
- Moving every server error to a key touches auth code that is working and tested. Phase 3's gate
  is a full round-trip regression in both locales for that reason.
- Four out-of-PRD fields were accepted. `services.name` supplements but must never replace
  `category_id`, or FR-007's filter stops being reliable across specialists.
- Only Warsaw has real district granularity in practice; a client in Lublin gets city-level
  matching, so the wedge is weaker there. Accepted for v1.
- The reviews table stands empty for two slices, so every card shows "New specialist" until S-06.
- No JS test runner: the zod schemas, `resolveLocale`, `ratingLabel` and the filter parser have no
  automated coverage. S-02's review noted this is exactly where bugs appeared.

## Success Criteria (Summary)

- A client with a saved district sees specialists who declared it and not those who did not, and
  can narrow by service type and price.
- A specialist told "your card is live" is findable by a client in their area — and when they are
  not findable, they are told why.
- The whole app, minus the landing page, reads in Polish by default and switches to English with
  no untranslated strings.
