-- Harden handle_new_user (impl-review F2 + F3).
-- F2: make the insert idempotent — a replayed/duplicate auth.users insert (or any future
--     pre-create flow) must not raise unique_violation and abort sign-up. Matches the
--     backfill in ..._profiles_roles_rls.sql, which already uses on conflict do nothing.
-- F3: pin the privilege invariant. `role` here is CLIENT-CONTROLLED sign-up metadata, so a
--     user can self-assign any value in user_role. This is safe ONLY while no user_role
--     value is privileged (today: client/specialist are peers, no admin). If a privileged
--     role is ever added to public.user_role, it MUST be gated OUT of this metadata path —
--     never let it be self-assigned here.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role)
  values (
    new.id,
    case
      when new.raw_user_meta_data ->> 'role' in ('client', 'specialist')
      then (new.raw_user_meta_data ->> 'role')::user_role
      else 'client'::user_role
    end
  )
  on conflict (id) do nothing;
  return new;
end $$;
