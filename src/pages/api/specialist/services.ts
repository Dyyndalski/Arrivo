import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseOrError } from "@/lib/schemas/parse";
import { serviceSchema } from "@/lib/schemas/specialist";
import { addService, NoCardError, NotAllowedError } from "@/lib/services/specialists";

const PAGE = "/specialist/services";

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
    return context.redirect(`${PAGE}?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const form = await context.request.formData();
  const parsed = parseOrError(serviceSchema, {
    category_id: form.get("category_id"),
    subtype_id: form.get("subtype_id"),
    price: form.get("price"),
  });
  if (!parsed.ok) {
    return context.redirect(`${PAGE}?error=${encodeURIComponent(parsed.error)}`);
  }

  try {
    await addService(supabase, user.id, {
      category_id: parsed.data.category_id,
      subtype_id: parsed.data.subtype_id,
      price_cents: parsed.data.price,
    });
  } catch (err) {
    // Two different remedies, so two different messages: NoCardError means "save a profile",
    // NotAllowedError means "this account cannot do that at all".
    if (err instanceof NoCardError || err instanceof NotAllowedError) {
      return context.redirect(`${PAGE}?error=${encodeURIComponent(err.message)}`);
    }
    // eslint-disable-next-line no-console -- server-side diagnostics (Workers observability)
    console.error("specialist/services: addService failed", err);
    return context.redirect(`${PAGE}?error=${encodeURIComponent("Could not add the service — try again")}`);
  }

  return context.redirect(`${PAGE}?message=${encodeURIComponent("Service added")}`);
};
