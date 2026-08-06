import React, { useState } from "react";
import { Save, Store } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { AreaPicker } from "@/components/ui/AreaPicker";
// From ./limits, never ./specialist — that module pulls zod into the client bundle.
import { BIO_MAX, DISPLAY_NAME_MAX, DISPLAY_NAME_MIN } from "@/lib/schemas/limits";
import type { Locale } from "@/lib/i18n";
import type { City, ServiceArea } from "@/types";
import type { ProfileFormStrings } from "@/components/specialist/strings";

interface Props {
  cities: City[];
  areas: ServiceArea[];
  initialName: string;
  initialBio: string;
  initialAreaIds: number[];
  /** Already translated by the page — this island never sees a catalog key. */
  serverError?: string | null;
  locale: Locale;
  strings: ProfileFormStrings;
}

export default function ProfileForm({
  cities,
  areas,
  initialName,
  initialBio,
  initialAreaIds,
  serverError,
  locale,
  strings,
}: Props) {
  const [name, setName] = useState(initialName);
  const [bio, setBio] = useState(initialBio);
  const [selected, setSelected] = useState<number[]>(initialAreaIds);
  const [errors, setErrors] = useState<{ name?: string; bio?: string; areas?: string }>({});

  // Mirrors src/lib/schemas/specialist.ts. Advisory only — the endpoint re-validates through the
  // same rules, and the database enforces the bounds a third time.
  function validate() {
    const next: typeof errors = {};
    const trimmed = name.trim();

    if (!trimmed) {
      next.name = strings.errorNameRequired;
    } else if (trimmed.length < DISPLAY_NAME_MIN) {
      next.name = strings.errorNameTooShort;
    } else if (trimmed.length > DISPLAY_NAME_MAX) {
      next.name = strings.errorNameTooLong;
    }

    if (bio.trim().length > BIO_MAX) {
      next.bio = strings.errorBioTooLong;
    }

    if (selected.length === 0) {
      next.areas = strings.errorAreaRequired;
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  return (
    <form method="POST" action="/api/specialist/profile" className="space-y-5" onSubmit={handleSubmit} noValidate>
      <FormField
        id="display_name"
        label={strings.displayName}
        value={name}
        onChange={(v) => {
          setName(v);
          if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
        }}
        placeholder={strings.displayNamePlaceholder}
        error={errors.name}
        icon={<Store className="size-4" />}
      />

      <div>
        <label htmlFor="bio" className="text-foreground mb-1.5 block text-sm font-semibold">
          {strings.bio} <span className="text-muted-foreground text-xs font-normal">{strings.bioOptional}</span>
        </label>
        <textarea
          id="bio"
          name="bio"
          value={bio}
          rows={4}
          maxLength={BIO_MAX}
          onChange={(e) => {
            setBio(e.target.value);
            if (errors.bio) setErrors((prev) => ({ ...prev, bio: undefined }));
          }}
          placeholder={strings.bioPlaceholder}
          className="border-border-strong bg-card text-foreground placeholder:text-muted-foreground focus:ring-ring/40 w-full resize-y rounded-sm border px-3.5 py-2.5 text-sm transition-colors focus:ring-[3px] focus:outline-none"
        />
        {errors.bio ? <p className="text-danger mt-1.5 text-xs">{errors.bio}</p> : null}
      </div>

      <AreaPicker
        cities={cities}
        areas={areas}
        mode="multi"
        name="area_ids"
        selected={selected}
        onChange={(next) => {
          setSelected(next);
          if (errors.areas) setErrors((prev) => ({ ...prev, areas: undefined }));
        }}
        locale={locale}
        strings={strings.areaPicker}
        error={errors.areas}
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText={strings.pending} icon={<Save className="size-4" />}>
        {strings.submit}
      </SubmitButton>
    </form>
  );
}
