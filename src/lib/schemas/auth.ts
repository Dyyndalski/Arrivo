import { z } from "zod";

/** Mirrors the client-side rule in SignUpForm/ResetPasswordForm — keep the two in step. */
export const MIN_PASSWORD_LENGTH = 6;

const email = z.email({ error: "Enter a valid email address" });

const newPassword = z
  .string({ error: "Password is required" })
  .min(MIN_PASSWORD_LENGTH, { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });

export const signUpSchema = z.object({
  email,
  password: newPassword,
  // Message preserved verbatim from the pre-zod guard in api/auth/signup.ts — the sign-up page
  // copy is written around this exact sentence.
  role: z.enum(["client", "specialist"], { error: "Please choose whether you're a client or a specialist" }),
});

export const signInSchema = z.object({
  email,
  // Deliberately NOT the min-length rule: an existing account created before the rule, or any
  // future change to it, must still be able to sign in. Length is a sign-up concern.
  password: z.string({ error: "Password is required" }).min(1, { error: "Password is required" }),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({ password: newPassword });
