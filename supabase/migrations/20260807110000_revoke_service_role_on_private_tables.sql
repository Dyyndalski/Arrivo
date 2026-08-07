-- S-04: close the hole the privacy guardrail had on hosted but not locally.
--
-- WHAT WAS WRONG. 20260807100000_bookings.sql states that `service_role` is "deliberately NOT
-- granted" on the booking tables, and context/foundation/lessons.md records that `service_role`
-- holds "only REFERENCES,TRIGGER,TRUNCATE — no SELECT/INSERT/UPDATE/DELETE". Both were measured
-- against the LOCAL stack, and both are false on the hosted project:
--
--   $ supabase db diff --linked --schema public
--   grant select on table "public"."booking_contact_details" to "service_role";
--   grant select on table "public"."client_profiles" to "service_role";
--   … and insert/update/delete, on every table in the schema.
--
-- Supabase's hosted projects carry `ALTER DEFAULT PRIVILEGES … GRANT ALL … TO service_role` for
-- the public schema, so every table created by a migration picks the grants up automatically.
-- `supabase start` does not reproduce that, which is why the difference stayed invisible: the
-- local pgTAP suite proves a boundary that production does not have.
--
-- WHY IT MATTERS. `service_role` is created with BYPASSRLS:
--
--   select rolname, rolbypassrls from pg_roles where rolname = 'service_role';  -- t
--
-- So the `status = 'accepted'` term in booking_contact_details_select_accepted_specialist — the
-- one clause the PRD's launch guardrail rests on — does not apply to that role at all. Anything
-- holding the service_role key reads every client address on production.
--
-- WHY REVOKE FIXES IT. BYPASSRLS skips POLICIES, not table PRIVILEGES. A role with no SELECT
-- privilege cannot read the table however many policies it bypasses. Revoking is therefore a
-- real boundary rather than a second policy that the same role would also ignore.
--
-- SCOPE. Only the two tables that hold personal data. `public.bookings` keeps its grants on
-- purpose: S-05's auto-expire cron runs without a user session and needs UPDATE on `status`.
-- A job that flips a status has no business reading addresses, which is exactly the line drawn
-- here.

revoke all on public.booking_contact_details from service_role;
revoke all on public.client_profiles from service_role;

-- Default privileges would re-grant on any FUTURE table in this schema, so this revoke is not a
-- one-time cleanup — it must be repeated for every new table holding personal data. See the
-- updated rule in context/foundation/lessons.md.

comment on table public.booking_contact_details is
  'Client address and contact details for one booking. Readable by the client who owns it, and by '
  'the addressed specialist ONLY once the booking is accepted. service_role is explicitly revoked '
  '(20260807110000) because it holds BYPASSRLS and Supabase''s hosted default privileges would '
  'otherwise grant it full DML. Do not grant it back.';

comment on table public.client_profiles is
  'The client''s saved area and contact details. Own-row access only; no public read of any kind. '
  'service_role is explicitly revoked (20260807110000) for the same reason as '
  'booking_contact_details. Do not grant it back.';
