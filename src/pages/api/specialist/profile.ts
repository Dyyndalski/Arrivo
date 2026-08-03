import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseOrError } from "@/lib/schemas/parse";
import { specialistProfileSchema } from "@/lib/schemas/specialist";
import { NoCardError, NotAllowedError, upsertOwnCard } from "@/lib/services/specialists";

const PAGE = "/specialist/profile";

export const POST: APIRoute = async (context) => {
  const { user, role } = context.locals;

  // The database is the real boundary (RLS gates writes on profiles.role); these two checks
  // exist so the wrong role gets a redirect instead of a constraint error.
  if (!user) {
    return context.redirect("/auth/signin");
  }
  if (role !== "specialist") {
    return context.redirect("/dashboard");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`${PAGE}?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const form = await context.request.formData();
  const parsed = parseOrError(specialistProfileSchema, {
    display_name: form.get("display_name"),
    area_ids: form.getAll("area_ids"),
  });
  if (!parsed.ok) {
    return context.redirect(`${PAGE}?error=${encodeURIComponent(parsed.error)}`);
  }

  try {
    await upsertOwnCard(supabase, user.id, parsed.data);
  } catch (err) {
    if (err instanceof NotAllowedError || err instanceof NoCardError) {
      return context.redirect(`${PAGE}?error=${encodeURIComponent(err.message)}`);
    }
    // eslint-disable-next-line no-console -- server-side diagnostics (Workers observability)
    console.error("specialist/profile: upsertOwnCard failed", err);
    return context.redirect(`${PAGE}?error=${encodeURIComponent("Could not save your profile — try again")}`);
  }

  return context.redirect(`${PAGE}?message=${encodeURIComponent("Profile saved")}`);
};
