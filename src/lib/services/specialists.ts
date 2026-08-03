import type { createClient } from "@/lib/supabase";
import type { Service, ServiceArea, ServiceCategory, ServiceSubtype, SpecialistCard, SpecialistProfile } from "@/types";

/**
 * Always the request-scoped client from `@/lib/supabase` — never a service-role key. Every
 * function here relies on RLS evaluating as the calling user; a privileged client would
 * silently bypass the ownership and role boundaries the S-02 migrations establish.
 */
type Client = NonNullable<ReturnType<typeof createClient>>;

/**
 * Postgres error codes that mean "you are not allowed to do this", regardless of which
 * mechanism refused.
 *
 * 42501 is the RLS/privilege refusal. 23503 is a foreign-key violation, and it lands here
 * because of how the role gate is built (impl-review F3): specialist_areas and services carry
 * no role check of their own — they inherit it only because a row in specialist_profiles
 * cannot exist unless the role check on THAT table passed. So a client-role account writing
 * straight to services is refused by the FK, not by a policy. Treating 23503 as a database
 * fault here would show a raw constraint name to a user who simply isn't a specialist.
 */
const NOT_ALLOWED_CODES = new Set(["42501", "23503"]);

export class NotAllowedError extends Error {
  constructor() {
    super("You need a specialist account to do that");
    this.name = "NotAllowedError";
  }
}

/**
 * The caller is a specialist but has no card yet, so a child row has nothing to hang off.
 * Distinct from NotAllowedError because the remedy is different — save a profile, not get a
 * different account — and answering both with one message sends people to re-save a profile
 * they already have (impl-review F5).
 *
 * Caveat: 23503 also covers an in-range but non-existent subtype id. Reaching that needs a
 * tampered request (the schema bounds ids to smallint), and the fallback message stays
 * survivable, so the two are not separated further here.
 */
export class NoCardError extends Error {
  constructor() {
    super("Save your profile first, then add services");
    this.name = "NoCardError";
  }
}

function rethrow(error: { code?: string; message: string } | null): void {
  if (!error) return;
  if (error.code === "23503") {
    throw new NoCardError();
  }
  if (error.code && NOT_ALLOWED_CODES.has(error.code)) {
    throw new NotAllowedError();
  }
  throw new Error(error.message);
}

// --- Dictionaries (public read) -----------------------------------------------------------

export async function getServiceAreas(supabase: Client): Promise<ServiceArea[]> {
  const { data, error } = await supabase.from("service_areas").select("*").order("sort_order");
  rethrow(error);
  return (data ?? []) as ServiceArea[];
}

export async function getTaxonomy(
  supabase: Client,
): Promise<{ categories: ServiceCategory[]; subtypes: ServiceSubtype[] }> {
  const [categories, subtypes] = await Promise.all([
    supabase.from("service_categories").select("*").order("sort_order"),
    supabase.from("service_subtypes").select("*").order("sort_order"),
  ]);
  rethrow(categories.error);
  rethrow(subtypes.error);
  return {
    categories: (categories.data ?? []) as ServiceCategory[],
    subtypes: (subtypes.data ?? []) as ServiceSubtype[],
  };
}

// --- The caller's own card ----------------------------------------------------------------

export async function getOwnCard(supabase: Client, userId: string): Promise<SpecialistCard> {
  const [profile, areas, services] = await Promise.all([
    supabase.from("specialist_profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("specialist_areas").select("area_id").eq("specialist_id", userId),
    supabase.from("services").select("*").eq("specialist_id", userId).order("created_at"),
  ]);
  rethrow(profile.error);
  rethrow(areas.error);
  rethrow(services.error);

  return {
    profile: (profile.data ?? null) as SpecialistProfile | null,
    area_ids: ((areas.data ?? []) as { area_id: number }[]).map((row) => row.area_id),
    services: (services.data ?? []) as Service[],
  };
}

/**
 * Write the card and replace its declared areas.
 *
 * PostgREST has no cross-request transaction, so replacing a selection is two statements and
 * one of them can fail alone. ADD FIRST, THEN REMOVE — never the reverse (impl-review F3).
 * Deleting first means a failed insert leaves the specialist with ZERO areas, which by the
 * completeness rule silently drops their card out of discovery, with only a generic "could
 * not save" to explain it. In this order a failed add changes nothing and a failed remove
 * leaves a superset: the card over-declares for a moment instead of vanishing.
 *
 * Editing a selection is add/remove rather than update because the join table has no UPDATE
 * path by design — it is all primary key.
 */
export async function upsertOwnCard(
  supabase: Client,
  userId: string,
  input: { display_name: string; area_ids: number[] },
): Promise<void> {
  const { error: profileError } = await supabase
    .from("specialist_profiles")
    .upsert({ id: userId, display_name: input.display_name }, { onConflict: "id" });
  rethrow(profileError);

  const { error: addError } = await supabase.from("specialist_areas").upsert(
    input.area_ids.map((area_id) => ({ specialist_id: userId, area_id })),
    { onConflict: "specialist_id,area_id", ignoreDuplicates: true },
  );
  rethrow(addError);

  // Safe to interpolate: area_ids are schema-validated integers, never raw request strings.
  const { error: pruneError } = await supabase
    .from("specialist_areas")
    .delete()
    .eq("specialist_id", userId)
    .not("area_id", "in", `(${input.area_ids.join(",")})`);
  rethrow(pruneError);
}

export async function addService(
  supabase: Client,
  userId: string,
  input: { category_id: number; subtype_id: number | null; price_cents: number },
): Promise<void> {
  const { error } = await supabase.from("services").insert({ specialist_id: userId, ...input });
  rethrow(error);
}

/**
 * Returns whether a row was actually removed. PostgREST reports no error when a delete
 * matches nothing, so without asking for the rows back a stale tab or a double submit would
 * be answered with "Service removed" and then contradicted on reload (impl-review F4).
 */
export async function deleteService(supabase: Client, userId: string, serviceId: string): Promise<boolean> {
  // Scoped by specialist_id as well as id: RLS already refuses someone else's row, but this
  // makes the intent explicit and keeps the query honest if policies are ever relaxed.
  const { data, error } = await supabase
    .from("services")
    .delete()
    .eq("id", serviceId)
    .eq("specialist_id", userId)
    .select("id");
  rethrow(error);
  return (data ?? []).length > 0;
}

// --- The completeness rule ----------------------------------------------------------------

/**
 * The single definition of "discoverable". Derived, never stored — a column would be a second
 * source of truth that drifts on every area or service delete.
 *
 * S-03's discovery query must apply this same predicate. If it diverges, a specialist will see
 * "your card is live" while clients cannot find them.
 */
export function isCardComplete(card: SpecialistCard): boolean {
  return missingPieces(card).length === 0;
}

/** What the card still needs, phrased for display. Empty means discoverable. */
export function missingPieces(card: SpecialistCard): string[] {
  const missing: string[] = [];
  if (!card.profile?.display_name) missing.push("a name");
  if (card.area_ids.length === 0) missing.push("at least one district");
  if (card.services.length === 0) missing.push("at least one service");
  return missing;
}
