import { z } from "zod";
import {
  BIO_MAX,
  DICTIONARY_ID_MAX,
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  DURATION_MAX_MINUTES,
  DURATION_MIN_MINUTES,
  PRICE_MAX_CENTS,
  PRICE_MIN_CENTS,
  SERVICE_NAME_MAX,
  SERVICE_NAME_MIN,
} from "@/lib/schemas/limits";

// The bounds live in ./limits.ts, which imports nothing. Do NOT re-export them from here:
// anything that imports a constant from this module also imports zod (impl-review F1).
//
// Every `error` is a MESSAGE CATALOG KEY, not a sentence — `parseOrError` hands it to the
// endpoint, which puts it in `?error=`, and the page resolves it through `tUnknown()`. Keys with
// a `{min}`/`{max}` placeholder are interpolated at display time; the pages pass the same bounds
// this module enforces, so the two cannot drift.

/**
 * Empty text fields arrive three different ways — an untouched input posts "", `FormData.get()`
 * returns null for a field absent from the body, and a direct caller may omit the key entirely.
 * Normalising up front beats enumerating them in a union, which would also swallow the specific
 * error message (impl-review F1, F2).
 */
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : (v ?? null));

export const specialistProfileSchema = z.object({
  // Trimmed here as well as checked in the database: the migration rejects untrimmed input
  // outright (impl-review F6), so sending the raw value would turn a stray space into a
  // constraint violation the user cannot see the cause of.
  display_name: z
    .string({ error: "specialist.error.nameRequired" })
    .trim()
    .min(DISPLAY_NAME_MIN, { error: "specialist.error.nameTooShort" })
    .max(DISPLAY_NAME_MAX, { error: "specialist.error.nameTooLong" }),

  // FR-015, optional. Trimmed for the same reason as display_name — the CHECK constraint rejects
  // untrimmed text.
  bio: z.preprocess(emptyToNull, z.string().trim().max(BIO_MAX, { error: "specialist.error.bioTooLong" }).nullable()),

  area_ids: z
    .array(z.coerce.number().int().positive().max(DICTIONARY_ID_MAX))
    .min(1, { error: "specialist.error.areaRequired" })
    .max(100, { error: "specialist.error.areaTooMany" })
    // The form can repeat a value if the DOM is tampered with; the join table's composite
    // primary key would reject the batch outright, so collapse duplicates first.
    .transform((ids) => [...new Set(ids)]),
});

const dictionaryId = (label: string) =>
  z.coerce.number({ error: label }).int({ error: label }).positive({ error: label }).max(DICTIONARY_ID_MAX, {
    error: label,
  });

export const serviceSchema = z.object({
  category_id: dictionaryId("specialist.error.typeRequired"),

  // Optional by design: the taxonomy is two-level but the subtype narrows rather than qualifies,
  // so "not chosen" is a valid answer and must not read as invalid.
  subtype_id: z.preprocess(emptyToNull, dictionaryId("specialist.error.subtypeInvalid").nullable()),

  // The specialist's own wording. SUPPLEMENTS the taxonomy — category_id stays required, because
  // FR-007's filter reads that and not this.
  name: z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .min(SERVICE_NAME_MIN, { error: "specialist.error.serviceNameLength" })
      .max(SERVICE_NAME_MAX, { error: "specialist.error.serviceNameLength" })
      .nullable(),
  ),

  duration_minutes: z.preprocess(
    emptyToNull,
    z.coerce
      .number({ error: "specialist.error.durationRange" })
      .int({ error: "specialist.error.durationRange" })
      .min(DURATION_MIN_MINUTES, { error: "specialist.error.durationRange" })
      .max(DURATION_MAX_MINUTES, { error: "specialist.error.durationRange" })
      .nullable(),
  ),

  // Accepted as PLN text (both "120.50" and "120,50" — Polish keyboards produce the comma),
  // converted to grosze exactly once, here.
  price: z
    .string({ error: "specialist.error.priceRequired" })
    .trim()
    .regex(/^\d{1,6}([.,]\d{1,2})?$/, { error: "specialist.error.priceFormat" })
    .transform((v) => Math.round(Number(v.replace(",", ".")) * 100))
    .refine((cents) => cents >= PRICE_MIN_CENTS && cents <= PRICE_MAX_CENTS, {
      error: "specialist.error.priceRange",
    }),
});

export const serviceIdSchema = z.uuid({ error: "specialist.message.serviceGone" });
