-- S-05 verification. Every edge of the transition graph, from both sides.
--
-- Why this file is the largest in the suite: a wrong transition rule does not raise. It permits.
-- `accept_booking` letting the wrong person through, or `complete_booking` firing before the visit,
-- looks exactly like a working application — and the second one hands out review eligibility
-- (FR-013) for a visit that never happened. The only thing that notices is an assertion.
--
-- Bookings are inserted directly rather than through request_booking(): these tests need exact
-- control over `status` and `expires_at`, including states the request path cannot produce.
-- request_booking's own behaviour is covered by bookings_rls.test.sql.
--
-- One specialist per booking, because bookings_one_pending_per_pair permits a single live request
-- per (client, specialist) pair — two pending fixtures against one specialist will not insert.
--
-- Counting convention as in the other suites: every assertion is scoped to its fixtures.

begin;
select plan(42);

do $$
declare pgtap_schema text;
begin
  select n.nspname into pgtap_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgtap';
  execute format('grant usage on schema %I to authenticated, anon', pgtap_schema);
  execute format('grant execute on all functions in schema %I to authenticated, anon', pgtap_schema);
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures: one client, six specialists, one booking each in a distinct state.
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'aa000000-0000-0000-0000-00000000000c'::uuid, 'authenticated', 'authenticated', 'tr-client@test.local', '{}', '{"role":"client"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'aa000000-0000-0000-0000-000000000001'::uuid, 'authenticated', 'authenticated', 'tr-s1@test.local', '{}', '{"role":"specialist"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'aa000000-0000-0000-0000-000000000002'::uuid, 'authenticated', 'authenticated', 'tr-s2@test.local', '{}', '{"role":"specialist"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'aa000000-0000-0000-0000-000000000003'::uuid, 'authenticated', 'authenticated', 'tr-s3@test.local', '{}', '{"role":"specialist"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'aa000000-0000-0000-0000-000000000004'::uuid, 'authenticated', 'authenticated', 'tr-s4@test.local', '{}', '{"role":"specialist"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'aa000000-0000-0000-0000-000000000005'::uuid, 'authenticated', 'authenticated', 'tr-s5@test.local', '{}', '{"role":"specialist"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'aa000000-0000-0000-0000-000000000006'::uuid, 'authenticated', 'authenticated', 'tr-s6@test.local', '{}', '{"role":"specialist"}', now(), now());

insert into public.specialist_profiles (id, display_name)
select id, 'Specjalista ' || right(id::text, 1)
from auth.users where email like 'tr-s%@test.local';

insert into public.client_profiles (id, area_id, first_name, last_name, street, postal_code)
values (
  'aa000000-0000-0000-0000-00000000000c'::uuid,
  (select a.id from public.service_areas a join public.cities c on c.id = a.city_id
    where c.slug = 'warszawa' and a.slug = 'mokotow'),
  'Marta', 'Nowak', 'ul. Kwiatowa 12/3', '00-001'
);

insert into public.bookings (id, client_id, specialist_id, category_id, price_cents, area_id, proposed_at, expires_at, status)
select
  v.id::uuid,
  'aa000000-0000-0000-0000-00000000000c'::uuid,
  v.specialist_id::uuid,
  (select id from public.service_categories where slug = 'fryzjerstwo-damskie'),
  15000,
  (select a.id from public.service_areas a join public.cities c on c.id = a.city_id
    where c.slug = 'warszawa' and a.slug = 'mokotow'),
  v.proposed_at, v.expires_at, v.status::public.booking_status
from (values
  -- B1 pending, window open, visit in 2 days      -> the accept path
  ('bb000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', now() + interval '2 days',  now() + interval '5 hours', 'pending'),
  -- B2 pending, window open                       -> the decline path
  ('bb000000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000002', now() + interval '2 days',  now() + interval '5 hours', 'pending'),
  -- B3 pending, window open                       -> the client-withdrawal path
  ('bb000000-0000-0000-0000-000000000003', 'aa000000-0000-0000-0000-000000000003', now() + interval '2 days',  now() + interval '5 hours', 'pending'),
  -- B4 pending, window CLOSED an hour ago         -> everything must refuse; the job must catch it
  ('bb000000-0000-0000-0000-000000000004', 'aa000000-0000-0000-0000-000000000004', now() + interval '2 days',  now() - interval '1 hour',  'pending'),
  -- B5 accepted, visit was due yesterday          -> the completion path
  ('bb000000-0000-0000-0000-000000000005', 'aa000000-0000-0000-0000-000000000005', now() - interval '1 day',   now() - interval '1 day',   'accepted'),
  -- B6 accepted, visit is tomorrow                -> completion must refuse
  ('bb000000-0000-0000-0000-000000000006', 'aa000000-0000-0000-0000-000000000006', now() + interval '1 day',   now() - interval '1 hour',  'accepted')
) as v(id, specialist_id, proposed_at, expires_at, status);

insert into public.booking_contact_details (booking_id, first_name, last_name, phone, street, postal_code, note)
select id, 'Marta', 'Nowak', '+48 600 000 000', 'ul. Kwiatowa 12/3', '00-001', 'Domofon 12'
from public.bookings;

-- ===========================================================================
-- The accept path, as the addressed specialist. The privacy assertions around
-- it are the reason this slice exists at all.
-- ===========================================================================
select set_config('request.jwt.claims', '{"sub":"aa000000-0000-0000-0000-000000000001"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.booking_contact_details where booking_id = 'bb000000-0000-0000-0000-000000000001'),
  0,
  'BEFORE accepting, the addressed specialist cannot read the address'
);

select lives_ok(
  $$select public.accept_booking('bb000000-0000-0000-0000-000000000001')$$,
  'the addressed specialist can accept a live pending request'
);

select is(
  (select status::text from public.bookings where id = 'bb000000-0000-0000-0000-000000000001'),
  'accepted',
  'accepting sets status to accepted'
);

select is(
  (select resolved_by::text from public.bookings where id = 'bb000000-0000-0000-0000-000000000001'),
  'specialist',
  'accepting records the specialist as the resolver'
);

-- THE GUARDRAIL, from the other side. This assertion and the one above it are a pair: the address
-- must be unreadable before and readable after, and nothing between them but the transition.
select is(
  (select count(*)::int from public.booking_contact_details where booking_id = 'bb000000-0000-0000-0000-000000000001'),
  1,
  'AFTER accepting, the addressed specialist can read the address'
);

select is(
  (select street from public.booking_contact_details where booking_id = 'bb000000-0000-0000-0000-000000000001'),
  'ul. Kwiatowa 12/3',
  'the address revealed is the one the client saved'
);

select throws_ok(
  $$select public.complete_booking('bb000000-0000-0000-0000-000000000001')$$,
  'Z0003',
  NULL,
  'an accepted visit two days away cannot be marked completed yet'
);

select throws_ok(
  $$select public.accept_booking('bb000000-0000-0000-0000-000000000001')$$,
  'Z0001',
  NULL,
  'accepting an already-accepted booking is refused'
);

-- ===========================================================================
-- Wrong actor. Each of these is a hole if it passes.
-- ===========================================================================
select throws_ok(
  $$select public.accept_booking('bb000000-0000-0000-0000-000000000002')$$,
  '42501',
  NULL,
  'a specialist cannot accept a request addressed to somebody else'
);

select throws_ok(
  $$select public.decline_booking('bb000000-0000-0000-0000-000000000002')$$,
  '42501',
  NULL,
  'a specialist cannot decline a request addressed to somebody else'
);

select throws_ok(
  $$select public.cancel_booking('bb000000-0000-0000-0000-000000000001')$$,
  '42501',
  NULL,
  'a specialist cannot withdraw a request — that is the client''s act'
);

-- No existence oracle: an unknown id answers exactly as somebody else's booking does. If these
-- diverged, any signed-in user could probe which uuids name real bookings.
select throws_ok(
  $$select public.accept_booking('bb000000-0000-0000-0000-0000000000ff')$$,
  '42501',
  NULL,
  'an unknown booking id is refused with the same code as one belonging to somebody else'
);

-- ===========================================================================
-- The client side.
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '{"sub":"aa000000-0000-0000-0000-00000000000c"}', true);
set local role authenticated;

select throws_ok(
  $$select public.accept_booking('bb000000-0000-0000-0000-000000000002')$$,
  '42501',
  NULL,
  'a client cannot accept their own request'
);

select throws_ok(
  $$select public.complete_booking('bb000000-0000-0000-0000-000000000005')$$,
  '42501',
  NULL,
  'a client cannot mark a visit completed'
);

select lives_ok(
  $$select public.cancel_booking('bb000000-0000-0000-0000-000000000003')$$,
  'a client can withdraw their own pending request'
);

select is(
  (select status::text from public.bookings where id = 'bb000000-0000-0000-0000-000000000003'),
  'declined',
  'withdrawal is recorded as declined'
);

-- The whole reason resolved_by exists. Without it the client's own withdrawal is indistinguishable
-- from a specialist saying no, on both screens.
select is(
  (select resolved_by::text from public.bookings where id = 'bb000000-0000-0000-0000-000000000003'),
  'client',
  'withdrawal is attributed to the client, not the specialist'
);

select throws_ok(
  $$select public.cancel_booking('bb000000-0000-0000-0000-000000000003')$$,
  'Z0001',
  NULL,
  'withdrawing an already-withdrawn request is refused'
);

-- The trap this transition was added to open. bookings_one_pending_per_pair is partial to
-- status = 'pending', so withdrawal frees the pair immediately rather than after 48 hours.
select is(
  (select count(*)::int from public.bookings
    where client_id = 'aa000000-0000-0000-0000-00000000000c'
      and specialist_id = 'aa000000-0000-0000-0000-000000000003'
      and status = 'pending'),
  0,
  'withdrawal frees the client-specialist pair at once'
);

-- ===========================================================================
-- The expired request. Every actor must be refused, and the view must already
-- be telling the truth about it — before any job has run.
-- ===========================================================================
select throws_ok(
  $$select public.cancel_booking('bb000000-0000-0000-0000-000000000004')$$,
  'Z0002',
  NULL,
  'a client cannot withdraw a request whose window has closed'
);

select is(
  (select effective_status::text from public.bookings_view where id = 'bb000000-0000-0000-0000-000000000004'),
  'expired',
  'the view reads expired for a past-window pending row BEFORE the job runs'
);

select is(
  (select status::text from public.bookings_view where id = 'bb000000-0000-0000-0000-000000000004'),
  'pending',
  'the stored status is still pending — which is why the job is needed as well'
);

select is(
  (select effective_status::text from public.bookings_view where id = 'bb000000-0000-0000-0000-000000000001'),
  'accepted',
  'the view leaves a non-pending status alone'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"aa000000-0000-0000-0000-000000000004"}', true);
set local role authenticated;

select throws_ok(
  $$select public.accept_booking('bb000000-0000-0000-0000-000000000004')$$,
  'Z0002',
  NULL,
  'a specialist cannot accept a request whose window has closed'
);

select throws_ok(
  $$select public.decline_booking('bb000000-0000-0000-0000-000000000004')$$,
  'Z0002',
  NULL,
  'a specialist cannot decline a request whose window has closed'
);

select is(
  (select count(*)::int from public.booking_contact_details where booking_id = 'bb000000-0000-0000-0000-000000000004'),
  0,
  'an expired request never reveals the address'
);

-- ===========================================================================
-- The decline path.
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '{"sub":"aa000000-0000-0000-0000-000000000002"}', true);
set local role authenticated;

