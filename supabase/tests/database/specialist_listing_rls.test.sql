-- S-02 verification: proves the two boundaries this slice opens for the first time in the
-- project — a public read surface (anon can browse listings, per PRD Access Control) and a
-- write surface (owner-only AND specialist-role-only). Neither is observable from the UI:
-- a leak here looks like a working app right up until someone exploits it.
--
-- Counting convention: every assertion is scoped to its fixtures or to its seed predicate,
-- never a bare count(*) over a table. Follows profiles_rls.test.sql:39 — an unscoped total
-- silently asserts "nothing else will ever live here", and breaks pointing at the wrong thing
-- the day a seed file or a second city appears.

begin;
select plan(20);

-- Let the role-switched sub-tests below call pgTAP assertion functions. pgtap lives in its
-- own schema; grant usage/execute on it to both switched-to roles, for this tx only.
do $$
declare pgtap_schema text;
begin
  select n.nspname into pgtap_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgtap';
  execute format('grant usage on schema %I to authenticated, anon', pgtap_schema);
  execute format('grant execute on all functions in schema %I to authenticated, anon', pgtap_schema);
end $$;

-- Fixtures: two specialists and one client. Inserting into auth.users fires F-01's
-- handle_new_user trigger, which maps raw_user_meta_data.role onto public.profiles.
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 's1@test.local', '{}', '{"role":"specialist"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated', 's2@test.local', '{}', '{"role":"specialist"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666666', 'authenticated', 'authenticated', 'c1@test.local', '{}', '{"role":"client"}', now(), now());

-- ===========================================================================
-- As specialist S1: the happy path plus the write boundaries.
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444"}', true);

select lives_ok(
  $$insert into public.specialist_profiles (id, display_name)
    values ('44444444-4444-4444-4444-444444444444', 'Studio Ala')$$,
  'specialist can create their own card'
);

select is(
  (select display_name from public.specialist_profiles where id = '44444444-4444-4444-4444-444444444444'),
  'Studio Ala',
  'the card reads back with the name that was written'
);

-- Pins a cross-migration coupling that is invisible from either file: the write policies on
-- specialist_profiles gate on `exists (select 1 from public.profiles ...)`, and that subquery
-- is evaluated under the CALLER's RLS. It therefore depends on F-01's profiles_select_own
-- continuing to expose the caller's own row. Narrow that policy and every specialist write
-- starts failing closed with nothing pointing at the cause — this assertion is the pointer.
select is(
  (select role::text from public.profiles where id = '44444444-4444-4444-4444-444444444444'),
  'specialist',
  'the role gate''s precondition holds: a specialist can read their own profiles.role'
);

select lives_ok(
  $$insert into public.specialist_areas (specialist_id, area_id)
    select '44444444-4444-4444-4444-444444444444', id
    from public.service_areas where slug in ('mokotow', 'ursynow')$$,
  'specialist can declare their own service areas'
);

select lives_ok(
  $$insert into public.services (specialist_id, category_id, subtype_id, price_cents)
    select '44444444-4444-4444-4444-444444444444', c.id, s.id, 12000
    from public.service_categories c
    join public.service_subtypes s on s.category_id = c.id
    where c.slug = 'fryzjerstwo-damskie' and s.slug = 'strzyzenie'$$,
  'specialist can list a service under their own card'
);

select throws_ok(
  $$insert into public.services (specialist_id, category_id, price_cents)
    select '55555555-5555-5555-5555-555555555555', id, 9900
    from public.service_categories where slug = 'paznokcie'$$,
  '42501',
  NULL,
  'specialist cannot list a service under someone else''s card'
);

-- The composite FK, not a trigger, is what catches this.
select throws_ok(
  $$insert into public.services (specialist_id, category_id, subtype_id, price_cents)
    values (
      '44444444-4444-4444-4444-444444444444',
      (select id from public.service_categories where slug = 'paznokcie'),
      (select s.id from public.service_subtypes s
         join public.service_categories c on c.id = s.category_id
        where c.slug = 'fryzjerstwo-damskie' and s.slug = 'strzyzenie'),
      9900
    )$$,
  '23503',
  NULL,
  'a subtype from another category is refused'
);

-- The trigger's real job is ignoring what the client sends, not advancing a clock: now() is
-- fixed for the whole transaction, so a "did it move" test would be untestable here. Feed it
-- a deliberately wrong timestamp and assert it is overwritten.
update public.specialist_profiles
   set display_name = 'Studio Ala v2', updated_at = '2000-01-01T00:00:00Z'
 where id = '44444444-4444-4444-4444-444444444444';

