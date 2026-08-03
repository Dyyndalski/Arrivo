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

/** 1 zł .. 100 000 zł, stored as integer grosze. Never floating point for money. */
export const PRICE_MIN_CENTS = 100;
export const PRICE_MAX_CENTS = 10_000_000;

/**
 * The dictionary ids are `smallint` columns. Without this bound a larger number reaches
 * Postgres and comes back as 22003 (numeric_value_out_of_range) — a generic "try again" for
 * what is really "that is not a service type".
 */
export const DICTIONARY_ID_MAX = 32767;
