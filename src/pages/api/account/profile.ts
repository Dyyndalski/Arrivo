import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseOrError } from "@/lib/schemas/parse";
import { clientProfileSchema } from "@/lib/schemas/client";
import { NotAllowedError, upsertOwnProfile } from "@/lib/services/clients";

const PAGE = "/account/profile";

/**
 * Reject anything that is not a path on this origin — the same guard as
 * src/pages/api/locale.ts. `redirectTo` reaches here from a form field, so a crafted link could
 * otherwise bounce the visitor off-site with our domain in the referrer, and a protocol-relative
 * URL slips past a naive `startsWith("/")`.
 */
function safeRedirect(target: FormDataEntryValue | null, fallback: string): string {
  if (typeof target !== "string" || target === "") return fallback;
  if (!target.startsWith("/")) return fallback;
  if (target.startsWith("//") || target.startsWith("/\\")) return fallback;
  return target;
}

// `?error=` and `?message=` carry message-catalog keys, never sentences — the page translates.
export const POST: APIRoute = async (context) => {
  const { user, role } = context.locals;

  // The database is the real boundary (client_profiles RLS gates writes on profiles.role); these
  // two checks exist so the wrong role gets a redirect instead of a constraint error.
  if (!user) {
    return context.redirect("/auth/signin");
  }
  if (role !== "client") {
    return context.redirect("/dashboard");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`${PAGE}?error=account.error.notConfigured`);
  }

  const form = await context.request.formData();
  const parsed = parseOrError(clientProfileSchema, {
    area_id: form.get("area_id"),
    first_name: form.get("first_name"),
    last_name: form.get("last_name"),
    phone: form.get("phone"),
    street: form.get("street"),
    postal_code: form.get("postal_code"),
  });
  if (!parsed.ok) {
    return context.redirect(`${PAGE}?error=${parsed.error}`);
  }

  try {
    await upsertOwnProfile(supabase, user.id, parsed.data);
  } catch (err) {
    if (err instanceof NotAllowedError) {
      return context.redirect(`${PAGE}?error=${err.key}`);
    }
    // eslint-disable-next-line no-console -- server-side diagnostics (Workers observability)
    console.error("account/profile: upsertOwnProfile failed", err);
    return context.redirect(`${PAGE}?error=account.error.saveFailed`);
  }

  // A client sent here from a booking form returns to it with the address they just saved,
  // rather than being left on the profile screen wondering what happened to their booking.
  const back = safeRedirect(form.get("redirectTo"), `${PAGE}?message=account.message.saved`);
  return context.redirect(back);
};
