import { z } from "zod";

/** Mirrors the CHECK constraints in the specialist_profiles migration — keep the two in step. */
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 60;

/** 1 zł .. 100 000 zł, stored as integer grosze. Never floating point for money. */
export const PRICE_MIN_CENTS = 100;
export const PRICE_MAX_CENTS = 10_000_000;

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

/**
 * The dictionary ids are `smallint` columns. Without this bound a larger number reaches
 * Postgres and comes back as 22003 (numeric_value_out_of_range) — a generic "try again" for
 * what is really "that is not a service type". Keep in step with the migration's column types.
 */
const DICTIONARY_ID_MAX = 32767;

const dictionaryId = (label: string) =>
  z.coerce.number({ error: label }).int({ error: label }).positive({ error: label }).max(DICTIONARY_ID_MAX, {
    error: label,
  });

export const serviceSchema = z.object({
  category_id: dictionaryId("Choose a service type"),

  // Optional by design: the taxonomy is two-level but the subtype narrows rather than
  // qualifies. An empty select posts "", which must read as "not chosen", not as invalid.
  subtype_id: z
    .union([z.literal(""), dictionaryId("Choose a valid option for that service type")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),

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
