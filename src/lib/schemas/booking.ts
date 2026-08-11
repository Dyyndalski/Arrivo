import { z } from "zod";
import {
  BOOKING_MAX_AHEAD_DAYS,
  BOOKING_MIN_LEAD_HOURS,
  BOOKING_TIMEZONE,
  NAME_MAX,
  NOTE_MAX,
  PHONE_MAX,
  PHONE_MIN,
  POSTAL_CODE_PATTERN,
  STREET_MAX,
  STREET_MIN,
} from "@/lib/schemas/limits";
import { composeInZone } from "@/lib/time";

// Every `error` is a MESSAGE CATALOG KEY, not a sentence — see src/lib/schemas/auth.ts.
//
// NOTE WHAT IS NOT HERE: `area_id`. The district is read from the client's saved profile by the
// endpoint, never posted. It is the field the area match was made on, so letting the form change
// it would allow booking a specialist who does not serve the district the booking claims — and it
// would be trivially tamperable. Street, phone and name ARE editable: they do not affect matching.

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : (v ?? null));

/**
 * S-05. A booking id arriving from the URL of the withdraw action.
 *
 * Deliberately a client-namespaced twin of `bookingIdSchema` in `schemas/specialist.ts` rather
 * than a shared export: the two differ only in which catalog key a malformed id resolves to, and
 * a client must never be redirected to a `specialist.*` key. The message matches the one a booking
 * belonging to somebody else produces — see `NotYoursError` in services/bookings.ts.
 *
 * Named `client`-first (impl-review F4) precisely because the twin exists: two same-named exports
 * across two modules is an auto-import away from a client seeing a specialist's error copy.
 */
export const clientBookingIdSchema = z.uuid({ error: "bookings.error.notFound" });

const optionalName = z.preprocess(
  emptyToNull,
  z.string().trim().max(NAME_MAX, { error: "booking.error.nameLength" }).nullable(),
);

export const bookingRequestSchema = z
  .object({
    service_id: z.uuid({ error: "booking.error.serviceInvalid" }),

    // The shapes `<input type="date">` and `<input type="time">` produce. Composed below.
    date: z.string({ error: "booking.error.timeRequired" }),
    time: z.string({ error: "booking.error.timeRequired" }),

    note: z.preprocess(emptyToNull, z.string().trim().max(NOTE_MAX, { error: "booking.error.noteTooLong" }).nullable()),

    first_name: optionalName,
    last_name: optionalName,
    phone: z.preprocess(
      emptyToNull,
      z
        .string()
        .trim()
        .min(PHONE_MIN, { error: "booking.error.phoneLength" })
        .max(PHONE_MAX, { error: "booking.error.phoneLength" })
        .nullable(),
    ),
    // Required, unlike on the profile: a specialist cannot travel to a district alone.
    street: z
      .string({ error: "booking.error.streetRequired" })
      .trim()
      .min(STREET_MIN, { error: "booking.error.streetLength" })
      .max(STREET_MAX, { error: "booking.error.streetLength" }),
    postal_code: z.preprocess(
      emptyToNull,
      z.string().trim().regex(POSTAL_CODE_PATTERN, { error: "booking.error.postalCodeFormat" }).nullable(),
    ),
  })
  // Composition and bounds run as one refinement so `proposed_at` reaches the caller as an
  // instant, not two strings a later step has to re-interpret — re-interpreting is exactly how a
  // timezone bug gets in.
  .transform((value, ctx) => {
    const proposedAt = composeInZone(value.date, value.time, BOOKING_TIMEZONE);

    if (proposedAt === null) {
      ctx.addIssue({ code: "custom", message: "booking.error.timeRequired" });
      return z.NEVER;
    }

    const now = Date.now();
    const minAt = now + BOOKING_MIN_LEAD_HOURS * 3600_000;
    const maxAt = now + BOOKING_MAX_AHEAD_DAYS * 86_400_000;

    if (proposedAt.getTime() < minAt) {
      ctx.addIssue({ code: "custom", message: "booking.error.tooSoon" });
      return z.NEVER;
    }
    if (proposedAt.getTime() > maxAt) {
      ctx.addIssue({ code: "custom", message: "booking.error.tooFar" });
      return z.NEVER;
    }

    const { date: _date, time: _time, ...rest } = value;
    return { ...rest, proposed_at: proposedAt };
  });
