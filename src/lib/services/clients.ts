import type { createClient } from "@/lib/supabase";
import type { ClientProfile } from "@/types";

/**
 * Always the request-scoped client from `@/lib/supabase` — never a service-role key.
 *
 * That rule matters more here than anywhere else in the project: `client_profiles` is the table
 * F-01's privacy contract and the PRD's launch guardrail are about. Its RLS is own-row-only for
 * every operation, and a privileged client would walk straight past it.
 */
type Client = NonNullable<ReturnType<typeof createClient>>;

export class NotAllowedError extends Error {
  /** A message-catalog key — the endpoint puts it in `?error=` and the page translates it. */
  readonly key = "account.error.notAllowed" as const;

  constructor() {
    super("You need a client account to do that");
    this.name = "NotAllowedError";
  }
}

function rethrow(error: { code?: string; message: string } | null): void {
  if (!error) return;
  // 42501 is the RLS refusal; 23503 is the FK, which is how a specialist-role account writing
  // here is actually stopped. Same reasoning as src/lib/services/specialists.ts.
  if (error.code === "42501" || error.code === "23503") {
    throw new NotAllowedError();
  }
  throw new Error(error.message);
}

/** The caller's own profile row, or null before they have saved one. */
export async function getOwnProfile(supabase: Client, userId: string): Promise<ClientProfile | null> {
  // Not destructured, matching src/lib/services/specialists.ts: without generated database types
  // `data` is `any`, and destructuring it trips `no-unsafe-assignment`.
  const result = await supabase.from("client_profiles").select("*").eq("id", userId).maybeSingle();
  rethrow(result.error);
  return (result.data ?? null) as ClientProfile | null;
}

/**
 * Full-record save: every column the form owns is written on every submit, so clearing a field
 * clears it. There is exactly one form posting here; if a second, narrower one ever appears it
 * must not reuse this without distinguishing "absent" from "cleared" (phase-4 impl-review F4
 * flagged the same shape on the specialist side).
 */
export async function upsertOwnProfile(
  supabase: Client,
  userId: string,
  input: Omit<ClientProfile, "id" | "created_at" | "updated_at">,
): Promise<void> {
  const result = await supabase.from("client_profiles").upsert({ id: userId, ...input }, { onConflict: "id" });
  rethrow(result.error);
}
