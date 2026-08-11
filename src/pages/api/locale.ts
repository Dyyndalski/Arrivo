import type { APIRoute } from "astro";
import { isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/lib/i18n";
import { safeRedirect } from "@/lib/routes";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const requested = form.get("locale");

  // An unknown locale changes nothing rather than falling back to the default: a stale form
  // silently resetting someone's language is worse than the switch appearing not to work.
  if (isLocale(requested)) {
    context.cookies.set(LOCALE_COOKIE, requested, {
      path: "/",
      maxAge: LOCALE_COOKIE_MAX_AGE,
      sameSite: "lax",
      httpOnly: false,
      secure: import.meta.env.PROD,
    });
  }

  return context.redirect(safeRedirect(form.get("redirectTo")), 303);
};
