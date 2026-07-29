import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

const EXPIRED = "Link expired or invalid — request a new one";

// Serves GET /auth/callback (the path baked into the reset email's redirectTo).
export const GET: APIRoute = async (context) => {
  const code = context.url.searchParams.get("code");

  // Resolve `next` against our own origin and accept only a same-origin result. A raw
  // prefix check ("/" but not "//") is bypassable via backslash ("/\evil.com" normalizes
  // to //evil.com); new URL() normalizes that too, and the resulting origin won't match,
  // so an off-origin target falls back to the default.
  const rawNext = context.url.searchParams.get("next");
  let next = "/auth/reset-password";
  if (rawNext) {
    try {
      const target = new URL(rawNext, context.url.origin);
      if (target.origin === context.url.origin) {
        next = target.pathname + target.search;
      }
    } catch {
      // Malformed next → keep the default.
    }
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase || !code) {
    return context.redirect(`/auth/forgot-password?error=${encodeURIComponent(EXPIRED)}`);
  }

  // Exchange the PKCE recovery code for a session; @supabase/ssr writes the cookies.
  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return context.redirect(`/auth/forgot-password?error=${encodeURIComponent(EXPIRED)}`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console -- server-side diagnostics (Workers observability)
    console.error("callback: exchangeCodeForSession threw", err);
    return context.redirect(`/auth/forgot-password?error=${encodeURIComponent(EXPIRED)}`);
  }

  return context.redirect(next);
};
