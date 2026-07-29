# Block Sign-up with an Already-Registered Email — Plan Brief

> Full plan: `context/changes/signup-existing-email/plan.md`

## What & Why

When someone signs up with an email that already has an account, the app currently sends them to a "check your email" page for a confirmation email that never comes (Supabase suppresses it for existing accounts). This change detects the duplicate and routes the user to sign-in with a clear message and their email pre-filled.

## Starting Point

`src/pages/api/auth/signup.ts` only checks `if (error)` on the `signUp` result and otherwise redirects to `/auth/confirm-email`. The green `?message` banner on `/auth/signin` and its rendering already exist (built in S-01 Phase 3); the sign-in form has no email-prefill hook yet.

## Desired End State

Signing up with an already-registered email lands on `/auth/signin` with "This email is already registered — sign in instead." and the email field pre-filled, on both local and hosted. New emails still flow to `/auth/confirm-email`; existing-but-unconfirmed emails still flow there too (Supabase resends confirmation) — intentionally unchanged.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Duplicate UX | Redirect to sign-in with message (Option A) | Best UX for a marketplace; enumeration tradeoff accepted | Plan |
| Detection | Dual signal: `identities:[]` OR "already registered" error | Behavior differs by `enable_confirmations` (ON hosted / OFF local) | Plan |
| Unconfirmed existing email | Leave as-is → confirm-email (resend) | They never confirmed, so resending is correct | Plan |
| Message channel | Reuse green `?message` banner | Zero new UI; consistent with S-01 reset flow | Plan |
| Email prefill | Yes, via `?email=` → `initialEmail` prop | Redirected user only types their password | Plan |

## Scope

**In scope:** duplicate detection in `signup.ts`; `?email=` prefill (`SignInForm.tsx` + `signin.astro`).

**Out of scope:** enumeration hardening, new banner styling, unconfirmed-email path, sign-up form/role changes, test-runner setup.

## Architecture / Approach

One extra check on the existing `signUp` response in `signup.ts`, placed **before** the generic `if (error)` branch (in the confirmations-OFF case the duplicate is itself an error and must route to sign-in, not back to sign-up). On duplicate → `redirect('/auth/signin?message=…&email=…')`. `SignInForm` gains an `initialEmail` prop; `signin.astro` passes `?email=` through. Everything else — role guard, null-client guard, success path — is unchanged.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Detection + redirect (with prefill) | Duplicate email → sign-in with message + prefilled email | Detection signal differs local vs hosted — handled by the dual check |

**Prerequisites:** S-01 (archived) auth flow + the Phase-3 `?message` banner — both already in place.
**Estimated effort:** ~1 short session, 3 files, 1 phase.

## Open Risks & Assumptions

- The empty-`identities` convention is a Supabase behavior, not a documented API — mitigated by OR-ing it with the structured/message error check.
- Local dev (`enable_confirmations = false`) exercises only the error signal; the `identities:[]` path is verified on hosted after deploy.

## Success Criteria (Summary)

- Existing email at sign-up → sign-in page with the green "already registered" message and email pre-filled (local + hosted).
- New email → still reaches `/auth/confirm-email` (no regression).
