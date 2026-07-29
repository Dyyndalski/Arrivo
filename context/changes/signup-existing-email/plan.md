# Block Sign-up with an Already-Registered Email — Implementation Plan

## Overview

When a visitor tries to sign up with an email that already has an account, route them to the sign-in page with a friendly message and their email pre-filled — instead of the current behavior, which drops them on a "check your email" page for a confirmation email that never arrives. Small, single-endpoint change plus a tiny sign-in-form tweak; reuses the green `?message` banner built in S-01 Phase 3.

## Current State Analysis

- `src/pages/api/auth/signup.ts` calls `supabase.auth.signUp({ email, password, options: { data: { role } } })`, checks only `if (error)`, and otherwise redirects to `/auth/confirm-email`. It never inspects the returned `data.user`.
- **Supabase's duplicate-email behavior depends on the "Confirm email" setting, which differs between environments:**
  - **Hosted / production (`enable_confirmations = ON`):** signing up with an already-registered **confirmed** email returns **no error** and an obfuscated user with an **empty `identities` array** (anti-enumeration). Current code falls through to `/auth/confirm-email` → the confusing "no email arrives" dead-end the user hit.
  - **Local dev (`enable_confirmations = false`, `supabase/config.toml:209`):** a duplicate returns an **error** ("User already registered"). Current code sends it to `/auth/signin`… no — to `/auth/signup?error=…`.
- `src/pages/auth/signin.astro` already reads `?message=` and renders a **green success banner** (added in S-01 Phase 3) plus `?error=` via `ServerError`. `src/components/auth/SignInForm.tsx` seeds its email field from `useState("")` — no prefill hook yet.
- No test runner in the repo (per `CLAUDE.md`) — verification is manual.

## Desired End State

Signing up with an already-registered email lands the user on `/auth/signin` showing "This email is already registered — sign in instead." with the email field pre-filled, on both hosted and local. A brand-new email still flows to `/auth/confirm-email` unchanged. An existing-but-**unconfirmed** email still flows to `/auth/confirm-email` (Supabase resends confirmation) — intentionally left as-is.

### Key Discoveries:

- Dual-signal detection is required — `data.user.identities.length === 0` (confirmations ON / hosted) OR an "already registered" error (confirmations OFF / local). Relying on one signal alone breaks in the other environment.
- The green `?message` banner and its rendering already exist in `src/pages/auth/signin.astro` (S-01 Phase 3) — reuse verbatim.
- `src/components/auth/SignInForm.tsx` follows the `Props { serverError }` pattern; adding an `initialEmail` prop mirrors it.
- Lesson `[[real-prettier-errors-hide-among-crlf-noise-in-local-lint]]` — verify lint with the CRLF-aware check, not a blanket `grep -v prettier/prettier`.

## What We're NOT Doing

- **No change to the "unconfirmed existing email" path** — it keeps going to `/auth/confirm-email` (Supabase resends the confirmation); a user who never confirmed can't sign in anyway.
- **No account-enumeration hardening** — Option A deliberately reveals that an email is registered; that is the accepted product tradeoff for this change.
- **No new banner component / styling** — reuse the existing green `?message`.
- **No changes to the sign-up form fields, role handling, or the confirm-email page.**
- **No test-runner setup** — manual verification only.

## Critical Implementation Details

- **Detection must run before the generic `if (error)` branch.** In the confirmations-OFF (local) case the duplicate *is* an error; if the generic error handler runs first it would bounce the user back to `/auth/signup?error=…` instead of to sign-in. Order: duplicate-check → generic-error → success.
- **Duplicate detection is the one non-obvious bit** — the empty-`identities` signal is an undocumented-looking Supabase convention. Prefer a structured error check (`error.code === "user_already_exists"`) with a message-regex fallback, OR-ed with the identities check:

  ```ts
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { role } } });
  const alreadyRegistered =
    data.user?.identities?.length === 0 ||
    (error?.code === "user_already_exists") ||
    (!!error && /already.*(registered|exists)/i.test(error.message));
  ```

## Phase 1: Duplicate-email detection → redirect to sign-in (with prefill)

### Overview

