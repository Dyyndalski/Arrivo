import type { createClient } from "@/lib/supabase";

/**
 * Always the request-scoped client. `submit_review` reads `auth.uid()` to decide whose visit is
 * being rated, so a service-role client would have no identity to act as — and `service_role` is
 * explicitly revoked from `public.reviews` anyway (20260811120000).
 */
type Client = NonNullable<ReturnType<typeof createClient>>;

/** The visit has already been rated. One rating per completed booking is the whole rule (FR-013). */
export class AlreadyRatedError extends Error {
  readonly key = "reviews.error.alreadyRated" as const;

  constructor() {
    super("That visit has already been rated");
    this.name = "AlreadyRatedError";
  }
}

/**
 * The caller is not the client on that booking — or there is no such booking. `submit_review`
 * answers both with 42501 on purpose, so it cannot be used to discover which uuids name real
 * bookings; this class inherits that deliberate ambiguity.
 *
 * Named `NotYourVisitError`, not `NotYoursError`, even though the twin in services/bookings.ts
 * means almost the same thing: two same-named exports across two modules is an auto-import away
 * from a client seeing the wrong catalog namespace (impl-review F4 on the previous slice).
 */
export class NotYourVisitError extends Error {
  readonly key = "reviews.error.notYours" as const;

  constructor() {
    super("That visit is not yours to rate");
    this.name = "NotYourVisitError";
  }
}

/** The specialist has not marked the visit completed, so FR-013's gate has not opened. */
export class NotCompletedError extends Error {
  readonly key = "reviews.error.notCompleted" as const;

  constructor() {
    super("That visit has not been marked completed");
    this.name = "NotCompletedError";
  }
}

/**
 * Rate a completed visit. Returns the new review id.
 *
 * The caller passes a booking and a star and nothing else: `specialist_id` and `client_id` are
 * read off the booking inside the function, so there is no request shape that attributes a rating
 * to the wrong pair. See the migration for why this is a function rather than an insert grant.
 *
 * 23505 is the interesting code — it is the unique constraint on `booking_id`, which IS the
 * one-rating-per-booking rule. Nothing here re-checks it before calling.
 */
export async function submitReview(supabase: Client, bookingId: string, rating: number): Promise<string> {
  // Not destructured, matching the other service modules: without generated database types the
  // response's `data` is `any`, and destructuring it trips `no-unsafe-assignment`.
  const result = await supabase.rpc("submit_review", {
    p_booking_id: bookingId,
    p_rating: rating,
  });

  if (result.error) {
    if (result.error.code === "23505") throw new AlreadyRatedError();
    if (result.error.code === "42501") throw new NotYourVisitError();
    if (result.error.code === "Z0001") throw new NotCompletedError();
    throw new Error(result.error.message);
  }

  return result.data as string;
}

/**
 * Which of these bookings the caller has already rated, and with what.
 *
 * Keyed and QUERIED by booking id, never by client id. That is not a style choice: `authenticated`
 * holds a column-level select grant on `public.reviews` that excludes `client_id`, and Postgres
 * requires SELECT on every column a query REFERENCES — so `.eq("client_id", userId)` would fail
 * outright. The caller already knows which bookings are theirs, which is what makes this safe as
 * well as necessary.
 *
 * Returns an empty map for an empty input rather than issuing a query with an empty `in` list,
 * as `listContactDetails` does.
 */
export async function listOwnRatings(supabase: Client, bookingIds: string[]): Promise<Map<string, number>> {
  if (bookingIds.length === 0) return new Map();

  const result = await supabase.from("reviews").select("booking_id, rating").in("booking_id", bookingIds);

  if (result.error) throw new Error(result.error.message);
  return new Map((result.data as { booking_id: string; rating: number }[]).map((r) => [r.booking_id, r.rating]));
}
