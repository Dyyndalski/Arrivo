import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseOrError } from "@/lib/schemas/parse";
import { resetPasswordSchema } from "@/lib/schemas/auth";
import { authErrorKey } from "@/lib/auth/errors";

// `?error=` and `?message=` carry message-catalog keys, never sentences — the page translates.

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  // Defense-in-depth: the React form enforces this, but a direct POST bypasses it.
  // (Was a hand-rolled typeof/length check; the message is unchanged.)
  const parsed = parseOrError(resetPasswordSchema, { password: form.get("password") });
  if (!parsed.ok) {
    return context.redirect(`/auth/reset-password?error=${parsed.error}`);
  }
  const { password } = parsed.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/auth/reset-password?error=auth.error.notConfigured");
  }

  // Writes against the recovery session established by /auth/callback.
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      return context.redirect(`/auth/reset-password?error=${authErrorKey(error)}`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console -- server-side diagnostics (Workers observability)
    console.error("reset-password: updateUser threw", err);
    return context.redirect("/auth/reset-password?error=auth.error.generic");
  }

  return context.redirect("/auth/signin?message=auth.message.passwordUpdated");
};
