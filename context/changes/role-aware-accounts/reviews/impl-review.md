<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Role-aware Accounts (S-01)

- **Plan**: context/changes/role-aware-accounts/plan.md
- **Scope**: Phases 1–2 of 3 (completed phases)
- **Date**: 2026-07-28
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

All 8 planned items across Phases 1–2 verified MATCH (RoleToggle, SignUpForm wiring, signup endpoint role metadata; forgot-password link, page+form, endpoint, "check email" page, config redirect URLs). No MISSING, no scope-violating EXTRA. No account-existence leak in the recovery flow. Automated criteria pass (build ✓, lint 0 real errors after eb3d957; CI green). Manual criteria confirmed by user + Mailpit evidence.

## Findings

### F1 — RoleToggle Tailwind class order failed CI lint (already fixed)

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/components/auth/RoleToggle.tsx:33
- **Detail**: prettier-plugin-tailwindcss required reordering `focus:ring-2 focus:ring-purple-400 focus:outline-none`. This single *real* prettier error was masked locally among 879 CRLF prettier errors — the local `grep -v prettier/prettier` verification filter dropped it together with the CRLF noise — so it slipped through to CI, where `npm run lint` failed and `build` was skipped (runs for c4c90e8 and 2ba821b both red). Fixed in eb3d957; CI now green.
- **Fix**: Code already fixed. Record as a recurring lesson: distinguish real prettier errors from CRLF noise by *message content* (CRLF = "Delete `␍`"), not by rule name; or add `.gitattributes` (`* text=auto eol=lf`) so the working tree checks out LF and the noise disappears at the source.
- **Decision**: ACCEPTED-AS-RULE (lessons.md) — code already fixed in eb3d957; `.gitattributes` durable fix declined for now

### F2 — forgot-password endpoint swallows a null-client misconfig silently

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/forgot-password.ts:9
- **Detail**: Siblings `signin.ts`/`signup.ts` redirect with `?error=Supabase is not configured` when `createClient` returns null; here `if (supabase && email)` falls through to the "sent" page. Correct for the no-leak design, but a genuine Supabase misconfiguration yields a silent success (no email sent, no server signal) that is hard to diagnose.
- **Fix**: `console.error` server-side when `supabase` is null so the misconfig isn't invisible; keep the user-facing redirect unchanged (preserves no-leak).
- **Decision**: FIXED — added server-side `console.error` on null client; redirect unchanged

### F3 — resetPasswordForEmail not wrapped; a throw breaks the always-redirect guarantee

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/forgot-password.ts:12
- **Detail**: No try/catch around `resetPasswordForEmail`. If the call rejects (edge transport/network error), the handler throws → 500 instead of the intended "sent" redirect, breaking the always-redirect (no-leak) guarantee. Unlikely — it resolves for unknown emails — and siblings share the shape.
- **Fix**: Wrap in try/catch and redirect to `/auth/forgot-password-sent` in both branches.
- **Decision**: FIXED — wrapped `resetPasswordForEmail` in try/catch (logs, swallows); final redirect unchanged

### F4 — reset link targets routes that don't exist yet (Phase 3 dependency)

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence (cross-phase)
- **Location**: src/pages/api/auth/forgot-password.ts:13
- **Detail**: `redirectTo` points at `/auth/callback?next=/auth/reset-password`; neither route exists until Phase 3, so the emailed link 404s end-to-end as shipped. Explicitly deferred by the plan (inline comment marks it "Phase 3") — informational, not drift. The `config.toml` `/**` wildcards already cover the future callback path.
- **Fix**: None — land Phase 3. Don't announce password recovery as user-complete before then.
- **Decision**: ACCEPTED — known cross-phase dependency; resolved by Phase 3

### F5 — new API endpoints lack schema validation (CLAUDE.md convention)

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/auth/{signup,forgot-password}.ts
- **Detail**: CLAUDE.md states API routes should validate input with a schema validator (zod intended, not yet in package.json). These endpoints validate ad hoc (signup's role guard) or not at all (forgot-password's email). Consistent with the existing `signin.ts` sibling, so no *new* divergence, and zod isn't installed — but the convention is documented.
- **Fix**: Defer — when zod lands (first endpoint that needs it), retrofit the auth endpoints. Optionally record as lesson.
- **Decision**: ACCEPTED-AS-RULE (lessons.md) — zod retrofit deferred; user chose lesson over fix-now
