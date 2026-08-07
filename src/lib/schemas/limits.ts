/**
 * Validation bounds shared by the zod schemas (server) and the React islands (browser).
 *
 * This module must stay dependency-free. It exists because importing these constants from
 * `./specialist.ts` dragged the whole of zod into the client bundle — that module builds its
 * schemas at module scope, so the import cannot be tree-shaken down to a few numbers, and the
 * islands shipped ~65 KB of a library they never call (impl-review F1). Nothing in the browser
 * validates through zod; the endpoint does.
 *
 * Keep these in step with the CHECK constraints and column types in
 * supabase/migrations/20260803120100_specialist_profiles_and_services.sql — the pgTAP suite
 * pins the database side so a drift fails a named test.
 */

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 60;

/**
 * Lives here, not in `./auth.ts`, for the reason this whole module exists: `SignUpForm` needs it
 * in the browser, and importing it from the schema module would drag zod into the island.
 * It was duplicated as a bare `const` in that component before phase 3.
 */
export const MIN_PASSWORD_LENGTH = 6;

/** 1 zł .. 100 000 zł, stored as integer grosze. Never floating point for money. */
export const PRICE_MIN_CENTS = 100;
export const PRICE_MAX_CENTS = 10_000_000;

/**
 * The dictionary ids are `smallint` columns. Without this bound a larger number reaches
 * Postgres and comes back as 22003 (numeric_value_out_of_range) — a generic "try again" for
 * what is really "that is not a service type".
 */
export const DICTIONARY_ID_MAX = 32767;

// --- S-03 ---------------------------------------------------------------------------------
// Mirror 20260804120100_client_profiles.sql and 20260804120200_listing_details.sql. The pgTAP
// suite pins the database side, so a drift fails a named test rather than surfacing as a
// constraint violation the user cannot act on.

/** FR-015 specialist bio. */
export const BIO_MAX = 600;

/** The specialist's own wording for a service. Supplements the taxonomy, never replaces it. */
export const SERVICE_NAME_MIN = 2;
export const SERVICE_NAME_MAX = 80;

/** 15 minutes .. 10 hours. Rejects a stray "1" meant as an hour and a typo proposing a two-day visit. */
export const DURATION_MIN_MINUTES = 15;
export const DURATION_MAX_MINUTES = 600;

export const NAME_MIN = 1;
export const NAME_MAX = 60;
export const PHONE_MIN = 6;
export const PHONE_MAX = 24;
export const STREET_MIN = 2;
export const STREET_MAX = 120;

/** Polish format, e.g. 00-001. Safe to pin: every seeded area is in a Polish city. */
export const POSTAL_CODE_PATTERN = /^\d{2}-\d{3}$/;

/**
 * FR-014: how many ratings a specialist needs before an average is shown instead of the
 * "New specialist" label.
 *
 * Lives here rather than in the `discoverable_specialists` view so changing it is a one-line edit
 * and not a migration. The view reports `rating_count` and `rating_avg`; this decides what to say
 * about them. Read in exactly one place — `ratingLabel()` in src/lib/services/discovery.ts.
 */
export const RATING_THRESHOLD = 3;

// --- S-04: booking requests -----------------------------------------------------------------
// Mirror 20260807100000_bookings.sql.

/** One logistical note per request, written once. Not a message thread — PRD Non-Goals. */
export const NOTE_MAX = 500;

/**
 * How long a specialist has to answer. The actual expiry stored on a booking is the EARLIER of
 * `created_at + this` and the proposed moment: same-day bookings are allowed, and a request
 * cannot meaningfully outlive the slot it asks for.
 */
export const BOOKING_WINDOW_HOURS = 48;

/** Earliest a visit may be proposed. Below this the request would expire after the slot passed. */
export const BOOKING_MIN_LEAD_HOURS = 3;

/** Latest a visit may be proposed. Exists to catch a mistyped year, not to express policy. */
export const BOOKING_MAX_AHEAD_DAYS = 90;

/** The market is single-timezone in v1; every proposed moment is composed in this zone. */
export const BOOKING_TIMEZONE = "Europe/Warsaw";
