-- S-03: give service areas a real parent, extend the dictionary past Warsaw, and add English
-- names to every dictionary.
--
-- Forward-only, following 20260803140000_listing_review_fixes.sql: the migrations amended here
-- are already applied on the hosted project, so they are extended by this file rather than
-- edited in place.
--
-- LOAD-BEARING: the 18 Warsaw rows are UPDATED, never deleted and re-inserted.
-- public.specialist_areas rows on the hosted project reference service_areas.id. Re-seeding
-- would hand those ids to different districts and silently reassign who serves where — a
-- corruption with no error and no symptom until a client books someone across the city.

-- ---------------------------------------------------------------------------
-- Cities. S-02 carried a free-text `city` column "so a second city is a pure INSERT"; that was
-- right about the data and not enough for the UI. A city-then-district picker needs a stable
-- key and an explicit order, which `select distinct city` cannot give.
-- ---------------------------------------------------------------------------
create table public.cities (
  id smallint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  name_en text not null,
  sort_order smallint not null default 0
);

insert into public.cities (slug, name, name_en, sort_order) values
  ('warszawa',  'Warszawa',  'Warsaw',    10),
  ('krakow',    'Kraków',    'Krakow',    20),
  ('lodz',      'Łódź',      'Lodz',      30),
  ('wroclaw',   'Wrocław',   'Wroclaw',   40),
  ('poznan',    'Poznań',    'Poznan',    50),
  ('gdansk',    'Gdańsk',    'Gdansk',    60),
  ('szczecin',  'Szczecin',  'Szczecin',  70),
  ('bydgoszcz', 'Bydgoszcz', 'Bydgoszcz', 80),
  ('lublin',    'Lublin',    'Lublin',    90),
  ('katowice',  'Katowice',  'Katowice', 100)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- service_areas: add the parent, backfill, then tighten.
-- ---------------------------------------------------------------------------
alter table public.service_areas add column city_id smallint references public.cities (id) on delete restrict;
alter table public.service_areas add column name_en text;

update public.service_areas
   set city_id = (select id from public.cities where slug = 'warszawa')
 where city_id is null;

-- English names for the existing Warsaw districts. District names are proper nouns, so these are
-- diacritic-stripped forms rather than translations — an English-speaking client needs something
-- they can type and recognise, not "Downtown".
update public.service_areas as a set name_en = v.name_en
from (values
  ('bemowo', 'Bemowo'),
  ('bialoleka', 'Bialoleka'),
  ('bielany', 'Bielany'),
  ('mokotow', 'Mokotow'),
  ('ochota', 'Ochota'),
  ('praga-poludnie', 'Praga-Poludnie'),
  ('praga-polnoc', 'Praga-Polnoc'),
  ('rembertow', 'Rembertow'),
  ('srodmiescie', 'Srodmiescie'),
  ('targowek', 'Targowek'),
  ('ursus', 'Ursus'),
  ('ursynow', 'Ursynow'),
  ('wawer', 'Wawer'),
  ('wesola', 'Wesola'),
  ('wilanow', 'Wilanow'),
  ('wlochy', 'Wlochy'),
  ('wola', 'Wola'),
  ('zoliborz', 'Zoliborz')
) as v (slug, name_en)
where a.slug = v.slug and a.name_en is null;

alter table public.service_areas alter column city_id set not null;
alter table public.service_areas alter column name_en set not null;

-- The slug must stop being globally unique. "Śródmieście" is a district of Warszawa, Wrocław AND
-- Łódź; "Stare Miasto" of Kraków, Wrocław AND Poznań. A global unique makes the second city
-- impossible to seed.
alter table public.service_areas drop constraint service_areas_slug_key;
alter table public.service_areas add constraint service_areas_city_slug_key unique (city_id, slug);

-- `city` was free text and is now redundant. Dropped last, after city_id is populated and
-- enforced, so a failure at any earlier step leaves the old column intact.
alter table public.service_areas drop column city;

create index service_areas_city_id_idx on public.service_areas (city_id);

