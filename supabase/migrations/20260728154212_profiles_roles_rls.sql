-- F-01: domain roles + profiles foundation (schema + RLS)
-- Roles + the address-privacy pattern only; entities (services, bookings, reviews)
-- belong to later slices. See context/changes/domain-data-rls-foundation/plan.md.

-- Role enum (client | specialist).
create type public.user_role as enum ('client', 'specialist');

-- Profile, 1:1 with auth.users.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'client',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Row-Level Security: own-row read isolation only.
-- No end-user write path exists — the SECURITY DEFINER trigger (next migration) is the
-- sole writer, which is what makes `role` immutable by users (privilege boundary).
alter table public.profiles enable row level security;

-- Lock table privileges: authenticated may only SELECT; anon gets nothing.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

-- Read policy: a user sees only their own profile row.
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

-- Backfill: every pre-existing auth user gets a default (client) profile.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;
