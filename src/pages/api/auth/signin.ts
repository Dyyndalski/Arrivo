import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseOrError } from "@/lib/schemas/parse";
import { signInSchema } from "@/lib/schemas/auth";
import { authErrorKey } from "@/lib/auth/errors";
import { safeRedirect } from "@/lib/routes";

// `?error=` carries a message-catalog key, never a sentence — the page translates it. See
// src/lib/auth/errors.ts for why Supabase's own messages have to be mapped rather than passed on.

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const parsed = parseOrError(signInSchema, {
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.ok) {
    return context.redirect(`/auth/signin?error=${parsed.error}`);
  }
  const { email, password } = parsed.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/auth/signin?error=auth.error.notConfigured");
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return context.redirect(`/auth/signin?error=${authErrorKey(error)}`);
  }

  // A page that turned this visitor away puts its own path in `redirectTo` (the booking form
  // does). Honour it, re-validated here because the value came in through the query string and a
  // hidden field — `safeRedirect` rejects anything that is not a path on this origin.
  //
  // Otherwise `/`, which dispatches on role (src/pages/index.astro + src/lib/routes.ts): a client
  // lands on discovery, a specialist on the request inbox. Deciding that here instead would mean a
  // second profile lookup in this handler and two places that can disagree about where sign-in
  // ends. The extra hop is a redirect the browser follows before painting anything.
  return context.redirect(safeRedirect(form.get("redirectTo")));
};
