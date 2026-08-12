-- S-06: the write path for ratings, and the read surface S-03 could not size correctly yet.
--
-- 20260804120300_reviews.sql built the READ side and stopped, stating why:
--   "There is deliberately NO write path. FR-013's rule … is expressible only against
--    public.bookings, which S-05 creates."
-- and naming what this migration would add: booking_id, a unique constraint on it, the insert
-- grant and the insert policy.
--
-- Two of those four are here. The grant and the policy are NOT — see the next block.

-- ---------------------------------------------------------------------------
-- The booking link.
--
-- `not null` with no default is safe only because the table is empty, and it is empty because no
-- write path has ever existed for it. Verified against the hosted project before this migration
-- was pushed (`select count(*) from public.reviews` -> 0). A default would have been worse than a
-- failed migration: it would attribute existing ratings to an arbitrary booking.
--
-- `on delete cascade`: a rating is about one visit and means nothing without it. Bookings carry no
-- delete grant, so this is a statement of intent rather than a path anything can take today.
--
-- The unique constraint IS FR-013's "one rating per completed booking". Nothing in the application
-- re-checks it — the second insert raises 23505 and the service layer turns that into a message.
-- ---------------------------------------------------------------------------
alter table public.reviews
  add column booking_id uuid not null references public.bookings (id) on delete cascade;

alter table public.reviews
  add constraint reviews_one_per_booking unique (booking_id);

-- ---------------------------------------------------------------------------
-- WHY NO INSERT GRANT, against S-03's own prediction.
--
-- S-03 expected `grant insert` plus a policy. S-05 had not been written yet when that comment was;
-- it established the opposite pattern for every write in this schema (20260807130000):
--
--   "So: four SECURITY DEFINER functions, one per legal edge, and no write grant at all.
--    The absence of the grant is the guarantee. Do not add one."
--
-- S-05's stated reason — a policy cannot express a state transition — does NOT apply to an insert,
-- where WITH CHECK sees the whole new row. Three reasons that do:
--
--   1. A table-wide insert grant is a standing permission on COLUMNS, not on rows. Adding a column
--      later silently makes it client-writable; the policy has to be remembered and widened in the
--      same breath.
--   2. `specialist_id` and `client_id` would arrive as arguments and be checked, rather than never
--      arriving at all. The function reads both off the booking, so no request shape exists that
--      attributes a rating to the wrong pair.
--   3. The error vocabulary below is already mapped by the UI. A policy failure is one opaque
--      42501 for every distinct reason.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Narrowing the read surface.
--
-- S-03 granted select to `anon, authenticated` and justified it precisely:
--
--   "Read is public because the aggregate is public — FR-014 shows an average on a profile that
--    unauthenticated visitors may browse (PRD Access Control)."
--
-- That justification expired on 2026-08-11, when `/specialists` joined PROTECTED_ROUTES and the
-- app stopped serving any page to a signed-out visitor (see src/middleware.ts and the amended
-- Access Control section of context/foundation/prd.md). `anon` has nothing left to render.
--
-- `client_id` is dropped from the grant for a reason that only becomes real now that ratings can
-- exist: with row-level read access, a specialist can join their own bookings against reviews and
-- learn exactly which client gave them one star. v1 has no moderation and no admin, so the only
-- available answer to retaliation is not to publish the authorship.
--
-- COLUMN-level, not a policy, and not a revoke of the whole table:
--   * `discoverable_specialists` is `security_invoker = true` (20260804120400:22), so its
--     rating_count / rating_avg subqueries read `reviews` as the CALLER. Revoking select outright
--     would silently zero every average on every card.
--   * A policy cannot hide a column. Column privileges can.
--   * Postgres requires SELECT on every column a query REFERENCES, not only those it projects, so
--     this also makes `where client_id = auth.uid()` fail. That is deliberate: the application
--     reads "have I rated this?" by booking_id (src/lib/services/reviews.ts), which is information
--     the client already has.
-- ---------------------------------------------------------------------------
revoke select on public.reviews from anon;
revoke select on public.reviews from authenticated;

grant select (id, specialist_id, booking_id, rating, created_at)
  on public.reviews to authenticated;

-- `alter policy` changes the expression, not the roles, so the policy is replaced rather than
-- edited. Still `using (true)`: the column grant is what narrows this, not the predicate.
drop policy "reviews_select_all" on public.reviews;

create policy "reviews_select_all"
  on public.reviews for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- service_role: explicitly revoked, per context/foundation/lessons.md.
--
-- Hosted projects carry `ALTER DEFAULT PRIVILEGES … GRANT ALL … TO service_role`, so the ALTER
-- TABLE above already handed this role everything on a table the local stack shows as untouched.
-- `service_role` is also BYPASSRLS, so the policy above is invisible to it and the column grant is
-- the only thing standing between that key and every rating's author.
--
-- BYPASSRLS skips POLICIES, not PRIVILEGES — revoking is a real boundary. Pinned from both sides
-- in supabase/tests/database/reviews_rls.test.sql.
-- ---------------------------------------------------------------------------
revoke all on public.reviews from service_role;

-- ---------------------------------------------------------------------------
-- completed booking -> one rating, by the client who was visited.
--
-- Error codes continue the vocabulary 20260807130000 established, because the UI already maps it:
--
--   42501  the caller is not the client on this booking (also: no such booking)
--   Z0001  the booking is not `completed`
--   23505  this booking has already been rated (the unique constraint, not a raise)
--
-- "No such booking" collapses into 42501 for the same reason the transition functions do it:
-- separating them turns this function into an oracle that confirms whether a uuid names a real
-- booking.
--
-- NO expiry rule and no rating window. A visit completed a year ago can still be rated — the PRD
-- is silent, and at cold start every rating counts toward a threshold of three.
--
-- The role check is deliberate belt-and-braces. `client_id` is taken from the booking, and
-- `request_booking` already refuses anyone whose profile is not `role = 'client'`
-- (20260810120000:60-61) — so a specialist id cannot reach that column today. That is a property
-- of a DIFFERENT function, though, and S-03's header asked this migration for a role check by
-- name. Two lines here mean this boundary does not quietly depend on that one holding forever.
--
-- No `for update` on the booking, unlike the transition functions: this reads a terminal status
-- that nothing can move it out of, and concurrency on the write is settled by the unique
-- constraint rather than by ordering.
-- ---------------------------------------------------------------------------
create function public.submit_review(p_booking_id uuid, p_rating smallint) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_review_id uuid;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings b where b.id = p_booking_id;

  if not found or v_booking.client_id <> v_actor then
    raise exception 'not your booking' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_actor and p.role = 'client') then
    raise exception 'only a client can rate a visit' using errcode = '42501';
  end if;

  if v_booking.status <> 'completed' then
    raise exception 'booking is not completed' using errcode = 'Z0001';
  end if;

  insert into public.reviews (booking_id, specialist_id, client_id, rating)
  values (p_booking_id, v_booking.specialist_id, v_booking.client_id, p_rating)
  returning id into v_review_id;

  return v_review_id;
end $$;

-- The revoke is not decoration: Postgres grants EXECUTE to PUBLIC on every new function, so
-- `grant … to authenticated` alone leaves `anon` and `service_role` able to call it (they inherit
-- through PUBLIC). Every other function in this schema is revoked the same way
-- (20260807100000:238, 20260807130000:222-225). The `auth.uid() is null` guard above would refuse
-- an anonymous caller anyway — this makes it true at the privilege layer as well.
revoke all on function public.submit_review(uuid, smallint) from public, anon;

grant execute on function public.submit_review(uuid, smallint) to authenticated;