Detect an already-registered email in the sign-up endpoint and redirect to sign-in with a message + email prefill; teach the sign-in form to accept a pre-filled email.

### Changes Required:

#### 1. Sign-up endpoint — duplicate detection + redirect

**File**: `src/pages/api/auth/signup.ts`

**Intent**: After `signUp`, detect an already-registered email via the dual signal and redirect to `/auth/signin` with a friendly message and the email, before the generic error branch. New emails and unconfirmed-existing emails are unaffected.

**Contract**: compute `alreadyRegistered` (see Critical Implementation Details) from the `signUp` result; if true → `redirect('/auth/signin?message=…&email=…')` (URL-encode both via `URLSearchParams`). Keep the existing role guard, null-client guard, generic `if (error)` → `/auth/signup?error=…`, and success → `/auth/confirm-email`. Duplicate-check sits immediately after the `signUp` call and before `if (error)`.

#### 2. Sign-in form — accept a pre-filled email

**File**: `src/components/auth/SignInForm.tsx`

**Intent**: Let the form start with an email already in the field so a redirected user only types their password.

**Contract**: add optional prop `initialEmail?: string`; seed `useState(initialEmail ?? "")` for the email field. No other behavior change.

#### 3. Sign-in page — pass the prefill through

**File**: `src/pages/auth/signin.astro`

**Intent**: Read `?email=` from the URL and hand it to `SignInForm`.

**Contract**: read `Astro.url.searchParams.get("email")`; pass as `initialEmail` to `<SignInForm>`. The existing `?message=` green banner and `?error=` handling stay as-is.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` + `npm run build` pass.
- `npm run lint` reports no real (non-CRLF) errors — check via `npx eslint . | grep 'prettier/prettier' | grep -v '␍'` empty AND no non-prettier problems (per the CRLF lesson).

#### Manual Verification:

- **Local (confirmations OFF → error signal):** sign up at `http://localhost:4321/auth/signup` with an email that already exists locally → redirected to `/auth/signin` with the green "already registered" message and the email pre-filled.
- **New email:** sign up with a fresh email → still lands on `/auth/confirm-email` (no regression).
- **Hosted (confirmations ON → identities signal):** after deploy, repeat on `https://arrivo.dyndalski.workers.dev/auth/signup` with an already-registered email → same redirect + message + prefill. (This is the environment where the original bug appeared; the local test does not exercise the `identities:[]` path because local confirmations are OFF.)

**Implementation Note**: After automated checks pass, pause for manual confirmation before the phase-end commit.

## Testing Strategy

### Manual Testing Steps:

1. Local duplicate → sign-in redirect + green message + prefilled email.
2. New email → confirm-email (regression check).
3. Deploy (`npm run build && npx wrangler deploy`) → repeat the duplicate test on the live URL to exercise the hosted `identities:[]` path.

No unit/integration runner exists; verification is manual against local Supabase + the live Worker.

## Performance Considerations

None — one extra in-memory check on the existing `signUp` response.

## Migration Notes

No database or schema changes. No config changes required (detection handles both `enable_confirmations` states). Optional: to exercise the hosted-style `identities:[]` path locally, temporarily set `enable_confirmations = true` in `supabase/config.toml` and `npx supabase stop && npx supabase start` — not required for shipping.

## References

- Change identity: `@context/changes/signup-existing-email/change.md`
- Sign-up endpoint: `src/pages/api/auth/signup.ts`
- Reused banner: `src/pages/auth/signin.astro` (S-01 Phase 3, `?message=`)
- Archived S-01 (auth flow this builds on): `@context/archive/2026-07-28-role-aware-accounts/plan.md`
- Lessons: `@context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Duplicate-email detection → redirect to sign-in (with prefill)

#### Automated

- [x] 1.1 `npx astro sync` + `npm run build` pass
- [x] 1.2 `npm run lint` reports no real (non-CRLF) errors

#### Manual

- [x] 1.3 Local: sign up with an existing email → redirected to sign-in with green message + prefilled email
- [x] 1.4 New email → still lands on `/auth/confirm-email` (no regression)
- [ ] 1.5 Hosted (after deploy): existing email → same redirect + message + prefill (exercises the `identities:[]` path)
