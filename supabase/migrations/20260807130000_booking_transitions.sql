-- S-05: the transitions S-04 deliberately did not write.
--
-- 20260807100000_bookings.sql granted SELECT on public.bookings and stopped there:
--   "No UPDATE or DELETE grant either — S-05 adds the transition policies when it has transitions
--    to make."
--
-- This migration makes them. It does NOT add an UPDATE grant.
--
-- WHY NOT A POLICY. An UPDATE policy needs `grant update on public.bookings to authenticated`, and
-- that grant is table-wide: it would let a specialist PATCH `price_cents`, `proposed_at` or
-- `area_id` through PostgREST just as easily as `status`. Column-level grants could narrow that,
-- but no policy can express "pending may become accepted, and accepted may never become pending
-- again" — WITH CHECK sees only the new row. That would need a trigger on top, and then the rule
-- lives in two places.
--
-- So: four SECURITY DEFINER functions, one per legal edge, and no write grant at all. The absence
-- of the grant is the guarantee. Do not add one.

-- ---------------------------------------------------------------------------
-- Who closed a booking.
--
-- `declined` has two authors: a specialist saying no, and a client withdrawing. The alternative was
-- a `cancelled` enum value, which means `alter type` against a live database plus a new badge, a
-- new filter and new copy in both catalogues — for a distinction one nullable column carries.
--
-- 'system' is the expiry job (20260807140000). One column answers "who closed this" for all three.
-- ---------------------------------------------------------------------------
create type public.booking_actor as enum ('client', 'specialist', 'system');

alter table public.bookings
  add column resolved_by public.booking_actor;

comment on column public.bookings.resolved_by is
  'Who moved this booking to its terminal state; null while it is still open. Distinguishes a '
  'specialist declining from a client withdrawing — both are status = declined.';

