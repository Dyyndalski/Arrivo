import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    // Misconfiguration (missing SUPABASE_URL/KEY): log server-side so a silent
    // "check your email" with no email ever sent is diagnosable. Never surfaced to
    // the user — preserves the no-account-existence-leak guarantee below.
    // eslint-disable-next-line no-console -- intentional server-side misconfig log (Workers observability)
    console.error("forgot-password: Supabase client unavailable — cannot send reset email");
  } else if (email) {
    // The reset link lands on /auth/callback, which exchanges the code for a recovery
    // session (Phase 3) and forwards to the reset-password page.
    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${context.url.origin}/auth/callback?next=/auth/reset-password`,
      });
    } catch (err) {
      // Swallow transport/edge errors so the always-redirect below still holds
      // (upholds the no-account-existence-leak guarantee). Log for diagnosis.
      // eslint-disable-next-line no-console -- intentional server-side error log (Workers observability)
      console.error("forgot-password: resetPasswordForEmail threw", err);
    }
  }

  // Always confirm "check your email" regardless of result — never leak whether the
  // account exists.
  return context.redirect("/auth/forgot-password-sent");
};
