---
change_id: domain-data-rls-foundation
title: Domain roles + address-privacy policy
status: implemented
created: 2026-07-28
updated: 2026-07-28
archived_at: null
---

## Notes

Implements roadmap item **F-01** (see `@context/foundation/roadmap.md`) — the foundation the whole MVP chain depends on.

- **Outcome:** every account is linked to a client or specialist identity, and the data layer enforces that a client's exact address is never readable until the specialist accepts that client's booking (only the coarse area is used for matching before then).
- **PRD refs:** Access Control (client/specialist roles), NFR (address not visible until acceptance), Success Criteria Guardrail (addresses never publicly exposed).
- **Unlocks:** S-01 (role-aware sign-up) and the address-privacy contract S-03/S-04 must honor; establishes the address-leak verification path every later slice relies on.
- **Baseline to build on:** Supabase auth is present (generic email/password, `context.locals.user`, route middleware); the domain data layer is absent. Reach Supabase over the HTTP `@supabase/ssr` client only — never a direct Postgres connection (per `@CLAUDE.md`).
- **Scope guard:** keep this minimal — roles + the privacy policy pattern only. Each downstream slice adds its own entities (services, bookings, reviews).
