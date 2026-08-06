import React, { useState } from "react";
import { Mail, Send } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import type { AuthStrings } from "@/components/auth/strings";

interface Props {
  /** Already translated by the page — this island never sees a catalog key. */
  serverError?: string | null;
  strings: AuthStrings;
}

export default function ForgotPasswordForm({ serverError, strings }: Props) {
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<{ email?: string }>({});

  function validate() {
    const next: typeof errors = {};
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = strings.errorEmailInvalid;
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
    <form method="POST" action="/api/auth/forgot-password" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="email"
        type="email"
        label={strings.email}
        value={email}
        onChange={(v) => {
          setEmail(v);
          if (errors.email) setErrors({});
        }}
        placeholder={strings.emailPlaceholder}
        error={errors.email}
        icon={<Mail className="size-4" />}
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText={strings.pending} icon={<Send className="size-4" />}>
        {strings.submit}
      </SubmitButton>
    </form>
  );
}