select lives_ok(
  $$select public.decline_booking('bb000000-0000-0000-0000-000000000002')$$,
  'the addressed specialist can decline a live pending request'
);

select is(
  (select resolved_by::text from public.bookings where id = 'bb000000-0000-0000-0000-000000000002'),
  'specialist',
  'a decline is attributed to the specialist'
);

select is(
  (select count(*)::int from public.booking_contact_details where booking_id = 'bb000000-0000-0000-0000-000000000002'),
  0,
  'declining never reveals the address'
);

select throws_ok(
  $$select public.complete_booking('bb000000-0000-0000-0000-000000000002')$$,
  'Z0001',
  NULL,
  'a declined booking cannot be completed'
);

-- ===========================================================================
-- Completion.
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '{"sub":"aa000000-0000-0000-0000-000000000005"}', true);
set local role authenticated;

select lives_ok(
  $$select public.complete_booking('bb000000-0000-0000-0000-000000000005')$$,
  'an accepted visit whose time has passed can be marked completed'
);

select is(
  (select status::text from public.bookings where id = 'bb000000-0000-0000-0000-000000000005'),
  'completed',
  'completion sets status to completed — the precondition S-06 reads'
);

-- Documented consequence, not an accident: the contact policy is scoped to status = 'accepted', so
-- completing a visit ends the specialist's access to the address. Asserted here so that if someone
-- later widens the policy to cover 'completed', it is a decision rather than a drift.
select is(
  (select count(*)::int from public.booking_contact_details where booking_id = 'bb000000-0000-0000-0000-000000000005'),
  0,
  'completing a visit ends the specialist''s access to the address'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"aa000000-0000-0000-0000-000000000006"}', true);
