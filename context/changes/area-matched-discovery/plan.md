# Area-Matched Specialist Discovery — Implementation Plan

## Overview

Roadmap slice S-03: the product wedge made real. A client saves where they live, browses
specialists filtered by service type and price, restricts results to specialists whose declared
areas cover them, and opens a profile showing services and a trust summary.

Three cross-cutting concerns ride along by explicit decision (see `change.md`): the mockup design
system replaces the starter's theme, the UI becomes bilingual with Polish as the default, and the
existing auth and specialist screens are retrofitted onto both. Those land **before** discovery so
the client-facing screens are written once, against finished primitives.

## Current State Analysis

**What exists.** F-01 gave every account a role and a privacy contract. S-01 gave sign-up,
sign-in and password recovery. S-02 gave specialists a card: `specialist_profiles`,
`specialist_areas` (M:N against an 18-district Warsaw dictionary), `services` against a two-level
taxonomy, with zod validation and role-gated RLS.

**What discovery can already rely on.** The S-02 migration granted `select` to `anon` and
`authenticated` on all three specialist tables with `using (true)` policies, explicitly so "S-03
consumes this without needing to touch RLS again"
(`supabase/migrations/20260803120100_specialist_profiles_and_services.sql:79-98`). The reverse
index `specialist_areas_area_id_idx` was created for exactly this query. **No read-side RLS work
is needed.**

**What is missing.**

- No client-side entity at all — no saved address, no area, no contact details.
- No reviews, so FR-009's rating summary has nothing to read.
- `service_areas` holds Warsaw only. The `city` column exists with a `'Warszawa'` default, put
  there in S-02 so "a second city is a pure INSERT, not a schema change" — but it is free text,
  which cannot drive a city-then-district picker or give cities a stable order.
- Dictionaries are Polish-only. There is no `name_en` on any of the three.
- `src/styles/global.css` is the untouched shadcn neutral theme (oklch greys). The specialist
  components are on a *third* palette again — `AreaPicker.tsx` uses `bg-purple-500/20` and
  `text-blue-100/80` from the starter's dark theme. Nothing in the repo resembles the mockups.
- `Layout.astro` hardcodes `lang="en"` and the title `"10x Astro Starter"`.
- Every user-facing string is an English literal, including the `?error=` messages produced by
  API endpoints and the messages embedded in the zod schemas.
- No JS test runner (per CLAUDE.md). pgTAP is the only automated suite: two files, 27 assertions.

## Desired End State

A signed-in client saves their city, district, street and contact details on an account screen.
They open `/specialists`, see cards for every specialist with a complete card, narrow by service
category and price range, sort by price, and toggle "serves my area" to keep only specialists who
declared their district. Opening a card shows the specialist's name, bio, declared areas, services
with price and duration, and either an average rating or a "New specialist" label. Booking CTAs
are present but disabled.

Every screen except the landing page renders in the mockups' visual language, in Polish by
default, switchable to English. A specialist's own "your card is live" banner and the client's
search results are driven by the *same* database view, so they cannot disagree.

Verify by: signing in as a client with an address in Mokotów, confirming a Mokotów-declaring
specialist appears and an Ursynów-only specialist does not; then removing that specialist's last
service and confirming both the specialist's banner and the client's results drop them together.

### Key Discoveries

- Public read is already granted and policied — `20260803120100_specialist_profiles_and_services.sql:96-112`.
- The completeness rule lives at `src/lib/services/specialists.ts:175-186` and its own docstring
  says S-03 must not diverge from it. This plan removes the possibility rather than restating it.
- `src/lib/schemas/limits.ts` exists because importing constants from a zod module dragged 65 KB
  of zod into the browser (S-02 impl-review F1). Every new shared bound goes there, not into a
  schema module.
- Money is integer grosze with a `price_cents > 0` check; the zod layer accepts `"120,50"` because
  Polish keyboards produce a comma (`src/lib/schemas/specialist.ts:55-62`).
- `matchesRoute()` in `src/middleware.ts:21` already matches on a path boundary, so a public
  `/specialists` route will not be captured by the `/specialist` specialist-only gate. This was
  fixed in S-02 in anticipation of exactly this slice.
- Postgres views run with the *definer's* rights by default; `security_invoker = true` is required
  for the underlying RLS to evaluate as the caller.
- Polish diacritics live in the `latin-ext` Unicode range — a font subset limited to `latin` will
  break "Śródmieście" and "Żoliborz".

## What We're NOT Doing

- **Bookings.** No `bookings` table, no request flow. CTAs render disabled. That is S-04.
- **Writing reviews.** The table and the read path land here; insertion, the "only a client with a
  completed booking" rule, and the rating UI are S-06's, because the rule needs `bookings`.
- **Rating sort or filter.** PRD FR-007 dropped it deliberately so cold-start specialists are not
  hidden. The mockup's "Ocena ↓" chip is not built.
- **Free-text review bodies.** FR-009 defers them to v2 pending a moderation path. The mockup's
  review paragraphs are not built.
