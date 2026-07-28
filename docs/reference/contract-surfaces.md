# Contract Surfaces

Load-bearing names, invariants, and cross-slice contracts. Keep entries short; link to the code/migration that owns each.

## Address privacy (F-01 pattern → S-03 / S-04)

The client's exact address (added in **S-03**) is readable only by the owning client and by a specialist who has an **accepted** booking for that client (**S-04**). Enforce it with RLS following the `profiles` own-row isolation pattern established in F-01 (`supabase/migrations/*_profiles_roles_rls.sql`). The **coarse area** used for matching is separate from the exact address: matching may use the area before acceptance, but the exact address must not be readable by anyone until the specialist accepts the booking. This is the Success-Criteria guardrail — a leak is a regression even if every other metric holds.

## Roles (F-01)

`public.user_role` = `client | specialist`. Each account has exactly one `public.profiles` row (1:1 with `auth.users`), whose `role` is set at sign-up by the `handle_new_user` trigger reading `raw_user_meta_data.role` (metadata key: `role`; default `client`; unrecognized values fall back to `client`). `role` is **immutable by end users** (no UPDATE grant; the SECURITY DEFINER trigger is the sole writer). In the app the role is available as `context.locals.role`.
