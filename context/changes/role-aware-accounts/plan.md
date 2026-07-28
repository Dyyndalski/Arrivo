# Role-aware Accounts (S-01) Implementation Plan

## Overview

Deliver roadmap slice S-01 on the completed F-01 foundation: let a visitor **choose a role (client | specialist) at sign-up** (wired into F-01's `handle_new_user` trigger) and add a **full in-app password-recovery flow** (request → email → set new password). Sign-in and sign-out already work; this is a UI + auth-wiring slice with **no database changes**.

## Current State Analysis

- **Auth forms** are React islands (`client:load`) with local `useState` validation that POST to `/api/auth/*` endpoints: `src/components/auth/{SignUpForm,SignInForm}.tsx`, shared `FormField` / `PasswordToggle` / `SubmitButton` / `ServerError`. Pages (`src/pages/auth/*.astro`) render a form, read `?error=` from the URL, and pass it as `serverError`.
- **Endpoints** (`src/pages/api/auth/{signup,signin,signout}.ts`) read `formData`, call `supabase.auth.*` via the shared `@supabase/ssr` HTTP client (`createClient`), and `redirect` to `?error=<msg>` on failure.
- **Sign-up** currently calls `supabase.auth.signUp({ email, password })` — **no role**. `src/pages/auth/confirm-email.astro` is the post-signup "check email" page (branches on `import.meta.env.DEV`).
- **F-01 is done**: the `handle_new_user` trigger reads `raw_user_meta_data.role` (metadata key `role`, defaults to `client`, validates before cast); `context.locals.role` is populated by middleware. So sign-up just needs to **pass** `options.data.role`.
- **No password-recovery flow exists** — no forgot/reset pages, endpoints, or callback.
- **Local Supabase has Mailpit** at `http://localhost:54324` — catches the reset email for testing.

## Desired End State

A visitor can sign up as a **client** or a **specialist** (required choice), and the created profile carries that role. A user who forgot their password can request a reset from the sign-in page, receive an email, click through to set a new password, and then sign in with it. Verify: a local sign-up as `specialist` yields a `profiles.role = specialist`; the reset email lands in Mailpit; the reset link sets a new password and returns to sign-in.

### Key Discoveries:

- Role metadata contract — sign-up passes `signUp(..., { options: { data: { role } } })`; the F-01 trigger reads key `role` (`context/archive/2026-07-28-domain-data-rls-foundation/`).
- Form pattern to mirror — `src/components/auth/SignUpForm.tsx` (validation, FormField, POST-to-endpoint) and `signin.ts` (endpoint shape).
- "Check email" page pattern — `src/pages/auth/confirm-email.astro`.
- Recovery uses the PKCE code-exchange flow with `@supabase/ssr` — see Critical Implementation Details.
- Contract rule — reach Supabase over the HTTP client only (`@CLAUDE.md`), which all endpoints already do.

## What We're NOT Doing

- **No role change after sign-up / no dual-role accounts** — single-role in the MVP (PRD; deferred to v2).
- **No database changes** — F-01 already owns the schema/trigger/RLS.
- **No change to email confirmation** — sign-up still routes to `confirm-email`; role selection doesn't alter that.
- **No custom email templates / branding** — use Supabase's default recovery email for now.
- **No test-runner setup** — verification is manual (Mailpit + local Supabase), consistent with the repo (no test framework installed).

## Implementation Approach

Three phases, each independently verifiable. Phase 1 (role) is self-contained and ships FR-001. Phases 2–3 build the recovery flow request-first then reset, so each half is testable against Mailpit before the next lands.

## Critical Implementation Details

- **Password recovery is a PKCE code exchange, not a magic-link session.** `resetPasswordForEmail(email, { redirectTo })` sends an email whose link routes through Supabase and lands on `redirectTo` with a `?code=…`. A `/auth/callback` endpoint must call `supabase.auth.exchangeCodeForSession(code)` (which sets the session cookies via `@supabase/ssr`) and then redirect to the reset-password page. The reset-password page only works because that recovery session now exists; `updateUser({ password })` writes against it.
- **The `redirectTo` URL must be allow-listed on the hosted project.** Add the callback URL to Supabase → Auth → URL Configuration → Redirect URLs (and `site_url`), or the reset link is rejected. Locally, add it to `supabase/config.toml` (`auth.site_url` / `auth.additional_redirect_urls`). This is a manual hosted-config step.
- **Do not leak account existence.** `forgot-password` always redirects to the "check your email" page regardless of whether the email exists — never surface "no such user".
- **Role is required client-side AND validated server-side.** The endpoint rejects a missing/invalid role (defense in depth; the F-01 trigger also defaults invalid → `client`).

## Phase 1: Role at sign-up

### Overview

Add a required role choice to the sign-up form and pass it through the endpoint into the trigger's metadata.

### Changes Required:

#### 1. Role toggle component

**File**: `src/components/auth/RoleToggle.tsx` (new)

**Intent**: A two-option segmented control (client | specialist) styled to match the glassmorphism form, contributing a `role` form value.

**Contract**: controlled component; renders the current selection and a hidden `<input name="role">` carrying `client` | `specialist` (or empty when unpicked). Props: `value`, `onChange`, `error?`.

#### 2. Sign-up form wiring

**File**: `src/components/auth/SignUpForm.tsx`

**Intent**: Add role state, render `RoleToggle`, require a selection before submit.

**Contract**: `role` state (`"client" | "specialist" | ""`); `validate()` adds a `role` error when empty; submit blocked until a role is chosen. The `role` field posts with the form.

#### 3. Sign-up endpoint

**File**: `src/pages/api/auth/signup.ts`

**Intent**: Read and validate the role, pass it as sign-up metadata so the F-01 trigger assigns it.

**Contract**: read `role` from `formData`; if not in `('client','specialist')` → `redirect('/auth/signup?error=…')`. On valid: `supabase.auth.signUp({ email, password, options: { data: { role } } })`. Rest of the flow (error redirect, `/auth/confirm-email`) unchanged.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` + `npm run build` pass.
- `npm run lint` reports no real (non-line-ending) errors.

#### Manual Verification:

- Sign up locally choosing **specialist** → the new `profiles` row has `role = specialist` (check via Studio `:54323` / query).
- Sign up choosing **client** → `role = client`.
- Submitting sign-up without picking a role is blocked with a field error.

**Implementation Note**: Pause for manual confirmation before Phase 2.

---

## Phase 2: Password recovery — request

### Overview

Let a user request a reset email from the sign-in page.

### Changes Required:

#### 1. "Forgot password?" link

**File**: `src/components/auth/SignInForm.tsx` (or `src/pages/auth/signin.astro`)

**Intent**: Surface a link to the reset-request page.

**Contract**: a `/auth/forgot-password` link near the password field / below the form.

#### 2. Forgot-password page + form

**Files**: `src/pages/auth/forgot-password.astro` (new), `src/components/auth/ForgotPasswordForm.tsx` (new)

**Intent**: Collect the email and POST it to the request endpoint; mirror the existing form/page pattern.

**Contract**: page reads `?error=`, renders the form; form has one email `FormField`, POSTs to `/api/auth/forgot-password`.

#### 3. Forgot-password endpoint

**File**: `src/pages/api/auth/forgot-password.ts` (new)

**Intent**: Trigger the reset email; never leak account existence.

**Contract**: `supabase.auth.resetPasswordForEmail(email, { redirectTo: <origin>/auth/callback?next=/auth/reset-password })`; **always** redirect to the "check your email" page (Phase-2 page below) regardless of result.

#### 4. "Check your email" page

**File**: `src/pages/auth/forgot-password-sent.astro` (new)

**Intent**: Confirmation that a reset link was sent (mirrors `confirm-email.astro`).

**Contract**: static page with a "check your inbox / back to sign in" message.

#### 5. Redirect-URL config (manual)

**Files**: `supabase/config.toml` (local) + hosted Supabase Auth URL config

**Intent**: Allow-list the callback URL so the reset link is accepted.

**Contract**: local `auth.additional_redirect_urls` includes the callback; hosted project → Auth → Redirect URLs includes the deployed callback URL (`https://arrivo.dyndalski.workers.dev/auth/callback`).

### Success Criteria:

#### Automated Verification:

- `npm run build` passes; `npm run lint` no real errors.

#### Manual Verification:

- "Forgot password?" link is visible on the sign-in page and routes to `/auth/forgot-password`.
- Submitting an email → lands on the "check your email" page.
- The reset email appears in **Mailpit** (`:54324`) with a working link.

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: Password recovery — reset

### Overview

Exchange the reset link's code for a recovery session and let the user set a new password.

### Changes Required:

#### 1. Auth callback endpoint

**File**: `src/pages/api/auth/callback.ts` (new)

**Intent**: Exchange the PKCE code for a session (sets cookies), then continue to the reset page.

**Contract**: read `code` + `next` from the URL; on success redirect to `next` (default `/auth/reset-password`); on missing/failed code redirect to `/auth/forgot-password?error=…`. Non-obvious core:

```ts
const code = url.searchParams.get("code");
const { error } = await supabase.auth.exchangeCodeForSession(code);
// success → redirect(next ?? "/auth/reset-password"); error → redirect("/auth/forgot-password?error=...")
```

#### 2. Reset-password page (session-gated)

**File**: `src/pages/auth/reset-password.astro` (new)

**Intent**: Only render the form when a recovery session exists; otherwise send the user back to request a new link.

**Contract**: server-side, resolve the user via `createClient` + `auth.getUser()`; if none → `redirect('/auth/forgot-password?error=Link expired or invalid — request a new one')`; else render `ResetPasswordForm` (passing `?error=`).

#### 3. Reset-password form

**File**: `src/components/auth/ResetPasswordForm.tsx` (new)

**Intent**: New-password entry mirroring sign-up's validation.

**Contract**: password + confirm-password `FormField`s, min-length 6, match check (reuse the SignUpForm rules); POSTs to `/api/auth/reset-password`.

#### 4. Reset-password endpoint

**File**: `src/pages/api/auth/reset-password.ts` (new)

**Intent**: Set the new password on the recovery session, then return to sign-in.

**Contract**: `supabase.auth.updateUser({ password })`; on success `redirect('/auth/signin?message=Password updated — sign in')`; on error `redirect('/auth/reset-password?error=…')`. (Sign-in page renders a `?message=` success note.)

### Success Criteria:

#### Automated Verification:

- `npx astro sync` + `npm run build` pass; `npm run lint` no real errors.

#### Manual Verification:

- Click the reset link from Mailpit → land on `/auth/reset-password` with the form (session established).
- Set a new password → redirected to sign-in with a success message; signing in with the new password works.
- Visit `/auth/reset-password` directly (no valid token) → redirected to `/auth/forgot-password` with the "link expired" message.
- Deploy (`npm run build && npx wrangler deploy`) and run the flow end-to-end on `arrivo.dyndalski.workers.dev` (requires the hosted redirect-URL config + a real inbox).

**Implementation Note**: Pause for manual confirmation.

---

## Testing Strategy

### Manual Testing Steps:

1. **Role:** local sign-up as specialist and as client → verify `profiles.role`; unpicked role is blocked.
2. **Recovery request:** "Forgot password?" → submit → "check email" page → reset email in Mailpit (`:54324`).
3. **Recovery reset:** follow the Mailpit link → set new password → sign in with it; direct visit without token → bounced to forgot-password.
4. **Hosted:** after `wrangler deploy` + redirect-URL config, run the reset flow against a real inbox.

No unit/integration test runner exists in the repo; verification is manual against local Supabase + Mailpit.

## Performance Considerations

None beyond the existing per-request auth cost. Recovery endpoints are low-frequency.

## Migration Notes

**No database migrations.** One manual hosted-config change: add the `/auth/callback` URL to the Supabase project's Auth Redirect URLs (and mirror locally in `config.toml`).

## References

- Roadmap item: `@context/foundation/roadmap.md` (S-01)
- Product: `@context/foundation/prd.md` (FR-001, FR-002)
- Foundation (role contract): `@context/archive/2026-07-28-domain-data-rls-foundation/plan.md`
- Rules: `@CLAUDE.md` (HTTP client only)
- Change identity: `@context/changes/role-aware-accounts/change.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Role at sign-up

#### Automated

- [x] 1.1 `npx astro sync` + `npm run build` pass — c4c90e8
- [x] 1.2 `npm run lint` reports no real (non-line-ending) errors — c4c90e8

#### Manual

- [x] 1.3 Sign up as specialist → `profiles.role = specialist`; as client → `client` — c4c90e8
- [x] 1.4 Sign-up without a role is blocked with a field error — c4c90e8

### Phase 2: Password recovery — request

#### Automated

- [x] 2.1 `npm run build` passes; `npm run lint` no real errors — 2ba821b

#### Manual

- [x] 2.2 "Forgot password?" link on sign-in routes to `/auth/forgot-password` — 2ba821b
- [x] 2.3 Submitting an email lands on the "check your email" page — 2ba821b
- [x] 2.4 Reset email appears in Mailpit (`:54324`) with a working link — 2ba821b

### Phase 3: Password recovery — reset

#### Automated

- [ ] 3.1 `npx astro sync` + `npm run build` pass; `npm run lint` no real errors

#### Manual

- [ ] 3.2 Reset link → `/auth/reset-password` renders (session established)
- [ ] 3.3 Setting a new password → sign-in with success message; new password works
- [ ] 3.4 Direct visit to `/auth/reset-password` without a token → bounced to `/auth/forgot-password`
- [ ] 3.5 `wrangler deploy` + hosted redirect-URL config → reset flow works end-to-end on the live URL
