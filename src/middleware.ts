import { defineMiddleware } from "astro:middleware";
import { LOCALE_COOKIE, resolveLocale } from "@/lib/i18n";
import { createClient } from "@/lib/supabase";
import type { UserRole } from "@/types";

// `/specialists` (plural) is deliberately absent: the PRD's Access Control lets unauthenticated
// visitors browse listings. `matchesRoute` below matches on a path boundary, so the singular
// `/specialist` entry does not capture it.
const PROTECTED_ROUTES = ["/dashboard", "/specialist", "/account"];

// Routes only a specialist-role account may open. Checked after PROTECTED_ROUTES, so a signed
// -out visitor still gets the sign-in redirect rather than being bounced to a dashboard they
// cannot see either.
//
// This covers pages only. The /api/specialist/* endpoints carry their own role check (and the
// RLS policies behind them are the boundary that actually has to hold) — gating them here as
// well would mean a redirect where a form post expects one specific response.
const SPECIALIST_ROUTES = ["/specialist"];

/**
 * Match on a path boundary, not a bare prefix. `startsWith("/specialist")` would also claim
 * `/specialists` — which is exactly the shape S-03's public browse page is likely to take,
 * and it would silently require a specialist account to view (impl-review F3).
 */
function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export const onRequest = defineMiddleware(async (context, next) => {
  // Resolved before anything can redirect: a redirect response is still a rendered page in the
  // browser's history, and the target page reads locals.locale on the way in.
  context.locals.locale = resolveLocale(
    context.cookies.get(LOCALE_COOKIE)?.value,
    context.request.headers.get("accept-language"),
  );

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

  if (PROTECTED_ROUTES.some((route) => matchesRoute(context.url.pathname, route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  if (SPECIALIST_ROUTES.some((route) => matchesRoute(context.url.pathname, route))) {
    if (context.locals.role !== "specialist") {
      return context.redirect("/dashboard");
    }
  }

  // /auth/reset-password requires a session — normally the recovery session established
  // by /auth/callback (exchangeCodeForSession), though an already-signed-in user may also
  // reach it (changing their own password is benign). With no session at all (a direct
  // visit or an expired link), bounce to request a fresh link rather than the generic
  // sign-in redirect.
  if (context.url.pathname === "/auth/reset-password" && !context.locals.user) {
    // A catalog key, like every other `?error=` in the app — the page translates it.
    return context.redirect("/auth/forgot-password?error=auth.error.linkExpired");
  }

  return next();
});
