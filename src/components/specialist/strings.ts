import {
  BIO_MAX,
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  DURATION_MAX_MINUTES,
  DURATION_MIN_MINUTES,
  PRICE_MAX_CENTS,
  PRICE_MIN_CENTS,
  SERVICE_NAME_MAX,
  SERVICE_NAME_MIN,
} from "@/lib/schemas/limits";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/t";
import type { AreaPickerStrings } from "@/components/ui/AreaPicker";

/**
 * Strings for the specialist panel's islands, resolved on the server — same contract as
 * `src/components/auth/strings.ts`: the islands never import a message catalog, or both languages
 * follow into the client bundle.
 *
 * Every `{min}`/`{max}` is interpolated from the same constants the zod schema and the database
 * CHECK constraints use, so a client-side hint cannot promise different bounds than the server
 * enforces.
 */
export interface ProfileFormStrings {
  displayName: string;
  displayNamePlaceholder: string;
  bio: string;
  bioOptional: string;
  bioPlaceholder: string;
  submit: string;
  pending: string;
  errorNameRequired: string;
  errorNameTooShort: string;
  errorNameTooLong: string;
  errorBioTooLong: string;
  errorAreaRequired: string;
  areaPicker: AreaPickerStrings;
}

export interface ServiceFormStrings {
  type: string;
  detail: string;
  detailOptional: string;
  name: string;
  nameOptional: string;
  namePlaceholder: string;
  price: string;
  pricePlaceholder: string;
  duration: string;
  durationOptional: string;
  durationPlaceholder: string;
  choose: string;
  noDetail: string;
  chooseTypeFirst: string;
  submit: string;
  pending: string;
  errorTypeRequired: string;
  errorNameLength: string;
  errorPriceRequired: string;
  errorPriceFormat: string;
  errorPriceRange: string;
  errorDurationRange: string;
}

export function areaPickerStrings(locale: Locale): AreaPickerStrings {
  return {
    label: t(locale, "specialist.field.areas"),
    // Deliberately NOT interpolated — the count is client-side state.
    selectedCountTemplate: t(locale, "specialist.field.areasSelected"),
    city: t(locale, "specialist.field.city"),
    selectAll: t(locale, "specialist.field.selectAllInCity"),
    clearAll: t(locale, "specialist.field.clearCity"),
  };
}

export function profileFormStrings(locale: Locale): ProfileFormStrings {
  return {
    displayName: t(locale, "specialist.field.displayName"),
    displayNamePlaceholder: t(locale, "specialist.field.displayNamePlaceholder"),
    bio: t(locale, "specialist.field.bio"),
    bioOptional: t(locale, "specialist.field.bioOptional"),
    bioPlaceholder: t(locale, "specialist.field.bioPlaceholder"),
    submit: t(locale, "specialist.profile.save"),
    pending: t(locale, "specialist.profile.saving"),
    errorNameRequired: t(locale, "specialist.error.nameRequired"),
    errorNameTooShort: t(locale, "specialist.error.nameTooShort", { min: DISPLAY_NAME_MIN }),
    errorNameTooLong: t(locale, "specialist.error.nameTooLong", { max: DISPLAY_NAME_MAX }),
    errorBioTooLong: t(locale, "specialist.error.bioTooLong", { max: BIO_MAX }),
    errorAreaRequired: t(locale, "specialist.error.areaRequired"),
    areaPicker: areaPickerStrings(locale),
  };
}

export function serviceFormStrings(locale: Locale): ServiceFormStrings {
  return {
    type: t(locale, "specialist.field.serviceType"),
    detail: t(locale, "specialist.field.serviceDetail"),
    detailOptional: t(locale, "specialist.field.serviceDetailOptional"),
    name: t(locale, "specialist.field.serviceName"),
    nameOptional: t(locale, "specialist.field.serviceNameOptional"),
    namePlaceholder: t(locale, "specialist.field.serviceNamePlaceholder"),
    price: t(locale, "specialist.field.price"),
    pricePlaceholder: t(locale, "specialist.field.pricePlaceholder"),
    duration: t(locale, "specialist.field.duration"),
    durationOptional: t(locale, "specialist.field.durationOptional"),
    durationPlaceholder: t(locale, "specialist.field.durationPlaceholder"),
    choose: t(locale, "specialist.field.choose"),
    noDetail: t(locale, "specialist.field.noDetail"),
    chooseTypeFirst: t(locale, "specialist.field.chooseTypeFirst"),
    submit: t(locale, "specialist.services.add"),
    pending: t(locale, "specialist.services.adding"),
    errorTypeRequired: t(locale, "specialist.error.typeRequired"),
    errorNameLength: t(locale, "specialist.error.serviceNameLength", {
      min: SERVICE_NAME_MIN,
      max: SERVICE_NAME_MAX,
    }),
    errorPriceRequired: t(locale, "specialist.error.priceRequired"),
    errorPriceFormat: t(locale, "specialist.error.priceFormat"),
    errorPriceRange: t(locale, "specialist.error.priceRange", {
      min: PRICE_MIN_CENTS / 100,
      max: PRICE_MAX_CENTS / 100,
    }),
    errorDurationRange: t(locale, "specialist.error.durationRange", {
      min: DURATION_MIN_MINUTES,
      max: DURATION_MAX_MINUTES,
    }),
  };
}
