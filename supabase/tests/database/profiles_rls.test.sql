-- F-01 verification: proves the privacy mechanism (the address-leak verification path).
-- Covers: trigger auto-creation + role mapping, safe default on invalid role, RLS own-row
-- isolation, and role immutability by end users.

begin;
select plan(7);

-- Let the `authenticated` role run pgTAP assertion functions during the role-switched
-- sub-tests below (pgtap lives in its own schema; grant execute on it for this tx only).
do $$
declare pgtap_schema text;
begin
  select n.nspname into pgtap_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgtap';
  execute format('grant usage on schema %I to authenticated', pgtap_schema);
  execute format('grant execute on all functions in schema %I to authenticated', pgtap_schema);
end $$;

-- Fixtures: three users inserted directly into auth.users (fires the trigger).
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'a@test.local', '{}', '{"role":"specialist"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'b@test.local', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'c@test.local', '{}', '{"role":"root"}', now(), now());

-- Trigger auto-creation + role mapping.
select is((select role::text from public.profiles where id = '11111111-1111-1111-1111-111111111111'), 'specialist', 'valid role metadata yields a specialist profile');
select is((select role::text from public.profiles where id = '22222222-2222-2222-2222-222222222222'), 'client', 'absent role metadata defaults to client');
select is((select role::text from public.profiles where id = '33333333-3333-3333-3333-333333333333'), 'client', 'garbage role metadata defaults to client without erroring');
select is(
  (select count(*)::int from public.profiles
   where id in (
     '11111111-1111-1111-1111-111111111111',
     '22222222-2222-2222-2222-222222222222',
     '33333333-3333-3333-3333-333333333333'
   )),
  3,
  'exactly one profile per fixture auth user (scoped, isolation-robust)'
);

-- RLS isolation: as authenticated user A, only A's own row is visible.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
select is((select count(*)::int from public.profiles), 1, 'RLS: user A sees exactly one profile (their own)');
select is((select id::text from public.profiles), '11111111-1111-1111-1111-111111111111', 'RLS: the only visible profile is user A''s own');

-- Role immutability: user A cannot update their own role (no UPDATE privilege at all).
select throws_ok(
  $$update public.profiles set role = 'specialist' where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501',
  NULL,
  'end user cannot update their own role (privilege denied)'
);
reset role;

select * from finish();
rollback;
