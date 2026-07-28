# Domain Roles + Address-Privacy Foundation (F-01) Implementation Plan

## Overview

Establish the minimal cross-cutting data foundation the whole Arrivo MVP depends on: a `profiles` table linked 1:1 to `auth.users` carrying a `role` (client | specialist), a trigger that auto-creates a profile on sign-up, Row-Level Security that isolates each profile and prevents role self-escalation, a pgTAP test suite that proves the isolation (the address-leak verification path), and app-side propagation of the role into `context.locals`. Per the roadmap scope guard, this is roles + the privacy *pattern* only — the client address column and the acceptance-gated visibility policy land later in S-03/S-04, following the contract documented here.

## Current State Analysis

- **Auth is generic and present.** `src/pages/api/auth/signup.ts` calls `supabase.auth.signUp({ email, password })` with no role; `src/middleware.ts` attaches `context.locals.user` and gates `/dashboard`. Cookie-based SSR via `@supabase/ssr` (`src/lib/supabase.ts`).
- **No domain data.** `supabase/config.toml` exists but there is no `supabase/migrations/` directory, no `profiles`/`role` model, and no `src/types.ts`.
- **Email confirmation is on by default** — sign-up redirects to `/auth/confirm-email`. The `auth.users` row is created at `signUp` time (before confirmation), so an `AFTER INSERT` trigger on `auth.users` fires immediately.
- **Hosted Supabase project** `lhruerozshudatypngna`; secrets wired as Workers secrets. Supabase is reached over the HTTP `@supabase/ssr` client only (CLAUDE.md rule; Workers edge has no persistent TCP pooling).
- **Live on Cloudflare Workers.** `wrangler rollback` reverts the Worker but not the database — migrations must be forward-only / backward-compatible.

## Desired End State

After this plan: any account is linked to a `profiles` row with a `role`; a profile is created automatically on sign-up (role read from sign-up metadata, defaulting to `client` when absent **or invalid**); RLS guarantees a user can read only their own profile and can never change their own role; a pgTAP suite proves that isolation and runs via `supabase test db`; and `context.locals.role` carries the signed-in user's role for downstream slices. The address-privacy contract for S-03/S-04 is written down. Verify by: `supabase test db` green, a new sign-up producing a correctly-roled profile row, and `context.locals.role` populated in the running app.

### Key Discoveries:

- Sign-up entry point to extend later (S-01) — `src/pages/api/auth/signup.ts:13` (`supabase.auth.signUp`); role will be passed via `options.data.role`.
- Role propagation seam — `src/middleware.ts:13` (where `context.locals.user` is set); role fetch attaches alongside.
- Locals typing lives in `src/env.d.ts` (`App.Locals`) — must gain a `role` field.
- Supabase-from-edge rule — `@CLAUDE.md` §Architecture: HTTP client only, never direct Postgres.
- Roadmap F-01 scope guard — `@context/foundation/roadmap.md` F-01: roles + privacy pattern only; entities belong to later slices.

## What We're NOT Doing

- **No client address column and no acceptance-gated visibility policy** — deferred to S-03 (address) / S-04 (bookings). F-01 documents the contract and proves the RLS mechanism on `profiles`.
- **No role-selection UI or password recovery** — that's S-01 (this change only makes the trigger *read* a role and default it).
- **No service / booking / review entities** — later slices own their tables.
- **No CI wiring for `supabase test db`** — the test runs locally in this change; CI integration is a separate follow-up.

## Implementation Approach

Bottom-up, DB-first: stand up the local Supabase + migration workflow, land the schema/trigger/RLS as a forward-only migration with pgTAP tests proving the privacy mechanism, push to the hosted project, then wire the role into the app. Each phase is independently verifiable (`supabase test db`, then app lint/build/deploy).

## Critical Implementation Details

- **Trigger timing vs email confirmation.** Hook the profile-creation trigger on `AFTER INSERT ON auth.users`, not on confirmation — the users row exists at `signUp`, so the profile is created even for unconfirmed users. Do not gate profile creation on email confirmation.
- **Role source contract.** The trigger reads `raw_user_meta_data->>'role'` and validates it against the `user_role` enum's allowed values **before casting** (not by casting directly), defaulting to `client` when absent, empty, or any value outside `('client','specialist')`. S-01 will pass `signUp(..., { options: { data: { role } } })`; the metadata key is `role`. Document this so S-01 uses the same key. **This value is fully client-controlled** — never trust it to already be a valid enum member.
- **Role immutability = privilege boundary.** End users must never have a write path to `profiles.role` — a client self-promoting to `specialist` would bypass client-only rules. The `SECURITY DEFINER` trigger is the only writer of `role`; user-facing grants expose no `UPDATE` on `role`.
- **Forward-only migrations.** `wrangler rollback` does not revert the DB. Keep every migration backward-compatible; the app must tolerate a profile row being briefly absent (fetch returns null → treat as no role).
- **Backfill existing users.** Any `auth.users` rows created during earlier deploy smoke-tests won't have profiles; the schema migration includes a one-time backfill inserting a `client` profile for every pre-existing user.

