<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Block Sign-up with an Already-Registered Email

- **Plan**: context/changes/signup-existing-email/plan.md
- **Scope**: Phase 1 of 1 (1.5 hosted verification still pending — needs deploy)
- **Date**: 2026-07-29
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

All 3 planned changes MATCH; no scope creep. Duplicate-check ordering (before the generic error branch), `URLSearchParams` encoding, exact message string, and the untouched unconfirmed-existing path all verified. No XSS (Astro + React auto-escape the sinks). Automated criteria pass (build ✓, lint 0 real, curl behavior 3/3 correct). 1.5 (hosted `identities:[]` path) pending a deploy.

## Findings

### F1 — Duplicate detection on confirmations-OFF relies on a fragile error-message regex

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/signup.ts:31
- **Detail**: The confirmations-OFF (local) duplicate signal is `/already.*(registered|exists)/i.test(error.message)`, which is locale- and gotrue-version-dependent — a Supabase upgrade or a non-English message could silently stop matching. Partial mitigation: the `identities?.length === 0` OR-branch covers the confirmations-ON (hosted) path, so a regex miss degrades to the generic `/auth/signup?error=…` redirect — a UX regression, not a security/data issue.
- **Fix**: Add a structured, code-based check OR-ed in front of the regex, e.g. `(error as { code?: string })?.code === "user_already_exists"` (cast avoids AuthError type-version issues); keep the regex as a fallback.
- **Decision**: FIXED — added `error.code === "user_already_exists"` (cast) before the regex fallback

### F2 — `?message=` banner reflects arbitrary text (content-spoofing)

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/auth/signin.astro:18
- **Detail**: `?message=` is rendered via `{message}` (Astro auto-escapes → **not XSS**), but an attacker can craft `/auth/signin?message=<arbitrary>` to show a fake green "success" banner (phishing). **Pre-existing** — the banner shipped in S-01 Phase 3; this change just adds the first legitimate producer of such links. `?email=` prefill is likewise benign (React sets it as a DOM value property, not markup).
- **Fix**: Accept as low risk, or (future hardening) gate the banner to a known enum of message keys instead of reflecting free text. Out of scope for this change.
- **Decision**: ACCEPTED — pre-existing, not XSS, low risk; out of scope for this change

### F3 — `URLSearchParams` vs sibling `encodeURIComponent` (minor inconsistency / improvement)

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/auth/signup.ts:34
- **Detail**: This redirect uses `URLSearchParams` while every sibling redirect (signin.ts, forgot-password.ts, and this file's other branches) uses manual `encodeURIComponent`. `URLSearchParams` is the safer choice for a two-param URL, so this is an improvement, not a defect — flagged only as an intra-file style inconsistency.
- **Fix**: No change required. Optionally standardize siblings toward `URLSearchParams` in a future cleanup.
- **Decision**: ACCEPTED — it's an improvement, not a defect; no action