- **Profile photos and "delete account".** Storage and data-erasure are separate concerns.
  Avatars render as initials, as they already do in most mockups.
- **The landing page.** `src/pages/index.astro` keeps the starter's `Welcome.astro`. It is the one
  screen with no mockup.
- **`team.html` / employees.** Not in PRD v1 — Arrivo is independent specialists.
- **Dashboard statistics tiles.** "3 wizyty dziś", "+22% vs poprzedni" need booking data.
- **Maps, geocoding, postal-code lookup.** PRD replaced travel-time with declared areas precisely
  to avoid this.
- **Translating user-generated content.** A specialist's bio and custom service names display as
  written, in both locales.
- **A JS test runner.** Still out per CLAUDE.md; automated coverage stays pgTAP-only.

## Implementation Approach

Five phases, ordered by dependency rather than by user visibility.

The visual and language foundation goes first because every later screen consumes it. The schema
goes second because the two-step area picker cannot be built before multiple cities exist, and the
completeness view cannot be consumed before it exists. Retrofit is split in two — shell plus auth,
then the specialist area — so each is a reviewable unit rather than one commit touching thirty
files. Discovery lands last, written once against finished primitives.

**i18n mechanism.** Locale is resolved in middleware from a cookie, falling back to
`Accept-Language`, defaulting to `pl`, and attached to `context.locals`. Astro pages call a `t()`
helper; React islands receive resolved strings as props rather than importing the catalog, which
keeps the catalog out of the client bundle — the same reasoning that produced `limits.ts`. No URL
prefixes, so no route, redirect or middleware path changes.

**The error-message consequence.** Server-produced messages are currently English sentences passed
through `?error=`. A sentence cannot be translated at the point of display. Endpoints and zod
schemas therefore emit stable *keys*; the page translates. This is a mechanical but wide change
and is why auth retrofit is its own phase with a regression gate.

**Filtering without JavaScript.** Filters are a GET form with query parameters, rendered
server-side. The primary persona includes elderly and limited-mobility users who are not on fast
devices, and the NFR is a sub-second p95 — a filter that costs zero client JS and produces
shareable, back-button-correct URLs serves both better than an island.

## Critical Implementation Details

**Ordering inside phase 2.** `service_areas.city` is replaced by a FK to a new `cities` table.
The column must be backfilled from the existing text values *before* it is dropped, and
`specialist_areas` rows on production reference `service_areas.id` values that must not change —
so the Warsaw rows are updated in place, never deleted and re-inserted.

**The view is the contract, and `missingPieces()` is not.** `discoverable_specialists` answers
yes/no. The specialist's banner also needs *what is missing*, which the view cannot express.
`missingPieces()` therefore stays in TypeScript for the wording, but the boolean it currently
derives is replaced by a lookup against the view. If the two ever disagree the banner shows
"visible" with a list of missing pieces — visibly incoherent, which is the point: the failure is
loud rather than silent.

**Font subsetting.** Inter and Fraunces must be self-hosted with the `latin-ext` subset included.
The mockups' `@import` from Google Fonts is a render-blocking request to an external host, which
the Cloudflare Workers deploy and the sub-second NFR both argue against.

---

## Phase 1: Visual foundation and i18n

### Overview

Replace the starter theme with the mockups' design system, self-host the fonts, and put a working
bilingual layer in place. No domain logic. At the end of this phase the app looks different and
the `Topbar` is translatable, proving the mechanism end to end.

### Changes Required:

#### 1. Design tokens

**File**: `src/styles/global.css`

**Intent**: Replace the shadcn neutral oklch palette with the mockups' tokens so every existing
`bg-background` / `text-muted-foreground` utility already in the codebase resolves to the new
language without touching the components that use them.

**Contract**: Keep the existing `--color-*` names that shadcn components reference (`background`,
`foreground`, `card`, `primary`, `muted`, `border`, `input`, `ring`, `destructive`) and re-point
their values to the mockup palette from `context/foundation/design/_shared/styles.css`: surface
`#FAF7F3`, card `#FFFFFF`, ink `#241C2C`, primary `#C1573B`, border `#E8E0D3`, muted `#9A8FA0`.
Add the mockup-specific tokens with new names — `--color-surface-alt`, `--color-teal`,
`--color-success`, `--color-warning`, and the `-soft` variants used by badges. Add
`--font-display` (Fraunces) and `--font-sans` (Inter) to `@theme`. Drop the `.dark` block and the
`bg-cosmic` utility — the mockups define a single light theme and nothing references dark mode.

#### 2. Self-hosted fonts

**File**: `public/fonts/` (new), `src/styles/global.css`

**Intent**: Serve Inter and Fraunces from the same origin so the first paint does not wait on
fonts.googleapis.com.

**Contract**: Variable `woff2` files covering `latin` **and `latin-ext`** — Polish diacritics are
in `latin-ext` and a `latin`-only subset renders "Śródmieście" with fallback glyphs. `@font-face`
declarations with `font-display: swap` and a `unicode-range` per subset; `<link rel="preload">`
for the two faces used above the fold.

