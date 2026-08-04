-- S-03: the client's saved area (FR-003) and the contact details a specialist needs only after
-- accepting a booking.
--
-- This table is the subject of F-01's privacy contract and the PRD's launch guardrail: "client
-- home addresses are never publicly exposed — visible only to a specialist whose booking the
-- client has accepted. Leakage is a regression even if every other metric holds."
--
-- Accordingly there is NO public read policy of any kind here, unlike every other table this
-- slice touches. S-04 adds the narrow policy that lets a specialist read the row of a client
-- whose booking they accepted; it is deliberately absent until the bookings table exists to
-- scope it, because a policy written against a table that does not exist yet cannot be correct.
--
-- Same structural reason as specialist_profiles for living in its own table rather than as
-- columns on public.profiles: F-01 left profiles with no user write path at all, and that
-- absence is what makes `role` non-escalatable.

create table public.client_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,

  -- The matching key. Nullable because a client exists before they have told us where they live;
  -- discovery treats "no area" as "cannot use the serves-my-area filter", not as an error.
  area_id smallint references public.service_areas (id) on delete restrict,

  -- Everything below is revealed to a specialist only after acceptance (S-04). Nullable for the
  -- same reason: the profile is filled in over time, and S-04 gates a booking on the pieces it
  -- actually needs rather than forcing a complete profile up front.
  first_name text check (first_name is null or (char_length(first_name) between 1 and 60 and first_name = btrim(first_name))),
  last_name text check (last_name is null or (char_length(last_name) between 1 and 60 and last_name = btrim(last_name))),

  -- No format check: v1 has no phone verification, and a strict pattern would reject valid
  -- entries (+48 spacing, foreign numbers) with nothing gained. Bounded and trimmed only.
  phone text check (phone is null or (char_length(phone) between 6 and 24 and phone = btrim(phone))),

  street text check (street is null or (char_length(street) between 2 and 120 and street = btrim(street))),

  -- Polish format. Safe to pin: the area dictionary is Polish cities only, so a postal code that
  -- is not NN-NNN cannot belong to any area a specialist can declare.
  postal_code text check (postal_code is null or postal_code ~ '^\d{2}-\d{3}$'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger client_profiles_set_updated_at
  before update on public.client_profiles
  for each row execute function public.set_updated_at();

-- Reverse lookup for S-04 ("which clients are in this area") and for any future area analytics.
create index client_profiles_area_id_idx on public.client_profiles (area_id);

-- ---------------------------------------------------------------------------
-- Access: own row, for every operation. No anon grant at all — not even SELECT.
--
-- The role check in `with check` mirrors specialist_profiles_insert_own: a specialist-role
-- account has no business holding a client address row, and single-role accounts are the v1
-- model (FR-001).
--
-- No DELETE grant: account deletion cascades from public.profiles, and v1 has no in-app
-- "delete my data" path. Same decision as specialist_profiles.
-- ---------------------------------------------------------------------------
alter table public.client_profiles enable row level security;

revoke all on public.client_profiles from anon, authenticated;
grant select, insert, update on public.client_profiles to authenticated;

create policy "client_profiles_select_own"
  on public.client_profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "client_profiles_insert_own"
  on public.client_profiles for insert to authenticated
  with check (
    id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'client'
    )
  );

create policy "client_profiles_update_own"
  on public.client_profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'client'
    )
  );
