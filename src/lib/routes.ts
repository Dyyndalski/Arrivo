import type { UserRole } from "@/types";

/**
 * The screen an account opens the app on when it has not asked for anything specific: the one
 * page that role actually works in. A client discovers specialists; a specialist works the
 * request inbox.
 *
 * `/` and every post-auth redirect route through here, so the landing rule lives in exactly one
 * place instead of being restated at each redirect site.
 *
 * A null role — the profile row is briefly invisible right after sign-up, see `src/middleware.ts`
 * — falls back to the client home. That target is signed-in-only now, but it is reached only by an
 * account that IS signed in (a signed-out visitor is stopped earlier), and discovery renders for
 * either role, so the fallback cannot loop or leak.
 */
export function homeFor(role: UserRole | null): string {
  return role === "specialist" ? "/specialist/bookings" : "/specialists";
}

/**
 * Reject anything that is not a path on this origin.
 *
 * `redirectTo` reaches us from a form field or a query string, so it is attacker-controllable: a
 * crafted link carrying `//evil.example` would otherwise send the visitor off-site with our domain
 * in the referrer, and a protocol-relative URL passes a naive `startsWith("/")` check. Backslash is
 * rejected too — browsers normalise `/\evil.example` to a protocol-relative URL.
 *
 * Lifted out of src/pages/api/locale.ts and src/pages/api/account/profile.ts, which had grown two
 * copies of it. Sign-in became the third caller; three hand-maintained copies of an open-redirect
 * guard is how one of them ends up missing a case.
 */
export function safeRedirect(target: FormDataEntryValue | string | null, fallback = "/"): string {
  if (typeof target !== "string" || target === "") return fallback;
  if (!target.startsWith("/")) return fallback;
  if (target.startsWith("//") || target.startsWith("/\\")) return fallback;
  return target;
}
