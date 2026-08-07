import {
  BOOKING_MAX_AHEAD_DAYS,
  BOOKING_MIN_LEAD_HOURS,
  NAME_MAX,
  NOTE_MAX,
  PHONE_MAX,
  PHONE_MIN,
  STREET_MAX,
  STREET_MIN,
} from "@/lib/schemas/limits";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/t";

/**
 * Resolved on the server, handed to the island as one prop. Same contract as every other island
 * in this project: the catalogs never reach the client bundle.
 */
export interface BookingFormStrings {
  date: string;
  time: string;
  street: string;
  streetPlaceholder: string;
  postalCode: string;
  postalCodePlaceholder: string;
  firstName: string;
  lastName: string;
  phone: string;
  phonePlaceholder: string;
  note: string;
  noteOptional: string;
  notePlaceholder: string;
  privacyNote: string;
  submit: string;
  pending: string;
  errorTimeRequired: string;
  errorTooSoon: string;
  errorTooFar: string;
  errorNoteTooLong: string;
  errorNameLength: string;
  errorPhoneLength: string;
  errorStreetRequired: string;
  errorStreetLength: string;
  errorPostalCodeFormat: string;
}

/** `areaName` is a dictionary value, already localised by the caller through `localizedName`. */
export function bookingFormStrings(locale: Locale, areaName: string): BookingFormStrings {
  return {
    date: t(locale, "booking.field.date"),
    time: t(locale, "booking.field.time"),
    street: t(locale, "booking.field.street"),
    streetPlaceholder: t(locale, "booking.field.streetPlaceholder"),
    postalCode: t(locale, "booking.field.postalCode"),
    postalCodePlaceholder: t(locale, "booking.field.postalCodePlaceholder"),
    firstName: t(locale, "booking.field.firstName"),
    lastName: t(locale, "booking.field.lastName"),
    phone: t(locale, "booking.field.phone"),
    phonePlaceholder: t(locale, "booking.field.phonePlaceholder"),
    note: t(locale, "booking.field.note"),
    noteOptional: t(locale, "booking.field.noteOptional"),
    notePlaceholder: t(locale, "booking.field.notePlaceholder"),
    privacyNote: t(locale, "booking.privacyNote", { area: areaName }),
    submit: t(locale, "booking.submit"),
    pending: t(locale, "booking.pending"),
    errorTimeRequired: t(locale, "booking.error.timeRequired"),
    errorTooSoon: t(locale, "booking.error.tooSoon", { hours: BOOKING_MIN_LEAD_HOURS }),
    errorTooFar: t(locale, "booking.error.tooFar", { days: BOOKING_MAX_AHEAD_DAYS }),
    errorNoteTooLong: t(locale, "booking.error.noteTooLong", { max: NOTE_MAX }),
    errorNameLength: t(locale, "booking.error.nameLength", { max: NAME_MAX }),
    errorPhoneLength: t(locale, "booking.error.phoneLength", { min: PHONE_MIN, max: PHONE_MAX }),
    errorStreetRequired: t(locale, "booking.error.streetRequired"),
    errorStreetLength: t(locale, "booking.error.streetLength", { min: STREET_MIN, max: STREET_MAX }),
    errorPostalCodeFormat: t(locale, "booking.error.postalCodeFormat"),
  };
}
