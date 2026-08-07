import { NAME_MAX, PHONE_MAX, PHONE_MIN, STREET_MAX, STREET_MIN } from "@/lib/schemas/limits";
import { areaPickerStrings } from "@/components/specialist/strings";
import type { AreaPickerStrings } from "@/components/ui/AreaPicker";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/t";

/**
 * Resolved on the server and handed to the island as one prop — the islands never import a
 * message catalog. Same contract as `src/components/auth/strings.ts`.
 */
export interface ClientProfileStrings {
  firstName: string;
  lastName: string;
  phone: string;
  phonePlaceholder: string;
  street: string;
  streetPlaceholder: string;
  postalCode: string;
  postalCodePlaceholder: string;
  privacyNote: string;
  submit: string;
  pending: string;
  errorAreaRequired: string;
  errorNameLength: string;
  errorPhoneLength: string;
  errorStreetLength: string;
  errorPostalCodeFormat: string;
  areaPicker: AreaPickerStrings;
}

export function clientProfileStrings(locale: Locale): ClientProfileStrings {
  return {
    firstName: t(locale, "account.field.firstName"),
    lastName: t(locale, "account.field.lastName"),
    phone: t(locale, "account.field.phone"),
    phonePlaceholder: t(locale, "account.field.phonePlaceholder"),
    street: t(locale, "account.field.street"),
    streetPlaceholder: t(locale, "account.field.streetPlaceholder"),
    postalCode: t(locale, "account.field.postalCode"),
    postalCodePlaceholder: t(locale, "account.field.postalCodePlaceholder"),
    privacyNote: t(locale, "account.privacyNote"),
    submit: t(locale, "account.save"),
    pending: t(locale, "account.saving"),
    errorAreaRequired: t(locale, "account.error.areaRequired"),
    errorNameLength: t(locale, "account.error.nameLength", { max: NAME_MAX }),
    errorPhoneLength: t(locale, "account.error.phoneLength", { min: PHONE_MIN, max: PHONE_MAX }),
    errorStreetLength: t(locale, "account.error.streetLength", { min: STREET_MIN, max: STREET_MAX }),
    errorPostalCodeFormat: t(locale, "account.error.postalCodeFormat"),
    // The label says "your district", not "districts you travel to" — the picker is shared, the
    // wording is not. Overridden after the shared defaults.
    areaPicker: { ...areaPickerStrings(locale), label: t(locale, "account.field.area") },
  };
}
