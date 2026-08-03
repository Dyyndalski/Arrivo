-- S-02 verification: proves the two boundaries this slice opens for the first time in the
-- project — a public read surface (anon can browse listings, per PRD Access Control) and a
-- write surface (owner-only AND specialist-role-only). Neither is observable from the UI:
-- a leak here looks like a working app right up until someone exploits it.

begin;
select plan(14);

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
-- As specialist S1: the happy path plus the two write boundaries.
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
-- As a CLIENT-role account: the role gate. This is the assertion that would catch a
-- policy rewritten to check ownership but forget the role.
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

-- ===========================================================================
-- As anon: the public read surface, and its write boundary.
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;

select is((select count(*)::int from public.specialist_profiles), 1, 'anon can read specialist cards');
select is((select count(*)::int from public.services), 1, 'anon can read services');
select is((select count(*)::int from public.specialist_areas), 2, 'anon can read declared areas');
select is((select count(*)::int from public.service_areas), 18, 'the area dictionary is seeded with 18 Warsaw districts');
select is((select count(*)::int from public.service_categories), 6, 'the taxonomy is seeded with 6 categories');

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
