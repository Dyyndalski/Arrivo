-- F-01: auto-create a profile when an auth user is created.
-- The role comes from client-controlled sign-up metadata, so it is validated against the
-- allowed set BEFORE casting (never cast-and-hope); absent/empty/unrecognized -> 'client'.
-- Trigger fires AFTER INSERT ON auth.users, so the profile exists even before email
-- confirmation (the users row is created at sign-up time).

create function public.handle_new_user() returns trigger
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
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
