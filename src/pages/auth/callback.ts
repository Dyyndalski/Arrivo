import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

const EXPIRED = "Link expired or invalid — request a new one";

// Serves GET /auth/callback (the path baked into the reset email's redirectTo).
export const GET: APIRoute = async (context) => {
  const code = context.url.searchParams.get("code");
  const rawNext = context.url.searchParams.get("next");
  // Only allow same-origin relative paths as the post-exchange destination (no open redirect).
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/auth/reset-password";

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase || !code) {
    return context.redirect(`/auth/forgot-password?error=${encodeURIComponent(EXPIRED)}`);
  }

  // Exchange the PKCE recovery code for a session; @supabase/ssr writes the cookies.
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return context.redirect(`/auth/forgot-password?error=${encodeURIComponent(EXPIRED)}`);
  }

  return context.redirect(next);
};