## Phase 1: Local Supabase + migration workflow

### Overview

Bring up the local Supabase stack, link it to the hosted project, and establish the `supabase/migrations/` + pgTAP test workflow so schema changes are versioned and testable.

### Changes Required:

#### 1. Supabase local + link

**File**: `supabase/config.toml` (+ generated `supabase/migrations/`, `supabase/tests/`)

**Intent**: Initialize the migration + test directories and link the CLI to the hosted project so migrations can later be pushed. Confirm pgTAP is available in the local database for `supabase test db`.

**Contract**: `supabase link --project-ref lhruerozshudatypngna` succeeds; `supabase start` brings up the local stack (Docker); `supabase/migrations/` and `supabase/tests/database/` exist. No schema yet.

### Success Criteria:

#### Automated Verification:

- Local stack starts: `supabase start` exits 0 (Docker running).
- A scratch migration applies locally: `supabase migration new scaffold_check && supabase db reset` exits 0.
- `npm run build` still passes (no app changes).

#### Manual Verification:

- Local Studio reachable at `http://localhost:54323`.
- **Delete the `scaffold_check` migration file** created above — it was only proving the reset/apply cycle works and must not linger as a fake pending migration.
- `supabase db push --dry-run` targets project `lhruerozshudatypngna` and reports an **empty** pending migration set (confirms the scratch file is gone and nothing else has been staged yet).

**Implementation Note**: After automated verification passes, pause for confirmation that the local stack + hosted link are healthy before landing schema.

---

## Phase 2: Profiles schema + role + trigger + RLS + pgTAP tests

### Overview

Land the domain foundation as a forward-only migration: the `role` enum, the `profiles` table, RLS policies, the profile-creation trigger, a backfill for existing users, and pgTAP tests proving isolation and role immutability.

### Changes Required:

#### 1. Schema migration

**File**: `supabase/migrations/<ts>_profiles_roles_rls.sql`

**Intent**: Create the role enum and the profiles table, enable RLS with own-row read isolation and no user write path to `role`, and backfill profiles for any pre-existing users.

**Contract**: enum `user_role` = `('client','specialist')`. Table `public.profiles ( id uuid primary key references auth.users(id) on delete cascade, role user_role not null default 'client', created_at timestamptz not null default now(), updated_at timestamptz not null default now() )`. RLS enabled. Policy: authenticated users `SELECT` where `id = auth.uid()`. No `UPDATE`/`INSERT`/`DELETE` granted to end users on this table (writes happen through the trigger only). Backfill: `insert into public.profiles (id) select id from auth.users on conflict do nothing`.

#### 2. Profile-creation trigger

**File**: `supabase/migrations/<ts>_handle_new_user.sql` — **separate migration file from the schema** (not combined), so the schema and the trigger each have an isolated, independently-readable diff.

**Intent**: Auto-create a profile when an `auth.users` row is inserted, reading the role from sign-up metadata and defaulting to `client` when the value is absent, empty, **or not a recognized role** — never let an unrecognized value reach the enum cast.

**Contract**: `SECURITY DEFINER` function + `AFTER INSERT ON auth.users` trigger. The metadata value is validated against the allowed set *before* casting, not cast-and-hope:

