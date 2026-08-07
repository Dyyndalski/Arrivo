<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Client Booking Request (S-04)

- **Plan**: `context/changes/client-booking-request/plan.md`
- **Scope**: Full plan, phases 1–3
- **Commits**: `73a8a50` (p1), `9543e80` (p2), `fdcea21` (CI fix), `0118962` (p3), `1dfb883` (epilogue)
- **Date**: 2026-08-07
- **Verdict**: NEEDS ATTENTION → resolved (all four fixed)
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | WARNING |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

**Evidence base**, all re-run with exit codes checked rather than by grepping output — the habit
that let a crashing linter pass for four commits (`fdcea21`):

- `npm run build` → 0
- `npm run check` → 0 (0 errors, 0 warnings)
- `npx eslint .` → 1, zero non-CRLF problems, zero crash markers
- `npx supabase test db` → 0, **73 assertions across four files**

Behaviour verified against real endpoints during implementation: 18:00 Warsaw stores as 16:00Z and
reads back as 18:00; the duplicate is refused by name; 1-hour-away and 200-days-out are rejected;
the missing-district round trip returns to the form; a second client sees nothing. Deployed and
checked live as `741db301`.

## Findings

### F1 — The note sits on the pre-acceptance side of the privacy split

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architecture
- **Location**: `supabase/migrations/20260807100000_bookings.sql` — `bookings.note`
- **Detail**: The entire two-table design exists because RLS grants whole rows, so anything a
  specialist may not see before accepting had to be moved off `bookings`. Street, postal code,
  phone and name were moved. `note` was not — it is a 500-character free-text column on
  `bookings`, readable by the addressed specialist the moment the request lands.

  It is the one field on that table whose contents the client types. The mockup's own placeholder
  is "proszę o dzwonek do domofonu 12", and a client following that spirit writes "trzecie piętro,
  Kwiatowa 12" — which is the address, disclosed before acceptance, through the field this slice
  added. A phone number fits just as easily.

  This is not a policy bug: the policies do exactly what they say. It is a hole in the *shape* of
  the split, and it undoes the guarantee the split was built to provide.

  Nothing renders it yet — the specialist's inbox is S-05 — so this is the last moment it can be
  fixed without a data migration.
- **Fix A ⭐ Recommended**: Move `note` to `booking_contact_details`, so it is revealed with the
  address it may contain.
  - Strength: Restores the invariant "everything the client typed is behind acceptance" — which is
    a rule a reader can check, unlike "everything except one field". The note is logistical ("ring
    doorbell 12"); it is needed for the visit, not for the decision to accept.
  - Tradeoff: A specialist decides without context that might change their answer ("fourth floor,
    no lift"). That was the third option at planning time and was rejected then — but the privacy
    consequence was not on the table.
  - Confidence: HIGH — the column placement and the policies were read directly.
  - Blind spot: Whether specialists would in practice want the note before deciding; no user
    signal either way.
- **Fix B**: Keep it on `bookings` and warn in the UI that the note is visible immediately.
  - Strength: Preserves the decision context; the client is told, so any disclosure is informed.
  - Tradeoff: Leaves the guarantee as "private, except this box" — the kind of caveat that gets
    lost the next time someone reasons about the contract.
- **Decision**: FIXED via Fix A — `20260807120000` moves `note` onto `booking_contact_details` and
  `request_booking` writes it there. No environment held a booking yet, so it is a plain move
  rather than a copy-then-drop. Two pgTAP assertions now pin the column's absence from `bookings`
  and its presence on the contact row, so the shape cannot drift back. The cost — a specialist
  decides without logistical context — is accepted deliberately and recorded in the migration.

### F2 — `request_booking` trusts `p_area_id` completely

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260807100000_bookings.sql` — `public.request_booking`
- **Detail**: The function is careful about everything else it is given: it re-derives the client
  from `auth.uid()`, checks the caller's role, verifies the service belongs to the named
  specialist, and verifies the specialist is discoverable. `p_area_id` is inserted unchecked —
  the only constraint is the foreign key, so any valid district id is accepted.

  The endpoint does the right thing and reads the district from the saved profile, precisely so a
  tampered POST cannot choose one (`src/pages/api/bookings/index.ts`). But the function is the
  security boundary — it is `SECURITY DEFINER`, callable directly over PostgREST by any
  authenticated client — and it does not enforce what the endpoint politely does.

  Consequence: a direct RPC can file a request claiming a district the client does not live in,
  and one the specialist does not serve. That is the field the specialist uses to decide whether
  the journey is worth it, and the one the wedge is built on.
- **Fix**: Derive `p_area_id` inside the function from `client_profiles` for `auth.uid()` and drop
  the parameter, mirroring how `v_client` is derived rather than passed. Optionally also assert
  the specialist declares that area.
- **Decision**: FIXED in the same migration. The district is now read from the caller's own
  `client_profiles` row and the argument is ignored; the parameter stays in the signature so the
  call site is unchanged. A client with no district raises 23502, which the endpoint already
  prevents by routing them to set one. Pinned by an assertion that passes Ursynów and expects the
  profile's Mokotów to win.

### F3 — The form promises 48 hours for a booking that expires in three

- **Severity**: 📋 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/pages/specialists/[id]/book/[serviceId].astro` — `booking.subtitle`
- **Detail**: The subtitle reads "Specjalista potwierdzi lub odrzuci w ciągu 48 godzin",
  unconditionally. `expires_at` is `least(now() + 48h, proposed_at)` — the second bound added
  during planning precisely because same-day bookings are allowed.

  So a client booking a visit three hours out is told they will hear within 48 hours, while the
  request actually dies in three. The data model resolves the conflict between "3-hour minimum
  lead" and "48-hour window" correctly; the copy still states only half of it.
- **Fix**: Compute the promise from the same `least(...)` the function uses and render it as a
  moment ("do 18:00 dzisiaj") rather than a fixed duration, or fall back to a duration only when
  the 48-hour bound is the binding one.
- **Decision**: FIXED, more simply than proposed — the copy now states BOTH bounds in one
  sentence ("before the time you propose, and within 48 hours at the latest"), which is true in
  every case and needs no client-side branch on a value the form does not know until the user
  picks it.

### F4 — A specialist can open the client's bookings screen

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/pages/account/bookings.astro`, `src/middleware.ts`
- **Detail**: `/account` is in `PROTECTED_ROUTES`, which gates signed-out visitors only. A
  specialist opening `/account/bookings` gets the page, titled "Moje rezerwacje", with an empty
  list — `listOwnBookings` filters on `client_id`, so there is nothing to leak. It is a dead end
  rather than a defect, but `/account/profile` has the same shape and the booking form guards its
  role explicitly, so the codebase is inconsistent with itself.
- **Fix**: Redirect a non-client to `/dashboard`, as the booking form already does.
- **Decision**: FIXED on `/account/bookings` AND `/account/profile` — the latter had the same
  shape and a comment explaining why it was acceptable, which was the inconsistency the finding
  was really about.

## Notes

- The plan's phase-1 contract said `booking_contact_details` would carry an insert policy for the
  owning client. The migration has no insert grant at all — every write goes through
  `request_booking`. The implementation is stricter than the plan, and correct; recording it so a
  future reader is not confused by the difference.
- S-04's two most serious defects — `service_role` holding DML on the private tables in
  production, and ESLint crashing for four commits — were both found by accident (a `db diff` run
  for another purpose, and the user reporting a red build) rather than by any planned check. This
  review is the first deliberate look at the slice.
