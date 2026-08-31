-- S-04 verification. The guardrail this slice exists to establish, asserted from both sides.
--
-- The PRD calls address leakage a regression "even if every other metric holds". That property is
-- invisible from the UI — a leak looks like a working app — and it depends on one `status =
-- 'accepted'` term inside one policy. These assertions are what stop that term being deleted.
--
-- Counting convention as in the other suites: every assertion is scoped to its fixtures.

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

-- Fixtures: one client, two specialists. S1 gets the booking; S2 is the control that must never
-- see anything.
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'bc000000-0000-0000-0000-00000000000c', 'authenticated', 'authenticated', 'bk-client@test.local', '{}', '{"role":"client"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bc000000-0000-0000-0000-000000000051', 'authenticated', 'authenticated', 'bk-s1@test.local', '{}', '{"role":"specialist"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bc000000-0000-0000-0000-000000000052', 'authenticated', 'authenticated', 'bk-s2@test.local', '{}', '{"role":"specialist"}', now(), now());

-- Both specialists get a complete, discoverable card — request_booking refuses an undiscoverable
-- one, so the control needs to be discoverable for its refusal to mean what we think.
insert into public.specialist_profiles (id, display_name) values
  ('bc000000-0000-0000-0000-000000000051', 'Specjalista Jeden'),
  ('bc000000-0000-0000-0000-000000000052', 'Specjalista Dwa');

-- Scoped to THIS file's two fixtures by id, not `from public.specialist_profiles`.
--
-- Unscoped, these two statements set up every specialist the database happens to contain — which
-- was invisible while the only rows were the ones above, and became a hard failure the moment
-- supabase/seed.sql started shipping demo specialists: the Mokotów row already existed for them,
-- so `specialist_areas_pkey` raised a duplicate key, the file aborted before `plan()`, and the run
-- reported "Bad plan. You planned 26 tests but ran 0" — a red suite that reads like a regression
-- in whatever slice is under review. See context/foundation/lessons.md, "A green pgTAP suite
-- requires a reset first". A test sets up its own fixtures and nothing else.
insert into public.specialist_areas (specialist_id, area_id)
select sp.id, (select a.id from public.service_areas a join public.cities c on c.id = a.city_id
                where c.slug = 'warszawa' and a.slug = 'mokotow')
from public.specialist_profiles sp
where sp.id in ('bc000000-0000-0000-0000-000000000051', 'bc000000-0000-0000-0000-000000000052');

insert into public.services (specialist_id, category_id, price_cents, duration_minutes, name)
select sp.id, (select id from public.service_categories where slug = 'fryzjerstwo-damskie'), 15000, 60, 'Koloryzacja'
from public.specialist_profiles sp
where sp.id in ('bc000000-0000-0000-0000-000000000051', 'bc000000-0000-0000-0000-000000000052');

-- The client lives in Mokotów. request_booking derives the district from this row; the calls
-- below deliberately pass a DIFFERENT one to prove the argument is ignored (impl-review F2).
insert into public.client_profiles (id, area_id, first_name, last_name, street, postal_code)
values (
  'bc000000-0000-0000-0000-00000000000c',
  (select a.id from public.service_areas a join public.cities c on c.id = a.city_id
    where c.slug = 'warszawa' and a.slug = 'mokotow'),
  'Marta', 'Nowak', 'ul. Kwiatowa 12/3', '00-001'
);

-- ===========================================================================
-- As the client: submit through the function, and read back both halves.
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bc000000-0000-0000-0000-00000000000c"}', true);

select lives_ok(
  $$select public.request_booking(
      'bc000000-0000-0000-0000-000000000051',
      (select id from public.services where specialist_id = 'bc000000-0000-0000-0000-000000000051'),
      now() + interval '2 days',
      'Domofon 12',
      'Marta', 'Nowak', '+48 600 000 000', 'ul. Kwiatowa 12/3', '00-001',
      (select a.id from public.service_areas a join public.cities c on c.id = a.city_id
        where c.slug = 'warszawa' and a.slug = 'ursynow')
    )$$,
  'a client can submit a booking request'
);

select is(
  (select count(*)::int from public.bookings where client_id = 'bc000000-0000-0000-0000-00000000000c'),
  1,
  'the booking row exists'
);

select is(
  (select status::text from public.bookings where client_id = 'bc000000-0000-0000-0000-00000000000c'),
  'pending',
  'a new request is pending'
);

-- Atomicity: the whole reason submission goes through a function rather than two inserts.
select is(
  (select count(*)::int from public.booking_contact_details d
     join public.bookings b on b.id = d.booking_id
    where b.client_id = 'bc000000-0000-0000-0000-00000000000c'),
  1,
  'the contact row was written in the same statement'
);

select is(
  (select street from public.booking_contact_details d
     join public.bookings b on b.id = d.booking_id
    where b.client_id = 'bc000000-0000-0000-0000-00000000000c'),
  'ul. Kwiatowa 12/3',
  'the client can read their own address back'
);

