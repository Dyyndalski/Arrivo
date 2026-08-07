-- S-04: the booking request, and the privacy contract that has been waiting for it.
--
-- 20260804120100_client_profiles.sql records that a specialist cannot read a client's address,
-- and that the policy which would change that "is deliberately absent until the bookings table
-- exists to scope it". This migration is that scope.
--
-- THE CENTRAL CONSTRAINT: Postgres RLS grants whole ROWS. A specialist must be able to read a
-- booking to know a request exists at all, so the address cannot live in that row. Column-level
-- GRANTs exist but are static — they cannot depend on `status`, so hiding the address that way
-- would also hide it AFTER acceptance, which is the one moment it must appear. Hence two tables:
--
--   public.bookings                 — what a specialist may see while DECIDING
--   public.booking_contact_details  — what they may see only once they have ACCEPTED
--
-- `public.client_profiles` is untouched by this migration and stays closed to everyone but its
-- owner. A specialist never reads it; they read the snapshot on the booking.

-- ---------------------------------------------------------------------------
-- The whole lifecycle, defined now.
--
-- S-04 only ever writes 'pending'. The rest exist because the contact-details policy below has to
-- reference 'accepted' — the same coupling that made this policy impossible to write in S-03.
-- Growing an enum later means `alter type` against a live database; the four unused values cost
-- nothing.
-- ---------------------------------------------------------------------------
create type public.booking_status as enum ('pending', 'accepted', 'declined', 'expired', 'completed');

-- ---------------------------------------------------------------------------
-- The request.
--
-- Everything here is visible to the addressed specialist while the request is pending. Nothing
-- here identifies the client: the coarse area is the matching unit S-03 already exposes publicly,
-- and the service snapshot is the specialist's own data reflected back.
-- ---------------------------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),

  client_id uuid not null references public.profiles (id) on delete cascade,
  specialist_id uuid not null references public.specialist_profiles (id) on delete cascade,

  -- The live row, when it still exists. `set null` rather than cascade: a specialist tidying
  -- their price list must not silently delete somebody's booking. The snapshot below is what the
  -- booking actually means.
  service_id uuid references public.services (id) on delete set null,

  -- Service snapshot, taken at submission. Stored as the PIECES, not as a rendered string: the
  -- dictionaries carry `name_en`, so freezing "Fryzjerstwo damskie" here would pin the booking to
  -- one language forever. Dictionary rows are migration-only, so these ids stay resolvable.
  category_id smallint not null references public.service_categories (id) on delete restrict,
  subtype_id smallint references public.service_subtypes (id) on delete restrict,
  -- The specialist's own wording for the service, if they gave one.
  service_name text check (service_name is null or (char_length(service_name) between 2 and 80 and service_name = btrim(service_name))),
  price_cents integer not null check (price_cents > 0),
  duration_minutes smallint check (duration_minutes is null or duration_minutes between 15 and 600),

  -- The coarse location. Safe for the specialist to see before accepting — it is exactly what
  -- discovery already publishes, and it is what they need to judge whether they travel there.
  area_id smallint not null references public.service_areas (id) on delete restrict,

  proposed_at timestamptz not null,

  -- The EARLIER of (created_at + 48h) and proposed_at. Same-day bookings are allowed, and a
  -- request cannot meaningfully outlive the moment it proposes — a "will reply within 48 hours"
  -- promise on a visit two hours away is a promise about a slot that has already passed.
  -- S-05's cron acts on this column; S-04 only computes it.
  expires_at timestamptz not null,

  -- One logistical note, written once, never replied to. PRD Non-Goals rules out chat; "ring
  -- doorbell 12" has no other channel in v1 and is not a thread.
  note text check (note is null or (char_length(note) between 1 and 500 and note = btrim(note))),

  status public.booking_status not null default 'pending',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

create index bookings_client_id_idx on public.bookings (client_id);
create index bookings_specialist_id_idx on public.bookings (specialist_id);
-- S-05's expiry cron scans this.
create index bookings_pending_expiry_idx on public.bookings (expires_at) where status = 'pending';

-- One live request per client-specialist pair. Nothing costs anything in v1 — no payment, no
-- verification — so the database is what stops a client filling a specialist's inbox. A declined
-- or expired request frees the pair immediately.
create unique index bookings_one_pending_per_pair
  on public.bookings (client_id, specialist_id)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- The half that is private until acceptance.
