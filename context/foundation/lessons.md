# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Real prettier errors hide among CRLF noise in local lint

- **Context**: Local `npm run lint` on a Windows CRLF working tree (this Astro repo); surfaced at src/components/auth/RoleToggle.tsx:33.
- **Problem**: A real `prettier/prettier` error (Tailwind class ordering) was buried among 879 CRLF-only `prettier/prettier` errors. The shortcut used to ignore CRLF noise — `npm run lint | grep -v prettier/prettier` — also discarded the real error, so it slipped to CI, where lint failed and build was skipped (two red runs).
- **Rule**: Never filter the whole `prettier/prettier` rule to hide CRLF noise. Distinguish CRLF errors (message = "Delete `␍`" / "Insert `␍`") from real ones by message content. Clean pre-push check: `npx eslint . | grep 'prettier/prettier' | grep -v '␍'` must be empty. Durable fix: add `.gitattributes` (`* text=auto eol=lf`) so the working tree is LF and the noise disappears at the source.
- **Applies to**: local lint verification / pre-push checks (Windows CRLF working tree).

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
