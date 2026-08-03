import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseOrError } from "@/lib/schemas/parse";
import { forgotPasswordSchema } from "@/lib/schemas/auth";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const parsed = parseOrError(forgotPasswordSchema, { email: form.get("email") });

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    // Misconfiguration (missing SUPABASE_URL/KEY): log server-side so a silent
    // "check your email" with no email ever sent is diagnosable. Never surfaced to
    // the user — preserves the no-account-existence-leak guarantee below.
    // eslint-disable-next-line no-console -- intentional server-side misconfig log (Workers observability)
    console.error("forgot-password: Supabase client unavailable — cannot send reset email");
  } else if (parsed.ok) {
    // The reset link lands on /auth/callback, which exchanges the code for a recovery
    // session (Phase 3) and forwards to the reset-password page.
    try {
      await supabase.auth.resetPasswordForEmail(parsed.data.email, {
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
  //
  // Note this endpoint deliberately does NOT redirect with `?error=` on a schema failure the
  // way its siblings do: a malformed address is indistinguishable to the user from an address
  // that simply has no account, and branching here would reintroduce the very signal the
  // always-redirect exists to suppress.
  return context.redirect("/auth/forgot-password-sent");
};
