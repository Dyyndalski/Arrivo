<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Role-aware Accounts (S-01) — Phase 3

- **Plan**: context/changes/role-aware-accounts/plan.md
- **Scope**: Phase 3 of 3 (Password recovery — reset)
- **Date**: 2026-07-29
- **Verdict**: REJECTED at review → APPROVED after triage (F1 critical fixed; F2/F4 fixed; F3 accepted)
- **Findings**: 1 critical, 1 warning, 2 observations (all triaged)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

All 4 planned items MATCH. Both intentional deviations (A: callback at `src/pages/auth/callback.ts` to serve `/auth/callback`; B: recovery gate in middleware, not the page) verified correct and equivalent. The recovery-session → `locals.user` → gate flow is confirmed wired. One exploitable open-redirect must be fixed. 3.5 (hosted end-to-end) still pending as a deploy step.

## Findings

### F1 — Open redirect in /auth/callback via backslash bypass

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/auth/callback.ts:11
- **Detail**: The `next` guard `rawNext.startsWith("/") && !rawNext.startsWith("//")` is bypassable with a backslash: `next="/\evil.com"` passes both checks, and browsers (WHATWG URL parsing) normalize `\`→`/`, resolving `/\evil.com` to protocol-relative `//evil.com` → `http://evil.com`. `context.redirect()` emits it verbatim as `Location`. This is a working open redirect on the exact endpoint baked into every reset email. (`%2F%2Fevil` is NOT a bypass; the backslash case is.)
- **Fix**: Validate same-origin by resolving against the origin instead of prefix-matching: `const t = new URL(rawNext, context.url.origin); next = t.origin === context.url.origin ? t.pathname + t.search : "/auth/reset-password"` (wrapped in try/catch). `new URL` normalizes the backslash and the resulting `origin` won't match, so it's rejected. (Alternative: hard-code the destination and drop `next` — it's always `/auth/reset-password` in the only caller.)
- **Decision**: FIXED via Fix A — same-origin validation with `new URL(rawNext, origin)`

### F2 — No server-side password validation in reset endpoint

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/reset-password.ts:6
- **Detail**: `password` is read as `form.get("password") as string` (may be null/empty on a direct POST bypassing the React min-length check) and passed straight to `updateUser`. Functionally backstopped by Supabase's password policy (its `error` is redirected back), so not exploitable — but there's no explicit server gate; min-length is enforced client-side only. Same class as the F5 zod gap from the Phase 1-2 review.
- **Fix**: Add a presence + min-length (6) check server-side before `updateUser`, mirroring `signup.ts`'s role guard; on failure redirect to `/auth/reset-password?error=…`. Or accept Supabase-enforced behavior as a documented decision.
- **Decision**: FIXED — added server-side presence + min-length(6) guard before updateUser

### F3 — Recovery gate asserts any session, not a recovery-specific one

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:41
- **Detail**: The gate checks `!context.locals.user` — i.e. that *a* session exists, not specifically a recovery session. An already-logged-in user could open `/auth/reset-password` and change their own password. Acceptable UX (a logged-in user changing their password is benign), but the code comment implies "recovery-only," which is slightly inaccurate.
- **Fix**: Accept as-is (benign) and optionally soften the comment; a true recovery-only gate isn't worth the complexity for the MVP.
- **Decision**: ACCEPTED — behavior kept (benign); comment softened to not imply recovery-only

### F4 — No try/catch around exchangeCodeForSession / updateUser

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/auth/callback.ts:19, src/pages/api/auth/reset-password.ts:14
- **Detail**: No try/catch around the Supabase auth calls. They return `{ error }` for auth failures (handled), but an edge transport throw would surface as an unstyled 500. Matches the existing sibling shape exactly (`signin.ts:13`, `signup.ts:22` are equally unwrapped) — pattern-consistent, not a new regression.
- **Fix**: Optional — wrap all four auth-endpoint calls in try/catch together (feature-wide), or leave consistent with siblings. Note the Phase-2 forgot-password.ts already got a try/catch (F3 there), so there's mild inconsistency.
- **Decision**: FIXED — wrapped exchangeCodeForSession + updateUser in try/catch (log + graceful redirect), matching forgot-password.ts
