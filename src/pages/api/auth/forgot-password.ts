import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (supabase && email) {
    // The reset link lands on /auth/callback, which exchanges the code for a recovery
    // session (Phase 3) and forwards to the reset-password page.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${context.url.origin}/auth/callback?next=/auth/reset-password`,
    });
  }

  // Always confirm "check your email" regardless of result — never leak whether the
  // account exists.
  return context.redirect("/auth/forgot-password-sent");
};
