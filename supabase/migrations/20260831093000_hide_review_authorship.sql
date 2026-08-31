-- S-06 follow-up: close the authorship vector the column grant did not close.
-- (impl-review F1 — context/changes/reviews-and-trust-rating/reviews/impl-review.md)
--
-- 20260811120000 withheld `reviews.client_id` from `authenticated` with a COLUMN grant and stated
-- the goal in its own comment:
--
--   "with row-level read access, a specialist can join their own bookings against reviews and
--    learn exactly which client gave them one star. v1 has no moderation and no admin, so the only
--    available answer to retaliation is not to publish the authorship."
--
-- It did not achieve that. `booking_id` stayed in the grant; `bookings_select_addressed_specialist`
-- (20260807100000:135-137) gives a specialist a table-wide select on every booking where
-- `specialist_id = auth.uid()`, `client_id` included; and `reviews_select_all` was still
-- `using (true)`. So the join re-derives the author without ever naming `reviews.client_id`.
-- Reproduced as role `authenticated` carrying a specialist's JWT:
--
--   select r.rating, b.client_id
--     from public.reviews r join public.bookings b on b.id = r.booking_id
--    where b.specialist_id = '<the specialist>';
--   -->  1 | fa000000-0000-0000-0000-0000000000ac
--
-- Reachable from the app's own API surface, not only from raw SQL: the FK exists, so PostgREST
-- will embed `reviews?select=rating,bookings(client_id)` for the same answer with the anon key
-- plus the specialist's own session.
--
-- The column grant STAYS — it is still what makes `where client_id = …` fail, and it is a second
-- lock rather than the lock. The boundary is now the row policy.

-- ---------------------------------------------------------------------------
-- One reader per row: the client who wrote it.
--
-- `using (client_id = …)` references a column the caller holds no SELECT on. That is legal and
-- load-bearing: column privileges are checked against the columns the CALLER's query names, while
-- a policy expression is injected by the rewriter afterwards. The withheld grant therefore stops
-- the caller writing `where client_id = …` while this predicate still reads it.
--
-- `(select auth.uid())` rather than a bare call, matching every other policy in this schema
-- (20260807100000:131-160) — it makes the call an InitPlan evaluated once instead of per row.
--
-- What a specialist keeps: their own average, through public.discoverable_specialists, which is
-- rebuilt below to stop depending on the caller's rights for that number.
-- ---------------------------------------------------------------------------
drop policy "reviews_select_all" on public.reviews;

create policy "reviews_select_own_author"
  on public.reviews for select to authenticated
  using (client_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- The aggregate, moved off the caller's rights.
--
-- discoverable_specialists is `security_invoker = true` and 20260804120400:31-33 computed
-- rating_count / rating_avg as correlated subqueries over public.reviews. Under the policy above
-- those subqueries now see only the CALLER's own ratings, which would show every specialist their
-- own card as unrated and show every client an average computed from their own visits alone.
--
-- So the two numbers come from a SECURITY DEFINER function instead. It returns a count and a mean
-- and nothing else — no row, no id, no timestamp — which is exactly the public half of FR-014 and
-- carries no authorship at all.
--
-- ACCEPTED RESIDUAL: with rating_count = 1 the average IS that one rating's value, and a
-- specialist watching the count climb after each visit can correlate a rating to the window it
-- appeared in. No aggregate can avoid that; the mitigation is FR-014's threshold
-- (RATING_THRESHOLD = 3, src/lib/schemas/limits.ts), which shows "New specialist" rather than a
-- number until three ratings exist.
--
-- Granted to `anon` as well as `authenticated`, because the view itself still carries
-- `grant select … to anon` from 20260804120400. Without it, `select *` as anon would fail on the
-- rating columns — which is already true today, and only invisible because the one assertion that
-- reads the view as anon projects `1` and Postgres prunes the unevaluated subqueries
-- (supabase/tests/database/discovery_rls.test.sql:249-252). Aggregated ratings name nobody, so
-- this grant restores the view's own contract rather than widening it.
-- ---------------------------------------------------------------------------
create function public.specialist_rating(p_specialist_id uuid)
  returns table (rating_count int, rating_avg numeric)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select count(*)::int, round(avg(r.rating), 2)
  from public.reviews r
  where r.specialist_id = p_specialist_id;
$$;

-- Postgres grants EXECUTE to PUBLIC on every new function; the revoke is what makes the grant
-- below the whole of the access, as in 20260807130000:222-225.
revoke all on function public.specialist_rating(uuid) from public;
grant execute on function public.specialist_rating(uuid) to anon, authenticated;

comment on function public.specialist_rating(uuid) is
  'FR-014''s public half: how many ratings a specialist has and their mean, with no authorship. '
  'SECURITY DEFINER because public.reviews is readable only by the client who wrote the row '
  '(20260831093000) while the average must be visible to everyone who can see the card.';

-- ---------------------------------------------------------------------------
-- Same view, same columns, same completeness rule — only the two rating columns move.
--
-- LATERAL rather than two scalar subqueries so the function runs once per card instead of twice.
-- `security_invoker = true` is restated because CREATE OR REPLACE VIEW does not inherit it, and
-- 20260804120400:17-20 calls it not optional: every other table under here — specialist_profiles,
-- specialist_areas, services — must still be read as the caller.
-- ---------------------------------------------------------------------------
create or replace view public.discoverable_specialists
with (security_invoker = true) as
select
  sp.id,
  sp.display_name,
  sp.bio,
  rt.rating_count,
  rt.rating_avg,
  (select min(s.price_cents) from public.services s where s.specialist_id = sp.id) as min_price_cents
from public.specialist_profiles sp
  left join lateral public.specialist_rating(sp.id) rt on true
where
  exists (select 1 from public.specialist_areas sa where sa.specialist_id = sp.id)
  and exists (select 1 from public.services s where s.specialist_id = sp.id);
