-- S-03: the four listing fields the mockups show that no FR asked for. Accepted during planning
-- (see context/changes/area-matched-discovery/change.md) — three of them land here, the client's
-- contact details landed with client_profiles.
--
-- Every one is nullable. Specialists onboarded under S-02 already have cards and services, and a
-- NOT NULL column would either invalidate their rows or force a made-up default onto them.

-- ---------------------------------------------------------------------------
-- Bio (FR-015, demoted to nice-to-have in the PRD).
--
-- Without it the mockup's profile header is an empty box and the discovery cards are
-- indistinguishable from each other — name, stars, price and nothing else. It is the only place
-- a specialist says anything in their own words; v1 has no chat and no free-text reviews.
-- ---------------------------------------------------------------------------
alter table public.specialist_profiles
  add column bio text
  check (bio is null or (char_length(bio) between 1 and 600 and bio = btrim(bio)));

-- ---------------------------------------------------------------------------
-- Service duration and custom name.
--
-- `name` SUPPLEMENTS the taxonomy, it does not replace it: category_id stays NOT NULL because
-- FR-007's type filter has to stay reliable across specialists, which is the whole reason FR-005
-- chose a fixed taxonomy over free text. A specialist may call a service "Koloryzacja + odżywka";
-- it is still filterable as Fryzjerstwo damskie.
--
-- Duration is bounded at 15 minutes and 10 hours. The lower bound rejects a stray "1" meant as
-- an hour; the upper one keeps a typo from proposing a two-day visit in S-04, where the client
-- proposes a time and needs to know what window they are giving up.
-- ---------------------------------------------------------------------------
alter table public.services
  add column name text
  check (name is null or (char_length(name) between 2 and 80 and name = btrim(name)));

alter table public.services
  add column duration_minutes smallint
  check (duration_minutes is null or duration_minutes between 15 and 600);