-- ---------------------------------------------------------------------------
-- Seed: districts for the large cities, one whole-city area for the rest.
--
-- The split is deliberate. In Warszawa "I travel to Warszawa" carries no information — Wesoła to
-- Bemowo is 30 km — so districts are what make the match mean anything. In Lublin, forcing a
-- specialist through 27 checkboxes to say "I cover Lublin" invites them to tick three and vanish
-- from most searches, which fails the ">=50% of specialists receive a booking" metric far more
-- expensively than coarse matching does.
-- ---------------------------------------------------------------------------
insert into public.service_areas (city_id, slug, name, name_en, sort_order)
select c.id, v.slug, v.name, v.name_en, v.sort_order
from (values
  -- Kraków — the 18 administrative dzielnice, by their names rather than Roman numerals.
  ('krakow', 'stare-miasto', 'Stare Miasto', 'Stare Miasto', 10),
  ('krakow', 'grzegorzki', 'Grzegórzki', 'Grzegorzki', 20),
  ('krakow', 'pradnik-czerwony', 'Prądnik Czerwony', 'Pradnik Czerwony', 30),
  ('krakow', 'pradnik-bialy', 'Prądnik Biały', 'Pradnik Bialy', 40),
  ('krakow', 'krowodrza', 'Krowodrza', 'Krowodrza', 50),
  ('krakow', 'bronowice', 'Bronowice', 'Bronowice', 60),
  ('krakow', 'zwierzyniec', 'Zwierzyniec', 'Zwierzyniec', 70),
  ('krakow', 'debniki', 'Dębniki', 'Debniki', 80),
  ('krakow', 'lagiewniki', 'Łagiewniki-Borek Fałęcki', 'Lagiewniki-Borek Falecki', 90),
  ('krakow', 'swoszowice', 'Swoszowice', 'Swoszowice', 100),
  ('krakow', 'podgorze-duchackie', 'Podgórze Duchackie', 'Podgorze Duchackie', 110),
  ('krakow', 'biezanow-prokocim', 'Bieżanów-Prokocim', 'Biezanow-Prokocim', 120),
  ('krakow', 'podgorze', 'Podgórze', 'Podgorze', 130),
  ('krakow', 'czyzyny', 'Czyżyny', 'Czyzyny', 140),
  ('krakow', 'mistrzejowice', 'Mistrzejowice', 'Mistrzejowice', 150),
  ('krakow', 'bienczyce', 'Bieńczyce', 'Bienczyce', 160),
  ('krakow', 'wzgorza-krzeslawickie', 'Wzgórza Krzesławickie', 'Wzgorza Krzeslawickie', 170),
  ('krakow', 'nowa-huta', 'Nowa Huta', 'Nowa Huta', 180),

  -- Łódź — 5 dzielnice.
  ('lodz', 'baluty', 'Bałuty', 'Baluty', 10),
  ('lodz', 'gorna', 'Górna', 'Gorna', 20),
  ('lodz', 'polesie', 'Polesie', 'Polesie', 30),
  ('lodz', 'srodmiescie', 'Śródmieście', 'Srodmiescie', 40),
  ('lodz', 'widzew', 'Widzew', 'Widzew', 50),

  -- Wrocław — 5 dzielnice.
  ('wroclaw', 'stare-miasto', 'Stare Miasto', 'Stare Miasto', 10),
  ('wroclaw', 'srodmiescie', 'Śródmieście', 'Srodmiescie', 20),
  ('wroclaw', 'krzyki', 'Krzyki', 'Krzyki', 30),
  ('wroclaw', 'fabryczna', 'Fabryczna', 'Fabryczna', 40),
  ('wroclaw', 'psie-pole', 'Psie Pole', 'Psie Pole', 50),

  -- Poznań — 5 dzielnice.
  ('poznan', 'stare-miasto', 'Stare Miasto', 'Stare Miasto', 10),
  ('poznan', 'nowe-miasto', 'Nowe Miasto', 'Nowe Miasto', 20),
  ('poznan', 'grunwald', 'Grunwald', 'Grunwald', 30),
  ('poznan', 'jezyce', 'Jeżyce', 'Jezyce', 40),
  ('poznan', 'wilda', 'Wilda', 'Wilda', 50),

  -- Gdańsk has 35 administrative units, which is picker-hostile. These are the widely recognised
  -- ones people actually name when saying where they live.
  ('gdansk', 'srodmiescie', 'Śródmieście', 'Srodmiescie', 10),
  ('gdansk', 'wrzeszcz', 'Wrzeszcz', 'Wrzeszcz', 20),
  ('gdansk', 'oliwa', 'Oliwa', 'Oliwa', 30),
  ('gdansk', 'przymorze', 'Przymorze', 'Przymorze', 40),
  ('gdansk', 'zaspa', 'Zaspa', 'Zaspa', 50),
  ('gdansk', 'brzezno', 'Brzeźno', 'Brzezno', 60),
  ('gdansk', 'nowy-port', 'Nowy Port', 'Nowy Port', 70),
  ('gdansk', 'chelm', 'Chełm', 'Chelm', 80),
  ('gdansk', 'piecki-migowo', 'Piecki-Migowo', 'Piecki-Migowo', 90),
  ('gdansk', 'jasien', 'Jasień', 'Jasien', 100),
  ('gdansk', 'orunia', 'Orunia', 'Orunia', 110),
  ('gdansk', 'stogi', 'Stogi', 'Stogi', 120),

  -- Whole-city areas. `<city>-miasto` keeps the slug shape predictable; the UI renders these as
  -- a single checkbox rather than a one-item district list.
  ('szczecin',  'szczecin-miasto',  'Całe miasto', 'Whole city', 10),
  ('bydgoszcz', 'bydgoszcz-miasto', 'Całe miasto', 'Whole city', 10),
  ('lublin',    'lublin-miasto',    'Całe miasto', 'Whole city', 10),
  ('katowice',  'katowice-miasto',  'Całe miasto', 'Whole city', 10)
) as v (city_slug, slug, name, name_en, sort_order)
join public.cities c on c.slug = v.city_slug
on conflict (city_id, slug) do nothing;

