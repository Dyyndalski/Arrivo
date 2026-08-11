import React, { useState } from "react";
import { Mail, Lock, LogIn } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import type { AuthStrings } from "@/components/auth/strings";

interface Props {
  /** Already translated by the page — this island never sees a catalog key. */
  serverError?: string | null;
  initialEmail?: string;
  /**
   * Where to land after a successful sign-in, when the visitor was sent here from a page that
   * required an account (the booking form does this). Rendered as a hidden field and re-validated
   * server-side — `safeRedirect` in the endpoint — because it arrives from the query string.
   */
  redirectTo?: string | null;
  strings: AuthStrings;
}

export default function SignInForm({ serverError, initialEmail, redirectTo, strings }: Props) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  function validate() {
    const next: typeof errors = {};
    // One message for empty and for malformed: the endpoint's schema makes the same call
    // (`auth.error.emailInvalid` covers both), and telling someone their empty field is empty
    // adds nothing the asterisk did not.
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = strings.errorEmailInvalid;
    }
    if (!password) {
      next.password = strings.errorPasswordRequired;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof typeof errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  return (
    <form method="POST" action="/api/auth/signin" className="space-y-4" onSubmit={handleSubmit} noValidate>
      {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}

      <FormField
        id="email"
        type="email"
        label={strings.email}
        value={email}
        onChange={(v) => {
          setEmail(v);
          clearError("email");
        }}
        placeholder={strings.emailPlaceholder}
        error={errors.email}
        icon={<Mail className="size-4" />}
      />

      <FormField
        id="password"
        label={strings.password}
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(v) => {
          setPassword(v);
          clearError("password");
        }}
        placeholder={strings.passwordPlaceholder}
        error={errors.password}
        icon={<Lock className="size-4" />}
        endContent={
          <PasswordToggle
            visible={showPassword}
            showLabel={strings.showPassword}
            hideLabel={strings.hidePassword}
            onToggle={() => {
              setShowPassword(!showPassword);
            }}
          />
        }
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText={strings.pending} icon={<LogIn className="size-4" />}>
        {strings.submit}
      </SubmitButton>
    </form>
  );
}
