import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;
  const role = form.get("role") as string;

  // Validate the client-controlled role server-side (defense in depth; the F-01
  // handle_new_user trigger also defaults an unrecognized value to `client`).
  if (role !== "client" && role !== "specialist") {
    return context.redirect(
      `/auth/signup?error=${encodeURIComponent("Please choose whether you're a client or a specialist")}`,
    );
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent("Supabase is not configured")}`);
  }
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { role } } });

  // Already-registered email → send to sign-in (email prefilled), BEFORE the generic error
  // branch. Two signals cover both Confirm-email settings: an empty `identities` array
  // (confirmations ON / hosted returns an obfuscated user with no error) and an
  // "already registered" error (confirmations OFF / local). An existing-but-unconfirmed
  // email is intentionally NOT flagged — Supabase resends confirmation, so it falls through
  // to /auth/confirm-email below.
  const alreadyRegistered =
    data.user?.identities?.length === 0 ||
    (error as { code?: string } | null)?.code === "user_already_exists" ||
    (!!error && /already.*(registered|exists)/i.test(error.message));

  if (alreadyRegistered) {
    const params = new URLSearchParams({
      message: "This email is already registered — sign in instead.",
      email,
    });
    return context.redirect(`/auth/signin?${params.toString()}`);
  }

  if (error) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect("/auth/confirm-email");
};
