# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Real prettier errors hide among CRLF noise in local lint

- **Context**: Local `npm run lint` on a Windows CRLF working tree (this Astro repo); surfaced at src/components/auth/RoleToggle.tsx:33.
- **Problem**: A real `prettier/prettier` error (Tailwind class ordering) was buried among 879 CRLF-only `prettier/prettier` errors. The shortcut used to ignore CRLF noise — `npm run lint | grep -v prettier/prettier` — also discarded the real error, so it slipped to CI, where lint failed and build was skipped (two red runs).
- **Rule**: Never filter the whole `prettier/prettier` rule to hide CRLF noise. Distinguish CRLF errors (message = "Delete `␍`" / "Insert `␍`") from real ones by message content. Clean pre-push check: `npx eslint . | grep 'prettier/prettier' | grep -v '␍'` must be empty. Durable fix: add `.gitattributes` (`* text=auto eol=lf`) so the working tree is LF and the noise disappears at the source.
- **Applies to**: local lint verification / pre-push checks (Windows CRLF working tree).
- **NOT SUFFICIENT ON ITS OWN (2026-08-07)** — the grep above says nothing about whether ESLint *ran*. See the next entry.

## A grep over lint output cannot tell "clean" from "crashed"

- **Context**: CI went red on `7d60f43` while four consecutive local runs had been reported clean. Reproduced by cloning the repo into a scratch dir (git stores LF, so the clone matches CI's file state) and running the CI steps.
- **Problem**: ESLint was not reporting a violation, it was **crashing** — `Error: Non-null Assertion Failed: Expected node to have a parent`, from `@typescript-eslint/no-misused-promises` on a top-level `return new Response(null, { status: 404 })` in Astro frontmatter. `astro-eslint-parser` gives that return `Program` as its parent; the rule's `checkReturnStatement` asserts a function parent. ESLint exits **2** having linted nothing after that file.
  The verification method was `npx eslint . | grep -E "  (error|warning)  "` — and a crash produces no such lines, so the filter printed nothing and the run was reported as passing. Nine real errors accumulated behind it over four commits, including two `supabase!` non-null assertions that were only sound because of a `&&` on an adjacent line.
- **Rule**: **Check the exit code, always** — `npx eslint . ; echo $?`. Exit 0 = clean, 1 = violations, 2 = ESLint itself failed. Grep the output only to triage violations, never to decide pass/fail. Same applies to any tool whose output is filtered: `supabase test db`, `astro check`, `prettier --check`. And when CI disagrees with local, reproduce CI's *file state* — a fresh clone into a scratch directory has LF line endings, which is the difference a Windows working tree hides.
- **Applies to**: every "verification passed" claim in this project. The crashing rule is now disabled for `.astro` only, in `eslint.config.js`, with the stack trace quoted at the disable site.

## API endpoints ship without schema validation (zod not yet installed)

- **Context**: API auth endpoints — src/pages/api/auth/{signup,signin,forgot-password}.ts.
- **Problem**: CLAUDE.md says API routes should validate request input with a schema validator (zod intended), but endpoints validate ad hoc (signup's role guard) or not at all (email) because zod isn't in package.json. Each new endpoint keeps inheriting the un-validated sibling pattern.
- **Rule**: When zod lands (the first endpoint that genuinely needs it), retrofit the existing auth endpoints (signup, signin, forgot-password, and the Phase-3 reset/callback endpoints) to parse `formData` through a schema before use. Until then, new endpoints must at least explicitly gate every required field.
- **Applies to**: src/pages/api/**/*.ts (request input validation).
- **Status**: Discharged 2026-08-03 in S-02 phase 2 — `zod` added, all four auth endpoints parse through `src/lib/schemas/auth.ts`.

## `service_role` has no DML on domain tables — scheduled jobs will hit this

- **Context**: Discovered while E2E-verifying S-02 phase 2. `information_schema.role_table_grants` shows `service_role` holding only `REFERENCES,TRIGGER,TRUNCATE` on `profiles` (F-01), `service_areas`, and `specialist_profiles` — no SELECT/INSERT/UPDATE/DELETE.
- **Problem**: Every migration so far follows the pattern `revoke all on <table> from anon, authenticated` then `grant select ... to authenticated`. `service_role` is never granted DML back. The app never noticed because it reaches Supabase with the anon key plus a user JWT (role `authenticated`) — but anything running without a user session is locked out. FR-011's auto-expire job in S-05 is exactly that: a Cloudflare Cron Trigger with no user to act as.
- **Rule**: When a slice adds a table that a scheduled job or server-side task will need, grant that access explicitly in the same migration (`grant select, update on <table> to service_role;`) — or decide deliberately that the job will use a `SECURITY DEFINER` function instead. Do not assume Supabase's defaults left `service_role` with access; verify with `select grantee, privilege_type from information_schema.role_table_grants where table_name = '<table>'`.
- **Applies to**: supabase/migrations/**/*.sql (grants), and any future background/cron path (S-05 booking auto-expire).
- **CORRECTION (2026-08-07, S-04 phase 1)**: the measurement above was taken on the LOCAL stack and does not hold on hosted. See the next entry — the two environments disagree, and the local one is the permissive-looking lie.

## `service_role` grants differ between local and hosted — and it bypasses RLS

- **Context**: Discovered by `supabase db diff --linked --schema public` after pushing S-04's booking tables.
- **Problem**: The hosted project carries `ALTER DEFAULT PRIVILEGES … GRANT ALL … TO service_role` on `public`, so **every table a migration creates is automatically granted full DML to `service_role` on hosted**. `supabase start` does not reproduce that. The previous lesson recorded "no SELECT/INSERT/UPDATE/DELETE" because that is what the local stack shows — it is false in production.
  Compounding it: `service_role` is created with `BYPASSRLS` (`select rolbypassrls from pg_roles where rolname='service_role'` → `t`). So RLS policies are invisible to it. S-04's whole privacy guardrail — the `status = 'accepted'` term gating a client's address — did not apply to that role on production at all, while 18 local pgTAP assertions "proved" that it did. A local suite can prove a boundary production does not have.
- **Rule**: For any table holding personal data, add an explicit `revoke all on <table> from service_role;` in the same migration that creates it. `BYPASSRLS` skips *policies*, not *privileges*, so revoking is a real boundary while another policy would be ignored. Never conclude anything about `service_role` from the local stack — check the hosted project with `supabase db diff --linked`, which is also the only cheap way to see default-privilege drift at all.
- **Applies to**: supabase/migrations/**/*.sql — every new table carrying addresses, phone numbers, names or anything else the PRD's privacy guardrail covers. Currently enforced for `client_profiles` and `booking_contact_details` by 20260807110000, and pinned by two assertions in supabase/tests/database/bookings_rls.test.sql.