```sql
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role)
  values (
    new.id,
    case
      when new.raw_user_meta_data->>'role' in ('client', 'specialist')
      then (new.raw_user_meta_data->>'role')::user_role
      else 'client'::user_role
    end
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

#### 3. pgTAP tests

**File**: `supabase/tests/database/profiles_rls.test.sql`

**Intent**: Prove the privacy mechanism (this is F-01's address-leak verification path): a user reads only their own profile, a new user gets a `client` profile automatically, an **invalid role value defaults safely instead of erroring**, and no user can change their own role.

**Contract**: pgTAP assertions covering — (a) inserting an `auth.users` row with valid role metadata creates exactly one matching `profiles` row with the expected role; (b) inserting an `auth.users` row with an **invalid/garbage** `role` metadata value does **not** raise an error and results in a `client` profile; (c) with `request.jwt.claim.sub` set to user A, `select` returns A's row and zero of user B's; (d) an `update … set role='specialist'` as an end-user role is rejected / affects zero rows. Runs under `supabase test db`.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `supabase db reset` exits 0.
- RLS/isolation proven: `supabase test db` passes (all pgTAP assertions green, including the invalid-role-defaults-safely case).
- Lint/build unaffected: `npm run lint` and `npm run build` pass.

#### Manual Verification:

- Create a user in local Studio (or via `signUp`) → a `profiles` row appears with the expected role.
- Push to hosted: `supabase db push` applies to `lhruerozshudatypngna`; the `profiles` table, policies, and trigger are present in the hosted project, and existing users have backfilled profiles.

**Implementation Note**: After automated verification passes, pause for confirmation of the hosted push before wiring the app.

---

## Phase 3: App integration + privacy contract

### Overview

Make the role usable by downstream slices: shared types, `context.locals.role`, and a written address-privacy contract for S-03/S-04.

### Changes Required:

#### 1. Shared entity types

**File**: `src/types.ts` (new)

**Intent**: Home for domain types so slices import from one place.

**Contract**: export `type UserRole = "client" | "specialist"` and `interface Profile { id: string; role: UserRole; created_at: string; updated_at: string }`.

#### 2. Locals typing

**File**: `src/env.d.ts`

**Intent**: Type the role on the request context.

**Contract**: extend `App.Locals` with `role: UserRole | null` (alongside the existing `user`).

#### 3. Role propagation in middleware

**File**: `src/middleware.ts`

**Intent**: After resolving the user, fetch their profile role (via the existing `@supabase/ssr` HTTP client) and attach it to `context.locals.role`; null when unauthenticated or when the profile is briefly absent.

**Contract**: `supabase.from("profiles").select("role").eq("id", user.id).single()` → `context.locals.role = data?.role ?? null`. One extra DB round-trip per request (acceptable at MVP scale; a later optimization can cache or fold into the session). No direct Postgres — HTTP client only.

#### 4. Address-privacy contract note

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Record the contract S-03/S-04 must honor so the guardrail isn't lost between slices.

**Contract**: one short entry — "Client address (added in S-03) is readable only by the owning client and by a specialist with an *accepted* booking for that client (S-04). Enforce with RLS following the `profiles` own-row isolation pattern established in F-01; the coarse area used for matching is separate from the exact address."

### Success Criteria:

#### Automated Verification:

- Types resolve: `npx astro sync` then `npm run build` pass.
- Lint passes: `npm run lint`.

#### Manual Verification:

- Sign in as a user → `context.locals.role` reflects their role (verify via a temporary debug log or the dashboard).
- Deploy: `npm run build && npx wrangler deploy` succeeds; landing + auth pages still work (no regression) on `arrivo.dyndalski.workers.dev`.

**Implementation Note**: After automated verification passes, pause for manual confirmation of the deployed behavior.

---

## Testing Strategy

### Unit / DB Tests (pgTAP):

- New user with valid role metadata → exactly one correctly-roled profile auto-created.
- New user with **absent or invalid** role metadata → profile defaults to `client` **without erroring**.
- User A sees only A's profile row under RLS; zero of B's.
- End-user role update is rejected (no self-escalation).

### Integration Tests:

- Manual: `signUp` (local) → profile row with role; middleware attaches `context.locals.role`.

### Manual Testing Steps:

1. `supabase start`, `supabase db reset`, `supabase test db` → all green.
2. Create a user locally with `role: specialist` metadata → profile row is `specialist`; without metadata → `client`; with a garbage `role` value → `client` (no error).
3. `supabase db push` to hosted; confirm table/policies/trigger + backfilled profiles.
4. `wrangler deploy`; sign in on the live URL; confirm role is available and auth still works.

## Performance Considerations

The middleware profile fetch adds one HTTP round-trip to Supabase per request. Fine at MVP traffic (Cloudflare free tier, low qps). If it becomes hot, fold the role into the session/JWT claim or cache per-request — noted, not done here.

## Migration Notes

Migrations are **forward-only** (Worker rollback doesn't revert the DB). The schema migration includes a backfill for pre-existing `auth.users`. Applied to hosted via `supabase db push`. The app tolerates a missing profile (role → null) so a brief window during push doesn't crash requests.

## References

- Roadmap item: `@context/foundation/roadmap.md` (F-01)
- Product: `@context/foundation/prd.md` (Access Control; NFR — address privacy; Guardrail)
- Platform: `@context/foundation/infrastructure.md` (Supabase-from-Workers; forward-only DB)
- Rules: `@CLAUDE.md` (HTTP client only; RLS-always convention)
- Change identity: `@context/changes/domain-data-rls-foundation/change.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Local Supabase + migration workflow

#### Automated

- [x] 1.1 Local stack starts (`supabase start` exits 0)
- [x] 1.2 Scratch migration applies (`supabase migration new` + `supabase db reset` exit 0)
- [x] 1.3 `npm run build` still passes

#### Manual

- [x] 1.4 Local Studio reachable at localhost:54323
- [x] 1.5 Scratch `scaffold_check` migration deleted; `supabase db push --dry-run` targets `lhruerozshudatypngna` and reports an empty pending set

### Phase 2: Profiles schema + role + trigger + RLS + pgTAP tests

#### Automated

- [ ] 2.1 Migration applies cleanly (`supabase db reset` exits 0)
- [ ] 2.2 `supabase test db` passes (pgTAP isolation + role-immutability + auto-create + invalid-role-defaults-safely)
- [ ] 2.3 `npm run lint` and `npm run build` pass

#### Manual

- [ ] 2.4 New user (local) → correctly-roled `profiles` row; garbage role metadata → defaults to `client` without error
- [ ] 2.5 `supabase db push` to hosted; table/policies/trigger + backfill present

### Phase 3: App integration + privacy contract

#### Automated

- [ ] 3.1 `npx astro sync` + `npm run build` pass (types resolve)
- [ ] 3.2 `npm run lint` passes

#### Manual

- [ ] 3.3 Signed-in user → `context.locals.role` reflects their role
- [ ] 3.4 `wrangler deploy` succeeds; landing + auth work, no regression