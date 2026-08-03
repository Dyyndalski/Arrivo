-- S-02: fixed vocabularies for specialist listings.
-- Two dictionaries: service areas (Warsaw districts) and a two-level service taxonomy.
-- Reference data — readable by everyone (incl. anon, per PRD Access Control), writable by
-- nobody through the API. Changing these means writing a migration, not calling an endpoint;
-- there is no admin role in v1.

-- ---------------------------------------------------------------------------
-- Service areas (the unit S-03 matches a client against).
-- `city` is carried from day one so a second city is a pure INSERT, not a schema change.
-- ---------------------------------------------------------------------------
create table public.service_areas (
  id smallint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  city text not null default 'Warszawa',
  sort_order smallint not null default 0
);

-- ---------------------------------------------------------------------------
-- Service taxonomy: category (required on a service) -> subtype (optional).
-- The redundant `unique (id, category_id)` is not decoration: it is the parent key the
-- composite FK on public.services points at, which is what keeps a subtype from being
-- attached to a category it does not belong to. Do not drop it.
-- ---------------------------------------------------------------------------
create table public.service_categories (
  id smallint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  sort_order smallint not null default 0
);

create table public.service_subtypes (
  id smallint generated always as identity primary key,
  category_id smallint not null references public.service_categories (id) on delete cascade,
  slug text not null,
  name text not null,
  sort_order smallint not null default 0,
  unique (category_id, slug),
  unique (id, category_id)
);

create index service_subtypes_category_id_idx on public.service_subtypes (category_id);

-- ---------------------------------------------------------------------------
-- Seed: Warsaw's 18 districts.
-- ---------------------------------------------------------------------------
insert into public.service_areas (slug, name, sort_order) values
  ('bemowo', 'Bemowo', 10),
  ('bialoleka', 'Białołęka', 20),
  ('bielany', 'Bielany', 30),
  ('mokotow', 'Mokotów', 40),
  ('ochota', 'Ochota', 50),
  ('praga-poludnie', 'Praga-Południe', 60),
  ('praga-polnoc', 'Praga-Północ', 70),
  ('rembertow', 'Rembertów', 80),
  ('srodmiescie', 'Śródmieście', 90),
  ('targowek', 'Targówek', 100),
  ('ursus', 'Ursus', 110),
  ('ursynow', 'Ursynów', 120),
  ('wawer', 'Wawer', 130),
  ('wesola', 'Wesoła', 140),
  ('wilanow', 'Wilanów', 150),
  ('wlochy', 'Włochy', 160),
  ('wola', 'Wola', 170),
  ('zoliborz', 'Żoliborz', 180)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Seed: 6 categories, each with 2-4 subtypes.
-- ---------------------------------------------------------------------------
insert into public.service_categories (slug, name, sort_order) values
  ('fryzjerstwo-damskie', 'Fryzjerstwo damskie', 10),
  ('fryzjerstwo-meskie', 'Fryzjerstwo męskie', 20),
  ('paznokcie', 'Paznokcie', 30),
  ('makijaz', 'Makijaż', 40),
  ('kosmetyka-twarzy', 'Kosmetyka twarzy', 50),
  ('depilacja', 'Depilacja', 60)
on conflict (slug) do nothing;

insert into public.service_subtypes (category_id, slug, name, sort_order)
select c.id, s.slug, s.name, s.sort_order
from (values
  ('fryzjerstwo-damskie', 'strzyzenie', 'Strzyżenie', 10),
  ('fryzjerstwo-damskie', 'koloryzacja', 'Koloryzacja', 20),
  ('fryzjerstwo-damskie', 'upiecie', 'Upięcie', 30),
  ('fryzjerstwo-damskie', 'pielegnacja', 'Pielęgnacja', 40),
  ('fryzjerstwo-meskie', 'strzyzenie', 'Strzyżenie', 10),
  ('fryzjerstwo-meskie', 'broda', 'Broda', 20),
  ('fryzjerstwo-meskie', 'strzyzenie-brzytwa', 'Strzyżenie brzytwą', 30),
  ('paznokcie', 'manicure', 'Manicure', 10),
  ('paznokcie', 'manicure-hybrydowy', 'Manicure hybrydowy', 20),
  ('paznokcie', 'pedicure', 'Pedicure', 30),
  ('paznokcie', 'przedluzanie', 'Przedłużanie', 40),
  ('makijaz', 'dzienny', 'Makijaż dzienny', 10),
  ('makijaz', 'okazjonalny', 'Makijaż okazjonalny', 20),
  ('makijaz', 'slubny', 'Makijaż ślubny', 30),
  ('kosmetyka-twarzy', 'oczyszczanie', 'Oczyszczanie', 10),
  ('kosmetyka-twarzy', 'peeling', 'Peeling', 20),
  ('kosmetyka-twarzy', 'masaz-twarzy', 'Masaż twarzy', 30),
  ('depilacja', 'woskowanie', 'Woskowanie', 10),
  ('depilacja', 'pasta-cukrowa', 'Pasta cukrowa', 20)
) as s (category_slug, slug, name, sort_order)
join public.service_categories c on c.slug = s.category_slug
on conflict (category_id, slug) do nothing;

-- ---------------------------------------------------------------------------
-- Access: world-readable, nobody-writable.
-- This is the first public read surface in the project — F-01's tables are own-row only.
-- Dictionaries carry no personal data, so `using (true)` is the whole policy.
-- ---------------------------------------------------------------------------
alter table public.service_areas enable row level security;
alter table public.service_categories enable row level security;
alter table public.service_subtypes enable row level security;

revoke all on public.service_areas from anon, authenticated;
revoke all on public.service_categories from anon, authenticated;
revoke all on public.service_subtypes from anon, authenticated;

grant select on public.service_areas to anon, authenticated;
grant select on public.service_categories to anon, authenticated;
grant select on public.service_subtypes to anon, authenticated;

create policy "service_areas_select_all"
  on public.service_areas for select to anon, authenticated using (true);

create policy "service_categories_select_all"
  on public.service_categories for select to anon, authenticated using (true);

create policy "service_subtypes_select_all"
  on public.service_subtypes for select to anon, authenticated using (true);
