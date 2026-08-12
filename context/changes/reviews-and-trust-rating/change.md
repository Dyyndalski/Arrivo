---
change_id: reviews-and-trust-rating
title: Star ratings for completed visits and the specialist trust average
status: implementing
created: 2026-08-11
updated: 2026-08-12
archived_at: null
---

## Notes

Seeded from `context/foundation/roadmap.md` **S-06**, the last must-have slice on the path.
Prerequisites S-05 and S-03 are both `done` and archived.

**Outcome (roadmap):** a client can leave a star rating for a booking the specialist has marked
completed (one rating per completed booking); a specialist's profile shows an average rating once a
threshold number of ratings exists, otherwise a "New specialist" label.

**PRD refs:** US-03, FR-013, FR-014.

**Open questions carried from the roadmap:**

- Ratings threshold before an average is shown — concrete N? Owner: user. Roadmap suggests e.g. 3.
- Specialist-gated completion may bias ratings upward. Logged as an integrity risk; relevant to the
  PRD's ">4.0 average" guardrail and what it actually means.

**Scope guardrails from the PRD:** star rating ONLY — no free text, no review bodies, no moderation
path (there is no admin role in v1).

**Pre-plan finding — half of this slice may already exist.** The read side appears to have shipped
with S-03:

- `supabase/migrations/20260804120300_reviews.sql` already creates a reviews table.
- `src/types.ts` already carries `rating` (a star rating for a completed visit, annotated FR-013),
  plus `rating_count` and `rating_avg` on the specialist listing type — with `rating_avg` documented
  as "Null until at least one rating exists — not 0, which would read as a one-star specialist".
- `20260803140000_listing_review_fixes.sql` and `20260804120400_discoverable_specialists.sql` also
  mention reviews/ratings.

So the likely shape of S-06 is the WRITE path (a client submitting one rating against a completed
booking, with RLS pinning "only the client, only once, only when completed") plus the "New
specialist" threshold label — not a from-scratch reviews feature. This needs confirming before a
plan is written, which is why `/10x-research` is the recommended next step over `/10x-plan`.
