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

export interface ServiceArea {
  id: number;
  slug: string;
  name: string;
  city: string;
  sort_order: number;
}

export interface ServiceCategory {
  id: number;
  slug: string;
  name: string;
  sort_order: number;
}

export interface ServiceSubtype {
  id: number;
  category_id: number;
  slug: string;
  name: string;
  sort_order: number;
}

export interface SpecialistProfile {
  id: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  specialist_id: string;
  category_id: number;
  /** Null when the specialist listed a category without narrowing it — the subtype is optional. */
  subtype_id: number | null;
  /** Integer grosze. Never a float. */
  price_cents: number;
  created_at: string;
  updated_at: string;
}

/** A specialist's own card, as loaded for the edit screens. */
export interface SpecialistCard {
  profile: SpecialistProfile | null;
  area_ids: number[];
  services: Service[];
}
