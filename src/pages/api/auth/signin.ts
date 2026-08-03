import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseOrError } from "@/lib/schemas/parse";
import { signInSchema } from "@/lib/schemas/auth";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const parsed = parseOrError(signInSchema, {
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.ok) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(parsed.error)}`);
  }
  const { email, password } = parsed.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase is not configured")}`);
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect("/");
};