#### 3. Locale resolution

**File**: `src/lib/i18n/index.ts` (new), `src/middleware.ts`, `src/env.d.ts`

**Intent**: Decide the request's locale once, in middleware, and expose it the same way the user
and role already are.

**Contract**: `type Locale = "pl" | "en"`, `DEFAULT_LOCALE = "pl"`, and
`resolveLocale(cookies, acceptLanguage): Locale`. Middleware sets `context.locals.locale` before
any route logic; `App.Locals` in `src/env.d.ts` gains `locale: Locale`. Cookie name `arrivo_locale`,
one year, `SameSite=Lax`, not `HttpOnly` — no security value and it stays readable if a client-side
switcher is ever wanted.

#### 4. Message catalogs and the `t()` helper

**File**: `src/lib/i18n/messages/pl.ts` (new), `src/lib/i18n/messages/en.ts` (new), `src/lib/i18n/t.ts` (new)

**Intent**: One flat key space, Polish authoritative, English a peer file that must define the
same keys.

**Contract**: `pl.ts` exports a `const` object of dotted keys (`auth.signin.title`,
`common.save`, …). `en.ts` is typed as `Record<keyof typeof pl, string>`, so a missing English key
is a build failure rather than a runtime fallback. `t(locale, key, params?)` performs
`{placeholder}` interpolation and returns the key itself if lookup fails.

Islands never import a catalog. Pages resolve strings and pass them down — the same bundle-size
reasoning that produced `src/lib/schemas/limits.ts`.

#### 5. Language switcher

**File**: `src/components/LanguageSwitcher.astro` (new), `src/pages/api/locale.ts` (new)

**Intent**: Let the user change language without JavaScript.

**Contract**: A two-button GET/POST form posting to `/api/locale` with the target locale and the
current path; the endpoint validates the locale against the allowed set, sets the cookie, and
redirects back. Validate the return path is app-relative (starts with `/`, not `//`) before
redirecting — an unchecked redirect target is an open redirect.

#### 6. UI primitives

**File**: `src/components/ui/` — `Card.astro`, `Chip.astro`, `Badge.astro`, `Avatar.astro`,
`Stars.astro`, `EmptyState.astro` (all new); `src/components/ui/button.tsx`

**Intent**: Port the mockup component classes to reusable primitives so later phases compose
rather than restyle.

**Contract**: Each maps a mockup class to a component API — `Badge` takes
`variant: "client" | "specialist" | "pending" | "accepted" | "completed" | "declined"`; `Avatar`
takes a name and derives initials plus `size: "sm" | "md" | "lg"`; `Stars` takes a 0–5 number and
renders filled/empty glyphs with an accessible text label. `button.tsx` gains `primary`,
`secondary`, `ghost`, `teal` and `danger-ghost` variants matching the mockups. Compose classes with
`cn()`; do not hand-concatenate.

#### 7. Layout

**File**: `src/layouts/Layout.astro`

**Intent**: Stop declaring English on every page and stop advertising the starter.

**Contract**: `lang={Astro.locals.locale}`, default title "Arrivo", `--font-sans` applied on
`body`. The `missingConfigs` banner stays.

### Success Criteria:

#### Automated Verification:

- `npm run build` passes
- `npm run lint` passes and `npx eslint . | grep 'prettier/prettier' | grep -v '␍'` is empty
- `npx astro sync` succeeds after the `env.d.ts` change
- No network request to `fonts.googleapis.com` in the built output: `grep -r "fonts.googleapis" dist/` returns nothing

#### Manual Verification:

- Existing screens render in the new palette without layout breakage
- The language switcher flips `Topbar` strings between Polish and English and the choice survives a reload
- "Śródmieście" and "Żoliborz" render with correct diacritics in both fonts
- A fresh visitor with a Polish `Accept-Language` and no cookie gets Polish

---

## Phase 2: Schema and data

### Overview

Every table, column, view and seed the remaining phases read. No UI.

### Changes Required:

#### 1. Cities and multi-city areas

**File**: `supabase/migrations/20260804NNNNNN_cities_and_multi_city_areas.sql` (new)

**Intent**: Give areas a real parent so the picker can present city → districts, and extend the
dictionary from Warsaw to ten cities.

**Contract**: New `public.cities` (`id smallint identity`, `slug unique`, `name`, `name_en`,
`sort_order`). `service_areas` gains `city_id smallint references cities`, backfilled from the
existing `city` text values, then `set not null`; the `city` text column is dropped afterwards.
**Update the 18 Warsaw rows in place** — `specialist_areas` on production references their ids.

Seed: Warszawa keeps its 18 districts. Kraków, Wrocław, Poznań, Łódź and Gdańsk get their
commonly-used district names. Szczecin, Bydgoszcz, Lublin and Katowice get a single area row each
representing the whole city (`slug` `<city>-miasto`, name "Całe miasto" / "Whole city"). Roughly 60
area rows total. RLS, grants and the `select_all` policy for `cities` mirror the existing
dictionary tables exactly.

