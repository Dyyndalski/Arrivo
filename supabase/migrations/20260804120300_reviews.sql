-- S-03: the READ side of the trust rating. FR-009 puts a star summary on the specialist profile
-- and FR-014 gates the average behind a minimum number of ratings; discovery needs somewhere to
-- read those from on day one.
--
-- There is deliberately NO write path. FR-013's rule — "only a client with a booking in
-- 'completed' state for that specialist can submit a rating, one rating per completed booking" —
-- is expressible only against public.bookings, which S-05 creates. Writing an insert policy now
-- would mean either inventing a weaker rule and having to tighten it later (a window where
-- ratings can be forged) or writing a policy against a table that does not exist.
--
-- S-06 adds, in one migration: `booking_id uuid not null references public.bookings`, a unique
-- constraint on it, the insert grant, and the insert policy. The table stays empty until then,
-- so every specialist shows FR-014's "New specialist" label — which is the correct answer for a
-- marketplace with no completed visits yet.

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  specialist_id uuid not null references public.specialist_profiles (id) on delete cascade,

  -- References profiles, not client_profiles: a client can rate a visit without ever having
  -- saved an address row, and the rating must survive if they later clear their profile.
  client_id uuid not null references public.profiles (id) on delete cascade,

  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now()
);

-- The aggregate in discoverable_specialists groups by this.
create index reviews_specialist_id_idx on public.reviews (specialist_id);

-- ---------------------------------------------------------------------------
-- Access: public read, no write for anybody.
--
-- Read is public because the aggregate is public — FR-014 shows an average on a profile that
-- unauthenticated visitors may browse (PRD Access Control). Individual rows carry a rating and a
-- client id and no free text; v1 has no review bodies (FR-009 defers them to v2 pending a
-- moderation path that has no owner).
--
-- The absence of an insert grant is the enforcement, not an oversight. Do not add one without
-- the booking-completed check from FR-013.
--
-- service_role: deliberately NOT granted (context/foundation/lessons.md). Nothing writes ratings
-- without a user session — a rating is an act by a specific client — and the aggregate is read
-- through discoverable_specialists under the caller's own rights. S-06 must decide again when it
-- opens the write path, and its insert policy needs BOTH the completed-booking check from FR-013
-- and a role check: client_id references public.profiles, which holds specialists too, so
-- nothing in this schema currently stops a specialist id from landing in that column.
-- ---------------------------------------------------------------------------
alter table public.reviews enable row level security;

revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to anon, authenticated;

create policy "reviews_select_all"
  on public.reviews for select to anon, authenticated using (true);
