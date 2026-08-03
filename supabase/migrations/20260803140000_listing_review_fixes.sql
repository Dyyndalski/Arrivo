-- S-02 impl-review fixes (F5, F6). Forward-only: the two migrations these amend are already
-- applied on hosted, so they are amended here rather than edited in place.

-- ---------------------------------------------------------------------------
-- F5: make every dictionary reference behave the same way.
-- service_subtypes.category_id was the lone `on delete cascade` among otherwise-restricting
-- references. Deleting a category would have tried to cascade its subtypes and then been
-- blocked by the restrict from public.services — safe, but it would surface as a confusing
-- error about the wrong table. Dictionaries are migration-only and v1 has no admin role, so
-- this is prophylactic, not a live bug.
-- ---------------------------------------------------------------------------
alter table public.service_subtypes
  drop constraint service_subtypes_category_id_fkey;

alter table public.service_subtypes
  add constraint service_subtypes_category_id_fkey
  foreign key (category_id) references public.service_categories (id) on delete restrict;

-- ---------------------------------------------------------------------------
-- F6: reject untrimmed names instead of storing them.
-- The original CHECK validated char_length(btrim(display_name)), so '  Ala  ' passed and was
-- persisted with its padding. Phase 2 will trim in zod, which covers the app path — but
-- PostgREST is reachable directly, and in this slice the database is the boundary that has to
-- hold everywhere else. Safe to add unvalidated-free: no rows exist yet on any environment.
-- ---------------------------------------------------------------------------
alter table public.specialist_profiles
  add constraint specialist_profiles_display_name_trimmed
  check (display_name = btrim(display_name));

-- ---------------------------------------------------------------------------
-- F3 (documentation only, no DDL): the child tables — specialist_areas, services — carry no
-- role check of their own. They inherit it transitively, because a row in specialist_profiles
-- cannot exist unless the role check on that table passed. The consequence matters for the
-- app layer: a client-role account writing straight to public.services is refused by the
-- FOREIGN KEY (SQLSTATE 23503), not by a policy (42501). Error mapping in Phase 2 must treat
-- 23503 on this path as "not allowed" rather than surfacing it as a database fault.
-- Asserted in supabase/tests/database/specialist_listing_rls.test.sql.
-- ---------------------------------------------------------------------------
