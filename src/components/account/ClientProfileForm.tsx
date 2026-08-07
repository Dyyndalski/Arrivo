import React, { useState } from "react";
import { Save, User, Phone, Home, Mail } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { AreaPicker } from "@/components/ui/AreaPicker";
// From ./limits, never a schema module — those pull zod into the client bundle.
import { NAME_MAX, PHONE_MAX, PHONE_MIN, POSTAL_CODE_PATTERN, STREET_MAX, STREET_MIN } from "@/lib/schemas/limits";
import type { Locale } from "@/lib/i18n";
import type { City, ClientProfile, ServiceArea } from "@/types";
import type { ClientProfileStrings } from "@/components/account/strings";

interface Props {
  cities: City[];
  areas: ServiceArea[];
  profile: ClientProfile | null;
  /**
   * Where to go after saving. Set when a booking form sent the client here for a missing
   * district, so they land back on the booking rather than on this screen. Validated
   * server-side — see `safeRedirect` in the endpoint.
   */
  redirectTo?: string | null;
  /** Already translated by the page — this island never sees a catalog key. */
  serverError?: string | null;
  locale: Locale;
  strings: ClientProfileStrings;
}

export default function ClientProfileForm({ cities, areas, profile, redirectTo, serverError, locale, strings }: Props) {
  const [areaIds, setAreaIds] = useState<number[]>(profile?.area_id ? [profile.area_id] : []);
  const [firstName, setFirstName] = useState(profile?.first_name ?? "");
  const [lastName, setLastName] = useState(profile?.last_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [street, setStreet] = useState(profile?.street ?? "");
  const [postalCode, setPostalCode] = useState(profile?.postal_code ?? "");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  // Mirrors src/lib/schemas/client.ts. Advisory only — the endpoint re-validates and the database
  // enforces the same bounds a third time.
  function validate() {
    const next: Record<string, string | undefined> = {};

    // The one required field: without a district there is nothing for the area match to compare.
    if (areaIds.length === 0) next.area = strings.errorAreaRequired;

    if (firstName.trim().length > NAME_MAX) next.firstName = strings.errorNameLength;
    if (lastName.trim().length > NAME_MAX) next.lastName = strings.errorNameLength;

    const p = phone.trim();
    if (p && (p.length < PHONE_MIN || p.length > PHONE_MAX)) next.phone = strings.errorPhoneLength;

    const s = street.trim();
    if (s && (s.length < STREET_MIN || s.length > STREET_MAX)) next.street = strings.errorStreetLength;

    const pc = postalCode.trim();
    if (pc && !POSTAL_CODE_PATTERN.test(pc)) next.postalCode = strings.errorPostalCodeFormat;

    setErrors(next);
    return Object.values(next).every((v) => v === undefined);
  }

  function clear(field: string) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  return (
    <form method="POST" action="/api/account/profile" className="space-y-5" onSubmit={handleSubmit} noValidate>
      {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="first_name"
          label={strings.firstName}
          value={firstName}
          onChange={(v) => {
            setFirstName(v);
            clear("firstName");
          }}
          error={errors.firstName}
          icon={<User className="size-4" />}
        />
        <FormField
          id="last_name"
          label={strings.lastName}
          value={lastName}
          onChange={(v) => {
            setLastName(v);
            clear("lastName");
          }}
          error={errors.lastName}
          icon={<Mail className="size-4" />}
        />
      </div>

      <FormField
        id="phone"
        label={strings.phone}
        value={phone}
        onChange={(v) => {
          setPhone(v);
          clear("phone");
        }}
        placeholder={strings.phonePlaceholder}
        error={errors.phone}
        icon={<Phone className="size-4" />}
      />

      {/* Single mode: exactly one district, and it is the only field the match actually reads. */}
      <AreaPicker
        cities={cities}
        areas={areas}
        mode="single"
        name="area_id"
        selected={areaIds}
        onChange={(next) => {
          setAreaIds(next);
          clear("area");
        }}
        locale={locale}
        strings={strings.areaPicker}
        error={errors.area}
      />

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <FormField
          id="street"
          label={strings.street}
          value={street}
          onChange={(v) => {
            setStreet(v);
            clear("street");
          }}
          placeholder={strings.streetPlaceholder}
          error={errors.street}
          icon={<Home className="size-4" />}
        />
        <FormField
          id="postal_code"
          label={strings.postalCode}
          value={postalCode}
          onChange={(v) => {
            setPostalCode(v);
            clear("postalCode");
          }}
          placeholder={strings.postalCodePlaceholder}
          error={errors.postalCode}
          icon={<Home className="size-4" />}
        />
      </div>

      <p className="text-muted-foreground text-xs leading-relaxed">{strings.privacyNote}</p>

      <ServerError message={serverError} />

      <SubmitButton pendingText={strings.pending} icon={<Save className="size-4" />}>
        {strings.submit}
      </SubmitButton>
    </form>
  );
}