#### 2. Dictionary translations

**File**: same migration or a sibling

**Intent**: Let the English UI name a district or a category.

**Contract**: `name_en text` on `service_areas`, `service_categories`, `service_subtypes` and
`cities`. Added nullable, backfilled for every seeded row, then `set not null` so a future seed
cannot silently ship untranslated. Proper nouns may repeat the Polish value (Mokotów → Mokotów);
category names must not (Fryzjerstwo damskie → Women's hairdressing).

#### 3. Client profile

**File**: `supabase/migrations/20260804NNNNNN_client_profiles.sql` (new)

**Intent**: The client's saved area for matching, plus the private details a specialist needs only
after accepting.

**Contract**: `public.client_profiles` keyed 1:1 to `public.profiles` — `first_name`, `last_name`,
`phone`, `area_id smallint references service_areas on delete restrict`, `street`, `postal_code`,
timestamps, `set_updated_at` trigger. Length checks and a trimmed check on the text columns,
following the `specialist_profiles_display_name_trimmed` precedent.

Access: **own row only, for every operation** — no public read of any kind. `revoke all`, then
`grant select, insert, update to authenticated`, with `using`/`with check` on
`id = (select auth.uid())`. A role check in `with check` restricts writes to `role = 'client'`,
mirroring `specialist_profiles_insert_own`.

This table is the F-01 privacy contract's subject. S-04 will add the policy that lets a specialist
read the row *of a client whose booking they accepted* — this migration deliberately does not, and
says so in a comment.

#### 4. Bio, duration and custom service name

**File**: `supabase/migrations/20260804NNNNNN_listing_details.sql` (new)

**Intent**: The four out-of-PRD fields accepted during planning.

**Contract**: `specialist_profiles.bio text` nullable, check length ≤ 600 and trimmed.
`services.duration_minutes smallint` nullable, check between 15 and 600.
`services.name text` nullable, check length between 2 and 80 and trimmed — it *supplements* the
taxonomy, never replaces it: `category_id` stays `not null` because FR-007's filter depends on it.

#### 5. Reviews

**File**: `supabase/migrations/20260804NNNNNN_reviews.sql` (new)

**Intent**: The read side of the trust rating, with no way to write it yet.

**Contract**: `public.reviews` — `id uuid`, `specialist_id references specialist_profiles on
delete cascade`, `client_id references profiles`, `rating smallint not null check (rating between
1 and 5)`, `created_at`. Index on `specialist_id`.

Access: `grant select to anon, authenticated` with a `using (true)` policy — aggregate ratings are
public per FR-014. **No insert, update or delete grant to anyone.** A comment records that S-06
adds `booking_id`, the one-rating-per-completed-booking uniqueness, and the insert policy, because
those need the `bookings` table from S-05.

#### 6. The discoverability view

**File**: `supabase/migrations/20260804NNNNNN_discoverable_specialists.sql` (new)

**Intent**: One definition of "discoverable", consumed by both the client's search and the
specialist's own status banner, so the two cannot diverge (S-02 impl-review F4).

**Contract**: `create view public.discoverable_specialists with (security_invoker = true)`.
`security_invoker` is not optional — without it the view runs with the definer's rights and
bypasses the RLS of the tables beneath it.

Columns: `id`, `display_name`, `bio`, `rating_count`, `rating_avg`, `min_price_cents`.
Row condition: a `specialist_profiles` row that has at least one `specialist_areas` row **and** at
least one `services` row. `display_name` needs no test — the column is `not null`.

The 3-rating threshold is **not** encoded here. The view reports `rating_count` and `rating_avg`;
the display rule lives in TypeScript next to the other bounds, so changing it is not a migration.

`grant select on public.discoverable_specialists to anon, authenticated`.

#### 7. Database tests

**File**: `supabase/tests/database/discovery_rls.test.sql` (new)

**Intent**: Pin the properties that are expensive to discover by hand.

**Contract**: pgTAP assertions covering — a client can read and write only their own
`client_profiles` row and cannot read another's; a specialist-role account cannot insert one;
nobody holds insert/update/delete on `reviews`; the view omits a specialist missing areas, omits
one missing services, and includes one with both; `rating_avg` is null at zero ratings; every row
in all four dictionaries has a non-null `name_en`; area seed counts match.

#### 8. Shared types and bounds

**File**: `src/types.ts`, `src/lib/schemas/limits.ts`

**Intent**: Mirror the schema in TypeScript.

**Contract**: `City`, `ClientProfile`, `Review`, `DiscoverableSpecialist` interfaces; `ServiceArea`
gains `city_id` and loses `city`; all dictionary interfaces gain `name_en`; `Service` gains
`duration_minutes` and `name`; `SpecialistProfile` gains `bio`. `limits.ts` gains
`RATING_THRESHOLD = 3`, `BIO_MAX = 600`, `SERVICE_NAME_MIN/MAX`, `DURATION_MIN/MAX`, and the
phone/postal-code bounds. `limits.ts` stays dependency-free.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` applies every migration cleanly from scratch
- `npx supabase test db` is green, including the pre-existing `profiles_rls` and
  `specialist_listing_rls` suites
- Seed counts: 10 cities, ~60 areas, every area has a `city_id` and a `name_en`
- `npm run build` and the CRLF-aware lint check pass after the type changes
- `npm run check` passes (`astro check` — the only gate that sees type errors, incl. pl/en catalog parity)

#### Manual Verification:

- `npx supabase db push` lands on the hosted project without drift, and the pre-existing
  production specialist's declared Warsaw areas still resolve after the `city_id` migration
- Querying `discoverable_specialists` as `anon` returns the production specialist
- Querying another user's `client_profiles` row through PostgREST with a user JWT returns nothing

---

## Phase 3: Retrofit — shell, auth and dashboard

### Overview

Move everything outside `/specialist` onto the new design system and through the translation
layer. The risk here is regression in a flow that already works, so the gate is the full auth
round-trip.

### Changes Required:

#### 1. Server-side messages become keys

**File**: `src/pages/api/auth/*.ts`, `src/lib/schemas/auth.ts`, `src/lib/schemas/parse.ts`

**Intent**: A message chosen on the server cannot be translated where it is displayed. Move the
choice of *which* message to the server and the choice of *wording* to the page.

**Contract**: Endpoints redirect with `?error=<key>` where the key is a member of a stable union
(e.g. `auth.error.invalid_credentials`), not an English sentence. Zod schemas set their `error` to
the same keys. The pages translate via `t()`, falling back to a generic message for an unknown key
so a stale bookmark cannot render a blank error.

#### 2. Shell

**File**: `src/components/Topbar.astro`, `src/components/Banner.astro`, `src/layouts/Layout.astro`

**Intent**: The mockups' navbar — wordmark with the terracotta `A` mark, links, avatar, language
switcher.

**Contract**: `Topbar` renders role-aware links: signed-out gets sign-in/sign-up, a client gets
Discover and Profile, a specialist gets a link into their panel. Links whose destination does not
exist yet (client bookings) are omitted, not disabled — an empty nav slot is invisible, a dead nav
link is not.

#### 3. Auth screens

**File**: `src/pages/auth/{signin,signup,forgot-password,forgot-password-sent,reset-password,confirm-email}.astro`,
`src/components/auth/*.tsx`

**Intent**: Port to the `auth-card` layout from `sign-in.html` / `sign-up.html` and take every
string from the catalog.

**Contract**: Astro pages resolve strings and pass them to the islands as props — the islands must
not import the catalog. `RoleToggle` becomes the mockup's two-card `role-grid` picker. The posted
field names and endpoint contracts are unchanged; this is presentation only.

#### 4. Dashboard

**File**: `src/pages/dashboard.astro`

**Intent**: Give each role a real landing screen.

**Contract**: A greeting and role-appropriate next actions — for a specialist, links into their
panel plus the card-status banner; for a client, a link to discovery and to their profile. No
statistics tiles: the numbers in `dashboard-specialist.html` need bookings.

### Success Criteria:

#### Automated Verification:

- `npm run build` passes
- `npm run lint` passes, CRLF-aware check empty
- `npm run check` passes — no untranslated catalog key, no type error
- No auth endpoint redirects with a non-key error string: `grep -rn "error=" src/pages/api/auth/`
  shows keys only

#### Manual Verification:

- Full regression, in both locales: sign up as client, sign up as specialist, sign in, sign out,
  forgot password → email → reset → sign in with the new password
- A wrong password shows a translated message, not a raw key
- Every auth screen matches its mockup in layout and hierarchy
- The language switcher works from an auth screen while signed out

---

## Phase 4: Retrofit — specialist panel, new fields, two-step area picker

### Overview

The specialist side moves onto the sidebar shell, gains bio/duration/service-name, and swaps the
flat 18-checkbox area list for a city-then-district picker. The completeness banner switches to
the view, closing S-02's F4.

### Changes Required:

#### 1. Specialist shell

**File**: `src/components/specialist/SpecialistNav.astro`, `src/pages/specialist/{profile,services}.astro`

**Intent**: The `page-shell` + `sidebar` layout from `dashboard-specialist.html`.

**Contract**: Sidebar with the wordmark, nav entries for Profile and Services, and a footer
identity block with avatar and role badge. Entries for Bookings and Team are **not** rendered —
one is S-05, the other is out of scope. Collapses on narrow viewports, per the mockup's
`@media (max-width: 720px) { .sidebar { display: none } }`.

#### 2. Two-step area picker

**File**: `src/components/specialist/AreaPicker.tsx` → `src/components/ui/AreaPicker.tsx`

**Intent**: One component serving both sides — the specialist picks many areas, the client picks
one — because a flat list stops working at ten cities.

**Contract**: Props gain `cities: City[]`, `mode: "multi" | "single"`, and the selection type
follows the mode. Internal state holds the active city; the districts grid shows only that city's
areas. **Selection persists across city switches** — the state is the full id set, not the visible
subset, so a specialist covering Warsaw and Kraków does not lose Warsaw by looking at Kraków. A
"select all in this city" control makes whole-city coverage two clicks. Cities whose only area is
`<city>-miasto` render as a single checkbox, not a nested list of one.

The current purple/blue starter classes are replaced by tokens; `cn()` composes them.

#### 3. Profile and service forms

**File**: `src/components/specialist/{ProfileForm,ServiceForm,ServiceList}.tsx|.astro`,
`src/lib/schemas/specialist.ts`, `src/pages/api/specialist/{profile,services}.ts`

**Intent**: Accept the four new fields, validated on the server.

**Contract**: `specialistProfileSchema` gains optional `bio` (trimmed, ≤ `BIO_MAX`).
`serviceSchema` gains optional `name` and optional `duration_minutes` (coerced integer within
bounds; empty string normalizes to null, following the `subtype_id` precedent at
`src/lib/schemas/specialist.ts:48-51`). Error messages are catalog keys, as in phase 3.
`upsertOwnCard` and `addService` in `src/lib/services/specialists.ts` carry the new fields.
`ServiceList` shows the custom name when present, otherwise the taxonomy name, plus duration.

#### 4. Completeness reads the view

**File**: `src/lib/services/specialists.ts`, `src/components/specialist/CardStatus.astro`

**Intent**: Close S-02 impl-review F4 structurally.

**Contract**: `isCardComplete(card)` is replaced by
`isDiscoverable(supabase, userId): Promise<boolean>`, which selects the caller's own id from
`discoverable_specialists`. `missingPieces()` **stays** — the view answers yes/no, and a specialist
told only "not visible" cannot act. The banner takes both: the view decides visible/not, the
predicate supplies the wording. If they ever disagree the banner is visibly incoherent rather than
quietly wrong, which is the intended failure mode. Remove the docstring warning at
`src/lib/services/specialists.ts:172-174` — it no longer describes a risk.

### Success Criteria:

#### Automated Verification:

- `npm run build` passes
- `npm run lint` passes, CRLF-aware check empty
- `npm run check` passes — no untranslated catalog key, no type error
- `grep -rn "isCardComplete" src/` returns nothing — no caller left on the old predicate

#### Manual Verification:

- A specialist selects districts in Warszawa, switches to Kraków, selects more, saves — **both**
  cities' selections persist
- "Select all in this city" then save produces every area of that city
- Bio, duration and a custom service name save and re-display; a service with none of them still
  saves
- The card-status banner flips to "not visible" when the last service is deleted, and back
- Client-role account is still redirected away from `/specialist/profile`; signed-out visitor
  still goes to sign-in
- Both locales render the specialist panel with no untranslated strings

---

## Phase 5: Discovery

### Overview

The slice's actual outcome: the client's address, the filterable list, and the public profile.

### Changes Required:

#### 1. Client account screen

**File**: `src/pages/account/profile.astro` (new), `src/pages/api/account/profile.ts` (new),
`src/lib/schemas/client.ts` (new), `src/lib/services/clients.ts` (new)

**Intent**: FR-003 — a client saves and edits their home address, including the district that
drives matching.

**Contract**: Form over `client_profiles`: city → district via the shared `AreaPicker` in
`single` mode, plus street, postal code, first name, last name, phone. The privacy note from
`onboarding-client.html` is shown verbatim in intent — the exact address is visible only to a
specialist who has accepted a booking. No map preview: v1 has no geocoding.

The endpoint validates through zod with catalog keys and upserts the caller's own row. Add
`/account` to `PROTECTED_ROUTES` in `src/middleware.ts`; it is **not** added to
`SPECIALIST_ROUTES`.

#### 2. Discovery query

**File**: `src/lib/services/discovery.ts` (new)

**Intent**: One place that turns filter inputs into results.

**Contract**: `searchSpecialists(supabase, filters)` where filters are `{ areaId?, categoryId?,
minPriceCents?, maxPriceCents?, sort: "price_asc" | "price_desc" }`. Reads
`discoverable_specialists` — never the base tables — joined to `services` for the category and
price predicates and to `specialist_areas` for the area predicate. Returns the specialist plus the
areas served, the matching services, and the rating summary.

`ratingLabel(count, avg)` applies `RATING_THRESHOLD`: below it, the "New specialist" label;
at or above, the average. This is the only place the threshold is read.

**Do not display the view's `min_price_cents` when a filter is active** (phase-2 impl-review F2).
The view computes it over ALL of a specialist's services, so a card shown under a "Paznokcie"
filter would advertise "od 70 zł" from a men's haircut — true about the specialist, false about
the search, and the client only finds out on the profile. `displayPriceFrom(specialist, filters)`
takes the minimum of the **embedded, already-filtered** services and falls back to the view's
value only when neither a category nor a price bound is set. The view keeps reporting the
unfiltered truth; the card stops mislabelling it.

Verified during phase 2 against hosted data: PostgREST resolves embeddings through the view,
including `!inner` and a combined area × category × price filter, so the filtered service rows
this needs are already in the response.

#### 3. Results page

**File**: `src/pages/specialists/index.astro` (new), `src/components/discovery/{FilterBar,SpecialistCard}.astro` (new)

**Intent**: `discover.html`, driven by real data.

**Contract**: A GET form — no island. Query parameters `area`, `category`, `min`, `max`, `sort`;
unparseable values are ignored rather than erroring, so a hand-edited URL degrades to the unfiltered
list. "Serves my area" is a checkbox defaulting to **on** when the signed-in client has a saved
area, and absent for a visitor with none, with a prompt to set an address instead. Cards show
avatar initials, name, primary category, rating summary, areas served and "od <min price>".
An empty result renders `EmptyState` with the filter most likely responsible.

The page is public: a signed-out visitor may browse, per PRD Access Control. It must **not** be
added to `PROTECTED_ROUTES`.

#### 4. Public specialist profile

**File**: `src/pages/specialists/[id].astro` (new)

**Intent**: `specialist-profile.html` — FR-009.

**Contract**: Header with avatar, name, specialist badge, declared areas, rating summary and a
disabled "Book a visit" CTA labelled with the "coming soon" key. Bio when present. Service rows
with name, duration, price and a disabled per-service CTA. **No reviews section** — v1 has no
review text, and the aggregate is already in the header.

An id absent from `discoverable_specialists` returns 404, not an empty profile: a card that is not
discoverable must not be reachable by guessing a URL.

#### 5. Wire-up

**File**: `src/components/Topbar.astro`, `src/pages/dashboard.astro`

**Intent**: Make the new screens reachable.

**Contract**: Client nav gains Discover and Profile. The client dashboard prompts for an address
when `client_profiles` has no `area_id` — without it the wedge filter cannot default on.

### Success Criteria:

#### Automated Verification:

- `npm run build` passes
- `npm run lint` passes, CRLF-aware check empty
- `npm run check` passes — no untranslated catalog key, no type error
- `grep -rn "RATING_THRESHOLD" src/` shows exactly one read, in `discovery.ts`
- No client-side JS is emitted for `/specialists`: no island script in the built page
- The view's `min_price_cents` is never rendered for a filtered result — `grep -rn "min_price_cents" src/` shows it only inside `displayPriceFrom`'s no-filter fallback

#### Manual Verification:

- A client with a Mokotów address sees a Mokotów-declaring specialist and does not see an
  Ursynów-only one; unchecking "serves my area" reveals the second
- Category, price range and price sort each narrow or reorder correctly, and combine
- A signed-out visitor can browse and open a profile, and is sent to sign-in only on a CTA
- A specialist with no services is absent from results **and** their own banner says not visible —
  the same state on both sides
- Requesting a non-discoverable specialist's profile URL directly returns 404
- Both locales render discovery with no untranslated strings; district and category names appear
  in the active language
- Results render in under a second on a throttled connection
- The whole flow works on production after deploy

---

## Testing Strategy

### Database (pgTAP — the only automated suite)

- `client_profiles` own-row isolation across both directions, and the role gate on write
- `reviews` has no write grant for any role
- `discoverable_specialists` includes exactly the specialists a complete card describes
- Dictionary completeness: every row has `name_en`; every area has a `city_id`

### Manual

1. Two specialist accounts, one declaring Mokotów, one declaring only Ursynów; each with a service.
2. A client account with a Mokotów address.
3. Filter combinations: area on/off × category × price range × sort.
4. Regression of the full auth round-trip in both locales (phase 3 gate).
5. Multi-city selection persistence across city switches (phase 4 gate).
6. Delete a specialist's last service; confirm results and banner change together.

### Not covered

No JS test runner exists, so the zod schemas, `resolveLocale`, `ratingLabel` and the filter parser
have no automated coverage. S-02's review flagged this class of gap as the place bugs actually
appeared. These four are pure functions with no I/O and should be the first candidates when a
runner is chosen.

## Performance Considerations

The sub-second p95 NFR is the constraint that shapes three choices here: fonts are self-hosted
rather than fetched from Google, filtering is server-rendered with zero client JS, and message
catalogs never enter the browser bundle. The discovery query reads a view over three small tables
with the existing `specialist_areas_area_id_idx` and `services_category_id_idx`; at the launch
catalog size (<10 specialists per the success metric) it is not a concern, and the view keeps the
optimization surface in one place if it becomes one.

## Migration Notes

The `service_areas.city` → `city_id` conversion runs against a hosted database with real
`specialist_areas` rows. Backfill before dropping, and update the Warsaw rows in place — deleting
and re-inserting them would change `service_areas.id` values that specialist selections point at,
silently reassigning who serves where.

Phase 2 migrations are forward-only, following the precedent in
`20260803140000_listing_review_fixes.sql`: the earlier migrations are already applied on hosted, so
they are amended by new files rather than edited.

## References

- Roadmap slice S-03: `context/foundation/roadmap.md`
- PRD FR-003, FR-006–FR-009, FR-014, FR-015: `context/foundation/prd.md`
- Deferred finding F4: `context/archive/2026-08-03-specialist-service-listing/reviews/impl-review.md`
- `service_role` DML rule: `context/foundation/lessons.md`
- Design system: `context/foundation/design/_shared/styles.css`
- Mockups: `context/foundation/design/web/{discover,specialist-profile,onboarding-client,profile,dashboard-specialist,services,sign-in,sign-up}.html`
- Completeness predicate this plan replaces: `src/lib/services/specialists.ts:166-186`
- Public-read grants discovery relies on: `supabase/migrations/20260803120100_specialist_profiles_and_services.sql:96-112`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Visual foundation and i18n

#### Automated

- [x] 1.1 `npm run build` passes — 168ea67
- [x] 1.2 `npm run lint` passes and the CRLF-aware prettier check is empty — 168ea67
- [x] 1.3 `npx astro sync` succeeds after the `env.d.ts` change — 168ea67
- [x] 1.4 No `fonts.googleapis.com` reference in the built output — 168ea67

#### Manual

- [x] 1.5 Existing screens render in the new palette without layout breakage — 168ea67
- [x] 1.6 Language switcher flips Topbar strings and the choice survives a reload — 168ea67
- [x] 1.7 Polish diacritics render correctly in both fonts — 168ea67
- [x] 1.8 A fresh visitor with Polish `Accept-Language` and no cookie gets Polish — 168ea67

### Phase 2: Schema and data

#### Automated

- [x] 2.1 `npx supabase db reset` applies every migration cleanly from scratch — 7968171
- [x] 2.2 `npx supabase test db` is green, including the two pre-existing suites — 7968171
- [x] 2.3 Seed counts correct: 10 cities, ~60 areas, every area has `city_id` and `name_en` — 7968171
- [x] 2.4 `npm run build` and the CRLF-aware lint check pass after the type changes — 7968171
- [x] 2.5 `npm run check` passes — 7968171

#### Manual

- [x] 2.6 `npx supabase db push` lands on hosted without drift and the production specialist's Warsaw areas still resolve — 7968171
- [x] 2.7 `discoverable_specialists` returns the production specialist when queried as `anon` — 7968171
- [x] 2.8 Another user's `client_profiles` row is unreadable through PostgREST — 7968171

### Phase 3: Retrofit — shell, auth and dashboard

#### Automated

- [x] 3.1 `npm run build` passes — a9d9dbc
- [x] 3.2 `npm run lint` passes, CRLF-aware check empty — a9d9dbc
- [x] 3.3 `npm run check` passes — no untranslated catalog key, no type error — a9d9dbc
- [x] 3.4 Auth endpoints redirect with error keys only, no English sentences — a9d9dbc

#### Manual

- [x] 3.5 Full auth regression in both locales: sign up (both roles), sign in, sign out, forgot → reset → sign in — a9d9dbc
- [x] 3.6 A wrong password shows a translated message, not a raw key — a9d9dbc
- [x] 3.7 Every auth screen matches its mockup in layout and hierarchy — a9d9dbc
- [x] 3.8 The language switcher works from an auth screen while signed out — a9d9dbc

### Phase 4: Retrofit — specialist panel, new fields, two-step area picker

#### Automated

- [x] 4.1 `npm run build` passes
- [x] 4.2 `npm run lint` passes, CRLF-aware check empty
- [x] 4.3 `npm run check` passes — no untranslated catalog key, no type error
- [x] 4.4 No caller of `isCardComplete` remains in `src/`

#### Manual

- [x] 4.5 Selections in two cities both persist across a city switch and a save
- [x] 4.6 "Select all in this city" saves every area of that city
- [x] 4.7 Bio, duration and custom service name save and re-display; a service without them still saves
- [x] 4.8 Card-status banner flips when the last service is deleted, and back
- [x] 4.9 Role gating on `/specialist/*` still holds for a client and for a signed-out visitor
- [x] 4.10 Specialist panel has no untranslated strings in either locale

### Phase 5: Discovery

#### Automated

- [ ] 5.1 `npm run build` passes
- [ ] 5.2 `npm run lint` passes, CRLF-aware check empty
- [ ] 5.3 `npm run check` passes — no untranslated catalog key, no type error
- [ ] 5.4 `RATING_THRESHOLD` is read in exactly one place
- [ ] 5.5 `/specialists` emits no client-side island script
- [ ] 5.6 `min_price_cents` is never rendered for a filtered result

#### Manual

- [ ] 5.7 Area matching includes the covering specialist and excludes the non-covering one; the toggle reveals the second
- [ ] 5.8 Category, price range and price sort each work and combine
- [ ] 5.9 A signed-out visitor can browse and open a profile
- [ ] 5.10 A specialist with no services is absent from results and their own banner agrees
- [ ] 5.11 A non-discoverable specialist's profile URL returns 404
- [ ] 5.12 Discovery has no untranslated strings; dictionary names follow the active locale
- [ ] 5.13 Results render in under a second on a throttled connection
- [ ] 5.14 The whole flow works on production after deploy
