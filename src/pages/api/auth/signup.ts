import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;
  const role = form.get("role") as string;

  // Validate the client-controlled role server-side (defense in depth; the F-01
  // handle_new_user trigger also defaults an unrecognized value to `client`).
  if (role !== "client" && role !== "specialist") {
    return context.redirect(
      `/auth/signup?error=${encodeURIComponent("Please choose whether you're a client or a specialist")}`,
    );
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent("Supabase is not configured")}`);
  }
  const { error } = await supabase.auth.signUp({ email, password, options: { data: { role } } });

  if (error) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect("/auth/confirm-email");
};
