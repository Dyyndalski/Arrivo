-- S-03 verification. Three boundaries this slice opens, none of them observable from the UI:
--
--   1. client_profiles is the first table in the project holding data that must NEVER be public.
--      A leak looks like a working app; the PRD calls it a launch-blocking regression.
--   2. reviews is writable by nobody. FR-013's "only after a completed booking" rule cannot be
--      written until S-05 exists, so the absence of a write path IS the enforcement.
--   3. discoverable_specialists must accept exactly the cards missingPieces() calls complete.
--      This is the S-02 finding (F4) this slice was asked to close.
--
-- Counting convention as in specialist_listing_rls.test.sql: every assertion is scoped to its
-- fixtures or to a seed predicate, never a bare count(*).

begin;
select plan(26);

do $$
declare pgtap_schema text;
begin
  select n.nspname into pgtap_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgtap';
  execute format('grant usage on schema %I to authenticated, anon', pgtap_schema);
  execute format('grant execute on all functions in schema %I to authenticated, anon', pgtap_schema);
end $$;

-- Fixtures: two clients and two specialists.
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'd-c1@test.local', '{}', '{"role":"client"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'd-c2@test.local', '{}', '{"role":"client"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'd-s1@test.local', '{}', '{"role":"specialist"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '77777777-7777-7777-7777-777777777777', 'authenticated', 'authenticated', 'd-s2@test.local', '{}', '{"role":"specialist"}', now(), now());

-- ===========================================================================
-- Dictionary completeness. A missing name_en surfaces as a blank label in the English UI, which
-- nothing else in the stack complains about.
-- ===========================================================================
select is(
  (select count(*)::int from public.cities),
  10,
  'the city dictionary is seeded with 10 cities'
);

select is(
  (select count(*)::int from public.service_areas where name_en is null or btrim(name_en) = ''),
  0,
  'every service area has an English name'
);

select is(
  (select count(*)::int from public.service_categories where name_en is null or btrim(name_en) = ''),
  0,
  'every service category has an English name'
);

select is(
  (select count(*)::int from public.service_subtypes where name_en is null or btrim(name_en) = ''),
  0,
  'every service subtype has an English name'
);

select is(
  (select count(*)::int from public.service_areas where city_id is null),
  0,
  'every service area belongs to a city'
);

-- The reason the global unique on slug had to go: three cities have a Śródmieście.
select is(
  (select count(*)::int from public.service_areas where slug = 'srodmiescie'),
  4,
  'the same district slug can exist in several cities (Warszawa, Łódź, Wrocław, Gdańsk)'
);

select is(
  (select count(*)::int
     from public.service_areas a join public.cities c on c.id = a.city_id
    where c.slug in ('szczecin', 'bydgoszcz', 'lublin', 'katowice')),
  4,
  'the four whole-city markets have exactly one area each'
);

-- ===========================================================================
-- As client C1: own-row access to client_profiles.
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);

select lives_ok(
  $$insert into public.client_profiles (id, area_id, first_name, last_name, phone, street, postal_code)
    select '11111111-1111-1111-1111-111111111111', a.id, 'Marta', 'Nowak', '+48 600 000 000', 'ul. Kwiatowa 12/3', '00-001'
    from public.service_areas a join public.cities c on c.id = a.city_id
    where c.slug = 'warszawa' and a.slug = 'mokotow'$$,
  'a client can create their own profile row'
);

select is(
  (select first_name from public.client_profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Marta',
  'the client profile reads back'
);

select throws_ok(
  $$update public.client_profiles set postal_code = '001' where id = '11111111-1111-1111-1111-111111111111'$$,
  '23514',
  NULL,
  'a postal code outside the NN-NNN format is refused'
);

select throws_ok(
  $$update public.client_profiles set first_name = '  Marta  ' where id = '11111111-1111-1111-1111-111111111111'$$,
  '23514',
  NULL,
  'an untrimmed first name is refused'
);

select throws_ok(
  $$insert into public.client_profiles (id) values ('22222222-2222-2222-2222-222222222222')$$,
  '42501',
  NULL,
  'a client cannot create a profile row for another user'
);

-- ===========================================================================
-- As client C2: cannot see C1's address. This is the guardrail assertion — the one that fails if
-- someone ever relaxes client_profiles_select_own into `using (true)` the way every other table
-- in this slice is.
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.client_profiles where id = '11111111-1111-1111-1111-111111111111'),
  0,
  'a client cannot read another client''s profile row'
);

