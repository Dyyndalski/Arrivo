import React, { useState } from "react";
import { Plus, CircleAlert } from "lucide-react";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { cn } from "@/lib/utils";
import { PRICE_MAX_CENTS, PRICE_MIN_CENTS } from "@/lib/schemas/specialist";
import type { ServiceCategory, ServiceSubtype } from "@/types";

interface Props {
  categories: ServiceCategory[];
  subtypes: ServiceSubtype[];
  serverError?: string | null;
}

const selectBase =
  "w-full rounded-lg border bg-white/10 px-3 py-2 text-white transition-colors focus:ring-2 focus:outline-none [&>option]:bg-slate-800";

export default function ServiceForm({ categories, subtypes, serverError }: Props) {
  const [categoryId, setCategoryId] = useState("");
  const [subtypeId, setSubtypeId] = useState("");
  const [price, setPrice] = useState("");
  const [errors, setErrors] = useState<{ category?: string; price?: string }>({});

  // The subtype list narrows to the chosen category. Filtering client-side keeps this a single
  // page load — the whole taxonomy is a few dozen rows.
  const available = subtypes.filter((s) => String(s.category_id) === categoryId);

  function validate() {
    const next: typeof errors = {};
    if (!categoryId) next.category = "Choose a service type";

    const normalized = price.trim().replace(",", ".");
    if (!normalized) {
      next.price = "Enter a price";
    } else if (!/^\d{1,6}(\.\d{1,2})?$/.test(normalized)) {
      next.price = "Enter a price in złoty, e.g. 120 or 120.50";
    } else {
      const cents = Math.round(Number(normalized) * 100);
      if (cents < PRICE_MIN_CENTS || cents > PRICE_MAX_CENTS) {
        next.price = `Price must be between ${PRICE_MIN_CENTS / 100} zł and ${PRICE_MAX_CENTS / 100} zł`;
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

  return (
    <form method="POST" action="/api/specialist/services" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="category_id" className="mb-1 block text-sm text-blue-100/80">
          Service type
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
            errors.category ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400",
          )}
        >
          <option value="">Choose…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {errors.category ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
            <CircleAlert className="size-3" />
            {errors.category}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="subtype_id" className="mb-1 block text-sm text-blue-100/80">
          Detail <span className="text-xs text-blue-100/50">(optional)</span>
        </label>
        <select
          id="subtype_id"
          name="subtype_id"
          value={subtypeId}
          onChange={(e) => {
            setSubtypeId(e.target.value);
          }}
          disabled={!categoryId}
          className={cn(selectBase, "border-white/20 focus:ring-purple-400 disabled:opacity-40")}
        >
          <option value="">{categoryId ? "No detail" : "Choose a service type first"}</option>
          {available.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="price" className="mb-1 block text-sm text-blue-100/80">
          Price (zł)
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
          placeholder="120 or 120.50"
          className={cn(
            "w-full rounded-lg border bg-white/10 px-3 py-2 text-white placeholder-white/40 transition-colors focus:ring-2 focus:outline-none",
            errors.price ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400",
          )}
        />
        {errors.price ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
            <CircleAlert className="size-3" />
            {errors.price}
          </p>
        ) : null}
      </div>

      <ServerError message={serverError} />

      <SubmitButton pendingText="Adding..." icon={<Plus className="size-4" />}>
        Add service
      </SubmitButton>
    </form>
  );
}
