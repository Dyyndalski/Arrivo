import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import type { UserRole } from "@/types";

const PROTECTED_ROUTES = ["/dashboard"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  context.locals.user = null;
  context.locals.role = null;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;

    if (user) {
      // Reach Supabase over the HTTP client only (never a direct Postgres connection).
      // RLS lets a user read only their own profile row; a briefly-absent profile -> null.
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle()
        .overrideTypes<{ role: UserRole }, { merge: false }>();
      context.locals.role = profile?.role ?? null;
    }
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  // /auth/reset-password requires a session — normally the recovery session established
  // by /auth/callback (exchangeCodeForSession), though an already-signed-in user may also
  // reach it (changing their own password is benign). With no session at all (a direct
  // visit or an expired link), bounce to request a fresh link rather than the generic
  // sign-in redirect.
  if (context.url.pathname === "/auth/reset-password" && !context.locals.user) {
    return context.redirect(
      `/auth/forgot-password?error=${encodeURIComponent("Link expired or invalid — request a new one")}`,
    );
  }

  return next();
});
