import React, { useState } from "react";
import { Save, Store } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { AreaPicker } from "@/components/specialist/AreaPicker";
import { DISPLAY_NAME_MAX, DISPLAY_NAME_MIN } from "@/lib/schemas/specialist";
import type { ServiceArea } from "@/types";

interface Props {
  areas: ServiceArea[];
  initialName: string;
  initialAreaIds: number[];
  serverError?: string | null;
}

export default function ProfileForm({ areas, initialName, initialAreaIds, serverError }: Props) {
  const [name, setName] = useState(initialName);
  const [selected, setSelected] = useState<number[]>(initialAreaIds);
  const [errors, setErrors] = useState<{ name?: string; areas?: string }>({});

  // Mirrors src/lib/schemas/specialist.ts. Advisory only — the endpoint re-validates through
  // the same rules, and the database enforces the bounds a third time.
  function validate() {
    const next: typeof errors = {};
    const trimmed = name.trim();

    if (!trimmed) {
      next.name = "Enter a name clients will see";
    } else if (trimmed.length < DISPLAY_NAME_MIN) {
      next.name = `Name must be at least ${DISPLAY_NAME_MIN} characters`;
    } else if (trimmed.length > DISPLAY_NAME_MAX) {
      next.name = `Name must be at most ${DISPLAY_NAME_MAX} characters`;
    }

    if (selected.length === 0) {
      next.areas = "Pick at least one district you serve";
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
        label="Business name"
        value={name}
        onChange={(v) => {
          setName(v);
          if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
        }}
        placeholder="e.g. Studio Ala"
        error={errors.name}
        icon={<Store className="size-4" />}
      />

      <AreaPicker
        areas={areas}
        selected={selected}
        onToggle={(id) => {
          setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
          if (errors.areas) setErrors((prev) => ({ ...prev, areas: undefined }));
        }}
        error={errors.areas}
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText="Saving..." icon={<Save className="size-4" />}>
        Save profile
      </SubmitButton>
    </form>
  );
}
