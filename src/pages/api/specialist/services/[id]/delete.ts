import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseOrError } from "@/lib/schemas/parse";
import { serviceIdSchema } from "@/lib/schemas/specialist";
import { deleteService, NoCardError, NotAllowedError } from "@/lib/services/specialists";

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
    return context.redirect(`${PAGE}?error=specialist.error.notConfigured`);
  }

  const parsed = parseOrError(serviceIdSchema, context.params.id);
  if (!parsed.ok) {
    return context.redirect(`${PAGE}?error=${parsed.error}`);
  }

  let removed = false;
  try {
    removed = await deleteService(supabase, user.id, parsed.data);
  } catch (err) {
    if (err instanceof NotAllowedError || err instanceof NoCardError) {
      return context.redirect(`${PAGE}?error=${err.key}`);
    }
    // eslint-disable-next-line no-console -- server-side diagnostics (Workers observability)
    console.error("specialist/services/delete: deleteService failed", err);
    return context.redirect(`${PAGE}?error=specialist.error.addFailed`);
  }

  // Nothing matched: a stale tab or a double submit. Saying "removed" would contradict the
  // list the user is about to see.
  if (!removed) {
    return context.redirect(`${PAGE}?message=specialist.message.serviceGone`);
  }

  return context.redirect(`${PAGE}?message=specialist.message.serviceRemoved`);
};
