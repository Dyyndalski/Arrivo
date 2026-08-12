import { z } from "zod";
import { RATING_MAX, RATING_MIN } from "@/lib/schemas/limits";

// Every `error` is a MESSAGE CATALOG KEY, not a sentence — see src/lib/schemas/auth.ts.

/**
 * S-06. The star a client picked, arriving as the `value` of a submit button.
 *
 * One key for every way this can be wrong — missing, non-numeric, fractional, out of range. The
 * control only offers five buttons, so any failure here means a hand-crafted request rather than a
 * user who needs guidance, and a specific message would only describe the tampering back to it.
 *
 * The database re-checks the same range (`check (rating between 1 and 5)`), which is the boundary
 * that actually holds; this exists so a bad value is refused with a translated message instead of
 * surfacing as a constraint violation.
 */
export const ratingSchema = z.coerce
  .number({ error: "reviews.error.invalidRating" })
  .int({ error: "reviews.error.invalidRating" })
  .min(RATING_MIN, { error: "reviews.error.invalidRating" })
  .max(RATING_MAX, { error: "reviews.error.invalidRating" });