set local role authenticated;

select throws_ok(
  $$select public.complete_booking('bb000000-0000-0000-0000-000000000006')$$,
  'Z0003',
  NULL,
  'a visit scheduled for tomorrow cannot be completed today'
);

-- ===========================================================================
-- No side door. The functions are only the only path if the direct one is shut.
-- ===========================================================================
select throws_ok(
  $$update public.bookings set status = 'accepted' where id = 'bb000000-0000-0000-0000-000000000006'$$,
  '42501',
  NULL,
  'a signed-in user cannot UPDATE bookings directly — there is no grant'
);

select throws_ok(
  $$select public.expire_stale_bookings()$$,
  '42501',
  NULL,
  'a signed-in user cannot run the expiry job to lapse somebody else''s request early'
);

-- ===========================================================================
-- The job itself, as the role pg_cron runs it.
-- ===========================================================================
reset role;

select is(
  public.expire_stale_bookings(),
  1,
  'the job expires exactly the one past-window pending row'
);

select is(
  public.expire_stale_bookings(),
  0,
  'a second run changes nothing — the job is idempotent'
);

select is(
  (select status::text || '/' || resolved_by::text from public.bookings where id = 'bb000000-0000-0000-0000-000000000004'),
  'expired/system',
  'the expired row is attributed to the system, not to either party'
);

select is(
  (select status::text from public.bookings where id = 'bb000000-0000-0000-0000-000000000006'),
  'accepted',
  'the job leaves an accepted booking alone even when its window has passed'
);

select is(
  (select status::text from public.bookings where id = 'bb000000-0000-0000-0000-000000000005'),
  'completed',
  'the job leaves a completed booking alone'
);

select is(
  (select count(*)::int from public.bookings_view
    where client_id = 'aa000000-0000-0000-0000-00000000000c' and effective_status <> status),
  0,
  'after the job, the view and the stored status agree everywhere'
);

select * from finish();
rollback;
