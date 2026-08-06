import { z } from "zod";

/**
 * Every `error` below is a MESSAGE CATALOG KEY, not a sentence.
 *
 * `parseOrError` hands the first issue's message straight to the endpoint, which puts it in
 * `?error=`, and the page resolves it through `tUnknown()`. A literal sentence here would reach
 * the page already in one language with no way to translate it (plan, phase 3).
 *
 * Keys are not checked against the catalog by the type system — zod's `error` is a plain string —
 * so a typo degrades to `auth.error.generic` rather than failing the build. Keep them in step
 * with src/lib/i18n/messages/pl.ts by hand.
 */

// MIN_PASSWORD_LENGTH lives in ./limits.ts, which imports nothing — the islands need it too and
// anything importing a constant from THIS module also imports zod (S-02 impl-review F1).
import { MIN_PASSWORD_LENGTH } from "./limits";

const email = z.email({ error: "auth.error.emailInvalid" });

// The `{min}` placeholder in auth.error.passwordTooShort is interpolated at display time; the
// pages pass MIN_PASSWORD_LENGTH into every auth `t()` call, so the value cannot drift from the
// rule that produced the error.
const newPassword = z
  .string({ error: "auth.error.passwordRequired" })
  .min(MIN_PASSWORD_LENGTH, { error: "auth.error.passwordTooShort" });

export const signUpSchema = z.object({
  email,
  password: newPassword,
  // Still defense in depth — F-01's handle_new_user trigger also defaults an unrecognized value
  // to `client`.
  role: z.enum(["client", "specialist"], { error: "auth.error.roleRequired" }),
});

export const signInSchema = z.object({
  email,
  // Deliberately NOT the min-length rule: an existing account created before the rule, or any
  // future change to it, must still be able to sign in. Length is a sign-up concern.
  password: z.string({ error: "auth.error.passwordRequired" }).min(1, { error: "auth.error.passwordRequired" }),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({ password: newPassword });
