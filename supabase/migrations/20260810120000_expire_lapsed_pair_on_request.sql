-- S-05 impl-review F1: stop telling a client "wygasła" and then refusing them a new request.
--
-- THE CONTRADICTION. `bookings_view.effective_status` (20260807130000) reads `expired` the moment
-- `expires_at` passes, so the client's list says the request lapsed immediately. But two other
-- things read the STORED status:
--
--   * `bookings_one_pending_per_pair` — the partial unique index (20260807100000:90) still sees a
--     live `pending` row, so requesting that same specialist again raises 23505, which the app
--     renders as "Masz już oczekujące zapytanie u tego specjalisty";
--   * `cancel_booking` — raises Z0002 once the window has closed, so withdrawing is not a way out
--     either (and the UI correctly hides the button, since it keys on effective_status).
--
-- For up to 15 minutes — until the pg_cron job (20260807140000) next runs — the screen and the
-- error contradicted each other, and the client had no action available that resolved it.
--
-- THE FIX. `request_booking` expires the blocking row itself before inserting. This is the same
-- lazy-expiry principle `bookings_view` applies to reading, applied to writing: the caller is
-- already in the one code path where a stale pending row does damage, so it is the cheapest place
-- to notice.
--
-- Why a plain UPDATE is race-safe against a concurrent cron run: the statement takes its own row
-- lock, and under READ COMMITTED a blocked UPDATE re-evaluates its WHERE against the committed row
-- when the lock is released. If the cron got there first the predicate no longer matches, we change
-- nothing, and the index is free regardless — which is the outcome we wanted either way.
--
-- Narrow on purpose: only this (client, specialist) pair, and only rows already past their own
-- `expires_at`. It does not recompute the 48-hour rule and it does not touch anybody else's rows.
-- `resolved_by = 'system'` matches expire_stale_bookings() — this is expiry, not a client decision,
-- and the client's list must not read it as a withdrawal.
--
-- Everything else in this function is unchanged from 20260807120000.

create or replace function public.request_booking(
  p_specialist_id uuid,
  p_service_id uuid,
  p_proposed_at timestamptz,
  p_note text,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_street text,
  p_postal_code text,
  p_area_id smallint
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid := auth.uid();
  v_service public.services%rowtype;
  v_booking uuid;
  v_expires timestamptz;
  v_area smallint;
begin
  if v_client is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_client and p.role = 'client') then
    raise exception 'only a client can request a booking' using errcode = '42501';
  end if;

  select * into v_service from public.services s
   where s.id = p_service_id and s.specialist_id = p_specialist_id;
  if not found then
    raise exception 'service does not belong to that specialist' using errcode = '23503';
  end if;

  if not exists (select 1 from public.discoverable_specialists d where d.id = p_specialist_id) then
    raise exception 'specialist is not discoverable' using errcode = '23503';
  end if;

  -- impl-review F2 (S-04): derived, not trusted. The endpoint already read this from the profile,
  -- but the function is the boundary — it is SECURITY DEFINER and callable straight over PostgREST,
  -- so a direct call could otherwise file a request claiming a district the client does not live
  -- in and the specialist does not serve. `p_area_id` is kept in the signature and ignored.
  select c.area_id into v_area from public.client_profiles c where c.id = v_client;
  if v_area is null then
    raise exception 'client has no saved district' using errcode = '23502';
  end if;

  -- impl-review F1 (S-05). See the header. Only this pair, only already-lapsed rows.
  update public.bookings
     set status = 'expired', resolved_by = 'system'
   where client_id = v_client
     and specialist_id = p_specialist_id
     and status = 'pending'
     and expires_at <= now();

  v_expires := least(now() + interval '48 hours', p_proposed_at);

  insert into public.bookings (
    client_id, specialist_id, service_id,
    category_id, subtype_id, service_name, price_cents, duration_minutes,
    area_id, proposed_at, expires_at
  ) values (
    v_client, p_specialist_id, p_service_id,
    v_service.category_id, v_service.subtype_id, v_service.name, v_service.price_cents, v_service.duration_minutes,
    v_area, p_proposed_at, v_expires
  )
  returning id into v_booking;

  insert into public.booking_contact_details (booking_id, first_name, last_name, phone, street, postal_code, note)
  values (v_booking, p_first_name, p_last_name, p_phone, p_street, p_postal_code, p_note);

  return v_booking;
end $$;

comment on function public.request_booking is
  'The only way to create a booking. Writes public.bookings and public.booking_contact_details in '
  'one statement so a request can never exist without the address it needs. Expires this pair''s '
  'own lapsed pending row first, so a client whose screen says "wygasła" is not refused by '
  'bookings_one_pending_per_pair until the cron catches up (S-05 impl-review F1). SECURITY DEFINER '
  'with a pinned search_path and an explicit auth.uid() check — both are load-bearing.';