--
-- This is the table the PRD's launch guardrail is about: "client home addresses are never
-- publicly exposed — visible only to a specialist whose booking the client has accepted."
--
-- Bounds mirror public.client_profiles, because the values are copied from it.
-- ---------------------------------------------------------------------------
create table public.booking_contact_details (
  booking_id uuid primary key references public.bookings (id) on delete cascade,

  first_name text check (first_name is null or (char_length(first_name) between 1 and 60 and first_name = btrim(first_name))),
  last_name text check (last_name is null or (char_length(last_name) between 1 and 60 and last_name = btrim(last_name))),
  phone text check (phone is null or (char_length(phone) between 6 and 24 and phone = btrim(phone))),
  street text not null check (char_length(street) between 2 and 120 and street = btrim(street)),
  postal_code text check (postal_code is null or postal_code ~ '^\d{2}-\d{3}$'),

  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Access.
-- ---------------------------------------------------------------------------
alter table public.bookings enable row level security;
alter table public.booking_contact_details enable row level security;

revoke all on public.bookings from anon, authenticated;
revoke all on public.booking_contact_details from anon, authenticated;

-- No anon grant on either: browsing listings is public (PRD Access Control), bookings are not.
grant select on public.bookings to authenticated;
grant select on public.booking_contact_details to authenticated;

-- No INSERT grant. Both rows are written by public.request_booking() below, which is the only way
-- to create a booking without leaving one of the two tables empty. No UPDATE or DELETE grant
-- either — S-05 adds the transition policies when it has transitions to make.

create policy "bookings_select_own_client"
  on public.bookings for select to authenticated
  using (client_id = (select auth.uid()));

create policy "bookings_select_addressed_specialist"
  on public.bookings for select to authenticated
  using (specialist_id = (select auth.uid()));

create policy "booking_contact_details_select_own_client"
  on public.booking_contact_details for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.client_id = (select auth.uid())
    )
  );

-- THE GUARDRAIL. The `status = 'accepted'` term is the whole point: without it a specialist reads
-- the client's street and phone the moment a request lands, which the PRD calls a regression "even
-- if every other metric holds". Do not relax this into `using (true)` the way every public table
-- in this project is written — this one is not one of them.
create policy "booking_contact_details_select_accepted_specialist"
  on public.booking_contact_details for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.specialist_id = (select auth.uid())
        and b.status = 'accepted'
    )
  );

-- ---------------------------------------------------------------------------
-- Atomic submission.
--
-- PostgREST has no cross-request transaction. Two independent inserts mean a booking whose
-- contact details failed is a request a specialist can accept and then have nowhere to travel to.
--
-- SECURITY DEFINER bypasses RLS by design, so two things are load-bearing:
--   * `set search_path = ''` — without it a caller can shadow `public` and have this function
--     write somewhere else with the definer's rights.
--   * the auth.uid() check — without it this function is a way to create a booking as ANY client,
--     which is a hole straight through every policy above.
-- ---------------------------------------------------------------------------
create function public.request_booking(
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
begin
  if v_client is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- The role gate. RLS on the tables above cannot express it, because this function runs as the
  -- definer; the check has to be here.
  if not exists (select 1 from public.profiles p where p.id = v_client and p.role = 'client') then
    raise exception 'only a client can request a booking' using errcode = '42501';
  end if;

  -- The service must belong to the specialist being booked, and that specialist must actually be
  -- discoverable — a card that clients cannot find must not be bookable by URL either.
  select * into v_service from public.services s
   where s.id = p_service_id and s.specialist_id = p_specialist_id;
  if not found then
    raise exception 'service does not belong to that specialist' using errcode = '23503';
  end if;

  if not exists (select 1 from public.discoverable_specialists d where d.id = p_specialist_id) then
    raise exception 'specialist is not discoverable' using errcode = '23503';
  end if;

  v_expires := least(now() + interval '48 hours', p_proposed_at);

  insert into public.bookings (
    client_id, specialist_id, service_id,
    category_id, subtype_id, service_name, price_cents, duration_minutes,
    area_id, proposed_at, expires_at, note
  ) values (
    v_client, p_specialist_id, p_service_id,
    v_service.category_id, v_service.subtype_id, v_service.name, v_service.price_cents, v_service.duration_minutes,
    p_area_id, p_proposed_at, v_expires, p_note
  )
  returning id into v_booking;

  insert into public.booking_contact_details (booking_id, first_name, last_name, phone, street, postal_code)
  values (v_booking, p_first_name, p_last_name, p_phone, p_street, p_postal_code);

  return v_booking;
end $$;

revoke all on function public.request_booking(uuid, uuid, timestamptz, text, text, text, text, text, text, smallint) from public, anon;
grant execute on function public.request_booking(uuid, uuid, timestamptz, text, text, text, text, text, text, smallint) to authenticated;

comment on function public.request_booking is
  'The only way to create a booking. Writes public.bookings and public.booking_contact_details in '
  'one statement so a request can never exist without the address it needs. SECURITY DEFINER with '
  'a pinned search_path and an explicit auth.uid() check — both are load-bearing, not decoration.';

-- ---------------------------------------------------------------------------
-- service_role: deliberately NOT granted on either table (context/foundation/lessons.md).
--
-- S-05's auto-expire cron is the first thing that will run without a user session, and it needs
-- UPDATE on public.bookings.status — nothing here. It should get that grant, or a dedicated
-- SECURITY DEFINER function, in the migration that introduces it, and it must NOT be given any
-- access to booking_contact_details: a job that flips a status has no business reading addresses.
-- ---------------------------------------------------------------------------
