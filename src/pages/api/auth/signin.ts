import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseOrError } from "@/lib/schemas/parse";
import { signInSchema } from "@/lib/schemas/auth";
import { authErrorKey } from "@/lib/auth/errors";

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

  return context.redirect("/");
};
