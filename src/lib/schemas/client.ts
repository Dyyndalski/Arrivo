import { z } from "zod";
import {
  DICTIONARY_ID_MAX,
  NAME_MAX,
  PHONE_MAX,
  PHONE_MIN,
  POSTAL_CODE_PATTERN,
  STREET_MAX,
  STREET_MIN,
} from "@/lib/schemas/limits";

// Every `error` is a MESSAGE CATALOG KEY, not a sentence — see src/lib/schemas/auth.ts.
//
// Mirrors the CHECK constraints in 20260804120100_client_profiles.sql. Bounds live in
// ./limits.ts so the island can read them without dragging zod into the bundle.

/**
 * Empty text arrives three ways — "" from an untouched input, null from `FormData.get()` for a
 * field absent from the body, undefined from a direct caller. Normalising up front keeps each
 * field's own error message intact instead of collapsing into zod's generic union failure.
 */
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : (v ?? null));

const optionalName = z.preprocess(
  emptyToNull,
  z.string().trim().max(NAME_MAX, { error: "account.error.nameLength" }).nullable(),
);

export const clientProfileSchema = z.object({
  /**
   * Required, unlike every other field here. It is the only one the product actually needs: the
   * whole wedge is "specialists whose declared areas cover the client", and without a district
   * there is nothing to match against. The column stays nullable so a client exists before they
   * have told us — this schema governs the save, not the row.
   */
  area_id: z.coerce
    .number({ error: "account.error.areaRequired" })
    .int({ error: "account.error.areaRequired" })
    .positive({ error: "account.error.areaRequired" })
    .max(DICTIONARY_ID_MAX, { error: "account.error.areaRequired" }),

  first_name: optionalName,
  last_name: optionalName,

  phone: z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .min(PHONE_MIN, { error: "account.error.phoneLength" })
      .max(PHONE_MAX, { error: "account.error.phoneLength" })
      .nullable(),
  ),

  street: z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .min(STREET_MIN, { error: "account.error.streetLength" })
      .max(STREET_MAX, { error: "account.error.streetLength" })
      .nullable(),
  ),

  postal_code: z.preprocess(
    emptyToNull,
    z.string().trim().regex(POSTAL_CODE_PATTERN, { error: "account.error.postalCodeFormat" }).nullable(),
  ),
});
