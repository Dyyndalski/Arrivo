-- S-04 impl-review F1: move `note` to the side of the split it belongs on.
--
-- The two-table design exists because RLS grants whole ROWS: anything a specialist may not see
-- before accepting had to live off `public.bookings`. Street, postal code, phone and name were
-- moved. `note` was not — and it is the one field on `bookings` whose contents the CLIENT types.
--
-- The mockup's own placeholder is "proszę o dzwonek do domofonu 12". A client writing in that
-- spirit puts "trzecie piętro, Kwiatowa 12" in it, which is the address, visible before
-- acceptance, through the field this slice added. A phone number fits just as easily.
--
-- The policies were never wrong; the shape was. After this migration the invariant is one a
-- reader can check in a sentence: everything the client typed is behind acceptance.
--
-- Cost, accepted deliberately: a specialist now decides without logistical context ("fourth floor,
-- no lift"). That was one of the options weighed when the field was designed; the privacy
-- consequence was not yet visible then.
--
-- Forward-only, and safe to do as a plain move: no environment has a booking yet (S-04 deployed
-- today and nothing but throwaway fixtures has been written), so there is nothing to migrate. If
-- that ever stops being true, this becomes a copy-then-drop.

alter table public.booking_contact_details
  add column note text
  check (note is null or (char_length(note) between 1 and 500 and note = btrim(note)));

alter table public.bookings drop column note;

comment on column public.booking_contact_details.note is
  'One logistical note from the client, written once at request time and revealed with the '
  'address it may contain (S-04 impl-review F1). Not a message thread — PRD Non-Goals rules out '
  'chat. Do not move this back onto public.bookings.';

-- ---------------------------------------------------------------------------
-- The function writes it to the new home.
-- ---------------------------------------------------------------------------
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

  -- impl-review F2: derived, not trusted. The endpoint already read this from the profile, but
  -- the function is the boundary — it is SECURITY DEFINER and callable straight over PostgREST,
  -- so a direct call could otherwise file a request claiming a district the client does not live
  -- in and the specialist does not serve. That is the field the whole area match rests on.
  -- `p_area_id` is kept in the signature so the call site does not change, and ignored.
  select c.area_id into v_area from public.client_profiles c where c.id = v_client;
  if v_area is null then
    raise exception 'client has no saved district' using errcode = '23502';
  end if;

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
