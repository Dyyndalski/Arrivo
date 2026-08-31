-- LOCAL DEVELOPMENT FIXTURES. Applied automatically by `npx supabase db reset`.
--
-- This file NEVER reaches a hosted project: `supabase db push` pushes migrations only. Nothing
-- here is a schema change, and nothing here may become one — if a demo needs a new column, that
-- belongs in supabase/migrations/.
--
-- Why it exists: the discovery cards and the trust rating (FR-014) are only meaningful against a
-- spread of ratings, and a reset wipes everything. Re-seeding by hand each time is how a manual
-- pass ends up testing one specialist with one rating.
--
-- WHAT IS DELIBERATELY NOT HERE: bookings belonging to a real signed-up account. A reset drops
-- auth.users too, so the account you sign up with gets a new id every time and any booking keyed
-- to the old one would fail its foreign key. Sign up, then attach demo visits to that account
-- separately.
--
-- These users cannot sign in. They have no password — the rows exist so the foreign keys resolve.

-- ---------------------------------------------------------------------------
-- Specialists.
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','fa000000-0000-0000-0000-0000000000f1','authenticated','authenticated','spec-marta@test.local','{}','{"role":"specialist"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','fa000000-0000-0000-0000-0000000000f2','authenticated','authenticated','spec-anna@test.local','{}','{"role":"specialist"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','fa000000-0000-0000-0000-0000000000f3','authenticated','authenticated','spec-julia@test.local','{}','{"role":"specialist"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','fa000000-0000-0000-0000-0000000000f4','authenticated','authenticated','spec-kasia@test.local','{}','{"role":"specialist"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','fa000000-0000-0000-0000-0000000000f5','authenticated','authenticated','spec-paulina@test.local','{}','{"role":"specialist"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','fa000000-0000-0000-0000-0000000000f6','authenticated','authenticated','spec-ewa@test.local','{}','{"role":"specialist"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','fa000000-0000-0000-0000-0000000000f7','authenticated','authenticated','spec-piotr@test.local','{}','{"role":"specialist"}',now(),now())
on conflict (id) do nothing;

insert into public.specialist_profiles (id, display_name, bio) values
  ('fa000000-0000-0000-0000-0000000000f1','Marta Kowalczyk','Fryzjerstwo z dojazdem. Mokotow, Srodmiescie i Wola.'),
  ('fa000000-0000-0000-0000-0000000000f2','Anna Nowak','Paznokcie i stylizacja dloni. Dojazd na Mokotow, Ursynow i Wilanow.'),
  ('fa000000-0000-0000-0000-0000000000f3','Julia Wisniewska','Makijaz okazjonalny i slubny. Pracuje na kosmetykach hipoalergicznych.'),
  ('fa000000-0000-0000-0000-0000000000f4','Katarzyna Zielinska','Kosmetyka twarzy z dojazdem. Oczyszczanie, peelingi, masaz.'),
  ('fa000000-0000-0000-0000-0000000000f5','Paulina Mazur','Fryzjerstwo damskie od 12 lat. Koloryzacja i pielegnacja wlosow.'),
  ('fa000000-0000-0000-0000-0000000000f6','Ewa Dabrowska','Depilacja woskiem i pasta cukrowa. Dojazd na cala lewobrzezna Warszawe.'),
  ('fa000000-0000-0000-0000-0000000000f7','Piotr Lewandowski','Barber z dojazdem. Strzyzenie brzytwa i pielegnacja brody.')
on conflict (id) do nothing;

-- Warsaw area ids from the taxonomy migration: 4 mokotow, 5 ochota, 6 praga-poludnie,
-- 9 srodmiescie, 12 ursynow, 15 wilanow, 16 wlochy, 17 wola, 18 zoliborz.
insert into public.specialist_areas (specialist_id, area_id) values
  ('fa000000-0000-0000-0000-0000000000f1', 4),  ('fa000000-0000-0000-0000-0000000000f1', 9),  ('fa000000-0000-0000-0000-0000000000f1', 17),
  ('fa000000-0000-0000-0000-0000000000f2', 4),  ('fa000000-0000-0000-0000-0000000000f2', 12), ('fa000000-0000-0000-0000-0000000000f2', 15),
  ('fa000000-0000-0000-0000-0000000000f3', 4),  ('fa000000-0000-0000-0000-0000000000f3', 9),
  ('fa000000-0000-0000-0000-0000000000f4', 4),  ('fa000000-0000-0000-0000-0000000000f4', 5),  ('fa000000-0000-0000-0000-0000000000f4', 17),
  ('fa000000-0000-0000-0000-0000000000f5', 4),  ('fa000000-0000-0000-0000-0000000000f5', 9),  ('fa000000-0000-0000-0000-0000000000f5', 18),
  ('fa000000-0000-0000-0000-0000000000f6', 4),  ('fa000000-0000-0000-0000-0000000000f6', 5),  ('fa000000-0000-0000-0000-0000000000f6', 16), ('fa000000-0000-0000-0000-0000000000f6', 17),
  ('fa000000-0000-0000-0000-0000000000f7', 4),  ('fa000000-0000-0000-0000-0000000000f7', 9),  ('fa000000-0000-0000-0000-0000000000f7', 6)
on conflict do nothing;

insert into public.services (specialist_id, category_id, subtype_id, price_cents, duration_minutes, name)
select v.spec, v.cat, v.sub, v.price, v.mins, v.name
from (values
  ('fa000000-0000-0000-0000-0000000000f1'::uuid, 1::smallint, 3::smallint, 15000, 60::smallint, 'Koloryzacja'),
  ('fa000000-0000-0000-0000-0000000000f1', 1, 1, 12000, 75,  'Pielegnacja i regeneracja'),
  ('fa000000-0000-0000-0000-0000000000f1', 1, 2, 22000, 90,  'Upiecie okolicznosciowe'),
  ('fa000000-0000-0000-0000-0000000000f2', 3, 11, 9000,  60,  'Manicure klasyczny'),
  ('fa000000-0000-0000-0000-0000000000f2', 3, 10, 13000, 90,  'Manicure hybrydowy'),
  ('fa000000-0000-0000-0000-0000000000f2', 3, 9,  11000, 75,  'Pedicure'),
  ('fa000000-0000-0000-0000-0000000000f3', 4, 14, 15000, 60,  'Makijaz dzienny'),
  ('fa000000-0000-0000-0000-0000000000f3', 4, 12, 45000, 120, 'Makijaz slubny z probnym'),
  ('fa000000-0000-0000-0000-0000000000f4', 5, 17, 18000, 75,  'Oczyszczanie manualne'),
  ('fa000000-0000-0000-0000-0000000000f4', 5, 16, 16000, 60,  'Peeling kwasami'),
  ('fa000000-0000-0000-0000-0000000000f4', 5, 15, 14000, 50,  'Masaz twarzy'),
  ('fa000000-0000-0000-0000-0000000000f5', 1, 3,  19000, 150, 'Koloryzacja calosciowa'),
  ('fa000000-0000-0000-0000-0000000000f5', 1, 4,  8000,  45,  'Strzyzenie damskie'),
  ('fa000000-0000-0000-0000-0000000000f5', 1, 1,  13000, 70,  'Pielegnacja keratynowa'),
  ('fa000000-0000-0000-0000-0000000000f6', 6, 19, 12000, 60,  'Woskowanie nog'),
  ('fa000000-0000-0000-0000-0000000000f6', 6, 18, 15000, 75,  'Pasta cukrowa - calosc'),
  ('fa000000-0000-0000-0000-0000000000f7', 2, 7,  7000,  40,  'Strzyzenie meskie'),
  ('fa000000-0000-0000-0000-0000000000f7', 2, 6,  5000,  30,  'Broda i wasy'),
  ('fa000000-0000-0000-0000-0000000000f7', 2, 5,  9000,  50,  'Strzyzenie brzytwa')
) as v(spec, cat, sub, price, mins, name)
where not exists (
  select 1 from public.services s where s.specialist_id = v.spec and s.name = v.name
);

-- ---------------------------------------------------------------------------
-- Rating authors: twelve clients who exist only to own a rating.
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000',
       ('fb000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'authenticated','authenticated','rater-' || n || '@test.local','{}','{"role":"client"}',now(),now()
from generate_series(1, 12) n
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Completed visits and the ratings hanging off them.
--
-- Written directly rather than through public.submit_review: that function reads auth.uid() and
-- these authors have no session. The unique constraint on booking_id still applies, so the
-- one-rating-per-visit rule is respected by the data rather than bypassed.
--
-- The spread covers every branch of ratingLabel() at RATING_THRESHOLD = 3:
--
--   Marta Kowalczyk      0 ratings  -> "Nowy specjalista"; rate three of her visits to flip it
--   Anna Nowak           0 ratings  -> "Nowy specjalista"
--   Julia Wisniewska     2 ratings  -> "Nowy specjalista" despite averaging 4.5 — BELOW the
--                                      threshold is the branch that is easiest to get wrong
--   Katarzyna Zielinska  3 ratings  -> 4.67, the first count that shows a number
--   Piotr Lewandowski    4 ratings  -> 4.25
--   Ewa Dabrowska        5 ratings  -> 3.20, a visibly weak average
--   Paulina Mazur        8 ratings  -> 4.75
-- ---------------------------------------------------------------------------
with spread(spec, author_n, stars, days_ago) as (values
  ('fa000000-0000-0000-0000-0000000000f3'::uuid, 1, 5::smallint, 30),
  ('fa000000-0000-0000-0000-0000000000f3', 2, 4, 24),

  ('fa000000-0000-0000-0000-0000000000f4', 1, 5, 40),
  ('fa000000-0000-0000-0000-0000000000f4', 2, 5, 33),
  ('fa000000-0000-0000-0000-0000000000f4', 3, 4, 21),

  ('fa000000-0000-0000-0000-0000000000f5', 1, 5, 60),
  ('fa000000-0000-0000-0000-0000000000f5', 2, 5, 55),
  ('fa000000-0000-0000-0000-0000000000f5', 3, 5, 48),
  ('fa000000-0000-0000-0000-0000000000f5', 4, 4, 41),
  ('fa000000-0000-0000-0000-0000000000f5', 5, 5, 35),
  ('fa000000-0000-0000-0000-0000000000f5', 6, 4, 28),
  ('fa000000-0000-0000-0000-0000000000f5', 7, 5, 19),
  ('fa000000-0000-0000-0000-0000000000f5', 8, 5, 11),

  ('fa000000-0000-0000-0000-0000000000f6', 1, 3, 50),
  ('fa000000-0000-0000-0000-0000000000f6', 2, 3, 44),
  ('fa000000-0000-0000-0000-0000000000f6', 3, 4, 37),
  ('fa000000-0000-0000-0000-0000000000f6', 4, 2, 26),
  ('fa000000-0000-0000-0000-0000000000f6', 5, 4, 14),

  ('fa000000-0000-0000-0000-0000000000f7', 1, 5, 45),
  ('fa000000-0000-0000-0000-0000000000f7', 2, 4, 38),
  ('fa000000-0000-0000-0000-0000000000f7', 3, 4, 22),
  ('fa000000-0000-0000-0000-0000000000f7', 4, 4,  9)
),
resolved as (
  select sp.spec,
         ('fb000000-0000-0000-0000-0000000000' || lpad(sp.author_n::text, 2, '0'))::uuid as author,
         sp.stars,
         sp.days_ago,
         (select s.category_id from public.services s where s.specialist_id = sp.spec order by s.price_cents limit 1) as cat,
         (select s.price_cents from public.services s where s.specialist_id = sp.spec order by s.price_cents limit 1) as price,
         (select sa.area_id    from public.specialist_areas sa where sa.specialist_id = sp.spec order by sa.area_id limit 1) as area
  from spread sp
),
made as (
  insert into public.bookings (client_id, specialist_id, category_id, price_cents, area_id, proposed_at, expires_at, status, resolved_by)
  select r.author, r.spec, r.cat, r.price, r.area,
         now() - (r.days_ago || ' days')::interval,
         now() - (r.days_ago || ' days')::interval,
         'completed', 'specialist'
  from resolved r
  where not exists (
    select 1 from public.bookings b
    where b.client_id = r.author and b.specialist_id = r.spec
      and b.proposed_at = now() - (r.days_ago || ' days')::interval
  )
  returning id, client_id, specialist_id, proposed_at
)
insert into public.reviews (booking_id, specialist_id, client_id, rating, created_at)
select m.id, m.specialist_id, m.client_id, r.stars, m.proposed_at + interval '3 hours'
from made m
join resolved r
  on r.spec = m.specialist_id
 and r.author = m.client_id
 and m.proposed_at = now() - (r.days_ago || ' days')::interval
on conflict (booking_id) do nothing;
