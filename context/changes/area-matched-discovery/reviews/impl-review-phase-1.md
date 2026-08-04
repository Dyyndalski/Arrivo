<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Area-Matched Specialist Discovery — Phase 1

- **Plan**: `context/changes/area-matched-discovery/plan.md`
- **Scope**: Phase 1 of 5 — visual foundation and i18n
- **Commit**: `168ea67` (26 files, +739/−119)
- **Date**: 2026-08-04
- **Verdict**: NEEDS ATTENTION → resolved (F1–F4 fixed; F5, F6 deliberately skipped)
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

**Evidence base**: all four automated criteria re-run green at review time (`npm run build`,
CRLF-aware lint with zero non-prettier errors or warnings, `npx astro sync`, no
`fonts.googleapis.com` in `dist/`). `npx astro check` reports 0 errors on a clean tree. Manual
criteria 1.5–1.8 confirmed by the user. Catalog leakage into the client bundle was checked
directly against `dist/client/` and is clean.

**Two plan deviations were surfaced during implementation and approved by the user**, so they are
not re-litigated as findings: `bg-cosmic` retained as `TRANSITIONAL` (ten screens depend on it and
would render white-on-cream until phases 3–4), and the language-switcher probe extended to
`dashboard.astro` because `Topbar` renders only on the landing page, which is out of retrofit
scope.

## Findings

### F1 — Nothing the build or CI runs enforces translation parity

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/lib/i18n/messages/en.ts:6-9`, `src/lib/i18n/messages/pl.ts:5-7`, `package.json`
- **Detail**: `en` is typed `Record<MessageKey, string>` and the docstrings in **both** catalogs
  state that a missing English key "fails the build" / is "a build failure rather than a runtime
  fallback". Tested by adding `"probe.missing.in.en"` to `pl.ts` only:
  - `npm run build` — **passed**
  - `npm run lint` — **silent** (typescript-eslint reports type-aware *lint rules*, not TS compile
    errors)
  - `npx astro check` — caught it, 1 error

  There is no `check` script in `package.json` and `.github/workflows/ci.yml` runs lint + build.
  So the guarantee both files advertise does not exist on any path anyone actually runs.

  The runtime consequence is not a graceful fallback. `t()` calls
  `interpolate(CATALOGS[locale][key], params)`; with a missing key that is `interpolate(undefined,
  …)`, which returns `undefined` when there are no params — rendering the literal text
  "undefined" on the page — and throws `TypeError: Cannot read properties of undefined (reading
  'replace')` when there are, i.e. a 500. Verified both.

  This is cheap now and expensive later: phases 3–5 add auth, specialist and discovery strings to
  a key space that is currently 20 keys.
- **Fix**: Add `"check": "astro check"` to `package.json`, run it in `.github/workflows/ci.yml`
  alongside lint, and add it to the automated success criteria of phases 2–5.
  - Strength: Turns the type-level parity contract into an enforced one on the path CI already
    takes; `astro check` is already a dependency (`@astrojs/check`) and is green on the current
    tree, so it starts from zero debt.
  - Tradeoff: One more CI step and one more gate that can fail a phase; `astro check` is slower
    than lint.
  - Confidence: HIGH — measured directly, both the miss and the catch.
  - Blind spot: Not verified whether `astro check` is clean against the *pre-existing* starter
    code under a stricter future tsconfig; it is clean today.
- **Decision**: FIXED — `"check": "astro check"` added to `package.json`; CI runs it after
  `astro sync` and before lint; the false "fails the build" claim corrected in both catalog
  docstrings; a `npm run check` row added to the automated criteria of phases 2–5 (Progress
  renumbered accordingly, 47 rows, no duplicates). Verified green.

### F2 — Self-hosted fonts ship without their OFL licence

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `public/fonts/`
- **Detail**: `public/fonts/` contains four `woff2` binaries and nothing else. Inter and Fraunces
  are both SIL Open Font License 1.1. Serving them from our own origin is redistribution, and the
  OFL requires the licence text and copyright notice to accompany redistributed copies. Loading
  them from Google's CDN — which is what the mockups did — carried no such obligation, so this
  duty was created by this phase's change, not inherited.
- **Fix**: Add `public/fonts/OFL.txt` with the SIL OFL 1.1 text and the two copyright lines
  (Rasmus Andersson for Inter; Undercase Type for Fraunces), and note the source in the
  `@font-face` comment block in `src/styles/global.css`.
- **Decision**: FIXED — shipped as two verbatim files, `OFL-Inter.txt` and `OFL-Fraunces.txt`,
  rather than one merged text: the two projects' bodies differ cosmetically (whitespace, `&` vs
  `AND`), and shipping each as published avoids adjudicating which is canonical. Added
  `public/fonts/README.md` with provenance, the subset table and regeneration steps, and
  cross-referenced it from the `@font-face` block.

### F3 — Six UI primitives were committed without ever being rendered

- **Severity**: 📋 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `src/components/ui/{Card,Badge,Avatar,Chip,Stars,EmptyState}.astro`
- **Detail**: All six have zero consumers in `src/` — by design, since the plan positions them for
  phases 3–5. The consequence is that none of them has been rendered even once. `astro check`
  covers their prop types and lint covers their syntax, but neither executes a template: a wrong
  token name (`bg-teal-soft` vs `bg-teal-soft-text`), a broken `class:list` array, or a slot that
  never receives content would all pass every gate this phase ran and surface in phase 3, mixed in
  with the auth retrofit's own noise.

  Phase 1's manual verification (criterion 1.5) walked the existing screens, which use none of
  them.
- **Fix**: Render all six once on a scratch route, confirm visually against the mockups, then
  delete the route before committing — or accept that phase 3 is their first render and treat any
  breakage found there as belonging to this phase.
  - Strength: A single throwaway page exercises every primitive against the mockup it was ported
    from, while the porting decisions are still fresh.
  - Tradeoff: A temporary file that must actually be deleted; the plan already rejected a similar
    idea (the `/dev/i18n` probe route) for exactly that reason.
  - Confidence: MEDIUM — the risk is real but the components are small and simple.
  - Blind spot: Have not checked whether every Tailwind token the six reference actually resolves;
    Tailwind emits no error for an unknown utility, it just emits nothing.
- **Decision**: FIXED — rendered all six on a temporary route and verified, then deleted the
  route. Confirmed: avatar initials across every edge case (`null`, blank string, single word,
  two-word name with Polish diacritics → `ŻŚ`); `Stars` clamping (`99` → 5 filled, `-3` → 0);
  all six badge variants emitting their backgrounds; `cn()` override on `Card`. The blind spot
  above was closed directly — all 13 Arrivo tokens (`bg-surface-alt`, `text-teal-soft-text`,
  `text-success-soft-text`, `border-border-strong`, …) confirmed present in the built CSS.
  Incidental finding: Astro excludes `_`-prefixed files in `src/pages/` from routing, so the
  first probe returned 404 while its tokens still compiled — Tailwind scans sources regardless of
  routing.

### F4 — `--radius` is declared and never read

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/styles/global.css:85`
- **Detail**: `:root { --radius: 0.875rem; }` is a leftover from the shadcn theme, where the
  `radius-*` scale was computed from it (`calc(var(--radius) - 4px)` etc.). The new `@theme` block
  sets `--radius-sm/md/lg/xl` to explicit values, so nothing reads `--radius`. `grep` finds only
  the declaration. Harmless, but it reads as the knob that controls corner rounding, and it does
  not.
