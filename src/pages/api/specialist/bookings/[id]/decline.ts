import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseOrError } from "@/lib/schemas/parse";
import { bookingIdSchema } from "@/lib/schemas/specialist";
import { declineBooking, ExpiredError, NotYoursError, StaleStateError, TooEarlyError } from "@/lib/services/bookings";

const PAGE = "/specialist/bookings";

/**
 * Declining carries no reason. PRD Non-Goals rules out chat, and a free-text field pointing from
 * specialist to client is a chat with one message and no moderation — so this endpoint reads
 * nothing from the request body at all.
 */
export const POST: APIRoute = async (context) => {
  const { user, role } = context.locals;

  if (!user) {
    return context.redirect("/auth/signin");
  }
  if (role !== "specialist") {
    return context.redirect("/dashboard");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`${PAGE}?error=booking.error.notConfigured`);
  }

  const parsed = parseOrError(bookingIdSchema, context.params.id);
  if (!parsed.ok) {
    return context.redirect(`${PAGE}?error=${parsed.error}`);
  }

  try {
    await declineBooking(supabase, parsed.data);
  } catch (err) {
    if (
      err instanceof NotYoursError ||
      err instanceof StaleStateError ||
      err instanceof ExpiredError ||
      err instanceof TooEarlyError
    ) {
      return context.redirect(`${PAGE}?error=${err.key}`);
    }
    // eslint-disable-next-line no-console -- server-side diagnostics (Workers observability)
    console.error("specialist/bookings/decline: declineBooking failed", err);
    return context.redirect(`${PAGE}?error=specialist.bookings.error.actionFailed`);
  }

  return context.redirect(`${PAGE}?message=specialist.bookings.message.declined`);
};
