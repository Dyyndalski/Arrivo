import type { APIRoute } from "astro";
import { isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/lib/i18n";

/**
 * Reject anything that is not a path on this origin.
 *
 * `redirectTo` comes from a form field, so it is attacker-controllable: a crafted link posting
 * `//evil.example` would otherwise send the visitor off-site with our domain in the referrer, and
 * a protocol-relative URL passes a naive `startsWith("/")` check. Backslash is rejected too —
 * browsers normalise `/\evil.example` to a protocol-relative URL.
 */
function safeRedirect(target: FormDataEntryValue | null): string {
  if (typeof target !== "string") return "/";
  if (!target.startsWith("/")) return "/";
  if (target.startsWith("//") || target.startsWith("/\\")) return "/";
  return target;
}

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
