---
change_id: specialist-service-listing
title: Specialist service listing
status: implemented
created: 2026-08-03
updated: 2026-08-03
archived_at: null
---

## Notes

Roadmap slice S-02. All three phases implemented, reviewed and triaged; every
Progress item verified.

- Phase 1 `faf9f27` — schema, dictionaries, RLS; review `bc78b40` (6 findings, all fixed)
- Phase 2 `42f4264` — zod, endpoints, auth retrofit; review `bb14497` (6 findings, all fixed)
- Phase 3 `e05a2c8` — specialist UI, role gating; deployed to production

Reviews live in `reviews/impl-review-phase-{1,2}.md`.

Two things this change left behind for later slices:

- `context/foundation/lessons.md` gained a rule about `service_role` having no
  DML on domain tables — S-05's booking auto-expire cron will hit this.
- S-03 must apply the same completeness predicate as `isCardComplete()` in
  `src/lib/services/specialists.ts`. If the discovery query diverges, a
  specialist sees "your card is live" while clients cannot find them.
