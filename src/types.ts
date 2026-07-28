// Shared domain types. Slices import entity/DTO types from here.

export type UserRole = "client" | "specialist";

export interface Profile {
  id: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}
