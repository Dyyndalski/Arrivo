import type { createClient } from "@/lib/supabase";
import type { Booking } from "@/types";

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
export async function listOwnBookings(supabase: Client, userId: string): Promise<Booking[]> {
  const result = await supabase
    .from("bookings")
    .select("*")
    .eq("client_id", userId)
    .order("proposed_at", { ascending: false });

  if (result.error) throw new Error(result.error.message);
  return result.data as Booking[];
}
