# Specialist Booking Management — Plan Brief

> Full plan: `context/changes/specialist-booking-management/plan.md`

## What & Why

S-04 gave a client a way to ask. Nobody can answer. This slice closes the two-sided transaction:
a specialist accepts or declines, an unanswered request auto-expires so a client is never left
hanging, and an accepted booking can be marked completed — which is the precondition S-06's reviews
consume. PRD refs FR-011, FR-012.

## Starting Point

More is already built than the roadmap suggests. `booking_status` is the complete five-value enum;
`expires_at` is computed and indexed by a partial index; the policy that reveals a client's address
at `status = 'accepted'` already exists and is tested. What is missing is any way to change a
status — `bookings` has no UPDATE policy and no UPDATE grant for anyone — plus any background
execution path, and the specialist's screen. S-04's migration ends with a note addressed directly to
this slice, specifying what the expiry job may and may not touch.

## Desired End State

A specialist opens **Rezerwacje** and sees requests carrying a service, a time, and a district —
nothing that identifies the person. Accepting reveals the client's name, phone, street and note; that
is the only thing that reveals them. Once the proposed time passes, the card offers completion. On
the other side, a client's request reads "wygasłe" the moment its window closes rather than when a
job happens to run, and a client who mistyped a date can withdraw and try again immediately instead
of being locked out of that specialist for 48 hours.

## Key Decisions Made

| Decision                       | Choice                                             | Why                                                                                                           |
| ------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Transition enforcement         | Four `SECURITY DEFINER` functions, no UPDATE grant | One place per edge; PostgREST cannot PATCH a status at all                                                    |
| Expiry job location            | `pg_cron` inside Supabase                          | No `service_role` key anywhere, no change to the build path, no Cloudflare cron cap or outage exposure        |
| Lazy expiry                    | `bookings_view.effective_status`                   | `infrastructure.md` requires job _and_ read-time expiry; one definition, many readers                         |
| Completion timing              | Blocked until `proposed_at` has passed             | Otherwise a specialist can accept, instantly "complete", and harvest a review for a visit that never happened |
| Decline reason                 | None                                               | A one-way text field is chat with one message; PRD Non-Goals rules it out                                     |
| Stale `accepted`               | Stays `accepted`, inbox nags                       | The system does not know whether a visit happened; only the specialist does                                   |
| Client withdrawal              | In scope, pending only                             | The partial unique index otherwise traps a client for 48 hours with no exit                                   |
| Withdrawal representation      | `declined` + `resolved_by` column                  | No `alter type` on a live database; every existing filter and badge keeps working                             |
| Cron cadence                   | Every 15 minutes                                   | `expires_at` can equal `proposed_at`; a daily job would be useless for a same-day booking                     |
| Specialist nav                 | One link in the existing `Topbar`                  | The mockup's sidebar is its own change, and part of it ("Zespół") has no FR                                   |
| Client identity pre-acceptance | Nothing shown                                      | The mockup shows a name; the privacy split wins                                                               |
| Test scope                     | New pgTAP file, ~30–40 assertions                  | A wrong policy does not raise — it silently permits                                                           |

## Scope

**In scope:** four transition functions; `resolved_by`; `bookings_view` with `effective_status`;
`expire_stale_bookings()` on a 15-minute `pg_cron` schedule; a `service_role` revoke on `bookings`;
pgTAP coverage; the specialist inbox with role-gated nav; client withdrawal; deploy.

**Out of scope:** decline reasons; a `cancelled` enum value; cancelling an accepted booking;
auto-completion; the mockup's sidebar layout; any client identity on a pending request;
notifications; reviews (S-06).

## Architecture / Approach

Expiry is defended three times, deliberately. `pg_cron` keeps stored rows honest — which matters
because `bookings_one_pending_per_pair` reads the stored status, not the displayed one.
`bookings_view` shows the truth between runs. Each transition function re-checks `expires_at`
itself, so a stale row cannot be accepted even if the other two layers were bypassed.

Choosing `pg_cron` over the Cloudflare Cron Trigger that `infrastructure.md` originally assumed
removes `service_role` from this slice entirely — verified during planning that
`@astrojs/cloudflare@14.1.5` has no `workerEntryPoint`, so the Worker path would have meant
hand-editing the build entry _and_ storing a privileged key.

## Phases at a Glance

| Phase                   | What it delivers                                                      | Key risk                                                       |
| ----------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1. Transitions          | `resolved_by`, four functions, `bookings_view`, `service_role` revoke | A policy or grant that silently permits the wrong actor        |
| 2. Auto-expiry          | `expire_stale_bookings()` + 15-minute `pg_cron` schedule              | `create extension` behaving differently on hosted than locally |
| 3. pgTAP coverage       | ~30–40 assertions over the graph, privacy, view and job               | Tests that cannot fail                                         |
| 4. Specialist inbox     | Service layer, page, three endpoints, nav, i18n                       | Leaking client identity onto a pending card                    |
| 5. Client side + deploy | Withdrawal, `effective_status` in the client list, production         | Cron not firing on hosted                                      |

**Prerequisites:** S-04 done and archived (`context/archive/2026-08-07-client-booking-request/`).
`pg_cron` 1.6.4 confirmed available and preloaded on the local stack during planning.

**Estimated effort:** ~3–4 sessions across five phases; phases 1–3 are database-only.

## Open Risks & Assumptions

- `pg_cron` is verified locally but not yet on the hosted project — phase 2's manual criteria check
  `cron.job_run_details` after deploy, and phase 5 re-checks it.
- The `service_role` revoke narrows the leaked legacy JWT's reach on `bookings`, but that key still
  holds full access to the rest of the schema. **Rotating it remains outstanding and is not
  addressed by this slice.**
- `infrastructure.md` currently specifies a Cloudflare Cron Trigger for FR-011. Phase 2 amends it;
  until then the document and the code disagree.
- Custom SQLSTATEs `Z0001`–`Z0003` assume Postgres' reserved-class rules (`00`–`04`, `A`–`H`) hold —
  phase 3's tests assert on these codes, so a wrong assumption surfaces immediately.

## Success Criteria (Summary)

- A specialist can resolve every request that reaches them, and sees a client's address only after
  accepting.
- No client request stays pending forever, whether or not the scheduled job ran.
- A client who made a mistake can withdraw and immediately try again.
