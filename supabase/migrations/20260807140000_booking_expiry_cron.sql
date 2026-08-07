-- S-05: the scheduled half of the expiry defence.
--
-- WHY THIS IS NOT A CLOUDFLARE CRON TRIGGER, which is what context/foundation/infrastructure.md
-- planned (its step 5: "add a [triggers] crons entry in wrangler.jsonc plus a scheduled() handler"):
--
--   1. `@astrojs/cloudflare@14.1.5` has no `workerEntryPoint` option, and `wrangler.jsonc` points
--      `main` straight at node_modules/@astrojs/cloudflare/entrypoints/server, whose entire content
--      is `{ fetch: handle }`. Adding `scheduled()` means repointing `main` at a hand-written entry
--      importing `@astrojs/cloudflare/handler` — changing a build path that currently works, for a
--      job that touches one column.
--   2. A Worker has no user session, so it would reach Postgres as `service_role` — the role that
--      carries BYPASSRLS and whose legacy JWT for this project was exposed on 2026-08-07. That key
--      would then need to exist in Worker secrets.
--   3. Cron Triggers are capped at 3 per Worker and infrastructure.md itself records a Cloudflare
--      cron outage on 2026-07-08 that would silently skip runs.
--
-- Running it here removes all three. The function executes inside Postgres as its owner; there is
-- no key to store, leak, or rotate, and the schedule is versioned in this migration rather than in
-- a dashboard. infrastructure.md is amended in the same commit so the two stop disagreeing.

create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- The job.
--
-- Narrow on purpose. It reads and writes exactly two columns of rows that are already `pending` and
-- already past their own `expires_at`. It does NOT:
--   * recompute the 48-hour rule — `expires_at` is the earlier of (created_at + 48h) and
--     proposed_at, and recomputing here would silently extend same-day requests;
--   * touch `accepted` — an accepted visit nobody closed is a different problem with a different
--     answer (the specialist's inbox nags; see the plan's "What We're NOT Doing");
--   * read public.booking_contact_details, which it has no business seeing. A job that flips a
--     status does not need anyone's address.
--
-- Idempotent by construction: after it runs, the `status = 'pending'` predicate excludes every row
-- it just touched, so an immediate second call affects zero rows. That matters because a missed run
-- followed by two catch-up runs must not do anything different from one run.
--
-- The returned count is what makes a missed run visible in cron.job_run_details.
-- ---------------------------------------------------------------------------
create function public.expire_stale_bookings() returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired integer;
begin
  update public.bookings
     set status = 'expired', resolved_by = 'system'
   where status = 'pending'
     and expires_at <= now();

  get diagnostics v_expired = row_count;
  return v_expired;
end $$;

-- Nobody calls this from the application. The cron job runs it as the role that scheduled it, so no
-- grant is needed for it to work — and without a grant, a signed-in user cannot invoke it to expire
-- somebody else's request early.
revoke all on function public.expire_stale_bookings() from public, anon, authenticated;

comment on function public.expire_stale_bookings is
  'Flips pending bookings past their expires_at to expired/system. Idempotent; returns the number '
  'of rows changed. Scheduled by pg_cron every 15 minutes. Never touches accepted bookings and '
  'never reads booking_contact_details.';

-- ---------------------------------------------------------------------------
-- The schedule.
--
-- Every 15 minutes, not daily. `expires_at` is the EARLIER of created_at + 48h and proposed_at, so
-- a request for a visit two hours away expires in two hours — a daily job would let it sit
-- `pending` in the table for most of a day. That gap is not cosmetic: bookings_view already shows
-- the client "wygasłe", but bookings_one_pending_per_pair reads the STORED status, so until this
-- job runs the client still cannot request that specialist again.
--
-- The unschedule guard makes this migration replayable — `supabase db reset` runs it again, and
-- cron.schedule on an existing jobname would otherwise fail.
-- ---------------------------------------------------------------------------
select cron.unschedule('expire-stale-bookings')
 where exists (select 1 from cron.job where jobname = 'expire-stale-bookings');

select cron.schedule(
  'expire-stale-bookings',
  '*/15 * * * *',
  $job$select public.expire_stale_bookings()$job$
);