-- The service snapshot: pieces, not a rendered string, so the booking stays translatable.
select is(
  (select service_name from public.bookings where client_id = 'bc000000-0000-0000-0000-00000000000c'),
  'Koloryzacja',
  'the service name is snapshotted onto the booking'
);

select is(
  (select price_cents from public.bookings where client_id = 'bc000000-0000-0000-0000-00000000000c'),
  15000,
  'the price is snapshotted onto the booking'
);

-- expires_at = least(created_at + 48h, proposed_at). The proposal here is 2 days out, so the
-- 48-hour window is the binding bound — but only just, which is exactly the interesting case.
select ok(
  (select expires_at <= proposed_at from public.bookings where client_id = 'bc000000-0000-0000-0000-00000000000c'),
  'expiry never outlives the moment the booking proposes'
);

-- The anti-spam index.
select throws_ok(
  $$select public.request_booking(
      'bc000000-0000-0000-0000-000000000051',
      (select id from public.services where specialist_id = 'bc000000-0000-0000-0000-000000000051'),
      now() + interval '3 days', null, 'Marta', 'Nowak', null, 'ul. Inna 1', '00-002',
      (select a.id from public.service_areas a join public.cities c on c.id = a.city_id
        where c.slug = 'warszawa' and a.slug = 'ursynow')
    )$$,
  '23505',
  NULL,
  'a second pending request to the same specialist is refused'
);

-- impl-review F2. `p_area_id` used to be inserted on trust; the function now derives the district
-- from the caller's own profile and ignores the argument. A direct RPC could otherwise file a
-- request claiming a district the client does not live in — the field the whole area match rests
-- on. The literal below is Ursynów; the fixture client saved Mokotów.
select is(
  (select a.slug from public.bookings b
     join public.service_areas a on a.id = b.area_id
    where b.client_id = 'bc000000-0000-0000-0000-00000000000c'
    limit 1),
  'mokotow',
  'the district comes from the client profile, not from the argument'
);

-- A different specialist is fine — the index is per pair, not per client.
select lives_ok(
  $$select public.request_booking(
      'bc000000-0000-0000-0000-000000000052',
      (select id from public.services where specialist_id = 'bc000000-0000-0000-0000-000000000052'),
      now() + interval '3 days', null, 'Marta', 'Nowak', null, 'ul. Kwiatowa 12/3', '00-001',
      (select a.id from public.service_areas a join public.cities c on c.id = a.city_id
        where c.slug = 'warszawa' and a.slug = 'ursynow')
    )$$,
  'a request to a different specialist is allowed'
);

-- The function must not be usable to write a booking as somebody else. Passing a service that
-- belongs to another specialist is the closest a caller can get to forging one.
select throws_ok(
  $$select public.request_booking(
      'bc000000-0000-0000-0000-000000000051',
      (select id from public.services where specialist_id = 'bc000000-0000-0000-0000-000000000052'),
      now() + interval '4 days', null, null, null, null, 'ul. X 1', null,
      (select a.id from public.service_areas a join public.cities c on c.id = a.city_id
        where c.slug = 'warszawa' and a.slug = 'ursynow')
    )$$,
  '23503',
  NULL,
  'a service belonging to another specialist is refused'
);

-- ===========================================================================
-- As specialist S1, the one addressed: sees the request, NOT the address.
-- This pair of assertions is the guardrail.
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '{"sub":"bc000000-0000-0000-0000-000000000051"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.bookings where specialist_id = 'bc000000-0000-0000-0000-000000000051'),
  1,
  'the addressed specialist sees the request'
);

select is(
  (select count(*)::int from public.booking_contact_details d
     join public.bookings b on b.id = d.booking_id
    where b.specialist_id = 'bc000000-0000-0000-0000-000000000051'),
  0,
  'the addressed specialist CANNOT read the address while the request is pending'
);

-- impl-review F1. The note is free text the CLIENT types, and the mockup's own placeholder
-- ("ring doorbell 12") invites writing the address into it. It lived on public.bookings until
-- 20260807120000, which meant the client could hand over their street through the one field the
-- privacy split had left on the visible side.
select is(
  (select count(*)::int from information_schema.columns
    where table_name = 'bookings' and column_name = 'note'),
  0,
  'the note is NOT on bookings — everything the client typed sits behind acceptance'
);

select is(
  (select count(*)::int from information_schema.columns
    where table_name = 'booking_contact_details' and column_name = 'note'),
  1,
  'the note lives with the address it may contain'
);

-- ===========================================================================
-- As specialist S2: sees nothing of S1's request, in either table.
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '{"sub":"bc000000-0000-0000-0000-000000000052"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.bookings where specialist_id = 'bc000000-0000-0000-0000-000000000051'),
  0,
  'an unrelated specialist cannot see somebody else''s request'
);