-- ===========================================================================
-- As specialist S1: no client-address access, and no route to a rating.
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.client_profiles where id = '11111111-1111-1111-1111-111111111111'),
  0,
  'a specialist cannot read a client''s address before any booking exists (F-01 privacy contract)'
);

select throws_ok(
  $$insert into public.client_profiles (id) values ('33333333-3333-3333-3333-333333333333')$$,
  '42501',
  NULL,
  'a specialist-role account cannot hold a client profile row'
);

-- The write path S-06 will open. Until then nobody holds the grant, which is what stops a
-- specialist from rating themselves five stars on day one.
select throws_ok(
  $$insert into public.reviews (specialist_id, client_id, rating)
    values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 5)$$,
  '42501',
  NULL,
  'nobody can insert a review yet — the write path arrives with S-06'
);

-- Build a card in three steps and watch the view's answer change at each one. This is the F4
-- contract: the view must accept exactly what missingPieces() calls complete.
select lives_ok(
  $$insert into public.specialist_profiles (id, display_name)
    values ('33333333-3333-3333-3333-333333333333', 'Studio Test')$$,
  'specialist creates a card'
);

select is(
  (select count(*)::int from public.discoverable_specialists where id = '33333333-3333-3333-3333-333333333333'),
  0,
  'a card with a name but no areas and no services is NOT discoverable'
);

insert into public.specialist_areas (specialist_id, area_id)
select '33333333-3333-3333-3333-333333333333', a.id
from public.service_areas a join public.cities c on c.id = a.city_id
where c.slug = 'warszawa' and a.slug = 'mokotow';

select is(
  (select count(*)::int from public.discoverable_specialists where id = '33333333-3333-3333-3333-333333333333'),
  0,
  'a card with an area but no service is NOT discoverable'
);

insert into public.services (specialist_id, category_id, price_cents, duration_minutes, name)
select '33333333-3333-3333-3333-333333333333', id, 15000, 60, 'Koloryzacja + odżywka'
from public.service_categories where slug = 'fryzjerstwo-damskie';

select is(
  (select count(*)::int from public.discoverable_specialists where id = '33333333-3333-3333-3333-333333333333'),
  1,
  'a card with a name, an area and a service IS discoverable'
);

select is(
  (select rating_count from public.discoverable_specialists where id = '33333333-3333-3333-3333-333333333333'),
  0,
  'rating_count is 0 with no reviews'
);

select ok(
  (select rating_avg is null from public.discoverable_specialists where id = '33333333-3333-3333-3333-333333333333'),
  'rating_avg is null with no reviews — not 0, which would read as a one-star specialist'
);

select is(
  (select min_price_cents from public.discoverable_specialists where id = '33333333-3333-3333-3333-333333333333'),
  15000,
  'min_price_cents reports the cheapest service'
);

-- Deleting the last service drops the card back out. The specialist's own banner reads the same
-- view, so it flips at the same instant — that is the whole point of F4.
delete from public.services where specialist_id = '33333333-3333-3333-3333-333333333333';

select is(
  (select count(*)::int from public.discoverable_specialists where id = '33333333-3333-3333-3333-333333333333'),
  0,
  'removing the last service makes the card undiscoverable again'
);

-- ===========================================================================
-- As anon: the view is public, client addresses are not.
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;

-- Note the error class, and how it differs from the two client/specialist assertions above.
-- Those return zero ROWS: `authenticated` holds the SELECT grant, so RLS runs and filters
-- everything out. `anon` holds no grant at all, so the query is refused before RLS is consulted.
-- The table is closed at both layers, and this asserts the outer one.
select throws_ok(
  $$select count(*) from public.client_profiles$$,
  '42501',
  NULL,
  'anon is refused client_profiles outright — no grant, so RLS is never even reached'
);

select lives_ok(
  $$select 1 from public.discoverable_specialists limit 1$$,
  'anon can query the discovery view'
);

reset role;

select * from finish();
rollback;
