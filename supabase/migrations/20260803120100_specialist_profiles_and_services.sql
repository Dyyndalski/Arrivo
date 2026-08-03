-- S-02: the specialist's card, declared areas, and priced services.
--
-- Design note (load-bearing): specialist data lives in its OWN table keyed 1:1 to
-- public.profiles, not in new columns on public.profiles. F-01 deliberately left profiles
-- with no user write path at all (`revoke all` + `grant select` only) — that absence is the
-- mechanism making `role` non-escalatable, and supabase/tests/database/profiles_rls.test.sql
-- asserts it. Adding columns here would force granting UPDATE on profiles and then excluding
-- `role` by policy, trading a structural guarantee for one that has to be written correctly.
-- Do not merge these tables back into profiles.

-- ---------------------------------------------------------------------------
-- Timestamp hygiene: rows here are genuinely updated (unlike profiles, which nobody writes),
-- so updated_at needs a keeper. Without this the column would silently freeze at insert time.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- The specialist's public card.
-- ---------------------------------------------------------------------------
create table public.specialist_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger specialist_profiles_set_updated_at
  before update on public.specialist_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Declared service areas (M:N). Editing a selection is delete + insert, so there is
-- deliberately no UPDATE path and no surrogate key.
-- ---------------------------------------------------------------------------
create table public.specialist_areas (
  specialist_id uuid not null references public.specialist_profiles (id) on delete cascade,
  area_id smallint not null references public.service_areas (id) on delete restrict,
  primary key (specialist_id, area_id)
);

-- Reverse lookup: "who serves this area" is exactly S-03's matching query.
create index specialist_areas_area_id_idx on public.specialist_areas (area_id);

-- ---------------------------------------------------------------------------
-- Services. Price is integer grosze — never floating point for money. Currency is
-- implicitly PLN in v1, so no column for it.
--
-- The composite FK is what enforces "subtype must belong to the chosen category"; a CHECK
-- constraint cannot reach another table. With subtype_id NULL the composite FK is not
-- enforced at all (MATCH SIMPLE), which is precisely the wanted "subtype optional" behaviour.
-- ---------------------------------------------------------------------------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  specialist_id uuid not null references public.specialist_profiles (id) on delete cascade,
  category_id smallint not null references public.service_categories (id) on delete restrict,
  subtype_id smallint,
  price_cents integer not null check (price_cents > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (subtype_id, category_id)
    references public.service_subtypes (id, category_id) on delete restrict
);

create index services_specialist_id_idx on public.services (specialist_id);
create index services_category_id_idx on public.services (category_id);

create trigger services_set_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Access control.
--
-- Read: public (anon + authenticated). PRD Access Control lets unauthenticated visitors
-- browse specialist listings; S-03 consumes this without needing to touch RLS again.
-- None of these tables holds a client address — F-01's privacy contract is untouched.
--
-- Write: owner-only AND role-checked. The role check lives in `with check` (a subquery
-- against profiles) because a CHECK constraint cannot read another table. The app also
-- gates the routes, but this policy is the boundary that actually has to hold: a client-role
-- account calling PostgREST directly is refused here.
-- ---------------------------------------------------------------------------
alter table public.specialist_profiles enable row level security;
alter table public.specialist_areas enable row level security;
alter table public.services enable row level security;

revoke all on public.specialist_profiles from anon, authenticated;
revoke all on public.specialist_areas from anon, authenticated;
revoke all on public.services from anon, authenticated;

grant select on public.specialist_profiles to anon, authenticated;
grant select on public.specialist_areas to anon, authenticated;
grant select on public.services to anon, authenticated;

grant insert, update on public.specialist_profiles to authenticated;
grant insert, delete on public.specialist_areas to authenticated;
grant insert, update, delete on public.services to authenticated;

-- Public read.
create policy "specialist_profiles_select_all"
  on public.specialist_profiles for select to anon, authenticated using (true);

create policy "specialist_areas_select_all"
  on public.specialist_areas for select to anon, authenticated using (true);

create policy "services_select_all"
  on public.services for select to anon, authenticated using (true);

-- Owner + specialist-role writes on the card. No DELETE policy: account deletion cascades,
-- and v1 has no in-app "remove my card" path.
create policy "specialist_profiles_insert_own"
  on public.specialist_profiles for insert to authenticated
  with check (
    id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'specialist'
    )
  );

create policy "specialist_profiles_update_own"
  on public.specialist_profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'specialist'
    )
  );

-- Children inherit the role gate transitively: their specialist_id must equal auth.uid(),
-- and a row in specialist_profiles with that id can only exist if the role check passed.
create policy "specialist_areas_insert_own"
  on public.specialist_areas for insert to authenticated
  with check (specialist_id = (select auth.uid()));

create policy "specialist_areas_delete_own"
  on public.specialist_areas for delete to authenticated
  using (specialist_id = (select auth.uid()));

create policy "services_insert_own"
  on public.services for insert to authenticated
  with check (specialist_id = (select auth.uid()));

create policy "services_update_own"
  on public.services for update to authenticated
  using (specialist_id = (select auth.uid()))
  with check (specialist_id = (select auth.uid()));

create policy "services_delete_own"
  on public.services for delete to authenticated
  using (specialist_id = (select auth.uid()));
