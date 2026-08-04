// Shared domain types. Slices import entity/DTO types from here.

export type UserRole = "client" | "specialist";

export interface Profile {
  id: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

// --- S-02: specialist listings ------------------------------------------------------------
// Dictionary tables. Seed data, changed only by migration — there is no admin role in v1.
//
// Every dictionary carries `name` (Polish, authoritative) and `name_en`. Resolve them through
// `localizedName()` in src/lib/i18n/dictionary.ts rather than reading either field directly, so
// the locale rule lives in one place.

export interface City {
  id: number;
  slug: string;
  name: string;
  name_en: string;
  sort_order: number;
}

export interface ServiceArea {
  id: number;
  city_id: number;
  /** Unique per city, not globally — three cities have a "srodmiescie". */
  slug: string;
  name: string;
  name_en: string;
  sort_order: number;
}

export interface ServiceCategory {
  id: number;
  slug: string;
  name: string;
  name_en: string;
  sort_order: number;
}

export interface ServiceSubtype {
  id: number;
  category_id: number;
  slug: string;
  name: string;
  name_en: string;
  sort_order: number;
}

export interface SpecialistProfile {
  id: string;
  display_name: string;
  /** FR-015. Optional — most cards will not have one. */
  bio: string | null;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  specialist_id: string;
  category_id: number;
  /** Null when the specialist listed a category without narrowing it — the subtype is optional. */
  subtype_id: number | null;
  /**
   * The specialist's own wording, e.g. "Koloryzacja + odżywka". Supplements the taxonomy and
   * never replaces it: `category_id` is what FR-007's filter reads.
   */
  name: string | null;
  /** Integer grosze. Never a float. */
  price_cents: number;
  duration_minutes: number | null;
  created_at: string;
  updated_at: string;
}

/** A specialist's own card, as loaded for the edit screens. */
export interface SpecialistCard {
  profile: SpecialistProfile | null;
  area_ids: number[];
  services: Service[];
}

// --- S-03: client side and discovery --------------------------------------------------------

/**
 * The client's saved area plus the details a specialist sees only after accepting a booking.
 *
 * Every field but `id` is nullable: the profile is filled in over time, and S-04 gates a booking
 * on the pieces it needs rather than demanding a complete profile before a client can browse.
 * This row is the subject of F-01's privacy contract — own-row access only, no public read.
 */
export interface ClientProfile {
  id: string;
  area_id: number | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  street: string | null;
  postal_code: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A star rating for a completed visit (FR-013).
 *
 * Read-only in S-03 — the table has no write grant for anyone until S-06 adds `booking_id` and
 * the "only after a completed booking" rule that needs it.
 */
export interface Review {
  id: string;
  specialist_id: string;
  client_id: string;
  /** 1–5. */
  rating: number;
  created_at: string;
}

/**
 * A row of `public.discoverable_specialists` — the single definition of a card that is complete
 * enough to be found (S-02 impl-review F4). Both the client-facing search and the specialist's
 * own visibility banner read this; do not reimplement the predicate.
 */
export interface DiscoverableSpecialist {
  id: string;
  display_name: string;
  bio: string | null;
  rating_count: number;
  /** Null until at least one rating exists — not 0, which would read as a one-star specialist. */
  rating_avg: number | null;
  /** Cheapest listed service, in grosze. Powers the "od <price>" line on a card. */
  min_price_cents: number | null;
}