-- ---------------------------------------------------------------------------
-- English names for the taxonomy. Unlike district names these are NOT proper nouns: an English
-- speaker cannot tell "Depilacja" from "Kosmetyka twarzy", so FR-007's type filter stops working
-- for them without real translations.
-- ---------------------------------------------------------------------------
alter table public.service_categories add column name_en text;
alter table public.service_subtypes add column name_en text;

update public.service_categories as c set name_en = v.name_en
from (values
  ('fryzjerstwo-damskie', 'Women''s hairdressing'),
  ('fryzjerstwo-meskie', 'Men''s hairdressing'),
  ('paznokcie', 'Nails'),
  ('makijaz', 'Make-up'),
  ('kosmetyka-twarzy', 'Facial care'),
  ('depilacja', 'Hair removal')
) as v (slug, name_en)
where c.slug = v.slug;

update public.service_subtypes as s set name_en = v.name_en
from (values
  ('fryzjerstwo-damskie', 'strzyzenie', 'Haircut'),
  ('fryzjerstwo-damskie', 'koloryzacja', 'Colouring'),
  ('fryzjerstwo-damskie', 'upiecie', 'Updo'),
  ('fryzjerstwo-damskie', 'pielegnacja', 'Treatment'),
  ('fryzjerstwo-meskie', 'strzyzenie', 'Haircut'),
  ('fryzjerstwo-meskie', 'broda', 'Beard'),
  ('fryzjerstwo-meskie', 'strzyzenie-brzytwa', 'Razor cut'),
  ('paznokcie', 'manicure', 'Manicure'),
  ('paznokcie', 'manicure-hybrydowy', 'Gel manicure'),
  ('paznokcie', 'pedicure', 'Pedicure'),
  ('paznokcie', 'przedluzanie', 'Extensions'),
  ('makijaz', 'dzienny', 'Day make-up'),
  ('makijaz', 'okazjonalny', 'Occasion make-up'),
  ('makijaz', 'slubny', 'Bridal make-up'),
  ('kosmetyka-twarzy', 'oczyszczanie', 'Deep cleansing'),
  ('kosmetyka-twarzy', 'peeling', 'Peel'),
  ('kosmetyka-twarzy', 'masaz-twarzy', 'Facial massage'),
  ('depilacja', 'woskowanie', 'Waxing'),
  ('depilacja', 'pasta-cukrowa', 'Sugaring')
) as v (category_slug, slug, name_en)
join public.service_categories c on c.slug = v.category_slug
where s.category_id = c.id and s.slug = v.slug;

-- NOT NULL after backfill, so a future seed cannot quietly ship an untranslated row.
alter table public.service_categories alter column name_en set not null;
alter table public.service_subtypes alter column name_en set not null;

-- ---------------------------------------------------------------------------
-- Access: cities is a dictionary, so it matches the others exactly — world-readable,
-- nobody-writable. Changing it means a migration; there is no admin role in v1.
-- ---------------------------------------------------------------------------
alter table public.cities enable row level security;
revoke all on public.cities from anon, authenticated;
grant select on public.cities to anon, authenticated;

create policy "cities_select_all"
  on public.cities for select to anon, authenticated using (true);
