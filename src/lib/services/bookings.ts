import type { createClient } from "@/lib/supabase";
import type { BookingContactDetails, BookingView } from "@/types";

/**
 * Always the request-scoped client — never a service-role key. `booking_contact_details` is the
 * table F-01's privacy contract is about, and `service_role` is explicitly revoked from it
 * (20260807110000) precisely so a stray privileged client cannot read around the policy.
 */
type Client = NonNullable<ReturnType<typeof createClient>>;

/** Distinct from a generic failure: a live request to this specialist is a normal user state. */
export class AlreadyPendingError extends Error {
  readonly key = "booking.error.alreadyPending" as const;

  constructor() {
    super("You already have a pending request with this specialist");
    this.name = "AlreadyPendingError";
  }
}

export class NotAllowedError extends Error {
  readonly key = "booking.error.notAllowed" as const;

  constructor() {
    super("You need a client account to request a booking");
    this.name = "NotAllowedError";
  }
}

/** The specialist or service vanished, or the card stopped being discoverable, mid-flow. */
export class UnavailableError extends Error {
  readonly key = "booking.error.unavailable" as const;

  constructor() {
    super("That service is no longer available");
    this.name = "UnavailableError";
  }
}

export interface BookingRequestInput {
  specialist_id: string;
  service_id: string;
  proposed_at: Date;
  /** Stored on `booking_contact_details`, not on the booking — see the type's docstring. */
  note: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  street: string;
  postal_code: string | null;
  area_id: number;
}

/**
 * Submit a request. Both rows are written by `public.request_booking` in one statement — see the
 * migration for why two independent inserts would be wrong.
 *
 * 23505 is the partial unique index, and it is the interesting one: it means the client already
 * has a live request with this specialist, which is a state to explain rather than an error to
 * apologise for.
 */
export async function requestBooking(supabase: Client, input: BookingRequestInput): Promise<string> {
  // Not destructured, matching the other service modules: without generated database types the
  // response's `data` is `any`, and destructuring it trips `no-unsafe-assignment`.
  const result = await supabase.rpc("request_booking", {
    p_specialist_id: input.specialist_id,
    p_service_id: input.service_id,
    p_proposed_at: input.proposed_at.toISOString(),
    p_note: input.note,
    p_first_name: input.first_name,
    p_last_name: input.last_name,
    p_phone: input.phone,
    p_street: input.street,
    p_postal_code: input.postal_code,
    p_area_id: input.area_id,
  });

  if (result.error) {
    if (result.error.code === "23505") throw new AlreadyPendingError();
    if (result.error.code === "42501") throw new NotAllowedError();
    // The function raises 23503 for "service does not belong to that specialist" and for "not
    // discoverable" — both mean the same thing to a client who is mid-flow.
    if (result.error.code === "23503") throw new UnavailableError();
    throw new Error(result.error.message);
  }

  return result.data as string;
}

/**
 * The caller's own bookings, newest proposal first.
 *
 * Deliberately does NOT join `booking_contact_details`: the client already knows their own
 * address, and every join to that table is a place a future edit could widen. The service is read
 * from the snapshot on the booking, not from `services`, so a deleted service still renders.
 */
export async function listOwnBookings(supabase: Client, userId: string): Promise<BookingView[]> {
  const result = await supabase
    .from("bookings_view")
    .select("*")
    .eq("client_id", userId)
    .order("proposed_at", { ascending: false });

  if (result.error) throw new Error(result.error.message);
  return result.data as BookingView[];
}

// --- S-05: the specialist's side ---------------------------------------------------------------

/** The booking moved on before the click landed — a stale tab, or a double submit. */
export class StaleStateError extends Error {
  readonly key = "specialist.bookings.error.staleState" as const;

  constructor() {
    super("That booking is no longer in a state this action applies to");
    this.name = "StaleStateError";
  }
}

/** The 48-hour window (or the proposed time) passed while the request sat unanswered. */
export class ExpiredError extends Error {
  readonly key = "specialist.bookings.error.expired" as const;

  constructor() {
    super("That request has expired");
    this.name = "ExpiredError";
  }
}

/** Completion is blocked until the visit was actually due — see the migration for why. */
export class TooEarlyError extends Error {
  readonly key = "specialist.bookings.error.tooEarly" as const;

  constructor() {
    super("That visit has not happened yet");
    this.name = "TooEarlyError";
  }
}

/**
 * The caller is not the party named on the booking — or there is no such booking. The database
 * answers both cases with 42501 on purpose, so the functions cannot be used to discover which
 * uuids name real bookings; this class inherits that deliberate ambiguity.
 */
export class NotYoursError extends Error {
  readonly key = "specialist.bookings.error.notYours" as const;

  constructor() {
    super("That booking is not yours");
    this.name = "NotYoursError";
  }
}

/**
 * Every transition raises the same four SQLSTATEs, so the mapping lives in one place. `Z0001`–
 * `Z0003` are defined in 20260807130000_booking_transitions.sql; Postgres reserves classes 00–04
 * and A–H, which is why they start with Z.
 */
function transitionError(code: string | undefined, message: string): Error {
  switch (code) {
    case "42501":
      return new NotYoursError();
    case "Z0001":
      return new StaleStateError();
    case "Z0002":
      return new ExpiredError();
    case "Z0003":
      return new TooEarlyError();
    default:
      return new Error(message);
  }
}

async function callTransition(supabase: Client, fn: string, bookingId: string): Promise<void> {
  // Not destructured, for the reason recorded on `requestBooking` above.
  const result = await supabase.rpc(fn, { p_booking_id: bookingId });
  if (result.error) throw transitionError(result.error.code, result.error.message);
}

export async function acceptBooking(supabase: Client, bookingId: string): Promise<void> {
  await callTransition(supabase, "accept_booking", bookingId);
}

export async function declineBooking(supabase: Client, bookingId: string): Promise<void> {
  await callTransition(supabase, "decline_booking", bookingId);
}

export async function completeBooking(supabase: Client, bookingId: string): Promise<void> {
  await callTransition(supabase, "complete_booking", bookingId);
}

/** The client withdrawing their own pending request. Same function family, different actor. */
export async function cancelBooking(supabase: Client, bookingId: string): Promise<void> {
  await callTransition(supabase, "cancel_booking", bookingId);
}

/**
 * Requests addressed to this specialist, soonest proposal first.
 *
 * Ascending, unlike the client's list: this is a work queue, and the visit happening tomorrow
 * matters more than the one three weeks out.
 */
export async function listSpecialistBookings(supabase: Client, specialistId: string): Promise<BookingView[]> {
  const result = await supabase
    .from("bookings_view")
    .select("*")
    .eq("specialist_id", specialistId)
    .order("proposed_at", { ascending: true });

  if (result.error) throw new Error(result.error.message);
  return result.data as BookingView[];
}

/**
 * Contact details for bookings the caller may see them for.
 *
 * RLS is what actually enforces the boundary — the policy is scoped to `status = 'accepted'` and
 * runs regardless of what this function asks for. Callers should still pass only accepted ids: a
 * query that requests what it must not receive is one refactor away from a query that receives it.
 *
 * Returns an empty map for an empty input rather than issuing a query with an empty `in` list.
 */
export async function listContactDetails(
  supabase: Client,
  bookingIds: string[],
): Promise<Map<string, BookingContactDetails>> {
  if (bookingIds.length === 0) return new Map();

  const result = await supabase.from("booking_contact_details").select("*").in("booking_id", bookingIds);

  if (result.error) throw new Error(result.error.message);
  return new Map((result.data as BookingContactDetails[]).map((d) => [d.booking_id, d]));
}
