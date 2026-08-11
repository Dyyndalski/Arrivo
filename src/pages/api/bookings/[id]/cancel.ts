import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseOrError } from "@/lib/schemas/parse";
import { clientBookingIdSchema } from "@/lib/schemas/booking";
import { cancelBooking, ExpiredError, NotYoursError, StaleStateError } from "@/lib/services/bookings";

const PAGE = "/account/bookings";

/**
 * The client withdrawing their own pending request.
 *
 * Not a `cancelled` status: `cancel_booking` writes `declined` with `resolved_by = 'client'`, so
 * the pair is freed by `bookings_one_pending_per_pair` the moment this returns and the client can
 * request the same specialist again — which is the whole point of offering it (a mistyped address
 * would otherwise lock them out for 48 hours).
 *
 * The typed errors carry `specialist.*` keys because that is where they were first raised; this
 * handler maps them to the client catalog rather than redirecting a client to a specialist key.
 */
export const POST: APIRoute = async (context) => {
  const { user, role } = context.locals;

  if (!user) {
    return context.redirect("/auth/signin");
  }
  if (role !== "client") {
    return context.redirect("/dashboard");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`${PAGE}?error=booking.error.notConfigured`);
  }

  const parsed = parseOrError(clientBookingIdSchema, context.params.id);
  if (!parsed.ok) {
    return context.redirect(`${PAGE}?error=${parsed.error}`);
  }

  try {
    await cancelBooking(supabase, parsed.data);
  } catch (err) {
    // `TooEarlyError` is unreachable here — Z0003 belongs to completion, and `cancel_booking`
    // accepts only a pending source status — so it falls through to the generic branch.
    if (err instanceof NotYoursError) {
      return context.redirect(`${PAGE}?error=bookings.error.notFound`);
    }
    if (err instanceof StaleStateError) {
      return context.redirect(`${PAGE}?error=bookings.error.staleState`);
    }
    if (err instanceof ExpiredError) {
      return context.redirect(`${PAGE}?error=bookings.error.expired`);
    }
    // eslint-disable-next-line no-console -- server-side diagnostics (Workers observability)
    console.error("bookings/cancel: cancelBooking failed", err);
    return context.redirect(`${PAGE}?error=bookings.error.actionFailed`);
  }

  return context.redirect(`${PAGE}?message=bookings.message.withdrawn`);
};
