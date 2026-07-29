import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

const MIN_PASSWORD_LENGTH = 6;

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const password = form.get("password");

  // Defense-in-depth: the React form enforces this, but a direct POST bypasses it.
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return context.redirect(
      `/auth/reset-password?error=${encodeURIComponent(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)}`,
    );
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/reset-password?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  // Writes against the recovery session established by /auth/callback.
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      return context.redirect(`/auth/reset-password?error=${encodeURIComponent(error.message)}`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console -- server-side diagnostics (Workers observability)
    console.error("reset-password: updateUser threw", err);
    return context.redirect(`/auth/reset-password?error=${encodeURIComponent("Something went wrong — try again")}`);
  }

  return context.redirect(`/auth/signin?message=${encodeURIComponent("Password updated — sign in")}`);
};
