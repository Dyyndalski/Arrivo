import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseOrError } from "@/lib/schemas/parse";
import { serviceIdSchema } from "@/lib/schemas/specialist";
import { deleteService, NotAllowedError } from "@/lib/services/specialists";

const PAGE = "/specialist/services";

// POST, not DELETE: HTML forms can only emit GET and POST, and every write in this project
// goes through a native form post (see the auth endpoints).
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

  const parsed = parseOrError(serviceIdSchema, context.params.id);
  if (!parsed.ok) {
    return context.redirect(`${PAGE}?error=${encodeURIComponent(parsed.error)}`);
  }

  try {
    await deleteService(supabase, user.id, parsed.data);
  } catch (err) {
    if (err instanceof NotAllowedError) {
      return context.redirect(`${PAGE}?error=${encodeURIComponent(err.message)}`);
    }
    // eslint-disable-next-line no-console -- server-side diagnostics (Workers observability)
    console.error("specialist/services/delete: deleteService failed", err);
    return context.redirect(`${PAGE}?error=${encodeURIComponent("Could not remove the service — try again")}`);
  }

  return context.redirect(`${PAGE}?message=${encodeURIComponent("Service removed")}`);
};
