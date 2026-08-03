import { z } from "zod";
import {
  DICTIONARY_ID_MAX,
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  PRICE_MAX_CENTS,
  PRICE_MIN_CENTS,
} from "@/lib/schemas/limits";

// The bounds live in ./limits.ts, which imports nothing. Do NOT re-export them from here:
// anything that imports a constant from this module also imports zod (impl-review F1).

export const specialistProfileSchema = z.object({
  // Trimmed here as well as checked in the database: the migration rejects untrimmed input
  // outright (impl-review F6), so sending the raw value would turn a stray space into a
  // constraint violation the user cannot see the cause of.
  display_name: z
    .string({ error: "Enter a name clients will see" })
    .trim()
    .min(DISPLAY_NAME_MIN, { error: `Name must be at least ${DISPLAY_NAME_MIN} characters` })
    .max(DISPLAY_NAME_MAX, { error: `Name must be at most ${DISPLAY_NAME_MAX} characters` }),

  area_ids: z
    .array(z.coerce.number().int().positive().max(32767))
    .min(1, { error: "Pick at least one district you serve" })
    .max(100, { error: "Too many districts selected" })
    // The form can repeat a value if the DOM is tampered with; the join table's composite
    // primary key would reject the batch outright, so collapse duplicates first.
    .transform((ids) => [...new Set(ids)]),
});

const dictionaryId = (label: string) =>
  z.coerce.number({ error: label }).int({ error: label }).positive({ error: label }).max(DICTIONARY_ID_MAX, {
    error: label,
  });

export const serviceSchema = z.object({
  category_id: dictionaryId("Choose a service type"),

  // Optional by design: the taxonomy is two-level but the subtype narrows rather than
  // qualifies, so "not chosen" is a valid answer and must not read as invalid.
  //
  // Normalize the empty representations up front instead of enumerating them in a union.
  // "Absent" arrives three different ways — an empty select posts "", FormData.get() returns
  // null for a field that isn't in the body at all, and a direct caller may omit the key —
  // and a union would also swallow the message below, reporting zod's generic "Invalid input"
  // for every failure (impl-review F1, F2).
  subtype_id: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    dictionaryId("Choose a valid option for that service type").nullable(),
  ),

  // Accepted as PLN text (both "120.50" and "120,50" — Polish keyboards produce the comma),
  // converted to grosze exactly once, here.
  price: z
    .string({ error: "Enter a price" })
    .trim()
    .regex(/^\d{1,6}([.,]\d{1,2})?$/, { error: "Enter a price in złoty, e.g. 120 or 120.50" })
    .transform((v) => Math.round(Number(v.replace(",", ".")) * 100))
    .refine((cents) => cents >= PRICE_MIN_CENTS && cents <= PRICE_MAX_CENTS, {
      error: `Price must be between ${PRICE_MIN_CENTS / 100} zł and ${PRICE_MAX_CENTS / 100} zł`,
    }),
});

export const serviceIdSchema = z.uuid({ error: "Unknown service" });
