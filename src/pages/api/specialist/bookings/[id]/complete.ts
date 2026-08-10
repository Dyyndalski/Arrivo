import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseOrError } from "@/lib/schemas/parse";
import { bookingIdSchema } from "@/lib/schemas/specialist";
import { completeBooking, ExpiredError, NotYoursError, StaleStateError, TooEarlyError } from "@/lib/services/bookings";

const PAGE = "/specialist/bookings";

/**
 * Completion is what makes a client eligible to review (FR-013), which is why the database refuses
 * it before `proposed_at` — otherwise a specialist could accept and complete a request within
 * seconds and harvest a rating for a visit that never happened. The UI hides the button until
 * then; `TooEarlyError` covers the stale tab that submits it anyway.
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
    await completeBooking(supabase, parsed.data);
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
    console.error("specialist/bookings/complete: completeBooking failed", err);
    return context.redirect(`${PAGE}?error=specialist.bookings.error.actionFailed`);
  }

  return context.redirect(`${PAGE}?message=specialist.bookings.message.completed`);
};
