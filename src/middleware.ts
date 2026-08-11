import { defineMiddleware } from "astro:middleware";
import { LOCALE_COOKIE, resolveLocale } from "@/lib/i18n";
import { createClient } from "@/lib/supabase";
import { homeFor } from "@/lib/routes";
import type { UserRole } from "@/types";

// `/specialists` (plural) is listed on purpose, and this is a DELIBERATE DIVERGENCE from the
// PRD's Access Control, which lets unauthenticated visitors browse listings. The product call is
// that nothing behind a URL should render app content to a signed-out visitor: pasting any link
// while logged out must land on sign-in, not on a page that looks like the app. `matchesRoute`
// matches on a path boundary, so this one entry covers the list, `/specialists/<id>` and the
// booking form beneath it.
//
// context/foundation/prd.md still describes browsing as public — it is the older statement of
// intent, kept until the PRD is revised.
const PROTECTED_ROUTES = ["/dashboard", "/specialist", "/specialists", "/account"];

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
 * `/specialists` (impl-review F3). Both are protected now, but they are protected differently —
 * the singular one additionally requires the specialist ROLE — so conflating them would lock every
 * client out of discovery.
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
      // Carry the requested path so a pasted link survives the sign-in it triggers — otherwise
      // gating discovery would mean every shared specialist link dumps the visitor on their home
      // page with no way back to what they were sent. Same `redirectTo` contract the booking form
      // already used; the endpoint re-validates it with `safeRedirect`.
      //
      // Only the path and query — never the origin — and only for GET, since replaying a POST
      // after sign-in would resubmit a form the visitor cannot see.
      const back = `${context.url.pathname}${context.url.search}`;
      const to =
        context.request.method === "GET" ? `/auth/signin?redirectTo=${encodeURIComponent(back)}` : "/auth/signin";
      return context.redirect(to);
    }
  }

  if (SPECIALIST_ROUTES.some((route) => matchesRoute(context.url.pathname, route))) {
    if (context.locals.role !== "specialist") {
      // Bounce to the caller's own home rather than the dashboard: for a client that is
      // discovery, the screen they actually work in. Cannot loop — `homeFor` never returns a
      // path under `/specialist`, which is the only prefix this branch guards.
      return context.redirect(homeFor(context.locals.role));
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
