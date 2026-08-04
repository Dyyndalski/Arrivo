-- S-03: ONE definition of "discoverable", read by both sides.
--
-- This closes the finding S-02's review deferred to this slice
-- (context/archive/2026-08-03-specialist-service-listing/reviews/impl-review.md, F4):
--
--   isCardComplete() decides what a specialist is told about their own visibility. S-03's
--   discovery query decides what clients actually see. These are two implementations of one rule
--   and they are only kept in agreement by intent. If they diverge, the failure is silent and
--   asymmetric in the worst direction: a specialist reads "Your card is live" while no client can
--   find them.
--
-- The fix is structural rather than a test: there is now one definition, in one place, and both
-- the client's search and the specialist's own status banner read it. Divergence is not caught,
-- it is impossible.
--
-- SECURITY_INVOKER IS NOT OPTIONAL. Without it a view runs with the DEFINER's rights and the RLS
-- of the tables beneath it is skipped entirely. Every table read here is world-readable today, so
-- the immediate blast radius is nil — but this view is the thing later slices will reach for when
-- they need "a specialist, resolved", and by then it may join something that is not.

create view public.discoverable_specialists
with (security_invoker = true) as
select
  sp.id,
  sp.display_name,
  sp.bio,

  -- Raw counts, not a verdict. FR-014's "show the average once there are enough ratings"
  -- threshold lives in src/lib/schemas/limits.ts next to the other bounds, so changing 3 to 5 is
  -- a one-line edit rather than a migration. The view reports what is true; the app decides what
  -- to say about it.
  (select count(*) from public.reviews r where r.specialist_id = sp.id)::int as rating_count,
  (select round(avg(r.rating), 2) from public.reviews r where r.specialist_id = sp.id) as rating_avg,

  -- Powers the "od <price>" line on a discovery card without a second round trip.
  (select min(s.price_cents) from public.services s where s.specialist_id = sp.id) as min_price_cents

from public.specialist_profiles sp
where
  -- The completeness rule, and the whole of it. Mirrors missingPieces() in
  -- src/lib/services/specialists.ts:
  --   * a name          — no test needed, display_name is NOT NULL by schema
  --   * >= 1 area       — below
  --   * >= 1 service    — below
  exists (select 1 from public.specialist_areas sa where sa.specialist_id = sp.id)
  and exists (select 1 from public.services s where s.specialist_id = sp.id);

comment on view public.discoverable_specialists is
  'The single definition of a discoverable specialist card: a name, at least one declared area, '
  'and at least one service. Read by the client-facing search AND by the specialist''s own '
  '"your card is live" banner, so the two cannot disagree (S-02 impl-review F4). Do not '
  'reimplement this predicate anywhere else.';

grant select on public.discoverable_specialists to anon, authenticated;
