import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseOrError } from "@/lib/schemas/parse";
import { bookingIdSchema } from "@/lib/schemas/specialist";
import { acceptBooking, ExpiredError, NotYoursError, StaleStateError, TooEarlyError } from "@/lib/services/bookings";

const PAGE = "/specialist/bookings";

/**
 * Accepting is the transition that reveals the client's address, so the role gate here is not
 * decoration — though the database would refuse anyway: `accept_booking` checks `auth.uid()`
 * against `specialist_id` itself, and there is no UPDATE grant to fall back on.
 *
 * POST, not PATCH: HTML forms emit GET and POST only, and every write in this project is a native
 * form post.
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
    await acceptBooking(supabase, parsed.data);
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
    console.error("specialist/bookings/accept: acceptBooking failed", err);
    return context.redirect(`${PAGE}?error=specialist.bookings.error.actionFailed`);
  }

  return context.redirect(`${PAGE}?message=specialist.bookings.message.accepted`);
};
