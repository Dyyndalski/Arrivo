import React, { useState } from "react";
import { Plus, CircleAlert } from "lucide-react";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { cn } from "@/lib/utils";
// From ./limits, never ./specialist — that module pulls zod into the client bundle.
import {
  DURATION_MAX_MINUTES,
  DURATION_MIN_MINUTES,
  PRICE_MAX_CENTS,
  PRICE_MIN_CENTS,
  SERVICE_NAME_MAX,
  SERVICE_NAME_MIN,
} from "@/lib/schemas/limits";
import { localizedName } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n";
import type { ServiceCategory, ServiceSubtype } from "@/types";
import type { ServiceFormStrings } from "@/components/specialist/strings";

interface Props {
  categories: ServiceCategory[];
  subtypes: ServiceSubtype[];
  /** Already translated by the page — this island never sees a catalog key. */
  serverError?: string | null;
  locale: Locale;
  strings: ServiceFormStrings;
}

const selectBase =
  "w-full rounded-sm border bg-card px-3.5 py-2.5 text-sm text-foreground transition-colors focus:ring-[3px] focus:outline-none";

const inputBase =
  "w-full rounded-sm border bg-card px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:ring-[3px] focus:outline-none";

export default function ServiceForm({ categories, subtypes, serverError, locale, strings }: Props) {
  const [categoryId, setCategoryId] = useState("");
  const [subtypeId, setSubtypeId] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("");
  const [errors, setErrors] = useState<{ category?: string; name?: string; price?: string; duration?: string }>({});

  // The subtype list narrows to the chosen category. Filtering client-side keeps this a single
  // page load — the whole taxonomy is a few dozen rows.
  const available = subtypes.filter((s) => String(s.category_id) === categoryId);

  function validate() {
    const next: typeof errors = {};
    if (!categoryId) next.category = strings.errorTypeRequired;

    const trimmedName = name.trim();
    if (trimmedName && (trimmedName.length < SERVICE_NAME_MIN || trimmedName.length > SERVICE_NAME_MAX)) {
      next.name = strings.errorNameLength;
    }

    const normalized = price.trim().replace(",", ".");
    if (!normalized) {
      next.price = strings.errorPriceRequired;
    } else if (!/^\d{1,6}(\.\d{1,2})?$/.test(normalized)) {
      next.price = strings.errorPriceFormat;
    } else {
      const cents = Math.round(Number(normalized) * 100);
      if (cents < PRICE_MIN_CENTS || cents > PRICE_MAX_CENTS) {
        next.price = strings.errorPriceRange;
      }
    }

    const trimmedDuration = duration.trim();
    if (trimmedDuration) {
      const minutes = Number(trimmedDuration);
      if (!Number.isInteger(minutes) || minutes < DURATION_MIN_MINUTES || minutes > DURATION_MAX_MINUTES) {
        next.duration = strings.errorDurationRange;
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  const fieldError = (message?: string) =>
    message ? (
      <p className="text-danger mt-1.5 flex items-center gap-1 text-xs">
        <CircleAlert className="size-3" />
        {message}
      </p>
    ) : null;

  return (
    <form method="POST" action="/api/specialist/services" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="category_id" className="text-foreground mb-1.5 block text-sm font-semibold">
          {strings.type}
        </label>
        <select
          id="category_id"
          name="category_id"
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            // The previous subtype belongs to the previous category; keeping it would post a
            // pair the composite foreign key rejects.
            setSubtypeId("");
            if (errors.category) setErrors((prev) => ({ ...prev, category: undefined }));
          }}
          className={cn(
            selectBase,
            errors.category ? "border-danger focus:ring-danger/30" : "border-border-strong focus:ring-ring/40",
          )}
        >
          <option value="">{strings.choose}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {localizedName(c, locale)}
            </option>
          ))}
        </select>
        {fieldError(errors.category)}
      </div>

      <div>
        <label htmlFor="subtype_id" className="text-foreground mb-1.5 block text-sm font-semibold">
          {strings.detail} <span className="text-muted-foreground text-xs font-normal">{strings.detailOptional}</span>
        </label>
        <select
          id="subtype_id"
          name="subtype_id"
          value={subtypeId}
          onChange={(e) => {
            setSubtypeId(e.target.value);
          }}
          disabled={!categoryId}
          className={cn(selectBase, "border-border-strong focus:ring-ring/40 disabled:opacity-50")}
        >
          <option value="">{categoryId ? strings.noDetail : strings.chooseTypeFirst}</option>
          {available.map((s) => (
            <option key={s.id} value={s.id}>
              {localizedName(s, locale)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="name" className="text-foreground mb-1.5 block text-sm font-semibold">
          {strings.name} <span className="text-muted-foreground text-xs font-normal">{strings.nameOptional}</span>
        </label>
        <input
          id="name"
          name="name"
          value={name}
          maxLength={SERVICE_NAME_MAX}
          onChange={(e) => {
            setName(e.target.value);
            if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
          }}
          placeholder={strings.namePlaceholder}
          className={cn(
            inputBase,
            errors.name ? "border-danger focus:ring-danger/30" : "border-border-strong focus:ring-ring/40",
          )}
        />
        {fieldError(errors.name)}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="price" className="text-foreground mb-1.5 block text-sm font-semibold">
            {strings.price}
          </label>
          <input
            id="price"
            name="price"
            inputMode="decimal"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
              if (errors.price) setErrors((prev) => ({ ...prev, price: undefined }));
            }}
            placeholder={strings.pricePlaceholder}
            className={cn(
              inputBase,
              errors.price ? "border-danger focus:ring-danger/30" : "border-border-strong focus:ring-ring/40",
            )}
          />
          {fieldError(errors.price)}
        </div>

        <div>
          <label htmlFor="duration_minutes" className="text-foreground mb-1.5 block text-sm font-semibold">
            {strings.duration}{" "}
            <span className="text-muted-foreground text-xs font-normal">{strings.durationOptional}</span>
          </label>
          <input
            id="duration_minutes"
            name="duration_minutes"
            inputMode="numeric"
            value={duration}
            onChange={(e) => {
              setDuration(e.target.value);
              if (errors.duration) setErrors((prev) => ({ ...prev, duration: undefined }));
            }}
            placeholder={strings.durationPlaceholder}
            className={cn(
              inputBase,
              errors.duration ? "border-danger focus:ring-danger/30" : "border-border-strong focus:ring-ring/40",
            )}
          />
          {fieldError(errors.duration)}
        </div>
      </div>

      <ServerError message={serverError} />

      <SubmitButton pendingText={strings.pending} icon={<Plus className="size-4" />}>
        {strings.submit}
      </SubmitButton>
    </form>
  );
}
