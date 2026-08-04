---
change_id: area-matched-discovery
title: Area-matched specialist discovery, on a design system and i18n foundation
status: planned
created: 2026-08-04
updated: 2026-08-04
archived_at: null
---

## Notes

Roadmap slice S-03 — the product wedge: a client sees only specialists whose
declared areas cover them, annotated by a trust rating. Prerequisites S-01 and
S-02 are both done and archived.

### Scope decided before planning (2026-08-04)

The user supplied HTML mockups, which pulled three cross-cutting concerns into
this change alongside the roadmap slice. Agreed scope is all four:

1. **Discovery (the actual slice)** — client saves a home address, browses and
   filters specialists by service type and price, restricted to those whose
   declared areas cover them; specialist profile page with services and a
   star-rating summary. PRD refs FR-003, FR-006, FR-007, FR-008, FR-009.
2. **Design system port** — `context/foundation/design/_shared/styles.css` →
   Tailwind 4 tokens + component layer.
3. **Retrofit of existing screens** — auth pages, `/specialist/*`, dashboard,
   Topbar move onto the new visual language. User explicitly chose to do this
   inside S-03 rather than as a separate change.
4. **i18n** — translation layer with Polish as the default, English supported.
   Mockups are Polish; existing UI is English. Flagged as realistically its own
   slice; user chose to include it here anyway.

Concern recorded: only (1) is the roadmap slice; (2)–(4) touch every UI file in
the repo. Mitigation is phasing — the visual/i18n foundation lands and ships
before discovery is built on top, so discovery is not written twice.

### Design source of truth

- `context/foundation/design/_shared/styles.css` — palette (cream `#FAF7F3`,
  terracotta `#C1573B`), Fraunces headings + Inter body, radius/shadow/spacing
  scales, component classes (`.card`, `.chip`, `.badge-*`, `.stars`,
  `.stat-tile`, `.empty-state`, `.steps`).
- `context/foundation/design/web/` — 15 screens. Relevant here: `discover.html`,
  `specialist-profile.html`, `onboarding-client.html`, `profile.html`,
  `dashboard-specialist.html`, `services.html`, `sign-in.html`, `sign-up.html`.
- Committed in `e26bdb3` + `984b3b8`.

### Open items for the plan

- **Fonts:** mockups `@import` Inter and Fraunces from Google Fonts. That is a
  render-blocking external request on Cloudflare Workers and works against the
  PRD's p95 "results in under a second" NFR. Self-host instead.
- **`team.html` is out of scope** — employees/teams are not in PRD v1 (Arrivo is
  independent specialists). Material for v2; not built here.

### Carried in from S-02

- Review finding F4 (`context/archive/2026-08-03-specialist-service-listing/reviews/impl-review.md`)
  is deferred **to this change**: the discovery query must apply the same
  completeness predicate as `isCardComplete()` in `src/lib/services/specialists.ts`.
  If they diverge, a specialist is told "your card is live" while no client can
  find them. Resolve by construction or by a test — decide when the query exists.
- `context/foundation/lessons.md` — `service_role` has no DML on domain tables.
