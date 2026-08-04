import type { MessageKey } from "./pl";

/**
 * Typed against the Polish key space on purpose: `Record<MessageKey, string>` turns a missing
 * translation into a type error. Do not widen this type or add keys that are not in `./pl.ts` —
 * the Polish catalog is the one that defines what exists.
 *
 * The type error only surfaces under `npm run check`; `astro build` does not typecheck. See the
 * note in `./pl.ts`.
 */
export const en: Record<MessageKey, string> = {
  "app.name": "Arrivo",

  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.back": "Back",
  "common.soon": "Coming soon",
  "common.loading": "Loading…",

  "nav.dashboard": "Dashboard",
  "nav.discover": "Discover",
  "nav.profile": "Profile",
  "nav.services": "Services",
  "nav.signIn": "Sign in",
  "nav.signUp": "Sign up",
  "nav.signOut": "Sign out",
  "nav.signedOut": "Not signed in",

  "language.label": "Language",
  "language.pl": "Polski",
  "language.en": "English",
  "language.switchTo": "Switch to {language}",

  "role.client": "Client",
  "role.specialist": "Specialist",
};
