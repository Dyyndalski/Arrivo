-- S-06 verification. Who may write a rating, and what a rating tells the rated.
--
-- Two properties are asserted here that no screen can show you:
--
--   1. The write path is one function. There is no insert grant, so the only way a row reaches
--      public.reviews is through submit_review — and it takes the specialist and the client off
--      the booking rather than off its arguments.
--   2. A rating does not name its author. `client_id` is withheld by a COLUMN grant, so a
--      specialist cannot join their bookings against reviews to learn who gave them one star.
--      v1 has no moderation and no admin role, which makes non-attribution the only answer to
--      retaliation available.
--
-- Counting convention as in the other suites: every assertion is scoped to its fixtures.

begin;
select plan(18);

do $$
declare pgtap_schema text;
begin
  select n.nspname into pgtap_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgtap';
  execute format('grant usage on schema %I to authenticated, anon', pgtap_schema);
  execute format('grant execute on all functions in schema %I to authenticated, anon', pgtap_schema);
end $$;

-- Fixtures: the client who was visited, a second client who was not, and the specialist.
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-0000-0000-00000000000c', 'authenticated', 'authenticated', 'rv-client@test.local', '{}', '{"role":"client"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-0000-0000-00000000000d', 'authenticated', 'authenticated', 'rv-other@test.local', '{}', '{"role":"client"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-0000-0000-000000000051', 'authenticated', 'authenticated', 'rv-spec@test.local', '{}', '{"role":"specialist"}', now(), now());

-- A complete, discoverable card — the aggregate assertions at the bottom read
-- discoverable_specialists, which filters on having both an area and a service.
insert into public.specialist_profiles (id, display_name)
values ('fa000000-0000-0000-0000-000000000051', 'Specjalistka Oceniana');

insert into public.specialist_areas (specialist_id, area_id)
values (
  'fa000000-0000-0000-0000-000000000051',
  (select a.id from public.service_areas a join public.cities c on c.id = a.city_id
    where c.slug = 'warszawa' and a.slug = 'mokotow')
);

insert into public.services (specialist_id, category_id, price_cents, duration_minutes, name)
values (
  'fa000000-0000-0000-0000-000000000051',
  (select id from public.service_categories where slug = 'fryzjerstwo-damskie'),
  15000, 60, 'Koloryzacja'
);

-- Bookings written directly as the owner: request_booking would refuse a second pending row for
-- the same pair, and these need to sit in terminal states anyway.
insert into public.bookings (id, client_id, specialist_id, category_id, price_cents, area_id, proposed_at, expires_at, status)
values
  ('fa000000-0000-0000-0000-0000000000b1', 'fa000000-0000-0000-0000-00000000000c',
   'fa000000-0000-0000-0000-000000000051',
   (select id from public.service_categories where slug = 'fryzjerstwo-damskie'), 15000,
   (select a.id from public.service_areas a join public.cities c on c.id = a.city_id
     where c.slug = 'warszawa' and a.slug = 'mokotow'),
   now() - interval '2 days', now() - interval '2 days', 'completed'),
  ('fa000000-0000-0000-0000-0000000000b2', 'fa000000-0000-0000-0000-00000000000c',
   'fa000000-0000-0000-0000-000000000051',
   (select id from public.service_categories where slug = 'fryzjerstwo-damskie'), 15000,
   (select a.id from public.service_areas a join public.cities c on c.id = a.city_id
     where c.slug = 'warszawa' and a.slug = 'mokotow'),
   now() + interval '2 days', now() + interval '1 day', 'accepted');

-- ===========================================================================
-- As the client who was visited: the one caller the function exists for.
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '{"sub":"fa000000-0000-0000-0000-00000000000c"}', true);
set local role authenticated;

select lives_ok(
  $$select public.submit_review('fa000000-0000-0000-0000-0000000000b1', 5::smallint)$$,
  'the client on a completed booking can rate it'
);

select is(
  (select count(*)::int from public.reviews where booking_id = 'fa000000-0000-0000-0000-0000000000b1'),
  1,
  'the rating row exists'
);

-- FR-013's "one rating per completed booking" is the unique constraint and nothing else. No
-- application check duplicates it, so this assertion is the whole rule.
select throws_ok(
  $$select public.submit_review('fa000000-0000-0000-0000-0000000000b1', 1::smallint)$$,
  '23505',
  NULL,
  'the same booking cannot be rated twice'
);

-- The gate FR-013 actually names: the specialist marking the visit completed is what opens rating.
select throws_ok(
  $$select public.submit_review('fa000000-0000-0000-0000-0000000000b2', 5::smallint)$$,
  'Z0001',
  NULL,
  'an accepted-but-not-completed booking cannot be rated'
);

-- 42501, not a not-found code: distinguishing them would make this function an oracle for whether
-- a uuid names a real booking, the same reasoning as the S-05 transitions.
select throws_ok(
  $$select public.submit_review('fa000000-0000-0000-0000-0000000000ff', 5::smallint)$$,
  '42501',
  NULL,
  'a booking that does not exist is refused as "not yours", not as "not found"'
);

-- The absence of an insert grant is the guarantee, so it gets asserted rather than assumed.
select throws_ok(
  $$insert into public.reviews (booking_id, specialist_id, client_id, rating)
    values ('fa000000-0000-0000-0000-0000000000b2', 'fa000000-0000-0000-0000-000000000051',
            'fa000000-0000-0000-0000-00000000000c', 5)$$,
  '42501',
  NULL,
  'a client cannot insert a rating directly, bypassing the function'
);

-- The column grant, from the caller's side. Postgres requires SELECT on every column a query
-- REFERENCES, so this also rules out `where client_id = auth.uid()` — which is why the
-- application reads "have I rated this?" by booking_id.
select throws_ok(
  $$select client_id from public.reviews$$,
  '42501',
  NULL,
  'even the rating''s own author cannot read client_id back'
);

-- ===========================================================================
-- As a different client: not their visit, not their rating to give.
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '{"sub":"fa000000-0000-0000-0000-00000000000d"}', true);
set local role authenticated;

