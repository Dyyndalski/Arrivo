# Specialist Profile + Service Listing (S-02) — Plan Brief

> Full plan: `context/changes/specialist-service-listing/plan.md`

## What & Why

A signed-in specialist can create a provider card (display name + declared Warsaw districts) and list services priced against a fixed two-level taxonomy. This is the supply side of the marketplace — S-03's area-matched discovery, the product's wedge, has nothing to match against until it exists.

## Starting Point

The domain is one table deep: F-01's `profiles` (`id`, `role`, timestamps) with own-row-only RLS and no user write path at all, plus S-01's role-aware auth UI on top. No specialist identity beyond `role = 'specialist'`, no areas, no services, and no policy anywhere that grants `anon` anything.

## Desired End State

A specialist reaches `/specialist/profile`, names their card and ticks the districts they serve, then adds priced services at `/specialist/services`, with a banner telling them whether the card is discoverable yet. Clients and anonymous visitors cannot reach those routes. The new tables are world-readable and owner-writable — proven by pgTAP, not by the UI refusing.

## Key Decisions Made

| Decision                | Choice                                            | Why (1 sentence)                                                                                       | Source |
| ----------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------ |
| Service-area model      | Seeded dictionary + M:N join table                | Matching in S-03 becomes a join on an id — no parsing, no normalization, no geo dependency the PRD cut. | User   |
| Area seed scope         | One city, flat district list (Warsaw)             | Supply density where it's tested; a second city is a pure `INSERT` thanks to the `city` column.         | User   |
| Service taxonomy        | Two-level, subtype optional                       | The S-03 filter runs on the always-present category, so it never returns empty during cold start.       | User   |
| Price model             | Fixed price, integer grosze                       | Literal reading of FR-005 and it keeps FR-007's price filter unambiguous.                               | User   |
| Read access             | Public (`anon` + `authenticated`)                 | PRD §Access Control lets visitors browse listings; S-03 then needs no RLS changes of its own.           | User   |
| Card visibility         | Derived from completeness, never stored           | Satisfies US-02's acceptance criterion with no second source of truth to drift.                         | User   |
| Where specialist data lives | New `specialist_profiles` table, not new columns on `profiles` | Extending `profiles` means granting `update` and then excluding `role` — trading F-01's structural guarantee for a policy that has to be right. | Plan   |
| Role enforcement        | RLS `with check` subquery on `profiles.role`      | A `check` constraint cannot read another table; the app gate is convenience, the DB is the boundary.    | Plan   |
| Input validation        | Add `zod`, retrofit the four auth endpoints too   | Discharges the standing rule in `lessons.md` at exactly the moment it named.                            | User   |
| Verification            | pgTAP on the new policies + manual E2E            | Continues F-01's precedent; S-02 opens the first write and first public-read surfaces in the project.   | User   |

## Scope

**In scope:** `service_areas` / `service_categories` / `service_subtypes` dictionaries with seed data; `specialist_profiles`, `specialist_areas`, `services`; public-read + owner-write RLS with a role check; pgTAP proofs; `zod` plus schemas; specialist write endpoints; auth-endpoint retrofit; two specialist screens; the first role-based route gate; dashboard entry point.

**Out of scope:** the discovery/browse query and its filters (S-03); client home address (S-03); free-text bio (FR-015, parked); ratings (S-06); in-app editing of the dictionaries; profile deletion; a JS test runner; multi-city seed.

## Architecture / Approach

DB-first, mirroring F-01: schema + seed + RLS proven by pgTAP → validated write layer → UI. Specialist data sits in its own table keyed 1:1 to `profiles.id`, so `profiles` keeps its "no write path at all" guarantee intact. Writes go through Astro `POST` endpoints on the existing form-redirect pattern, using the request-scoped Supabase client so RLS evaluates as the calling user. Completeness is recomputed at read time and defined once, in `src/lib/services/specialists.ts`.

## Phases at a Glance

| Phase                              | What it delivers                                          | Key risk                                                                                |
| ---------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1. Schema, dictionaries and RLS    | Tables, seed, policies, pgTAP suite, hosted push          | First public-read surface in the project — a too-broad policy leaks nothing today but sets the precedent S-03/S-04 inherit |
| 2. Validated write layer           | `zod`, schemas, specialist endpoints, auth retrofit       | The retrofit touches working sign-in/reset code; behaviour must be preserved exactly    |
| 3. Specialist UI and role gating   | Two screens, role gate in middleware, dashboard entry     | First role-based authorization in the app; a wrong prefix match locks out the wrong role |

**Prerequisites:** Docker + local Supabase stack; hosted project linked (both established in F-01). S-01 merged and archived.
**Estimated effort:** ~3 sessions, one per phase.

## Open Risks & Assumptions

- The two-level taxonomy was chosen over the recommended flat one — it buys precision but the cascading select and the subtype-optional data shape are extra surface in both the UI and S-03's future filter.
- Self-declared areas remain ungameable-by-nobody: a specialist can tick all 18 districts. PRD accepts this for v1 (Open Question 3); it becomes visible as a problem only once discovery ships.
- The auth retrofit is behaviour-preserving by intent, but it is the one part of this slice that can break something already working and verified in production.
- Warsaw-only seed is a product bet, not just a technical one — a specialist outside Warsaw cannot be listed at all.
- ~2 weeks remain to the PRD's 2026-08-17 deadline with S-03…S-06 still ahead; if time compresses, Phase 2's auth retrofit is the severable part (the rule in `lessons.md` would stay open).

## Success Criteria (Summary)

- A specialist can go from a fresh account to a complete, discoverable card — name, districts, priced services — and edit it afterwards.
- The database refuses what the UI refuses: a client-role or anonymous caller cannot write, and anyone can read, proven by `supabase test db`.
- Sign-up, sign-in, password recovery and reset still work unchanged after the validation retrofit.