- **Fix**: Delete the declaration and its comment.
- **Decision**: FIXED — declaration and comment removed from `:root`.

### F5 — The teal button's hover state borrows a text-role token

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/components/ui/button.tsx:26`
- **Detail**: `teal: "bg-teal text-white hover:bg-teal-soft-text"`. In the mockup stylesheet
  `--teal-soft-text` (#1F6459) is the *foreground* colour used on a `--teal-soft` background; the
  mockups define no hover for `.btn-teal`. The rendered result is a plausible darker teal, so this
  is not a visual defect — but it couples the button's hover to a token whose meaning is
  unrelated, and a later correction to the badge's text colour would silently change a button.
- **Fix**: Add an explicit `--teal-dark` token alongside `--primary-dark` and use it here.
- **Decision**: SKIPPED — the rendered hover is correct today and no consumer of the teal variant
  exists yet. Revisit if `--teal-soft-text` is ever retuned for badges, which would silently move
  this button's hover.

### F6 — `tUnknown()` implements a phase-3 requirement during phase 1

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `src/lib/i18n/t.ts:42-49`
- **Detail**: The plan's phase 1 specifies `t(locale, key, params?)` only; the untrusted-key
  fallback belongs to phase 3 ("the pages translate via `t()`, falling back to a generic message
  for an unknown key"). It landed here because the planned `?? key` guard inside `t()` was
  unreachable under the key type and ESLint's `no-unnecessary-condition` rejected it, so the
  honest split was made immediately rather than weakening the type. Forward work inside the
  plan's total scope, not scope creep beyond it — recorded so phase 3's review does not read it as
  an unexplained extra.
- **Fix**: None. Phase 3 consumes it as specified.
- **Decision**: SKIPPED — no action; this report is the record.

## Notes for later phases

- `bg-cosmic` retirement is tracked by the `TRANSITIONAL` comment in `src/styles/global.css`;
  `grep -rn "bg-cosmic" src/` must be empty before the block is deleted. Ten callers today.
- `LanguageSwitcher`'s `tone="inverse"` variant exists only for `bg-cosmic` screens and is retired
  with them.
- `src/components/ui/LibBadge.astro` appeared dirty during the phase-1 commit ritual (caught by a
  `prettier --write src/components/ui/*.astro` glob) but the edit was line-ending-only and git
  normalised it away — nothing for that file is in `168ea67`.
