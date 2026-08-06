import type { createClient } from "@/lib/supabase";
import type {
  City,
  Service,
  ServiceArea,
  ServiceCategory,
  ServiceSubtype,
  SpecialistCard,
  SpecialistProfile,
} from "@/types";

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
  /** A message-catalog key — the endpoint puts it in `?error=` and the page translates it. */
  readonly key = "specialist.error.notAllowed" as const;

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
  /** A message-catalog key — the endpoint puts it in `?error=` and the page translates it. */
  readonly key = "specialist.error.noCard" as const;

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

/**
 * The area dictionary, ordered the way a picker must present it: by city, then by the city's own
 * district order.
 *
 * Returns the cities as well because an area list alone is unusable across ten of them — four
 * districts are literally named "Całe miasto" and three cities have a "Stare Miasto". The caller
 * needs the city to label the group (phase-2 impl-review F1).
 *
 * The sort happens here rather than in the query: `sort_order` restarts at 10 in every city, so
 * ordering by it alone interleaves them, and ordering by `city_id` would silently depend on the
 * identity sequence matching the intended city order.
 */
export async function getAreaDictionary(supabase: Client): Promise<{ cities: City[]; areas: ServiceArea[] }> {
  const [cities, areas] = await Promise.all([
    supabase.from("cities").select("*").order("sort_order"),
    supabase.from("service_areas").select("*"),
  ]);
  rethrow(cities.error);
  rethrow(areas.error);

  const cityRows = (cities.data ?? []) as City[];
  const cityOrder = new Map(cityRows.map((city) => [city.id, city.sort_order]));

  const areaRows = ((areas.data ?? []) as ServiceArea[]).sort(
    (a, b) =>
      (cityOrder.get(a.city_id) ?? Number.MAX_SAFE_INTEGER) - (cityOrder.get(b.city_id) ?? Number.MAX_SAFE_INTEGER) ||
      a.sort_order - b.sort_order,
  );

  return { cities: cityRows, areas: areaRows };
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
  input: { display_name: string; bio: string | null; area_ids: number[] },
): Promise<void> {
  const { error: profileError } = await supabase
    .from("specialist_profiles")
    .upsert({ id: userId, display_name: input.display_name, bio: input.bio }, { onConflict: "id" });
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
  input: {
    category_id: number;
    subtype_id: number | null;
    price_cents: number;
    name: string | null;
    duration_minutes: number | null;
  },
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
 * Is this specialist's own card discoverable?
 *
 * Answered by `public.discoverable_specialists` — the SAME view the client-facing search reads.
 * That is the whole point (S-02 impl-review F4): the specialist's "your card is live" banner and
 * the results a client actually sees are now one definition, so they cannot drift apart. The old
 * `isCardComplete()` was a second, independent implementation of the rule in TypeScript.
 *
 * Costs one extra query per page load compared with the pure function it replaces. That is the
 * price of the guarantee, and it is a primary-key lookup on a view over three small tables.
 */
export async function isDiscoverable(supabase: Client, userId: string): Promise<boolean> {
  const { data, error } = await supabase.from("discoverable_specialists").select("id").eq("id", userId).maybeSingle();
  rethrow(error);
  return data !== null;
}

/**
 * WHAT the card still needs, phrased as catalog keys for display.
 *
 * Deliberately still in TypeScript, and deliberately NOT the source of truth for visibility: the
 * view answers yes/no and cannot say which piece is missing, but a specialist told only "not
 * visible" has no way to act. `isDiscoverable()` decides; this supplies the wording.
 *
 * If the two ever disagree the banner reads "live" next to a list of missing pieces — visibly
 * incoherent, which is the intended failure mode. A silent disagreement is the one that costs a
 * specialist their bookings.
 */
export function missingPieces(card: SpecialistCard): MissingPieceKey[] {
  const missing: MissingPieceKey[] = [];
  if (!card.profile?.display_name) missing.push("specialist.card.missingName");
  if (card.area_ids.length === 0) missing.push("specialist.card.missingArea");
  if (card.services.length === 0) missing.push("specialist.card.missingService");
  return missing;
}

export type MissingPieceKey =
  "specialist.card.missingName" | "specialist.card.missingArea" | "specialist.card.missingService";
