import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseOrError } from "@/lib/schemas/parse";
import { clientBookingIdSchema } from "@/lib/schemas/booking";
import { ratingSchema } from "@/lib/schemas/review";
import { AlreadyRatedError, NotCompletedError, NotYourVisitError, submitReview } from "@/lib/services/reviews";

const PAGE = "/account/bookings";

/**
 * A client rating a visit the specialist marked completed (FR-013).
 *
 * The rating is permanent: there is no update or delete grant on `public.reviews` and no endpoint
 * offering one. A second attempt on the same booking surfaces as `AlreadyRatedError` rather than
 * overwriting — which is also what the UI prevents by hiding the control once a rating exists, so
 * reaching that branch means a stale tab or a double submit.
 *
 * The wrong-role redirect goes to `/dashboard`, matching the nine sibling endpoints rather than the
 * role-aware `homeFor()` the PAGES use. Changing all ten together is its own change; disagreeing
 * with the siblings one endpoint at a time is worse than the inconsistency.
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

  const parsedId = parseOrError(clientBookingIdSchema, context.params.id);
  if (!parsedId.ok) {
    return context.redirect(`${PAGE}?error=${parsedId.error}`);
  }

  const form = await context.request.formData();
  const parsedRating = parseOrError(ratingSchema, form.get("rating"));
  if (!parsedRating.ok) {
    return context.redirect(`${PAGE}?error=${parsedRating.error}`);
  }

  try {
    await submitReview(supabase, parsedId.data, parsedRating.data);
  } catch (err) {
    if (err instanceof NotYourVisitError) {
      return context.redirect(`${PAGE}?error=reviews.error.notYours`);
    }
    if (err instanceof AlreadyRatedError) {
      return context.redirect(`${PAGE}?error=reviews.error.alreadyRated`);
    }
    if (err instanceof NotCompletedError) {
      return context.redirect(`${PAGE}?error=reviews.error.notCompleted`);
    }
    // eslint-disable-next-line no-console -- server-side diagnostics (Workers observability)
    console.error("bookings/review: submitReview failed", err);
    return context.redirect(`${PAGE}?error=reviews.error.actionFailed`);
  }

  return context.redirect(`${PAGE}?message=reviews.message.submitted`);
};
