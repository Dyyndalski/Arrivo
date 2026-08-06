import { MIN_PASSWORD_LENGTH } from "@/lib/schemas/limits";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n/t";

/**
 * Every string the auth islands render, resolved on the server and handed down as one prop.
 *
 * The islands must not import the message catalogs: both languages would follow into the client
 * bundle. This is the same constraint that produced `src/lib/schemas/limits.ts` after zod leaked
 * into an island in S-02 — resolve on the server, ship strings.
 *
 * One shape shared by all four forms rather than a bespoke one each: the union is small, the
 * pages build it with a single call, and adding a field to a form does not mean touching a type,
 * a builder and a page.
 */
export interface AuthStrings {
  email: string;
  emailPlaceholder: string;
  password: string;
  passwordPlaceholder: string;
  newPassword: string;
  newPasswordPlaceholder: string;
  confirmPassword: string;
  confirmPasswordPlaceholder: string;
  passwordHint: string;
  showPassword: string;
  hidePassword: string;
  submit: string;
  pending: string;
  roleLegend: string;
  roleClientTitle: string;
  roleClientDescription: string;
  roleSpecialistTitle: string;
  roleSpecialistDescription: string;
  errorEmailInvalid: string;
  errorPasswordRequired: string;
  errorPasswordTooShort: string;
  errorRoleRequired: string;
  errorConfirmRequired: string;
  errorPasswordsMismatch: string;
}

/**
 * `submit` and `pending` differ per screen, so the caller supplies their keys; everything else is
 * shared. `{min}` is interpolated here from the same constant the zod schema enforces, so the
 * client-side hint cannot promise a different length than the server accepts.
 */
export function authStrings(locale: Locale, submit: string, pending: string): AuthStrings {
  const min = MIN_PASSWORD_LENGTH;

  return {
    email: t(locale, "auth.field.email"),
    emailPlaceholder: t(locale, "auth.field.emailPlaceholder"),
    password: t(locale, "auth.field.password"),
    passwordPlaceholder: t(locale, "auth.field.passwordPlaceholder"),
    newPassword: t(locale, "auth.field.newPassword"),
    newPasswordPlaceholder: t(locale, "auth.field.newPasswordPlaceholder", { min }),
    confirmPassword: t(locale, "auth.field.confirmPassword"),
    confirmPasswordPlaceholder: t(locale, "auth.field.confirmPasswordPlaceholder"),
    passwordHint: t(locale, "auth.field.passwordHint", { min }),
    showPassword: t(locale, "auth.field.showPassword"),
    hidePassword: t(locale, "auth.field.hidePassword"),
    submit,
    pending,
    roleLegend: t(locale, "auth.role.legend"),
    roleClientTitle: t(locale, "auth.role.client.title"),
    roleClientDescription: t(locale, "auth.role.client.description"),
    roleSpecialistTitle: t(locale, "auth.role.specialist.title"),
    roleSpecialistDescription: t(locale, "auth.role.specialist.description"),
    errorEmailInvalid: t(locale, "auth.error.emailInvalid"),
    errorPasswordRequired: t(locale, "auth.error.passwordRequired"),
    errorPasswordTooShort: t(locale, "auth.error.passwordTooShort", { min }),
    errorRoleRequired: t(locale, "auth.error.roleRequired"),
    errorConfirmRequired: t(locale, "auth.error.confirmRequired"),
    errorPasswordsMismatch: t(locale, "auth.error.passwordsMismatch"),
  };
}
