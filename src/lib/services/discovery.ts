import type { createClient } from "@/lib/supabase";
import { RATING_THRESHOLD } from "@/lib/schemas/limits";
import type { DiscoverableSpecialist, Service } from "@/types";

type Client = NonNullable<ReturnType<typeof createClient>>;

export interface DiscoveryFilters {
  /** The client's saved district. Undefined means "show everyone", not "no match". */
  areaId?: number;
  categoryId?: number;
  minPriceCents?: number;
  maxPriceCents?: number;
  sort: "price_asc" | "price_desc";
}

export interface DiscoveryResult {
  specialist: DiscoverableSpecialist;
  /** Every area the specialist declared — for the "travels to …" line, not for matching. */
  areaIds: number[];
  /** Only the services that survived the active filters. */
  services: Service[];
  /** Cheapest of `services` above. See the note on `displayPriceFrom`. */
  displayFromCents: number | null;
}

/**
 * The price to advertise on a card, derived from the services that ACTUALLY MATCHED.
 *
 * Never `discoverable_specialists.min_price_cents` (phase-2 impl-review F2): the view computes
 * that over all of a specialist's services, so a card shown under a "Paznokcie" filter would
 * advertise a 70 zł men's haircut. True about the specialist, false about the search — and the
 * client only finds out on the profile.
 *
 * When no service filter is active the embedded set is every service, so this agrees with the
 * view anyway. That makes the view's column redundant here rather than a fallback, which is why
 * nothing in `src/` reads it.
 */
function displayPriceFrom(services: Service[]): number | null {
  if (services.length === 0) return null;
  return services.reduce((min, s) => (s.price_cents < min ? s.price_cents : min), services[0].price_cents);
}

/**
 * FR-014. Below the threshold a profile shows "New specialist" instead of an average, because an
 * average over one or two ratings is noise presented as a judgement.
 *
 * The ONLY place RATING_THRESHOLD is read. The view reports `rating_count` and `rating_avg` and
 * takes no view on what they mean, so moving the threshold is a one-line edit here rather than a
 * migration.
 */
export function ratingLabel(
  count: number,
  average: number | null,
): { kind: "new" } | { kind: "average"; average: number; count: number } {
  if (average === null || count < RATING_THRESHOLD) return { kind: "new" };
  return { kind: "average", average, count };
}

/**
 * Turn filter inputs into results.
 *
 * Reads `public.discoverable_specialists` and never the base tables — that view is the single
 * definition of a card complete enough to be found, shared with the specialist's own visibility
 * banner (S-02 impl-review F4).
 *
 * The area filter is a separate pre-query rather than an `!inner` embed on purpose. An inner
 * embed truncates the embedded rows to the matching ones, which is what we WANT for services
 * (the price shown must reflect the filter) and exactly what we must NOT have for areas: the card
 * says "travels to: Mokotów, Ochota", and an inner-joined area embed would reduce that to the one
 * district the client searched for.
 */
export async function searchSpecialists(supabase: Client, filters: DiscoveryFilters): Promise<DiscoveryResult[]> {
  let servingIds: string[] | null = null;

  if (filters.areaId !== undefined) {
    const { data, error } = await supabase
      .from("specialist_areas")
      .select("specialist_id")
      .eq("area_id", filters.areaId);
    if (error) throw new Error(error.message);

    servingIds = [...new Set((data ?? []).map((row) => (row as { specialist_id: string }).specialist_id))];
    // Nobody declared this district. Returning early avoids sending `id=in.()`, which PostgREST
    // rejects as a syntax error rather than treating as "match nothing".
    if (servingIds.length === 0) return [];
  }

  let query = supabase.from("discoverable_specialists").select("*, specialist_areas(area_id), services!inner(*)");

  if (servingIds !== null) query = query.in("id", servingIds);
  if (filters.categoryId !== undefined) query = query.eq("services.category_id", filters.categoryId);
  if (filters.minPriceCents !== undefined) query = query.gte("services.price_cents", filters.minPriceCents);
  if (filters.maxPriceCents !== undefined) query = query.lte("services.price_cents", filters.maxPriceCents);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as (DiscoverableSpecialist & {
    specialist_areas: { area_id: number }[];
    services: Service[];
  })[];

  const results: DiscoveryResult[] = rows.map((row) => {
    const { specialist_areas, services, ...specialist } = row;
    return {
      specialist,
      areaIds: specialist_areas.map((a) => a.area_id),
      services,
      displayFromCents: displayPriceFrom(services),
    };
  });

  // Sorted here rather than in the query: the sort key is the minimum over the FILTERED services,
  // which PostgREST cannot order a parent row by. The result set is one page of a launch-sized
  // catalogue, so the cost is irrelevant and the alternative is an RPC.
  const direction = filters.sort === "price_desc" ? -1 : 1;
  results.sort((a, b) => {
    // A specialist with no matching price sorts last either way — never above a real offer.
    if (a.displayFromCents === null) return 1;
    if (b.displayFromCents === null) return -1;
    return (a.displayFromCents - b.displayFromCents) * direction;
  });

  return results;
}

/** One specialist for the public profile, or null when their card is not discoverable. */
export async function getPublicSpecialist(supabase: Client, id: string): Promise<DiscoveryResult | null> {
  const { data, error } = await supabase
    .from("discoverable_specialists")
    .select("*, specialist_areas(area_id), services(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const { specialist_areas, services, ...specialist } = data as DiscoverableSpecialist & {
    specialist_areas: { area_id: number }[];
    services: Service[];
  };

  return {
    specialist,
    areaIds: specialist_areas.map((a) => a.area_id),
    services,
    displayFromCents: displayPriceFrom(services),
  };
}