-- ===========================================================================
-- Flip to accepted (as the table owner, since S-05 owns the transition policy) and re-check S1.
-- ===========================================================================
reset role;
update public.bookings set status = 'accepted' where specialist_id = 'bc000000-0000-0000-0000-000000000051';

select set_config('request.jwt.claims', '{"sub":"bc000000-0000-0000-0000-000000000051"}', true);
set local role authenticated;

select is(
  (select street from public.booking_contact_details d
     join public.bookings b on b.id = d.booking_id
    where b.specialist_id = 'bc000000-0000-0000-0000-000000000051'),
  'ul. Kwiatowa 12/3',
  'the addressed specialist CAN read the address once the booking is accepted'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"bc000000-0000-0000-0000-000000000052"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.booking_contact_details d
     join public.bookings b on b.id = d.booking_id
    where b.specialist_id = 'bc000000-0000-0000-0000-000000000051'),
  0,
  'accepting one booking does not open its address to a different specialist'
);

-- ===========================================================================
-- Nobody writes directly. The function is the only path.
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '{"sub":"bc000000-0000-0000-0000-00000000000c"}', true);
set local role authenticated;

select throws_ok(
  $$insert into public.bookings (client_id, specialist_id, category_id, price_cents, area_id, proposed_at, expires_at)
    values ('bc000000-0000-0000-0000-00000000000c', 'bc000000-0000-0000-0000-000000000051',
            (select id from public.service_categories where slug = 'paznokcie'), 100,
            (select id from public.service_areas limit 1), now() + interval '1 day', now() + interval '1 day')$$,
  '42501',
  NULL,
  'a client cannot insert a booking directly, bypassing the atomic function'
);

-- ===========================================================================
-- The slice must not have loosened S-03's boundary.
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '{"sub":"bc000000-0000-0000-0000-000000000051"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.client_profiles),
  0,
  'client_profiles is still closed — a specialist reads the booking snapshot, never the profile'
);

reset role;

-- ===========================================================================
-- service_role holds BYPASSRLS, so every policy above is invisible to it. The ONLY thing standing
-- between that role and every client address is the absence of a table privilege — which
-- Supabase's hosted default privileges grant automatically unless a migration revokes them
-- (20260807110000). This was true on production and false locally, so the local suite was
-- proving a boundary that production did not have. These two assertions are what make the local
-- suite honest about it.
-- ===========================================================================
select is(
  (select count(*)::int from information_schema.role_table_grants
    where grantee = 'service_role'
      and table_name = 'booking_contact_details'
      and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')),
  0,
  'service_role has no DML on booking_contact_details — it bypasses RLS, so this is the only boundary'
);

select is(
  (select count(*)::int from information_schema.role_table_grants
    where grantee = 'service_role'
      and table_name = 'client_profiles'
      and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')),
  0,
  'service_role has no DML on client_profiles, for the same reason'
);

-- ===========================================================================
-- S-05 impl-review F1: a lapsed pending request must not lock the pair.
--
-- bookings_view.effective_status says "expired" the moment the window closes, but
-- bookings_one_pending_per_pair reads the STORED status and cancel_booking refuses a lapsed row
-- with Z0002 — so between the lapse and the next cron run the client was told their request had
-- expired and then refused a new one, with no action available that resolved it. request_booking
-- now expires its own pair's lapsed row before inserting (20260810120000).
--
-- S2's request is the one still pending at this point; S1's was flipped to accepted above.
-- ===========================================================================
reset role;
update public.bookings
   set expires_at = now() - interval '1 minute'
 where specialist_id = 'bc000000-0000-0000-0000-000000000052' and status = 'pending';

select set_config('request.jwt.claims', '{"sub":"bc000000-0000-0000-0000-00000000000c"}', true);
set local role authenticated;

select lives_ok(
  $$select public.request_booking(
      'bc000000-0000-0000-0000-000000000052',
      (select id from public.services where specialist_id = 'bc000000-0000-0000-0000-000000000052'),
      now() + interval '5 days', null, 'Marta', 'Nowak', null, 'ul. Kwiatowa 12/3', '00-001',
      (select a.id from public.service_areas a join public.cities c on c.id = a.city_id
        where c.slug = 'warszawa' and a.slug = 'ursynow')
    )$$,
  'a client whose request already lapsed can request that specialist again, before any cron run'
);

-- 'system', not 'client': this is expiry catching up, not a withdrawal. The client's list renders
-- the two differently, and calling it a withdrawal would tell them they did something they did not.
select is(
  (select count(*)::int from public.bookings
    where specialist_id = 'bc000000-0000-0000-0000-000000000052'
      and status = 'expired' and resolved_by = 'system'),
  1,
  'the lapsed row is closed as expired/system, not as a withdrawal'
);

select is(
  (select count(*)::int from public.bookings
    where specialist_id = 'bc000000-0000-0000-0000-000000000052' and status = 'pending'),
  1,
  'exactly one live request remains for the pair'
);

reset role;

select * from finish();
rollback;
