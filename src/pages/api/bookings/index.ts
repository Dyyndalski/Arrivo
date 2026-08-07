import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseOrError } from "@/lib/schemas/parse";
import { bookingRequestSchema } from "@/lib/schemas/booking";
import { getOwnProfile } from "@/lib/services/clients";
import { AlreadyPendingError, NotAllowedError, UnavailableError, requestBooking } from "@/lib/services/bookings";

// `?error=` and `?message=` carry message-catalog keys, never sentences — the page translates.
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
    return context.redirect("/account/bookings?error=booking.error.notConfigured");
  }

  const form = await context.request.formData();
  const specialistId = form.get("specialist_id");
  const serviceId = form.get("service_id");

  if (typeof specialistId !== "string" || typeof serviceId !== "string") {
    return context.redirect("/specialists?error=booking.error.serviceInvalid");
  }

  const back = `/specialists/${specialistId}/book/${serviceId}`;

  const parsed = parseOrError(bookingRequestSchema, {
    service_id: serviceId,
    date: form.get("date"),
    time: form.get("time"),
    note: form.get("note"),
    first_name: form.get("first_name"),
    last_name: form.get("last_name"),
    phone: form.get("phone"),
    street: form.get("street"),
    postal_code: form.get("postal_code"),
  });
  if (!parsed.ok) {
    return context.redirect(`${back}?error=${parsed.error}`);
  }

  // The district is read from the saved profile, never from the form. `request_booking` derives
  // it again from the same row and ignores what it is passed (impl-review F2) — this check is
  // here so a client with no district gets routed to set one, rather than a raised exception.
  const profile = await getOwnProfile(supabase, user.id);
  if (!profile?.area_id) {
    return context.redirect(`/account/profile?redirectTo=${encodeURIComponent(back)}`);
  }

  try {
    await requestBooking(supabase, {
      specialist_id: specialistId,
      service_id: parsed.data.service_id,
      proposed_at: parsed.data.proposed_at,
      note: parsed.data.note,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      phone: parsed.data.phone,
      street: parsed.data.street,
      postal_code: parsed.data.postal_code,
      area_id: profile.area_id,
    });
  } catch (err) {
    if (err instanceof AlreadyPendingError || err instanceof NotAllowedError || err instanceof UnavailableError) {
      return context.redirect(`${back}?error=${err.key}`);
    }
    // eslint-disable-next-line no-console -- server-side diagnostics (Workers observability)
    console.error("bookings: requestBooking failed", err);
    return context.redirect(`${back}?error=booking.error.saveFailed`);
  }

  return context.redirect("/account/bookings?message=booking.message.sent");
};
