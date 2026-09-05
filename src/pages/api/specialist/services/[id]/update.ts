import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseOrError } from "@/lib/schemas/parse";
import { serviceIdSchema, serviceSchema } from "@/lib/schemas/specialist";
import { updateService, NoCardError, NotAllowedError } from "@/lib/services/specialists";

const PAGE = "/specialist/services";

/**
 * Editing a listed service (FR-005). The mirror of `delete.ts` next door, and of `../../services.ts`
 * one level up — it parses the id like the first and the body like the second.
 *
 * POST, not PUT/PATCH: HTML forms emit only GET and POST, and every write in this project goes
 * through a native form post. The edit form is plain Astro, so this route works with JavaScript
 * off.
 *
 * The whole field set arrives on every save. The database already permitted this before any of it
 * existed — `grant insert, update, delete on public.services to authenticated` and the
 * `services_update_own` policy landed with S-02 (20260803120100:102, :151); until now nothing in
 * the application called it.
 */
export const POST: APIRoute = async (context) => {
  const { user, role } = context.locals;

  if (!user) {
    return context.redirect("/auth/signin");
  }
  if (role !== "specialist") {
    return context.redirect("/dashboard");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`${PAGE}?error=specialist.error.notConfigured`);
  }

  const parsedId = parseOrError(serviceIdSchema, context.params.id);
  if (!parsedId.ok) {
    return context.redirect(`${PAGE}?error=${parsedId.error}`);
  }

  const form = await context.request.formData();
  const parsed = parseOrError(serviceSchema, {
    category_id: form.get("category_id"),
    subtype_id: form.get("subtype_id"),
    name: form.get("name"),
    duration_minutes: form.get("duration_minutes"),
    price: form.get("price"),
  });
  if (!parsed.ok) {
    return context.redirect(`${PAGE}?error=${parsed.error}`);
  }

  let updated = false;
  try {
    updated = await updateService(supabase, user.id, parsedId.data, {
      category_id: parsed.data.category_id,
      subtype_id: parsed.data.subtype_id,
      name: parsed.data.name,
      duration_minutes: parsed.data.duration_minutes,
      price_cents: parsed.data.price,
    });
  } catch (err) {
    if (err instanceof NotAllowedError || err instanceof NoCardError) {
      return context.redirect(`${PAGE}?error=${err.key}`);
    }
    // eslint-disable-next-line no-console -- server-side diagnostics (Workers observability)
    console.error("specialist/services/update: updateService failed", err);
    return context.redirect(`${PAGE}?error=specialist.error.addFailed`);
  }

  // Nothing matched — the service was removed in another tab. Saying "saved" would contradict the
  // list the specialist is about to see, the same trap `delete.ts` documents.
  if (!updated) {
    return context.redirect(`${PAGE}?message=specialist.message.serviceGone`);
  }

  return context.redirect(`${PAGE}?message=specialist.message.serviceUpdated`);
};