select is(
  (select updated_at from public.specialist_profiles where id = '44444444-4444-4444-4444-444444444444'),
  now(),
  'set_updated_at overrides a client-supplied updated_at'
);

-- The bounds below also live in src/lib/schemas/specialist.ts as zod rules, and nothing
-- structural keeps the two copies in step (impl-review F6). These assertions are the guard:
-- move a bound in a migration and a test naming the schema file fails, instead of valid-
-- looking input starting to fail after it has already passed validation.
select throws_ok(
  $$update public.specialist_profiles set display_name = repeat('x', 61)
     where id = '44444444-4444-4444-4444-444444444444'$$,
  '23514',
  NULL,
  'DB bound matches schema: a 61-character display_name is refused'
);

select throws_ok(
  $$update public.specialist_profiles set display_name = '  Studio  '
     where id = '44444444-4444-4444-4444-444444444444'$$,
  '23514',
  NULL,
  'DB bound matches schema: an untrimmed display_name is refused'
);

select throws_ok(
  $$insert into public.services (specialist_id, category_id, price_cents)
    select '44444444-4444-4444-4444-444444444444', id, 0
    from public.service_categories where slug = 'makijaz'$$,
  '23514',
  NULL,
  'DB bound matches schema: a zero price is refused'
);

-- ===========================================================================
-- As specialist S2: cannot create a card owned by someone else.
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555"}', true);
set local role authenticated;

select throws_ok(
  $$insert into public.specialist_profiles (id, display_name)
    values ('44444444-4444-4444-4444-444444444444', 'Podszywacz')$$,
  '42501',
  NULL,
  'specialist cannot create a card under another user''s id'
);

-- ===========================================================================
-- As a CLIENT-role account: the role gate. The first assertion below would catch a policy
-- rewritten to check ownership but forget the role.
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666"}', true);
set local role authenticated;

select throws_ok(
  $$insert into public.specialist_profiles (id, display_name)
    values ('66666666-6666-6666-6666-666666666666', 'Klient Udający')$$,
  '42501',
  NULL,
  'a client-role account cannot create a specialist card'
);

-- Note the error CLASS: skipping the card and writing straight to services is refused by the
-- foreign key (23503), not by a policy (42501). The child tables carry no role check of their
-- own — they inherit it only because a card cannot exist without one. Any error mapping in the
-- app layer must treat 23503 on this path as "not allowed", not as a database fault.
select throws_ok(
  $$insert into public.services (specialist_id, category_id, price_cents)
    select '66666666-6666-6666-6666-666666666666', id, 5000
    from public.service_categories where slug = 'paznokcie'$$,
  '23503',
  NULL,
  'a client-role account cannot list a service (refused by FK, not by policy)'
);

-- ===========================================================================
-- As anon: the public read surface, and its write boundary.
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;

select is(
  (select count(*)::int from public.specialist_profiles
    where id in ('44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666')),
  1,
  'anon can read specialist cards (scoped to fixtures)'
);

select is(
  (select count(*)::int from public.services where specialist_id = '44444444-4444-4444-4444-444444444444'),
  1,
  'anon can read services (scoped to fixture)'
);

select is(
  (select count(*)::int from public.specialist_areas where specialist_id = '44444444-4444-4444-4444-444444444444'),
  2,
  'anon can read declared areas (scoped to fixture)'
);

-- S-03 replaced the free-text `city` column with a FK to public.cities. The assertion is
-- unchanged in intent — Warsaw still has its 18 districts — but it now reaches them through the
-- dictionary rather than a string literal.
select is(
  (select count(*)::int
     from public.service_areas a
     join public.cities c on c.id = a.city_id
    where c.slug = 'warszawa'),
  18,
  'the area dictionary is seeded with 18 Warsaw districts'
);

select is(
  (select count(*)::int from public.service_categories
    where slug in ('fryzjerstwo-damskie', 'fryzjerstwo-meskie', 'paznokcie', 'makijaz', 'kosmetyka-twarzy', 'depilacja')),
  6,
  'the taxonomy is seeded with the 6 expected categories'
);

select throws_ok(
  $$insert into public.specialist_profiles (id, display_name)
    values ('44444444-4444-4444-4444-444444444444', 'Anon')$$,
  '42501',
  NULL,
  'anon cannot write a specialist card'
);

reset role;

select * from finish();
rollback;
