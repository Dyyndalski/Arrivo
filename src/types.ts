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
  /**
   * Cheapest listed service, in grosze — over ALL services, ignoring any active filter.
   * Deliberately unread by the app: a filtered card must show the minimum of the services that
   * matched, which `displayPriceFrom` in src/lib/services/discovery.ts computes instead
   * (S-03 phase-2 impl-review F2).
   */
  min_price_cents: number | null;
}

// --- S-04: booking requests -----------------------------------------------------------------

/**
 * The full lifecycle. S-04 only ever produces `pending`; S-05 owns every transition and S-06
 * reads `completed`. Defined whole because the contact-details policy has to reference
 * `accepted` — the coupling that made that policy impossible to write in S-03.
 */
export type BookingStatus = "pending" | "accepted" | "declined" | "expired" | "completed";

/**
 * Who moved a booking to its terminal state. `declined` has two authors — a specialist saying no
 * and a client withdrawing — and this is what tells them apart, instead of a `cancelled` status
 * that would have meant `alter type` against a live database.
 */
export type BookingActor = "client" | "specialist" | "system";

/**
 * What the addressed specialist may see while deciding. Nothing here identifies the client: the
 * area is the coarse matching unit discovery already publishes, and the service snapshot is the
 * specialist's own data reflected back.
 *
 * The service is stored as its PIECES rather than a rendered string — the dictionaries carry
 * `name_en`, so a frozen label would pin the booking to one language.
 */
export interface Booking {
  id: string;
  client_id: string;
  specialist_id: string;
  /** Null once the specialist deletes the service; the snapshot below is what the booking means. */
  service_id: string | null;
  category_id: number;
  subtype_id: number | null;
  /** The specialist's own wording, if they gave one. */
  service_name: string | null;
  price_cents: number;
  duration_minutes: number | null;
  area_id: number;
  proposed_at: string;
  /** The earlier of `created_at + 48h` and `proposed_at`. S-05 acts on it. */
  expires_at: string;
  status: BookingStatus;
  /** Null while the booking is still open. */
  resolved_by: BookingActor | null;
  created_at: string;
  updated_at: string;
}

/**
 * `public.bookings_view` — the base row plus the lazily-computed status.
 *
 * Read this, not `bookings`, on every screen. A pending row past its window reads `expired` here
 * the moment it lapses, rather than whenever the 15-minute job next runs. The stored `status` is
 * still what `bookings_one_pending_per_pair` enforces, which is why the job exists as well.
 */
export interface BookingView extends Booking {
  effective_status: BookingStatus;
}

/**
 * The half a specialist may read only once they have accepted — the subject of F-01's privacy
 * contract and the PRD's launch guardrail.
 *
 * A separate table rather than columns on `Booking` because Postgres RLS grants whole rows and
 * column grants cannot depend on status. See `20260807100000_bookings.sql`.
 */
export interface BookingContactDetails {
  booking_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  street: string;
  postal_code: string | null;
  /**
   * The client's logistical note. Lives here rather than on `Booking` because it is free text the
   * client types, and "ring doorbell 12" is one keystroke away from being the address — so it is
   * revealed with the address it may contain (S-04 impl-review F1).
   */
  note: string | null;
  created_at: string;
}