select throws_ok(
  $$select public.submit_review('fa000000-0000-0000-0000-0000000000b1', 1::smallint)$$,
  '42501',
  NULL,
  'a client cannot rate somebody else''s visit'
);

-- ===========================================================================
-- As the specialist: cannot rate themselves, cannot see who rated them.
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '{"sub":"fa000000-0000-0000-0000-000000000051"}', true);
set local role authenticated;

select throws_ok(
  $$select public.submit_review('fa000000-0000-0000-0000-0000000000b1', 5::smallint)$$,
  '42501',
  NULL,
  'the specialist on the booking cannot rate their own visit'
);

-- The retaliation vector, closed. The specialist CAN see the rating — it is their average — but
-- joining it back to a person is what the column grant prevents.
select is(
  (select count(*)::int from public.reviews where specialist_id = 'fa000000-0000-0000-0000-000000000051'),
  1,
  'the specialist can see that a rating exists'
);

select throws_ok(
  $$select client_id from public.reviews where specialist_id = 'fa000000-0000-0000-0000-000000000051'$$,
  '42501',
  NULL,
  'the specialist CANNOT learn who wrote it'
);

-- ===========================================================================
-- As anon: nothing at all. S-03 granted this role select because the specialist profile was
-- public; /specialists joined PROTECTED_ROUTES on 2026-08-11 and no page is served signed-out.
-- ===========================================================================
reset role;
set local role anon;

select throws_ok(
  $$select rating from public.reviews$$,
  '42501',
  NULL,
  'an anonymous caller cannot read ratings at all'
);

-- ===========================================================================
-- Catalog assertions: the grants themselves, from the owner's side.
-- ===========================================================================
reset role;

select is(
  (select count(*)::int from information_schema.column_privileges
    where grantee = 'authenticated' and table_name = 'reviews'
      and column_name = 'client_id' and privilege_type = 'SELECT'),
  0,
  'authenticated holds no SELECT on reviews.client_id'
);

-- Positive control: without this, the assertion above would also pass if the whole grant vanished
-- and every average silently became null.
select is(
  (select count(*)::int from information_schema.column_privileges
    where grantee = 'authenticated' and table_name = 'reviews'
      and column_name = 'rating' and privilege_type = 'SELECT'),
  1,
  'authenticated still holds SELECT on reviews.rating, so the aggregate can be computed'
);

-- service_role bypasses RLS and picks up GRANT ALL from hosted default privileges, so the revoke
-- in the migration is the only real boundary. Same reasoning as booking_contact_details
-- (20260807110000) — and the same reason the local suite alone cannot prove it holds on hosted.
select is(
  (select count(*)::int from information_schema.role_table_grants
    where grantee = 'service_role' and table_name = 'reviews'
      and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')),
  0,
  'service_role has no DML on reviews — it bypasses RLS, so this is the only boundary'
);

-- Postgres grants EXECUTE to PUBLIC on every new function, so `grant … to authenticated` alone
-- leaves anon able to call it. Every function in this schema is revoked from public, anon.
select ok(
  not has_function_privilege('anon', 'public.submit_review(uuid, smallint)', 'EXECUTE'),
  'anon cannot execute submit_review'
);

-- ===========================================================================
-- The aggregate S-03 built still works, now that it has something to aggregate. This is the
-- assertion that would fail if the column grant had been written as a table-wide revoke.
-- ===========================================================================
select set_config('request.jwt.claims', '{"sub":"fa000000-0000-0000-0000-00000000000c"}', true);
set local role authenticated;

select is(
  (select rating_count from public.discoverable_specialists where id = 'fa000000-0000-0000-0000-000000000051'),
  1,
  'discoverable_specialists counts the new rating'
);

select is(
  (select rating_avg from public.discoverable_specialists where id = 'fa000000-0000-0000-0000-000000000051'),
  5.00,
  'discoverable_specialists averages the new rating'
);

reset role;

select * from finish();
rollback;
