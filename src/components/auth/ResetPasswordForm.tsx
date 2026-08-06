import React, { useState } from "react";
import { Lock, KeyRound } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
// From ./limits, never ./auth — that module pulls zod into the client bundle.
import { MIN_PASSWORD_LENGTH } from "@/lib/schemas/limits";
import type { AuthStrings } from "@/components/auth/strings";

interface Props {
  /** Already translated by the page — this island never sees a catalog key. */
  serverError?: string | null;
  strings: AuthStrings;
}

export default function ResetPasswordForm({ serverError, strings }: Props) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});

  function validate() {
    const next: typeof errors = {};

    if (!password) {
      next.password = strings.errorPasswordRequired;
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      next.password = strings.errorPasswordTooShort;
    }

    if (!confirmPassword) {
      next.confirmPassword = strings.errorConfirmRequired;
    } else if (password !== confirmPassword) {
      next.confirmPassword = strings.errorPasswordsMismatch;
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

  // Static, for the same plural-forms reason as SignUpForm.
  const passwordHint =
    !errors.password && password.length > 0 && password.length < MIN_PASSWORD_LENGTH ? (
      <p className="text-muted-foreground mt-1 text-xs">{strings.passwordHint}</p>
    ) : undefined;

  return (
    <form method="POST" action="/api/auth/reset-password" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="password"
        label={strings.newPassword}
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(v) => {
          setPassword(v);
          clearError("password");
        }}
        placeholder={strings.newPasswordPlaceholder}
        error={errors.password}
        hint={passwordHint}
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

      <FormField
        id="confirmPassword"
        label={strings.confirmPassword}
        type={showConfirmPassword ? "text" : "password"}
        value={confirmPassword}
        onChange={(v) => {
          setConfirmPassword(v);
          clearError("confirmPassword");
        }}
        placeholder={strings.confirmPasswordPlaceholder}
        error={errors.confirmPassword}
        icon={<Lock className="size-4" />}
        endContent={
          <PasswordToggle
            visible={showConfirmPassword}
            showLabel={strings.showPassword}
            hideLabel={strings.hidePassword}
            onToggle={() => {
              setShowConfirmPassword(!showConfirmPassword);
            }}
          />
        }
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText={strings.pending} icon={<KeyRound className="size-4" />}>
        {strings.submit}
      </SubmitButton>
    </form>
  );
}