-- ---------------------------------------------------------------------------
-- Error codes.
--
-- Postgres reserves classes 00-04 and A-H for the standard; Z is free for application use. The UI
-- has to say something true and different for each of these, so they cannot share a code:
--
--   42501  the caller is not the party named on this row (also: no such row — see below)
--   Z0001  the booking is not in the status this transition starts from
--   Z0002  the request is still `pending` in the table but its window has closed
--   Z0003  an accepted visit cannot be completed before it was due to happen
--
-- "No such booking" deliberately raises 42501 rather than a not-found code. Distinguishing them
-- turns every one of these functions into an oracle that confirms whether a given uuid names a real
-- booking, to anyone signed in.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- pending -> accepted, by the addressed specialist.
--
-- `for update` matters: two clicks in flight would otherwise both read `pending` and both write.
-- The second waits, re-reads `accepted`, and raises Z0001 — which is the honest answer.
--
-- The expiry check is the third of three defences (the cron keeps the table honest,
-- bookings_view keeps the screen honest, this keeps the decision honest). It is the only one that
-- cannot be bypassed, so it is the one that counts.
-- ---------------------------------------------------------------------------
create function public.accept_booking(p_booking_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_booking public.bookings%rowtype;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings b where b.id = p_booking_id for update;

  if not found or v_booking.specialist_id <> v_actor then
    raise exception 'not your booking' using errcode = '42501';
  end if;

  if v_booking.status <> 'pending' then
    raise exception 'booking is not pending' using errcode = 'Z0001';
  end if;

  if v_booking.expires_at <= now() then
    raise exception 'request has expired' using errcode = 'Z0002';
  end if;

  update public.bookings
     set status = 'accepted', resolved_by = 'specialist'
   where id = p_booking_id;
end $$;

-- ---------------------------------------------------------------------------
-- pending -> declined, by the addressed specialist.
--
-- No reason is recorded. PRD Non-Goals rules out chat, and a free-text field pointing from
-- specialist to client is a chat with one message and no moderation.
--
-- Declining an already-expired request raises Z0002 rather than succeeding: the client has already
-- been told it expired, and rewriting that to "declined" would change what they were told.
-- ---------------------------------------------------------------------------
create function public.decline_booking(p_booking_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_booking public.bookings%rowtype;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings b where b.id = p_booking_id for update;

  if not found or v_booking.specialist_id <> v_actor then
    raise exception 'not your booking' using errcode = '42501';
  end if;

  if v_booking.status <> 'pending' then
    raise exception 'booking is not pending' using errcode = 'Z0001';
  end if;

  if v_booking.expires_at <= now() then
    raise exception 'request has expired' using errcode = 'Z0002';
  end if;

  update public.bookings
     set status = 'declined', resolved_by = 'specialist'
   where id = p_booking_id;
end $$;

-- ---------------------------------------------------------------------------
-- accepted -> completed, by the specialist, not before the visit was due.
--
-- The time check is the whole reason this function is not two lines. FR-013 lets a client review a
-- booking the specialist marked completed; without `proposed_at <= now()` a specialist can accept
-- and complete a request within seconds of receiving it and then ask for a rating for a visit that
-- never happened. The PRD flagged exactly this when it accepted specialist-marked completion for
-- v1 ("gates who can review, which can bias ratings").
--
-- A visit that ran early cannot be closed early. That is the accepted cost.
-- ---------------------------------------------------------------------------
create function public.complete_booking(p_booking_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_booking public.bookings%rowtype;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings b where b.id = p_booking_id for update;

  if not found or v_booking.specialist_id <> v_actor then
    raise exception 'not your booking' using errcode = '42501';
  end if;

  if v_booking.status <> 'accepted' then
    raise exception 'booking is not accepted' using errcode = 'Z0001';
  end if;

  if v_booking.proposed_at > now() then
    raise exception 'visit has not happened yet' using errcode = 'Z0003';
  end if;

  update public.bookings
     set status = 'completed', resolved_by = 'specialist'
   where id = p_booking_id;
end $$;

-- ---------------------------------------------------------------------------
-- pending -> declined, by the client who made the request.
--
-- Not in the roadmap's outcome for this slice, and added anyway, because S-04 built a trap:
-- `bookings_one_pending_per_pair` allows one live request per client-specialist pair. A client who
-- picks the wrong date has no way out of it for up to 48 hours, from the one specialist they wanted.
--
-- Withdrawal frees the pair immediately, because the index is partial to status = 'pending'.
-- Accepted bookings cannot be withdrawn here: cancelling an agreed visit is a different act with a
-- different meaning, and v1 has no channel to tell the specialist about it.
-- ---------------------------------------------------------------------------
create function public.cancel_booking(p_booking_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_booking public.bookings%rowtype;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings b where b.id = p_booking_id for update;

  if not found or v_booking.client_id <> v_actor then
    raise exception 'not your booking' using errcode = '42501';
  end if;

  if v_booking.status <> 'pending' then
    raise exception 'booking is not pending' using errcode = 'Z0001';
  end if;

  if v_booking.expires_at <= now() then
    raise exception 'request has expired' using errcode = 'Z0002';
  end if;

  update public.bookings
     set status = 'declined', resolved_by = 'client'
   where id = p_booking_id;
end $$;

revoke all on function public.accept_booking(uuid) from public, anon;
revoke all on function public.decline_booking(uuid) from public, anon;
revoke all on function public.complete_booking(uuid) from public, anon;
revoke all on function public.cancel_booking(uuid) from public, anon;

grant execute on function public.accept_booking(uuid) to authenticated;
grant execute on function public.decline_booking(uuid) to authenticated;
grant execute on function public.complete_booking(uuid) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;

comment on function public.accept_booking is
  'pending -> accepted by the addressed specialist. Reveals booking_contact_details to them, via '
  'the policy in 20260807100000. The only way a status becomes accepted.';
comment on function public.cancel_booking is
  'pending -> declined by the requesting client, recorded as resolved_by = client. Frees '
  'bookings_one_pending_per_pair so the client can request the same specialist again.';

-- ---------------------------------------------------------------------------
-- The truth between cron runs.
--
-- context/foundation/infrastructure.md requires expiry to be enforced BOTH by a scheduled job and
-- lazily at read time, because a missed run must not leave a client staring at "pending" forever.
-- This view is the lazy half, and it is the only definition of it — the same discipline as
-- discoverable_specialists in S-03, where three screens disagreed until one view owned the rule.
--
-- `security_invoker = true` is load-bearing: without it the view runs as its owner and the two
-- SELECT policies on public.bookings stop applying, which would publish every booking in the
-- system to every signed-in user.
--
-- Note what this view does NOT do: it does not free bookings_one_pending_per_pair. That index reads
-- the stored status. A client whose request expired an hour ago sees "wygasłe" here but still
-- cannot request that specialist again until the job runs. That is why the job exists as well.
-- (S-05 impl-review F1 narrowed that gap for the one case where it was user-visible:
-- request_booking now expires its own pair's lapsed row before inserting — 20260810120000.)
--
-- `b.*` IS EXPANDED NOW, not at query time. Postgres records the column list when the view is
-- created, so a later `alter table public.bookings add column` does NOT appear here — while
-- `BookingView extends Booking` in src/types.ts keeps claiming it does, and the field reads as
-- undefined at runtime with no type error to catch it. Any migration that adds a column to
-- public.bookings must also `create or replace view public.bookings_view` in the same file.
-- ---------------------------------------------------------------------------
create view public.bookings_view
with (security_invoker = true)
as
select
  b.*,
  case
    when b.status = 'pending' and b.expires_at <= now() then 'expired'::public.booking_status
    else b.status
  end as effective_status
from public.bookings b;

revoke all on public.bookings_view from anon, authenticated;
grant select on public.bookings_view to authenticated;

comment on view public.bookings_view is
  'public.bookings plus effective_status, which reads expired for a pending row past its window. '
  'Every reader of bookings should use this view; the base table is for writers.';

-- ---------------------------------------------------------------------------
-- service_role: revoked here too.
--
-- 20260807100000 left service_role its hosted default grants on public.bookings on the assumption
-- that S-05's expiry cron would run as a Cloudflare Worker and need them. It does not: the job runs
-- inside Postgres via pg_cron (20260807140000), as the function's owner.
--
-- So nothing in this system needs service_role on bookings — and per context/foundation/lessons.md,
-- the hosted project grants it full DML on every new table automatically, and the role carries
-- BYPASSRLS, so the policies above do not constrain it. A legacy service_role JWT for this project
-- was exposed on 2026-08-07; until it is rotated it can read and rewrite every booking row. This
-- revoke closes that on these two objects. It is not tidiness.
-- ---------------------------------------------------------------------------
revoke all on public.bookings from service_role;
revoke all on public.bookings_view from service_role;
